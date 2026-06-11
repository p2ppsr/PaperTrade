import knex, { type Knex } from 'knex'

const rawPort = Number(process.env.SQL_DATABASE_PORT ?? '3306')

export const db: Knex = knex({
  client: process.env.SQL_CLIENT ?? 'mysql2',
  migrations: {
    directory: './migrations',
    extension: 'cjs'
  },
  connection: {
    host: process.env.SQL_DATABASE_HOST,
    port: Number.isNaN(rawPort) ? 3306 : rawPort,
    user: process.env.SQL_DATABASE_USER,
    password: process.env.SQL_DATABASE_PASSWORD,
    database: process.env.SQL_DATABASE_DB_NAME
  }
})

export interface ServerSettings {
  id: number
  setup_complete: boolean | number
  mode: 'private_publish' | 'public_submissions'
  price_per_page_sats: number
  commission_bps: number
  display_unit: 'sats' | 'usd_cents'
  wallet_storage_url: string
  server_public_key: string | null
  server_key_status: string
}

export async function getSettings (trx: Knex = db): Promise<ServerSettings> {
  const settings = await trx<ServerSettings>('server_settings').where({ id: 1 }).first()
  if (settings == null) {
    throw new Error('PaperTrade settings row is missing')
  }
  return settings
}

export async function isAdmin (identityKey?: string): Promise<boolean> {
  if (identityKey == null || identityKey === '' || identityKey === 'unknown') return false
  const admin = await db('admins').where({ identity_key: identityKey }).first()
  return admin != null
}

export async function writeAudit (
  eventType: string,
  actorIdentityKey?: string,
  subjectType?: string,
  subjectId?: string,
  details?: unknown,
  trx: Knex = db
): Promise<void> {
  await trx('audit_events').insert({
    event_type: eventType,
    actor_identity_key: actorIdentityKey,
    subject_type: subjectType,
    subject_id: subjectId,
    details: details == null ? null : JSON.stringify(details)
  })
}
