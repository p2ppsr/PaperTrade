import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AuthFetch, WalletClient } from '@bsv/sdk'
import { BookOpen, Check, ExternalLink, FileText, Home, Library, MessageCircle, Settings, Upload, User } from 'lucide-react'
import './styles.css'

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
}

interface Publication {
  id: string
  title: string
  description?: string
  authorName?: string
  authorIdentityKey: string
  pageCount: number
  publishedAt?: string
}

interface AuthorProfile {
  identity_key: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  display_unit?: 'sats' | 'usd_cents' | null
}

const API = '/api'
const WALLET_ORIGIN = (import.meta as any).env?.VITE_WALLET_ORIGIN ?? 'localhost:3321'
const USERCOM_SOURCE = 'papertrade'
const USERCOM_SUBMIT_ENDPOINT = 'https://usercom.babbage.systems/submit'
const USERCOM_SIGNAL_ENDPOINT = 'https://usercom.babbage.systems/signal'
const GET_METANET_URL = 'https://getmetanet.com'
const WALLET_TIMEOUT_MS = 20000

function getWallet (): WalletClient {
  return new WalletClient('auto', WALLET_ORIGIN)
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

async function uploadJsonFile (url: string, file: File): Promise<Response> {
  return await authFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type === '' ? 'application/octet-stream' : file.type,
      dataBase64: await fileToBase64(file)
    })
  })
}

function paymentUnitLabel (unit: 'sats' | 'usd_cents'): string {
  return unit === 'usd_cents' ? 'USD cents' : 'sats'
}

async function authFetch (url: string, init?: RequestInit): Promise<Response> {
  const wallet = getWallet()
  const fetcher = new AuthFetch(wallet)
  return await fetcher.fetch(absoluteRequestUrl(url), init as any)
}

async function withWalletTimeout<T> (promise: Promise<T>, action: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Wallet request timed out while trying to ${action}. Check that your BRC100 wallet is open and approve the request, then retry.`))
    }, WALLET_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId)
  }
}

async function paidPageFetch (url: string): Promise<Response> {
  return await withWalletTimeout(authFetch(url), 'pay for this page')
}

async function pageFetch (url: string, pageNumber: number): Promise<Response> {
  if (pageNumber === 1) return await fetch(url)
  return await paidPageFetch(url)
}

async function responseToPngBlob (res: Response, fallbackMessage: string): Promise<Blob> {
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.message ?? json.description ?? `${fallbackMessage} with HTTP ${res.status}`)
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
  const existing = storage.getItem(key)
  if (existing != null && existing !== '') return existing
  const id = randomId()
  storage.setItem(key, id)
  return id
}

function tagValue (value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
}

function cleanContext (context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function usercomMetadata ({ surface, tags = [], context = {} }: { surface: string, tags?: string[], context?: Record<string, unknown> }): Record<string, unknown> {
  return {
    source: USERCOM_SOURCE,
    surface,
    url: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer === '' ? undefined : document.referrer,
    anonymousId: getStoredId(window.localStorage, 'papertrade_anonymous_id'),
    sessionId: getStoredId(window.sessionStorage, 'papertrade_session_id'),
    tags: [`surface:${tagValue(surface)}`, ...tags].filter(Boolean),
    context: cleanContext(context)
  }
}

function postSignal (name: string, metadata: Record<string, unknown>): void {
  try {
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
  const lower = raw.toLowerCase()
  if (lower.includes('wallet') || lower.includes('communication substrate') || lower.includes('auth') || lower.includes('identity')) {
    return `${raw}. PaperTrade needs a BRC100 wallet for protected actions and paid pages.`
  }
  return raw === '' ? fallback : raw
}

function WalletHelp ({ message }: { message: string }): JSX.Element | null {
  const lower = message.toLowerCase()
  if (!(lower.includes('wallet') || lower.includes('brc100') || lower.includes('payment') || lower.includes('auth'))) return null
  return (
    <div className='wallet-help'>
      <div>
        <strong>BRC100 wallet required</strong>
        <p>Install or open a Metanet-compatible wallet, then retry this action.</p>
      </div>
      <a className='button secondary' href={GET_METANET_URL} target='_blank' rel='noreferrer'><ExternalLink size={18} /> Get Metanet</a>
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
      {message !== '' && <p className='notice compact'>{message}</p>}
    </section>
  )
}

function Analytics ({ status }: { status: Status | null }): null {
  const location = useLocation()
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
    const res = await fetch(`${API}/status`)
    const json = await res.json()
    setStatus(json)
  }
  useEffect(() => { void refresh() }, [])
  return [status, refresh]
}

function Shell ({ children, status }: { children: React.ReactNode, status: Status | null }): JSX.Element {
  return (
    <div className='app-shell'>
      <aside className='side'>
        <Link className='brand' to='/'><Library size={26} /> PaperTrade</Link>
        <nav>
          <Link to='/'><Home size={18} /> Newsstand</Link>
          <Link to='/author'><User size={18} /> Author</Link>
          <Link to='/admin'><Settings size={18} /> Admin</Link>
        </nav>
        <div className='status-line'>
          <span>{status?.setupComplete === true ? 'Configured' : 'Setup required'}</span>
          <span>{status?.isAdmin === true ? 'Admin' : status?.identityKey != null ? 'Reader' : 'Guest'}</span>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  )
}

function Newsstand (): JSX.Element {
  const [publications, setPublications] = useState<Publication[]>([])
  useEffect(() => {
    void fetch(`${API}/publications`).then(async res => await res.json()).then(json => {
      const rows = json.publications ?? []
      setPublications(rows)
      postSignal('newsstand.loaded', usercomMetadata({ surface: 'newsstand', tags: ['reader'], context: { publicationCount: rows.length } }))
    })
  }, [])
  return (
    <section className='surface'>
      <header className='page-head newsstand-head'>
        <div>
          <h1>Newsstand</h1>
          <p>Read page 1 free. Pay per page after that with a BRC100 wallet.</p>
        </div>
        <a className='button secondary' href={GET_METANET_URL} target='_blank' rel='noreferrer'><ExternalLink size={18} /> Get Metanet</a>
      </header>
      <div className='publication-grid'>
        {publications.map(pub => (
          <article className='publication' key={pub.id}>
            <div className='pub-icon'><FileText /></div>
            <h2>{pub.title}</h2>
            <p>{pub.description}</p>
            <footer>
              <span>{pub.authorName ?? pub.authorIdentityKey.slice(0, 12)}</span>
              <span>{pub.pageCount} pages</span>
            </footer>
            <Link className='button' to={`/publication/${pub.id}`}>Open</Link>
          </article>
        ))}
        {publications.length === 0 && <p className='empty'>No publications are live yet.</p>}
      </div>
      <FeedbackPanel surface='newsstand' />
    </section>
  )
}

function PublicationDetail (): JSX.Element {
  const { id = '' } = useParams()
  const [publication, setPublication] = useState<Publication | null>(null)
  useEffect(() => {
    void fetch(`${API}/publications/${id}`).then(async res => await res.json()).then(json => {
      const loaded = json.publication ?? null
      setPublication(loaded)
      if (loaded != null) postSignal('publication.view', usercomMetadata({ surface: 'publication', tags: ['reader'], context: { publicationId: id, pageCount: loaded.pageCount } }))
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
      </header>
      <div className='facts'>
        <span>{publication.authorName}</span>
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
  const navigate = useNavigate()

  useEffect(() => {
    let live = true
    setImageUrl(null)
    setMessage('Loading page...')
    void pageFetch(`${API}/publications/${id}/pages/${currentPage}`, currentPage)
      .then(async res => await responseToPngBlob(res, 'Page request failed'))
      .then(blob => {
        if (!live) return
        setImageUrl(URL.createObjectURL(blob))
        setMessage('')
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
        postSignal('reader.page_failed', usercomMetadata({ surface: 'reader', tags: ['error'], context: { publicationId: id, pageNumber: currentPage, message: nextMessage } }))
      })
    return () => { live = false }
  }, [id, currentPage])

  return (
    <section className='reader'>
      <div className='reader-toolbar'>
        <button type='button' onClick={() => navigate(`/read/${id}/${Math.max(1, currentPage - 1)}`)}>Previous</button>
        <span>Page {currentPage}</span>
        <button type='button' onClick={() => navigate(`/read/${id}/${currentPage + 1}`)}>Next</button>
      </div>
      {message !== '' && <p className='empty'>{message}</p>}
      <WalletHelp message={message} />
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

  useEffect(() => {
    let live = true
    setImageUrl(null)
    setMessage('Loading preview...')
    void authFetch(`${API}/me/publications/${id}/pages/${currentPage}`)
      .then(async res => await responseToPngBlob(res, 'Preview failed'))
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
        <Link className='button secondary' to='/author'>Back to author</Link>
        <button type='button' onClick={() => navigate(`/author/read/${id}/${Math.max(1, currentPage - 1)}`)}>Previous</button>
        <span>Preview page {currentPage}</span>
        <button type='button' onClick={() => navigate(`/author/read/${id}/${currentPage + 1}`)}>Next</button>
      </div>
      {message !== '' && <p className='empty'>{message}</p>}
      <WalletHelp message={message} />
      {imageUrl != null && <img className='page-image' src={imageUrl} alt={`Preview page ${currentPage}`} />}
    </section>
  )
}

function Setup ({ status, refresh }: { status: Status | null, refresh: () => Promise<void> }): JSX.Element {
  const [form, setForm] = useState({
    pricePerPageSats: status?.pricePerPageSats ?? 25,
    commissionBps: status?.commissionBps ?? 1000,
    displayUnit: status?.displayUnit ?? 'sats',
    walletStorageUrl: status?.walletStorageUrl ?? 'https://storage.babbage.systems',
    mode: status?.mode ?? 'private_publish',
    serverPrivateKey: ''
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
        walletStorageUrl: status.walletStorageUrl
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
          <span className='step-label'>3 Wallet</span>
          <label>Wallet Storage URL <input value={form.walletStorageUrl} onChange={e => setForm({ ...form, walletStorageUrl: e.target.value })} /></label>
          <label>Server private key <input value={form.serverPrivateKey} onChange={e => setForm({ ...form, serverPrivateKey: e.target.value })} placeholder='Optional replacement key' /></label>
          <p className='hint'>The first BRC100 identity to save setup becomes an admin.</p>
        </section>
      </div>
      <button className='button primary-action' type='button' onClick={() => { void submit().catch(err => setMessage(err.message)) }}><Check size={18} /> Save setup</button>
      {message !== '' && <p className='notice'>{message}</p>}
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
  const load = async (): Promise<void> => {
    const [profileRes, publicationsRes, ledgerRes] = await Promise.all([
      withWalletTimeout(authFetch(`${API}/me/profile`), 'load your author profile'),
      withWalletTimeout(authFetch(`${API}/me/publications`), 'load your publications'),
      withWalletTimeout(authFetch(`${API}/me/ledger`), 'load your author ledger')
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
      {message !== '' && <p className='notice'>{message}</p>}
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
        <p>Current author balance: {balanceSats} sats. Admins create payouts from author balances in the Admin tab.</p>
        {payouts.map(payout => (
          <div className='row' key={payout.id}>
            <span>{payout.amount_sats} sats</span>
            <span>{payout.status}</span>
            <span>{payout.destination_type}</span>
          </div>
        ))}
        {payouts.length === 0 && <p className='empty'>No payouts recorded yet. Admins initiate payouts from the Admin tab.</p>}
      </section>
    </section>
  )
}

function Admin (): JSX.Element {
  const [message, setMessage] = useState('')
  const [publications, setPublications] = useState<any[]>([])
  const [authorBalances, setAuthorBalances] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [payoutForm, setPayoutForm] = useState({
    authorIdentityKey: '',
    amountSats: 0,
    destinationType: 'legacy_address',
    destination: ''
  })
  const refresh = async (): Promise<void> => {
    const [pubRes, ledgerRes, paymentRes] = await Promise.all([
      withWalletTimeout(authFetch(`${API}/admin/publications`), 'load publication review'),
      withWalletTimeout(authFetch(`${API}/admin/ledger`), 'load the ledger'),
      withWalletTimeout(authFetch(`${API}/admin/payments`), 'load payments')
    ])
    const pubJson = await pubRes.json()
    const ledgerJson = await ledgerRes.json()
    const paymentJson = await paymentRes.json()
    if (!pubRes.ok) throw new Error(pubJson.message ?? 'Could not load publication review')
    if (!ledgerRes.ok) throw new Error(ledgerJson.message ?? 'Could not load ledger')
    if (!paymentRes.ok) throw new Error(paymentJson.message ?? 'Could not load payments')
    setPublications(pubJson.publications ?? [])
    setAuthorBalances(ledgerJson.authorBalances ?? [])
    setPayouts(paymentJson.payouts ?? [])
  }
  useEffect(() => { void refresh().catch(err => setMessage(friendlyErrorMessage(err, 'Could not load admin workspace'))) }, [])
  const review = async (id: string, action: 'publish' | 'reject'): Promise<void> => {
    const res = await authFetch(`${API}/admin/publications/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (!res.ok) throw new Error('Review failed')
    await refresh()
    setMessage(action === 'publish' ? 'Publication published.' : 'Publication rejected.')
    postSignal('admin.publication_reviewed', usercomMetadata({ surface: 'admin', tags: [`action:${action}`], context: { publicationId: id } }))
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
  return (
    <section className='surface'>
      <header className='page-head'>
        <div>
          <h1>Admin</h1>
          <p>Review submitted publications and manage server configuration.</p>
        </div>
        <Link className='button secondary' to='/setup'>Server setup</Link>
      </header>
      <section className='tool-panel'>
        <h2>Publication review</h2>
        {publications.map(pub => (
          <div className='row' key={pub.id}>
            <span>{pub.title}</span>
            <span>{pub.display_name ?? 'Unknown author'}</span>
            <span>{pub.status} · {pub.page_count} pages</span>
            <button type='button' onClick={() => { void review(pub.id, 'publish') }}>Publish</button>
            <button type='button' onClick={() => { void review(pub.id, 'reject') }}>Reject</button>
          </div>
        ))}
        {publications.length === 0 && <p className='empty'>No publications to review yet.</p>}
      </section>
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
                <span>{balance.account_identity_key}</span>
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
      {message !== '' && <p className='notice'>{message}</p>}
      <WalletHelp message={message} />
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
        <Route path='/' element={<Newsstand />} />
        <Route path='/publication/:id' element={<PublicationDetail />} />
        <Route path='/read/:id/:pageNumber' element={<Reader status={status} />} />
        <Route path='/author' element={<Author status={status} />} />
        <Route path='/author/read/:id/:pageNumber' element={<AuthorPreview />} />
        <Route path='/admin' element={<Admin />} />
        <Route path='/setup' element={<Setup status={status} refresh={refresh} />} />
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
