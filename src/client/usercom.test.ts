import { describe, expect, it } from 'vitest'
import { buildUsercomFeedback, buildUsercomSignal, cleanUsercomContext, signalSeverity } from './usercom'

const runtime = {
  url: 'https://papertrade.metanet.app/read/book/2',
  path: '/read/book/2',
  referrer: 'https://projectbabbage.com/',
  anonymousId: 'anon-1',
  sessionId: 'session-1',
  userAgent: 'vitest',
  releaseVersion: 'test-release',
  walletSubstrate: 'react-native',
  diagnosticId: 'session-1'
}

describe('PaperTrade UserCom adapter', () => {
  it('builds normalized signals with standard context', () => {
    const signal = buildUsercomSignal({
      name: 'reader.paid_page_unlocked',
      surface: 'reader',
      tags: ['page:paid', 'conversion:paid_page'],
      context: { publicationId: 'book', pageNumber: 2 }
    }, runtime)

    expect(signal.source).toBe('papertrade')
    expect(signal.name).toBe('reader.paid_page_unlocked')
    expect(signal.surface).toBe('reader')
    expect(signal.tags).toContain('surface:reader')
    expect(signal.tags).toContain('wallet:react_native')
    expect(signal.tags).toContain('conversion:paid_page')
    expect(signal.context).toMatchObject({
      publicationId: 'book',
      pageNumber: 2,
      releaseVersion: 'test-release',
      walletSubstrate: 'react-native',
      diagnosticId: 'session-1'
    })
  })

  it('redacts transaction-shaped context before sending', () => {
    expect(cleanUsercomContext({
      tx: 'rawtx',
      beef: 'rawbeef',
      signature: 'sig',
      safe: 'ok'
    })).toEqual({
      tx: '[redacted]',
      beef: '[redacted]',
      signature: '[redacted]',
      safe: 'ok'
    })
  })

  it('wraps feedback as a UserCom feedback submission with trace tags', () => {
    const feedback = buildUsercomFeedback({
      surface: 'reader',
      email: 'reader@example.com',
      feedback: 'Paid page worked.',
      tags: ['page:paid'],
      context: { publicationId: 'book', pageNumber: 2 }
    }, runtime)

    expect(feedback.type).toBe('feedback')
    expect(feedback.source).toBe('papertrade')
    expect(feedback.surface).toBe('reader')
    expect(feedback.subject).toBe('PaperTrade feedback: reader')
    expect(feedback.tags).toContain('intent:papertrade-feedback')
    expect(feedback.context).toMatchObject({
      publicationId: 'book',
      pageNumber: 2,
      diagnosticId: 'session-1'
    })
  })

  it('derives severity from outcome tags', () => {
    expect(signalSeverity(['feedback'])).toBe('info')
    expect(signalSeverity(['status:failed'])).toBe('error')
    expect(signalSeverity(['wallet_failed'])).toBe('error')
    expect(signalSeverity(['timeout'])).toBe('warn')
  })
})
