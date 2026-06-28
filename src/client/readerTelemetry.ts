export type ReaderPageAccessMode = 'free' | 'paid' | 'owned' | 'unknown'

export interface ReaderPageTelemetryInput {
  publicationId: string
  pageNumber: number
  cacheHit: boolean
  accessMode?: ReaderPageAccessMode
}

export interface ReaderPageTelemetryEvent {
  name: string
  surface: 'reader'
  tags: string[]
  context: Record<string, unknown>
}

export function normalizeReaderPageAccessMode (value: unknown): ReaderPageAccessMode {
  return value === 'free' || value === 'paid' || value === 'owned' ? value : 'unknown'
}

export function buildPaidPageAccessStartedTelemetry (
  publicationId: string,
  pageNumber: number
): ReaderPageTelemetryEvent {
  return {
    name: 'reader.paid_page_access_started',
    surface: 'reader',
    tags: ['page:paid', 'access:checking', 'charge:unknown'],
    context: { publicationId, pageNumber, accessMode: 'unknown', chargeRequired: 'unknown' }
  }
}

export function buildReaderPageLoadedTelemetry (
  input: ReaderPageTelemetryInput
): ReaderPageTelemetryEvent {
  const accessMode = normalizeReaderPageAccessMode(input.accessMode)
  const baseContext = {
    publicationId: input.publicationId,
    pageNumber: input.pageNumber,
    cacheHit: input.cacheHit,
    accessMode
  }
  const cacheTag = input.cacheHit ? 'cache:hit' : 'cache:miss'

  if (input.pageNumber === 1) {
    return {
      name: 'reader.first_page_loaded',
      surface: 'reader',
      tags: ['page:first_free', 'access:free', 'charge:none', cacheTag],
      context: { ...baseContext, chargeRequired: false }
    }
  }

  if (accessMode === 'owned') {
    return {
      name: 'reader.owned_page_accessed',
      surface: 'reader',
      tags: ['page:paid', 'access:owned', 'charge:none', 'entitlement:reread', cacheTag],
      context: { ...baseContext, chargeRequired: false }
    }
  }

  if (accessMode === 'paid') {
    return {
      name: 'reader.paid_page_unlocked',
      surface: 'reader',
      tags: ['page:paid', 'access:paid', 'charge:paid', 'conversion:paid_page', cacheTag],
      context: { ...baseContext, chargeRequired: true }
    }
  }

  return {
    name: 'reader.paid_page_accessed',
    surface: 'reader',
    tags: ['page:paid', 'access:unknown', 'charge:unknown', cacheTag],
    context: { ...baseContext, chargeRequired: 'unknown' }
  }
}
