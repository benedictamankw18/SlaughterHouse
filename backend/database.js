require('dotenv').config();

const mysql = require('mysql2');
const { applyMigrations } = require('./services/migrations');
const { runInTransaction } = require('./services/transaction');

const mysqlConfig = process.env.MYSQL_URL && !process.env.MYSQL_URL.includes('user:password')
  ? process.env.MYSQL_URL
  : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  };

if (!mysqlConfig.host && typeof mysqlConfig !== 'string') throw new Error('Configure MYSQL_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME before starting the backend.');

const pool = mysql.createPool(mysqlConfig);
let initialization;
const database = {
  run(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, result) => callback?.call({ lastID: result?.insertId, changes: result?.affectedRows }, error, result)));
  },
  get(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, rows) => callback?.(error, rows?.[0])));
  },
  all(query, parameters, callback) {
    initialization.then(() => pool.execute(query, parameters || [], (error, rows) => callback?.(error, rows)));
  },
  close() {
    return new Promise((resolve, reject) => pool.end(error => error ? reject(error) : resolve()));
  },
  getConnectionConfig() {
    return mysqlConfig;
  },
  transaction(callback) {
    return initialization
      .then(() => new Promise((resolve, reject) => pool.getConnection((error, connection) => error ? reject(error) : resolve(connection))))
      .then(async connection => {
        try {
          return await runInTransaction(connection, callback);
        } finally {
          connection.release();
        }
      });
  },
  initialize() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, first_name VARCHAR(255), last_name VARCHAR(255), artist_name VARCHAR(255), phone VARCHAR(255) UNIQUE, role VARCHAR(50) NOT NULL DEFAULT 'non_artist', address TEXT, password_hash VARCHAR(255) NOT NULL, email_verified_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS beats (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(255) NOT NULL, bpm INT, musical_key VARCHAR(255), genre VARCHAR(255), mood VARCHAR(255), cover_art VARCHAR(255), preview_file VARCHAR(255), mp3_file VARCHAR(255), wav_file VARCHAR(255), stems_file VARCHAR(255), basic_price DECIMAL(12,2), premium_price DECIMAL(12,2), unlimited_price DECIMAL(12,2), exclusive_price DECIMAL(12,2), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS merchandise (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(255) NOT NULL, description TEXT, price DECIMAL(12,2), photo VARCHAR(255), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS sales (id INT PRIMARY KEY AUTO_INCREMENT, sale_type VARCHAR(50) NOT NULL, product_id INT, product_name VARCHAR(255) NOT NULL, buyer_name VARCHAR(255), buyer_email VARCHAR(255), amount DECIMAL(12,2) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS orders (id INT PRIMARY KEY AUTO_INCREMENT, reference VARCHAR(255) NOT NULL UNIQUE, customer_name VARCHAR(255) NOT NULL, customer_email VARCHAR(255) NOT NULL, amount DECIMAL(12,2) NOT NULL, currency VARCHAR(10) NOT NULL, items_json JSON NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS customization_requests (id INT PRIMARY KEY AUTO_INCREMENT, request_type VARCHAR(50) NOT NULL, customer_name VARCHAR(255) NOT NULL, customer_email VARCHAR(255) NOT NULL, product_name VARCHAR(255), details TEXT, sample_audio_file VARCHAR(255), sample_link TEXT, requested_license VARCHAR(50), license_price_gsh DECIMAL(12,2), status VARCHAR(50) NOT NULL DEFAULT 'new', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS customer_reviews (id INT PRIMARY KEY AUTO_INCREMENT, customer_name VARCHAR(255) NOT NULL, customer_email VARCHAR(255) NOT NULL, rating TINYINT NOT NULL, review_text TEXT NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS withdrawals (id INT PRIMARY KEY AUTO_INCREMENT, amount DECIMAL(12,2) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS bookings (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, phone VARCHAR(255), service VARCHAR(255) NOT NULL, artist_count INT NOT NULL DEFAULT 1, song_count INT, booking_slots_json JSON, preferred_date VARCHAR(255), preferred_time VARCHAR(255), details TEXT, payment_reference VARCHAR(255) UNIQUE, status VARCHAR(50) NOT NULL DEFAULT 'new', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS settings (setting_key VARCHAR(255) PRIMARY KEY, setting_value TEXT NOT NULL)`,
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
    ];
    return statements.reduce((promise, statement) => promise.then(() => new Promise((resolve, reject) => pool.query(statement, error => error ? reject(error) : resolve()))), Promise.resolve()).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE bookings ADD COLUMN artist_count INT NOT NULL DEFAULT 1', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE customization_requests ADD COLUMN sample_audio_file VARCHAR(255)', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE customization_requests ADD COLUMN requested_license VARCHAR(50)', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE customization_requests ADD COLUMN license_price_gsh DECIMAL(12,2)', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE customization_requests ADD COLUMN sample_link TEXT', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE bookings ADD COLUMN payment_reference VARCHAR(255) UNIQUE', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE bookings ADD COLUMN song_count INT', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE bookings ADD COLUMN booking_slots_json JSON', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => new Promise((resolve, reject) => {
      pool.query('ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL', error => {
        if (error?.code === 'ER_DUP_FIELDNAME') return resolve();
        if (error) return reject(error);
        resolve();
      });
    })).then(() => applyMigrations(pool));
  }
};

initialization = database.initialize().catch(error => { console.error('MySQL initialization failed:', error.message); throw error; });
module.exports = database;

if (require.main === module) {
  initialization
    .then(() => database.close())
    .then(() => console.log('Database initialized successfully.'))
    .catch(() => process.exitCode = 1);
}
