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
  siteName: string
  themeColor: string
  type?: 'website' | 'article'
  publishedAt?: string | null
  structuredData?: Record<string, unknown>
}

export interface AppearanceMeta {
  serverName?: string
  newsstandLabel?: string
  tagline?: string
  metaTitle?: string
  metaDescription?: string
  theme?: {
    primary?: string
    accent?: string
    background?: string
    surface?: string
    text?: string
    muted?: string
    border?: string
  }
  logoUrl?: string | null
  iconUrl?: string | null
  ogImageUrl?: string | null
}

const DEFAULT_ORIGIN = 'https://papertrade.metanet.app'
const LEGACY_DEFAULT_TAGLINE = 'Read page 1 free. Pay per page after that with a BRC100 wallet.'
const DEFAULT_TAGLINE = 'Start reading free. Continue page by page when you are ready.'
const LEGACY_DEFAULT_DESCRIPTION = 'PaperTrade is a BSV newsstand where readers preview page 1 free and pay per page for independent writing with a BRC100 wallet.'
const DEFAULT_DESCRIPTION = 'PaperTrade is a reader-first BSV newsstand for independent writing, with free first-page previews and page-by-page access.'
const THEME_COLOR = '#1f4f46'
const DEFAULT_APPEARANCE: Required<Omit<AppearanceMeta, 'theme'>> & { theme: Required<NonNullable<AppearanceMeta['theme']>> } = {
  serverName: 'PaperTrade',
  newsstandLabel: 'Newsstand',
  tagline: DEFAULT_TAGLINE,
  metaTitle: 'PaperTrade | BSV per-page publishing newsstand',
  metaDescription: DEFAULT_DESCRIPTION,
  logoUrl: null,
  iconUrl: null,
  ogImageUrl: null,
  theme: {
    primary: THEME_COLOR,
    accent: '#b2772c',
    background: '#f7f5ef',
    surface: '#ffffff',
    text: '#20231f',
    muted: '#5c6570',
    border: '#ddd8ca'
  }
}

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

function normalizedTagline (value?: string): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  return text === '' || text === LEGACY_DEFAULT_TAGLINE ? DEFAULT_TAGLINE : text
}

function normalizedDescription (value?: string): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  return text === '' || text === LEGACY_DEFAULT_DESCRIPTION ? DEFAULT_DESCRIPTION : text
}

function normalizeAppearance (appearance?: AppearanceMeta | null): typeof DEFAULT_APPEARANCE {
  return {
    ...DEFAULT_APPEARANCE,
    ...appearance,
    serverName: appearance?.serverName?.trim() !== '' && appearance?.serverName != null ? appearance.serverName : DEFAULT_APPEARANCE.serverName,
    newsstandLabel: appearance?.newsstandLabel?.trim() !== '' && appearance?.newsstandLabel != null ? appearance.newsstandLabel : DEFAULT_APPEARANCE.newsstandLabel,
    tagline: normalizedTagline(appearance?.tagline),
    metaTitle: appearance?.metaTitle?.trim() !== '' && appearance?.metaTitle != null ? appearance.metaTitle : DEFAULT_APPEARANCE.metaTitle,
    metaDescription: normalizedDescription(appearance?.metaDescription),
    logoUrl: appearance?.logoUrl ?? null,
    iconUrl: appearance?.iconUrl ?? null,
    ogImageUrl: appearance?.ogImageUrl ?? null,
    theme: {
      ...DEFAULT_APPEARANCE.theme,
      ...appearance?.theme
    }
  }
}

export function appManifest (serverPublicKey?: string, appearance?: AppearanceMeta | null): Record<string, unknown> {
  const app = normalizeAppearance(appearance)
  const metanet = metanetManifest(serverPublicKey)
  const icon = app.iconUrl ?? '/icon.svg'
  return {
    name: app.serverName,
    short_name: app.serverName.slice(0, 24),
    description: app.metaDescription,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'browser'],
    background_color: app.theme.background,
    theme_color: app.theme.primary,
    orientation: 'any',
    categories: ['books', 'news', 'finance', 'productivity'],
    lang: 'en-US',
    dir: 'ltr',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any maskable' }
    ],
    shortcuts: [
      {
        name: app.newsstandLabel,
        short_name: 'Read',
        description: `Browse live ${app.serverName} publications.`,
        url: '/',
        icons: [{ src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }]
      },
      {
        name: 'Author',
        short_name: 'Author',
        description: 'Manage your author profile and publications.',
        url: '/author',
        icons: [{ src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }]
      },
      {
        name: `About ${app.serverName}`,
        short_name: 'About',
        description: `Learn how ${app.serverName} works and deploy your own server.`,
        url: '/about',
        icons: [{ src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }]
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
    metanet,
    babbage: legacyBabbageManifest(metanet)
  }
}

function metanetManifest (serverPublicKey?: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    brcs: ['BRC-100', 'BRC-29', 'BRC-73', 'BRC-116'],
    repositoryUrl: 'https://github.com/p2ppsr/PaperTrade',
    supportUrl: 'https://usercom.babbage.systems/',
    serverIdentityKey: serverPublicKey,
    trustModel: 'The user keeps wallet custody. PaperTrade stores publication files and accounting state, while wallets approve authentication, page payments, funding payments, and payout receipt.',
    groupPermissions: {
      description: 'Read, publish, and receive PaperTrade payouts.',
      protocolPermissions: [
        {
          protocolID: [2, 'server hmac'],
          counterparty: 'self',
          description: 'Authenticate PaperTrade server challenges.'
        },
        {
          protocolID: [1, 'identity key retrieval'],
          description: 'Use your identity key for BRC100 login.'
        },
        {
          protocolID: [2, 'auth message signature'],
          counterparty: serverPublicKey ?? 'self',
          description: 'Sign in to PaperTrade and verify server responses.'
        },
        {
          protocolID: [2, '3241645161d8'],
          counterparty: 'self',
          description: 'Receive author payouts.'
        },
        {
          protocolID: [1, 'action label papertrade'],
          description: 'Label PaperTrade wallet actions.'
        },
        {
          protocolID: [1, 'identity resolution'],
          description: 'Show readable identity cards.'
        }
      ],
      spendingAuthorization: {
        amount: 100000,
        duration: 2592000,
        description: 'Pay for pages and funding.'
      },
      basketAccess: [
        {
          basket: 'papertrade-payouts',
          description: 'Track received payouts.'
        }
      ],
      certificateAccess: []
    },
    counterpartyPermissions: {
      description: 'Trust the PaperTrade server for direct payout flows.',
      protocols: [
        {
          protocolName: 'auth message signature',
          description: 'Authenticate server requests.'
        },
        {
          protocolName: '3241645161d8',
          description: 'Receive BRC29 payouts.'
        },
        {
          protocolName: 'wallet payment',
          description: 'Internalize payout outputs.'
        }
      ]
    },
    counterpartyTrust: {
      server: serverPublicKey,
      description: 'PaperTrade server wallet receives reader payments, creates payout transactions, and signs authenticated server responses.'
    }
  }
}

export function walletManifest (serverPublicKey: string, appearance?: AppearanceMeta | null): Record<string, unknown> {
  const app = normalizeAppearance(appearance)
  return {
    ...appManifest(serverPublicKey, app),
    originator: new URL(hostingOrigin()).hostname,
    homepage_url: hostingOrigin(),
    app_url: hostingOrigin(),
    icon_url: absoluteUrl(app.iconUrl ?? '/icon.svg')
  }
}

function legacyBabbageManifest (metanet: Record<string, unknown>): Record<string, unknown> {
  return {
    groupPermissions: metanet.groupPermissions,
    counterpartyPermissions: metanet.counterpartyPermissions
  }
}

export function metaForPath (pathName: string, publication?: PublicPublicationMeta | null, appearance?: AppearanceMeta | null): PageMeta {
  const app = normalizeAppearance(appearance)
  if (publication != null) {
    const canonicalPath = `/publication/${publication.id}`
    const description = trimDescription(publication.description ?? `${publication.title} on ${app.serverName}.`, app.metaDescription)
    return {
      title: `${publication.title} | ${app.serverName}`,
      description,
      canonicalPath,
      imagePath: publication.coverUrl ?? `/api/publications/${publication.id}/cover`,
      siteName: app.serverName,
      themeColor: app.theme.primary,
      type: 'article',
      publishedAt: publication.publishedAt,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: publication.title,
        description,
        author: {
          '@type': 'Person',
          name: publication.authorName ?? `${app.serverName} author`
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
      title: `About ${app.serverName} | BSV per-page publishing`,
      description: trimDescription(app.metaDescription),
      canonicalPath: '/about',
      imagePath: app.ogImageUrl ?? '/og-image.svg',
      siteName: app.serverName,
      themeColor: app.theme.primary,
      type: 'website',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: app.serverName,
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
    title: isReader ? `Read on ${app.serverName}` : app.metaTitle,
    description: isReader ? 'Read page 1 free, then continue page by page with a compatible wallet.' : trimDescription(app.metaDescription),
    canonicalPath: isReader ? pathName : '/',
    imagePath: app.ogImageUrl ?? '/og-image.svg',
    siteName: app.serverName,
    themeColor: app.theme.primary,
    type: 'website',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: app.serverName,
      url: hostingOrigin(),
      description: trimDescription(app.metaDescription)
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
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${meta.type ?? 'website'}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(`${meta.siteName} publication preview`)}" />`,
    meta.publishedAt != null ? `<meta property="article:published_time" content="${escapeHtml(meta.publishedAt)}" />` : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="theme-color" content="${escapeHtml(meta.themeColor)}" />`,
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
