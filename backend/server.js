require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const database = require('./database');

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';
const frontendOrigin = allowedOrigin.startsWith('http') ? allowedOrigin : 'http://localhost:5500';
const apiPublicUrl = (process.env.API_PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const paymentCallbackUrl = new URL(process.env.PAYMENT_CALLBACK_URL || '/payment-success.html', frontendOrigin);
paymentCallbackUrl.searchParams.set('apiBaseUrl', apiPublicUrl);

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100mb' }));

const uploadDirectory = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const adminSessions = new Map();
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
const usdToGhsRate = 10;
const bookingServiceLabels = { mixtape: 'Mixtape', 'full-production': 'Full production', 'beat-production': 'Beat production', 'adverts-promos': 'Adverts and promos', 'ep-album': 'EP / Album' };
const beatRequestLicenseLabels = { basic: 'Basic', premium: 'Premium', unlimited: 'Unlimited', exclusive: 'Exclusive' };
const adminSessionDurationMs = 8 * 60 * 60 * 1000;
const adminLoginAttempts = new Map();

function getBookingFees() {
  return {
    mixtape: Number(process.env.BOOKING_FEE_MIXTAPE_GHS ?? 700),
    'full-production': Number(process.env.BOOKING_FEE_FULL_PRODUCTION_GHS ?? 1000),
    'beat-production': Number(process.env.BOOKING_FEE_BEAT_PRODUCTION_GHS ?? 500),
    'adverts-promos': Number(process.env.BOOKING_FEE_ADVERTS_PROMOS_GHS ?? 1000)
  };
}

function calculateBookingFee(service, songCount, fees) {
  if (service !== 'ep-album') return fees[service];
  if (!Number.isInteger(songCount) || songCount < 1 || songCount > 12) return null;
  const fullProductionRate = fees['full-production'];
  if (!Number.isFinite(fullProductionRate) || fullProductionRate <= 0) return null;
  return Number((fullProductionRate * songCount * 0.8).toFixed(2));
}

function isAvailableBookingSlot(dateValue, timeValue) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  const timeParts = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ''));
  if (!dateParts || !timeParts) return false;
  const [, yearValue, monthValue, dayValue] = dateParts;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || ![0, 2, 3, 4].includes(date.getUTCDay())) return false;
  const minutes = Number(timeParts[1]) * 60 + Number(timeParts[2]);
  return minutes >= 11 * 60 && minutes + 140 <= 21 * 60;
}

function areAvailableBookingSlots(slots, expectedCount) {
  if (!Array.isArray(slots) || slots.length !== expectedCount || !slots.every(slot => isAvailableBookingSlot(slot?.date, slot?.time))) return false;
  return slots.every((slot, index) => slots.slice(index + 1).every(otherSlot => {
    if (slot.date !== otherSlot.date) return true;
    const start = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    return start(slot.time) + 140 <= start(otherSlot.time) || start(otherSlot.time) + 140 <= start(slot.time);
  }));
}

function getBeatRequestLicensePrices() {
  return {
    basic: Number(process.env.BEAT_REQUEST_LICENSE_BASIC_GHS ?? 500),
    premium: Number(process.env.BEAT_REQUEST_LICENSE_PREMIUM_GHS ?? 1000),
    unlimited: Number(process.env.BEAT_REQUEST_LICENSE_UNLIMITED_GHS ?? 2000),
    exclusive: Number(process.env.BEAT_REQUEST_LICENSE_EXCLUSIVE_GHS ?? 4700)
  };
}

function getAdmins() {
  try {
    const configured = JSON.parse(process.env.ADMIN_USERS || '[]');
    return configured.filter(admin => admin.email && admin.password);
  } catch {
    return [];
  }
}

function requireAdmin(request, response, next) {
  const token = request.get('Authorization')?.replace('Bearer ', '');
  const session = token && adminSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return response.status(401).json({ error: 'Admin login required.' });
  }
  request.admin = session;
  next();
}

function saveUpload(file, prefix) {
  if (!file?.data || !file.name) return null;
  const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid upload format.');
  const extension = path.extname(file.name).replace(/[^a-z0-9.]/gi, '').slice(0, 10) || '.bin';
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(uploadDirectory, filename), Buffer.from(match[2], 'base64'));
  return filename;
}

const passwordPattern = /^[A-Za-z0-9]{8,}$/;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${passwordHash}`;
}

function passwordMatches(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const expectedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function getDownloadItems(order) {
  return JSON.parse(order.items_json).filter(item => !item.type || item.type === 'beat').map(item => ({
    name: item.name,
    license: item.license,
    files: ['MP3', ...(['premium', 'unlimited', 'exclusive'].includes(item.license) ? ['WAV'] : []), ...(['unlimited', 'exclusive'].includes(item.license) ? ['STEMS'] : [])].map(format => ({ format, url: new URL(`/api/orders/${encodeURIComponent(order.reference)}/downloads/${item.productId}?license=${encodeURIComponent(item.license)}&format=${format.toLowerCase()}`, apiPublicUrl).toString() }))
  }));
}

function queryRows(query, parameters = []) {
  return new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
}

app.post('/api/auth/signup', (request, response) => {
  const { email, firstName, lastName, artistName, phone, password, role, address } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').trim();
  const normalizedRole = role === 'artist' ? 'artist' : 'non_artist';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return response.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!firstName || !lastName || !normalizedPhone || !passwordPattern.test(password || '')) {
    return response.status(400).json({ error: 'Complete all required fields. Passwords must use letters and numbers only and be at least 8 characters.' });
  }
  if (normalizedRole === 'artist' && !artistName) {
    return response.status(400).json({ error: 'Enter your artiste name.' });
  }
  if (normalizedRole === 'non_artist' && !address) {
    return response.status(400).json({ error: 'Enter your address.' });
  }

  const name = `${firstName.trim()} ${lastName.trim()}`;
  database.run(
    `INSERT INTO users (name, email, first_name, last_name, artist_name, phone, role, address, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, normalizedEmail, firstName.trim(), lastName.trim(), artistName?.trim() || null, normalizedPhone, normalizedRole, address?.trim() || null, hashPassword(password)],
    function (error) {
      if (error) {
        const message = error.message.includes('UNIQUE') ? 'That email or phone number is already registered.' : 'Could not create the account.';
        return response.status(400).json({ error: message });
      }
      response.status(201).json({ user: { id: this.lastID, name, email: normalizedEmail, role: normalizedRole } });
    }
  );
});

app.post('/api/auth/login', (request, response) => {
  const identifier = String(request.body.identifier || '').trim();
  const password = String(request.body.password || '');
  database.get('SELECT id, name, email, phone, role, password_hash FROM users WHERE lower(email) = lower(?) OR phone = ?', [identifier, identifier], (error, user) => {
    if (error || !user || !passwordMatches(password, user.password_hash)) {
      return response.status(401).json({ error: 'Invalid email/phone number or password.' });
    }
    response.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
  });
});

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/reviews', (request, response) => {
  queryRows("SELECT id, customer_name, rating, review_text, created_at FROM customer_reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT 12")
    .then(reviews => response.json({ reviews }))
    .catch(() => response.status(500).json({ error: 'Could not load reviews.' }));
});

app.post('/api/reviews', (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = String(request.body.email || '').trim().toLowerCase();
  const review = String(request.body.review || '').trim();
  const rating = Number(request.body.rating);
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || review.length < 3 || review.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return response.status(400).json({ error: 'Enter your name, a valid email, a 1–5 star rating, and a review under 2,000 characters.' });
  }
  database.run('INSERT INTO customer_reviews (customer_name, customer_email, rating, review_text) VALUES (?, ?, ?, ?)', [name, email, rating, review], function (error) {
    if (error) return response.status(500).json({ error: 'Could not submit your review.' });
    response.status(201).json({ id: this.lastID, message: 'Thanks. Your review is waiting for approval.' });
  });
});

app.get('/api/users/count', (request, response) => {
  database.get('SELECT COUNT(*) AS count FROM users', (error, row) => {
    if (error) {
      return response.status(500).json({ error: 'Could not read users.' });
    }

    response.json({ count: row.count });
  });
});

app.get('/api/merchandise', (request, response) => {
  database.all('SELECT id, title, description, price, photo FROM merchandise ORDER BY created_at DESC', (error, merchandise) => {
    if (error) return response.status(500).json({ error: 'Could not load merchandise.' });
    response.json({ merchandise });
  });
});

app.get('/api/uploads/:filename', (request, response) => {
  const filename = path.basename(request.params.filename);
  if (filename !== request.params.filename) return response.sendStatus(400);
  response.sendFile(path.join(uploadDirectory, filename), error => {
    if (error && !response.headersSent) response.sendStatus(404);
  });
});

app.post('/api/admin/login', (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  const attempt = adminLoginAttempts.get(request.ip) || { count: 0, startedAt: Date.now() };
  if (Date.now() - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = Date.now(); }
  if (attempt.count >= 10) return response.status(429).json({ error: 'Too many login attempts. Try again later.' });
  // Temporary local editing access; remove this branch to restore configured-admin-only login.
  const temporaryLocalAdmin = process.env.NODE_ENV !== 'production' && email === 'admin' && password === 'admin';
  const admin = temporaryLocalAdmin
    ? { email: 'admin' }
    : getAdmins().find(candidate => candidate.email.toLowerCase() === email && candidate.password === password);
  if (!admin) {
    attempt.count += 1;
    adminLoginAttempts.set(request.ip, attempt);
    return response.status(401).json({ error: 'Invalid admin credentials.' });
  }
  adminLoginAttempts.delete(request.ip);
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { email: admin.email, expiresAt: Date.now() + adminSessionDurationMs });
  response.json({ token, email: admin.email });
});

app.get('/api/admin/data', requireAdmin, (request, response) => {
  Promise.all([
    queryRows('SELECT * FROM beats ORDER BY created_at DESC'),
    queryRows('SELECT * FROM merchandise ORDER BY created_at DESC'),
    queryRows('SELECT * FROM sales ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customization_requests ORDER BY created_at DESC'),
    queryRows('SELECT * FROM bookings ORDER BY created_at DESC'),
    queryRows('SELECT * FROM orders ORDER BY created_at DESC'),
    queryRows('SELECT * FROM withdrawals ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customer_reviews ORDER BY created_at DESC'),
    queryRows("SELECT id, name, artist_name, email FROM users WHERE role = 'artist' ORDER BY name")
  ]).then(([beats, merchandise, sales, requests, bookings, rawOrders, withdrawals, reviews, artists]) => {
    const orders = rawOrders.map(order => {
      let items = [];
      try { items = JSON.parse(order.items_json).map(item => ({ ...item, type: item.type || 'beat' })); } catch {}
      return { ...order, items };
    });
    const paidOrders = orders.filter(order => order.status === 'paid');
    const purchases = paidOrders.flatMap(order => order.items.filter(item => item.type === 'beat').map(item => ({
      order_reference: order.reference,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      beat_title: item.name,
      license: item.license,
      amount: item.priceUsd,
      purchased_at: order.created_at
    })));
    const merchandiseOrders = orders.flatMap(order => order.items.filter(item => item.type === 'merchandise').map(item => ({
      order_reference: order.reference,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      product_name: item.name,
      amount: item.priceGhs,
      status: order.status,
      created_at: order.created_at
    })));
    const artistsWithPurchases = artists.map(artist => ({
      ...artist,
      purchases: purchases.filter(purchase => purchase.customer_email.toLowerCase() === artist.email.toLowerCase())
    }));
    const monthlySales = paidOrders.reduce((months, order) => {
      const orderDate = new Date(order.created_at);
      const month = Number.isNaN(orderDate.getTime()) ? 'Unknown' : orderDate.toISOString().slice(0, 7);
      months[month] = (months[month] || 0) + Number(order.amount || 0);
      return months;
    }, {});
    const analytics = {
      revenue: paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      paidOrders: paidOrders.length,
      pendingOrders: orders.filter(order => order.status !== 'paid').length,
      beatLicenses: purchases.length,
      merchandiseOrders: merchandiseOrders.length,
      pendingReviews: reviews.filter(review => review.status === 'pending').length,
      withdrawals: withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0),
      monthlySales: Object.entries(monthlySales).sort(([left], [right]) => left.localeCompare(right)).slice(-6).map(([month, amount]) => ({ month, amount }))
    };
    response.json({ beats, merchandise, sales, requests, bookings, orders, merchandiseOrders, reviews, artists: artistsWithPurchases, withdrawals, analytics });
  }).catch(() => response.status(500).json({ error: 'Could not load admin data.' }));
});

app.post('/api/admin/beats', requireAdmin, (request, response) => {
  const { title, bpm, musicalKey, genre, mood, prices, files } = request.body;
  if (!title || !files?.preview || !files?.mp3 || !files?.wav || !files?.stems) return response.status(400).json({ error: 'Title and all preview, MP3, WAV, and stems files are required.' });
  try {
    const savedFiles = {
      cover_art: saveUpload(files.cover, 'cover'),
      preview_file: saveUpload(files.preview, 'preview'),
      mp3_file: saveUpload(files.mp3, 'mp3'),
      wav_file: saveUpload(files.wav, 'wav'),
      stems_file: saveUpload(files.stems, 'stems')
    };
    database.run(`INSERT INTO beats (title, bpm, musical_key, genre, mood, cover_art, preview_file, mp3_file, wav_file, stems_file, basic_price, premium_price, unlimited_price, exclusive_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [title.trim(), bpm || null, musicalKey || null, genre || null, mood || null, savedFiles.cover_art, savedFiles.preview_file, savedFiles.mp3_file, savedFiles.wav_file, savedFiles.stems_file, prices?.basic || 0, prices?.premium || 0, prices?.unlimited || 0, prices?.exclusive || 0], function (error) {
      if (error) return response.status(500).json({ error: 'Could not save beat.' });
      response.status(201).json({ id: this.lastID, title: title.trim() });
    });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/merchandise', requireAdmin, (request, response) => {
  const { title, description, price, photo } = request.body;
  if (!title || !price) return response.status(400).json({ error: 'Title and price are required.' });
  try {
    const photoFile = saveUpload(photo, 'merchandise');
    database.run('INSERT INTO merchandise (title, description, price, photo) VALUES (?, ?, ?, ?)', [title.trim(), description || '', Number(price), photoFile], function (error) {
      if (error) return response.status(500).json({ error: 'Could not save merchandise.' });
      response.status(201).json({ id: this.lastID, title: title.trim() });
    });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/withdraw', requireAdmin, (request, response) => {
  if (!process.env.ADMIN_WITHDRAWAL_PASSWORD || String(request.body.password || '') !== process.env.ADMIN_WITHDRAWAL_PASSWORD) return response.status(401).json({ error: 'Withdrawal password is incorrect.' });
  const amount = Number(request.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return response.status(400).json({ error: 'Enter a valid withdrawal amount.' });
  database.run('INSERT INTO withdrawals (amount) VALUES (?)', [amount], function (error) {
    if (error) return response.status(500).json({ error: 'Could not record withdrawal.' });
    response.status(201).json({ id: this.lastID, amount });
  });
});

app.patch('/api/admin/reviews/:id/status', requireAdmin, (request, response) => {
  const status = String(request.body.status || '');
  if (!['approved', 'rejected'].includes(status)) return response.status(400).json({ error: 'Choose approved or rejected.' });
  database.run('UPDATE customer_reviews SET status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: 'Could not update review status.' });
    if (!this.lastID && !this.changes) return response.status(404).json({ error: 'Review not found.' });
    response.json({ status });
  });
});

app.get('/api/requests/beat-license-prices', (request, response) => {
  const prices = getBeatRequestLicensePrices();
  if (Object.values(prices).some(price => !Number.isFinite(price) || price <= 0)) return response.status(503).json({ error: 'Beat license prices are not configured correctly.' });
  response.json({ prices });
});

app.post('/api/requests', (request, response) => {
  const { requestType = 'merchandise', name, email, productName, details, sampleAudio, sampleUrl, license } = request.body;
  if (!name || !email || !details) return response.status(400).json({ error: 'Name, email, and request details are required.' });
  const normalizedRequestType = requestType === 'beat' ? 'beat' : 'merchandise';
  const requestedLicense = normalizedRequestType === 'beat' ? String(license || '').toLowerCase() : null;
  const licensePrice = requestedLicense ? getBeatRequestLicensePrices()[requestedLicense] : null;
  if (normalizedRequestType === 'beat' && !beatRequestLicenseLabels[requestedLicense]) return response.status(400).json({ error: 'Choose a beat license.' });
  if (normalizedRequestType === 'beat' && (!Number.isFinite(licensePrice) || licensePrice <= 0)) return response.status(503).json({ error: 'The selected beat license price is not configured.' });
  let sampleAudioFile = null;
  let sampleLink = null;
  try {
    if (normalizedRequestType === 'beat' && String(sampleUrl || '').trim()) {
      if (String(sampleUrl).length > 2048) return response.status(400).json({ error: 'The sample link must be 2,048 characters or shorter.' });
      const parsedLink = new URL(String(sampleUrl).trim());
      if (!['http:', 'https:'].includes(parsedLink.protocol)) return response.status(400).json({ error: 'Enter a valid YouTube or song link.' });
      sampleLink = parsedLink.toString();
    }
    if (normalizedRequestType === 'beat' && sampleAudio) {
      const match = String(sampleAudio.data || '').match(/^data:([^;]+);base64,(.+)$/i);
      const extension = path.extname(String(sampleAudio.name || '')).toLowerCase();
      const allowedExtensions = new Set(['.mp3', '.m4a', '.mp4', '.wav', '.ogg']);
      const allowedAudioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'video/mp4', 'application/octet-stream']);
      if (!match || !allowedExtensions.has(extension) || !allowedAudioTypes.has(match[1].toLowerCase())) return response.status(400).json({ error: 'Upload an MP3, M4A, MP4, WAV, or OGG audio file.' });
      if (Buffer.from(match[2], 'base64').length > 15 * 1024 * 1024) return response.status(400).json({ error: 'Audio files must be 15 MB or smaller.' });
      sampleAudioFile = saveUpload(sampleAudio, 'sample-audio');
    }
  } catch (error) {
    return response.status(400).json({ error: error.message || 'Could not save audio file.' });
  }
  database.run('INSERT INTO customization_requests (request_type, customer_name, customer_email, product_name, details, sample_audio_file, sample_link, requested_license, license_price_gsh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [normalizedRequestType, name.trim(), email.trim().toLowerCase(), productName || null, details.trim(), sampleAudioFile, sampleLink, requestedLicense, licensePrice], function (error) {
    if (error && sampleAudioFile) fs.unlinkSync(path.join(uploadDirectory, sampleAudioFile));
    if (error) return response.status(500).json({ error: 'Could not save request.' });
    response.status(201).json({ id: this.lastID });
  });
});

app.get('/api/bookings/fees', (request, response) => {
  const fees = getBookingFees();
  if (Object.values(fees).some(fee => !Number.isFinite(fee) || fee <= 0)) return response.status(503).json({ error: 'Booking fees are not configured correctly.' });
  response.json({ fees });
});

app.post('/api/bookings', (request, response) => {
  response.status(402).json({ error: 'Payment is required before a booking can be submitted.' });
});

app.post('/api/bookings/initialize-payment', async (request, response) => {
  const { name, email, phone, service, artistCount, songCount, slots, details, paymentMethod } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedArtistCount = Number(artistCount);
  const normalizedSongCount = Number(songCount);
  const fees = getBookingFees();
  const needsSongCount = service === 'ep-album';
  if (needsSongCount && (!Number.isInteger(normalizedSongCount) || normalizedSongCount < 1 || normalizedSongCount > 12)) return response.status(400).json({ error: 'Choose between 1 and 12 songs for EP / Album.' });
  const feeGhs = calculateBookingFee(service, normalizedSongCount, fees);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !bookingServiceLabels[service] || !Number.isFinite(feeGhs) || feeGhs <= 0 || !Number.isInteger(normalizedArtistCount) || normalizedArtistCount < 1 || normalizedArtistCount > 10) {
    return response.status(400).json({ error: 'Enter account details, choose a priced service, and select a valid artist count.' });
  }
  const expectedSlotCount = needsSongCount ? Math.ceil(normalizedSongCount / 2) : 1;
  if (!areAvailableBookingSlots(slots, expectedSlotCount)) return response.status(400).json({ error: 'Choose a valid, non-overlapping Tuesday, Wednesday, Thursday, or Sunday slot for each 2h20 session. Slots must end by 9:00 PM.' });
  if (!['card', 'mobile_money'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose Card or Mobile Money to continue.' });
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payments are not configured yet.' });

  try {
    const reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const bookingItem = {
      type: 'booking',
      name: `${bookingServiceLabels[service]}${needsSongCount ? ` (${normalizedSongCount} songs)` : ''}`,
      service,
      songCount: needsSongCount ? normalizedSongCount : null,
      feeGhs,
      booking: {
        name: String(name).trim(),
        email: normalizedEmail,
        phone: String(phone || '').trim(),
        artistCount: normalizedArtistCount,
        songCount: needsSongCount ? normalizedSongCount : null,
        sessionSlots: slots.map(slot => ({ date: slot.date, time: slot.time })),
        details: String(details || '').trim()
      }
    };
    await new Promise((resolve, reject) => database.run('INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json) VALUES (?, ?, ?, ?, ?, ?)', [reference, bookingItem.booking.name, normalizedEmail, feeGhs, 'GHS', JSON.stringify([bookingItem])], error => error ? reject(error) : resolve()));

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, amount: Math.round(feeGhs * 100), currency: 'GHS', reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() })
    });
    const payment = await paystackResponse.json();
    if (!paystackResponse.ok || !payment.status) throw new Error(payment.message || 'Could not start payment.');
    response.json({ authorizationUrl: payment.data.authorization_url, reference, amount: feeGhs, currency: 'GHS' });
  } catch (error) {
    response.status(400).json({ error: error.message || 'Could not start payment.' });
  }
});

app.post('/api/payments/initialize', async (request, response) => {
  const { name, email, items, paymentMethod } = request.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !Array.isArray(items) || !items.length) {
    return response.status(400).json({ error: 'Enter your name, a valid email, and at least one item.' });
  }
  if (!['card', 'mobile_money'].includes(paymentMethod)) {
    return response.status(400).json({ error: 'Choose Card or Mobile Money to continue.' });
  }
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payments are not configured yet.' });

  try {
    const validatedItems = await Promise.all(items.map(item => new Promise((resolve, reject) => {
      if (item.type === 'merchandise') {
        const productId = Number(item.productId);
        if (!Number.isInteger(productId) || productId < 1) return reject(new Error('Invalid merchandise selected.'));
        database.get('SELECT id, title, price FROM merchandise WHERE id = ?', [productId], (error, product) => {
          if (error) return reject(error);
          if (!product || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return reject(new Error(`Merchandise unavailable: ${item.name || 'Unknown item'}.`));
          resolve({ type: 'merchandise', productId: product.id, name: product.title, priceGhs: Number(product.price) });
        });
        return;
      }
      const license = String(item.license || '').toLowerCase();
      const prices = { basic: 'basic_price', premium: 'premium_price', unlimited: 'unlimited_price', exclusive: 'exclusive_price' };
      if (!prices[license]) return reject(new Error('Invalid license selected.'));
      database.get('SELECT id, title, cover_art, ' + prices[license] + ' AS price FROM beats WHERE lower(title) = lower(?)', [String(item.name || '')], (error, beat) => {
        if (error) return reject(error);
        if (!beat || !Number.isFinite(Number(beat.price)) || Number(beat.price) <= 0) return reject(new Error(`Beat unavailable: ${item.name || 'Unknown beat'}.`));
        resolve({ type: 'beat', productId: beat.id, name: beat.title, license, priceUsd: Number(beat.price) });
      });
    })));
    const amountGhs = validatedItems.reduce((total, item) => total + (item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate), 0);
    const reference = `UBB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await new Promise((resolve, reject) => database.run('INSERT INTO orders (reference, customer_name, customer_email, amount, currency, items_json) VALUES (?, ?, ?, ?, ?, ?)', [reference, String(name).trim(), normalizedEmail, amountGhs, 'GHS', JSON.stringify(validatedItems)], error => error ? reject(error) : resolve()));

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, amount: Math.round(amountGhs * 100), currency: 'GHS', reference, channels: [paymentMethod], callback_url: paymentCallbackUrl.toString() })
    });
    const payment = await paystackResponse.json();
    if (!paystackResponse.ok || !payment.status) throw new Error(payment.message || 'Could not start payment.');
    response.json({ authorizationUrl: payment.data.authorization_url, reference });
  } catch (error) {
    response.status(400).json({ error: error.message || 'Could not start payment.' });
  }
});

app.get('/api/payments/verify/:reference', async (request, response) => {
  if (!paystackSecretKey) return response.status(503).json({ error: 'Payments are not configured yet.' });
  try {
    const paymentResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(request.params.reference)}`, { headers: { Authorization: `Bearer ${paystackSecretKey}` } });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.data?.status !== 'success') return response.status(400).json({ error: 'Payment was not completed.' });
    database.get('SELECT * FROM orders WHERE reference = ?', [request.params.reference], (orderError, order) => {
      if (orderError || !order) return response.status(404).json({ error: 'Order not found.' });
      const items = JSON.parse(order.items_json);
      const bookingItem = items.find(item => item.type === 'booking');
      const respondWithSuccess = () => response.json({ status: 'success', reference: order.reference, booking: bookingItem ? { service: bookingItem.name, feeGhs: bookingItem.feeGhs } : null, downloads: getDownloadItems(order) });
      if (order.status === 'paid') return respondWithSuccess();
      if (Number(payment.data.amount) !== Math.round(order.amount * 100) || payment.data.currency !== order.currency) return response.status(400).json({ error: 'Payment amount could not be verified.' });
      const markOrderPaid = () => database.run('UPDATE orders SET status = ? WHERE reference = ?', ['paid', order.reference], updateError => {
        if (updateError) return response.status(500).json({ error: 'Could not update order.' });
        items.filter(item => item.type !== 'booking').forEach(item => database.run('INSERT INTO sales (sale_type, product_id, product_name, buyer_name, buyer_email, amount) VALUES (?, ?, ?, ?, ?, ?)', [item.type || 'beat', item.productId, item.type === 'merchandise' ? item.name : `${item.name} (${item.license})`, order.customer_name, order.customer_email, item.type === 'merchandise' ? item.priceGhs : item.priceUsd * usdToGhsRate]));
        respondWithSuccess();
      });
      if (!bookingItem) return markOrderPaid();
      const booking = bookingItem.booking;
      const serviceName = bookingServiceLabels[bookingItem.service] || bookingItem.service;
      const sessionSlots = booking.sessionSlots || (booking.preferredDate && booking.preferredTime ? [{ date: booking.preferredDate, time: booking.preferredTime }] : []);
      const firstSlot = sessionSlots[0];
      database.run('INSERT INTO bookings (name, email, phone, service, artist_count, song_count, booking_slots_json, preferred_date, preferred_time, details, payment_reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [booking.name, booking.email, booking.phone, serviceName, booking.artistCount, booking.songCount || null, JSON.stringify(sessionSlots), firstSlot?.date || null, firstSlot?.time || null, booking.details, order.reference, 'paid'], error => {
        if (error && error.code !== 'ER_DUP_ENTRY') return response.status(500).json({ error: 'Payment succeeded, but the booking could not be recorded. Contact support with your payment reference.' });
        markOrderPaid();
      });
    });
  } catch {
    response.status(502).json({ error: 'Could not verify payment.' });
  }
});

app.get('/api/orders/:reference/downloads/:productId', (request, response) => {
  database.get('SELECT * FROM orders WHERE reference = ? AND status = ?', [request.params.reference, 'paid'], (orderError, order) => {
    if (orderError || !order) return response.status(404).json({ error: 'Paid order not found.' });
    let items;
    try { items = JSON.parse(order.items_json); } catch { return response.status(500).json({ error: 'Order data is invalid.' }); }
    const item = items.find(candidate => String(candidate.productId) === String(request.params.productId));
    if (!item || item.license !== request.query.license || !['basic', 'premium', 'unlimited', 'exclusive'].includes(request.query.license)) return response.status(403).json({ error: 'Download is not available for this order.' });
    database.get('SELECT mp3_file, wav_file, stems_file FROM beats WHERE id = ?', [item.productId], (beatError, beat) => {
      if (beatError || !beat) return response.status(404).json({ error: 'Beat files not found.' });
      const formatFiles = { mp3: beat.mp3_file, wav: beat.wav_file, stems: beat.stems_file };
      const requestedFile = formatFiles[String(request.query.format || 'mp3').toLowerCase()];
      if (request.query.format === 'wav' && item.license === 'basic') return response.status(403).json({ error: 'WAV is not included in this license.' });
      if (request.query.format === 'stems' && !['unlimited', 'exclusive'].includes(item.license)) return response.status(403).json({ error: 'Stems are not included in this license.' });
      if (!requestedFile) return response.status(403).json({ error: 'This file is not included in your license.' });
      response.download(path.join(uploadDirectory, path.basename(requestedFile)), path.basename(requestedFile));
    });
  });
});

app.listen(port, () => {
  console.log(`UltBigBoy backend running at http://localhost:${port}`);
});
