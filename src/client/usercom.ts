export const USERCOM_SOURCE = 'papertrade'
export const USERCOM_SUBMIT_ENDPOINT = 'https://usercom.babbage.systems/submit'
export const USERCOM_SIGNAL_ENDPOINT = 'https://usercom.babbage.systems/signal'
export const USERCOM_SIGNALS_ENDPOINT = 'https://usercom.babbage.systems/signals'

export type SignalSeverity = 'info' | 'warn' | 'error' | 'fatal'

export interface UsercomRuntime {
  url: string
  path: string
  referrer?: string
  anonymousId: string
  sessionId: string
  userAgent: string
  releaseVersion: string
  walletSubstrate: string
  diagnosticId: string
}

export interface UsercomSignalInput {
  name: string
  surface: string
  tags?: string[]
  context?: Record<string, unknown>
}

export interface UsercomSignalPayload extends UsercomSignalInput {
  source: string
  url: string
  path: string
  referrer?: string
  anonymousId: string
  sessionId: string
  userAgent: string
  tags: string[]
  context: Record<string, unknown>
}

export interface UsercomFeedbackInput {
  surface: string
  name?: string
  email?: string
  feedback: string
  tags?: string[]
  context?: Record<string, unknown>
}

export function tagValue (value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
}

export function cleanUsercomContext (context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context)
      .map(([key, value]) => [key, isSensitiveKey(key) ? '[redacted]' : cleanUsercomValue(value)] as const)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

function isSensitiveKey (key: string): boolean {
  const lower = key.toLowerCase()
  return lower.includes('tx') ||
    lower.includes('beef') ||
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('private') ||
    lower.includes('token') ||
    lower.includes('signature')
}

function cleanUsercomValue (value: unknown, depth = 0): unknown {
  if (value == null || value === '') return undefined
  if (depth > 3) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, 800)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 20).map(item => cleanUsercomValue(item, depth + 1)).filter(item => item !== undefined)
  if (typeof value === 'object') {
    const safe: Record<string, unknown> = {}
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      const key = rawKey.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80)
      safe[key] = isSensitiveKey(key)
        ? '[redacted]'
        : cleanUsercomValue(rawValue, depth + 1)
    }
    return cleanUsercomContext(safe)
  }
  return String(value).slice(0, 200)
}

export function signalSeverity (tags: string[]): SignalSeverity {
  if (tags.includes('fatal')) return 'fatal'
  if (tags.includes('error') || tags.includes('wallet_failed') || tags.some(tag => tag.endsWith(':failed'))) return 'error'
  if (tags.some(tag => tag.includes('failed')) || tags.some(tag => tag.includes('timeout'))) return 'warn'
  return 'info'
}

export function buildUsercomSignal (input: UsercomSignalInput, runtime: UsercomRuntime): UsercomSignalPayload {
  const surfaceTag = `surface:${tagValue(input.surface)}`
  const walletTag = `wallet:${tagValue(runtime.walletSubstrate)}`
  const tags = Array.from(new Set([
    surfaceTag,
    walletTag,
    ...(input.tags ?? []).filter(Boolean)
  ]))

  return {
    source: USERCOM_SOURCE,
    name: input.name,
    surface: input.surface,
    url: runtime.url,
    path: runtime.path,
    referrer: runtime.referrer,
    anonymousId: runtime.anonymousId,
    sessionId: runtime.sessionId,
    userAgent: runtime.userAgent,
    tags,
    context: cleanUsercomContext({
      releaseVersion: runtime.releaseVersion,
      walletSubstrate: runtime.walletSubstrate,
      diagnosticId: runtime.diagnosticId,
      ...input.context
    })
  }
}

export function buildUsercomFeedback (input: UsercomFeedbackInput, runtime: UsercomRuntime): Record<string, unknown> {
  const signal = buildUsercomSignal({
    name: 'feedback.submitted',
    surface: input.surface,
    tags: ['intent:papertrade-feedback', ...(input.tags ?? [])],
    context: input.context
  }, runtime)
  const { name: _eventName, ...metadata } = signal
  return {
    type: 'feedback',
    email: input.email?.trim() === '' ? undefined : input.email?.trim(),
    subject: `PaperTrade feedback: ${input.surface}`,
    feedback: input.feedback,
    ...metadata,
    name: input.name?.trim() === '' ? undefined : input.name?.trim()
  }
}
