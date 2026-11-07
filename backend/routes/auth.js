const express = require('express');
const database = require('../database');
const sessions = require('../session-store');
const config = require('../config');
const { hashPassword, passwordMatches, validatePassword } = require('../services/security');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { issueToken, consumeToken } = require('../services/account-tokens');
const { recordAuditSafely } = require('../services/audit');
const { rateLimit } = require('../services/rate-limit');
const { createEmailIdempotencyKey, queueEmailSafely } = require('../services/email/outbox');
const logger = require('../services/logger');

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

function accountActionUrl(parameter, token) {
  const url = new URL('/', config.frontendOrigin);
  url.searchParams.set(parameter, token);
  return url.toString();
}

function duplicateAccountMessage(error) {
  if (error.code !== 'ER_DUP_ENTRY' && error.code !== '23505') return null;
  const constraint = String(error.constraint || '').toLowerCase();
  const detail = String(error.detail || error.sqlMessage || '').toLowerCase();
  const duplicateEmail = constraint.includes('email')
    || (error.code === 'ER_DUP_ENTRY' && detail.includes('email'))
    || /\bkey\s*\(\s*(?:email|lower\s*\(\s*email\s*\))\s*\)\s*=/.test(detail);
  const duplicatePhone = constraint.includes('phone')
    || (error.code === 'ER_DUP_ENTRY' && detail.includes('phone'))
    || /\bkey\s*\(\s*phone\s*\)\s*=/.test(detail);
  if (duplicateEmail) return 'An account with this email already exists.';
  if (duplicatePhone) return 'An account with this phone number already exists.';
  return 'An account with these details already exists.';
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
  const validationError = validators.email(email)
    || validators.text(firstName, 'First name', { required: true, max: 100 })
    || validators.text(lastName, 'Last name', { required: true, max: 100 })
    || validators.phone(normalizedPhone)
    || validatePassword(password)
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
        const duplicateMessage = duplicateAccountMessage(error);
        if (duplicateMessage) return response.status(409).json({ error: duplicateMessage });
        logger.error('account_creation_failed', { code: error.code });
        const databaseMessages = {
          ER_NO_SUCH_TABLE: 'The users table is missing. Run node database.js to initialize the database.',
          ER_BAD_FIELD_ERROR: 'The users table is missing a required column. Run node database.js to update the database.',
          ER_DATA_TOO_LONG: 'One of the account fields is too long.',
          ER_BAD_NULL_ERROR: 'A required account field was empty.'
        };
        return response.status(500).json({ error: databaseMessages[error.code] || 'Could not create the account. Please try again.' });
      }
      try {
        await queueEmailSafely(database, {
          to: normalizedEmail,
          template: 'welcome',
          idempotencyKey: `welcome:${this.lastID}`,
          data: { name, accountUrl: new URL('/', config.frontendOrigin).toString() }
        });
        const verificationToken = await issueToken(database, this.lastID, 'email_verification');
        const emailQueued = await queueEmailSafely(database, {
          to: normalizedEmail,
          template: 'email_verification',
          idempotencyKey: createEmailIdempotencyKey('email-verification', verificationToken),
          data: { name, verifyUrl: accountActionUrl('verifyToken', verificationToken) }
        });
        await recordAuditSafely(database, { userId: this.lastID, action: 'account_created', entityType: 'user', entityId: this.lastID, details: { role: normalizedRole }, ipAddress: request.ip });
        const result = {
          user: { id: this.lastID, name, email: normalizedEmail, role: normalizedRole },
          message: emailQueued ? 'Account created. Check your email to verify the account.' : 'Account created, but the verification email could not be queued.'
        };
        if (process.env.NODE_ENV !== 'production') result.verificationToken = verificationToken;
        response.status(201).json(result);
      } catch (tokenError) {
        logger.error('email_verification_token_creation_failed', { code: tokenError.code });
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
  database.get('SELECT id, name, email, phone, role, password_hash, email_verified_at AS "emailVerifiedAt" FROM users WHERE (lower(email) = lower(?) OR phone = ?) AND role NOT IN (\'admin\', \'super_admin\')', [identifier, identifier], async (error, user) => {
    if (error) return response.status(500).json({ error: databaseError('Customer sign-in failed.', error) });
    if (!user || !(await passwordMatches(password, user.password_hash))) {
      attempt.count += 1;
      sessions.customerLoginAttempts.set(request.ip, attempt);
      recordAuditSafely(database, { action: 'customer_login_failed', details: { identifierType: identifier.includes('@') ? 'email' : 'phone' }, ipAddress: request.ip });
      return response.status(401).json({ error: 'Invalid email/phone number or password.' });
    }
    sessions.customerLoginAttempts.delete(request.ip);
    if (!user.emailVerifiedAt) {
      recordAuditSafely(database, { userId: user.id, action: 'customer_login_blocked_unverified', entityType: 'user', entityId: user.id, ipAddress: request.ip });
      return response.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Verify your email address before signing in. You can resend the verification email below.'
      });
    }
    recordAuditSafely(database, { userId: user.id, action: 'customer_login', entityType: 'user', entityId: user.id, ipAddress: request.ip });
    sessions.createSession({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role })
      .then(({ token, csrfToken }) => {
        response.setHeader('Set-Cookie', cookieOptions(config.sessionCookieNames.customer, token));
        response.json({ token, csrfToken, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
      })
      .catch(sessionError => response.status(500).json({ error: databaseError('Creating the customer login session failed.', sessionError) }));
  });
});

router.post('/auth/resend-verification', resetRateLimit, async (request, response) => {
  const identifier = String(request.body.identifier || '').trim();
  if (!identifier || identifier.length > 320) {
    return response.status(400).json({ error: 'Enter the email address or phone number for your account.' });
  }
  try {
    const user = await queryOne(
      'SELECT id, name, email, email_verified_at AS "emailVerifiedAt" FROM users WHERE (lower(email) = lower(?) OR phone = ?) AND role NOT IN (\'admin\', \'super_admin\')',
      [identifier, identifier]
    );
    const result = { message: 'If an unverified customer account matches those details, a verification email will be sent.' };
    if (!user || user.emailVerifiedAt) return response.json(result);

    const token = await issueToken(database, user.id, 'email_verification');
    const emailQueued = await queueEmailSafely(database, {
      to: user.email,
      template: 'email_verification',
      idempotencyKey: createEmailIdempotencyKey('email-verification', token),
      data: { name: user.name, verifyUrl: accountActionUrl('verifyToken', token) }
    });
    await recordAuditSafely(database, {
      userId: user.id,
      action: 'email_verification_resent',
      entityType: 'user',
      entityId: user.id,
      details: { emailQueued },
      ipAddress: request.ip
    });
    if (emailQueued && process.env.NODE_ENV !== 'production') result.verificationToken = token;
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: databaseError('Requesting email verification failed.', error) });
  }
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
      'SELECT id, name, email, first_name AS "firstName", last_name AS "lastName", artist_name AS "artistName", phone, role, address, email_verified_at AS "emailVerifiedAt" FROM users WHERE id = ? AND role NOT IN (\'admin\', \'super_admin\')',
      [request.customer.id]
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
    currentUser = await queryOne("SELECT role FROM users WHERE id = ? AND role NOT IN ('admin', 'super_admin')", [request.customer.id]);
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
       WHERE id = ? AND role NOT IN ('admin', 'super_admin')`,
      [`${firstNameValue} ${lastNameValue}`, firstNameValue, lastNameValue, currentUser.role === 'artist' ? artistNameValue : null, phoneValue, currentUser.role === 'artist' ? null : addressValue, request.customer.id]
    );
    const user = await queryOne(
      'SELECT id, name, email, first_name AS "firstName", last_name AS "lastName", artist_name AS "artistName", phone, role, address, email_verified_at AS "emailVerifiedAt" FROM users WHERE id = ?',
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
    const user = await new Promise((resolve, reject) => database.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [email], (error, row) => error ? reject(error) : resolve(row)));
    const result = { message: 'If a customer account exists for that email, password reset instructions will be sent.' };
    if (!user) return response.json(result);
    const token = await issueToken(database, user.id, 'password_reset');
    const account = await queryOne('SELECT name FROM users WHERE id = ?', [user.id]);
    await queueEmailSafely(database, {
      to: email,
      template: 'password_reset',
      idempotencyKey: createEmailIdempotencyKey('password-reset', token),
      data: { name: account?.name || 'there', resetUrl: accountActionUrl('resetToken', token) }
    });
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
  const passwordError = validatePassword(password);
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.status(400).json({ error: 'A valid password reset token is required.' });
  if (passwordError) return response.status(400).json({ error: passwordError });
  try {
    const accountToken = await consumeToken(database, token, 'password_reset');
    if (!accountToken) return response.status(400).json({ error: 'This password reset token is invalid, expired, or already used.' });
    const passwordHash = await hashPassword(password);
    await database.transaction(async transaction => {
      await transaction.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, accountToken.user_id]);
      await transaction.run('DELETE FROM user_sessions WHERE user_id = ?', [accountToken.user_id]);
    });
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
    "SELECT id, name, email, phone, role, password_hash FROM users WHERE lower(email) = lower(?) AND role IN ('admin', 'super_admin')",
    [email],
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
      }).then(({ token, csrfToken }) => {
        response.setHeader('Set-Cookie', cookieOptions(config.sessionCookieNames.admin, token));
        response.json({ token, csrfToken, email: admin.email, role: admin.role });
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
