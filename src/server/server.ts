/* eslint-disable @typescript-eslint/no-misused-promises */
import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import bodyParser from 'body-parser'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { createHash, randomUUID } from 'crypto'
import { P2PKH } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import { db, getSettings, isAdmin, writeAudit } from './db.js'
import { asPositiveInteger, splitCommission } from './money.js'
import { createServerWallet, replacePersistedServerKey } from './wallet.js'
import { getPublicationDir, processPublicationFile } from './content.js'

const serverDirname = path.dirname(fileURLToPath(import.meta.url))
const HTTP_PORT = Number(process.env.HTTP_PORT ?? process.env.PORT ?? '3001')
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api'
const DATA_DIR = process.env.DATA_DIR ?? '/data/papertrade'
const upload = multer({ dest: path.join(DATA_DIR, 'tmp'), limits: { fileSize: 250 * 1024 * 1024 } })
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '80mb'
const MAX_JSON_UPLOAD_BYTES = 40 * 1024 * 1024
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

interface AuthenticatedRequest extends Request {
  auth?: { identityKey: string }
  payment?: { satoshisPaid: number, accepted?: boolean, tx?: string }
}

interface JsonUploadBody {
  fileName?: unknown
  mimeType?: unknown
  dataBase64?: unknown
}

function identityKeyOf (req: Request): string | undefined {
  const identityKey = (req as AuthenticatedRequest).auth?.identityKey
  return identityKey === 'unknown' ? undefined : identityKey
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

async function sendPngResponse (req: Request, res: Response, filePath: string): Promise<void> {
  const image = await fs.readFile(filePath)
  if (req.query.format === 'json') {
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

async function calculatePagePrice (req: Request): Promise<number> {
  const pageNumber = Number(req.params.pageNumber)
  if (pageNumber === 1) return 0
  const publication = await db('publications')
    .where({ id: req.params.id, status: 'published' })
    .first()
  if (publication == null) return 0
  const readerIdentityKey = identityKeyOf(req)
  if (await hasValidEntitlement(publication.id, pageNumber, readerIdentityKey)) return 0
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

async function sendPublicationPageImage (publication: any, pageNumber: number, req: Request, res: Response): Promise<void> {
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
  res.setHeader('Cache-Control', 'private, max-age=60')
  await sendPngResponse(req, res, page.image_path)
}

async function sendPageImage (req: Request, res: Response): Promise<void> {
  const pageNumber = Number(req.params.pageNumber)
  const publication = await db('publications').where({ id: req.params.id, status: 'published' }).first()
  if (publication == null) {
    res.status(404).json({ status: 'error', message: 'Publication not found' })
    return
  }
  await sendPublicationPageImage(publication, pageNumber, req, res)
}

function publicPublicationFields (row: any): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authorIdentityKey: row.author_identity_key,
    authorName: row.display_name,
    pageCount: Number(row.page_count),
    publishedAt: row.published_at
  }
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

async function createApp (): Promise<express.Express> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await db.migrate.latest()
  const walletBootstrap = await createServerWallet()

  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const startedAt = Date.now()
    res.on('finish', () => {
      if (req.path.startsWith(ROUTING_PREFIX) && res.statusCode >= 400) {
        console.warn(JSON.stringify({
          level: 'warn',
          service: 'papertrade',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt
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

  app.use(createAuthMiddleware({ wallet: walletBootstrap.wallet, allowUnauthenticated: true }))

  const pagePaymentMiddleware = createPaymentMiddleware({
    wallet: walletBootstrap.wallet,
    calculateRequestPrice: calculatePagePrice as any
  })

  const api = express.Router()

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
      await trx('server_settings').where({ id: 1 }).update({
        setup_complete: true,
        mode,
        price_per_page_sats: pricePerPageSats,
        commission_bps: commissionBps,
        display_unit: displayUnit,
        wallet_storage_url: walletStorageUrl
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
        walletStorageUrl
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
    res.json({ status: 'success', publications: rows.map(publicPublicationFields) })
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

  api.get('/publications/:id/pages/:pageNumber', requireReaderForPaidPage, pagePaymentMiddleware, async (req, res, next) => {
    try {
      await sendPageImage(req, res)
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
    const balance = await db('ledger_entries')
      .where({ account_type: 'author_payable', account_identity_key: identityKey })
      .sum<{ balance_sats: string | number | null }>({ balance_sats: 'amount_sats' })
      .first()
    const payouts = await db('payouts')
      .where({ author_identity_key: identityKey })
      .orderBy('created_at', 'desc')
      .limit(50)
    res.json({ status: 'success', balanceSats: Number(balance?.balance_sats ?? 0), payouts })
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
    await sendPublicationPageImage(publication, Number(req.params.pageNumber), req, res)
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
    const action = req.body.action === 'reject' ? 'reject' : 'publish'
    if (action === 'reject') {
      const publication = await db('publications').where({ id: req.params.id }).first()
      if (publication == null) {
        res.status(404).json({ status: 'error', message: 'Publication not found' })
        return
      }
      await deletePublication(publication.id, identityKeyOf(req))
      res.json({ status: 'success', deleted: true })
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

  api.get('/admin/settings', requireAdmin, async (_req, res) => {
    const settings = await getSettings()
    const admins = await db('admins').orderBy('created_at', 'asc')
    res.json({ status: 'success', settings, admins })
  })

  api.put('/admin/settings', requireAdmin, async (req, res) => {
    const settings = {
      mode: req.body.mode === 'public_submissions' ? 'public_submissions' : 'private_publish',
      price_per_page_sats: asPositiveInteger(req.body.pricePerPageSats, 25),
      commission_bps: asPositiveInteger(req.body.commissionBps, 1000),
      display_unit: displayUnitFromBody(req.body.displayUnit),
      wallet_storage_url: String(req.body.walletStorageUrl ?? 'https://storage.babbage.systems')
    }
    if (settings.commission_bps > 10000) {
      res.status(400).json({ status: 'error', message: 'Commission cannot exceed 100%' })
      return
    }
    await db('server_settings').where({ id: 1 }).update(settings)
    await writeAudit('settings_updated', identityKeyOf(req), 'server_settings', '1', settings)
    res.json({ status: 'success' })
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
  app.use(express.static(clientRoot))
  app.get(['/', '/publication/:id', '/read/:id/:pageNumber', '/author', '/author/read/:id/:pageNumber', '/admin', '/setup'], (_req, res) => {
    res.sendFile(path.join(clientRoot, 'index.html'))
  })

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(JSON.stringify({
      level: 'error',
      service: 'papertrade',
      method: req.method,
      path: req.path,
      message: err.message,
      stack: err.stack
    }))
    res.status(500).json({ status: 'error', message: err.message !== '' ? err.message : 'Internal server error' })
  })

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
