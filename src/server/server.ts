/* eslint-disable @typescript-eslint/no-misused-promises */
import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import bodyParser from 'body-parser'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { P2PKH, PublicKey, Random, Utils } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import { db, getSettings, isAdmin, writeAudit } from './db.js'
import { asPositiveInteger, splitCommission } from './money.js'
import { createServerWallet, replacePersistedServerKey } from './wallet.js'
import { getPublicationDir, processPublicationFile } from './content.js'
import { STARTER_AUTHOR_NAME, STARTER_WORKS, starterCoverPath, starterWorkById, type StarterWork, writeStarterPdf } from './starterWorks.js'
import { appManifest, metaForPath, renderHtmlShell, robotsTxt, sitemapXml, walletManifest, type PublicPublicationMeta } from './web.js'

const serverDirname = path.dirname(fileURLToPath(import.meta.url))
const HTTP_PORT = Number(process.env.HTTP_PORT ?? process.env.PORT ?? '3001')
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api'
const DATA_DIR = process.env.DATA_DIR ?? '/data/papertrade'
const upload = multer({ dest: path.join(DATA_DIR, 'tmp'), limits: { fileSize: 250 * 1024 * 1024 } })
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '80mb'
const MAX_JSON_UPLOAD_BYTES = 40 * 1024 * 1024
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const MAX_APPEARANCE_ASSET_BYTES = 3 * 1024 * 1024
const BRC29_PROTOCOL_ID = [2, '3241645161d8'] as const
const AUTHOR_PAYOUT_PENDING_STATUSES = ['creating', 'pending_internalize']
const WALLET_BALANCE_BASKET = '893b7646de0e1c9f741bd6e9169b76a8847ae34adef7bef1e6a285371206d2e8'
const PAGE_ACCESS_TOKEN_TTL_MS = 90 * 1000
const LEGACY_DEFAULT_TAGLINE = 'Read page 1 free. Pay per page after that with a BRC100 wallet.'
const DEFAULT_READER_TAGLINE = 'Start reading free. Continue page by page when you are ready.'
const LEGACY_DEFAULT_META_DESCRIPTION = 'PaperTrade is a BSV newsstand where readers preview page 1 free and pay per page for independent writing with a BRC100 wallet.'
const DEFAULT_META_DESCRIPTION = 'PaperTrade is a reader-first BSV newsstand for independent writing, with free first-page previews and page-by-page access.'

interface AuthenticatedRequest extends Request {
  auth?: { identityKey: string }
  payment?: { satoshisPaid: number, accepted?: boolean, tx?: string }
  requestId?: string
}

interface JsonUploadBody {
  fileName?: unknown
  mimeType?: unknown
  dataBase64?: unknown
}

interface PageAccessTokenPayload {
  publicationId: string
  pageNumber: number
  access: 'reader' | 'manager'
  expiresAt: number
  nonce: string
}

interface AppearanceInput {
  serverName?: unknown
  newsstandLabel?: unknown
  tagline?: unknown
  metaTitle?: unknown
  metaDescription?: unknown
  theme?: {
    primary?: unknown
    accent?: unknown
    background?: unknown
    surface?: unknown
    text?: unknown
    muted?: unknown
    border?: unknown
  }
  logoUrl?: unknown
  iconUrl?: unknown
  ogImageUrl?: unknown
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

interface ClientTelemetryEvent {
  name?: unknown
  severity?: unknown
  anonymousId?: unknown
  sessionId?: unknown
  route?: unknown
  path?: unknown
  referrer?: unknown
  userAgent?: unknown
  platform?: unknown
  connectionType?: unknown
  durationMs?: unknown
  releaseVersion?: unknown
  occurredAt?: unknown
  context?: unknown
}

function identityKeyOf (req: Request): string | undefined {
  const identityKey = (req as AuthenticatedRequest).auth?.identityKey
  return identityKey === 'unknown' ? undefined : identityKey
}

function textField (value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (text === '') return null
  return text.slice(0, maxLength)
}

function eventSeverity (value: unknown): 'info' | 'warn' | 'error' | 'fatal' {
  return value === 'fatal' || value === 'error' || value === 'warn' ? value : 'info'
}

function safeNumber (value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Math.min(Math.round(numeric), 24 * 60 * 60 * 1000)
}

function base64UrlEncode (input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode (value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64')
}

function pageAccessTokenSecret (secret: string): Buffer {
  return /^[0-9a-f]+$/i.test(secret) && secret.length % 2 === 0
    ? Buffer.from(secret, 'hex')
    : Buffer.from(secret, 'utf8')
}

function signPageAccessTokenPayload (secret: string, encodedPayload: string): string {
  return base64UrlEncode(createHmac('sha256', pageAccessTokenSecret(secret)).update(encodedPayload).digest())
}

function createPageAccessToken (secret: string, payload: PageAccessTokenPayload): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  return `${encodedPayload}.${signPageAccessTokenPayload(secret, encodedPayload)}`
}

function verifyPageAccessToken (secret: string, token: string): PageAccessTokenPayload | null {
  const [encodedPayload, encodedSignature, extra] = token.split('.')
  if (encodedPayload == null || encodedPayload === '' || encodedSignature == null || encodedSignature === '' || extra != null) return null

  const expected = Buffer.from(signPageAccessTokenPayload(secret, encodedPayload))
  const actual = Buffer.from(encodedSignature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as Partial<PageAccessTokenPayload>
    if (typeof payload.publicationId !== 'string' || payload.publicationId === '') return null
    if (!Number.isInteger(payload.pageNumber) || Number(payload.pageNumber) < 1) return null
    if (payload.access !== 'reader' && payload.access !== 'manager') return null
    if (!Number.isInteger(payload.expiresAt) || Number(payload.expiresAt) < Date.now()) return null
    if (typeof payload.nonce !== 'string' || payload.nonce === '') return null
    return {
      publicationId: payload.publicationId,
      pageNumber: Number(payload.pageNumber),
      access: payload.access,
      expiresAt: Number(payload.expiresAt),
      nonce: payload.nonce
    }
  } catch {
    return null
  }
}

function safeOccurredAt (value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sanitizeTelemetryContext (value: unknown, depth = 0): unknown {
  if (value == null) return null
  if (depth > 3) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, 800)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeTelemetryContext(item, depth + 1))
  if (typeof value === 'object') {
    const safe: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80)
      const lower = normalizedKey.toLowerCase()
      if (lower.includes('tx') || lower.includes('beef') || lower.includes('password') || lower.includes('secret') || lower.includes('private') || lower.includes('token') || lower.includes('signature')) {
        safe[normalizedKey] = '[redacted]'
      } else {
        safe[normalizedKey] = sanitizeTelemetryContext(raw, depth + 1)
      }
    }
    return safe
  }
  return String(value).slice(0, 200)
}

async function recordClientTelemetry (req: Request, event: ClientTelemetryEvent): Promise<string> {
  const id = randomUUID()
  const context = sanitizeTelemetryContext(event.context ?? {})
  await db('client_events').insert({
    id,
    event_name: textField(event.name, 120) ?? 'client.unknown',
    severity: eventSeverity(event.severity),
    anonymous_id: textField(event.anonymousId, 80),
    session_id: textField(event.sessionId, 80),
    identity_key: identityKeyOf(req) ?? null,
    route: textField(event.route, 260),
    path: textField(event.path, 260),
    referrer: textField(event.referrer, 1024),
    user_agent: textField(event.userAgent, 1024) ?? textField(req.header('user-agent'), 1024),
    platform: textField(event.platform, 80),
    connection_type: textField(event.connectionType, 80),
    duration_ms: safeNumber(event.durationMs),
    release_version: textField(event.releaseVersion, 80),
    request_id: (req as AuthenticatedRequest).requestId ?? null,
    occurred_at: safeOccurredAt(event.occurredAt),
    context: JSON.stringify(context)
  })
  return id
}

function requireAuth (req: Request, res: Response, next: NextFunction): void {
  if (identityKeyOf(req) == null) {
    res.status(401).json({ status: 'error', message: 'BRC100 authentication required' })
    return
  }
  next()
}

async function requireAdmin (req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const identityKey = identityKeyOf(req)
    if (identityKey == null || !(await isAdmin(identityKey))) {
      res.status(403).json({ status: 'error', message: 'Admin access required' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

async function ensureAuthor (identityKey: string, displayName?: string): Promise<void> {
  const existing = await db('authors').where({ identity_key: identityKey }).first()
  if (existing == null) {
    await db('authors').insert({
      identity_key: identityKey,
      display_name: displayName?.trim() !== '' && displayName?.trim() != null ? displayName.trim() : `Author ${identityKey.slice(0, 10)}`
    })
  }
}

function displayUnitFromBody (value: unknown, fallback = 'sats'): 'sats' | 'usd_cents' {
  return value === 'usd_cents' ? 'usd_cents' : fallback === 'usd_cents' ? 'usd_cents' : 'sats'
}

function boundedText (value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (text === '') return fallback
  return text.slice(0, maxLength)
}

function optionalBoundedText (value: unknown, maxLength: number): string | null {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text === '' ? null : text.slice(0, maxLength)
}

function colorFromBody (value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback
}

function urlPathFromBody (value: unknown, fallback: string | null): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') return fallback
  if (text.startsWith('/api/appearance/assets/')) return text.slice(0, 512)
  try {
    const parsed = new URL(text)
    if (parsed.protocol === 'https:') return parsed.toString().slice(0, 512)
  } catch {}
  return fallback
}

function publicTagline (value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text === '' || text === LEGACY_DEFAULT_TAGLINE ? DEFAULT_READER_TAGLINE : text
}

function publicMetaDescription (value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text === '' || text === LEGACY_DEFAULT_META_DESCRIPTION ? DEFAULT_META_DESCRIPTION : text
}

function appearanceFromSettings (settings: any): Record<string, unknown> {
  return {
    serverName: settings.server_name ?? 'PaperTrade',
    newsstandLabel: settings.newsstand_label ?? 'Newsstand',
    tagline: publicTagline(settings.tagline),
    metaTitle: settings.meta_title ?? 'PaperTrade | BSV per-page publishing newsstand',
    metaDescription: publicMetaDescription(settings.meta_description),
    theme: {
      primary: settings.theme_primary ?? '#1f4f46',
      accent: settings.theme_accent ?? '#b2772c',
      background: settings.theme_background ?? '#f7f5ef',
      surface: settings.theme_surface ?? '#ffffff',
      text: settings.theme_text ?? '#20231f',
      muted: settings.theme_muted ?? '#5c6570',
      border: settings.theme_border ?? '#ddd8ca'
    },
    logoUrl: settings.logo_url ?? null,
    iconUrl: settings.icon_url ?? null,
    ogImageUrl: settings.og_image_url ?? null
  }
}

function appearanceUpdateFromBody (input: AppearanceInput, current: any): Record<string, unknown> {
  const theme = input.theme ?? {}
  return {
    server_name: boundedText(input.serverName, current.server_name ?? 'PaperTrade', 120),
    newsstand_label: boundedText(input.newsstandLabel, current.newsstand_label ?? 'Newsstand', 80),
    tagline: boundedText(input.tagline, current.tagline ?? DEFAULT_READER_TAGLINE, 260),
    meta_title: boundedText(input.metaTitle, current.meta_title ?? 'PaperTrade | BSV per-page publishing newsstand', 160),
    meta_description: optionalBoundedText(input.metaDescription, 260) ?? current.meta_description ?? DEFAULT_META_DESCRIPTION,
    theme_primary: colorFromBody(theme.primary, current.theme_primary ?? '#1f4f46'),
    theme_accent: colorFromBody(theme.accent, current.theme_accent ?? '#b2772c'),
    theme_background: colorFromBody(theme.background, current.theme_background ?? '#f7f5ef'),
    theme_surface: colorFromBody(theme.surface, current.theme_surface ?? '#ffffff'),
    theme_text: colorFromBody(theme.text, current.theme_text ?? '#20231f'),
    theme_muted: colorFromBody(theme.muted, current.theme_muted ?? '#5c6570'),
    theme_border: colorFromBody(theme.border, current.theme_border ?? '#ddd8ca'),
    logo_url: urlPathFromBody(input.logoUrl, current.logo_url ?? null),
    icon_url: urlPathFromBody(input.iconUrl, current.icon_url ?? null),
    og_image_url: urlPathFromBody(input.ogImageUrl, current.og_image_url ?? null)
  }
}

function defaultAuthorProfile (identityKey: string): Record<string, unknown> {
  return {
    identity_key: identityKey,
    display_name: `Author ${identityKey.slice(0, 10)}`,
    bio: '',
    avatar_url: null,
    display_unit: null
  }
}

function safeOriginalName (name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._ -]/g, '_').trim()
  return base === '' ? 'upload.bin' : base
}

function safeStarterFileName (name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return `${slug === '' ? 'starter-work' : slug}.pdf`
}

function decodeJsonUpload (body: JsonUploadBody, maxBytes: number): { originalName: string, mimeType: string, bytes: Buffer } {
  const originalName = safeOriginalName(typeof body.fileName === 'string' ? body.fileName : 'upload.bin')
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() !== '' ? body.mimeType.trim() : 'application/octet-stream'
  if (typeof body.dataBase64 !== 'string' || body.dataBase64 === '') {
    throw new Error('dataBase64 is required')
  }
  const bytes = Buffer.from(body.dataBase64, 'base64')
  if (bytes.length === 0) throw new Error('Uploaded file is empty')
  if (bytes.length > maxBytes) throw new Error(`Uploaded file exceeds ${Math.floor(maxBytes / 1024 / 1024)} MB`)
  return { originalName, mimeType, bytes }
}

async function writeTempUpload (uploadBody: { originalName: string, bytes: Buffer }): Promise<string> {
  await fs.mkdir(path.join(DATA_DIR, 'tmp'), { recursive: true })
  const tempPath = path.join(DATA_DIR, 'tmp', `${randomUUID()}-${uploadBody.originalName}`)
  await fs.writeFile(tempPath, uploadBody.bytes)
  return tempPath
}

async function canUseAuthorTools (identityKey: string): Promise<boolean> {
  const settings = await getSettings()
  return settings.mode === 'public_submissions' || await isAdmin(identityKey)
}

async function canManagePublication (identityKey: string, publication: any): Promise<boolean> {
  return publication.author_identity_key === identityKey || await isAdmin(identityKey)
}

async function sendPngResponse (req: Request, res: Response, filePath: string, allowJson = true): Promise<void> {
  const image = await fs.readFile(filePath)
  if (allowJson && req.query.format === 'json') {
    res.json({
      status: 'success',
      mimeType: 'image/png',
      dataBase64: image.toString('base64')
    })
    return
  }
  res.setHeader('Content-Type', 'image/png')
  res.send(image)
}

async function deletePublication (publicationId: string, actor?: string): Promise<void> {
  await db.transaction(async trx => {
    await trx('publications').where({ id: publicationId }).delete()
    await writeAudit('publication_deleted', actor, 'publication', publicationId, undefined, trx)
  })
  await fs.rm(getPublicationDir(publicationId), { recursive: true, force: true })
}

async function hasValidEntitlement (publicationId: string, pageNumber: number, readerIdentityKey?: string): Promise<boolean> {
  if (readerIdentityKey == null) return false
  const row = await db('page_entitlements')
    .where({
      publication_id: publicationId,
      page_number: pageNumber,
      reader_identity_key: readerIdentityKey
    })
    .andWhere('expires_at', '>', db.fn.now())
    .first()
  return row != null
}

async function findAcceptedPaymentEntitlement (publicationId: string, pageNumber: number, readerIdentityKey?: string): Promise<boolean> {
  if (readerIdentityKey == null) return false
  const row = await db('payments')
    .where({
      publication_id: publicationId,
      page_number: pageNumber,
      reader_identity_key: readerIdentityKey,
      status: 'accepted'
    })
    .andWhere('created_at', '>', db.raw('DATE_SUB(NOW(), INTERVAL 30 DAY)'))
    .first()
  return row != null
}

async function hasReadablePageAccess (publicationId: string, pageNumber: number, readerIdentityKey?: string): Promise<boolean> {
  return await hasValidEntitlement(publicationId, pageNumber, readerIdentityKey) ||
    await findAcceptedPaymentEntitlement(publicationId, pageNumber, readerIdentityKey)
}

async function calculatePagePrice (req: Request): Promise<number> {
  const pageNumber = Number(req.params.pageNumber)
  if (pageNumber === 1) return 0
  const publication = await db('publications')
    .where({ id: req.params.id, status: 'published' })
    .first()
  if (publication == null) return 0
  const readerIdentityKey = identityKeyOf(req)
  if (await hasReadablePageAccess(publication.id, pageNumber, readerIdentityKey)) return 0
  const settings = await getSettings()
  return Number(settings.price_per_page_sats)
}

async function requireReaderForPaidPage (req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pageNumber = Number(req.params.pageNumber)
    if (pageNumber <= 1) {
      next()
      return
    }
    const readerIdentityKey = identityKeyOf(req)
    if (readerIdentityKey == null) {
      res.status(401).json({ status: 'error', message: 'Authenticate with a BRC100 wallet to read paid pages' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

async function sendPublicationPageImage (
  publication: any,
  pageNumber: number,
  req: Request,
  res: Response,
  pageTokenSecret?: string,
  access: PageAccessTokenPayload['access'] = 'reader'
): Promise<void> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > Number(publication.page_count)) {
    res.status(404).json({ status: 'error', message: 'Page not found' })
    return
  }

  const readerIdentityKey = identityKeyOf(req)
  const satsPaid = Number((req as AuthenticatedRequest).payment?.satoshisPaid ?? 0)
  if (pageNumber > 1 && readerIdentityKey != null && satsPaid > 0) {
    const settings = await getSettings()
    const { commissionSats, authorSats } = splitCommission(satsPaid, Number(settings.commission_bps))
    const paymentId = randomUUID()
    await db.transaction(async trx => {
      await trx('payments').insert({
        id: paymentId,
        publication_id: publication.id,
        page_number: pageNumber,
        reader_identity_key: readerIdentityKey,
        satoshis: satsPaid,
        commission_sats: commissionSats,
        author_sats: authorSats,
        payment_tx: (req as AuthenticatedRequest).payment?.tx ?? null,
        status: 'accepted'
      })
      await trx('page_entitlements')
        .insert({
          publication_id: publication.id,
          page_number: pageNumber,
          reader_identity_key: readerIdentityKey,
          expires_at: trx.raw('DATE_ADD(NOW(), INTERVAL 30 DAY)'),
          payment_id: paymentId
        })
        .onConflict(['publication_id', 'page_number', 'reader_identity_key'])
        .merge({
          expires_at: trx.raw('DATE_ADD(NOW(), INTERVAL 30 DAY)'),
          payment_id: paymentId,
          updated_at: trx.fn.now()
        })
      await trx('ledger_entries').insert([
        {
          account_type: 'author_payable',
          account_identity_key: publication.author_identity_key,
          amount_sats: authorSats,
          source_type: 'payment',
          source_id: paymentId,
          memo: `Page ${pageNumber} purchase for ${String(publication.title)}`
        },
        {
          account_type: 'platform_commission',
          account_identity_key: null,
          amount_sats: commissionSats,
          source_type: 'payment',
          source_id: paymentId,
          memo: `Commission for page ${pageNumber} purchase`
        }
      ])
      await writeAudit('page_paid', readerIdentityKey, 'publication', publication.id, { pageNumber, satsPaid }, trx)
    })
  }

  const page = await db('publication_pages').where({ publication_id: publication.id, page_number: pageNumber }).first()
  if (page == null) {
    res.status(404).json({ status: 'error', message: 'Page image not found' })
    return
  }
  if (pageNumber === 1) {
    res.setHeader('X-PaperTrade-Page-Access', 'free')
  } else if (readerIdentityKey != null && await hasReadablePageAccess(publication.id, pageNumber, readerIdentityKey)) {
    res.setHeader('X-PaperTrade-Page-Access', satsPaid > 0 ? 'paid' : 'owned')
  }
  res.setHeader('Cache-Control', 'private, max-age=60')
  if (req.query.format === 'json' && pageTokenSecret != null && readerIdentityKey != null) {
    const expiresAt = Date.now() + PAGE_ACCESS_TOKEN_TTL_MS
    const token = createPageAccessToken(pageTokenSecret, {
      publicationId: publication.id,
      pageNumber,
      access,
      expiresAt,
      nonce: randomUUID()
    })
    res.json({
      status: 'success',
      mimeType: 'image/png',
      imageUrl: `${ROUTING_PREFIX}/publications/${String(publication.id)}/pages/${pageNumber}/rendered?token=${encodeURIComponent(token)}`,
      expiresAt
    })
    return
  }
  await sendPngResponse(req, res, page.image_path)
}

async function sendPageImage (req: Request, res: Response, pageTokenSecret?: string): Promise<void> {
  const pageNumber = Number(req.params.pageNumber)
  const publication = await db('publications').where({ id: req.params.id, status: 'published' }).first()
  if (publication == null) {
    res.status(404).json({ status: 'error', message: 'Publication not found' })
    return
  }
  await sendPublicationPageImage(publication, pageNumber, req, res, pageTokenSecret, 'reader')
}

async function getAuthorPayableBalance (identityKey: string, trx: any = db): Promise<number> {
  const balance = await trx('ledger_entries')
    .where({ account_type: 'author_payable', account_identity_key: identityKey })
    .sum({ balance_sats: 'amount_sats' })
    .first()
  return Number(balance?.balance_sats ?? 0)
}

function actionTxToBase64 (tx: unknown): string {
  if (typeof tx === 'string') return tx
  if (Array.isArray(tx)) return Utils.toBase64(tx as number[])
  if (tx instanceof Uint8Array) return Utils.toBase64(Array.from(tx))
  throw new Error('Server wallet did not return transaction data for this payout')
}

function publicAuthorPayout (payout: any): AuthorPayoutPayload {
  return {
    payoutId: String(payout.id),
    amountSats: Number(payout.amount_sats),
    txBase64: String(payout.tx ?? ''),
    outputIndex: Number(payout.output_index ?? 0),
    derivationPrefix: String(payout.derivation_prefix ?? ''),
    derivationSuffix: String(payout.derivation_suffix ?? ''),
    serverIdentityKey: String(payout.server_identity_key ?? ''),
    status: String(payout.status)
  }
}

function publicPublicationFields (row: any): Record<string, unknown> {
  const starter = starterWorkById(String(row.id))
  return {
    id: row.id,
    title: row.title,
    description: starter?.description ?? row.description,
    authorIdentityKey: row.author_identity_key,
    authorName: starter?.authorName ?? row.display_name,
    pageCount: Number(row.page_count),
    publishedAt: row.published_at,
    coverUrl: starter == null ? `${ROUTING_PREFIX}/publications/${String(row.id)}/cover` : `${ROUTING_PREFIX}/publications/${String(row.id)}/cover-art`,
    isLibraryWork: starter != null,
    sourceName: starter?.sourceName,
    sourceUrl: starter?.sourceUrl
  }
}

function publicPublicationMetaFields (row: any): PublicPublicationMeta {
  const starter = starterWorkById(String(row.id))
  const publishedAt = row.published_at == null
    ? null
    : row.published_at instanceof Date
      ? row.published_at.toISOString()
      : String(row.published_at)
  return {
    id: String(row.id),
    title: String(row.title),
    description: starter?.description ?? row.description,
    authorName: starter?.authorName ?? row.display_name,
    pageCount: Number(row.page_count),
    publishedAt,
    coverUrl: starter == null ? `${ROUTING_PREFIX}/publications/${String(row.id)}/cover` : `${ROUTING_PREFIX}/publications/${String(row.id)}/cover-art`
  }
}

async function getPublishedPublicationMeta (publicationId: string): Promise<PublicPublicationMeta | null> {
  const row = await db('publications')
    .join('authors', 'authors.identity_key', 'publications.author_identity_key')
    .where('publications.id', publicationId)
    .where('publications.status', 'published')
    .select('publications.*', 'authors.display_name')
    .first()
  return row == null ? null : publicPublicationMetaFields(row)
}

async function listPublishedPublicationMeta (): Promise<PublicPublicationMeta[]> {
  const rows = await db('publications')
    .join('authors', 'authors.identity_key', 'publications.author_identity_key')
    .where('publications.status', 'published')
    .select('publications.*', 'authors.display_name')
    .orderBy('publications.published_at', 'desc')
  return rows.map(publicPublicationMetaFields)
}

function appRoutePath (pathName: string): boolean {
  return pathName === '/' ||
    pathName === '/about' ||
    pathName === '/help' ||
    pathName === '/author' ||
    pathName === '/admin' ||
    pathName === '/setup' ||
    /^\/publication\/[^/]+$/.test(pathName) ||
    /^\/read\/[^/]+\/[0-9]+$/.test(pathName) ||
    /^\/author\/read\/[^/]+\/[0-9]+$/.test(pathName) ||
    /^\/admin\/read\/[^/]+\/[0-9]+$/.test(pathName)
}

async function processAndStorePublicationUpload (
  publication: any,
  actor: string | undefined,
  tempPath: string,
  originalName: string,
  mimeType: string
): Promise<{ pageCount: number }> {
  try {
    const processed = await processPublicationFile(publication.id, tempPath, originalName)
    await db.transaction(async trx => {
      await trx('publication_files').where({ publication_id: publication.id }).delete()
      await trx('publication_pages').where({ publication_id: publication.id }).delete()
      await trx('publication_files').insert([
        {
          id: randomUUID(),
          publication_id: publication.id,
          kind: 'source',
          original_filename: originalName,
          mime_type: mimeType,
          path: processed.sourcePath,
          sha256: processed.sourceSha256,
          bytes: processed.sourceBytes
        },
        {
          id: randomUUID(),
          publication_id: publication.id,
          kind: 'canonical_pdf',
          original_filename: 'canonical.pdf',
          mime_type: 'application/pdf',
          path: processed.canonicalPdfPath,
          sha256: processed.canonicalSha256,
          bytes: processed.canonicalBytes
        }
      ])
      await trx('publication_pages').insert(processed.pages.map(page => ({
        publication_id: publication.id,
        page_number: page.pageNumber,
        image_path: page.imagePath,
        sha256: page.sha256,
        bytes: page.bytes
      })))
      await trx('publications').where({ id: publication.id }).update({
        page_count: processed.pageCount,
        canonical_pdf_path: processed.canonicalPdfPath,
        cover_page_path: processed.pages[0]?.imagePath,
        source_format: path.extname(originalName).replace('.', '').toLowerCase(),
        updated_at: trx.fn.now()
      })
      await writeAudit('publication_file_processed', actor, 'publication', publication.id, { pageCount: processed.pageCount }, trx)
    })
    return { pageCount: processed.pageCount }
  } catch (err) {
    await fs.rm(tempPath, { force: true })
    throw err
  }
}

async function removeSeedTestData (): Promise<void> {
  const publications = await db('publications')
    .whereRaw('(lower(title) = ? or title like ?)', ['test', 'test pub%'])
    .select('id')

  if (publications.length === 0) return

  const publicationIds = publications.map(row => String(row.id))
  const payments = await db('payments').whereIn('publication_id', publicationIds).select('id')
  const paymentIds = payments.map(row => String(row.id))

  await db.transaction(async trx => {
    if (paymentIds.length > 0) {
      await trx('ledger_entries')
        .where({ source_type: 'payment' })
        .whereIn('source_id', paymentIds)
        .delete()
    }
    await trx('publications').whereIn('id', publicationIds).delete()
    await writeAudit('seed_test_data_removed', undefined, 'publication', publicationIds.join(','), { publicationCount: publicationIds.length }, trx)
  })

  await Promise.all(publicationIds.map(async publicationId => {
    await fs.rm(getPublicationDir(publicationId), { recursive: true, force: true })
  }))
}

function isInternalTestPublication (row: Record<string, unknown>): boolean {
  const title = typeof row.title === 'string' ? row.title.trim().toLowerCase() : ''
  return title === 'test' || title.startsWith('test pub')
}

async function starterNeedsProcessing (publicationId: string): Promise<boolean> {
  const publication = await db('publications').where({ id: publicationId }).first()
  if (publication == null || Number(publication.page_count) <= 5 || publication.cover_page_path == null) return true

  const page = await db('publication_pages').where({ publication_id: publicationId, page_number: 1 }).first()
  if (page == null) return true

  try {
    await fs.access(String(page.image_path))
    return false
  } catch {
    return true
  }
}

async function seedStarterWork (work: StarterWork, starterAuthorIdentityKey: string): Promise<boolean> {
  await db('publications')
    .insert({
      id: work.id,
      author_identity_key: starterAuthorIdentityKey,
      title: work.title,
      description: work.description,
      status: 'published',
      reviewed_by: starterAuthorIdentityKey,
      published_at: db.fn.now()
    })
    .onConflict('id')
    .merge({
      author_identity_key: starterAuthorIdentityKey,
      title: work.title,
      description: work.description,
      status: 'published',
      reviewed_by: starterAuthorIdentityKey,
      published_at: db.fn.now(),
      updated_at: db.fn.now()
    })

  if (!(await starterNeedsProcessing(work.id))) return false

  const starterPdfPath = path.join(DATA_DIR, 'tmp', `${work.id}.pdf`)
  await writeStarterPdf(work, starterPdfPath)
  const publication = await db('publications').where({ id: work.id }).first()
  await processAndStorePublicationUpload(publication, starterAuthorIdentityKey, starterPdfPath, safeStarterFileName(work.title), 'application/pdf')
  await db('publications').where({ id: work.id }).update({
    status: 'published',
    reviewed_by: starterAuthorIdentityKey,
    published_at: db.fn.now(),
    updated_at: db.fn.now()
  })
  return true
}

async function seedStarterWorks (starterAuthorIdentityKey: string): Promise<void> {
  if (process.env.PAPERTRADE_SEED_STARTER_WORKS === 'false') return

  await removeSeedTestData()
  await db('authors')
    .insert({
      identity_key: starterAuthorIdentityKey,
      display_name: STARTER_AUTHOR_NAME,
      bio: 'Royalty-free public-domain starter shelf for new PaperTrade servers.'
    })
    .onConflict('identity_key')
    .merge({
      display_name: STARTER_AUTHOR_NAME,
      bio: 'Royalty-free public-domain starter shelf for new PaperTrade servers.',
      updated_at: db.fn.now()
    })

  let processedCount = 0
  for (const work of STARTER_WORKS) {
    if (await seedStarterWork(work, starterAuthorIdentityKey)) processedCount += 1
  }
  await writeAudit('starter_works_seeded', undefined, 'publication', 'starter-library', {
    workCount: STARTER_WORKS.length,
    processedCount,
    starterAuthorIdentityKey
  })
}

async function createApp (): Promise<express.Express> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await db.migrate.latest()
  const walletBootstrap = await createServerWallet()

  async function getServerWalletBalance (): Promise<number> {
    const wallet = walletBootstrap.wallet
    if (typeof wallet.balance === 'function') {
      const balance = await wallet.balance()
      return Number(balance ?? 0)
    }
    const outputs = await wallet.listOutputs({ basket: WALLET_BALANCE_BASKET })
    return Number(outputs?.totalOutputs ?? outputs?.outputs?.reduce((total: number, output: any) => total + Number(output.satoshis ?? 0), 0) ?? 0)
  }

  function payoutFailureMessage (err: any, amountSats: number): string {
    const raw = String(err?.message ?? 'Payout creation failed')
    const lower = raw.toLowerCase()
    if (lower.includes('insufficient') || lower.includes('not enough') || lower.includes('fund')) {
      return `The server wallet does not have enough spendable BSV to send this ${amountSats} sat payout and cover fees. Ask an admin to fund the PaperTrade server wallet, then retry.`
    }
    return raw
  }

  async function createAuthorWalletPayout (authorIdentityKey: string, amountSats: number, requestedBy: string): Promise<any> {
    const existing = await db('payouts')
      .where({ author_identity_key: authorIdentityKey, destination_type: 'brc100_identity', destination: authorIdentityKey })
      .whereIn('status', AUTHOR_PAYOUT_PENDING_STATUSES)
      .whereNotNull('tx')
      .orderBy('created_at', 'desc')
      .first()
    if (existing != null) {
      await db('payouts').where({ id: existing.id }).update({
        retry_count: db.raw('COALESCE(retry_count, 0) + 1'),
        last_retry_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      return { ...existing, retry_count: Number(existing.retry_count ?? 0) + 1 }
    }

    if (amountSats <= 0) throw new Error('No author balance is available for payout')
    const author = await db('authors').where({ identity_key: authorIdentityKey }).first()
    if (author == null) throw new Error('Author profile not found')
    const balanceSats = await getAuthorPayableBalance(authorIdentityKey)
    if (amountSats > balanceSats) throw new Error('Payout amount exceeds current author balance')
    const serverBalanceSats = await getServerWalletBalance().catch(() => 0)
    if (serverBalanceSats < amountSats) {
      throw new Error(`The server wallet has ${serverBalanceSats} sats available, but this payout needs ${amountSats} sats plus network fees. Ask an admin to fund the PaperTrade server wallet, then retry.`)
    }

    const payoutId = randomUUID()
    await db('payouts').insert({
      id: payoutId,
      author_identity_key: authorIdentityKey,
      amount_sats: amountSats,
      destination_type: 'brc100_identity',
      destination: authorIdentityKey,
      status: 'creating',
      requested_by: requestedBy
    })

    try {
      const derivationPrefix = Utils.toBase64(Random(8))
      const derivationSuffix = Utils.toBase64(Utils.toArray(String(Date.now()), 'utf8'))
      const { publicKey: derivedPubKey } = await walletBootstrap.wallet.getPublicKey({
        protocolID: BRC29_PROTOCOL_ID,
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: authorIdentityKey
      })
      const pkh = PublicKey.fromString(String(derivedPubKey)).toHash('hex') as string
      const result = await walletBootstrap.wallet.createAction({
        description: `PaperTrade payout ${payoutId.slice(0, 8)}`,
        outputs: [{
          lockingScript: `76a914${pkh}88ac`,
          satoshis: amountSats,
          outputDescription: 'PaperTrade author payout',
          customInstructions: JSON.stringify({
            derivationPrefix,
            derivationSuffix,
            serverIdentityKey: walletBootstrap.publicKey
          }),
          tags: ['papertrade-payout']
        }],
        labels: ['papertrade-payout'],
        options: {
          randomizeOutputs: false,
          returnTXIDOnly: false
        }
      })
      const txBase64 = actionTxToBase64(result.tx)
      await db('payouts').where({ id: payoutId }).update({
        status: 'pending_internalize',
        txid: result.txid ?? null,
        tx: txBase64,
        output_index: 0,
        derivation_prefix: derivationPrefix,
        derivation_suffix: derivationSuffix,
        server_identity_key: walletBootstrap.publicKey,
        updated_at: db.fn.now()
      })
      await writeAudit('author_payout_created', requestedBy, 'payout', payoutId, {
        amountSats,
        destinationType: 'brc100_identity'
      })
      return await db('payouts').where({ id: payoutId }).first()
    } catch (err: any) {
      const failureReason = payoutFailureMessage(err, amountSats)
      await db('payouts').where({ id: payoutId }).update({
        status: 'failed',
        failure_reason: failureReason,
        updated_at: db.fn.now()
      })
      await writeAudit('author_payout_failed', requestedBy, 'payout', payoutId, {
        amountSats,
        reason: failureReason
      })
      throw new Error(failureReason)
    }
  }

  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const requestId = randomUUID()
    ;(req as AuthenticatedRequest).requestId = requestId
    res.setHeader('X-PaperTrade-Request-Id', requestId)
    const startedAt = Date.now()
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt
      if (req.path.startsWith(ROUTING_PREFIX) && (res.statusCode >= 400 || durationMs > 8000)) {
        const level = res.statusCode >= 500 ? 'error' : 'warn'
        console[level](JSON.stringify({
          level,
          service: 'papertrade',
          event: durationMs > 8000 ? 'api_slow_or_failed' : 'api_failed',
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          identityKey: identityKeyOf(req)
        }))
      }
    })
    next()
  })
  app.use(bodyParser.json({ limit: JSON_BODY_LIMIT }))
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', '*')
    res.header('Access-Control-Allow-Methods', '*')
    res.header('Access-Control-Expose-Headers', '*')
    res.header('Access-Control-Allow-Private-Network', 'true')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
  })

  app.get('/healthz', async (_req, res) => {
    try {
      await db.raw('select 1')
      const settings = await getSettings()
      res.json({
        ok: true,
        service: 'papertrade',
        setupComplete: Boolean(settings.setup_complete),
        serverPublicKey: walletBootstrap.publicKey
      })
    } catch {
      res.status(503).json({ ok: false, service: 'papertrade' })
    }
  })

  app.use(createAuthMiddleware({
    wallet: walletBootstrap.wallet,
    allowUnauthenticated: true
  }))

  const pagePaymentMiddleware = createPaymentMiddleware({
    wallet: walletBootstrap.wallet,
    calculateRequestPrice: calculatePagePrice as any
  })

  const calculateAdminFundingPrice = (req: { body?: { amountSats?: unknown } }): number => asPositiveInteger(req.body?.amountSats, 0)

  const adminFundingPaymentMiddleware = createPaymentMiddleware({
    wallet: walletBootstrap.wallet,
    calculateRequestPrice: calculateAdminFundingPrice as any
  })

  const api = express.Router()

  api.post('/telemetry', async (req, res, next) => {
    try {
      const events = Array.isArray(req.body?.events) ? req.body.events : [req.body]
      const accepted: string[] = []
      for (const raw of events.slice(0, 25)) {
        if (raw != null && typeof raw === 'object') {
          accepted.push(await recordClientTelemetry(req, raw as ClientTelemetryEvent))
        }
      }
      res.json({ status: 'success', accepted: accepted.length, ids: accepted })
    } catch (err) {
      next(err)
    }
  })

  api.get('/status', async (req, res) => {
    const identityKey = identityKeyOf(req)
    const settings = await getSettings()
    res.json({
      status: 'success',
      setupComplete: Boolean(settings.setup_complete),
      mode: settings.mode,
      pricePerPageSats: Number(settings.price_per_page_sats),
      commissionBps: Number(settings.commission_bps),
      displayUnit: settings.display_unit ?? 'sats',
      walletStorageUrl: settings.wallet_storage_url,
      serverPublicKey: settings.server_public_key,
      serverKeyStatus: settings.server_key_status,
      appearance: appearanceFromSettings(settings),
      identityKey,
      isAdmin: await isAdmin(identityKey)
    })
  })

  api.post('/setup', requireAuth, async (req, res) => {
    const actor = identityKeyOf(req)
    if (actor == null) throw new Error('auth middleware invariant failed')
    const pricePerPageSats = asPositiveInteger(req.body.pricePerPageSats, 25)
    const commissionBps = asPositiveInteger(req.body.commissionBps, 1000)
    const mode = req.body.mode === 'public_submissions' ? 'public_submissions' : 'private_publish'
    const displayUnit = displayUnitFromBody(req.body.displayUnit)
    const walletStorageUrl = typeof req.body.walletStorageUrl === 'string' && req.body.walletStorageUrl.trim() !== ''
      ? req.body.walletStorageUrl.trim()
      : 'https://storage.babbage.systems'

    if (commissionBps > 10000) {
      res.status(400).json({ status: 'error', message: 'Commission cannot exceed 100%' })
      return
    }

    const serverPrivateKey = typeof req.body.serverPrivateKey === 'string' && req.body.serverPrivateKey.trim() !== ''
      ? req.body.serverPrivateKey.trim()
      : undefined

    await db.transaction(async trx => {
      const settings = await trx('server_settings').where({ id: 1 }).forUpdate().first()
      const alreadySetup = Boolean(settings?.setup_complete)
      if (alreadySetup && !(await isAdmin(actor))) {
        throw new Error('Only admins can update setup after first run')
      }
      const appearance = req.body.appearance == null ? {} : appearanceUpdateFromBody(req.body.appearance as AppearanceInput, settings)
      await trx('server_settings').where({ id: 1 }).update({
        setup_complete: true,
        mode,
        price_per_page_sats: pricePerPageSats,
        commission_bps: commissionBps,
        display_unit: displayUnit,
        wallet_storage_url: walletStorageUrl,
        ...appearance
      })
      await trx('admins').insert({ identity_key: actor, added_by: actor }).onConflict('identity_key').ignore()
      await trx('authors').insert({
        identity_key: actor,
        display_name: `Author ${actor.slice(0, 10)}`
      }).onConflict('identity_key').ignore()
      await writeAudit(alreadySetup ? 'setup_updated' : 'setup_completed', actor, 'server_settings', '1', {
        mode,
        pricePerPageSats,
        commissionBps,
        displayUnit,
        walletStorageUrl,
        appearance
      }, trx)
    })

    if (serverPrivateKey != null) {
      await replacePersistedServerKey(serverPrivateKey)
    }

    res.json({ status: 'success' })
  })

  api.get('/publications', async (_req, res) => {
    const rows = await db('publications')
      .join('authors', 'authors.identity_key', 'publications.author_identity_key')
      .where('publications.status', 'published')
      .select('publications.*', 'authors.display_name')
      .orderBy('publications.published_at', 'desc')
    res.json({ status: 'success', publications: rows.filter(row => !isInternalTestPublication(row)).map(publicPublicationFields) })
  })

  api.get('/publications/:id', async (req, res) => {
    const row = await db('publications')
      .join('authors', 'authors.identity_key', 'publications.author_identity_key')
      .where('publications.id', req.params.id)
      .where('publications.status', 'published')
      .select('publications.*', 'authors.display_name')
      .first()
    if (row == null) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    res.json({ status: 'success', publication: publicPublicationFields(row) })
  })

  api.get('/publications/:id/cover', async (req, res, next) => {
    try {
      const publication = await db('publications').where({ id: req.params.id, status: 'published' }).first()
      if (publication == null) {
        res.status(404).json({ status: 'error', message: 'Publication not found' })
        return
      }
      await sendPublicationPageImage(publication, 1, req, res)
    } catch (err) {
      next(err)
    }
  })

  api.get('/publications/:id/cover-art', async (req, res, next) => {
    try {
      const publication = await db('publications').where({ id: req.params.id, status: 'published' }).first()
      const starter = starterWorkById(req.params.id)
      if (publication == null || starter == null) {
        res.status(404).json({ status: 'error', message: 'Cover art not found' })
        return
      }
      res.type('image/jpeg').sendFile(await starterCoverPath(starter))
    } catch (err) {
      next(err)
    }
  })

  api.get('/publications/:id/pages/:pageNumber/rendered', async (req, res, next) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : ''
      const pageNumber = Number(req.params.pageNumber)
      const payload = verifyPageAccessToken(walletBootstrap.privateKeyHex, token)
      if (
        payload == null ||
        payload.publicationId !== req.params.id ||
        payload.pageNumber !== pageNumber ||
        !Number.isInteger(pageNumber)
      ) {
        res.status(403).json({ status: 'error', message: 'Page access token is invalid or expired' })
        return
      }

      const publication = await db('publications').where({ id: req.params.id }).first()
      if (publication == null || (payload.access === 'reader' && publication.status !== 'published')) {
        res.status(404).json({ status: 'error', message: 'Publication not found' })
        return
      }

      const page = await db('publication_pages').where({ publication_id: publication.id, page_number: pageNumber }).first()
      if (page == null) {
        res.status(404).json({ status: 'error', message: 'Page image not found' })
        return
      }

      res.setHeader('Cache-Control', 'private, max-age=60')
      res.setHeader('X-PaperTrade-Page-Access', payload.access === 'reader' ? 'token' : 'preview-token')
      await sendPngResponse(req, res, page.image_path, false)
    } catch (err) {
      next(err)
    }
  })

  api.get('/publications/:id/pages/:pageNumber', requireReaderForPaidPage, pagePaymentMiddleware, async (req, res, next) => {
    try {
      await sendPageImage(req, res, walletBootstrap.privateKeyHex)
    } catch (err) {
      next(err)
    }
  })

  api.get('/me/profile', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const profile = await db('authors').where({ identity_key: identityKey }).first()
    const settings = await getSettings()
    res.json({
      status: 'success',
      profile: profile ?? defaultAuthorProfile(identityKey),
      effectiveDisplayUnit: profile?.display_unit ?? settings.display_unit ?? 'sats',
      canPublish: await canUseAuthorTools(identityKey)
    })
  })

  api.put('/me/profile', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const displayName = String(req.body.displayName ?? '').trim()
    if (displayName === '') {
      res.status(400).json({ status: 'error', message: 'displayName is required' })
      return
    }
    await db('authors').insert({
      identity_key: identityKey,
      display_name: displayName,
      bio: req.body.bio ?? null,
      avatar_url: req.body.avatarUrl ?? null,
      display_unit: req.body.displayUnit === 'server_default' ? null : displayUnitFromBody(req.body.displayUnit)
    }).onConflict('identity_key').merge({
      display_name: displayName,
      bio: req.body.bio ?? null,
      avatar_url: req.body.avatarUrl ?? null,
      display_unit: req.body.displayUnit === 'server_default' ? null : displayUnitFromBody(req.body.displayUnit),
      updated_at: db.fn.now()
    })
    await writeAudit('author_profile_updated', identityKey, 'author', identityKey)
    res.json({ status: 'success' })
  })

  api.post('/me/profile/avatar', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const uploaded = decodeJsonUpload(req.body as JsonUploadBody, MAX_AVATAR_BYTES)
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(uploaded.mimeType)) {
      res.status(400).json({ status: 'error', message: 'Avatar must be PNG, JPEG, WebP, or GIF' })
      return
    }
    const extByMime: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif'
    }
    const avatarDir = path.join(DATA_DIR, 'avatars')
    await fs.mkdir(avatarDir, { recursive: true })
    const avatarId = createHash('sha256').update(identityKey).digest('hex')
    const avatarPath = path.join(avatarDir, `${avatarId}${extByMime[uploaded.mimeType]}`)
    await fs.writeFile(avatarPath, uploaded.bytes)
    await ensureAuthor(identityKey)
    const avatarUrl = `${ROUTING_PREFIX}/authors/${encodeURIComponent(identityKey)}/avatar`
    await db('authors').where({ identity_key: identityKey }).update({
      avatar_url: avatarUrl,
      updated_at: db.fn.now()
    })
    await writeAudit('author_avatar_updated', identityKey, 'author', identityKey)
    res.json({ status: 'success', avatarUrl })
  })

  api.get('/authors/:identityKey/avatar', async (req, res) => {
    const profile = await db('authors').where({ identity_key: req.params.identityKey }).first()
    if (profile?.avatar_url == null) {
      res.status(404).json({ status: 'error', message: 'Avatar not found' })
      return
    }
    const avatarId = createHash('sha256').update(req.params.identityKey).digest('hex')
    const avatarDir = path.join(DATA_DIR, 'avatars')
    const candidates = ['.png', '.jpg', '.webp', '.gif'].map(ext => path.join(avatarDir, `${avatarId}${ext}`))
    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        res.sendFile(candidate)
        return
      } catch {}
    }
    res.status(404).json({ status: 'error', message: 'Avatar not found' })
  })

  api.get('/me/publications', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const rows = await db('publications')
      .where({ author_identity_key: identityKey })
      .whereNot({ status: 'rejected' })
      .orderBy('updated_at', 'desc')
    res.json({
      status: 'success',
      canPublish: await canUseAuthorTools(identityKey),
      publications: rows
    })
  })

  api.get('/me/ledger', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const payouts = await db('payouts')
      .where({ author_identity_key: identityKey })
      .orderBy('created_at', 'desc')
      .limit(50)
    res.json({ status: 'success', balanceSats: await getAuthorPayableBalance(identityKey), payouts })
  })

  api.post('/me/payouts', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    await ensureAuthor(identityKey)
    const availableBalance = await getAuthorPayableBalance(identityKey)
    const requestedAmount = req.body.amountSats == null ? availableBalance : asPositiveInteger(req.body.amountSats, availableBalance)
    try {
      const payout = await createAuthorWalletPayout(identityKey, requestedAmount, identityKey)
      res.json({ status: 'success', payout: publicAuthorPayout(payout) })
    } catch (err: any) {
      res.status(400).json({ status: 'error', message: err?.message ?? 'Could not create payout' })
    }
  })

  api.post('/me/payouts/:id/ack', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const accepted = req.body.accepted === true
    const failureReason = typeof req.body.failureReason === 'string' && req.body.failureReason.trim() !== ''
      ? req.body.failureReason.trim().slice(0, 1000)
      : null

    await db.transaction(async trx => {
      const payout = await trx('payouts')
        .where({ id: req.params.id, author_identity_key: identityKey, destination_type: 'brc100_identity' })
        .forUpdate()
        .first()
      if (payout == null) {
        res.status(404).json({ status: 'error', message: 'Payout not found' })
        return
      }
      if (payout.status === 'internalized' || payout.status === 'broadcast') {
        res.json({ status: 'success', payoutStatus: payout.status })
        return
      }
      if (!accepted) {
        await trx('payouts').where({ id: payout.id }).update({
          status: 'pending_internalize',
          failure_reason: failureReason ?? 'Wallet did not acknowledge the payout yet',
          updated_at: trx.fn.now()
        })
        await writeAudit('author_payout_internalize_failed', identityKey, 'payout', payout.id, { failureReason }, trx)
        res.json({ status: 'success', payoutStatus: 'pending_internalize' })
        return
      }

      const existingDebit = await trx('ledger_entries')
        .where({ source_type: 'payout', source_id: payout.id, account_type: 'author_payable' })
        .first()
      if (existingDebit == null) {
        await trx('ledger_entries').insert({
          account_type: 'author_payable',
          account_identity_key: identityKey,
          amount_sats: -Number(payout.amount_sats),
          source_type: 'payout',
          source_id: payout.id,
          memo: 'Self-serve payout to BRC100 wallet'
        })
      }
      await trx('payouts').where({ id: payout.id }).update({
        status: 'internalized',
        failure_reason: null,
        internalized_at: trx.fn.now(),
        client_ack_at: trx.fn.now(),
        updated_at: trx.fn.now()
      })
      await writeAudit('author_payout_internalized', identityKey, 'payout', payout.id, {
        amountSats: Number(payout.amount_sats)
      }, trx)
      res.json({ status: 'success', payoutStatus: 'internalized' })
    })
  })

  api.post('/me/publications', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    if (!(await canUseAuthorTools(identityKey))) {
      res.status(403).json({ status: 'error', message: 'This server is private. Only admins can create publications right now.' })
      return
    }
    const title = String(req.body.title ?? '').trim()
    if (title === '') {
      res.status(400).json({ status: 'error', message: 'title is required' })
      return
    }
    await ensureAuthor(identityKey)
    const id = randomUUID()
    await db('publications').insert({
      id,
      author_identity_key: identityKey,
      title,
      description: req.body.description ?? null,
      status: 'draft'
    })
    await writeAudit('publication_created', identityKey, 'publication', id)
    res.json({ status: 'success', publicationId: id })
  })

  api.put('/me/publications/:id', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null || !(await canManagePublication(identityKey, publication))) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    const title = String(req.body.title ?? '').trim()
    if (title === '') {
      res.status(400).json({ status: 'error', message: 'title is required' })
      return
    }
    await db('publications').where({ id: publication.id }).update({
      title,
      description: req.body.description ?? null,
      updated_at: db.fn.now()
    })
    await writeAudit('publication_updated', identityKey, 'publication', publication.id)
    res.json({ status: 'success' })
  })

  api.post('/me/publications/:id/files', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id, author_identity_key: identityKey }).first()
    if (publication == null) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    const uploaded = decodeJsonUpload(req.body as JsonUploadBody, MAX_JSON_UPLOAD_BYTES)
    const tempPath = await writeTempUpload(uploaded)
    const processed = await processAndStorePublicationUpload(publication, identityKey, tempPath, uploaded.originalName, uploaded.mimeType)
    res.json({ status: 'success', pageCount: processed.pageCount })
  })

  api.get('/me/publications/:id/pages/:pageNumber', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null || !(await canManagePublication(identityKey, publication))) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    await sendPublicationPageImage(publication, Number(req.params.pageNumber), req, res, walletBootstrap.privateKeyHex, 'manager')
  })

  api.post('/me/publications/:id/submit', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id, author_identity_key: identityKey }).first()
    if (publication == null || Number(publication.page_count) < 5) {
      res.status(400).json({ status: 'error', message: 'Publication needs a processed file with at least 5 pages' })
      return
    }
    const settings = await getSettings()
    const nextStatus = settings.mode === 'private_publish' && await isAdmin(identityKey) ? 'published' : 'submitted'
    await db('publications').where({ id: req.params.id }).update({
      status: nextStatus,
      reviewed_by: nextStatus === 'published' ? identityKey : null,
      published_at: nextStatus === 'published' ? db.fn.now() : null,
      updated_at: db.fn.now()
    })
    await writeAudit(nextStatus === 'published' ? 'publication_published' : 'publication_submitted', identityKey, 'publication', req.params.id)
    res.json({ status: 'success', statusValue: nextStatus })
  })

  api.post('/me/publications/:id/unpublish', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null || !(await canManagePublication(identityKey, publication))) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    await db('publications').where({ id: publication.id }).update({
      status: 'draft',
      published_at: null,
      reviewed_by: null,
      updated_at: db.fn.now()
    })
    await writeAudit('publication_unpublished', identityKey, 'publication', publication.id)
    res.json({ status: 'success' })
  })

  api.delete('/me/publications/:id', requireAuth, async (req, res) => {
    const identityKey = identityKeyOf(req)
    if (identityKey == null) throw new Error('auth middleware invariant failed')
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null || !(await canManagePublication(identityKey, publication))) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    await deletePublication(publication.id, identityKey)
    res.json({ status: 'success' })
  })

  api.get('/admin/publications', requireAdmin, async (_req, res) => {
    const rows = await db('publications')
      .join('authors', 'authors.identity_key', 'publications.author_identity_key')
      .whereNot('publications.status', 'rejected')
      .select('publications.*', 'authors.display_name')
      .orderBy('publications.updated_at', 'desc')
    res.json({ status: 'success', publications: rows })
  })

  api.post('/admin/publications', requireAdmin, async (req, res) => {
    const actor = identityKeyOf(req)
    if (actor == null) throw new Error('auth middleware invariant failed')
    const title = String(req.body.title ?? '').trim()
    if (title === '') {
      res.status(400).json({ status: 'error', message: 'title is required' })
      return
    }
    const authorIdentityKey = String(req.body.authorIdentityKey ?? actor).trim()
    await ensureAuthor(authorIdentityKey, req.body.authorDisplayName)
    const id = randomUUID()
    await db('publications').insert({
      id,
      author_identity_key: authorIdentityKey,
      title,
      description: req.body.description ?? null,
      status: 'draft'
    })
    await writeAudit('publication_created', actor, 'publication', id)
    res.json({ status: 'success', publicationId: id })
  })

  api.post('/admin/publications/:id/files', requireAdmin, upload.single('file'), async (req, res) => {
    const actor = identityKeyOf(req)
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    let uploadInput
    if (req.file == null) {
      const uploaded = decodeJsonUpload(req.body as JsonUploadBody, MAX_JSON_UPLOAD_BYTES)
      uploadInput = {
        tempPath: await writeTempUpload(uploaded),
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType
      }
    } else {
      uploadInput = {
        tempPath: req.file.path,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
      }
    }
    const processed = await processAndStorePublicationUpload(publication, actor, uploadInput.tempPath, uploadInput.originalName, uploadInput.mimeType)
    res.json({ status: 'success', pageCount: processed.pageCount })
  })

  api.post('/admin/publications/:id/submit', requireAdmin, async (req, res) => {
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null || Number(publication.page_count) < 5) {
      res.status(400).json({ status: 'error', message: 'Publication needs a processed file with at least 5 pages' })
      return
    }
    await db('publications').where({ id: req.params.id }).update({ status: 'submitted', updated_at: db.fn.now() })
    await writeAudit('publication_submitted', identityKeyOf(req), 'publication', req.params.id)
    res.json({ status: 'success' })
  })

  api.post('/admin/publications/:id/review', requireAdmin, async (req, res) => {
    const requestedAction = String(req.body.action ?? 'publish')
    const action = ['publish', 'reject', 'unpublish', 'return_to_review'].includes(requestedAction) ? requestedAction : 'publish'
    const publication = await db('publications').where({ id: req.params.id }).first()
    if (publication == null) {
      res.status(404).json({ status: 'error', message: 'Publication not found' })
      return
    }
    if (action === 'reject') {
      await deletePublication(publication.id, identityKeyOf(req))
      res.json({ status: 'success', deleted: true })
      return
    }
    if (action === 'unpublish') {
      await db('publications').where({ id: req.params.id }).update({
        status: 'draft',
        reviewed_by: null,
        review_note: req.body.note ?? null,
        published_at: null,
        updated_at: db.fn.now()
      })
      await writeAudit('publication_unpublished', identityKeyOf(req), 'publication', req.params.id, { note: req.body.note })
      res.json({ status: 'success' })
      return
    }
    if (action === 'return_to_review') {
      await db('publications').where({ id: req.params.id }).update({
        status: 'submitted',
        reviewed_by: null,
        review_note: req.body.note ?? null,
        published_at: null,
        updated_at: db.fn.now()
      })
      await writeAudit('publication_returned_to_review', identityKeyOf(req), 'publication', req.params.id, { note: req.body.note })
      res.json({ status: 'success' })
      return
    }
    if (Number(publication.page_count ?? 0) < 5) {
      res.status(400).json({ status: 'error', message: 'Publication needs a processed file with at least 5 pages before publishing' })
      return
    }
    await db('publications').where({ id: req.params.id }).update({
      status: 'published',
      reviewed_by: identityKeyOf(req),
      review_note: req.body.note ?? null,
      published_at: db.fn.now(),
      updated_at: db.fn.now()
    })
    await writeAudit('publication_published', identityKeyOf(req), 'publication', req.params.id, { note: req.body.note })
    res.json({ status: 'success' })
  })

  api.get('/admin/wallet', requireAdmin, async (_req, res) => {
    res.json({
      status: 'success',
      serverPublicKey: walletBootstrap.publicKey,
      balanceSats: await getServerWalletBalance()
    })
  })

  api.post('/admin/funding', requireAdmin, adminFundingPaymentMiddleware, async (req, res) => {
    const amountSats = asPositiveInteger(req.body.amountSats, 0)
    if (amountSats <= 0) {
      res.status(400).json({ status: 'error', message: 'amountSats must be greater than zero' })
      return
    }
    const paidSats = Number((req as AuthenticatedRequest).payment?.satoshisPaid ?? amountSats)
    if (paidSats < amountSats) {
      res.status(402).json({ status: 'error', message: 'Funding payment was not accepted for the requested amount' })
      return
    }
    const fundingId = randomUUID()
    await db.transaction(async trx => {
      await trx('ledger_entries').insert({
        account_type: 'server_wallet',
        account_identity_key: walletBootstrap.publicKey,
        amount_sats: paidSats,
        source_type: 'server_funding',
        source_id: fundingId,
        memo: 'Admin-funded server wallet top-up'
      })
      await writeAudit('server_wallet_funded', identityKeyOf(req), 'server_wallet', walletBootstrap.publicKey, { amountSats: paidSats, fundingId }, trx)
    })
    res.json({
      status: 'success',
      fundingId,
      amountSats: paidSats,
      balanceSats: await getServerWalletBalance()
    })
  })

  api.get('/admin/settings', requireAdmin, async (_req, res) => {
    const settings = await getSettings()
    const admins = await db('admins').orderBy('created_at', 'asc')
    res.json({ status: 'success', settings, appearance: appearanceFromSettings(settings), admins })
  })

  api.put('/admin/settings', requireAdmin, async (req, res) => {
    const current = await getSettings()
    const settings = {
      mode: req.body.mode === 'public_submissions' ? 'public_submissions' : 'private_publish',
      price_per_page_sats: asPositiveInteger(req.body.pricePerPageSats, 25),
      commission_bps: asPositiveInteger(req.body.commissionBps, 1000),
      display_unit: displayUnitFromBody(req.body.displayUnit),
      wallet_storage_url: String(req.body.walletStorageUrl ?? 'https://storage.babbage.systems'),
      ...(req.body.appearance == null ? {} : appearanceUpdateFromBody(req.body.appearance as AppearanceInput, current))
    }
    if (settings.commission_bps > 10000) {
      res.status(400).json({ status: 'error', message: 'Commission cannot exceed 100%' })
      return
    }
    await db('server_settings').where({ id: 1 }).update(settings)
    await writeAudit('settings_updated', identityKeyOf(req), 'server_settings', '1', settings)
    res.json({ status: 'success' })
  })

  api.post('/admin/appearance/assets', requireAdmin, async (req, res) => {
    const uploaded = decodeJsonUpload(req.body as JsonUploadBody, MAX_APPEARANCE_ASSET_BYTES)
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(uploaded.mimeType)) {
      res.status(400).json({ status: 'error', message: 'Appearance images must be PNG, JPEG, WebP, or GIF' })
      return
    }
    const kind = ['logo', 'icon', 'og_image'].includes(String(req.body.kind)) ? String(req.body.kind) : 'logo'
    const extByMime: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif'
    }
    const appearanceDir = path.join(DATA_DIR, 'appearance')
    await fs.mkdir(appearanceDir, { recursive: true })
    const assetName = `${kind}-${randomUUID()}${extByMime[uploaded.mimeType]}`
    await fs.writeFile(path.join(appearanceDir, assetName), uploaded.bytes)
    const url = `${ROUTING_PREFIX}/appearance/assets/${assetName}`
    await writeAudit('appearance_asset_uploaded', identityKeyOf(req), 'server_settings', '1', { kind, url })
    res.json({ status: 'success', url })
  })

  api.get('/appearance/assets/:fileName', async (req, res) => {
    const fileName = path.basename(req.params.fileName)
    if (fileName !== req.params.fileName || !/^[a-z0-9_-]+-[0-9a-f-]+\.(png|jpg|webp|gif)$/i.test(fileName)) {
      res.status(404).json({ status: 'error', message: 'Asset not found' })
      return
    }
    const filePath = path.join(DATA_DIR, 'appearance', fileName)
    try {
      await fs.access(filePath)
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.sendFile(filePath)
    } catch {
      res.status(404).json({ status: 'error', message: 'Asset not found' })
    }
  })

  api.get('/admin/admins', requireAdmin, async (_req, res) => {
    res.json({ status: 'success', admins: await db('admins').orderBy('created_at', 'asc') })
  })

  api.post('/admin/admins', requireAdmin, async (req, res) => {
    const identityKey = String(req.body.identityKey ?? '').trim()
    if (identityKey === '') {
      res.status(400).json({ status: 'error', message: 'identityKey is required' })
      return
    }
    await db('admins').insert({ identity_key: identityKey, added_by: identityKeyOf(req) }).onConflict('identity_key').ignore()
    await writeAudit('admin_added', identityKeyOf(req), 'admin', identityKey)
    res.json({ status: 'success' })
  })

  api.delete('/admin/admins/:identityKey', requireAdmin, async (req, res) => {
    const count = await db('admins').count<{ count: number }>({ count: '*' }).first()
    if (Number(count?.count ?? 0) <= 1) {
      res.status(400).json({ status: 'error', message: 'Cannot remove the final admin' })
      return
    }
    await db('admins').where({ identity_key: req.params.identityKey }).delete()
    await writeAudit('admin_removed', identityKeyOf(req), 'admin', req.params.identityKey)
    res.json({ status: 'success' })
  })

  api.get('/admin/ledger', requireAdmin, async (_req, res) => {
    const entries = await db('ledger_entries').orderBy('created_at', 'desc').limit(250)
    const authorBalances = await db('ledger_entries')
      .where({ account_type: 'author_payable' })
      .select('account_identity_key')
      .sum({ balance_sats: 'amount_sats' })
      .groupBy('account_identity_key')
    res.json({ status: 'success', entries, authorBalances })
  })

  api.get('/admin/payments', requireAdmin, async (_req, res) => {
    const payments = await db('payments').orderBy('created_at', 'desc').limit(250)
    const payouts = await db('payouts').orderBy('created_at', 'desc').limit(250)
    res.json({ status: 'success', payments, payouts })
  })

  api.get('/admin/telemetry', requireAdmin, async (req, res) => {
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined
    let query = db('client_events').orderBy('received_at', 'desc').limit(250)
    if (severity === 'warn' || severity === 'error' || severity === 'fatal') {
      query = query.where({ severity })
    }
    const events = await query
    const summaryRows = await db('client_events')
      .select('event_name', 'severity')
      .count<{ count: number }>({ count: '*' })
      .where('received_at', '>', db.raw('DATE_SUB(NOW(), INTERVAL 24 HOUR)'))
      .groupBy('event_name', 'severity')
      .orderBy('count', 'desc')
      .limit(40)
    res.json({ status: 'success', events, summary: summaryRows })
  })

  api.post('/admin/payouts', requireAdmin, async (req, res) => {
    const authorIdentityKey = String(req.body.authorIdentityKey ?? '').trim()
    const amountSats = asPositiveInteger(req.body.amountSats, 0)
    const destinationType = req.body.destinationType === 'brc100_identity' ? 'brc100_identity' : 'legacy_address'
    const destination = String(req.body.destination ?? '').trim()
    const payoutId = randomUUID()
    if (authorIdentityKey === '' || amountSats <= 0 || destination === '') {
      res.status(400).json({ status: 'error', message: 'authorIdentityKey, amountSats, and destination are required' })
      return
    }

    let status: 'queued' | 'broadcast' | 'failed' = 'queued'
    let txid: string | null = null
    let failureReason: string | null = null
    if (destinationType === 'legacy_address') {
      try {
        const lockingScript = new (P2PKH as any)().lock(destination).toHex()
        const result = await walletBootstrap.wallet.createAction({
          description: `PaperTrade payout ${payoutId}`,
          outputs: [{ lockingScript, satoshis: amountSats, outputDescription: 'PaperTrade author payout' }]
        })
        txid = result.txid ?? null
        status = txid == null ? 'queued' : 'broadcast'
      } catch (err: any) {
        status = 'failed'
        failureReason = err?.message ?? 'Payout failed'
      }
    } else {
      failureReason = 'BRC100 identity-key payouts are queued for manual direct-payment processing in this MVP.'
    }

    await db.transaction(async trx => {
      await trx('payouts').insert({
        id: payoutId,
        author_identity_key: authorIdentityKey,
        amount_sats: amountSats,
        destination_type: destinationType,
        destination,
        status,
        txid,
        failure_reason: failureReason,
        requested_by: identityKeyOf(req)
      })
      if (status === 'broadcast') {
        await trx('ledger_entries').insert({
          account_type: 'author_payable',
          account_identity_key: authorIdentityKey,
          amount_sats: -amountSats,
          source_type: 'payout',
          source_id: payoutId,
          memo: `Payout to ${destinationType}`
        })
      }
      await writeAudit('payout_created', identityKeyOf(req), 'payout', payoutId, { status, destinationType }, trx)
    })

    res.json({ status: 'success', payoutId, payoutStatus: status, txid, failureReason })
  })

  app.use(ROUTING_PREFIX, api)

  const clientRoot = path.resolve(serverDirname, '../../build')
  let cachedIndexHtml: string | null = null
  async function indexHtml (): Promise<string> {
    if (cachedIndexHtml != null) return cachedIndexHtml
    cachedIndexHtml = await fs.readFile(path.join(clientRoot, 'index.html'), 'utf8')
    return cachedIndexHtml
  }

  app.get('/manifest.json', async (_req, res, next) => {
    try {
      res.type('application/manifest+json').json(appManifest(walletBootstrap.publicKey, appearanceFromSettings(await getSettings())))
    } catch (err) {
      next(err)
    }
  })

  app.get(['/wallet-manifest.json', '/.well-known/wallet-manifest.json'], async (_req, res, next) => {
    try {
      res.type('application/manifest+json').json(walletManifest(walletBootstrap.publicKey, appearanceFromSettings(await getSettings())))
    } catch (err) {
      next(err)
    }
  })

  app.get(`${ROUTING_PREFIX}/wallet/manifest`, async (_req, res, next) => {
    try {
      res.json(walletManifest(walletBootstrap.publicKey, appearanceFromSettings(await getSettings())))
    } catch (err) {
      next(err)
    }
  })

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(robotsTxt())
  })

  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      res.type('application/xml').send(sitemapXml(await listPublishedPublicationMeta()))
    } catch (err) {
      next(err)
    }
  })

  app.use(express.static(clientRoot, { index: false, maxAge: '1h' }))
  app.get('*', async (req, res, next) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method) || !appRoutePath(req.path)) {
        next()
        return
      }
      const publicationId = req.path.match(/^\/publication\/([^/]+)$/)?.[1]
      const publication = publicationId == null ? null : await getPublishedPublicationMeta(publicationId)
      res.setHeader('Cache-Control', 'no-store')
      res.type('html').send(renderHtmlShell(await indexHtml(), metaForPath(req.path, publication, appearanceFromSettings(await getSettings()))))
    } catch (err) {
      next(err)
    }
  })

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(JSON.stringify({
      level: 'error',
      service: 'papertrade',
      event: 'api_exception',
      requestId: (req as AuthenticatedRequest).requestId,
      method: req.method,
      path: req.path,
      identityKey: identityKeyOf(req),
      message: err.message,
      stack: err.stack
    }))
    res.status(500).json({ status: 'error', message: err.message !== '' ? err.message : 'Internal server error' })
  })

  setTimeout(() => {
    void seedStarterWorks(walletBootstrap.publicKey)
      .then(() => {
        console.log(JSON.stringify({
          level: 'info',
          service: 'papertrade',
          event: 'starter_seed_complete'
        }))
      })
      .catch(err => {
        console.warn(JSON.stringify({
          level: 'warn',
          service: 'papertrade',
          event: 'starter_seed_failed',
          message: err instanceof Error ? err.message : 'Unknown starter seed error'
        }))
      })
  }, 1000)

  return app
}

createApp()
  .then(app => {
    app.listen(HTTP_PORT, () => {
      console.log(`PaperTrade listening on ${HTTP_PORT}`)
    })
  })
  .catch(err => {
    console.error('Failed to start PaperTrade:', err)
    process.exit(1)
  })
