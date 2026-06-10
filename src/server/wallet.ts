import fs from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { PrivateKey } from '@bsv/sdk'
import { Setup } from '@bsv/wallet-toolbox'
import { db } from './db.js'

export interface WalletBootstrap {
  wallet: any
  privateKeyHex: string
  publicKey: string
  keyStatus: 'env' | 'persisted' | 'auto_generated'
}

const DATA_DIR = process.env.DATA_DIR ?? '/data/papertrade'
const KEY_PATH = process.env.SERVER_PRIVATE_KEY_PATH ?? path.join(DATA_DIR, 'server-private-key')

async function readPersistedKey (): Promise<string | null> {
  try {
    return (await fs.readFile(KEY_PATH, 'utf8')).trim()
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

async function persistKey (privateKeyHex: string): Promise<void> {
  await fs.mkdir(path.dirname(KEY_PATH), { recursive: true, mode: 0o700 })
  await fs.writeFile(KEY_PATH, `${privateKeyHex}\n`, { mode: 0o600 })
}

export async function replacePersistedServerKey (privateKeyHex: string): Promise<string> {
  const publicKey = new PrivateKey(privateKeyHex, 'hex').toPublicKey().toString()
  await persistKey(privateKeyHex)
  await db('server_settings').where({ id: 1 }).update({
    server_public_key: publicKey,
    server_key_status: 'provided'
  })
  return publicKey
}

export async function createServerWallet (): Promise<WalletBootstrap> {
  const envKey = process.env.SERVER_PRIVATE_KEY?.trim()
  const persistedKey = await readPersistedKey()
  let privateKeyHex = envKey ?? persistedKey
  let keyStatus: WalletBootstrap['keyStatus'] = envKey != null && envKey !== '' ? 'env' : 'persisted'

  if (privateKeyHex == null || privateKeyHex === '') {
    privateKeyHex = randomBytes(32).toString('hex')
    await persistKey(privateKeyHex)
    keyStatus = 'auto_generated'
  }

  const publicKey = new PrivateKey(privateKeyHex, 'hex').toPublicKey().toString()
  await db('server_settings').where({ id: 1 }).update({
    server_public_key: publicKey,
    server_key_status: keyStatus
  })

  const chain = (process.env.BSV_NETWORK ?? 'mainnet') === 'testnet' ? 'test' : 'main'
  const wallet = await Setup.createWalletClientNoEnv({
    rootKeyHex: privateKeyHex,
    storageUrl: process.env.WALLET_STORAGE_URL ?? 'https://storage.babbage.systems',
    chain
  })

  return { wallet, privateKeyHex, publicKey, keyStatus }
}
