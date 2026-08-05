import { Utils } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  normalizeWalletResult,
  walletFailureSeverity,
  walletHttpFailureSeverity,
  walletTransactionSummary
} from './walletCompatibility'

describe('mobile wallet compatibility', () => {
  it('restores a createAction transaction serialized through the WebView JSON boundary', () => {
    const bridged = { tx: { 0: 1, 1: 2, 2: 3 }, txid: 'example' }
    const normalized = normalizeWalletResult('createAction', bridged) as { tx: number[] }

    expect(normalized.tx).toEqual([1, 2, 3])
    expect(Utils.toBase64(normalized.tx)).toBe('AQID')
  })

  it('does not reinterpret sparse, invalid, or unrelated wallet results', () => {
    const sparse = { tx: { 0: 1, 2: 3 } }
    const invalid = { tx: { 0: 256 } }
    const unrelated = { tx: { 0: 1, 1: 2 } }

    expect(normalizeWalletResult('createAction', sparse)).toBe(sparse)
    expect(normalizeWalletResult('createAction', invalid)).toBe(invalid)
    expect(normalizeWalletResult('getPublicKey', unrelated)).toBe(unrelated)
  })

  it('leaves native transaction arrays intact and reports safe shape metadata', () => {
    const result = { tx: new Uint8Array([4, 5, 6]) }

    expect(normalizeWalletResult('createAction', result)).toBe(result)
    expect(walletTransactionSummary(result)).toEqual({
      transactionShape: 'uint8array',
      transactionByteLength: 3
    })
  })

  it('keeps expected wallet absence and authorization denials out of the error rate', () => {
    expect(walletFailureSeverity('No wallet available over any communication substrate.', false)).toBe('info')
    expect(walletFailureSeverity('No wallet available over any communication substrate.', true)).toBe('warn')
    expect(walletFailureSeverity('Wallet APIs are unavailable in web2 mode.', true)).toBe('info')
    expect(walletHttpFailureSeverity(403)).toBe('info')
    expect(walletHttpFailureSeverity(400)).toBe('error')
    expect(walletHttpFailureSeverity(503)).toBe('error')
  })
})
