import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { it } from 'vitest'
import { setPageResponseCachePolicy } from './pageResponseCache.js'

it('rereads a page across fresh auth sessions without replaying a cached signed response', async () => {
  const serverWallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  const clientWallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  const app = express()
  app.use(express.json())
  app.use(createAuthMiddleware({ wallet: serverWallet, allowUnauthenticated: true }))
  let reads = 0
  app.get('/page', (_req, res) => {
    reads += 1
    setPageResponseCachePolicy(res)
    res.json({ entitled: true, reads })
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const cache = new Map<string, Response>()
  const pagePolicies: string[] = []
  const browserFetch: typeof fetch = async (input, init) => {
    const key = String(input)
    const cached = cache.get(key)
    if (cached != null) return cached.clone()
    const response = await fetch(input, init)
    const policy = response.headers.get('cache-control') ?? ''
    if (key.endsWith('/page')) pagePolicies.push(policy)
    if (/max-age=\d+/.test(policy) && !policy.includes('no-store')) cache.set(key, response.clone())
    return response
  }
  try {
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    for (let read = 1; read <= 3; read += 1) {
      // Each instance models a reload/cold launch with a new auth session.
      const client = new AuthFetch(clientWallet, undefined, undefined, undefined, {}, browserFetch)
      const response = await client.fetch(`http://127.0.0.1:${address.port}/page`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { entitled: true, reads: read })
    }
    assert.equal(cache.size, 0)
    assert.deepEqual(pagePolicies, new Array(3).fill('private, no-store'))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => error == null ? resolve() : reject(error)) })
  }
}, 10000)
