/* eslint-disable @typescript-eslint/no-misused-promises */
import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import bodyParser from 'body-parser'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { P2PKH } from '@bsv/sdk'
import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import { db, getSettings, isAdmin, writeAudit } from './db.js'
import { asPositiveInteger, splitCommission } from './money.js'
import { createServerWallet, replacePersistedServerKey } from './wallet.js'
import { processPublicationFile } from './content.js'

const serverDirname = path.dirname(fileURLToPath(import.meta.url))
const HTTP_PORT = Number(process.env.HTTP_PORT ?? process.env.PORT ?? '3001')
const ROUTING_PREFIX = process.env.ROUTING_PREFIX ?? '/api'
const DATA_DIR = process.env.DATA_DIR ?? '/data/papertrade'
const upload = multer({ dest: path.join(DATA_DIR, 'tmp'), limits: { fileSize: 250 * 1024 * 1024 } })

interface AuthenticatedRequest extends Request {
  auth?: { identityKey: string }
  payment?: { satoshisPaid: number, accepted?: boolean, tx?: string }
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

async function sendPageImage (req: Request, res: Response): Promise<void> {
  const pageNumber = Number(req.params.pageNumber)
  const publication = await db('publications').where({ id: req.params.id, status: 'published' }).first()
  if (publication == null) {
    res.status(404).json({ status: 'error', message: 'Publication not found' })
    return
  }
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
  res.sendFile(page.image_path)
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

async function createApp (): Promise<express.Express> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await db.migrate.latest()
  const walletBootstrap = await createServerWallet()

  const app = express()
  app.disable('x-powered-by')
  app.use(bodyParser.json({ limit: '10mb' }))
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
        wallet_storage_url: walletStorageUrl
      })
      await trx('admins').insert({ identity_key: actor, added_by: actor }).onConflict('identity_key').ignore()
      await writeAudit(alreadySetup ? 'setup_updated' : 'setup_completed', actor, 'server_settings', '1', {
        mode,
        pricePerPageSats,
        commissionBps,
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
    const profile = await db('authors').where({ identity_key: identityKey }).first()
    res.json({ status: 'success', profile })
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
      avatar_url: req.body.avatarUrl ?? null
    }).onConflict('identity_key').merge({
      display_name: displayName,
      bio: req.body.bio ?? null,
      avatar_url: req.body.avatarUrl ?? null,
      updated_at: db.fn.now()
    })
    await writeAudit('author_profile_updated', identityKey, 'author', identityKey)
    res.json({ status: 'success' })
  })

  api.get('/admin/publications', requireAdmin, async (_req, res) => {
    const rows = await db('publications')
      .join('authors', 'authors.identity_key', 'publications.author_identity_key')
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
    if (req.file == null) {
      res.status(400).json({ status: 'error', message: 'file is required' })
      return
    }
    try {
      const processed = await processPublicationFile(publication.id, req.file.path, req.file.originalname)
      await db.transaction(async trx => {
        await trx('publication_files').where({ publication_id: publication.id }).delete()
        await trx('publication_pages').where({ publication_id: publication.id }).delete()
        await trx('publication_files').insert([
          {
            id: randomUUID(),
            publication_id: publication.id,
            kind: 'source',
            original_filename: req.file?.originalname,
            mime_type: req.file?.mimetype,
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
          source_format: path.extname(req.file?.originalname ?? '').replace('.', '').toLowerCase(),
          updated_at: trx.fn.now()
        })
        await writeAudit('publication_file_processed', actor, 'publication', publication.id, { pageCount: processed.pageCount }, trx)
      })
      res.json({ status: 'success', pageCount: processed.pageCount })
    } catch (err) {
      await fs.rm(req.file.path, { force: true })
      throw err
    }
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
    const status = action === 'publish' ? 'published' : 'rejected'
    await db('publications').where({ id: req.params.id }).update({
      status,
      reviewed_by: identityKeyOf(req),
      review_note: req.body.note ?? null,
      published_at: action === 'publish' ? db.fn.now() : null,
      updated_at: db.fn.now()
    })
    await writeAudit(`publication_${status}`, identityKeyOf(req), 'publication', req.params.id, { note: req.body.note })
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
  app.get(['/', '/publication/:id', '/read/:id/:pageNumber', '/author', '/admin', '/setup'], (_req, res) => {
    res.sendFile(path.join(clientRoot, 'index.html'))
  })

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
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
