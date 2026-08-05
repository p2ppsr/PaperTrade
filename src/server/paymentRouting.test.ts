import { describe, expect, it } from 'vitest'
import { requiresPagePayment } from './paymentRouting.js'

describe('reader payment routing', () => {
  it('keeps the public first page outside payment middleware', () => {
    expect(requiresPagePayment('1')).toBe(false)
  })

  it('keeps later pages behind payment middleware', () => {
    expect(requiresPagePayment('2')).toBe(true)
    expect(requiresPagePayment('20')).toBe(true)
  })
})
