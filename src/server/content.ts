import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const DATA_DIR = process.env.DATA_DIR ?? '/data/papertrade'

export interface ProcessedPublicationFile {
  publicationDir: string
  sourcePath: string
  canonicalPdfPath: string
  pages: ProcessedPublicationPage[]
  pageCount: number
  sourceSha256: string
  sourceBytes: number
  canonicalSha256: string
  canonicalBytes: number
}

export interface ProcessedPublicationPage {
  pageNumber: number
  imagePath: string
  sha256: string
  bytes: number
  textPath: string
  textSha256: string
  textBytes: number
  textSource: 'pdf' | 'ocr' | 'none'
}

export function getPublicationDir (publicationId: string): string {
  return path.join(DATA_DIR, 'publications', publicationId)
}

export async function sha256File (filePath: string): Promise<string> {
  const data = await fs.readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function statSize (filePath: string): Promise<number> {
  return (await fs.stat(filePath)).size
}

async function copyUploadedSource (tempPath: string, publicationDir: string, extension: string): Promise<string> {
  await fs.mkdir(publicationDir, { recursive: true })
  const sourcePath = path.join(publicationDir, `source.${extension}`)
  await fs.copyFile(tempPath, sourcePath)
  await fs.rm(tempPath, { force: true })
  return sourcePath
}

async function convertToPdf (sourcePath: string, extension: string, publicationDir: string): Promise<string> {
  const canonicalPdfPath = path.join(publicationDir, 'canonical.pdf')
  if (extension === 'pdf') {
    await fs.copyFile(sourcePath, canonicalPdfPath)
    return canonicalPdfPath
  }

  if (extension === 'docx') {
    await execFileAsync('soffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      publicationDir,
      sourcePath
    ], { timeout: 120000 })
    const converted = path.join(publicationDir, `${path.basename(sourcePath, '.docx')}.pdf`)
    await fs.rename(converted, canonicalPdfPath)
    return canonicalPdfPath
  }

  if (extension === 'epub') {
    await execFileAsync('ebook-convert', [sourcePath, canonicalPdfPath], { timeout: 120000 })
    return canonicalPdfPath
  }

  throw new Error('Unsupported publication format')
}

async function pdfPageCount (pdfPath: string): Promise<number> {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath], { timeout: 30000 })
  const match = stdout.match(/^Pages:\s+(\d+)$/m)
  if (match == null) throw new Error('Could not determine PDF page count')
  return Number(match[1])
}

async function renderPage (pdfPath: string, publicationDir: string, pageNumber: number): Promise<{ pageNumber: number, imagePath: string, sha256: string, bytes: number }> {
  const prefix = path.join(publicationDir, `page-${String(pageNumber).padStart(4, '0')}`)
  await execFileAsync('pdftoppm', [
    '-png',
    '-r',
    '144',
    '-f',
    String(pageNumber),
    '-l',
    String(pageNumber),
    '-singlefile',
    pdfPath,
    prefix
  ], { timeout: 60000 })
  const imagePath = `${prefix}.png`
  return {
    pageNumber,
    imagePath,
    sha256: await sha256File(imagePath),
    bytes: await statSize(imagePath)
  }
}

export function normalizePageText (value: string): string {
  return value
    .split(String.fromCharCode(0)).join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\f/g, '')
    .trim()
}

function meaningfulTextLength (value: string): number {
  return value.replace(/[^\p{L}\p{N}]/gu, '').length
}

export async function extractPageText (
  pdfPath: string,
  imagePath: string,
  publicationDir: string,
  pageNumber: number
): Promise<{ textPath: string, textSha256: string, textBytes: number, textSource: 'pdf' | 'ocr' | 'none' }> {
  const textPath = path.join(publicationDir, `page-${String(pageNumber).padStart(4, '0')}.txt`)
  let pdfText = ''
  try {
    const { stdout } = await execFileAsync('pdftotext', [
      '-f', String(pageNumber),
      '-l', String(pageNumber),
      '-layout',
      '-enc', 'UTF-8',
      pdfPath,
      '-'
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 })
    pdfText = normalizePageText(stdout)
  } catch {}

  let text = pdfText
  let textSource: 'pdf' | 'ocr' | 'none' = meaningfulTextLength(pdfText) >= 20 ? 'pdf' : 'none'
  if (textSource === 'none') {
    try {
      const { stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', 'eng', '--psm', '3'], {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      })
      const ocrText = normalizePageText(stdout)
      if (meaningfulTextLength(ocrText) > meaningfulTextLength(text)) {
        text = ocrText
        textSource = meaningfulTextLength(ocrText) > 0 ? 'ocr' : 'none'
      }
    } catch {}
  }

  await fs.writeFile(textPath, text, 'utf8')
  return {
    textPath,
    textSha256: await sha256File(textPath),
    textBytes: await statSize(textPath),
    textSource
  }
}

export async function ensurePageText (
  canonicalPdfPath: string,
  imagePath: string,
  publicationDir: string,
  pageNumber: number,
  existingTextPath?: string | null
): Promise<{ text: string, textPath: string, textSha256: string, textBytes: number, textSource: 'pdf' | 'ocr' | 'none' }> {
  if (existingTextPath != null && existingTextPath !== '') {
    try {
      const text = normalizePageText(await fs.readFile(existingTextPath, 'utf8'))
      return {
        text,
        textPath: existingTextPath,
        textSha256: await sha256File(existingTextPath),
        textBytes: await statSize(existingTextPath),
        textSource: text === '' ? 'none' : 'pdf'
      }
    } catch {}
  }
  const extracted = await extractPageText(canonicalPdfPath, imagePath, publicationDir, pageNumber)
  return { text: normalizePageText(await fs.readFile(extracted.textPath, 'utf8')), ...extracted }
}

export async function processPublicationFile (
  publicationId: string,
  tempPath: string,
  originalName: string
): Promise<ProcessedPublicationFile> {
  const extension = path.extname(originalName).toLowerCase().replace('.', '')
  if (!['pdf', 'docx', 'epub'].includes(extension)) {
    await fs.rm(tempPath, { force: true })
    throw new Error('PaperTrade accepts PDF, docx, or ePub files')
  }

  const publicationDir = getPublicationDir(publicationId)
  await fs.rm(publicationDir, { recursive: true, force: true })
  await fs.mkdir(publicationDir, { recursive: true })
  const sourcePath = await copyUploadedSource(tempPath, publicationDir, extension)
  const canonicalPdfPath = await convertToPdf(sourcePath, extension, publicationDir)
  const pageCount = await pdfPageCount(canonicalPdfPath)
  if (pageCount < 5) {
    throw new Error('PaperTrade requires at least 5 pages')
  }

  const pages: ProcessedPublicationPage[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const rendered = await renderPage(canonicalPdfPath, publicationDir, pageNumber)
    const extracted = await extractPageText(canonicalPdfPath, rendered.imagePath, publicationDir, pageNumber)
    pages.push({ ...rendered, ...extracted })
  }

  return {
    publicationDir,
    sourcePath,
    canonicalPdfPath,
    pages,
    pageCount,
    sourceSha256: await sha256File(sourcePath),
    sourceBytes: await statSize(sourcePath),
    canonicalSha256: await sha256File(canonicalPdfPath),
    canonicalBytes: await statSize(canonicalPdfPath)
  }
}
