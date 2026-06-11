exports.up = async function up (knex) {
  const hasSettingsDisplayUnit = await knex.schema.hasColumn('server_settings', 'display_unit')
  if (!hasSettingsDisplayUnit) {
    await knex.schema.alterTable('server_settings', table => {
      table.enum('display_unit', ['sats', 'usd_cents']).notNullable().defaultTo('sats')
    })
  }

  const hasAuthorDisplayUnit = await knex.schema.hasColumn('authors', 'display_unit')
  if (!hasAuthorDisplayUnit) {
    await knex.schema.alterTable('authors', table => {
      table.enum('display_unit', ['sats', 'usd_cents'])
    })
  }
}

exports.down = async function down (knex) {
  const hasAuthorDisplayUnit = await knex.schema.hasColumn('authors', 'display_unit')
  if (hasAuthorDisplayUnit) {
    await knex.schema.alterTable('authors', table => {
      table.dropColumn('display_unit')
    })
  }

  const hasSettingsDisplayUnit = await knex.schema.hasColumn('server_settings', 'display_unit')
  if (hasSettingsDisplayUnit) {
    await knex.schema.alterTable('server_settings', table => {
      table.dropColumn('display_unit')
    })
  }
}
