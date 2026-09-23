import type { Server } from 'node:http'

/** Stop accepting connections, finish in-flight responses, and bound shutdown. */
export async function closeHttpServer (server: Server, timeoutMs = 45000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // Requests that were active at close() can become idle afterward. Reap
    // only idle connections while allowing their responses to finish.
    const idleSweep = setInterval(() => { server.closeIdleConnections() }, 100)
    idleSweep.unref()
    const deadline = setTimeout(() => {
      clearInterval(idleSweep)
      server.closeAllConnections()
      reject(new Error('HTTP shutdown deadline exceeded'))
    }, timeoutMs)
    deadline.unref()
    server.close(err => {
      clearTimeout(deadline)
      clearInterval(idleSweep)
      if (err != null) reject(err)
      else resolve()
    })
    server.closeIdleConnections()
  })
}
