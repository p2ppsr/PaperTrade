import { describe, expect, it } from 'vitest'
import { shouldShowAdminNavigation } from './navigation'

describe('shouldShowAdminNavigation', () => {
  it('hides admin navigation while status is unknown', () => {
    expect(shouldShowAdminNavigation(undefined)).toBe(false)
    expect(shouldShowAdminNavigation(null)).toBe(false)
  })

  it('hides admin navigation for non-admins', () => {
    expect(shouldShowAdminNavigation(false)).toBe(false)
  })

  it('shows admin navigation for admins', () => {
    expect(shouldShowAdminNavigation(true)).toBe(true)
  })
})
