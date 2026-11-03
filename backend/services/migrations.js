const { DEFAULT_LICENSE_RIGHTS } = require('./license-rights');

const migrations = [
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
    for (const statement of migration.statements) await runQuery(pool, statement);
    await runQuery(pool, 'INSERT INTO schema_migrations (version) VALUES (?)', [migration.version]);
  }
}

module.exports = { applyMigrations, migrations };
