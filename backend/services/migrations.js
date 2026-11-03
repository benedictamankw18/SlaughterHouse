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

module.exports = { applyMigrations };
