export type WalletTelemetrySeverity = 'info' | 'warn' | 'error'

function numericObjectBytes (value: unknown): number[] | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array) return undefined

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) return undefined

  const bytes = new Array<number>(keys.length)
  for (let index = 0; index < keys.length; index += 1) {
    const key = String(index)
    const byte = record[key]
    if (!Object.prototype.hasOwnProperty.call(record, key) || !Number.isInteger(byte) || Number(byte) < 0 || Number(byte) > 255) {
      return undefined
    }
    bytes[index] = Number(byte)
  }

  if (keys.some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= keys.length)) return undefined
  return bytes
}

/**
 * React Native's WebView bridge crosses a JSON boundary. A Uint8Array returned
 * by createAction is serialized there as { "0": byte, "1": byte, ... }.
 * Restore only that exact, dense byte representation before AuthFetch encodes
 * the transaction for the payment header.
 */
export function normalizeWalletResult (method: string, result: unknown): unknown {
  if (method !== 'createAction' || result == null || typeof result !== 'object' || Array.isArray(result)) return result

  const record = result as Record<string, unknown>
  const bytes = numericObjectBytes(record.tx)
  if (bytes == null) return result
  return { ...record, tx: bytes }
}

export function walletTransactionSummary (result: unknown): Record<string, unknown> {
  if (result == null || typeof result !== 'object') return {}
  const value = (result as Record<string, unknown>).tx
  if (Array.isArray(value)) return { transactionShape: 'array', transactionByteLength: value.length }
  if (value instanceof Uint8Array) return { transactionShape: 'uint8array', transactionByteLength: value.byteLength }
  if (numericObjectBytes(value) != null) {
    return { transactionShape: 'numeric_object', transactionByteLength: Object.keys(value as object).length }
  }
  if (typeof value === 'string') return { transactionShape: 'string', transactionByteLength: value.length }
  return value == null ? { transactionShape: 'missing' } : { transactionShape: typeof value }
}

export function walletFailureSeverity (message: string, hasEmbeddedBridge: boolean): WalletTelemetrySeverity {
  const lower = message.toLowerCase()
  if (lower.includes('wallet apis are unavailable in web2 mode')) return 'info'
  if (
    lower.includes('no wallet available') ||
    lower.includes('wallet setup is needed') ||
    lower.includes('communication substrate')
  ) {
    return hasEmbeddedBridge ? 'warn' : 'info'
  }
  if (lower.includes('wallet connection needs attention')) return 'warn'
  return 'error'
}

export function walletHttpFailureSeverity (status: number): WalletTelemetrySeverity {
  if (status === 401 || status === 403) return 'info'
  if (status === 400 || status >= 500) return 'error'
  return 'warn'
}
