const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const config = require('../config');
const { hashPassword, passwordMatches } = require('../services/security');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { issueToken, consumeToken } = require('../services/account-tokens');
const { recordAuditSafely } = require('../services/audit');
const { rateLimit } = require('../services/rate-limit');

const router = express.Router();
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many authentication requests. Try again later.' });
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts. Try again later.' });
const resetRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many password reset requests. Try again later.' });
const cookieOptions = (name, token) => `${name}=${encodeURIComponent(token)}; Max-Age=${Math.floor(config.sessionDurationMs / 1000)}; Path=/; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;
const clearCookie = name => `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;

function queryOne(query, parameters = []) {
  return new Promise((resolve, reject) => database.get(query, parameters, (error, row) => error ? reject(error) : resolve(row)));
}

function execute(query, parameters = []) {
  return new Promise((resolve, reject) => database.run(query, parameters, function (error) {
    if (error) return reject(error);
    resolve(this);
  }));
}

router.post('/auth/signup', authRateLimit, async (request, response) => {
  const { email, firstName, lastName, artistName, phone, password, role, address } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim();
  const normalizedRole = role === 'artist' ? 'artist' : 'non_artist';
  let artistNameTrimmed = null;
  if (normalizedRole === 'artist') {
    artistNameTrimmed = String(artistName || '').trim();
  }
  let addressTrimmed = null;
  if (normalizedRole === 'non_artist') {
    addressTrimmed = String(address || '').trim();
  }
  const passwordPattern = /^[A-Za-z0-9]{8,}$/;
  const validationError = validators.email(email)
    || validators.text(firstName, 'First name', { required: true, max: 100 })
    || validators.text(lastName, 'Last name', { required: true, max: 100 })
    || validators.phone(normalizedPhone)
    || (!passwordPattern.test(password || '') ? 'Password must use letters and numbers only and be at least 8 characters.' : null)
    || (normalizedRole === 'artist' ? validators.text(artistName, 'Artist name', { required: true, max: 255 }) : validators.text(address, 'Address', { required: true, max: 2000 }));
  if (validationError) return response.status(400).json({ error: validationError });

  const firstNameValue = String(firstName).trim();
  const lastNameValue = String(lastName).trim();
  const name = `${firstNameValue} ${lastNameValue}`;
  let passwordHash;
  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    return response.status(500).json({ error: 'Could not secure the account password.' });
  }
  database.run(
    `INSERT INTO users (name, email, first_name, last_name, artist_name, phone, role, address, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, normalizedEmail, firstNameValue, lastNameValue, artistNameTrimmed, normalizedPhone, normalizedRole, addressTrimmed, passwordHash],
    async function (error) {
      if (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          const duplicateEmail = error.sqlMessage?.toLowerCase().includes('email');
          const duplicatePhone = error.sqlMessage?.toLowerCase().includes('phone');
          const message = duplicateEmail
            ? 'An account with this email already exists.'
            : duplicatePhone
              ? 'An account with this phone number already exists.'
              : 'An account with these details already exists.';
          return response.status(409).json({ error: message });
        }
        console.error('Account creation failed:', error.code, error.sqlMessage || error.message);
        const databaseMessages = {
          ER_NO_SUCH_TABLE: 'The users table is missing. Run node database.js to initialize the database.',
          ER_BAD_FIELD_ERROR: 'The users table is missing a required column. Run node database.js to update the database.',
          ER_DATA_TOO_LONG: 'One of the account fields is too long.',
          ER_BAD_NULL_ERROR: 'A required account field was empty.'
        };
        return response.status(500).json({ error: databaseMessages[error.code] || `Could not create the account because the database returned ${error.code || 'an unknown error'}.` });
      }
      try {
        const verificationToken = await issueToken(database, this.lastID, 'email_verification');
        await recordAuditSafely(database, { userId: this.lastID, action: 'account_created', entityType: 'user', entityId: this.lastID, details: { role: normalizedRole }, ipAddress: request.ip });
        const result = { user: { id: this.lastID, name, email: normalizedEmail, role: normalizedRole }, message: 'Account created. Check your email to verify the account.' };
        if (process.env.NODE_ENV !== 'production') result.verificationToken = verificationToken;
        response.status(201).json(result);
      } catch (tokenError) {
        console.error('Email verification token creation failed:', tokenError.code || tokenError.message);
        response.status(201).json({ user: { id: this.lastID, name, email: normalizedEmail, role: normalizedRole }, message: 'Account created, but the verification message could not be prepared. Request a new verification email.' });
      }
    }
  );
});

router.post('/auth/login', loginRateLimit, (request, response) => {
  const identifier = String(request.body.identifier || '').trim();
  const password = String(request.body.password || '');
  if (!identifier) return response.status(400).json({ error: 'Email or phone number is required.' });
  if (!password) return response.status(400).json({ error: 'Password is required.' });
  const attempt = sessions.customerLoginAttempts.get(request.ip) || { count: 0, startedAt: Date.now() };
  if (Date.now() - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = Date.now(); }
  if (attempt.count >= 10) return response.status(429).json({ error: 'Too many login attempts. Try again later.' });
  database.get('SELECT id, name, email, phone, role, password_hash FROM users WHERE (lower(email) = lower(?) OR phone = ?) AND role <> ?', [identifier, identifier, 'admin'], async (error, user) => {
    if (error) return response.status(500).json({ error: databaseError('Customer sign-in failed.', error) });
    if (!user || !(await passwordMatches(password, user.password_hash))) {
      attempt.count += 1;
      sessions.customerLoginAttempts.set(request.ip, attempt);
      recordAuditSafely(database, { action: 'customer_login_failed', details: { identifierType: identifier.includes('@') ? 'email' : 'phone' }, ipAddress: request.ip });
      return response.status(401).json({ error: 'Invalid email/phone number or password.' });
    }
    sessions.customerLoginAttempts.delete(request.ip);
    recordAuditSafely(database, { userId: user.id, action: 'customer_login', entityType: 'user', entityId: user.id, ipAddress: request.ip });
    sessions.createSession({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role })
      .then(token => {
        response.setHeader('Set-Cookie', cookieOptions(config.sessionCookieNames.customer, token));
        response.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
      })
      .catch(sessionError => response.status(500).json({ error: databaseError('Creating the customer login session failed.', sessionError) }));
  });
});

router.post('/auth/logout', sessions.requireCustomer, (request, response) => {
  sessions.deleteSession(request.sessionToken)
    .then(() => {
      recordAuditSafely(database, { userId: request.customer.id, action: 'customer_logout', entityType: 'user', entityId: request.customer.id, ipAddress: request.ip });
      response.setHeader('Set-Cookie', clearCookie(config.sessionCookieNames.customer));
      response.status(204).end();
    })
    .catch(error => response.status(500).json({ error: databaseError('Signing out the customer failed.', error) }));
});

router.get('/auth/profile', sessions.requireCustomer, async (request, response) => {
  try {
    const user = await queryOne(
      'SELECT id, name, email, first_name AS firstName, last_name AS lastName, artist_name AS artistName, phone, role, address, email_verified_at AS emailVerifiedAt FROM users WHERE id = ? AND role <> ?',
      [request.customer.id, 'admin']
    );
    if (!user) return response.status(404).json({ error: 'Customer profile was not found.' });
    response.json({ user });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading the customer profile failed.', error) });
  }
});

router.patch('/auth/profile', sessions.requireCustomer, async (request, response) => {
  const { firstName, lastName, artistName, phone, address } = request.body;
  const firstNameValue = String(firstName || '').trim();
  const lastNameValue = String(lastName || '').trim();
  const phoneValue = String(phone || '').trim();
  const artistNameValue = String(artistName || '').trim();
  const addressValue = String(address || '').trim();
  let currentUser;
  try {
    currentUser = await queryOne('SELECT role FROM users WHERE id = ? AND role <> ?', [request.customer.id, 'admin']);
  } catch (error) {
    return response.status(500).json({ error: databaseError('Loading the customer profile failed.', error) });
  }
  if (!currentUser) return response.status(404).json({ error: 'Customer profile was not found.' });
  const validationError = validators.text(firstName, 'First name', { required: true, max: 100 })
    || validators.text(lastName, 'Last name', { required: true, max: 100 })
    || validators.phone(phoneValue)
    || (currentUser.role === 'artist'
      ? validators.text(artistName, 'Artist name', { required: true, max: 255 })
      : validators.text(address, 'Address', { required: true, max: 2000 }));
  if (validationError) return response.status(400).json({ error: validationError });
  try {
    await execute(
      `UPDATE users
       SET name = ?, first_name = ?, last_name = ?, artist_name = ?, phone = ?, address = ?
       WHERE id = ? AND role <> ?`,
      [`${firstNameValue} ${lastNameValue}`, firstNameValue, lastNameValue, currentUser.role === 'artist' ? artistNameValue : null, phoneValue, currentUser.role === 'artist' ? null : addressValue, request.customer.id, 'admin']
    );
    const user = await queryOne(
      'SELECT id, name, email, first_name AS firstName, last_name AS lastName, artist_name AS artistName, phone, role, address, email_verified_at AS emailVerifiedAt FROM users WHERE id = ?',
      [request.customer.id]
    );
    await recordAuditSafely(database, { userId: request.customer.id, action: 'profile_updated', entityType: 'user', entityId: request.customer.id, ipAddress: request.ip });
    response.json({ user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'That phone number is already used by another account.' });
    response.status(500).json({ error: databaseError('Updating the customer profile failed.', error) });
  }
});

router.post('/auth/request-password-reset', resetRateLimit, async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const emailError = validators.email(email);
  if (emailError) return response.status(400).json({ error: emailError });
  try {
    const user = await new Promise((resolve, reject) => database.get('SELECT id FROM users WHERE lower(email) = lower(?) AND role <> ?', [email, 'admin'], (error, row) => error ? reject(error) : resolve(row)));
    const result = { message: 'If a customer account exists for that email, password reset instructions will be sent.' };
    if (!user) return response.json(result);
    const token = await issueToken(database, user.id, 'password_reset');
    await recordAuditSafely(database, { userId: user.id, action: 'password_reset_requested', entityType: 'user', entityId: user.id, ipAddress: request.ip });
    if (process.env.NODE_ENV !== 'production') result.resetToken = token;
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: databaseError('Creating the password reset request failed.', error) });
  }
});

router.post('/auth/reset-password', resetRateLimit, async (request, response) => {
  const token = String(request.body.token || '');
  const password = String(request.body.password || '');
  const passwordPattern = /^[A-Za-z0-9]{8,}$/;
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.status(400).json({ error: 'A valid password reset token is required.' });
  if (!passwordPattern.test(password)) return response.status(400).json({ error: 'Password must use letters and numbers only and be at least 8 characters.' });
  try {
    const accountToken = await consumeToken(database, token, 'password_reset');
    if (!accountToken) return response.status(400).json({ error: 'This password reset token is invalid, expired, or already used.' });
    await new Promise((resolve, reject) => hashPassword(password).then(passwordHash => database.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, accountToken.user_id], error => error ? reject(error) : resolve())).catch(reject));
    await recordAuditSafely(database, { userId: accountToken.user_id, action: 'password_reset_completed', entityType: 'user', entityId: accountToken.user_id, ipAddress: request.ip });
    response.json({ message: 'Password reset completed. You can now sign in with the new password.' });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the password failed.', error) });
  }
});

router.post('/auth/verify-email', resetRateLimit, async (request, response) => {
  const token = String(request.body.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.status(400).json({ error: 'A valid email verification token is required.' });
  try {
    const accountToken = await consumeToken(database, token, 'email_verification');
    if (!accountToken) return response.status(400).json({ error: 'This email verification token is invalid, expired, or already used.' });
    await new Promise((resolve, reject) => database.run('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [accountToken.user_id], error => error ? reject(error) : resolve()));
    await recordAuditSafely(database, { userId: accountToken.user_id, action: 'email_verified', entityType: 'user', entityId: accountToken.user_id, ipAddress: request.ip });
    response.json({ message: 'Email address verified successfully.' });
  } catch (error) {
    response.status(500).json({ error: databaseError('Verifying the email address failed.', error) });
  }
});

router.post('/admin/login', loginRateLimit, (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  const emailError = validators.email(email);
  if (emailError) return response.status(400).json({ error: emailError });
  if (!password) return response.status(400).json({ error: 'Password is required.' });
  const attempt = sessions.adminLoginAttempts.get(request.ip) || { count: 0, startedAt: Date.now() };
  if (Date.now() - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = Date.now(); }
  if (attempt.count >= 10) return response.status(429).json({ error: 'Too many login attempts. Try again later.' });
  database.get(
    'SELECT id, name, email, phone, role, password_hash FROM users WHERE lower(email) = lower(?) AND role = ?',
    [email, 'admin'],
    async (error, admin) => {
      if (error) return response.status(500).json({ error: databaseError('Administrator sign-in failed.', error) });
      if (!admin || !(await passwordMatches(password, admin.password_hash))) {
        attempt.count += 1;
        sessions.adminLoginAttempts.set(request.ip, attempt);
        recordAuditSafely(database, { action: 'admin_login_failed', details: { emailProvided: Boolean(email) }, ipAddress: request.ip });
        return response.status(401).json({ error: 'Invalid admin credentials.' });
      }
      sessions.adminLoginAttempts.delete(request.ip);
      recordAuditSafely(database, { userId: admin.id, action: 'admin_login', entityType: 'user', entityId: admin.id, ipAddress: request.ip });
      sessions.createSession({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }).then(token => {
        response.setHeader('Set-Cookie', cookieOptions(config.sessionCookieNames.admin, token));
        response.json({ token, email: admin.email });
      })
        .catch(sessionError => response.status(500).json({ error: databaseError('Creating the administrator login session failed.', sessionError) }));
    }
  );
});

router.post('/admin/logout', sessions.requireAdmin, (request, response) => {
  sessions.deleteSession(request.sessionToken)
    .then(() => {
      recordAuditSafely(database, { userId: request.admin.id, action: 'admin_logout', entityType: 'user', entityId: request.admin.id, ipAddress: request.ip });
      response.setHeader('Set-Cookie', clearCookie(config.sessionCookieNames.admin));
      response.status(204).end();
    })
    .catch(error => response.status(500).json({ error: databaseError('Signing out the administrator failed.', error) }));
});

module.exports = router;
