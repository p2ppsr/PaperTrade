import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AuthFetch, P2PKH, PublicKey, Utils, WalletClient } from '@bsv/sdk'
import { BookOpen, Check, FileText, Home, Library, Settings, Upload, User } from 'lucide-react'
import './styles.css'

interface Status {
  setupComplete: boolean
  identityKey?: string
  isAdmin: boolean
  pricePerPageSats: number
  commissionBps: number
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

const API = '/api'
const WALLET_ORIGIN = (import.meta as any).env?.VITE_WALLET_ORIGIN ?? 'localhost:3321'

function getWallet (): WalletClient {
  return new WalletClient('auto', WALLET_ORIGIN)
}

function absoluteRequestUrl (url: string): string {
  return new URL(url, window.location.origin).toString()
}

function asBase64 (bytes: number[]): string {
  return Utils.toBase64(bytes)
}

function randomBase64 (length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

async function authFetch (url: string, init?: RequestInit): Promise<Response> {
  const wallet = getWallet()
  const fetcher = new AuthFetch(wallet)
  return await fetcher.fetch(absoluteRequestUrl(url), init as any)
}

async function paidPageFetch (url: string, serverPublicKey?: string): Promise<Response> {
  const wallet = getWallet()
  const fetcher = new AuthFetch(wallet)
  const requestUrl = absoluteRequestUrl(url)
  const first = await fetcher.fetch(requestUrl)
  if (first.status !== 402) return first
  if (serverPublicKey == null || serverPublicKey === '') throw new Error('Server payment key is not available')
  const sats = Number(first.headers.get('x-bsv-payment-satoshis-required') ?? '0')
  const derivationPrefix = first.headers.get('x-bsv-payment-derivation-prefix') ?? ''
  if (!Number.isInteger(sats) || sats <= 0 || derivationPrefix === '') throw new Error('Invalid payment challenge')

  const derivationSuffix = randomBase64(8)
  const { publicKey: derivedKey } = await wallet.getPublicKey({
    protocolID: [2, '3241645161d8'],
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: serverPublicKey,
    forSelf: false
  } as any)
  const lockingScript = new P2PKH().lock(PublicKey.fromString(derivedKey).toAddress()).toHex()
  const action = await wallet.createAction({
    description: `PaperTrade page payment ${sats} sats`,
    outputs: [{
      lockingScript,
      satoshis: sats,
      outputDescription: 'PaperTrade paid page',
      customInstructions: JSON.stringify({ derivationPrefix, derivationSuffix, payee: serverPublicKey })
    }],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  } as any)
  if (!Array.isArray(action.tx)) throw new Error('Wallet did not return a transaction')
  return await fetcher.fetch(requestUrl, {
    headers: {
      'x-bsv-payment': JSON.stringify({
        derivationPrefix,
        derivationSuffix,
        transaction: asBase64(action.tx)
      })
    }
  })
}

function useStatus (): [Status | null, () => Promise<void>] {
  const [status, setStatus] = useState<Status | null>(null)
  const refresh = async (): Promise<void> => {
    const res = await authFetch(`${API}/status`)
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
    void fetch(`${API}/publications`).then(async res => await res.json()).then(json => setPublications(json.publications ?? []))
  }, [])
  return (
    <section className='surface'>
      <header className='page-head'>
        <div>
          <h1>Newsstand</h1>
          <p>Read the first page free. Pay per page after that.</p>
        </div>
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
    </section>
  )
}

function PublicationDetail (): JSX.Element {
  const { id = '' } = useParams()
  const [publication, setPublication] = useState<Publication | null>(null)
  useEffect(() => {
    void fetch(`${API}/publications/${id}`).then(async res => await res.json()).then(json => setPublication(json.publication ?? null))
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
    void paidPageFetch(`${API}/publications/${id}/pages/${currentPage}`, status?.serverPublicKey)
      .then(async res => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.message ?? `Page request failed with HTTP ${res.status}`)
        }
        return await res.blob()
      })
      .then(blob => {
        if (!live) return
        setImageUrl(URL.createObjectURL(blob))
        setMessage('')
      })
      .catch(err => {
        if (!live) return
        setMessage(err instanceof Error ? err.message : 'Unable to load page')
      })
    return () => { live = false }
  }, [id, currentPage, status?.serverPublicKey])

  return (
    <section className='reader'>
      <div className='reader-toolbar'>
        <button type='button' onClick={() => navigate(`/read/${id}/${Math.max(1, currentPage - 1)}`)}>Previous</button>
        <span>Page {currentPage}</span>
        <button type='button' onClick={() => navigate(`/read/${id}/${currentPage + 1}`)}>Next</button>
      </div>
      {message !== '' && <p className='empty'>{message}</p>}
      {imageUrl != null && <img className='page-image' src={imageUrl} alt={`Page ${currentPage}`} />}
    </section>
  )
}

function Setup ({ status, refresh }: { status: Status | null, refresh: () => Promise<void> }): JSX.Element {
  const [form, setForm] = useState({
    pricePerPageSats: status?.pricePerPageSats ?? 25,
    commissionBps: status?.commissionBps ?? 1000,
    walletStorageUrl: status?.walletStorageUrl ?? 'https://storage.babbage.systems',
    mode: 'private_publish',
    serverPrivateKey: ''
  })
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (status != null) {
      setForm(f => ({
        ...f,
        pricePerPageSats: status.pricePerPageSats,
        commissionBps: status.commissionBps,
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
  }
  return (
    <section className='surface narrow'>
      <header className='page-head'><h1>First-run setup</h1></header>
      <label>Price per page <input type='number' value={form.pricePerPageSats} onChange={e => setForm({ ...form, pricePerPageSats: Number(e.target.value) })} /></label>
      <label>Commission bps <input type='number' value={form.commissionBps} onChange={e => setForm({ ...form, commissionBps: Number(e.target.value) })} /></label>
      <label>Wallet Storage URL <input value={form.walletStorageUrl} onChange={e => setForm({ ...form, walletStorageUrl: e.target.value })} /></label>
      <label>Server private key <input value={form.serverPrivateKey} onChange={e => setForm({ ...form, serverPrivateKey: e.target.value })} placeholder='Optional replacement key' /></label>
      <button className='button' type='button' onClick={() => { void submit().catch(err => setMessage(err.message)) }}><Check size={18} /> Save setup</button>
      {message !== '' && <p>{message}</p>}
    </section>
  )
}

function Author (): JSX.Element {
  const [profile, setProfile] = useState({ displayName: '', bio: '', avatarUrl: '' })
  const [message, setMessage] = useState('')
  const save = async (): Promise<void> => {
    const res = await authFetch(`${API}/me/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile)
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Could not save profile')
    setMessage('Profile saved.')
  }
  return (
    <section className='surface narrow'>
      <header className='page-head'><h1>Author profile</h1></header>
      <label>Display name <input value={profile.displayName} onChange={e => setProfile({ ...profile, displayName: e.target.value })} /></label>
      <label>Bio <textarea value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></label>
      <label>Avatar URL <input value={profile.avatarUrl} onChange={e => setProfile({ ...profile, avatarUrl: e.target.value })} /></label>
      <button className='button' type='button' onClick={() => { void save().catch(err => setMessage(err.message)) }}><Check size={18} /> Save profile</button>
      {message !== '' && <p>{message}</p>}
    </section>
  )
}

function Admin (): JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authorDisplayName, setAuthorDisplayName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [publications, setPublications] = useState<any[]>([])
  const refresh = async (): Promise<void> => {
    const res = await authFetch(`${API}/admin/publications`)
    const json = await res.json()
    setPublications(json.publications ?? [])
  }
  useEffect(() => { void refresh().catch(() => undefined) }, [])
  const createAndUpload = async (): Promise<void> => {
    const create = await authFetch(`${API}/admin/publications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description, authorDisplayName })
    })
    const created: { publicationId?: string, message?: string } = await create.json()
    if (!create.ok) throw new Error(created.message ?? 'Could not create publication')
    if (selectedFile != null) {
      const data = new FormData()
      data.append('file', selectedFile)
      const upload = await authFetch(`${API}/admin/publications/${String(created.publicationId)}/files`, { method: 'POST', body: data })
      const uploaded = await upload.json()
      if (!upload.ok) throw new Error(uploaded.message ?? 'Could not process file')
    }
    await refresh()
    setMessage('Publication created.')
  }
  const review = async (id: string, action: 'publish' | 'reject'): Promise<void> => {
    const res = await authFetch(`${API}/admin/publications/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (!res.ok) throw new Error('Review failed')
    await refresh()
  }
  return (
    <section className='surface'>
      <header className='page-head'><h1>Admin</h1><Link className='button secondary' to='/setup'>Setup</Link></header>
      <div className='admin-grid'>
        <form className='tool-panel' onSubmit={e => { e.preventDefault(); void createAndUpload().catch(err => setMessage(err.message)) }}>
          <h2>New publication</h2>
          <label>Title <input value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>Description <textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label>Author display name <input value={authorDisplayName} onChange={e => setAuthorDisplayName(e.target.value)} /></label>
          <label>PDF, docx, or ePub <input type='file' accept='.pdf,.docx,.epub' onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} /></label>
          <button className='button' type='submit'><Upload size={18} /> Create</button>
          {message !== '' && <p>{message}</p>}
        </form>
        <div className='tool-panel'>
          <h2>Publications</h2>
          {publications.map(pub => (
            <div className='row' key={pub.id}>
              <span>{pub.title}</span>
              <span>{pub.status} · {pub.page_count} pages</span>
              <button type='button' onClick={() => { void review(pub.id, 'publish') }}>Publish</button>
              <button type='button' onClick={() => { void review(pub.id, 'reject') }}>Reject</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function App (): JSX.Element {
  const [status, refresh] = useStatus()
  const needsSetup = useMemo(() => status != null && !status.setupComplete, [status])
  return (
    <BrowserRouter>
      <Shell status={status}>
        {needsSetup && location.pathname !== '/setup' && (
          <div className='setup-banner'><Link to='/setup'>Complete first-run setup</Link></div>
        )}
        <Routes>
          <Route path='/' element={<Newsstand />} />
          <Route path='/publication/:id' element={<PublicationDetail />} />
          <Route path='/read/:id/:pageNumber' element={<Reader status={status} />} />
          <Route path='/author' element={<Author />} />
          <Route path='/admin' element={<Admin />} />
          <Route path='/setup' element={<Setup status={status} refresh={refresh} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}

const root = document.getElementById('root')
if (root == null) throw new Error('Root element not found')
createRoot(root).render(<App />)
