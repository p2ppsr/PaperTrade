import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import express from 'express'
import knex, { type Knex } from 'knex'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import { afterEach, beforeEach, it } from 'vitest'
import { createProtocolState, KnexPaymentReplayStore } from './protocolState.js'

const migration = createRequire(import.meta.url)('../../migrations/202609240001_shared_protocol_state.cjs') as { up: (db: Knex) => Promise<void>, down: () => Promise<void> }
let folder: string
let database: Knex
let replica: Knex
const servers: Server[] = []

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'papertrade-protocol-'))
  let config: Knex.Config = { client: 'better-sqlite3', connection: { filename: path.join(folder, 'state.db') }, useNullAsDefault: true, pool: { min: 1, max: 1 } }
  const mysqlConfigFile = process.env.PAPERTRADE_PROTOCOL_TEST_MYSQL_CONFIG
  if (mysqlConfigFile !== undefined) {
    const connection = JSON.parse(await readFile(mysqlConfigFile, 'utf8')) as Knex.MySqlConnectionConfig
    assert.equal(connection.host, '127.0.0.1')
    assert.equal(connection.database, 'papertrade_protocol_test', 'Only the disposable local test database may be used')
    config = { client: 'mysql2', connection, pool: { min: 1, max: 1 } }
  }
  database = knex(config)
  replica = knex(config)
  if (config.client === 'better-sqlite3') {
    await database.raw('PRAGMA journal_mode = WAL')
    await database.raw('PRAGMA busy_timeout = 5000')
    await replica.raw('PRAGMA busy_timeout = 5000')
  }
  await migration.up(database)
})

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => error == null ? resolve() : reject(error)) })
  }
  if (database.client.config.client === 'mysql2') {
    for (const table of ['payment_replays', 'auth_message_nonces', 'auth_sessions']) await database.schema.dropTableIfExists(table)
  }
  await Promise.all([database.destroy(), replica.destroy()])
  await rm(folder, { recursive: true, force: true })
})

it('authenticates requests distributed across independent replicas and rejects a replay on the other replica', async () => {
  const wallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  const origins: string[] = []
  for (const db of [database, replica]) {
    const app = express()
    app.use(express.json())
    app.use(createAuthMiddleware({ wallet, sessionManager: createProtocolState(db).sessionManager }))
    const state = createProtocolState(db)
    wallet.internalizeAction = async () => { throw new Error('TEST_PAYMENT_DISABLED') }
    app.get('/paid', createPaymentMiddleware({ wallet, replayStore: state.replayStore, calculateRequestPrice: () => 25 }), (_req, res) => res.json({ paid: true }))
    app.get('/reader', (req, res) => res.json({ identity: (req as typeof req & { auth?: { identityKey: string } }).auth?.identityKey }))
    const server = app.listen(0, '127.0.0.1')
    servers.push(server)
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    origins.push(`http://127.0.0.1:${address.port}`)
  }
  const clientWallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  let sequence = 0
  let lastRequest: { url: string, init?: RequestInit, replica: number } | undefined
  const alternate: typeof fetch = async (url, init) => {
    const destination = sequence++ % 2
    const parsed = new URL(String(url))
    const actual = origins[destination] + parsed.pathname + parsed.search
    if (parsed.pathname === '/reader') lastRequest = { url: actual, init, replica: destination }
    return await fetch(actual, init)
  }
  const auth = new AuthFetch(clientWallet, undefined, undefined, undefined, {}, alternate)
  const identity = await clientWallet.getPublicKey({ identityKey: true })
  for (let i = 0; i < 4; i++) {
    const response = await auth.fetch(origins[0] + '/reader')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { identity: identity.publicKey })
  }
  assert.ok(lastRequest !== undefined)
  const replay = await fetch(origins[1 - lastRequest.replica] + '/reader', lastRequest.init)
  assert.equal(replay.status, 401)
  assert.equal((await replay.json() as { code: string }).code, 'ERR_AUTH_FAILED')
  let paymentAttempted = false
  clientWallet.createAction = async () => { paymentAttempted = true; throw new Error('TEST_PAYMENT_DISABLED') }
  await assert.rejects(auth.fetch(origins[0] + '/paid'), /TEST_PAYMENT_DISABLED/)
  assert.equal(paymentAttempted, true)
}, 15000)

it('retains one atomic payment claim across replicas, new instances and migration reruns', async () => {
  const txid = 'ab'.repeat(32)
  const results = await Promise.all([new KnexPaymentReplayStore(database).claim(txid), new KnexPaymentReplayStore(replica).claim(txid)])
  assert.deepEqual(results.sort(), [false, true])
  await migration.up(database)
  assert.equal(await new KnexPaymentReplayStore(replica).claim(txid), false)
  assert.equal(await new KnexPaymentReplayStore(database).claim('cd'.repeat(32)), true)
  await assert.rejects(migration.down(), /Retain shared protocol state/)
  assert.equal(await new KnexPaymentReplayStore(database).claim(txid), false)
})

it('fails closed on unavailable replay storage and invalid transaction IDs', async () => {
  const store = new KnexPaymentReplayStore(database)
  await assert.rejects(store.claim('not-a-txid'), /Invalid payment transaction ID/)
  await database.schema.dropTable('payment_replays')
  await assert.rejects(store.claim('ef'.repeat(32)), /no such table|doesn't exist/)
})

it('keeps base64 nonce case distinct and does not prune a live session replay claim', async () => {
  const { sessionManager } = createProtocolState(database)
  const now = Date.now()
  for (const sessionNonce of ['Ab'.repeat(32), 'ab'.repeat(32)]) {
    await sessionManager.addSession({ sessionNonce, isAuthenticated: true, lastUpdate: now })
    assert.equal(await sessionManager.claimMessageNonce(sessionNonce, 'Cd'.repeat(32)), true)
  }
  await database('auth_message_nonces').update({ expiresAt: now - 1000 })
  await sessionManager.pruneExpiredSessions()
  assert.equal(await createProtocolState(replica).sessionManager.claimMessageNonce('Ab'.repeat(32), 'Cd'.repeat(32)), false)
  await database('auth_sessions').update({ expiresAt: now - 1000 })
  assert.equal(await sessionManager.pruneExpiredSessions(), 2)
  assert.equal((await database('auth_message_nonces')).length, 0)
})

it('runs the actual promotion smoke including its signed non-spending payment challenge', async () => {
  const wallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  wallet.internalizeAction = async () => { throw new Error('TEST_PAYMENT_DISABLED') }
  const origins: string[] = []
  for (const db of [database, replica]) {
    const app = express()
    const state = createProtocolState(db)
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    app.use(express.json())
    app.get('/healthz', (_req, res) => res.json({ ok: true }))
    app.get('/', (_req, res) => res.send('fixture'))
    app.get('/api/status', (_req, res) => res.json({ status: 'success', pricePerPageSats: 25 }))
    app.get('/api/publications', (_req, res) => res.json({ publications: [{ id: 'fixture' }] }))
    app.get('/api/publications/fixture/pages/1', (req, res) => {
      if (req.query.format === 'json') res.json({ status: 'success', pageAccessMode: 'free', imageUrl: '/api/publications/fixture/pages/1/rendered?fixture=1' })
      else res.set('x-papertrade-page-access', 'free').send(png)
    })
    app.get('/api/publications/fixture/pages/1/rendered', (_req, res) => res.send(png))
    app.use(createAuthMiddleware({ wallet, sessionManager: state.sessionManager }))
    app.get('/api/publications/fixture/pages/2', createPaymentMiddleware({ wallet, replayStore: state.replayStore, calculateRequestPrice: () => 25 }), (_req, res) => res.json({ paid: true }))
    const server = app.listen(0, '127.0.0.1')
    servers.push(server)
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    origins.push(`http://127.0.0.1:${address.port}`)
  }
  const source = await readFile('scripts/k8s/promote-guarded.py', 'utf8')
  const script = /SMOKE = r"""([\s\S]*?)"""/.exec(source)?.[1]
  assert.ok(script !== undefined)
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, ...origins], { timeout: 15000 })
  const result = JSON.parse(stdout) as { authenticatedPaymentChallenge: boolean, spendingDisabled: boolean, crossReplica: boolean }
  assert.equal(result.authenticatedPaymentChallenge, true)
  assert.equal(result.spendingDisabled, true)
  assert.equal(result.crossReplica, true)
  assert.equal((await database('payment_replays')).length, 0)
}, 20000)
