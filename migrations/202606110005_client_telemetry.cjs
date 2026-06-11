exports.up = async function up (knex) {
  const exists = await knex.schema.hasTable('client_events')
  if (!exists) {
    await knex.schema.createTable('client_events', table => {
      table.uuid('id').primary()
      table.string('event_name', 120).notNullable()
      table.string('severity', 20).notNullable().defaultTo('info')
      table.string('anonymous_id', 80)
      table.string('session_id', 80)
      table.string('identity_key', 80)
      table.string('route', 260)
      table.string('path', 260)
      table.text('referrer')
      table.text('user_agent')
      table.string('platform', 80)
      table.string('connection_type', 80)
      table.integer('duration_ms')
      table.string('release_version', 80)
      table.uuid('request_id')
      table.timestamp('occurred_at').nullable()
      table.timestamp('received_at').notNullable().defaultTo(knex.fn.now())
      table.text('context')
      table.index(['event_name', 'received_at'], 'client_events_event_received_idx')
      table.index(['severity', 'received_at'], 'client_events_severity_received_idx')
      table.index(['session_id', 'received_at'], 'client_events_session_received_idx')
      table.index(['identity_key', 'received_at'], 'client_events_identity_received_idx')
    })
  }
}

exports.down = async function down (knex) {
  const exists = await knex.schema.hasTable('client_events')
  if (exists) {
    await knex.schema.dropTable('client_events')
  }
}
