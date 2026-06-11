export interface PublicPublicationMeta {
  id: string
  title: string
  description?: string | null
  authorName?: string | null
  pageCount?: number | null
  coverUrl?: string | null
  publishedAt?: string | null
}

export interface PageMeta {
  title: string
  description: string
  canonicalPath: string
  imagePath: string
  type?: 'website' | 'article'
  publishedAt?: string | null
  structuredData?: Record<string, unknown>
}

const DEFAULT_ORIGIN = 'https://papertrade.metanet.app'
const DEFAULT_DESCRIPTION = 'PaperTrade is a BSV newsstand where readers preview page 1 free and pay per page for independent writing with a BRC100 wallet.'
const THEME_COLOR = '#1f4f46'

export function hostingOrigin (): string {
  const raw = process.env.HOSTING_DOMAIN ?? DEFAULT_ORIGIN
  try {
    return new URL(raw).origin
  } catch {
    return DEFAULT_ORIGIN
  }
}

export function absoluteUrl (path: string): string {
  return new URL(path, hostingOrigin()).toString()
}

function escapeHtml (value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function trimDescription (value: string, fallback = DEFAULT_DESCRIPTION): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed === '') return fallback
  return trimmed.length > 220 ? `${trimmed.slice(0, 217).trim()}...` : trimmed
}

function safeJsonScript (value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function appManifest (): Record<string, unknown> {
  return {
    name: 'PaperTrade',
    short_name: 'PaperTrade',
    description: DEFAULT_DESCRIPTION,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'browser'],
    background_color: '#f7f5ef',
    theme_color: THEME_COLOR,
    orientation: 'any',
    categories: ['books', 'news', 'finance', 'productivity'],
    lang: 'en-US',
    dir: 'ltr',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
    ],
    shortcuts: [
      {
        name: 'Newsstand',
        short_name: 'Read',
        description: 'Browse live PaperTrade publications.',
        url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
      },
      {
        name: 'Author',
        short_name: 'Author',
        description: 'Manage your author profile and publications.',
        url: '/author',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
      },
      {
        name: 'About PaperTrade',
        short_name: 'About',
        description: 'Learn how PaperTrade works and deploy your own server.',
        url: '/about',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
      }
    ],
    share_target: {
      action: '/',
      method: 'GET',
      params: {
        title: 'title',
        text: 'text',
        url: 'url'
      }
    },
    metanet: groupPermissionManifest(),
    babbage: groupPermissionManifest()
  }
}

function groupPermissionManifest (): Record<string, unknown> {
  return {
    groupPermissions: {
      protocolPermissions: [
        {
          protocolID: [1, 'identity key retrieval'],
          description: 'Identify the reader, author, or admin without passwords.'
        },
        {
          protocolID: [2, 'auth message signature'],
          counterparty: 'self',
          description: 'Sign authenticated API requests to the PaperTrade server.'
        },
        {
          protocolID: [2, '3241645161d8'],
          counterparty: 'self',
          description: 'Receive PaperTrade author payouts using BRC29 payment remittance.'
        },
        {
          protocolID: [1, 'action label papertrade'],
          description: 'Label PaperTrade page payments, funding payments, and author payouts.'
        },
        {
          protocolID: [1, 'identity resolution'],
          description: 'Resolve author identity keys into user-friendly identity cards.'
        }
      ],
      spendingAuthorization: {
        amount: 100000,
        description: 'Authorize small per-page reading payments and optional server funding payments.'
      },
      basketAccess: [
        {
          basket: 'papertrade-payouts',
          description: 'Track incoming PaperTrade author payout transactions.'
        }
      ],
      certificateFieldAccess: []
    },
    counterpartyPermissions: {
      protocols: [
        {
          protocolName: 'auth message signature',
          description: 'Authenticate requests with the PaperTrade server.'
        },
        {
          protocolName: '3241645161d8',
          description: 'Use BRC29 key derivation for direct author payouts.'
        },
        {
          protocolName: 'wallet payment',
          description: 'Internalize author payout outputs created by the PaperTrade server.'
        }
      ]
    }
  }
}

export function walletManifest (serverPublicKey: string): Record<string, unknown> {
  return {
    name: 'PaperTrade',
    short_name: 'PaperTrade',
    version: '0.1.0',
    originator: new URL(hostingOrigin()).hostname,
    homepage_url: hostingOrigin(),
    app_url: hostingOrigin(),
    support_url: 'https://usercom.babbage.systems/',
    repository_url: 'https://github.com/p2ppsr/PaperTrade',
    icon_url: absoluteUrl('/icon.svg'),
    server_identity_key: serverPublicKey,
    brcs: ['BRC-100', 'BRC-29', 'BRC-73', 'BRC-116'],
    pact: {
      version: 'BRC-116',
      counterpartyTrust: [
        {
          counterparty: serverPublicKey,
          role: 'PaperTrade server wallet',
          reason: 'Receives reader page payments, creates author payout transactions, and signs authenticated server responses.'
        }
      ],
      trustModel: 'The user keeps wallet custody. PaperTrade stores publication files and accounting state, while wallets approve authentication, page payments, funding payments, and payout receipt.'
    },
    permissions: groupPermissionManifest(),
    annotatedPermissions: [
      {
        flow: 'Reader authentication',
        methods: ['AuthFetch', 'BRC100 identity key'],
        reason: 'Paid pages and existing entitlements are tied to a reader identity key.'
      },
      {
        flow: 'Per-page payments',
        methods: ['createAction via payment-express-middleware'],
        reason: 'Pages after page 1 require small BSV payments unless an unexpired entitlement exists.'
      },
      {
        flow: 'Author payout receipt',
        methods: ['internalizeAction', 'BRC29 protocol 3241645161d8'],
        reason: 'Author balances can be paid directly into the author wallet and acknowledged by the client.'
      },
      {
        flow: 'Admin funding',
        methods: ['createAction via payment-express-middleware'],
        reason: 'Admins may pre-fund the server wallet so author payouts have spendable BSV.'
      }
    ],
    dataUse: {
      stores: ['author profiles', 'publication metadata', 'rendered page entitlement records', 'payment ledger entries', 'payout audit events'],
      doesNotStore: ['user wallet seed phrases', 'wallet private keys', 'reader passwords'],
      retention: 'Reader page entitlements last 30 days. Ledger and audit records remain available to the server operator.'
    }
  }
}

export function metaForPath (pathName: string, publication?: PublicPublicationMeta | null): PageMeta {
  if (publication != null) {
    const canonicalPath = `/publication/${publication.id}`
    const description = trimDescription(publication.description ?? `${publication.title} on PaperTrade.`)
    return {
      title: `${publication.title} | PaperTrade`,
      description,
      canonicalPath,
      imagePath: publication.coverUrl ?? `/api/publications/${publication.id}/cover`,
      type: 'article',
      publishedAt: publication.publishedAt,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: publication.title,
        description,
        author: {
          '@type': 'Person',
          name: publication.authorName ?? 'PaperTrade author'
        },
        isAccessibleForFree: 'False',
        url: absoluteUrl(canonicalPath),
        image: absoluteUrl(publication.coverUrl ?? `/api/publications/${publication.id}/cover`),
        numberOfPages: publication.pageCount ?? undefined,
        datePublished: publication.publishedAt ?? undefined
      }
    }
  }

  if (pathName === '/about') {
    return {
      title: 'About PaperTrade | BSV per-page publishing',
      description: 'PaperTrade is an open-source BSV newsstand for per-page writing, BRC100 wallet onboarding, author payouts, and self-hosted publishing servers.',
      canonicalPath: '/about',
      imagePath: '/og-image.svg',
      type: 'website',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'PaperTrade',
        applicationCategory: 'PublishingApplication',
        operatingSystem: 'Web',
        url: absoluteUrl('/about'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        codeRepository: 'https://github.com/p2ppsr/PaperTrade'
      }
    }
  }

  const isReader = pathName.startsWith('/read/')
  return {
    title: isReader ? 'Read on PaperTrade' : 'PaperTrade | BSV per-page publishing newsstand',
    description: isReader ? 'Read page 1 free, then use a BRC100 wallet for paid PaperTrade pages.' : DEFAULT_DESCRIPTION,
    canonicalPath: isReader ? pathName : '/',
    imagePath: '/og-image.svg',
    type: 'website',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PaperTrade',
      url: hostingOrigin(),
      description: DEFAULT_DESCRIPTION
    }
  }
}

export function renderHtmlShell (template: string, meta: PageMeta): string {
  const canonical = absoluteUrl(meta.canonicalPath)
  const image = absoluteUrl(meta.imagePath)
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    '<meta property="og:site_name" content="PaperTrade" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${meta.type ?? 'website'}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta property="og:image:alt" content="PaperTrade publication preview" />',
    meta.publishedAt != null ? `<meta property="article:published_time" content="${escapeHtml(meta.publishedAt)}" />` : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="theme-color" content="${THEME_COLOR}" />`,
    meta.structuredData != null ? `<script type="application/ld+json">${safeJsonScript(meta.structuredData)}</script>` : ''
  ].filter(Boolean).join('\n    ')

  const dynamicBlock = `<!--papertrade-ssr-meta-->\n    ${tags}\n    <!--/papertrade-ssr-meta-->`
  const dynamicPattern = /<!--papertrade-ssr-meta-->[\s\S]*?<!--\/papertrade-ssr-meta-->/
  if (dynamicPattern.test(template)) return template.replace(dynamicPattern, dynamicBlock)
  return template.replace('<!--papertrade-ssr-meta-->', tags)
}

export function robotsTxt (): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /author',
    'Disallow: /setup',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n')
}

export function sitemapXml (publications: PublicPublicationMeta[]): string {
  const urls: Array<{ loc: string, priority: string, lastmod?: string }> = [
    { loc: absoluteUrl('/'), priority: '1.0' },
    { loc: absoluteUrl('/about'), priority: '0.7' },
    ...publications.map(pub => ({
      loc: absoluteUrl(`/publication/${pub.id}`),
      priority: '0.8',
      lastmod: pub.publishedAt ?? undefined
    }))
  ]
  const body = urls.map(url => [
    '  <url>',
    `    <loc>${escapeHtml(url.loc)}</loc>`,
    url.lastmod != null ? `    <lastmod>${escapeHtml(url.lastmod)}</lastmod>` : '',
    `    <priority>${url.priority}</priority>`,
    '  </url>'
  ].filter(Boolean).join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}
