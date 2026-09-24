import assert from 'node:assert/strict'
import { once } from 'node:events'
import bodyParser from 'body-parser'
import express from 'express'
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { it } from 'vitest'

it('authenticates bodyless reader requests after the Express 4 JSON parser', async () => {
  // This auth-only fixture needs signing/encryption methods and cannot spend.
  const serverWallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  const clientWallet = new ProtoWallet(PrivateKey.fromRandom()) as unknown as WalletInterface
  const app = express()
  app.use(bodyParser.json())
  app.use(createAuthMiddleware({ wallet: serverWallet, allowUnauthenticated: true }))
  app.get('/api/private-reader', (req, res) => {
    const request = req as typeof req & { auth?: { identityKey: string } }
    res.json({ identityKey: request.auth?.identityKey })
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    const client = new AuthFetch(clientWallet)
    const response = await client.fetch(`http://127.0.0.1:${address.port}/api/private-reader?format=json`)
    assert.equal(response.status, 200)
    const { publicKey } = await clientWallet.getPublicKey({ identityKey: true })
    assert.deepEqual(await response.json(), { identityKey: publicKey })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close(error => error == null ? resolve() : reject(error)) })
  }
}, 10000)
