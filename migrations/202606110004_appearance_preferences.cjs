const appearanceColumns = [
  ['server_name', table => table.string('server_name', 120).notNullable().defaultTo('PaperTrade')],
  ['newsstand_label', table => table.string('newsstand_label', 80).notNullable().defaultTo('Newsstand')],
  ['tagline', table => table.string('tagline', 260).notNullable().defaultTo('Read page 1 free. Pay per page after that with a BRC100 wallet.')],
  ['meta_title', table => table.string('meta_title', 160).notNullable().defaultTo('PaperTrade | BSV per-page publishing newsstand')],
  ['meta_description', table => table.text('meta_description')],
  ['theme_primary', table => table.string('theme_primary', 16).notNullable().defaultTo('#1f4f46')],
  ['theme_accent', table => table.string('theme_accent', 16).notNullable().defaultTo('#b2772c')],
  ['theme_background', table => table.string('theme_background', 16).notNullable().defaultTo('#f7f5ef')],
  ['theme_surface', table => table.string('theme_surface', 16).notNullable().defaultTo('#ffffff')],
  ['theme_text', table => table.string('theme_text', 16).notNullable().defaultTo('#20231f')],
  ['theme_muted', table => table.string('theme_muted', 16).notNullable().defaultTo('#5c6570')],
  ['theme_border', table => table.string('theme_border', 16).notNullable().defaultTo('#ddd8ca')],
  ['logo_url', table => table.string('logo_url', 512)],
  ['icon_url', table => table.string('icon_url', 512)],
  ['og_image_url', table => table.string('og_image_url', 512)]
]

exports.up = async function up (knex) {
  for (const [name, addColumn] of appearanceColumns) {
    const exists = await knex.schema.hasColumn('server_settings', name)
    if (!exists) {
      await knex.schema.alterTable('server_settings', table => {
        addColumn(table)
      })
    }
  }
  await knex('server_settings').where({ id: 1 }).whereNull('meta_description').update({
    meta_description: 'PaperTrade is a BSV newsstand where readers preview page 1 free and pay per page for independent writing with a BRC100 wallet.'
  })
}

exports.down = async function down (knex) {
  for (const [name] of [...appearanceColumns].reverse()) {
    const exists = await knex.schema.hasColumn('server_settings', name)
    if (exists) {
      await knex.schema.alterTable('server_settings', table => {
        table.dropColumn(name)
      })
    }
  }
}
