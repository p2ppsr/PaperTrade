// Additive application tables; no wallet/content rows are changed.
exports.up = async function (knex) {
  const caseSensitive = table => {
    if (['mysql', 'mysql2'].includes(knex.client.config.client)) {
      table.charset('ascii')
      table.collate('ascii_bin')
    }
  }
  if (!await knex.schema.hasTable('auth_sessions')) {
    await knex.schema.createTable('auth_sessions', table => {
      caseSensitive(table)
      table.string('sessionNonce', 64).primary()
      table.string('peerNonce', 64).nullable()
      table.string('peerIdentityKey', 130).nullable()
      table.boolean('isAuthenticated').notNullable()
      table.bigInteger('lastUpdate').notNullable()
      table.boolean('certificatesRequired').nullable()
      table.boolean('certificatesValidated').nullable()
      table.bigInteger('expiresAt').notNullable()
      table.index(['peerIdentityKey', 'lastUpdate'])
      table.index('expiresAt')
    })
  }
  if (!await knex.schema.hasTable('auth_message_nonces')) {
    await knex.schema.createTable('auth_message_nonces', table => {
      caseSensitive(table)
      // Also holds initial:<identity> scopes, which are not session-table keys.
      table.string('sessionNonce', 130).notNullable()
      table.string('messageNonce', 64).notNullable()
      table.bigInteger('expiresAt').notNullable()
      table.primary(['sessionNonce', 'messageNonce'])
      table.index('expiresAt')
    })
  }
  if (!await knex.schema.hasTable('payment_replays')) {
    await knex.schema.createTable('payment_replays', table => {
      caseSensitive(table)
      table.string('transactionId', 64).primary()
      table.timestamp('createdAt').notNullable()
    })
  }
}

exports.down = async function () {
  // Reverting application code is safe with these additive tables retained.
  // Forgetting payment claims would reopen replay of already accepted payments.
  throw new Error('Retain shared protocol state when rolling back application code')
}
