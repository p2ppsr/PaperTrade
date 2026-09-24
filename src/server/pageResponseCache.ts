import type { Response } from 'express'

export function setPageResponseCachePolicy (res: Response): void {
  // BRC-103 response signatures/nonces belong to one request and session.
  // A private browser cache can otherwise replay them after wallet restart.
  res.setHeader('Cache-Control', 'private, no-store')
}
