import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? '/data/papertrade')
const STORAGE_BACKEND = process.env.STORAGE_BACKEND ?? 'filesystem'
const S3_BUCKET = process.env.S3_BUCKET ?? ''
const configuredRegion = process.env.S3_REGION?.trim()

function requiredEnvironment (name: string): string {
  const value = process.env[name]?.trim()
  if (value == null || value === '') throw new Error(`${name} is required when STORAGE_BACKEND=s3`)
  return value
}

const s3 = STORAGE_BACKEND === 's3'
  ? new S3Client({
    endpoint: requiredEnvironment('S3_ENDPOINT'),
    region: configuredRegion != null && configuredRegion !== '' ? configuredRegion : 'garage',
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironment('S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironment('S3_SECRET_ACCESS_KEY')
    }
  })
  : null

if (STORAGE_BACKEND !== 'filesystem' && STORAGE_BACKEND !== 's3') {
  throw new Error(`Unsupported STORAGE_BACKEND: ${STORAGE_BACKEND}`)
}
if (STORAGE_BACKEND === 's3' && S3_BUCKET.trim() === '') {
  throw new Error('S3_BUCKET is required when STORAGE_BACKEND=s3')
}

export function objectStorageEnabled (): boolean {
  return s3 != null
}

export function storageKeyForPath (filePath: string): string {
  const absolute = path.resolve(filePath)
  const relative = path.relative(DATA_DIR, absolute)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Storage path is outside DATA_DIR: ${filePath}`)
  }
  return relative.split(path.sep).join('/')
}

export async function readStoredFile (filePath: string): Promise<Buffer> {
  if (s3 == null) return await fs.readFile(filePath)
  const result = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKeyForPath(filePath) }))
  if (result.Body == null) throw new Error(`Stored object has no body: ${storageKeyForPath(filePath)}`)
  return Buffer.from(await result.Body.transformToByteArray())
}

export async function storedFileExists (filePath: string): Promise<boolean> {
  if (s3 == null) {
    try {
      await fs.access(filePath)
      return true
    } catch (err: any) {
      if (err?.code === 'ENOENT') return false
      throw err
    }
  }
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: storageKeyForPath(filePath) }))
    return true
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') return false
    throw err
  }
}

export async function storeBuffer (filePath: string, body: Buffer, contentType?: string): Promise<void> {
  if (s3 == null) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, body)
    return
  }
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: storageKeyForPath(filePath),
    Body: body,
    ContentType: contentType
  }))
}

export async function storeFile (filePath: string, contentType?: string): Promise<void> {
  if (s3 == null) return
  const stat = await fs.stat(filePath)
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: storageKeyForPath(filePath),
    Body: createReadStream(filePath),
    ContentLength: stat.size,
    ContentType: contentType
  }))
}

async function filesUnder (directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const candidate = path.join(directory, entry.name)
    return entry.isDirectory() ? await filesUnder(candidate) : entry.isFile() ? [candidate] : []
  }))
  return nested.flat()
}

export async function storeDirectory (directory: string): Promise<void> {
  if (s3 == null) return
  const files = await filesUnder(directory)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++]
      await storeFile(file)
    }
  }))
}

export async function materializeStoredFile (filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
    return
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
  }
  if (s3 == null) throw Object.assign(new Error(`Stored file does not exist: ${filePath}`), { code: 'ENOENT' })
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, await readStoredFile(filePath))
}

export async function deleteStoredDirectory (directory: string): Promise<void> {
  if (s3 == null) {
    await fs.rm(directory, { recursive: true, force: true })
    return
  }
  const prefix = `${storageKeyForPath(directory).replace(/\/+$/, '')}/`
  while (true) {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix
    }))
    const objects = (page.Contents ?? []).flatMap(item => item.Key == null ? [] : [{ Key: item.Key }])
    if (objects.length === 0) return
    await s3.send(new DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects: objects, Quiet: true } }))
  }
}
