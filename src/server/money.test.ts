import { describe, expect, it } from 'vitest'
import { splitCommission } from './money.js'

describe('splitCommission', () => {
  it('preserves exact integer sats', () => {
    expect(splitCommission(101, 1000)).toEqual({ commissionSats: 10, authorSats: 91 })
    expect(splitCommission(100, 2500)).toEqual({ commissionSats: 25, authorSats: 75 })
    expect(splitCommission(1, 1000)).toEqual({ commissionSats: 0, authorSats: 1 })
  })

  it('rejects invalid inputs', () => {
    expect(() => splitCommission(1.5, 1000)).toThrow()
    expect(() => splitCommission(10, 10001)).toThrow()
  })
})
