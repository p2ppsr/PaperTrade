import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AuthFetch, Utils, WalletClient } from '@bsv/sdk'
import { IdentityCard } from '@bsv/identity-react'
import { Activity, BookOpen, Check, ExternalLink, FileText, Github, Home, Image, Info, Library, MessageCircle, Monitor, Palette, RefreshCw, Settings, Share2, Smartphone, Upload, User } from 'lucide-react'
import './styles.css'

type WalletSubstrate = 'auto' | 'json-api' | 'secure-json-api' | 'react-native' | 'Cicada' | 'XDM' | 'window.CWI'

interface Status {
  setupComplete: boolean
  identityKey?: string
  isAdmin: boolean
  mode: 'private_publish' | 'public_submissions'
  pricePerPageSats: number
  commissionBps: number
  displayUnit: 'sats' | 'usd_cents'
  walletStorageUrl: string
  serverPublicKey?: string
  appearance: Appearance
}

interface Appearance {
  serverName: string
  newsstandLabel: string
  tagline: string
  metaTitle: string
  metaDescription: string
  theme: {
    primary: string
    accent: string
    background: string
    surface: string
    text: string
    muted: string
    border: string
  }
  logoUrl?: string | null
  iconUrl?: string | null
  ogImageUrl?: string | null
}

interface Publication {
  id: string
  title: string
  description?: string
  authorName?: string
  authorIdentityKey: string
  pageCount: number
  publishedAt?: string
  coverUrl?: string
}

interface AuthorProfile {
  identity_key: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  display_unit?: 'sats' | 'usd_cents' | null
}

interface AuthorPayoutPayload {
  payoutId: string
  amountSats: number
  txBase64: string
  outputIndex: number
  derivationPrefix: string
  derivationSuffix: string
  serverIdentityKey: string
  status: string
}

interface AdminPublication {
  id: string
  title: string
  description?: string | null
  display_name?: string | null
  author_identity_key: string
  status: string
  page_count: number
  updated_at?: string
  published_at?: string | null
}

interface AdminUser {
  identity_key: string
  added_by?: string | null
  created_at?: string
}

interface ServerWallet {
  serverPublicKey: string
  balanceSats: number
}

interface ClientEvent {
  id: string
  event_name: string
  severity: 'info' | 'warn' | 'error' | 'fatal'
  session_id?: string | null
  identity_key?: string | null
  route?: string | null
  path?: string | null
  platform?: string | null
  connection_type?: string | null
  duration_ms?: number | null
  request_id?: string | null
  received_at?: string
  context?: string | null
}

interface AdminSettings {
  mode: 'private_publish' | 'public_submissions'
  pricePerPageSats: number
  commissionBps: number
  displayUnit: 'sats' | 'usd_cents'
  walletStorageUrl: string
}

const API = '/api'
const WALLET_ORIGINATOR = (import.meta as any).env?.VITE_WALLET_ORIGINATOR ?? window.location.hostname
const WALLET_SUBSTRATE_OVERRIDE = (import.meta as any).env?.VITE_WALLET_SUBSTRATE as string | undefined
const APP_RELEASE = (import.meta as any).env?.VITE_APP_VERSION ?? 'browser'
const USERCOM_SOURCE = 'papertrade'
const USERCOM_SUBMIT_ENDPOINT = 'https://usercom.babbage.systems/submit'
const USERCOM_SIGNAL_ENDPOINT = 'https://usercom.babbage.systems/signal'
const TELEMETRY_ENDPOINT = `${API}/telemetry`
const GET_METANET_DOWNLOADS_URL = 'https://getmetanet.com/downloads'
const METANET_EXPLORER_IOS_URL = 'https://apps.apple.com/us/app/metanet-explorer/id6752445658'
const METANET_EXPLORER_ANDROID_URL = 'https://play.google.com/store/apps/details?id=app.metanet.explorer'
const BSV_BROWSER_ANDROID_URL = 'https://play.google.com/store/apps/details?id=org.bsvassociation.browser'
const BSV_BROWSER_URL = 'https://desktop.bsvb.tech/'
const PAPERTRADE_GITHUB_URL = 'https://github.com/p2ppsr/PaperTrade'
let activeWalletRequestContext: Record<string, unknown> = {}
let activeWalletRequestContextToken = 0
let cachedWalletSubstrate: WalletSubstrate | null = null
let cachedWallet: WalletClient | null = null
let cachedAuthFetch: AuthFetch | null = null
const TELEMETRIED_WALLET_METHODS = new Set([
  'getPublicKey',
  'createHmac',
  'verifyHmac',
  'createSignature',
  'verifySignature',
  'encrypt',
  'decrypt',
  'createAction',
  'signAction',
  'abortAction',
  'internalizeAction',
  'listActions',
  'listOutputs',
  'relinquishOutput',
  'acquireCertificate',
  'listCertificates',
  'proveCertificate',
  'relinquishCertificate',
  'discoverByIdentityKey',
  'discoverByAttributes',
  'isAuthenticated',
  'waitForAuthentication',
  'getHeight',
  'getHeaderForHeight',
  'getNetwork',
  'getVersion'
])
const DEFAULT_APPEARANCE: Appearance = {
  serverName: 'PaperTrade',
  newsstandLabel: 'Newsstand',
  tagline: 'Read page 1 free. Pay per page after that with a BRC100 wallet.',
  metaTitle: 'PaperTrade | BSV per-page publishing newsstand',
  metaDescription: 'PaperTrade is a BSV newsstand where readers preview page 1 free and pay per page for independent writing with a BRC100 wallet.',
  theme: {
    primary: '#1f4f46',
    accent: '#b2772c',
    background: '#f7f5ef',
    surface: '#ffffff',
    text: '#20231f',
    muted: '#5c6570',
    border: '#ddd8ca'
  },
  logoUrl: null,
  iconUrl: null,
  ogImageUrl: null
}

interface WalletOption {
  label: string
  description: string
  href: string
  icon: 'phone' | 'desktop'
}

function resetWalletClients (reason: string): void {
  cachedWallet = null
  cachedAuthFetch = null
  cachedWalletSubstrate = null
  activeWalletRequestContext = {}
  activeWalletRequestContextToken += 1
  postTelemetry('wallet.client_reset', 'warn', { context: { reason } })
}

function getWallet (): WalletClient {
  const substrate = getWalletSubstrate()
  if (cachedWallet == null || cachedWalletSubstrate !== substrate) {
    cachedWalletSubstrate = substrate
    cachedWallet = instrumentWalletForTelemetry(new WalletClient(substrate, WALLET_ORIGINATOR))
    cachedAuthFetch = null
    postTelemetry('wallet.client_created', 'info', { context: { walletSubstrate: substrate } })
  }
  return cachedWallet
}

function getAuthFetch (): AuthFetch {
  if (cachedAuthFetch == null) {
    cachedAuthFetch = new AuthFetch(getWallet(), undefined, undefined, WALLET_ORIGINATOR)
    postTelemetry('wallet.auth_fetch_created', 'info', { context: { walletSubstrate: cachedWalletSubstrate ?? getWalletSubstrate() } })
  }
  return cachedAuthFetch
}

function summarizeWalletResult (result: unknown): Record<string, unknown> {
  if (result == null || typeof result !== 'object') return { resultType: typeof result }
  const value = result as Record<string, unknown>
  return cleanContext({
    resultType: 'object',
    accepted: typeof value.accepted === 'boolean' ? value.accepted : undefined,
    hasTx: typeof value.tx === 'string' || Array.isArray(value.tx),
    hasTxid: typeof value.txid === 'string',
    hasSignableTransaction: value.signableTransaction != null,
    outputCount: Array.isArray(value.outputs) ? value.outputs.length : undefined,
    actionCount: Array.isArray(value.actions) ? value.actions.length : undefined,
    certificateCount: Array.isArray(value.certificates) ? value.certificates.length : undefined,
    publicKeyLength: typeof value.publicKey === 'string' ? value.publicKey.length : undefined,
    network: typeof value.network === 'string' ? value.network : undefined,
    version: typeof value.version === 'string' ? value.version : undefined
  })
}

function instrumentWalletForTelemetry (wallet: WalletClient): WalletClient {
  return new Proxy(wallet as unknown as Record<string, unknown>, {
    get (target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || typeof value !== 'function' || !TELEMETRIED_WALLET_METHODS.has(property)) return value
      return async (...args: unknown[]) => {
        const startedAt = performance.now()
        const requestContext = { ...activeWalletRequestContext }
        postTelemetry('wallet.method_started', 'info', {
          context: {
            ...requestContext,
            walletMethod: property
          }
        })
        try {
          const result = await value.apply(target, args)
          postTelemetry('wallet.method_finished', 'info', {
            durationMs: performance.now() - startedAt,
            context: {
              ...requestContext,
              walletMethod: property,
              ...summarizeWalletResult(result)
            }
          })
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Wallet method failed'
          postTelemetry('wallet.method_failed', 'error', {
            durationMs: performance.now() - startedAt,
            context: {
              ...requestContext,
              walletMethod: property,
              message
            }
          })
          throw err
        }
      }
    }
  }) as unknown as WalletClient
}

function hasReactNativeWalletBridge (): boolean {
  const maybeWindow = window as Window & { ReactNativeWebView?: { postMessage?: unknown } }
  return typeof maybeWindow.ReactNativeWebView?.postMessage === 'function'
}

function hasWindowCwiWalletBridge (): boolean {
  return typeof (window as Window & { CWI?: unknown }).CWI === 'object'
}

function hasEmbeddedWalletBridge (): boolean {
  return hasReactNativeWalletBridge() || hasWindowCwiWalletBridge()
}

function getWalletSubstrate (): WalletSubstrate {
  if (WALLET_SUBSTRATE_OVERRIDE != null && WALLET_SUBSTRATE_OVERRIDE !== '') return WALLET_SUBSTRATE_OVERRIDE as WalletSubstrate
  if (hasReactNativeWalletBridge()) return 'react-native'
  return 'auto'
}

function absoluteRequestUrl (url: string): string {
  return new URL(url, window.location.origin).toString()
}

async function fileToBase64 (file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.readAsDataURL(file)
  })
}

async function uploadJsonFile (url: string, file: File, extra?: Record<string, unknown>): Promise<Response> {
  return await authFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type === '' ? 'application/octet-stream' : file.type,
      dataBase64: await fileToBase64(file),
      ...extra
    })
  })
}

function paymentUnitLabel (unit: 'sats' | 'usd_cents'): string {
  return unit === 'usd_cents' ? 'USD cents' : 'sats'
}

function setClientMeta (title: string, description: string): void {
  document.title = title
  const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (descriptionTag != null) descriptionTag.content = description
}

function appearanceFromStatus (status: Status | null): Appearance {
  return {
    ...DEFAULT_APPEARANCE,
    ...(status?.appearance ?? {}),
    theme: {
      ...DEFAULT_APPEARANCE.theme,
      ...(status?.appearance?.theme ?? {})
    }
  }
}

function appearanceStyle (appearance: Appearance): React.CSSProperties {
  const style: React.CSSProperties & Record<string, string> = {
    '--pt-primary': appearance.theme.primary,
    '--pt-accent': appearance.theme.accent,
    '--pt-background': appearance.theme.background,
    '--pt-surface': appearance.theme.surface,
    '--pt-text': appearance.theme.text,
    '--pt-muted': appearance.theme.muted,
    '--pt-border': appearance.theme.border
  }
  return style
}

async function sharePaperTrade ({ title, text, path }: { title: string, text: string, path: string }): Promise<string> {
  const url = new URL(path, window.location.origin).toString()
  if (typeof navigator.share === 'function') {
    await navigator.share({ title, text, url })
    return 'Shared.'
  }
  await navigator.clipboard.writeText(url)
  return 'Link copied.'
}

async function authFetch (url: string, init?: RequestInit, action = 'complete this wallet request'): Promise<Response> {
  const request = async (): Promise<Response> => {
    const startedAt = performance.now()
    const requestUrl = absoluteRequestUrl(url)
    const method = init?.method ?? 'GET'
    postTelemetry('wallet.request_started', 'info', {
      context: { method, url: new URL(requestUrl).pathname }
    })
    const previousWalletContext = activeWalletRequestContext
    const contextToken = activeWalletRequestContextToken + 1
    activeWalletRequestContextToken = contextToken
    activeWalletRequestContext = { method, url: new URL(requestUrl).pathname, action }
    try {
      const fetcher = getAuthFetch()
      const response = await fetcher.fetch(requestUrl, init as any)
      postTelemetry(response.ok ? 'wallet.request_finished' : 'wallet.request_http_error', response.ok ? 'info' : 'warn', {
        durationMs: performance.now() - startedAt,
        requestId: response.headers.get('x-papertrade-request-id'),
        context: {
          method,
          url: new URL(requestUrl).pathname,
          status: response.status
        }
      })
      return response
    } catch (err) {
      const normalized = normalizeWalletTransportError(err)
      postTelemetry('wallet.request_failed', 'error', {
        durationMs: performance.now() - startedAt,
        context: {
          method,
          url: new URL(requestUrl).pathname,
          message: normalized.message
        }
      })
      throw normalized
    } finally {
      if (activeWalletRequestContextToken === contextToken) activeWalletRequestContext = previousWalletContext
    }
  }
  const requestWithAuthRetry = async (): Promise<Response> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request()
      if (response.status !== 401 || attempt > 0 || !hasEmbeddedWalletBridge()) return response

      postTelemetry('wallet.request_unauthenticated_retry', 'warn', {
        requestId: response.headers.get('x-papertrade-request-id'),
        context: {
          method: init?.method ?? 'GET',
          url: new URL(absoluteRequestUrl(url)).pathname,
          action
        }
      })
      resetWalletClients('unauthenticated_response_retry')
    }

    return await request()
  }
  return await requestWithAuthRetry()
}

async function withWalletTelemetryContext<T> (context: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const previousWalletContext = activeWalletRequestContext
  const contextToken = activeWalletRequestContextToken + 1
  activeWalletRequestContextToken = contextToken
  activeWalletRequestContext = context
  try {
    return await fn()
  } finally {
    if (activeWalletRequestContextToken === contextToken) activeWalletRequestContext = previousWalletContext
  }
}

async function protectedPageFetch (url: string): Promise<Response> {
  return await authFetch(url, undefined, 'unlock this page')
}

function withFormatJson (url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}format=json`
}

async function pageFetch (url: string, pageNumber: number): Promise<Response> {
  if (pageNumber === 1) return await fetch(url)
  return await protectedPageFetch(withFormatJson(url))
}

function base64ToBlob (base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

async function responseToPngBlob (res: Response, fallbackMessage: string, expectJson = false): Promise<Blob> {
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.message ?? json.description ?? `${fallbackMessage} with HTTP ${res.status}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (expectJson || contentType.includes('application/json')) {
    const json = await res.json()
    if (json.mimeType !== 'image/png' || typeof json.dataBase64 !== 'string') {
      throw new Error(`${fallbackMessage}: server did not return a rendered page image`)
    }
    return base64ToBlob(json.dataBase64, json.mimeType)
  }
  const blob = await res.blob()
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const isPng = header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  if (!isPng) throw new Error(`${fallbackMessage}: server did not return a rendered page image`)
  return blob
}

function randomId (): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function getStoredId (storage: Storage, key: string): string {
  const id = randomId()
  try {
    const existing = storage.getItem(key)
    if (existing != null && existing !== '') return existing
    storage.setItem(key, id)
  } catch {
    return id
  }
  return id
}

function anonymousId (): string {
  return getStoredId(window.localStorage, 'papertrade_anonymous_id')
}

function sessionId (): string {
  return getStoredId(window.sessionStorage, 'papertrade_session_id')
}

function tagValue (value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
}

function cleanContext (context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function connectionType (): string | undefined {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string, type?: string } }).connection
  return connection?.effectiveType ?? connection?.type
}

function postTelemetry (
  name: string,
  severity: 'info' | 'warn' | 'error' | 'fatal' = 'info',
  metadata: { durationMs?: number, requestId?: string | null, context?: Record<string, unknown> } = {}
): void {
  try {
    const payload = {
      name,
      severity,
      anonymousId: anonymousId(),
      sessionId: sessionId(),
      route: window.location.pathname,
      path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer === '' ? undefined : document.referrer,
      userAgent: window.navigator.userAgent,
      platform: window.navigator.platform,
      connectionType: connectionType(),
      durationMs: metadata.durationMs,
      requestId: metadata.requestId,
      releaseVersion: APP_RELEASE,
      occurredAt: new Date().toISOString(),
      context: cleanContext({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        online: navigator.onLine,
        walletSubstrate: getWalletSubstrate(),
        hasReactNativeWalletBridge: hasReactNativeWalletBridge(),
        hasWindowCwiWalletBridge: hasWindowCwiWalletBridge(),
        ...metadata.context
      })
    }
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon != null && body.length < 64000) {
      const sent = navigator.sendBeacon(TELEMETRY_ENDPOINT, new Blob([body], { type: 'application/json' }))
      if (sent) return
    }
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => undefined)
  } catch {}
}

function normalizeWalletTransportError (err: unknown): Error {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const lower = raw.toLowerCase()
  const isTransportFailure = lower === 'load failed' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('communication substrate') ||
    lower.includes('no wallet available') ||
    lower.includes('reactnativewebview property') ||
    lower.includes('window.cwi')
  if (!isTransportFailure) return err instanceof Error ? err : new Error(raw === '' ? 'Wallet request failed' : raw)
  if (hasEmbeddedWalletBridge()) {
    return new Error('Wallet connection needs attention. PaperTrade is open in a wallet browser, but the wallet request did not complete. Sign in, approve any pending wallet prompts, and retry.')
  }
  return new Error('BRC100 wallet setup is needed to continue. Open PaperTrade in Metanet Explorer, BSV Browser, or another compatible BRC100 wallet browser.')
}

function usercomMetadata ({ surface, tags = [], context = {} }: { surface: string, tags?: string[], context?: Record<string, unknown> }): Record<string, unknown> {
  return {
    source: USERCOM_SOURCE,
    surface,
    url: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer === '' ? undefined : document.referrer,
    anonymousId: anonymousId(),
    sessionId: sessionId(),
    tags: [`surface:${tagValue(surface)}`, ...tags].filter(Boolean),
    context: cleanContext(context)
  }
}

function postSignal (name: string, metadata: Record<string, unknown>): void {
  try {
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map(String) : []
    const severity = tags.includes('error') || tags.includes('wallet_failed') ? 'error' : tags.some(tag => tag.includes('failed')) ? 'warn' : 'info'
    postTelemetry(name, severity, {
      context: {
        surface: metadata.surface,
        tags,
        ...(typeof metadata.context === 'object' && metadata.context != null ? metadata.context as Record<string, unknown> : {})
      }
    })
    void fetch(USERCOM_SIGNAL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ...metadata }),
      keepalive: true
    }).catch(() => undefined)
  } catch {}
}

function friendlyErrorMessage (err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback
  if (isWalletHelpMessage(raw)) {
    return `${raw}. PaperTrade needs a BRC100 wallet for protected actions and paid pages.`
  }
  return raw === '' ? fallback : raw
}

function isWalletHelpMessage (message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('wallet connection needs attention') ||
    lower.includes('wallet request timed out') ||
    lower.includes('wallet setup is needed') ||
    lower.includes('no wallet available') ||
    lower.includes('communication substrate') ||
    lower.includes('brc100') ||
    lower.includes('payment') ||
    lower.includes('auth') ||
    lower.includes('identity') ||
    lower.includes('authenticate')
}

function platformWalletOptions (): WalletOption[] {
  const ua = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = ua.includes('android')
  const mobileOptions: WalletOption[] = [
    {
      label: 'Metanet Explorer for iOS',
      description: 'Best choice on iPhone and iPad. Browse PaperTrade inside the app and approve page payments there.',
      href: METANET_EXPLORER_IOS_URL,
      icon: 'phone'
    },
    {
      label: 'Metanet Explorer for Android',
      description: 'Android wallet browser for Metanet apps, identity, and micropayments.',
      href: METANET_EXPLORER_ANDROID_URL,
      icon: 'phone'
    },
    {
      label: 'BSV Browser',
      description: 'Compatible BRC100 browser with built-in identity and micropayments.',
      href: isAndroid ? BSV_BROWSER_ANDROID_URL : BSV_BROWSER_URL,
      icon: isAndroid ? 'phone' : 'desktop'
    }
  ]
  const desktopOptions: WalletOption[] = [
    {
      label: 'Get Metanet',
      description: 'Download the Metanet wallet/client for this device, then open PaperTrade again.',
      href: GET_METANET_DOWNLOADS_URL,
      icon: 'desktop'
    },
    {
      label: 'BSV Browser',
      description: 'Use a BRC100-compatible browser for wallet login, identity, and page payments.',
      href: BSV_BROWSER_URL,
      icon: 'desktop'
    }
  ]
  if (isIOS) return [mobileOptions[0], mobileOptions[2], desktopOptions[0]]
  if (isAndroid) return [mobileOptions[2], mobileOptions[1], desktopOptions[0]]
  return desktopOptions
}

function WalletHelp ({ message, freePageUrl }: { message: string, freePageUrl?: string }): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => { setDismissed(false) }, [message])
  if (!isWalletHelpMessage(message)) return null
  if (dismissed) {
    return (
      <button className='button wallet-reopen' type='button' onClick={() => setDismissed(false)}>
        <Smartphone size={18} /> Wallet help
      </button>
    )
  }
  const options = platformWalletOptions()
  const hasWallet = hasEmbeddedWalletBridge()
  return (
    <div className='wallet-popover-backdrop' role='presentation'>
      <section className='wallet-help' role='dialog' aria-label='Wallet help'>
        <button className='wallet-close' type='button' onClick={() => setDismissed(true)}>Close</button>
        <div className='wallet-help-copy'>
          <span className='step-label'>{hasWallet ? 'Wallet connected' : 'Wallet needed'}</span>
          <h2>{hasWallet ? 'Approve this wallet request' : 'Continue with a BRC100 wallet'}</h2>
          <p>
            {hasWallet
              ? 'PaperTrade is open in a compatible wallet browser. Sign in if needed, approve any pending wallet prompt, then retry this page.'
              : 'You have reached a wallet-protected step. Install a compatible wallet browser, open PaperTrade there, and return to this page to continue.'}
          </p>
        </div>
        {!hasWallet && (
          <div className='wallet-options'>
            {options.map(option => (
              <a className='wallet-option' href={option.href} target='_blank' rel='noreferrer' key={option.label}>
                {option.icon === 'phone' ? <Smartphone size={20} /> : <Monitor size={20} />}
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
        )}
        <div className='wallet-actions'>
          {freePageUrl != null && <Link className='button secondary' to={freePageUrl}><BookOpen size={18} /> Read page 1 free</Link>}
          <button type='button' onClick={() => window.location.reload()}><RefreshCw size={18} /> Retry</button>
        </div>
        <p className='hint'>Diagnostic ID: {sessionId()}</p>
      </section>
    </div>
  )
}

function looksLikeIdentityKey (value?: string | null): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{66}$/.test(value)
}

function shortKey (value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

function IdentityPill ({ identityKey, label }: { identityKey?: string | null, label?: string | null }): JSX.Element {
  if (!looksLikeIdentityKey(identityKey)) return <span className='identity-fallback'>{label ?? 'Unknown identity'}</span>
  return (
    <div className='identity-card-wrap' title={label ?? shortKey(identityKey)}>
      <IdentityCard identityKey={identityKey} />
    </div>
  )
}

function FeedbackPanel ({ surface }: { surface: string }): JSX.Element {
  const [form, setForm] = useState({ name: '', email: '', feedback: '' })
  const [message, setMessage] = useState('')
  const submit = async (): Promise<void> => {
    const feedback = form.feedback.trim()
    if (feedback === '') {
      setMessage('Tell us what happened before sending feedback.')
      return
    }
    const metadata = usercomMetadata({ surface, tags: ['feedback'], context: { surface } })
    const res = await fetch(USERCOM_SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'feedback',
        name: form.name.trim() === '' ? undefined : form.name.trim(),
        email: form.email.trim() === '' ? undefined : form.email.trim(),
        subject: `PaperTrade feedback: ${surface}`,
        feedback,
        ...metadata
      })
    })
    if (!res.ok) throw new Error('Feedback could not be sent')
    postSignal('feedback.submitted', metadata)
    setForm({ name: '', email: '', feedback: '' })
    setMessage('Feedback sent.')
  }
  return (
    <section className='feedback-panel'>
      <h2><MessageCircle size={18} /> Feedback</h2>
      <form onSubmit={e => { e.preventDefault(); void submit().catch(err => setMessage(err instanceof Error ? err.message : 'Feedback could not be sent')) }}>
        <div className='feedback-grid'>
          <label>Name <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>Email <input type='email' value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        </div>
        <label>Message <textarea value={form.feedback} onChange={e => setForm({ ...form, feedback: e.target.value })} /></label>
        <button className='button' type='submit'>Send feedback</button>
      </form>
      <p className='hint'>Diagnostic ID: {sessionId()}</p>
      {message !== '' && <p className='notice compact'>{message}</p>}
    </section>
  )
}

function ShareButton ({ title, text, path }: { title: string, text: string, path: string }): JSX.Element {
  const [message, setMessage] = useState('')
  return (
    <span className='share-wrap'>
      <button
        className='button secondary'
        type='button'
        onClick={() => {
          void sharePaperTrade({ title, text, path }).then(setMessage).catch(err => setMessage(err instanceof Error ? err.message : 'Could not share link'))
        }}
      >
        <Share2 size={18} /> Share
      </button>
      {message !== '' && <small>{message}</small>}
    </span>
  )
}

function Analytics ({ status }: { status: Status | null }): null {
  const location = useLocation()
  useEffect(() => {
    postTelemetry('app.boot', 'info', {
      context: {
        userAgent: navigator.userAgent,
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        storageAvailable: (() => {
          try {
            window.sessionStorage.setItem('papertrade_storage_probe', '1')
            window.sessionStorage.removeItem('papertrade_storage_probe')
            return true
          } catch {
            return false
          }
        })()
      }
    })
    const onError = (event: ErrorEvent): void => {
      postTelemetry('app.error', 'error', {
        context: {
          message: event.message,
          filename: event.filename,
          line: event.lineno,
          column: event.colno
        }
      })
    }
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unhandled promise rejection')
      postTelemetry('app.unhandled_rejection', 'error', { context: { message: reason } })
    }
    const onOffline = (): void => postTelemetry('app.offline', 'warn')
    const onOnline = (): void => postTelemetry('app.online', 'info')
    const onVisibility = (): void => postTelemetry('app.visibility', 'info', { context: { visibilityState: document.visibilityState } })
    const onPageHide = (): void => postTelemetry('app.pagehide', 'info', { context: { visibilityState: document.visibilityState } })
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    let observer: PerformanceObserver | undefined
    try {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          postTelemetry('app.long_task', 'warn', {
            durationMs: entry.duration,
            context: { entryType: entry.entryType, name: entry.name }
          })
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {}
    const heartbeat = window.setInterval(() => {
      postTelemetry('app.heartbeat', 'info', {
        context: {
          visibilityState: document.visibilityState,
          memory: (performance as Performance & { memory?: { usedJSHeapSize?: number, jsHeapSizeLimit?: number } }).memory
        }
      })
    }, 60000)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      observer?.disconnect()
      window.clearInterval(heartbeat)
    }
  }, [])

  useEffect(() => {
    postSignal('page.view', usercomMetadata({
      surface: 'app',
      tags: [`route:${tagValue(location.pathname)}`, status?.setupComplete === true ? 'setup:complete' : 'setup:pending', status?.mode != null ? `mode:${status.mode}` : 'mode:unknown'],
      context: { setupComplete: status?.setupComplete, mode: status?.mode }
    }))
  }, [location.pathname, location.search, status?.setupComplete, status?.mode])
  return null
}

function useStatus (): [Status | null, () => Promise<void>] {
  const [status, setStatus] = useState<Status | null>(null)
  const refresh = async (): Promise<void> => {
    const startedAt = performance.now()
    try {
      const res = await fetch(`${API}/status`)
      const json = await res.json()
      setStatus(json)
      postTelemetry('api.status_loaded', res.ok ? 'info' : 'warn', {
        durationMs: performance.now() - startedAt,
        requestId: res.headers.get('x-papertrade-request-id'),
        context: { status: res.status }
      })
    } catch (err) {
      postTelemetry('api.status_failed', 'error', {
        durationMs: performance.now() - startedAt,
        context: { message: err instanceof Error ? err.message : String(err) }
      })
      throw err
    }
  }
  useEffect(() => { void refresh().catch(() => undefined) }, [])
  return [status, refresh]
}

function Shell ({ children, status }: { children: React.ReactNode, status: Status | null }): JSX.Element {
  const appearance = appearanceFromStatus(status)
  return (
    <div className='app-shell' style={appearanceStyle(appearance)}>
      <aside className='side'>
        <Link className='brand' to='/'>
          {appearance.logoUrl != null && appearance.logoUrl !== ''
            ? <img className='brand-logo' src={appearance.logoUrl} alt='' />
            : <Library size={26} />}
          <span>{appearance.serverName}</span>
        </Link>
        <nav>
          <Link to='/'><Home size={18} /> {appearance.newsstandLabel}</Link>
          <Link to='/author'><User size={18} /> Author</Link>
          <Link to='/admin'><Settings size={18} /> Admin</Link>
          <Link to='/about'><Info size={18} /> About</Link>
        </nav>
        <div className='status-line'>
          <span>{status?.setupComplete === true ? 'Live server' : 'Setup required'}</span>
          <span>{status?.isAdmin === true ? 'Admin' : status?.identityKey != null ? 'Reader' : 'Guest'}</span>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  )
}

function Newsstand ({ status }: { status: Status | null }): JSX.Element {
  const appearance = appearanceFromStatus(status)
  const [publications, setPublications] = useState<Publication[]>([])
  const [loadMessage, setLoadMessage] = useState('')
  const loadPublications = async (): Promise<void> => {
    const startedAt = performance.now()
    try {
      setLoadMessage('')
      const res = await fetch(`${API}/publications`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? 'Could not load publications')
      const rows = json.publications ?? []
      setPublications(rows)
      postSignal('newsstand.loaded', usercomMetadata({ surface: 'newsstand', tags: ['reader'], context: { publicationCount: rows.length, durationMs: Math.round(performance.now() - startedAt) } }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load publications'
      setLoadMessage(message)
      postSignal('newsstand.failed', usercomMetadata({ surface: 'newsstand', tags: ['error'], context: { message, durationMs: Math.round(performance.now() - startedAt) } }))
    }
  }
  useEffect(() => {
    setClientMeta(appearance.metaTitle, appearance.metaDescription)
    void loadPublications()
  }, [appearance.metaDescription, appearance.metaTitle])
  return (
    <section className='surface'>
      <header className='page-head newsstand-head'>
        <div>
          <h1>{appearance.newsstandLabel}</h1>
          <p>{appearance.tagline}</p>
        </div>
      </header>
      <div className='publication-grid'>
        {publications.map(pub => (
          <article className='publication' key={pub.id}>
            <Link className='publication-cover' to={`/publication/${pub.id}`} aria-label={`Open ${pub.title}`}>
              <img src={pub.coverUrl ?? `${API}/publications/${pub.id}/cover`} alt='' loading='lazy' />
              <span><FileText size={18} /> Preview</span>
            </Link>
            <div className='publication-body'>
              <h2>{pub.title}</h2>
              <p>{pub.description}</p>
              <footer>
                <IdentityPill identityKey={pub.authorIdentityKey} label={pub.authorName} />
                <span>{pub.pageCount} pages</span>
              </footer>
              <Link className='button' to={`/publication/${pub.id}`}>Open</Link>
            </div>
          </article>
        ))}
        {loadMessage !== '' && (
          <div className='empty'>
            <p>{loadMessage}</p>
            <button type='button' onClick={() => { void loadPublications() }}><RefreshCw size={18} /> Retry</button>
          </div>
        )}
        {publications.length === 0 && loadMessage === '' && <p className='empty'>No publications are live yet.</p>}
      </div>
      <FeedbackPanel surface='newsstand' />
    </section>
  )
}

function PublicationDetail (): JSX.Element {
  const { id = '' } = useParams()
  const [publication, setPublication] = useState<Publication | null>(null)
  useEffect(() => {
    void fetch(`${API}/publications/${id}`).then(async res => await res.json()).then((json: { publication?: Publication | null }) => {
      const loaded = json.publication ?? null
      setPublication(loaded)
      if (loaded != null) {
        setClientMeta(`${loaded.title} | PaperTrade`, loaded.description ?? 'Read this publication on PaperTrade.')
        postSignal('publication.view', usercomMetadata({ surface: 'publication', tags: ['reader'], context: { publicationId: id, pageCount: loaded.pageCount } }))
      }
    })
  }, [id])
  if (publication == null) return <section className='surface'><p>Loading publication...</p></section>
  return (
    <section className='surface narrow'>
      <header className='page-head'>
        <div>
          <h1>{publication.title}</h1>
          <p>{publication.description}</p>
        </div>
        <ShareButton title={publication.title} text={publication.description ?? 'Read this PaperTrade publication.'} path={`/publication/${publication.id}`} />
      </header>
      <div className='facts'>
        <IdentityPill identityKey={publication.authorIdentityKey} label={publication.authorName} />
        <span>{publication.pageCount} pages</span>
      </div>
      <Link className='button' to={`/read/${publication.id}/1`}><BookOpen size={18} /> Start reading</Link>
    </section>
  )
}

function Reader ({ status }: { status: Status | null }): JSX.Element {
  const { id = '', pageNumber = '1' } = useParams()
  const currentPage = Number(pageNumber)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('Loading page...')
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let live = true
    let walletWaitTimer: number | undefined
    setImageUrl(null)
    setMessage('Loading page...')
    setIsLoading(true)
    if (currentPage > 1) {
      walletWaitTimer = window.setTimeout(() => {
        if (live) setMessage('Waiting for wallet approval...')
      }, 3000)
    }
    void pageFetch(`${API}/publications/${id}/pages/${currentPage}`, currentPage)
      .then(async res => await responseToPngBlob(res, 'Page request failed', currentPage > 1))
      .then(blob => {
        if (!live) return
        setImageUrl(URL.createObjectURL(blob))
        setMessage('')
        setIsLoading(false)
        postSignal('reader.page_loaded', usercomMetadata({
          surface: 'reader',
          tags: [currentPage === 1 ? 'page:first_free' : 'page:paid'],
          context: { publicationId: id, pageNumber: currentPage }
        }))
      })
      .catch(err => {
        if (!live) return
        const nextMessage = friendlyErrorMessage(err, 'Unable to load page')
        setMessage(nextMessage)
        setIsLoading(false)
        postSignal('reader.page_failed', usercomMetadata({ surface: 'reader', tags: ['error'], context: { publicationId: id, pageNumber: currentPage, message: nextMessage } }))
      })
    return () => {
      live = false
      if (walletWaitTimer != null) window.clearTimeout(walletWaitTimer)
    }
  }, [id, currentPage])

  return (
    <section className='reader'>
      <div className='reader-toolbar'>
        <button type='button' disabled={isLoading} onClick={() => navigate(`/read/${id}/${Math.max(1, currentPage - 1)}`)}>Previous</button>
        <span>Page {currentPage}</span>
        <button type='button' disabled={isLoading} onClick={() => navigate(`/read/${id}/${currentPage + 1}`)}>Next</button>
      </div>
      {message !== '' && !isWalletHelpMessage(message) && <p className='empty'>{message}</p>}
      <WalletHelp message={message} freePageUrl={currentPage > 1 ? `/read/${id}/1` : undefined} />
      {imageUrl != null && <img className='page-image' src={imageUrl} alt={`Page ${currentPage}`} />}
    </section>
  )
}

function AuthorPreview (): JSX.Element {
  const { id = '', pageNumber = '1' } = useParams()
  const currentPage = Number(pageNumber)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('Loading preview...')
  const navigate = useNavigate()
  const location = useLocation()
  const isAdminPreview = location.pathname.startsWith('/admin/')
  const previewBase = isAdminPreview ? '/admin/read' : '/author/read'
  const backPath = isAdminPreview ? '/admin' : '/author'

  useEffect(() => {
    let live = true
    setImageUrl(null)
    setMessage('Loading preview...')
    void authFetch(withFormatJson(`${API}/me/publications/${id}/pages/${currentPage}`), undefined, 'load publication preview')
      .then(async res => await responseToPngBlob(res, 'Preview failed', true))
      .then(blob => {
        if (!live) return
        setImageUrl(URL.createObjectURL(blob))
        setMessage('')
        postSignal('author.preview_loaded', usercomMetadata({ surface: 'author_preview', tags: ['author'], context: { publicationId: id, pageNumber: currentPage } }))
      })
      .catch(err => {
        if (!live) return
        const nextMessage = friendlyErrorMessage(err, 'Unable to load preview')
        setMessage(nextMessage)
        postSignal('author.preview_failed', usercomMetadata({ surface: 'author_preview', tags: ['error'], context: { publicationId: id, pageNumber: currentPage, message: nextMessage } }))
      })
    return () => { live = false }
  }, [id, currentPage])

  return (
    <section className='reader'>
      <div className='reader-toolbar'>
        <Link className='button secondary' to={backPath}>{isAdminPreview ? 'Back to admin' : 'Back to author'}</Link>
        <button type='button' onClick={() => navigate(`${previewBase}/${id}/${Math.max(1, currentPage - 1)}`)}>Previous</button>
        <span>Preview page {currentPage}</span>
        <button type='button' onClick={() => navigate(`${previewBase}/${id}/${currentPage + 1}`)}>Next</button>
      </div>
      {message !== '' && !isWalletHelpMessage(message) && <p className='empty'>{message}</p>}
      <WalletHelp message={message} />
      {imageUrl != null && <img className='page-image' src={imageUrl} alt={`Preview page ${currentPage}`} />}
    </section>
  )
}

function Setup ({ status, refresh }: { status: Status | null, refresh: () => Promise<void> }): JSX.Element {
  const currentAppearance = appearanceFromStatus(status)
  const [form, setForm] = useState({
    pricePerPageSats: status?.pricePerPageSats ?? 25,
    commissionBps: status?.commissionBps ?? 1000,
    displayUnit: status?.displayUnit ?? 'sats',
    walletStorageUrl: status?.walletStorageUrl ?? 'https://storage.babbage.systems',
    mode: status?.mode ?? 'private_publish',
    serverPrivateKey: '',
    appearance: {
      serverName: currentAppearance.serverName,
      newsstandLabel: currentAppearance.newsstandLabel,
      tagline: currentAppearance.tagline
    }
  })
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (status != null) {
      setForm(f => ({
        ...f,
        pricePerPageSats: status.pricePerPageSats,
        commissionBps: status.commissionBps,
        displayUnit: status.displayUnit,
        mode: status.mode,
        walletStorageUrl: status.walletStorageUrl,
        appearance: {
          ...f.appearance,
          serverName: status.appearance.serverName,
          newsstandLabel: status.appearance.newsstandLabel,
          tagline: status.appearance.tagline
        }
      }))
    }
  }, [status])
  const submit = async (): Promise<void> => {
    const res = await authFetch(`${API}/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form)
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Setup failed')
    await refresh()
    setMessage('Setup saved.')
    postSignal('setup.saved', usercomMetadata({ surface: 'setup', tags: [`mode:${form.mode}`], context: { mode: form.mode, displayUnit: form.displayUnit, pricePerPageSats: form.pricePerPageSats } }))
  }
  return (
    <section className='surface setup-flow'>
      <header className='page-head'>
        <div>
          <h1>Server setup</h1>
          <p>{status?.setupComplete === true ? 'Review and update how this PaperTrade server operates.' : 'Configure publishing, payments, and wallet storage before the first publication.'}</p>
        </div>
      </header>
      <div className='wizard-grid'>
        <section className='tool-panel'>
          <span className='step-label'>1 Publishing</span>
          <div className='choice-grid'>
            <button className={form.mode === 'private_publish' ? 'choice selected' : 'choice'} type='button' onClick={() => setForm({ ...form, mode: 'private_publish' })}>
              <strong>Private server</strong>
              <span>Only admins can create and publish works.</span>
            </button>
            <button className={form.mode === 'public_submissions' ? 'choice selected' : 'choice'} type='button' onClick={() => setForm({ ...form, mode: 'public_submissions' })}>
              <strong>Public submissions</strong>
              <span>Any authenticated author can submit for admin review.</span>
            </button>
          </div>
        </section>
        <section className='tool-panel'>
          <span className='step-label'>2 Payments</span>
          <label>Price per paid page, charged in sats <input type='number' min='0' value={form.pricePerPageSats} onChange={e => setForm({ ...form, pricePerPageSats: Number(e.target.value) })} /></label>
          <label>Payment display unit for labels
            <select value={form.displayUnit} onChange={e => setForm({ ...form, displayUnit: e.target.value as 'sats' | 'usd_cents' })}>
              <option value='sats'>Satoshis</option>
              <option value='usd_cents'>USD cents</option>
            </select>
          </label>
          <label>Platform commission <input type='number' min='0' max='10000' value={form.commissionBps} onChange={e => setForm({ ...form, commissionBps: Number(e.target.value) })} /></label>
          <p className='hint'>{form.commissionBps / 100}% platform share. Reader payments are still settled in BSV.</p>
        </section>
        <section className='tool-panel'>
          <span className='step-label'>3 Identity</span>
          <label>Server name <input value={form.appearance.serverName} onChange={e => setForm({ ...form, appearance: { ...form.appearance, serverName: e.target.value } })} /></label>
          <label>Reader section label <input value={form.appearance.newsstandLabel} onChange={e => setForm({ ...form, appearance: { ...form.appearance, newsstandLabel: e.target.value } })} /></label>
          <label>Reader tagline <input value={form.appearance.tagline} onChange={e => setForm({ ...form, appearance: { ...form.appearance, tagline: e.target.value } })} /></label>
        </section>
        <section className='tool-panel'>
          <span className='step-label'>4 Wallet</span>
          <label>Wallet Storage URL <input value={form.walletStorageUrl} onChange={e => setForm({ ...form, walletStorageUrl: e.target.value })} /></label>
          <label>Server private key <input value={form.serverPrivateKey} onChange={e => setForm({ ...form, serverPrivateKey: e.target.value })} placeholder='Optional replacement key' /></label>
          <p className='hint'>The first BRC100 identity to save setup becomes an admin.</p>
        </section>
      </div>
      <button className='button primary-action' type='button' onClick={() => { void submit().catch(err => setMessage(err.message)) }}><Check size={18} /> Save setup</button>
      {message !== '' && !isWalletHelpMessage(message) && <p className='notice'>{message}</p>}
      <WalletHelp message={message} />
    </section>
  )
}

function Author ({ status }: { status: Status | null }): JSX.Element {
  const [profile, setProfile] = useState({ displayName: '', bio: '', displayUnit: 'server_default' })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [publications, setPublications] = useState<any[]>([])
  const [balanceSats, setBalanceSats] = useState(0)
  const [payouts, setPayouts] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [payoutBusy, setPayoutBusy] = useState(false)
  const [showPayoutSupport, setShowPayoutSupport] = useState(false)
  const load = async (): Promise<void> => {
    const [profileRes, publicationsRes, ledgerRes] = await Promise.all([
      authFetch(`${API}/me/profile`, undefined, 'load your author profile'),
      authFetch(`${API}/me/publications`, undefined, 'load your publications'),
      authFetch(`${API}/me/ledger`, undefined, 'load your author ledger')
    ])
    const profileJson: { profile?: AuthorProfile, canPublish?: boolean, message?: string } = await profileRes.json()
    const publicationsJson = await publicationsRes.json()
    const ledgerJson = await ledgerRes.json()
    if (!profileRes.ok) throw new Error(profileJson.message ?? 'Could not load profile')
    if (!publicationsRes.ok) throw new Error(publicationsJson.message ?? 'Could not load publications')
    if (!ledgerRes.ok) throw new Error(ledgerJson.message ?? 'Could not load author ledger')
    const loaded = profileJson.profile
    setProfile({
      displayName: loaded?.display_name ?? '',
      bio: loaded?.bio ?? '',
      displayUnit: loaded?.display_unit ?? 'server_default'
    })
    setAvatarUrl(loaded?.avatar_url ?? null)
    setCanPublish(Boolean(publicationsJson.canPublish ?? profileJson.canPublish))
    setPublications(publicationsJson.publications ?? [])
    setBalanceSats(Number(ledgerJson.balanceSats ?? 0))
    setPayouts(ledgerJson.payouts ?? [])
  }
  useEffect(() => { void load().catch(err => setMessage(friendlyErrorMessage(err, 'Could not load author workspace'))) }, [])
  const save = async (): Promise<void> => {
    const res = await authFetch(`${API}/me/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: profile.displayName,
        bio: profile.bio,
        displayUnit: profile.displayUnit
      })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not save profile')
    if (avatarFile != null) {
      const avatarRes = await uploadJsonFile(`${API}/me/profile/avatar`, avatarFile)
      const avatarJson = await avatarRes.json()
      if (!avatarRes.ok) throw new Error(avatarJson.message ?? 'Could not save avatar')
      setAvatarUrl(avatarJson.avatarUrl)
      setAvatarFile(null)
    }
    await load()
    setMessage('Profile saved.')
    postSignal('author.profile_saved', usercomMetadata({ surface: 'author', tags: ['author'], context: { hasAvatar: avatarUrl != null || avatarFile != null, displayUnit: profile.displayUnit } }))
  }
  const createAndUpload = async (): Promise<void> => {
    const create = await authFetch(`${API}/me/publications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description })
    })
    const created: { publicationId?: string, message?: string } = await create.json()
    if (!create.ok || created.publicationId == null) throw new Error(created.message ?? 'Could not create publication')
    if (selectedFile != null) {
      const upload = await uploadJsonFile(`${API}/me/publications/${created.publicationId}/files`, selectedFile)
      const uploaded = await upload.json()
      if (!upload.ok) throw new Error(uploaded.message ?? 'Could not process file')
      const submit = await authFetch(`${API}/me/publications/${created.publicationId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      })
      const submitted = await submit.json()
      if (!submit.ok) throw new Error(submitted.message ?? 'Could not submit publication')
      setMessage(submitted.statusValue === 'published' ? 'Publication uploaded and published.' : 'Publication uploaded and submitted for review.')
      postSignal('author.publication_uploaded', usercomMetadata({ surface: 'author', tags: [`status:${String(submitted.statusValue ?? 'draft')}`], context: { publicationId: created.publicationId } }))
    } else {
      setMessage('Draft created. Add a file before submitting.')
      postSignal('author.publication_created', usercomMetadata({ surface: 'author', tags: ['draft'], context: { publicationId: created.publicationId } }))
    }
    setTitle('')
    setDescription('')
    setSelectedFile(null)
    await load()
  }
  const updatePublication = async (pub: any): Promise<void> => {
    const res = await authFetch(`${API}/me/publications/${String(pub.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: pub.title, description: pub.description })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not update publication')
    await load()
    setMessage('Publication updated.')
    postSignal('author.publication_updated', usercomMetadata({ surface: 'author', tags: ['author'], context: { publicationId: String(pub.id) } }))
  }
  const unpublishPublication = async (id: string): Promise<void> => {
    const res = await authFetch(`${API}/me/publications/${id}/unpublish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not unpublish publication')
    await load()
    setMessage('Publication unpublished.')
    postSignal('author.publication_unpublished', usercomMetadata({ surface: 'author', tags: ['author'], context: { publicationId: id } }))
  }
  const deletePublication = async (id: string): Promise<void> => {
    const res = await authFetch(`${API}/me/publications/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not delete publication')
    await load()
    setMessage('Publication deleted.')
    postSignal('author.publication_deleted', usercomMetadata({ surface: 'author', tags: ['author'], context: { publicationId: id } }))
  }
  const requestPayout = async (): Promise<void> => {
    setPayoutBusy(true)
    setShowPayoutSupport(false)
    try {
      const res = await authFetch(`${API}/me/payouts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountSats: balanceSats })
      })
      const json: { payout?: AuthorPayoutPayload, message?: string } = await res.json()
      if (!res.ok || json.payout == null) throw new Error(json.message ?? 'Could not create payout')

      const payout = json.payout
      const wallet = getWallet()
      try {
        const result = await withWalletTelemetryContext(
          { method: 'POST', url: `/api/me/payouts/${payout.payoutId}/internalize`, action: 'receive your payout' },
          async () => (wallet as any).internalizeAction({
            tx: Utils.toArray(payout.txBase64, 'base64'),
            outputs: [{
              outputIndex: payout.outputIndex,
              protocol: 'wallet payment',
              paymentRemittance: {
                derivationPrefix: payout.derivationPrefix,
                derivationSuffix: payout.derivationSuffix,
                senderIdentityKey: payout.serverIdentityKey
              }
            }],
            description: 'PaperTrade author payout',
            labels: ['papertrade-payout']
          }, WALLET_ORIGINATOR)
        )
        if (result?.accepted !== true) throw new Error('Wallet did not accept the payout')

        const ack = await authFetch(`${API}/me/payouts/${payout.payoutId}/ack`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accepted: true })
        })
        const ackJson = await ack.json()
        if (!ack.ok) throw new Error(ackJson.message ?? 'Payout was received, but the server did not record the acknowledgement')
        await load()
        setMessage('Payout received by your BRC100 wallet.')
        postSignal('author.payout_internalized', usercomMetadata({ surface: 'author-payout', tags: ['success'], context: { amountSats: payout.amountSats, payoutId: payout.payoutId } }))
      } catch (err) {
        const failureReason = err instanceof Error ? err.message : 'Wallet did not acknowledge the payout'
        await authFetch(`${API}/me/payouts/${payout.payoutId}/ack`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accepted: false, failureReason })
        }).catch(() => undefined)
        await load().catch(() => undefined)
        setShowPayoutSupport(true)
        setMessage(`Payout is ready but your wallet did not confirm receiving it: ${failureReason}. Retry payout from this panel.`)
        postSignal('author.payout_internalize_failed', usercomMetadata({ surface: 'author-payout', tags: ['wallet_failed'], context: { amountSats: payout.amountSats, payoutId: payout.payoutId, failureReason } }))
      }
    } finally {
      setPayoutBusy(false)
    }
  }
  const pendingPayout = payouts.find(payout => payout.status === 'pending_internalize' && payout.tx != null)
  return (
    <section className='surface'>
      <header className='page-head'>
        <div>
          <h1>Author</h1>
          <p>Profile and publications are tied to your BRC100 identity key.</p>
        </div>
      </header>
      <div className='admin-grid'>
        <section className='tool-panel'>
          <h2>Profile</h2>
          <div className='avatar-row'>
            {avatarUrl != null && <img src={avatarUrl} alt='' />}
            <label>Avatar image <input type='file' accept='image/png,image/jpeg,image/webp,image/gif' onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} /></label>
          </div>
          <label>Display name <input value={profile.displayName} onChange={e => setProfile({ ...profile, displayName: e.target.value })} /></label>
          <label>Bio <textarea value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></label>
          <label>Payment display unit
            <select value={profile.displayUnit} onChange={e => setProfile({ ...profile, displayUnit: e.target.value })}>
              <option value='server_default'>Use server default ({paymentUnitLabel(status?.displayUnit ?? 'sats')})</option>
              <option value='sats'>Satoshis</option>
              <option value='usd_cents'>USD cents</option>
            </select>
          </label>
          <button className='button' type='button' onClick={() => { void save().catch(err => setMessage(err.message)) }}><Check size={18} /> Save profile</button>
        </section>
        <section className='tool-panel'>
          <h2>New work</h2>
          {!canPublish && <p className='empty'>This server is private. Only admins can create publications right now.</p>}
          <form onSubmit={e => { e.preventDefault(); void createAndUpload().catch(err => setMessage(err.message)) }}>
            <label>Title <input disabled={!canPublish} value={title} onChange={e => setTitle(e.target.value)} /></label>
            <label>Description <textarea disabled={!canPublish} value={description} onChange={e => setDescription(e.target.value)} /></label>
            <label>PDF, docx, or ePub <input disabled={!canPublish} type='file' accept='.pdf,.docx,.epub' onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} /></label>
            <button className='button' disabled={!canPublish} type='submit'><Upload size={18} /> Upload work</button>
          </form>
        </section>
      </div>
      {message !== '' && !isWalletHelpMessage(message) && <p className='notice'>{message}</p>}
      <WalletHelp message={message} />
      <section className='tool-panel publication-list'>
        <h2>Your publications</h2>
        {publications.map(pub => (
          <div className='publication-editor' key={pub.id}>
            <label>Title <input value={pub.title ?? ''} onChange={e => setPublications(items => items.map(item => item.id === pub.id ? { ...item, title: e.target.value } : item))} /></label>
            <label>Description <textarea value={pub.description ?? ''} onChange={e => setPublications(items => items.map(item => item.id === pub.id ? { ...item, description: e.target.value } : item))} /></label>
            <div className='row'>
              <span>{pub.status} · {pub.page_count} pages</span>
              {Number(pub.page_count) > 0 && <Link className='button secondary' to={`/author/read/${String(pub.id)}/1`}>Preview</Link>}
              <button type='button' onClick={() => { void updatePublication(pub).catch(err => setMessage(err.message)) }}>Save</button>
              {pub.status === 'published' && <button type='button' onClick={() => { void unpublishPublication(pub.id).catch(err => setMessage(err.message)) }}>Unpublish</button>}
              <button type='button' className='danger' onClick={() => { void deletePublication(pub.id).catch(err => setMessage(err.message)) }}>Delete</button>
            </div>
          </div>
        ))}
        {publications.length === 0 && <p className='empty'>No drafts or publications yet.</p>}
      </section>
      <section className='tool-panel publication-list'>
        <h2>Payouts</h2>
        <p>Your payable author balance is {balanceSats} sats. Pay it directly into the BRC100 wallet you are using now.</p>
        <div className='payout-actions'>
          <button className='button primary-action' disabled={payoutBusy || (balanceSats <= 0 && pendingPayout == null)} type='button' onClick={() => { void requestPayout().catch(err => { setShowPayoutSupport(true); setMessage(err.message) }) }}>
            {pendingPayout != null ? <RefreshCw size={18} /> : <Check size={18} />}
            {pendingPayout != null ? 'Retry wallet receipt' : `Pay out ${balanceSats} sats`}
          </button>
          <button className='button secondary' type='button' onClick={() => setShowPayoutSupport(value => !value)}>
            <MessageCircle size={18} /> Payout support
          </button>
        </div>
        <p className='hint'>PaperTrade creates a BRC29 wallet payment to your identity key. Your PaperTrade balance is reduced only after your wallet confirms receipt.</p>
        {payouts.map(payout => (
          <div className='row' key={payout.id}>
            <span>{payout.amount_sats} sats</span>
            <span>{payout.status}</span>
            <span>{payout.destination_type}</span>
            {payout.failure_reason != null && payout.failure_reason !== '' && <span>{payout.failure_reason}</span>}
          </div>
        ))}
        {payouts.length === 0 && <p className='empty'>No payouts recorded yet.</p>}
        {showPayoutSupport && <FeedbackPanel surface='author-payout' />}
      </section>
    </section>
  )
}

function Admin ({ status, refreshStatus }: { status: Status | null, refreshStatus: () => Promise<void> }): JSX.Element {
  const [activeTab, setActiveTab] = useState<'review' | 'appearance' | 'wallet' | 'admins' | 'payouts' | 'telemetry'>('review')
  const [message, setMessage] = useState('')
  const [publications, setPublications] = useState<AdminPublication[]>([])
  const [authorBalances, setAuthorBalances] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [telemetry, setTelemetry] = useState<ClientEvent[]>([])
  const [telemetrySummary, setTelemetrySummary] = useState<Array<{ event_name: string, severity: string, count: number }>>([])
  const [appearance, setAppearance] = useState<Appearance>(appearanceFromStatus(status))
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    mode: status?.mode ?? 'private_publish',
    pricePerPageSats: status?.pricePerPageSats ?? 25,
    commissionBps: status?.commissionBps ?? 1000,
    displayUnit: status?.displayUnit ?? 'sats',
    walletStorageUrl: status?.walletStorageUrl ?? 'https://storage.babbage.systems'
  })
  const [newAdminKey, setNewAdminKey] = useState('')
  const [serverWallet, setServerWallet] = useState<ServerWallet | null>(null)
  const [fundAmountSats, setFundAmountSats] = useState(1000)
  const [payoutForm, setPayoutForm] = useState({
    authorIdentityKey: '',
    amountSats: 0,
    destinationType: 'legacy_address',
    destination: ''
  })
  const refresh = async (): Promise<void> => {
    const [pubRes, ledgerRes, paymentRes, settingsRes, walletRes] = await Promise.all([
      authFetch(`${API}/admin/publications`, undefined, 'load publication review'),
      authFetch(`${API}/admin/ledger`, undefined, 'load the ledger'),
      authFetch(`${API}/admin/payments`, undefined, 'load payments'),
      authFetch(`${API}/admin/settings`, undefined, 'load admin settings'),
      authFetch(`${API}/admin/wallet`, undefined, 'load the server wallet')
    ])
    const pubJson = await pubRes.json()
    const ledgerJson = await ledgerRes.json()
    const paymentJson = await paymentRes.json()
    const settingsJson = await settingsRes.json()
    const walletJson = await walletRes.json()
    if (!pubRes.ok) throw new Error(pubJson.message ?? 'Could not load publication review')
    if (!ledgerRes.ok) throw new Error(ledgerJson.message ?? 'Could not load ledger')
    if (!paymentRes.ok) throw new Error(paymentJson.message ?? 'Could not load payments')
    if (!settingsRes.ok) throw new Error(settingsJson.message ?? 'Could not load admin list')
    if (!walletRes.ok) throw new Error(walletJson.message ?? 'Could not load server wallet')
    setPublications(pubJson.publications ?? [])
    setAuthorBalances(ledgerJson.authorBalances ?? [])
    setPayouts(paymentJson.payouts ?? [])
    setAdmins(settingsJson.admins ?? [])
    const loadedSettings = settingsJson.settings ?? {}
    setAdminSettings({
      mode: loadedSettings.mode ?? 'private_publish',
      pricePerPageSats: Number(loadedSettings.price_per_page_sats ?? 25),
      commissionBps: Number(loadedSettings.commission_bps ?? 1000),
      displayUnit: loadedSettings.display_unit ?? 'sats',
      walletStorageUrl: loadedSettings.wallet_storage_url ?? 'https://storage.babbage.systems'
    })
    setAppearance({
      ...DEFAULT_APPEARANCE,
      ...(settingsJson.appearance ?? {}),
      theme: {
        ...DEFAULT_APPEARANCE.theme,
        ...(settingsJson.appearance?.theme ?? {})
      }
    })
    setServerWallet({ serverPublicKey: walletJson.serverPublicKey, balanceSats: Number(walletJson.balanceSats ?? 0) })
  }
  const loadTelemetry = async (): Promise<void> => {
    const res = await authFetch(`${API}/admin/telemetry`, undefined, 'load diagnostics')
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not load diagnostics')
    setTelemetry(json.events ?? [])
    setTelemetrySummary(json.summary ?? [])
  }
  useEffect(() => { void refresh().catch(err => setMessage(friendlyErrorMessage(err, 'Could not load admin workspace'))) }, [])
  useEffect(() => {
    if (activeTab === 'telemetry') void loadTelemetry().catch(err => setMessage(friendlyErrorMessage(err, 'Could not load diagnostics')))
  }, [activeTab])
  useEffect(() => {
    if (status == null) return
    setAppearance(appearanceFromStatus(status))
    setAdminSettings({
      mode: status.mode,
      pricePerPageSats: status.pricePerPageSats,
      commissionBps: status.commissionBps,
      displayUnit: status.displayUnit,
      walletStorageUrl: status.walletStorageUrl
    })
  }, [status])
  const saveAppearance = async (): Promise<void> => {
    const res = await authFetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: adminSettings.mode,
        pricePerPageSats: adminSettings.pricePerPageSats,
        commissionBps: adminSettings.commissionBps,
        displayUnit: adminSettings.displayUnit,
        walletStorageUrl: adminSettings.walletStorageUrl,
        appearance
      })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message ?? 'Could not save appearance')
    await Promise.all([refresh(), refreshStatus()])
    setMessage('Appearance preferences saved.')
    postSignal('admin.appearance_saved', usercomMetadata({ surface: 'admin-appearance', tags: ['appearance'], context: { serverName: appearance.serverName, newsstandLabel: appearance.newsstandLabel } }))
  }
  const uploadAppearanceAsset = async (kind: 'logo' | 'icon' | 'og_image', file: File): Promise<void> => {
    const res = await uploadJsonFile(`${API}/admin/appearance/assets`, file, { kind })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || typeof json.url !== 'string') throw new Error(json.message ?? 'Could not upload appearance image')
    const field = kind === 'logo' ? 'logoUrl' : kind === 'icon' ? 'iconUrl' : 'ogImageUrl'
    setAppearance(current => ({ ...current, [field]: json.url }))
    setMessage('Image uploaded. Save appearance to publish it.')
  }
  const review = async (id: string, action: 'publish' | 'reject' | 'unpublish' | 'return_to_review'): Promise<void> => {
    const res = await authFetch(`${API}/admin/publications/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message ?? 'Review failed')
    await refresh()
    const labels: Record<string, string> = {
      publish: 'Publication published.',
      reject: 'Publication rejected and deleted.',
      unpublish: 'Publication unpublished.',
      return_to_review: 'Publication returned to review.'
    }
    setMessage(labels[action])
    postSignal('admin.publication_reviewed', usercomMetadata({ surface: 'admin', tags: [`action:${action}`], context: { publicationId: id } }))
  }
  const addAdmin = async (): Promise<void> => {
    const identityKey = newAdminKey.trim()
    if (identityKey === '') throw new Error('Enter an identity key to add an admin.')
    const res = await authFetch(`${API}/admin/admins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityKey })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message ?? 'Could not add admin')
    setNewAdminKey('')
    await refresh()
    setMessage('Admin added.')
  }
  const removeAdmin = async (identityKey: string): Promise<void> => {
    const res = await authFetch(`${API}/admin/admins/${encodeURIComponent(identityKey)}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message ?? 'Could not remove admin')
    await refresh()
    setMessage('Admin removed.')
  }
  const fundServer = async (): Promise<void> => {
    if (fundAmountSats <= 0) throw new Error('Enter a funding amount greater than zero.')
    const res = await authFetch(`${API}/admin/funding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountSats: fundAmountSats })
    }, 'fund the server wallet')
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message ?? 'Could not fund server wallet')
    await refresh()
    setMessage(`Server wallet funded with ${fundAmountSats} sats.`)
  }
  const createPayout = async (): Promise<void> => {
    const res = await authFetch(`${API}/admin/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payoutForm)
    })
    const json: { message?: string, payoutStatus?: string, failureReason?: string | null } = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not create payout')
    await refresh()
    const payoutStatus = json.payoutStatus ?? 'created'
    setMessage(payoutStatus === 'failed' ? `Payout failed: ${json.failureReason ?? 'unknown error'}` : `Payout ${payoutStatus}.`)
    postSignal('admin.payout_created', usercomMetadata({ surface: 'admin', tags: [`status:${payoutStatus}`], context: { authorIdentityKey: payoutForm.authorIdentityKey, amountSats: payoutForm.amountSats, destinationType: payoutForm.destinationType } }))
  }
  const reviewCount = publications.filter(pub => pub.status === 'submitted' || pub.status === 'draft').length
  return (
    <section className='surface'>
      <header className='page-head'>
        <div>
          <h1>Admin</h1>
          <p>Review publications, tune the public experience, and manage server operations.</p>
        </div>
        <Link className='button secondary' to='/setup'>Server setup</Link>
      </header>
      <div className='admin-tabs' role='tablist' aria-label='Admin sections'>
        <button className={activeTab === 'review' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('review')}><FileText size={18} /> Review <span>{reviewCount}</span></button>
        <button className={activeTab === 'appearance' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('appearance')}><Palette size={18} /> Appearance</button>
        <button className={activeTab === 'wallet' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('wallet')}><Library size={18} /> Wallet</button>
        <button className={activeTab === 'admins' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('admins')}><User size={18} /> Admins</button>
        <button className={activeTab === 'payouts' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('payouts')}><Check size={18} /> Payouts</button>
        <button className={activeTab === 'telemetry' ? 'tab active' : 'tab'} type='button' onClick={() => setActiveTab('telemetry')}><Activity size={18} /> Diagnostics</button>
      </div>
      {activeTab === 'review' && (
        <section className='tool-panel'>
          <h2>Publication review</h2>
          {publications.map(pub => (
            <article className='review-card' key={pub.id}>
              <div className='review-main'>
                <div>
                  <span className={`status-pill status-${pub.status}`}>{pub.status}</span>
                  <h3>{pub.title}</h3>
                  <p>{pub.description ?? 'No description provided.'}</p>
                </div>
                <div className='review-meta'>
                  <IdentityPill identityKey={pub.author_identity_key} label={pub.display_name} />
                  <span>{Number(pub.page_count ?? 0)} pages</span>
                </div>
              </div>
              <div className='review-actions'>
                {Number(pub.page_count ?? 0) > 0 && <Link className='button secondary' to={`/admin/read/${String(pub.id)}/1`}>Preview</Link>}
                {pub.status === 'published'
                  ? (
                    <>
                      <button type='button' onClick={() => { void review(pub.id, 'unpublish').catch(err => setMessage(err.message)) }}>Unpublish</button>
                      <button type='button' className='secondary' onClick={() => { void review(pub.id, 'return_to_review').catch(err => setMessage(err.message)) }}>Return to review</button>
                    </>
                    )
                  : (
                    <>
                      <button type='button' disabled={Number(pub.page_count ?? 0) < 5} onClick={() => { void review(pub.id, 'publish').catch(err => setMessage(err.message)) }}>Publish</button>
                      <button type='button' className='danger' onClick={() => { void review(pub.id, 'reject').catch(err => setMessage(err.message)) }}>Reject and delete</button>
                    </>
                    )}
              </div>
            </article>
          ))}
          {publications.length === 0 && <p className='empty'>No publications to review yet.</p>}
        </section>
      )}
      {activeTab === 'appearance' && (
        <section className='tool-panel appearance-workspace'>
          <div className='appearance-form'>
            <div>
              <h2>Appearance preferences</h2>
              <p className='hint'>These settings change the server name, public labels, install manifest, link previews, and the theme everyone sees.</p>
            </div>
            <div className='form-grid two'>
              <label>Server name <input value={appearance.serverName} onChange={e => setAppearance({ ...appearance, serverName: e.target.value })} /></label>
              <label>{appearance.newsstandLabel} label <input value={appearance.newsstandLabel} onChange={e => setAppearance({ ...appearance, newsstandLabel: e.target.value })} /></label>
            </div>
            <label>Reader tagline <input value={appearance.tagline} onChange={e => setAppearance({ ...appearance, tagline: e.target.value })} /></label>
            <label>Meta title <input value={appearance.metaTitle} onChange={e => setAppearance({ ...appearance, metaTitle: e.target.value })} /></label>
            <label>Meta description <textarea value={appearance.metaDescription} onChange={e => setAppearance({ ...appearance, metaDescription: e.target.value })} /></label>
            <div className='theme-grid'>
              {([
                ['primary', 'Primary'],
                ['accent', 'Accent'],
                ['background', 'Background'],
                ['surface', 'Surface'],
                ['text', 'Text'],
                ['muted', 'Muted'],
                ['border', 'Border']
              ] as Array<[keyof Appearance['theme'], string]>).map(([key, label]) => (
                <label className='color-field' key={key}>
                  <span>{label}</span>
                  <input type='color' value={appearance.theme[key]} onChange={e => setAppearance({ ...appearance, theme: { ...appearance.theme, [key]: e.target.value } })} />
                  <input value={appearance.theme[key]} onChange={e => setAppearance({ ...appearance, theme: { ...appearance.theme, [key]: e.target.value } })} />
                </label>
              ))}
            </div>
            <div className='asset-grid'>
              <label><Image size={18} /> Logo <input type='file' accept='image/png,image/jpeg,image/webp,image/gif' onChange={e => { const file = e.target.files?.[0]; if (file != null) void uploadAppearanceAsset('logo', file).catch(err => setMessage(err.message)) }} /></label>
              <label><Image size={18} /> App icon <input type='file' accept='image/png,image/jpeg,image/webp,image/gif' onChange={e => { const file = e.target.files?.[0]; if (file != null) void uploadAppearanceAsset('icon', file).catch(err => setMessage(err.message)) }} /></label>
              <label><Image size={18} /> Share image <input type='file' accept='image/png,image/jpeg,image/webp,image/gif' onChange={e => { const file = e.target.files?.[0]; if (file != null) void uploadAppearanceAsset('og_image', file).catch(err => setMessage(err.message)) }} /></label>
            </div>
            <button className='button primary-action' type='button' onClick={() => { void saveAppearance().catch(err => setMessage(err.message)) }}><Check size={18} /> Save appearance</button>
          </div>
          <aside className='appearance-preview' style={appearanceStyle(appearance)}>
            <div className='preview-brand'>
              {appearance.logoUrl != null && appearance.logoUrl !== '' ? <img src={appearance.logoUrl} alt='' /> : <Library size={26} />}
              <strong>{appearance.serverName}</strong>
            </div>
            <span className='step-label'>{appearance.newsstandLabel}</span>
            <h2>{appearance.metaTitle}</h2>
            <p>{appearance.tagline}</p>
            <div className='preview-card'>
              <span>Primary action</span>
              <button type='button'>Open</button>
            </div>
          </aside>
        </section>
      )}
      {activeTab === 'wallet' && (
        <section className='tool-panel publication-list'>
          <h2>Server wallet</h2>
          <div className='wallet-summary'>
            <div>
              <span className='hint'>Spendable balance</span>
              <strong>{serverWallet?.balanceSats ?? 0} sats</strong>
            </div>
            <IdentityPill identityKey={serverWallet?.serverPublicKey} label='PaperTrade server' />
          </div>
          <form className='inline-form' onSubmit={e => { e.preventDefault(); void fundServer().catch(err => setMessage(friendlyErrorMessage(err, 'Could not fund server wallet'))) }}>
            <label>Amount in sats <input type='number' min='1' value={fundAmountSats} onChange={e => setFundAmountSats(Number(e.target.value))} /></label>
            <button className='button primary-action' type='submit'>Fund server wallet</button>
          </form>
          <p className='hint'>Funding uses the admin wallet you are using now. This gives the server wallet enough BSV to pay author withdrawals and cover fees.</p>
        </section>
      )}
      {activeTab === 'admins' && (
        <section className='tool-panel publication-list'>
          <h2>Admins</h2>
          <form className='inline-form' onSubmit={e => { e.preventDefault(); void addAdmin().catch(err => setMessage(err.message)) }}>
            <label>Identity key <input value={newAdminKey} onChange={e => setNewAdminKey(e.target.value)} placeholder='Admin identity key' /></label>
            <button className='button primary-action' type='submit'>Add admin</button>
          </form>
          <div className='admin-list'>
            {admins.map(admin => (
              <div className='admin-list-row' key={admin.identity_key}>
                <IdentityPill identityKey={admin.identity_key} />
                <button type='button' className='danger' disabled={admins.length <= 1} onClick={() => { void removeAdmin(admin.identity_key).catch(err => setMessage(err.message)) }}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {activeTab === 'payouts' && (
        <section className='tool-panel publication-list'>
          <h2>Payouts</h2>
          <p className='hint'>Select an author balance to fill the payout form. Failed payouts remain in history and do not reduce the author balance.</p>
          <div className='admin-grid compact'>
            <form onSubmit={e => { e.preventDefault(); void createPayout().catch(err => setMessage(err.message)) }}>
              <label>Author identity key <input value={payoutForm.authorIdentityKey} onChange={e => setPayoutForm({ ...payoutForm, authorIdentityKey: e.target.value })} /></label>
              <label>Amount in sats <input type='number' min='0' value={payoutForm.amountSats} onChange={e => setPayoutForm({ ...payoutForm, amountSats: Number(e.target.value) })} /></label>
              <label>Destination type
                <select value={payoutForm.destinationType} onChange={e => setPayoutForm({ ...payoutForm, destinationType: e.target.value })}>
                  <option value='legacy_address'>Legacy BSV address</option>
                  <option value='brc100_identity'>BRC100 identity key</option>
                </select>
              </label>
              <label>Destination <input value={payoutForm.destination} onChange={e => setPayoutForm({ ...payoutForm, destination: e.target.value })} /></label>
              <button className='button' type='submit'>Create payout</button>
            </form>
            <div>
              <h2>Author balances</h2>
              {authorBalances.map(balance => (
                <button className='balance-row' type='button' key={balance.account_identity_key} onClick={() => setPayoutForm({ ...payoutForm, authorIdentityKey: balance.account_identity_key, amountSats: Number(balance.balance_sats ?? 0) })}>
                  <IdentityPill identityKey={balance.account_identity_key} />
                  <strong>{Number(balance.balance_sats ?? 0)} sats</strong>
                </button>
              ))}
              {authorBalances.length === 0 && <p className='empty'>No author balances yet.</p>}
            </div>
          </div>
          <h2>Payout history</h2>
          {payouts.map(payout => (
            <div className='row' key={payout.id}>
              <span>{payout.amount_sats} sats</span>
              <span>{payout.status}</span>
              <span>{payout.destination_type}</span>
            </div>
          ))}
          {payouts.length === 0 && <p className='empty'>No payouts have been created yet.</p>}
        </section>
      )}
      {activeTab === 'telemetry' && (
        <section className='tool-panel publication-list'>
          <div className='page-head'>
            <div>
              <h2>Diagnostics</h2>
              <p className='hint'>Recent client events, wallet failures, mobile lifecycle changes, and slow or failed interactions captured by this PaperTrade server.</p>
            </div>
            <button className='button secondary' type='button' onClick={() => { void loadTelemetry().catch(err => setMessage(err.message)) }}><RefreshCw size={18} /> Refresh</button>
          </div>
          <div className='metric-grid'>
            {telemetrySummary.slice(0, 6).map(item => (
              <div className='metric-card' key={`${item.event_name}:${item.severity}`}>
                <strong>{Number(item.count ?? 0)}</strong>
                <span>{item.event_name}</span>
                <small>{item.severity}</small>
              </div>
            ))}
            {telemetrySummary.length === 0 && <p className='empty'>No client diagnostics recorded in the last 24 hours.</p>}
          </div>
          <div className='telemetry-list'>
            {telemetry.map(event => {
              const parsedContext = (() => {
                try {
                  return event.context != null ? JSON.parse(event.context) : {}
                } catch {
                  return {}
                }
              })()
              return (
                <div className={`telemetry-row telemetry-${event.severity}`} key={event.id}>
                  <div>
                    <strong>{event.event_name}</strong>
                    <span>{event.severity} · {event.route ?? event.path ?? 'unknown route'} · {event.received_at ?? ''}</span>
                    <small>session {event.session_id ?? 'unknown'}{event.request_id != null ? ` · request ${event.request_id}` : ''}</small>
                  </div>
                  <pre>{JSON.stringify(parsedContext, null, 2).slice(0, 1200)}</pre>
                </div>
              )
            })}
            {telemetry.length === 0 && <p className='empty'>No diagnostic events yet.</p>}
          </div>
        </section>
      )}
      {message !== '' && !isWalletHelpMessage(message) && <p className='notice'>{message}</p>}
      <WalletHelp message={message} />
    </section>
  )
}

function About ({ status }: { status: Status | null }): JSX.Element {
  const appearance = appearanceFromStatus(status)
  const walletOptions = platformWalletOptions()
  useEffect(() => {
    setClientMeta(`About ${appearance.serverName} | BSV per-page publishing`, appearance.metaDescription)
  }, [appearance.metaDescription, appearance.serverName])
  return (
    <section className='surface about-surface'>
      <header className='page-head about-head'>
        <div>
          <span className='step-label'>Open BSV newsstand</span>
          <h1>{appearance.serverName} lets writing sell one page at a time.</h1>
          <p>{appearance.metaDescription}</p>
        </div>
        <ShareButton title={appearance.serverName} text={appearance.tagline} path='/about' />
      </header>

      <div className='about-grid'>
        <section className='tool-panel about-panel'>
          <BookOpen size={24} />
          <h2>For readers</h2>
          <p>Start at the {appearance.newsstandLabel.toLowerCase()}, read page 1, then continue in a compatible wallet browser when a paid page asks for authentication and payment.</p>
          <Link className='button' to='/'>Open {appearance.newsstandLabel.toLowerCase()}</Link>
        </section>
        <section className='tool-panel about-panel'>
          <User size={24} />
          <h2>For authors</h2>
          <p>Your BRC100 identity key is your account. Create an author profile, upload a PDF, docx, or ePub, preview rendered pages, and manage payouts.</p>
          <Link className='button' to='/author'>Author workspace</Link>
        </section>
        <section className='tool-panel about-panel'>
          <Settings size={24} />
          <h2>For operators</h2>
          <p>Run a private or public-submission PaperTrade server with editorial review, server-wide pricing, commission settings, and audited wallet balances.</p>
          <a className='button secondary' href={PAPERTRADE_GITHUB_URL} target='_blank' rel='noreferrer'><Github size={18} /> Deploy your own</a>
        </section>
      </div>

      <section className='tool-panel publication-list'>
        <h2>Compatible wallets</h2>
        <div className='wallet-options'>
          {walletOptions.map(option => (
            <a className='wallet-option' href={option.href} target='_blank' rel='noreferrer' key={option.label}>
              {option.icon === 'phone' ? <Smartphone size={20} /> : <Monitor size={20} />}
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>

      <section className='tool-panel publication-list'>
        <h2>Server contract</h2>
        <div className='contract-grid'>
          <a href='/manifest.json' target='_blank' rel='noreferrer'>Wallet and PWA manifest</a>
          <a href='/wallet-manifest.json' target='_blank' rel='noreferrer'>Compatibility alias</a>
          <a href='/.well-known/wallet-manifest.json' target='_blank' rel='noreferrer'>Well-known alias</a>
          <a href='/sitemap.xml' target='_blank' rel='noreferrer'>Sitemap</a>
        </div>
        <p className='hint'>{appearance.serverName} is {status?.setupComplete === true ? 'configured' : 'awaiting setup'} and currently runs in {status?.mode === 'public_submissions' ? 'public submission' : 'private publishing'} mode.</p>
      </section>
    </section>
  )
}

function AppRoutes ({ status, refresh }: { status: Status | null, refresh: () => Promise<void> }): JSX.Element {
  const location = useLocation()
  const needsSetup = useMemo(() => status != null && !status.setupComplete, [status])
  return (
    <Shell status={status}>
      <Analytics status={status} />
      {needsSetup && location.pathname !== '/setup' && (
        <div className='setup-banner'><Link to='/setup'>Complete first-run setup</Link></div>
      )}
      <Routes>
        <Route path='/' element={<Newsstand status={status} />} />
        <Route path='/publication/:id' element={<PublicationDetail />} />
        <Route path='/read/:id/:pageNumber' element={<Reader status={status} />} />
        <Route path='/author' element={<Author status={status} />} />
        <Route path='/author/read/:id/:pageNumber' element={<AuthorPreview />} />
        <Route path='/admin' element={<Admin status={status} refreshStatus={refresh} />} />
        <Route path='/admin/read/:id/:pageNumber' element={<AuthorPreview />} />
        <Route path='/setup' element={<Setup status={status} refresh={refresh} />} />
        <Route path='/about' element={<About status={status} />} />
      </Routes>
    </Shell>
  )
}

function App (): JSX.Element {
  const [status, refresh] = useStatus()
  return (
    <BrowserRouter>
      <AppRoutes status={status} refresh={refresh} />
    </BrowserRouter>
  )
}

const root = document.getElementById('root')
if (root == null) throw new Error('Root element not found')
createRoot(root).render(<App />)

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
