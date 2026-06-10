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
  pages: Array<{ pageNumber: number, imagePath: string, sha256: string, bytes: number }>
  pageCount: number
  sourceSha256: string
  sourceBytes: number
  canonicalSha256: string
  canonicalBytes: number
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

  const pages = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pages.push(await renderPage(canonicalPdfPath, publicationDir, pageNumber))
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
