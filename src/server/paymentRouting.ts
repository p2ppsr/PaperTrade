import type { RequestHandler } from 'express'

export function requiresPagePayment (pageNumber: unknown): boolean {
  return Number(pageNumber) > 1
}

/**
 * Page one is intentionally public and free. Do not invoke strict payment
 * middleware for it because unauthenticated auth state has no wallet identity.
 */
export function paymentForPaidPagesOnly (paymentMiddleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (!requiresPagePayment(req.params.pageNumber)) {
      next()
      return
    }
    paymentMiddleware(req, res, next)
  }
}
