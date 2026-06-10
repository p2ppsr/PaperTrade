exports.up = async function up (knex) {
  const createTableIfMissing = async (tableName, buildTable) => {
    const exists = await knex.schema.hasTable(tableName)
    if (!exists) {
      await knex.schema.createTable(tableName, buildTable)
    }
  }

  await createTableIfMissing('server_settings', table => {
    table.increments('id').primary()
    table.boolean('setup_complete').notNullable().defaultTo(false)
    table.enum('mode', ['private_publish', 'public_submissions']).notNullable().defaultTo('private_publish')
    table.integer('price_per_page_sats').unsigned().notNullable().defaultTo(25)
    table.integer('commission_bps').unsigned().notNullable().defaultTo(1000)
    table.string('wallet_storage_url', 512).notNullable().defaultTo('https://storage.babbage.systems')
    table.string('server_public_key', 130)
    table.string('server_key_status', 64).notNullable().defaultTo('auto_generated')
    table.timestamps(true, true)
  })

  const settingsRow = await knex('server_settings').where({ id: 1 }).first()
  if (!settingsRow) {
    await knex('server_settings').insert({
      id: 1,
      setup_complete: false,
      mode: 'private_publish',
      price_per_page_sats: 25,
      commission_bps: 1000,
      wallet_storage_url: 'https://storage.babbage.systems',
      server_key_status: 'auto_generated'
    })
  }

  await createTableIfMissing('admins', table => {
    table.string('identity_key', 130).primary()
    table.string('added_by', 130)
    table.timestamps(true, true)
  })

  await createTableIfMissing('authors', table => {
    table.string('identity_key', 130).primary()
    table.string('display_name', 160).notNullable()
    table.text('bio')
    table.string('avatar_url', 512)
    table.timestamps(true, true)
  })

  await createTableIfMissing('publications', table => {
    table.string('id', 36).primary()
    table.string('author_identity_key', 130).notNullable().references('identity_key').inTable('authors')
    table.string('title', 240).notNullable()
    table.text('description')
    table.enum('status', ['draft', 'submitted', 'published', 'rejected']).notNullable().defaultTo('draft')
    table.integer('page_count').unsigned().notNullable().defaultTo(0)
    table.string('cover_page_path', 1024)
    table.string('canonical_pdf_path', 1024)
    table.string('source_format', 16)
    table.string('reviewed_by', 130)
    table.text('review_note')
    table.timestamp('published_at')
    table.timestamps(true, true)
    table.index(['status', 'published_at'])
    table.index(['author_identity_key'])
  })

  await createTableIfMissing('publication_files', table => {
    table.string('id', 36).primary()
    table.string('publication_id', 36).notNullable().references('id').inTable('publications').onDelete('CASCADE')
    table.enum('kind', ['source', 'canonical_pdf']).notNullable()
    table.string('original_filename', 512)
    table.string('mime_type', 180)
    table.string('path', 1024).notNullable()
    table.string('sha256', 64).notNullable()
    table.bigInteger('bytes').unsigned().notNullable()
    table.timestamps(true, true)
    table.index(['publication_id', 'kind'])
  })

  await createTableIfMissing('publication_pages', table => {
    table.increments('id').primary()
    table.string('publication_id', 36).notNullable().references('id').inTable('publications').onDelete('CASCADE')
    table.integer('page_number').unsigned().notNullable()
    table.string('image_path', 1024).notNullable()
    table.string('sha256', 64).notNullable()
    table.bigInteger('bytes').unsigned().notNullable()
    table.timestamps(true, true)
    table.unique(['publication_id', 'page_number'])
  })

  await createTableIfMissing('page_entitlements', table => {
    table.increments('id').primary()
    table.string('publication_id', 36).notNullable().references('id').inTable('publications').onDelete('CASCADE')
    table.integer('page_number').unsigned().notNullable()
    table.string('reader_identity_key', 130).notNullable()
    table.timestamp('expires_at').notNullable()
    table.string('payment_id', 36)
    table.timestamps(true, true)
    table.unique(['publication_id', 'page_number', 'reader_identity_key'])
    table.index(['reader_identity_key', 'expires_at'])
  })

  await createTableIfMissing('payments', table => {
    table.string('id', 36).primary()
    table.string('publication_id', 36).notNullable().references('id').inTable('publications').onDelete('CASCADE')
    table.integer('page_number').unsigned().notNullable()
    table.string('reader_identity_key', 130).notNullable()
    table.integer('satoshis').unsigned().notNullable()
    table.integer('commission_sats').unsigned().notNullable()
    table.integer('author_sats').unsigned().notNullable()
    table.text('payment_tx')
    table.string('status', 40).notNullable().defaultTo('accepted')
    table.timestamps(true, true)
    table.index(['publication_id', 'page_number'])
    table.index(['reader_identity_key'])
  })

  await createTableIfMissing('ledger_entries', table => {
    table.increments('id').primary()
    table.string('account_type', 40).notNullable()
    table.string('account_identity_key', 130)
    table.integer('amount_sats').notNullable()
    table.string('currency', 8).notNullable().defaultTo('BSV')
    table.string('source_type', 40).notNullable()
    table.string('source_id', 36).notNullable()
    table.text('memo')
    table.timestamps(true, true)
    table.index(['account_type', 'account_identity_key'])
    table.index(['source_type', 'source_id'])
  })

  await createTableIfMissing('payouts', table => {
    table.string('id', 36).primary()
    table.string('author_identity_key', 130).notNullable().references('identity_key').inTable('authors')
    table.integer('amount_sats').unsigned().notNullable()
    table.enum('destination_type', ['legacy_address', 'brc100_identity']).notNullable()
    table.string('destination', 260).notNullable()
    table.enum('status', ['queued', 'broadcast', 'failed']).notNullable().defaultTo('queued')
    table.string('txid', 128)
    table.text('failure_reason')
    table.string('requested_by', 130).notNullable()
    table.timestamps(true, true)
    table.index(['author_identity_key', 'status'])
  })

  await createTableIfMissing('audit_events', table => {
    table.increments('id').primary()
    table.string('actor_identity_key', 130)
    table.string('event_type', 120).notNullable()
    table.string('subject_type', 80)
    table.string('subject_id', 120)
    table.text('details')
    table.timestamps(true, true)
    table.index(['event_type'])
    table.index(['subject_type', 'subject_id'])
  })
}

exports.down = async function down (knex) {
  await knex.schema.dropTableIfExists('audit_events')
  await knex.schema.dropTableIfExists('payouts')
  await knex.schema.dropTableIfExists('ledger_entries')
  await knex.schema.dropTableIfExists('payments')
  await knex.schema.dropTableIfExists('page_entitlements')
  await knex.schema.dropTableIfExists('publication_pages')
  await knex.schema.dropTableIfExists('publication_files')
  await knex.schema.dropTableIfExists('publications')
  await knex.schema.dropTableIfExists('authors')
  await knex.schema.dropTableIfExists('admins')
  await knex.schema.dropTableIfExists('server_settings')
}
