import { describe, expect, it } from 'vitest'
import {
  buildPaidPageAccessStartedTelemetry,
  buildReaderPageLoadedTelemetry,
  normalizeReaderPageAccessMode
} from './readerTelemetry'

describe('reader telemetry', () => {
  it('normalizes page access modes from server metadata', () => {
    expect(normalizeReaderPageAccessMode('free')).toBe('free')
    expect(normalizeReaderPageAccessMode('paid')).toBe('paid')
    expect(normalizeReaderPageAccessMode('owned')).toBe('owned')
    expect(normalizeReaderPageAccessMode('unexpected')).toBe('unknown')
  })

  it('emits neutral paid-page access start telemetry before access mode is known', () => {
    const event = buildPaidPageAccessStartedTelemetry('book', 2)

    expect(event.name).toBe('reader.paid_page_access_started')
    expect(event.tags).toContain('access:checking')
    expect(event.tags).toContain('charge:unknown')
    expect(event.context).toMatchObject({
      publicationId: 'book',
      pageNumber: 2,
      accessMode: 'unknown',
      chargeRequired: 'unknown'
    })
  })

  it('emits owned/no-charge telemetry for entitlement rereads', () => {
    const event = buildReaderPageLoadedTelemetry({
      publicationId: 'book',
      pageNumber: 2,
      cacheHit: false,
      accessMode: 'owned'
    })

    expect(event.name).toBe('reader.owned_page_accessed')
    expect(event.tags).toContain('access:owned')
    expect(event.tags).toContain('charge:none')
    expect(event.tags).toContain('entitlement:reread')
    expect(event.tags).not.toContain('conversion:paid_page')
    expect(event.context).toMatchObject({
      publicationId: 'book',
      pageNumber: 2,
      accessMode: 'owned',
      chargeRequired: false
    })
  })

  it('keeps conversion telemetry for fresh paid unlocks', () => {
    const event = buildReaderPageLoadedTelemetry({
      publicationId: 'book',
      pageNumber: 2,
      cacheHit: false,
      accessMode: 'paid'
    })

    expect(event.name).toBe('reader.paid_page_unlocked')
    expect(event.tags).toContain('conversion:paid_page')
    expect(event.tags).toContain('charge:paid')
    expect(event.context).toMatchObject({
      accessMode: 'paid',
      chargeRequired: true
    })
  })
})
