exports.up = async function (knex) {
  const columns = [
    ['text_path', table => table.string('text_path', 1024).nullable()],
    ['text_sha256', table => table.string('text_sha256', 64).nullable()],
    ['text_bytes', table => table.bigInteger('text_bytes').unsigned().nullable()],
    ['text_source', table => table.string('text_source', 16).nullable()]
  ]
  for (const [name, add] of columns) {
    if (!await knex.schema.hasColumn('publication_pages', name)) {
      await knex.schema.alterTable('publication_pages', add)
    }
  }
}

exports.down = async function (knex) {
  for (const name of ['text_source', 'text_bytes', 'text_sha256', 'text_path']) {
    if (await knex.schema.hasColumn('publication_pages', name)) {
      await knex.schema.alterTable('publication_pages', table => table.dropColumn(name))
    }
  }
}
