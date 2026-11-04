const { DEFAULT_LICENSE_RIGHTS } = require('./license-rights');

const initialStreamReleases = [
  ['AMUSEMENT', 'Derry J', ['Producer: Derry J99'], 'Images/Amusement.jpg', [['Spotify', 'https://open.spotify.com/track/3w3RsTz1UFWInx1Okfuf0v?si=8f939c7aef0348e8', 'Listen to Amusement on Spotify'], ['Audiomack', 'https://audiomack.com/derry_j99/song/amusement', 'Listen to Amusement on Audiomack']]],
  ['ANTISOCIAL (REMIX)', 'Kwasi Morgan ft. 39/40', ['Producer: Derry J99'], 'Images/Antisocial.jpg', [['Spotify', 'https://open.spotify.com/track/66LM0ycdBfhNLgfde7bjeB?si=3fa5d579fdaa45d5', 'Listen to Antisocial Remix on Spotify'], ['Audiomack', 'https://audiomack.com/kwasi-morgan/song/antisocial-remix', 'Listen to Antisocial Remix on Audiomack']]],
  ['ABOM', 'Kwasi Morgan ft. 39/40', ['Producer: Derry J99'], 'Images/Abom.jpg', [['Spotify', 'https://open.spotify.com/track/6c9zYOHkuv8KCTv2ka47AG?si=deecddd9163c4910', 'Listen to Abom on Spotify'], ['Audiomack', 'https://audiomack.com/kwasi-morgan/song/abom', 'Listen to Abom on Audiomack']]],
  ['NOT AGAIN', 'Yaw Wazinga', ['Producer: Derry J99'], 'Images/Not Again.jpg', [['Spotify', 'https://open.spotify.com/track/1m3xcixV4v7U3pWFaqufBt?si=6e537d21430d439f', 'Listen to Not Again on Spotify'], ['Audiomack', 'https://audiomack.com/yaw-wazinga/song/not-again', 'Listen to Not Again on Audiomack']]],
  ['LOW', 'Ypee ft. Lami Jnr, Droplord SAS and Chief Kay', ['Recording Engineer: Derry J99'], 'Images/Low.jpg', [['Spotify', 'https://open.spotify.com/track/70IsI3YHceS3z7Ezg5JYV0?si=f7c90b244a134476', 'Listen to Low on Spotify'], ['Audiomack', 'https://audiomack.com/ypee-4/song/low', 'Listen to Low on Audiomack']]],
  ['ADWUMA', 'Oseikrom Sikani ft. King Paluta', ['Synth, Brass and Guitar: Derry J99'], 'Images/Adwuma.jpg', [['Spotify', 'https://open.spotify.com/track/0O7qfw4nmcPwAOENrPoGcq?si=e877824de3c54fa0', 'Listen to Adwuma on Spotify'], ['Audiomack', 'https://audiomack.com/sikaniioseikrom/song/adwuma', 'Listen to Adwuma on Audiomack']]],
  ['ENCHI PARTY', 'Lil Twitch', ['Producer: Derry J99'], 'Images/Enchi Party.webp', [['Audiomack', 'https://audiomack.com/lil_twitch101/song/enchi-party', 'Listen to Enchi Party by Lil Twitch on Audiomack']]],
  ['PROPOSAL', 'Yhung King ft. Okese 1', ['Producer: Derry J99'], 'Images/Proposal.jpg', [['Spotify', 'https://open.spotify.com/track/09dlwAfnDPYAfP3FdopAYH?si=5a5e1db19f6042dc', 'Listen to Proposal by Yhung King featuring Okese 1 on Spotify'], ['Audiomack', 'https://audiomack.com/search?q=Proposal%20Yhung%20King%20Okese%201', 'Search Audiomack for Proposal by Yhung King featuring Okese 1']]],
  ['OPUEH', 'Yhung King', ['Producer: Derry J99'], 'https://i.audiomack.com/yhung-king/d77c236054.webp?width=416', [['Spotify', 'https://open.spotify.com/track/2hUJSgNctjSjfZreUuazJp?si=db570daedd334da7', 'Listen to Opueh by Yhung King on Spotify'], ['Audiomack', 'https://audiomack.com/yhung-king/song/6949d342cbbc0', 'Listen to Opueh by Yhung King on Audiomack']]],
  ['NEVER LET GO', 'Yamel ft. Jidthagr8', ['Producer: Derry J99'], 'Images/Never Let Go.jpg', [['Spotify', 'https://open.spotify.com/track/3PmpUrLx9WIobkRNjDECzT?si=bfad8a8297fb4172', 'Listen to Never Let Go by Yamel featuring Jidthagr8 on Spotify'], ['Audiomack', 'https://audiomack.com/search?q=Never%20Let%20Go%20Yamel%20Jidthagr8', 'Search Audiomack for Never Let Go by Yamel featuring Jidthagr8']]],
  ['PILOLO', 'PCEE GH', ['Producer: Derry J99'], 'https://i.audiomack.com/pcee1993/da74f4e5f3.webp?width=416', [['Audiomack', 'https://audiomack.com/pcee1993/song/p-cee-pilolo', 'Listen to PILOLO on Audiomack']]],
  ['JEALOUS', 'BELLOBOY', ['Producer: Derry J99'], 'https://i.audiomack.com/belloboy-68de971da9672/194b775d09.webp?width=416', [['Audiomack', 'https://audiomack.com/belloboy-68de971da9672/song/jealous-1', 'Listen to Jealous on Audiomack']]],
  ['NANA', 'YAW WAZINGA', ['Producer: Derry J99'], 'https://i.audiomack.com/yaw-wazinga/e298803320.webp?width=416', [['Audiomack', 'https://audiomack.com/yaw-wazinga/song/nana', 'Listen to NANA on Audiomack']]],
  ['STILL I RISE', 'YAW WAZINGA', ['Producer: Derry J99'], 'https://i.audiomack.com/yaw-wazinga/7661842ba7.webp?width=416', [['Audiomack', 'https://audiomack.com/yaw-wazinga/song/still-i-rise', 'Listen to STILL I RISE on Audiomack']]],
  ['GRACE', 'Jidthagr8 ft. Yamel', ['Producer: Derry J99'], 'https://i.audiomack.com/-Jidthagr8/552638b1df.webp?width=416', [['Audiomack', 'https://audiomack.com/-Jidthagr8/song/68c0f74fe7b40', 'Listen to Grace by Jid Tha Gr8 featuring Yamel on Audiomack']]]
];
const migrationSqlLiteral = value => `'${String(value).replace(/'/g, "''")}'`;

const migrations = [
  {
    version: 0,
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        artist_name VARCHAR(255),
        phone VARCHAR(255) UNIQUE,
        role VARCHAR(50) NOT NULL DEFAULT 'non_artist',
        address TEXT,
        password_hash VARCHAR(255) NOT NULL,
        email_verified_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS beats (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        bpm INT,
        musical_key VARCHAR(255),
        genre VARCHAR(255),
        mood VARCHAR(255),
        cover_art VARCHAR(255),
        preview_file VARCHAR(255),
        mp3_file VARCHAR(255),
        wav_file VARCHAR(255),
        stems_file VARCHAR(255),
        basic_price DECIMAL(12,2),
        premium_price DECIMAL(12,2),
        unlimited_price DECIMAL(12,2),
        exclusive_price DECIMAL(12,2),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS merchandise (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(12,2),
        photo VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sale_type VARCHAR(50) NOT NULL,
        product_id INT,
        product_name VARCHAR(255) NOT NULL,
        buyer_name VARCHAR(255),
        buyer_email VARCHAR(255),
        amount DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reference VARCHAR(255) NOT NULL UNIQUE,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        items_json JSON NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customization_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        request_type VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        product_name VARCHAR(255),
        details TEXT,
        sample_audio_file VARCHAR(255),
        sample_link TEXT,
        requested_license VARCHAR(50),
        license_price_gsh DECIMAL(12,2),
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        rating TINYINT NOT NULL,
        review_text TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS withdrawals (
        id INT PRIMARY KEY AUTO_INCREMENT,
        amount DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS bookings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(255),
        service VARCHAR(255) NOT NULL,
        artist_count INT NOT NULL DEFAULT 1,
        song_count INT,
        booking_slots_json JSON,
        preferred_date VARCHAR(255),
        preferred_time VARCHAR(255),
        details TEXT,
        payment_reference VARCHAR(255) UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(255) PRIMARY KEY,
        setting_value TEXT NOT NULL
      )`,
      `INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
        ('booking_fee_mixtape_ghs', '700'),
        ('booking_fee_full_production_ghs', '1000'),
        ('booking_fee_beat_production_ghs', '500'),
        ('booking_fee_adverts_promos_ghs', '1000'),
        ('beat_request_license_basic_ghs', '500'),
        ('beat_request_license_premium_ghs', '1000'),
        ('beat_request_license_unlimited_ghs', '2000'),
        ('beat_request_license_exclusive_ghs', '4700'),
        ('beat_default_basic_usd', '25'),
        ('beat_default_premium_usd', '45'),
        ('beat_default_unlimited_usd', '150'),
        ('beat_default_exclusive_usd', '420')`
    ]
  },
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS order_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT NOT NULL,
        product_type VARCHAR(50) NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        license_type VARCHAR(50),
        unit_amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_items_order_id (order_id),
        CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT,
        provider VARCHAR(50) NOT NULL,
        provider_reference VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        provider_payload JSON,
        verified_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payments_order_id (order_id),
        CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS licenses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        beat_id INT NOT NULL,
        order_id INT NOT NULL,
        license_type VARCHAR(50) NOT NULL,
        certificate_path VARCHAR(255),
        rights_json JSON,
        purchased_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_license_order_beat (order_id, beat_id, license_type),
        INDEX idx_licenses_user_id (user_id),
        INDEX idx_licenses_beat_id (beat_id),
        CONSTRAINT fk_licenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_licenses_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE RESTRICT,
        CONSTRAINT fk_licenses_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
      )`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id INT,
        details_json JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_logs_user_id (user_id),
        INDEX idx_audit_logs_action (action),
        CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_read (user_id, read_at),
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS wishlists (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        beat_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wishlist_user_beat (user_id, beat_id),
        CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_wishlists_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS account_tokens (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        token_type VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_account_tokens_user_type (user_id, token_type),
        CONSTRAINT fk_account_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS booking_availability (
        id INT PRIMARY KEY AUTO_INCREMENT,
        slot_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'available',
        booking_id INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_booking_slot (slot_date, start_time),
        INDEX idx_booking_availability_date (slot_date),
        CONSTRAINT fk_booking_availability_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS merchandise_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS merchandise_variants (
        id INT PRIMARY KEY AUTO_INCREMENT,
        merchandise_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        sku VARCHAR(100) UNIQUE,
        price DECIMAL(12,2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_merchandise_variants_product FOREIGN KEY (merchandise_id) REFERENCES merchandise(id) ON DELETE CASCADE
      )`
    ]
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_sessions_user_id (user_id),
        INDEX idx_user_sessions_expiry (expires_at),
        CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ]
  },
  {
    version: 3,
    statements: [
      'ALTER TABLE beats ADD COLUMN preview_duration_seconds INT NULL'
    ]
  },
  {
    version: 4,
    statements: [
      `ALTER TABLE beats ADD COLUMN catalog_status VARCHAR(20) NOT NULL DEFAULT 'published'`,
      `ALTER TABLE beats ADD INDEX idx_beats_catalog_status (catalog_status)`
    ]
  },
  {
    version: 5,
    statements: [
      `CREATE TABLE IF NOT EXISTS download_events (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        order_id INT NOT NULL,
        beat_id INT NOT NULL,
        license_type VARCHAR(50) NOT NULL,
        format VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_download_events_user_id (user_id),
        INDEX idx_download_events_order_id (order_id),
        CONSTRAINT fk_download_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_download_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )`
    ]
  },
  {
    version: 6,
    statements: [
      `CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        provider VARCHAR(50) NOT NULL,
        event_reference VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSON NOT NULL,
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_payment_webhook_event (provider, event_reference, event_type)
      )`
    ]
  },
  {
    version: 7,
    statements: [
      'ALTER TABLE bookings ADD COLUMN admin_notes TEXT NULL'
    ]
  },
  {
    version: 8,
    statements: [
      'ALTER TABLE merchandise ADD COLUMN stock_quantity INT NULL DEFAULT NULL',
      'ALTER TABLE merchandise ADD INDEX idx_merchandise_stock_quantity (stock_quantity)'
    ]
  },
  {
    version: 9,
    statements: [
      'ALTER TABLE customization_requests ADD COLUMN user_id INT NULL',
      'ALTER TABLE customization_requests ADD COLUMN quote_gsh DECIMAL(12,2) NULL',
      'ALTER TABLE customization_requests ADD COLUMN admin_notes TEXT NULL',
      'ALTER TABLE customization_requests ADD INDEX idx_customization_requests_user_id (user_id)'
    ]
  },
  {
    version: 10,
    statements: [
      'ALTER TABLE customer_reviews ADD COLUMN user_id INT NULL',
      'ALTER TABLE customer_reviews ADD INDEX idx_customer_reviews_user_id (user_id)'
    ]
  },
  {
    version: 11,
    statements: [
      'ALTER TABLE sales ADD COLUMN order_reference VARCHAR(255) NULL',
      'ALTER TABLE sales ADD COLUMN line_index INT NOT NULL DEFAULT 0',
      'ALTER TABLE sales ADD UNIQUE KEY uq_sales_order_line (order_reference, line_index)'
    ]
  },
  {
    version: 12,
    statements: [
      `CREATE TABLE IF NOT EXISTS license_rights (
        license_type VARCHAR(50) PRIMARY KEY,
        rights_json JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      ...Object.entries(DEFAULT_LICENSE_RIGHTS).map(([licenseType, rights]) =>
        `INSERT IGNORE INTO license_rights (license_type, rights_json) VALUES ('${licenseType}', '${JSON.stringify(rights)}')`
      ),
      'ALTER TABLE licenses ADD COLUMN revoked_at TIMESTAMP NULL',
      'ALTER TABLE licenses ADD COLUMN revoked_reason VARCHAR(255) NULL'
    ]
  },
  {
    version: 13,
    statements: [
      "ALTER TABLE orders ADD COLUMN fulfillment_status VARCHAR(50) NOT NULL DEFAULT 'unfulfilled'",
      'ALTER TABLE orders ADD COLUMN refunded_amount DECIMAL(12,2) NOT NULL DEFAULT 0',
      'ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMP NULL',
      'ALTER TABLE orders ADD INDEX idx_orders_status (status)'
    ]
  },
  {
    // MariaDB/MySQL with explicit_defaults_for_timestamp=OFF silently adds
    // DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP to the first
    // TIMESTAMP NOT NULL column. That made every session usage reset
    // user_sessions.expires_at to "now", expiring sessions after one request.
    // DATETIME has no implicit auto-update, so expiry is only ever written by us.
    version: 14,
    statements: [
      'ALTER TABLE user_sessions MODIFY COLUMN expires_at DATETIME NOT NULL',
      'ALTER TABLE account_tokens MODIFY COLUMN expires_at DATETIME NOT NULL'
    ]
  },
  {
    version: 15,
    statements: [
      `CREATE TABLE IF NOT EXISTS email_outbox (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        idempotency_key VARCHAR(255) NOT NULL UNIQUE,
        recipient VARCHAR(320) NOT NULL,
        template VARCHAR(50) NOT NULL,
        data_json JSON NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        locked_at DATETIME NULL,
        sent_at DATETIME NULL,
        last_error VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_outbox_delivery (status, next_attempt_at, id),
        INDEX idx_email_outbox_lease (status, locked_at)
      )`
    ]
  },
  {
    version: 16,
    statements: [
      'ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(255) NULL',
      'ALTER TABLE notifications ADD UNIQUE KEY uq_notifications_dedupe_key (dedupe_key)'
    ]
  },
  {
    version: 17,
    statements: [
      `CREATE TABLE IF NOT EXISTS customer_reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        rating TINYINT NOT NULL,
        review_text TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      'ALTER TABLE customer_reviews ADD INDEX idx_customer_reviews_status_created (status, created_at)'
    ]
  },
  {
    version: 18,
    statements: [
      `CREATE TABLE IF NOT EXISTS order_fulfillment_history (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        order_id INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        changed_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_fulfillment_history_order_created (order_id, created_at),
        CONSTRAINT fk_order_fulfillment_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_fulfillment_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
      )`
    ]
  },
  {
    version: 19,
    statements: [
      { ensureColumn: { table: 'users', column: 'email_verified_at', definition: 'TIMESTAMP NULL' } },
      { ensureColumn: { table: 'bookings', column: 'artist_count', definition: 'INT NOT NULL DEFAULT 1' } },
      { ensureColumn: { table: 'bookings', column: 'payment_reference', definition: 'VARCHAR(255) UNIQUE' } },
      { ensureColumn: { table: 'bookings', column: 'song_count', definition: 'INT' } },
      { ensureColumn: { table: 'bookings', column: 'booking_slots_json', definition: 'JSON' } },
      { ensureColumn: { table: 'customization_requests', column: 'sample_audio_file', definition: 'VARCHAR(255)' } },
      { ensureColumn: { table: 'customization_requests', column: 'requested_license', definition: 'VARCHAR(50)' } },
      { ensureColumn: { table: 'customization_requests', column: 'license_price_gsh', definition: 'DECIMAL(12,2)' } },
      { ensureColumn: { table: 'customization_requests', column: 'sample_link', definition: 'TEXT' } }
    ]
  },
  {
    version: 20,
    statements: [
      `CREATE TABLE IF NOT EXISTS stream_releases (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL UNIQUE,
        artist VARCHAR(500) NOT NULL,
        credits_json JSON NOT NULL,
        cover_url VARCHAR(1000) NOT NULL,
        links_json JSON NOT NULL,
        sort_order INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      ...initialStreamReleases.map(([title, artist, credits, coverUrl, links], index) =>
        `INSERT IGNORE INTO stream_releases (title, artist, credits_json, cover_url, links_json, sort_order) VALUES (${migrationSqlLiteral(title)}, ${migrationSqlLiteral(artist)}, ${migrationSqlLiteral(JSON.stringify(credits))}, ${migrationSqlLiteral(coverUrl)}, ${migrationSqlLiteral(JSON.stringify(links.map(([platform, url, label]) => ({ platform, url, label }))))}, ${index + 1})`
      )
    ]
  },
  {
    version: 21,
    statements: [
      'ALTER TABLE merchandise ADD COLUMN catalog_status VARCHAR(20) NOT NULL DEFAULT \'published\'',
      'ALTER TABLE merchandise ADD INDEX idx_merchandise_catalog_status (catalog_status)'
    ]
  },
  {
    version: 22,
    statements: [
      `CREATE TABLE IF NOT EXISTS license_definition_status (
        license_type VARCHAR(50) PRIMARY KEY,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      ...Object.keys(DEFAULT_LICENSE_RIGHTS).map(licenseType =>
        `INSERT IGNORE INTO license_definition_status (license_type, is_active) VALUES ('${licenseType}', 1)`
      )
    ]
  }
];

function runQuery(pool, query, parameters = []) {
  return new Promise((resolve, reject) => {
    pool.query(query, parameters, (error, result) => error ? reject(error) : resolve(result));
  });
}

async function applyMigrations(pool) {
  await runQuery(pool, `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const migration of migrations) {
    const applied = await runQuery(pool, 'SELECT version FROM schema_migrations WHERE version = ?', [migration.version]);
    if (applied.length) continue;
    for (const statement of migration.statements) {
      if (typeof statement === 'string') {
        await runQuery(pool, statement);
        continue;
      }
      const { table, column, definition } = statement.ensureColumn;
      const existing = await runQuery(pool, `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `, [table, column]);
      if (Number(existing[0]?.count) === 0) {
        await runQuery(pool, `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
    await runQuery(pool, 'INSERT INTO schema_migrations (version) VALUES (?)', [migration.version]);
  }
}

module.exports = { applyMigrations, migrations };
