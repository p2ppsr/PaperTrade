import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

export const STARTER_AUTHOR_IDENTITY_KEY = 'papertrade-starter-library'
export const STARTER_AUTHOR_NAME = 'Public Domain Library'
export const STARTER_SOURCE_NAME = 'Project Gutenberg public-domain text'

export interface StarterWork {
  id: string
  title: string
  authorName: string
  description: string
  textFile: string
  coverFile: string
  sourceUrl: string
  sourceName: string
  gutenbergId: string
}

export const STARTER_WORKS: StarterWork[] = [
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000001',
    title: 'Pride and Prejudice',
    authorName: 'Jane Austen',
    description: 'A public-domain classic of manners, family pressure, first impressions, and slow-earned affection.',
    textFile: 'pride-and-prejudice.txt',
    coverFile: 'pride-and-prejudice.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1342',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '1342'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000002',
    title: 'The Adventures of Sherlock Holmes',
    authorName: 'Arthur Conan Doyle',
    description: 'Public-domain detective stories built around observation, inference, and memorable London cases.',
    textFile: 'sherlock-holmes.txt',
    coverFile: 'sherlock-holmes.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1661',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '1661'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000003',
    title: 'Alice in Wonderland',
    authorName: 'Lewis Carroll',
    description: 'A public-domain journey through wordplay, strange rules, impossible etiquette, and dream logic.',
    textFile: 'alice-in-wonderland.txt',
    coverFile: 'alice-in-wonderland.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/11',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '11'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000004',
    title: 'The Time Machine',
    authorName: 'H. G. Wells',
    description: 'A public-domain science fiction landmark about invention, class, deep time, and fragile civilization.',
    textFile: 'time-machine.txt',
    coverFile: 'time-machine.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/35',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '35'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000005',
    title: 'The Wonderful Wizard of Oz',
    authorName: 'L. Frank Baum',
    description: 'A public-domain American fantasy about travel, companionship, courage, and home.',
    textFile: 'wizard-of-oz.txt',
    coverFile: 'wizard-of-oz.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/55',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '55'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000006',
    title: 'The Secret Garden',
    authorName: 'Frances Hodgson Burnett',
    description: 'A public-domain story of loneliness, recovery, friendship, and the hidden life of a garden.',
    textFile: 'secret-garden.txt',
    coverFile: 'secret-garden.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/113',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '113'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000007',
    title: 'Moby-Dick',
    authorName: 'Herman Melville',
    description: 'A public-domain sea novel of obsession, labor, myth, danger, and encyclopedic attention.',
    textFile: 'moby-dick.txt',
    coverFile: 'moby-dick.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/2701',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '2701'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000008',
    title: 'Narrative of the Life of Frederick Douglass',
    authorName: 'Frederick Douglass',
    description: 'A public-domain autobiographical work about slavery, literacy, escape, and human dignity.',
    textFile: 'frederick-douglass.txt',
    coverFile: 'frederick-douglass.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/23',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '23'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000009',
    title: 'The Souls of Black Folk',
    authorName: 'W. E. B. Du Bois',
    description: 'A public-domain collection of essays on race, education, history, music, and American democracy.',
    textFile: 'souls-of-black-folk.txt',
    coverFile: 'souls-of-black-folk.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/408',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '408'
  },
  {
    id: '5d0c3c44-0b3f-4b1a-94b4-000000000010',
    title: 'Grimms Fairy Tales',
    authorName: 'Jacob and Wilhelm Grimm',
    description: 'Public-domain folk tales full of tests, transformations, bargains, warnings, and wonder.',
    textFile: 'grimms-fairy-tales.txt',
    coverFile: 'grimms-fairy-tales.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/2591',
    sourceName: STARTER_SOURCE_NAME,
    gutenbergId: '2591'
  }
]

const assetRootCandidates = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'public-domain'),
  path.join(process.cwd(), 'src', 'server', 'public-domain')
]

export function starterWorkById (publicationId: string): StarterWork | undefined {
  return STARTER_WORKS.find(work => work.id === publicationId)
}

async function firstExistingPath (candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {}
  }
  throw new Error(`Starter public-domain asset not found: ${candidates.join(', ')}`)
}

async function publicDomainAssetRoot (): Promise<string> {
  return await firstExistingPath(assetRootCandidates)
}

export async function starterTextPath (work: StarterWork): Promise<string> {
  const root = await publicDomainAssetRoot()
  return path.join(root, 'texts', work.textFile)
}

export async function starterCoverPath (work: StarterWork): Promise<string> {
  const root = await publicDomainAssetRoot()
  return path.join(root, 'covers', work.coverFile)
}

function stripProjectGutenbergBoilerplate (source: string): string {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const start = lines.findIndex(line => /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line))
  const end = lines.findIndex(line => /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.test(line))
  const body = lines.slice(start >= 0 ? start + 1 : 0, end > start ? end : lines.length).join('\n')
  return body
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export async function readStarterText (work: StarterWork): Promise<string> {
  const text = await fs.readFile(await starterTextPath(work), 'utf8')
  return stripProjectGutenbergBoilerplate(text)
}

function escapePdfText (value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrapLine (line: string, width: number): string[] {
  const words = line.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`
    if (next.length > width && current !== '') {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current !== '') lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function pdfSafeText (text: string): string {
  const ascii = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '--')
    .replace(/\u2026/g, '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
  return Array.from(ascii).filter(char => {
    const code = char.charCodeAt(0)
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)
  }).join('')
}

function paginateText (work: StarterWork, text: string): string[] {
  const sourcePage = [
    work.title,
    work.authorName,
    '',
    `Public-domain source: ${work.sourceName}`,
    work.sourceUrl,
    '',
    'This PaperTrade edition uses the real public-domain text. It is lightly wrapped into pages so it can be read and purchased page by page.'
  ].join('\n')

  const pages = [sourcePage]
  const current: string[] = []
  const flush = (): void => {
    while (current.length > 0 && current[current.length - 1] === '') current.pop()
    if (current.length > 0) pages.push(current.splice(0, current.length).join('\n'))
  }

  for (const paragraph of pdfSafeText(text).split(/\n{2,}/)) {
    const paragraphLines = paragraph.split('\n').flatMap(line => wrapLine(line, 86))
    const block = paragraphLines.length > 0 ? paragraphLines : ['']
    if (current.length + block.length + 1 > 48) flush()
    current.push(...block, '')
    while (current.length > 52) {
      pages.push(current.splice(0, 48).join('\n'))
    }
  }
  flush()
  return pages
}

function pageStream (page: string): string {
  const rawLines = page.split('\n').flatMap(line => wrapLine(line, 86))
  const lines = rawLines.slice(0, 52)
  const commands = [
    'BT',
    '/F1 11.5 Tf',
    '54 742 Td'
  ]
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -13 Td')
    commands.push(`(${escapePdfText(line)}) Tj`)
  })
  commands.push('ET')
  return commands.join('\n')
}

export async function writeStarterPdf (work: StarterWork, targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const pages = paginateText(work, await readStarterText(work))
  const maxObjectId = 3 + pages.length * 2
  const objects = new Map<number, string>()
  const pageObjectIds = pages.map((_page, index) => 4 + index * 2)

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  pages.forEach((page, index) => {
    const pageObjectId = pageObjectIds[index]
    const contentObjectId = pageObjectId + 1
    const stream = pageStream(page)
    objects.set(pageObjectId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
    objects.set(contentObjectId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })

  let pdf = '%PDF-1.4\n%PaperTrade public-domain edition\n'
  const offsets = [0]
  for (let id = 1; id <= maxObjectId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf)
    pdf += `${id} 0 obj\n${objects.get(id) ?? '<<>>'}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${maxObjectId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= maxObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  await fs.writeFile(targetPath, Buffer.from(pdf, 'utf8'))
}
