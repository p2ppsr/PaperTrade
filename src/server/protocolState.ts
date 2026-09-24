import type { PaymentReplayStore } from '@bsv/payment-express-middleware'
import { KnexSessionManager } from '@bsv/wallet-toolbox'
import type { Knex } from 'knex'

function isDuplicate (error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const { code } = error as { code?: unknown }
  return code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || code === 'SQLITE_CONSTRAINT_UNIQUE'
}

/** One transaction can fund only one accepted request, across routes and replicas. */
export class KnexPaymentReplayStore implements PaymentReplayStore {
  constructor (private readonly db: Knex) {}

  async claim (transactionId: string): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/.test(transactionId)) throw new TypeError('Invalid payment transaction ID')
    try {
      await this.db('payment_replays').insert({ transactionId, createdAt: new Date() })
      return true
    } catch (error) {
      if (isDuplicate(error)) return false
      throw error
    }
  }
}

export function createProtocolState (db: Knex): {
  sessionManager: KnexSessionManager
  replayStore: KnexPaymentReplayStore
} {
  return {
    sessionManager: new KnexSessionManager(db, { maxInitialRequestNoncesPerIdentity: 256 }),
    replayStore: new KnexPaymentReplayStore(db)
  }
}
