exports.up = async function up (knex) {
  const client = String(knex.client.config.client ?? '')
  if (client.includes('mysql')) {
    await knex.schema.raw("ALTER TABLE `payouts` MODIFY `status` VARCHAR(40) NOT NULL DEFAULT 'queued'")
  } else {
    await knex.schema.alterTable('payouts', table => {
      table.string('status', 40).notNullable().defaultTo('queued').alter()
    })
  }

  const addColumn = async (name, build) => {
    if (!(await knex.schema.hasColumn('payouts', name))) {
      await knex.schema.alterTable('payouts', build)
    }
  }

  await addColumn('tx', table => table.text('tx', 'longtext'))
  await addColumn('output_index', table => table.integer('output_index').unsigned())
  await addColumn('derivation_prefix', table => table.string('derivation_prefix', 256))
  await addColumn('derivation_suffix', table => table.string('derivation_suffix', 256))
  await addColumn('server_identity_key', table => table.string('server_identity_key', 130))
  await addColumn('internalized_at', table => table.timestamp('internalized_at'))
  await addColumn('client_ack_at', table => table.timestamp('client_ack_at'))
  await addColumn('retry_count', table => table.integer('retry_count').unsigned().notNullable().defaultTo(0))
  await addColumn('last_retry_at', table => table.timestamp('last_retry_at'))
}

exports.down = async function down (knex) {
  const dropColumn = async name => {
    if (await knex.schema.hasColumn('payouts', name)) {
      await knex.schema.alterTable('payouts', table => table.dropColumn(name))
    }
  }

  await dropColumn('last_retry_at')
  await dropColumn('retry_count')
  await dropColumn('client_ack_at')
  await dropColumn('internalized_at')
  await dropColumn('server_identity_key')
  await dropColumn('derivation_suffix')
  await dropColumn('derivation_prefix')
  await dropColumn('output_index')
  await dropColumn('tx')

  const client = String(knex.client.config.client ?? '')
  if (client.includes('mysql')) {
    await knex.schema.raw("ALTER TABLE `payouts` MODIFY `status` ENUM('queued','broadcast','failed') NOT NULL DEFAULT 'queued'")
  }
}
