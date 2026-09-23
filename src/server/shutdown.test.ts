import { createServer, get, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { closeHttpServer } from './shutdown.js'

describe('HTTP shutdown', () => {
  it('lets an in-flight response finish before closing', async () => {
    let response: ServerResponse | undefined
    const server = createServer((_req, res) => { response = res })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const requestStarted = once(server, 'request')
    const body = new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, res => {
        let data = ''
        res.on('data', chunk => { data += String(chunk) })
        res.on('end', () => { resolve(data) })
      }).on('error', reject)
    })
    await requestStarted
    let closed = false
    const closing = closeHttpServer(server, 1000).then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    response?.end('complete response')
    expect(await body).toBe('complete response')
    await closing
    expect(closed).toBe(true)
  })

  it('bounds a stuck response instead of hanging termination forever', async () => {
    const server = createServer(() => {})
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const requestStarted = once(server, 'request')
    const request = get(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    request.on('error', () => {})
    await requestStarted
    await expect(closeHttpServer(server, 20)).rejects.toThrow('deadline exceeded')
    request.destroy()
  })
})
