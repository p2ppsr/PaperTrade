export function splitCommission (satoshis: number, commissionBps: number): { commissionSats: number, authorSats: number } {
  if (!Number.isInteger(satoshis) || satoshis < 0) throw new Error('satoshis must be a non-negative integer')
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('commissionBps must be an integer between 0 and 10000')
  }
  const commissionSats = Math.floor((satoshis * commissionBps) / 10000)
  return {
    commissionSats,
    authorSats: satoshis - commissionSats
  }
}

export function asPositiveInteger (value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}
