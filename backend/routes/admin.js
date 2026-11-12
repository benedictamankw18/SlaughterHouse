const express = require('express');
const path = require('node:path');
const database = require('../database');
const config = require('../config');
const sessions = require('../session-store');
const { passwordMatches } = require('../services/security');
const { saveUpload, deleteUploads } = require('../services/uploads');
const { databaseError } = require('../services/error-messages');
const validators = require('../services/input-validation');
const { rateLimit } = require('../services/rate-limit');
const { recordAuditSafely } = require('../services/audit');
const { createNotificationSafely, notifyAdminsSafely } = require('../services/notifications');
const { queueEmailSafely } = require('../services/email/outbox');
const { isAvailableBookingSlot, areAvailableBookingSlots } = require('../services/booking');
const { getBookingSettings, validateBookingSettingUpdates } = require('../services/booking-settings');
const { fulfillPaidBooking } = require('../services/booking-fulfillment');
const { reserveBookingSlots } = require('../services/booking-reservations');
const { LICENSE_TYPES, loadLicenseRights, loadLicenseDefinitions, saveLicenseRights } = require('../services/license-rights');
const { FULFILLMENT_STATUSES, updateFulfillmentStatus } = require('../services/fulfillment');
const { BUSINESS_SETTINGS, REPORT_GRANULARITIES, validateDateRange, validateSettingUpdates, validateReportGranularity, buildReportPeriods } = require('../services/admin-controls');
const { isUsdGhsRateFresh } = require('../services/pricing');
const logger = require('../services/logger');
const monitoring = require('../services/monitoring');
const { checkReadiness } = require('../services/health');
const storage = require('../services/storage');
const { sendStoredFile } = require('../services/storage/response');
const { parseOrderItems } = require('../services/order-items');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many administrator requests. Try again shortly.' }));
const queryRows = (query, parameters = []) => new Promise((resolve, reject) => database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || [])));
const runQuery = (query, parameters = []) => new Promise((resolve, reject) => database.run(query, parameters, function (error) { error ? reject(error) : resolve(this); }));
const csvCell = value => {
  const raw = String(value ?? '');
  const safe = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(value) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
function streamReleaseInput(body = {}) {
  const titleError = validators.text(body.title, 'Release title', { required: true, max: 255 });
  const artistError = validators.text(body.artist, 'Artist', { required: true, max: 500 });
  const hasCoverUpload = body.coverImage !== undefined && body.coverImage !== null && body.coverImage !== '';
  if (hasCoverUpload && (typeof body.coverImage !== 'object' || typeof body.coverImage.name !== 'string' || typeof body.coverImage.data !== 'string')) {
    return { error: 'Choose a valid cover image file.' };
  }
  const coverError = validators.text(body.coverUrl, 'Cover URL', { required: !hasCoverUpload, max: 1000 });
  if (titleError || artistError || coverError) return { error: titleError || artistError || coverError };
  if (!Array.isArray(body.credits) || body.credits.length > 20 || body.credits.some(credit =>
    typeof credit !== 'string' || validators.text(credit, 'Credit', { required: true, max: 255 }))) {
    return { error: 'Credits must be a list of up to 20 non-empty lines, each no longer than 255 characters.' };
  }
  if (!Array.isArray(body.links) || body.links.length < 1 || body.links.length > 10) {
    return { error: 'Provide between 1 and 10 streaming links.' };
  }
  const links = [];
  for (const link of body.links) {
    const platformError = validators.text(link?.platform, 'Platform', { required: true, max: 50 });
    const labelError = validators.text(link?.label, 'Link label', { required: true, max: 255 });
    const urlError = validators.text(link?.url, 'Link URL', { required: true, max: 1000 });
    if (platformError || labelError || urlError) return { error: platformError || labelError || urlError };
    try {
      if (new URL(link.url).protocol !== 'https:') throw new Error('invalid protocol');
    } catch {
      return { error: 'Streaming link URLs must be valid HTTPS URLs.' };
    }
    links.push({ platform: link.platform.trim(), url: link.url.trim(), label: link.label.trim() });
  }
  const coverUrl = typeof body.coverUrl === 'string' ? body.coverUrl.trim() : '';
  if (!hasCoverUpload) {
    try {
      const parsedCover = new URL(coverUrl, 'https://slaughterhouse.invalid');
      if (parsedCover.protocol !== 'https:' || coverUrl.startsWith('//')) throw new Error('invalid cover URL');
      if (parsedCover.origin !== 'https://slaughterhouse.invalid' && !coverUrl.startsWith('https://')) throw new Error('invalid cover URL');
    } catch {
      return { error: 'Choose a cover image or provide an HTTPS URL or site-relative path.' };
    }
  }
  return {
    value: {
      title: body.title.trim(),
      artist: body.artist.trim(),
      credits: body.credits.map(credit => credit.trim()),
      coverUrl,
      links
    }
  };
}
const parseStreamReleaseJson = value => typeof value === 'string' ? JSON.parse(value) : value;

router.get('/admin/data', sessions.requireAdmin, (request, response) => {
  Promise.all([
    queryRows('SELECT * FROM beats ORDER BY created_at DESC'),
    queryRows('SELECT * FROM merchandise ORDER BY created_at DESC'),
    queryRows('SELECT * FROM sales ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customization_requests ORDER BY created_at DESC'),
    queryRows('SELECT * FROM bookings ORDER BY created_at DESC'),
    queryRows('SELECT * FROM orders ORDER BY created_at DESC'),
    queryRows('SELECT order_id, product_type, product_id, license_type, unit_amount, exchange_rate FROM order_items'),
    queryRows('SELECT * FROM withdrawals ORDER BY created_at DESC'),
    queryRows('SELECT * FROM customer_reviews ORDER BY created_at DESC'),
    queryRows('SELECT id, title, artist, credits_json, cover_url, links_json, sort_order, status FROM stream_releases ORDER BY sort_order, id'),
    queryRows("SELECT id, name, artist_name, email FROM users WHERE role = 'artist' ORDER BY name"),
    queryRows("SELECT id, name, artist_name, email, role, created_at, email_verified_at FROM users WHERE role NOT IN ('admin', 'super_admin') ORDER BY created_at DESC LIMIT 1000")
  ]).then(([beats, merchandise, sales, requests, bookings, rawOrders, rawOrderItems, withdrawals, reviews, streamReleases, artists, customers]) => {
    beats = beats.map(beat => ({ ...beat, cover_url: storage.publicUrl(beat.cover_art) }));
    merchandise = merchandise.map(item => ({ ...item, photo_url: storage.publicUrl(item.photo) }));
    streamReleases = streamReleases.map(release => ({
      ...release,
      credits: parseStreamReleaseJson(release.credits_json),
      links: parseStreamReleaseJson(release.links_json)
    }));
    const orderItemSnapshots = new Map(rawOrderItems.map(orderItem => [
      `${orderItem.order_id}:${orderItem.product_type}:${orderItem.product_id}:${orderItem.license_type || ''}`,
      orderItem
    ]));
    const orders = rawOrders.map(order => {
      let items = [];
      try {
        items = parseOrderItems(order.items_json).map(item => {
          const type = item.type || 'beat';
          const snapshot = orderItemSnapshots.get(`${order.id}:${type}:${item.productId}:${item.license || ''}`);
          return {
            ...item,
            type,
            priceGhs: item.priceGhs ?? (snapshot ? Number(snapshot.unit_amount) : null),
            exchangeRate: item.exchangeRate ?? (snapshot?.exchange_rate === null || snapshot?.exchange_rate === undefined ? null : Number(snapshot.exchange_rate))
          };
        });
      } catch {}
      return { ...order, items };
    });
    const paidOrders = orders.filter(order => ['paid', 'partially_refunded'].includes(order.status));
    const purchases = paidOrders.flatMap(order => order.items.filter(item => item.type === 'beat').map(item => ({
      order_reference: order.reference, customer_name: order.customer_name, customer_email: order.customer_email,
      beat_title: item.name, license: item.license, amount: item.priceGhs,
      exchange_rate: item.exchangeRate, purchased_at: order.created_at
    })));
    const merchandiseOrders = orders.flatMap(order => order.items.filter(item => item.type === 'merchandise').map(item => ({
      order_reference: order.reference, customer_name: order.customer_name, customer_email: order.customer_email,
      product_name: item.name, amount: item.priceGhs, status: order.status, created_at: order.created_at
    })));
    const artistsWithPurchases = artists.map(artist => ({
      ...artist,
      purchases: purchases.filter(purchase => purchase.customer_email.toLowerCase() === artist.email.toLowerCase())
    }));
    const monthlySales = paidOrders.reduce((months, order) => {
      const date = new Date(order.created_at);
      const month = Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString().slice(0, 7);
      months[month] = (months[month] || 0) + Number(order.amount || 0) - Number(order.refunded_amount || 0);
      return months;
    }, {});
    const analytics = {
      revenue: paidOrders.reduce((sum, order) => sum + Number(order.amount || 0) - Number(order.refunded_amount || 0), 0),
      paidOrders: paidOrders.length,
      pendingOrders: orders.filter(order => order.status === 'pending').length,
      beatLicenses: purchases.length,
      merchandiseOrders: merchandiseOrders.length,
      pendingReviews: reviews.filter(review => review.status === 'pending').length,
      withdrawals: withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0),
      monthlySales: Object.entries(monthlySales).sort(([left], [right]) => left.localeCompare(right)).slice(-6).map(([month, amount]) => ({ month, amount }))
    };
    response.json({ role: request.role, beats, merchandise, sales, requests, bookings, orders, merchandiseOrders, reviews, streamReleases, artists: artistsWithPurchases, customers, withdrawals, analytics });
  }).catch(error => response.status(500).json({ error: databaseError('Loading administrator data failed.', error) }));
});

router.get('/admin/metrics', sessions.requireAdmin, (request, response) => {
  response.json({ metrics: monitoring.snapshot() });
});

router.get('/admin/health/dependencies', sessions.requireAdmin, async (request, response) => {
  const readiness = await checkReadiness(database, config, storage);
  response.status(readiness.ready ? 200 : 503).json(readiness);
});

router.post('/admin/stream-releases', sessions.requireAdmin, async (request, response) => {
  const validation = streamReleaseInput(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });
  const release = validation.value;
  let coverFile = null;
  try {
    if (request.body.coverImage) {
      coverFile = await saveUpload(request.body.coverImage, 'cover', 'image');
      if (!coverFile) return response.status(400).json({ error: 'Choose a cover image or provide a cover URL.' });
      release.coverUrl = storage.publicUrl(coverFile);
    }
    const sortRows = await queryRows('SELECT COALESCE(MAX(sort_order), 0) + 1 AS "nextOrder" FROM stream_releases');
    const result = await runQuery(
      'INSERT INTO stream_releases (title, artist, credits_json, cover_url, links_json, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [release.title, release.artist, JSON.stringify(release.credits), release.coverUrl, JSON.stringify(release.links), sortRows[0].nextOrder, 'unpublished']
    );
    recordAuditSafely(database, { userId: request.admin.id, action: 'stream_release_created', entityType: 'stream_release', entityId: result.lastID, ipAddress: request.ip });
    response.status(201).json({ id: result.lastID, title: release.title, status: 'unpublished' });
  } catch (error) {
    await deleteUploads([coverFile]);
    if (request.body.coverImage && !coverFile) return response.status(400).json({ error: error.message });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'A stream release with this title already exists.' });
    response.status(500).json({ error: databaseError('Saving the stream release failed.', error) });
  }
});

router.patch('/admin/stream-releases/:id', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Stream release ID must be a positive whole number.' });
  const validation = streamReleaseInput(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });
  const release = validation.value;
  const id = Number(request.params.id);
  let coverFile = null;
  try {
    if (request.body.coverImage) {
      coverFile = await saveUpload(request.body.coverImage, 'cover', 'image');
      if (!coverFile) return response.status(400).json({ error: 'Choose a valid cover image file.' });
      release.coverUrl = storage.publicUrl(coverFile);
    }
    const existing = await queryRows('SELECT id FROM stream_releases WHERE id = ?', [id]);
    if (!existing.length) {
      await deleteUploads([coverFile]);
      return response.status(404).json({ error: `No stream release was found with ID ${id}.` });
    }
    await runQuery(
      'UPDATE stream_releases SET title = ?, artist = ?, credits_json = ?, cover_url = ?, links_json = ? WHERE id = ?',
      [release.title, release.artist, JSON.stringify(release.credits), release.coverUrl, JSON.stringify(release.links), id]
    );
    recordAuditSafely(database, { userId: request.admin.id, action: 'stream_release_updated', entityType: 'stream_release', entityId: id, ipAddress: request.ip });
    response.json({ id, title: release.title });
  } catch (error) {
    await deleteUploads([coverFile]);
    if (request.body.coverImage && !coverFile) return response.status(400).json({ error: error.message });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'A stream release with this title already exists.' });
    response.status(500).json({ error: databaseError('Updating the stream release failed.', error) });
  }
});

router.patch('/admin/stream-releases/:id/status', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Stream release ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  if (!['published', 'unpublished'].includes(status)) return response.status(400).json({ error: 'Stream release status must be published or unpublished.' });
  const id = Number(request.params.id);
  try {
    const existing = await queryRows('SELECT id FROM stream_releases WHERE id = ?', [id]);
    if (!existing.length) return response.status(404).json({ error: `No stream release was found with ID ${id}.` });
    await runQuery('UPDATE stream_releases SET status = ? WHERE id = ?', [status, id]);
    recordAuditSafely(database, { userId: request.admin.id, action: 'stream_release_status_changed', entityType: 'stream_release', entityId: id, details: { status }, ipAddress: request.ip });
    response.json({ id, status });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the stream release status failed.', error) });
  }
});

router.delete('/admin/stream-releases/:id', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Stream release ID must be a positive whole number.' });
  const id = Number(request.params.id);
  try {
    const result = await runQuery('DELETE FROM stream_releases WHERE id = ?', [id]);
    if (!result.changes) return response.status(404).json({ error: `No stream release was found with ID ${id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'stream_release_deleted', entityType: 'stream_release', entityId: id, ipAddress: request.ip });
    response.json({ id, deleted: true });
  } catch (error) {
    response.status(500).json({ error: databaseError('Deleting the stream release failed.', error) });
  }
});

// Customer-uploaded sample audio is private: only authenticated administrators may stream it.
router.get('/admin/uploads/:filename', sessions.requireAdmin, async (request, response) => {
  const filename = request.params.filename;
  if (path.basename(filename) !== filename || !/^sample-audio-/i.test(filename)) return response.sendStatus(404);
  try {
    await sendStoredFile(response, filename, {
      headers: { 'Cache-Control': 'private, no-store' },
      range: request.headers.range
    });
  } catch {
    if (!response.headersSent) response.sendStatus(500);
  }
});

router.get('/admin/settings', sessions.requireAdmin, async (request, response) => {
  try {
    const keys = Object.keys(BUSINESS_SETTINGS);
    const rows = await queryRows(
      `SELECT setting_key, setting_value, updated_at FROM settings WHERE setting_key IN (${keys.map(() => '?').join(', ')})`,
      keys
    );
    const values = Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
    response.json({
      settings: keys.map(key => {
        const row = rows.find(candidate => candidate.setting_key === key);
        return {
          key,
          label: BUSINESS_SETTINGS[key],
          value: row?.setting_value ?? '',
          updatedAt: row?.updated_at ?? null,
          fresh: key === 'usd_to_ghs_rate' && row ? isUsdGhsRateFresh(row.updated_at) : false
        };
      }),
      canEdit: request.role === 'super_admin'
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading business settings failed.', error) });
  }
});

router.put('/admin/settings', sessions.requirePermission('admin:manage_settings'), async (request, response) => {
  const validation = validateSettingUpdates(request.body?.settings);
  if (validation.error) return response.status(400).json({ error: validation.error });
  try {
    await database.transaction(async tx => {
      for (const [key, value] of validation.value) {
        await tx.run(
          'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP',
          [key, value]
        );
      }
    });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'business_settings_updated',
      entityType: 'settings',
      details: Object.fromEntries(validation.value),
      ipAddress: request.ip
    });
    response.json({ settings: validation.value.map(([key, value]) => ({ key, value })) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating business settings failed.', error) });
  }
});

router.get('/admin/bookings/settings', sessions.requireAdmin, async (request, response) => {
  try {
    const settings = await getBookingSettings(database);
    response.json({
      settings: {
        availableWeekdays: settings.availableWeekdays,
        openTime: settings.openTime,
        closeTime: settings.closeTime,
        slotStepMinutes: settings.slotStepMinutes,
        sameDayLeadMinutes: settings.sameDayLeadMinutes,
        availableFrom: settings.availableFrom,
        availableUntil: settings.availableUntil,
        sessionMinutes: settings.sessionMinutes
      },
      canEdit: request.role === 'super_admin'
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading booking availability settings failed.', error) });
  }
});

router.put('/admin/bookings/settings', sessions.requirePermission('admin:manage_settings'), async (request, response) => {
  const updates = request.body?.settings;
  const supplied = validateBookingSettingUpdates(updates);
  if (supplied.error) return response.status(400).json({ error: supplied.error });
  try {
    const current = await getBookingSettings(database);
    const validation = validateBookingSettingUpdates({
      availableWeekdays: current.availableWeekdays,
      openTime: current.openTime,
      closeTime: current.closeTime,
      slotStepMinutes: current.slotStepMinutes,
      sameDayLeadMinutes: current.sameDayLeadMinutes,
      availableFrom: current.availableFrom,
      availableUntil: current.availableUntil,
      ...updates
    });
    if (validation.error) return response.status(400).json({ error: validation.error });
    await database.transaction(async tx => {
      for (const [key, value] of validation.value) {
        await tx.run(
          'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP',
          [key, value]
        );
      }
    });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'booking_settings_updated',
      entityType: 'settings',
      details: Object.fromEntries(validation.value),
      ipAddress: request.ip
    });
    const settings = await getBookingSettings(database);
    response.json({
      settings: {
        availableWeekdays: settings.availableWeekdays,
        openTime: settings.openTime,
        closeTime: settings.closeTime,
        slotStepMinutes: settings.slotStepMinutes,
        sameDayLeadMinutes: settings.sameDayLeadMinutes,
        availableFrom: settings.availableFrom,
        availableUntil: settings.availableUntil,
        sessionMinutes: settings.sessionMinutes
      }
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating booking availability settings failed.', error) });
  }
});

router.get('/admin/staff', sessions.requirePermission('admin:manage_roles'), async (request, response) => {
  try {
    const staff = await queryRows(
      `SELECT id, name, email, role, created_at
       FROM users
       ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name
       LIMIT 1000`
    );
    response.json({ staff });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading staff accounts failed.', error) });
  }
});

router.patch('/admin/staff/:id/role', sessions.requirePermission('admin:manage_roles'), async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Staff ID must be a positive whole number.' });
  const userId = Number(request.params.id);
  const role = String(request.body?.role || '').trim().toLowerCase();
  if (!['customer', 'artist', 'non_artist', 'admin', 'super_admin'].includes(role)) return response.status(400).json({ error: 'Role must be customer, artist, non_artist, admin, or super_admin.' });
  if (userId === Number(request.admin.id)) return response.status(400).json({ error: 'You cannot change your own role.' });
  try {
    const result = await database.transaction(async tx => {
      const superAdmins = await tx.all("SELECT id FROM users WHERE role = 'super_admin' FOR UPDATE");
      const target = await tx.get('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!target) return { notFound: true };
      if (target.role === 'super_admin' && role !== 'super_admin' && superAdmins.length <= 1) return { lastSuperAdmin: true };
      if (target.role === role) return { unchanged: true, previousRole: target.role };
      await tx.run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
      await tx.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
      return { previousRole: target.role };
    });
    if (result.notFound) return response.status(404).json({ error: 'User was not found.' });
    if (result.lastSuperAdmin) return response.status(409).json({ error: 'The last super-admin cannot be demoted.' });
    if (!result.unchanged) recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'user_role_changed',
      entityType: 'user',
      entityId: userId,
      details: { previousRole: result.previousRole, role },
      ipAddress: request.ip
    });
    response.json({ id: userId, role, changed: !result.unchanged });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the user role failed.', error) });
  }
});

router.get('/admin/license-rights', sessions.requireAdmin, async (request, response) => {
  try {
    response.json({ licenseRights: await loadLicenseRights(database) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading license definitions failed.', error) });
  }
});

router.get('/admin/license-definitions', sessions.requireAdmin, async (request, response) => {
  try {
    response.json({ definitions: await loadLicenseDefinitions(database) });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading license definitions failed.', error) });
  }
});

router.post('/admin/license-definitions', sessions.requirePermission('admin:manage_license_rights'), async (request, response) => {
  const type = String(request.body.type || '').toLowerCase();
  if (!LICENSE_TYPES.has(type)) return response.status(400).json({ error: `License type must be one of: ${[...LICENSE_TYPES].join(', ')}.` });
  try {
    await runQuery('UPDATE license_definition_status SET is_active = TRUE WHERE license_type = ?', [type]);
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'license_definition_activated',
      entityType: 'license_definition',
      details: { licenseType: type },
      ipAddress: request.ip
    });
    response.json({ licenseType: type, active: true });
  } catch (error) {
    response.status(500).json({ error: databaseError('Activating the license definition failed.', error) });
  }
});

router.put('/admin/license-rights/:type', sessions.requirePermission('admin:manage_license_rights'), async (request, response) => {
  try {
    const result = await saveLicenseRights(database, request.params.type, request.body);
    if (result.error) return response.status(400).json({ error: result.error });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'license_rights_updated',
      entityType: 'license_rights',
      details: { licenseType: request.params.type.toLowerCase(), rights: result.value },
      ipAddress: request.ip
    });
    response.json({ licenseType: request.params.type.toLowerCase(), rights: result.value });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the license definition failed.', error) });
  }
});

router.patch('/admin/license-definitions/:type/status', sessions.requirePermission('admin:manage_license_rights'), async (request, response) => {
  const type = String(request.params.type || '').toLowerCase();
  if (!LICENSE_TYPES.has(type)) return response.status(400).json({ error: 'Unknown license definition.' });
  if (typeof request.body.active !== 'boolean') return response.status(400).json({ error: 'License active status must be true or false.' });
  try {
    await runQuery('UPDATE license_definition_status SET is_active = ? WHERE license_type = ?', [request.body.active, type]);
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: request.body.active ? 'license_definition_activated' : 'license_definition_deactivated',
      entityType: 'license_definition',
      details: { licenseType: type },
      ipAddress: request.ip
    });
    response.json({ licenseType: type, active: request.body.active });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the license definition status failed.', error) });
  }
});

router.delete('/admin/license-definitions/:type', sessions.requirePermission('admin:manage_license_rights'), async (request, response) => {
  const type = String(request.params.type || '').toLowerCase();
  if (!LICENSE_TYPES.has(type)) return response.status(400).json({ error: 'Unknown license definition.' });
  try {
    await database.transaction(async tx => {
      await tx.run('DELETE FROM license_rights WHERE license_type = ?', [type]);
      await tx.run('UPDATE license_definition_status SET is_active = FALSE WHERE license_type = ?', [type]);
    });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'license_definition_deleted',
      entityType: 'license_definition',
      details: { licenseType: type },
      ipAddress: request.ip
    });
    response.json({ licenseType: type, deleted: true });
  } catch (error) {
    response.status(500).json({ error: databaseError('Deleting the license definition failed.', error) });
  }
});

router.get('/admin/notifications', sessions.requireAdmin, async (request, response) => {
  try {
    const notifications = await queryRows(
      `SELECT id, type, title, message, read_at, read_at IS NOT NULL AS is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [request.admin.id]
    );
    response.json({
      notifications,
      unreadCount: notifications.filter(notification => !notification.read_at).length
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading administrator notifications failed.', error) });
  }
});

router.patch('/admin/notifications/:id/:state', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Notification ID must be a positive whole number.' });
  if (!['read', 'unread'].includes(request.params.state)) return response.status(400).json({ error: 'Notification state must be read or unread.' });
  try {
    const readAt = request.params.state === 'read' ? 'CURRENT_TIMESTAMP' : 'NULL';
    const result = await new Promise((resolve, reject) => database.run(
      `UPDATE notifications SET read_at = ${readAt} WHERE id = ? AND user_id = ?`,
      [Number(request.params.id), request.admin.id],
      function (error) { if (error) reject(error); else resolve(this); }
    ));
    if (!result.changes) {
      const notification = await new Promise((resolve, reject) => database.get(
        'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
        [Number(request.params.id), request.admin.id],
        (error, row) => error ? reject(error) : resolve(row)
      ));
      if (!notification) return response.status(404).json({ error: 'Notification was not found.' });
    }
    response.json({ id: Number(request.params.id), read: request.params.state === 'read' });
  } catch (error) {
    response.status(500).json({ error: databaseError('Updating the administrator notification failed.', error) });
  }
});

router.get('/admin/email-deliveries', sessions.requireAdmin, async (request, response) => {
  const status = String(request.query.status || '').trim().toLowerCase();
  const validStatuses = ['pending', 'processing', 'sent', 'failed'];
  if (status && !validStatuses.includes(status)) return response.status(400).json({ error: `Email status must be one of: ${validStatuses.join(', ')}.` });
  try {
    const [deliveries, counts] = await Promise.all([
      queryRows(
        `SELECT id, recipient, template, status, attempts, next_attempt_at, sent_at, last_error, created_at
         FROM email_outbox ${status ? 'WHERE status = ?' : ''}
         ORDER BY created_at DESC LIMIT 100`,
        status ? [status] : []
      ),
      queryRows('SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status')
    ]);
    response.json({
      deliveries,
      counts: Object.fromEntries(counts.map(row => [row.status, Number(row.count)]))
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading email delivery status failed.', error) });
  }
});

router.get('/admin/audit-logs', sessions.requireAdmin, (request, response) => {
  const action = String(request.query.action || '').trim();
  const search = String(request.query.search || '').trim();
  const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit, 10) || 50));
  const dateRange = validateDateRange(String(request.query.from || ''), String(request.query.to || ''));
  if (dateRange.error) return response.status(400).json({ error: dateRange.error });
  if (search.length > 100) return response.status(400).json({ error: 'Audit search must be 100 characters or fewer.' });
  const parameters = [];
  const conditions = [];
  if (action) {
    if (!/^[a-z0-9_]{1,100}$/i.test(action)) return response.status(400).json({ error: 'Audit action filter is invalid.' });
    conditions.push('a.action = ?');
    parameters.push(action);
  }
  if (search) {
    conditions.push('(a.action LIKE ? OR a.entity_type LIKE ? OR a.details_json LIKE ? OR u.email LIKE ?)');
    parameters.push(...Array(4).fill(`%${search}%`));
  }
  if (dateRange.value.from) {
    conditions.push('a.created_at >= ?');
    parameters.push(`${dateRange.value.from} 00:00:00`);
  }
  if (dateRange.value.to) {
    conditions.push("a.created_at < ?::timestamp + INTERVAL '1 day'");
    parameters.push(`${dateRange.value.to} 00:00:00`);
  }
  parameters.push(limit);
  queryRows(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details_json, a.ip_address,
            a.created_at, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC LIMIT ?`,
    parameters
  ).then(logs => response.json({ logs }))
    .catch(error => response.status(500).json({ error: databaseError('Loading audit logs failed.', error) }));
});

router.get('/admin/reports', sessions.requireAdmin, async (request, response) => {
  const granularity = validateReportGranularity(request.query.granularity);
  if (granularity.error) return response.status(400).json({ error: granularity.error });
  const granularityConfig = REPORT_GRANULARITIES[granularity.value];
  const dateRange = validateDateRange(
    String(request.query.from || ''),
    String(request.query.to || ''),
    granularityConfig.maxRangeDays
  );
  if (dateRange.error) return response.status(400).json({ error: dateRange.error });
  const conditions = [];
  const parameters = [];
  if (dateRange.value.from) {
    conditions.push('created_at >= ?');
    parameters.push(`${dateRange.value.from} 00:00:00`);
  }
  if (dateRange.value.to) {
    conditions.push("created_at < ?::timestamp + INTERVAL '1 day'");
    parameters.push(`${dateRange.value.to} 00:00:00`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderWhere = `WHERE ${[...conditions, "status IN ('paid', 'partially_refunded')"].join(' AND ')}`;
  const { sqlUnit, format } = granularityConfig;
  try {
    const [orders, revenueRows, withdrawalRows, bookings, summaryRows, withdrawalSummaryRows, firstRows] = await Promise.all([
      queryRows(
        `SELECT reference, customer_name, customer_email, status, amount, currency, refunded_amount, created_at
         FROM orders ${where} ORDER BY created_at DESC LIMIT 5000`,
        parameters
      ),
      queryRows(
        `SELECT TO_CHAR(DATE_TRUNC('${sqlUnit}', created_at), '${format}') AS period,
                COUNT(*) AS order_count,
                SUM(amount - COALESCE(refunded_amount, 0)) AS revenue
         FROM orders ${orderWhere}
         GROUP BY 1 ORDER BY 1`,
        parameters
      ),
      queryRows(
        `SELECT TO_CHAR(DATE_TRUNC('${sqlUnit}', created_at), '${format}') AS period,
                SUM(amount) AS withdrawals
         FROM withdrawals ${where}
         GROUP BY 1 ORDER BY 1`,
        parameters
      ),
      queryRows(
        `SELECT status, COUNT(*) AS count FROM bookings ${where} GROUP BY status ORDER BY status`,
        parameters
      ),
      queryRows(
        `SELECT COUNT(*) AS order_count,
                COUNT(*) FILTER (WHERE status IN ('paid', 'partially_refunded')) AS paid_order_count,
                SUM(CASE WHEN status IN ('paid', 'partially_refunded') THEN amount - COALESCE(refunded_amount, 0) ELSE 0 END) AS net_revenue
         FROM orders ${where}`,
        parameters
      ),
      queryRows(
        `SELECT COUNT(*) AS withdrawal_count, COALESCE(SUM(amount), 0) AS withdrawals
         FROM withdrawals ${where}`,
        parameters
      ),
      queryRows(
        `SELECT LEAST(
           COALESCE((SELECT MIN(created_at) FROM orders), CURRENT_TIMESTAMP),
           COALESCE((SELECT MIN(created_at) FROM withdrawals), CURRENT_TIMESTAMP)
         ) AS first_at`
      )
    ]);
    const to = dateRange.value.to || new Date().toISOString().slice(0, 10);
    const firstAt = firstRows[0]?.first_at;
    const earliest = firstAt && !Number.isNaN(new Date(firstAt).getTime())
      ? new Date(firstAt).toISOString().slice(0, 10)
      : to;
    const periods = buildReportPeriods(dateRange.value.from || earliest, to, granularity.value);
    const revenueByPeriodMap = new Map(revenueRows.map(row => [row.period, row]));
    const withdrawalsByPeriodMap = new Map(withdrawalRows.map(row => [row.period, row]));
    const netRevenue = Number(summaryRows[0]?.net_revenue || 0);
    const withdrawals = Number(withdrawalSummaryRows[0]?.withdrawals || 0);
    response.json({
      from: dateRange.value.from,
      to: dateRange.value.to,
      granularity: granularity.value,
      orders,
      revenueByPeriod: periods.map(period => {
        const row = revenueByPeriodMap.get(period);
        return { period, orderCount: Number(row?.order_count || 0), revenue: Number(row?.revenue || 0) };
      }),
      withdrawalsByPeriod: periods.map(period => ({
        period,
        withdrawals: Number(withdrawalsByPeriodMap.get(period)?.withdrawals || 0)
      })),
      bookingCounts: bookings.map(row => ({ status: row.status, count: Number(row.count) })),
      summary: {
        orderCount: Number(summaryRows[0]?.order_count || 0),
        paidOrderCount: Number(summaryRows[0]?.paid_order_count || 0),
        netRevenue,
        withdrawals,
        withdrawalCount: Number(withdrawalSummaryRows[0]?.withdrawal_count || 0),
        netAfterWithdrawals: netRevenue - withdrawals
      }
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Loading date-filtered reports failed.', error) });
  }
});

router.get('/admin/reports.csv', sessions.requireAdmin, async (request, response) => {
  const dateRange = validateDateRange(String(request.query.from || ''), String(request.query.to || ''));
  if (dateRange.error) return response.status(400).json({ error: dateRange.error });
  const conditions = [];
  const parameters = [];
  if (dateRange.value.from) {
    conditions.push('created_at >= ?');
    parameters.push(`${dateRange.value.from} 00:00:00`);
  }
  if (dateRange.value.to) {
    conditions.push("created_at < ?::timestamp + INTERVAL '1 day'");
    parameters.push(`${dateRange.value.to} 00:00:00`);
  }
  try {
    const orders = await queryRows(
      `SELECT reference, customer_name, customer_email, status, amount, currency, refunded_amount, created_at
       FROM orders ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT 5000`,
      parameters
    );
    const rows = [
      ['Reference', 'Customer', 'Email', 'Status', 'Amount', 'Refunded amount', 'Currency', 'Created at'],
      ...orders.map(order => [order.reference, order.customer_name, order.customer_email, order.status, order.amount, order.refunded_amount, order.currency, order.created_at])
    ];
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="ultbigboy-report.csv"');
    response.send(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`);
  } catch (error) {
    response.status(500).json({ error: databaseError('Exporting the date-filtered report failed.', error) });
  }
});

router.get('/admin/orders.csv', sessions.requireAdmin, (request, response) => {
  queryRows(
    `SELECT reference, customer_name, customer_email, status, amount, currency, created_at
     FROM orders ORDER BY created_at DESC LIMIT 5000`
  ).then(orders => {
    const rows = [
      ['Reference', 'Customer', 'Email', 'Status', 'Amount', 'Currency', 'Created at'],
      ...orders.map(order => [order.reference, order.customer_name, order.customer_email, order.status, order.amount, order.currency, order.created_at])
    ];
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="ultbigboy-orders.csv"');
    response.send(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`);
  }).catch(error => response.status(500).json({ error: databaseError('Exporting orders failed.', error) }));
});

router.patch('/admin/orders/:reference/fulfillment', sessions.requireAdmin, (request, response) => {
  const status = String(request.body?.status || '').trim().toLowerCase();
  if (!FULFILLMENT_STATUSES.includes(status)) return response.status(400).json({ error: `Fulfillment status must be one of: ${FULFILLMENT_STATUSES.join(', ')}.` });
  database.get('SELECT id, reference, items_json FROM orders WHERE reference = ?', [request.params.reference], async (error, order) => {
    if (error) return response.status(500).json({ error: databaseError('Loading the order failed.', error) });
    if (!order) return response.status(404).json({ error: `No order was found with reference ${request.params.reference}.` });
    const items = parseOrderItems(order.items_json);
    if (!items) return response.status(500).json({ error: 'Order data is invalid.' });
    if (!items.some(item => item.type === 'merchandise')) return response.status(400).json({ error: 'Fulfillment tracking only applies to orders that contain merchandise.' });
    try {
      const result = await database.transaction(tx => updateFulfillmentStatus(tx, {
        orderId: order.id,
        status,
        adminId: request.admin.id
      }));
      if (result.notFound) return response.status(404).json({ error: `No order was found with reference ${request.params.reference}.` });
      if (result.changed) recordAuditSafely(database, {
        userId: request.admin.id,
        action: 'order_fulfillment_updated',
        entityType: 'order',
        entityId: order.id,
        details: { reference: order.reference, previousStatus: result.previousStatus, fulfillmentStatus: status },
        ipAddress: request.ip
      });
      response.json({ reference: order.reference, fulfillmentStatus: status, changed: result.changed });
    } catch (updateError) {
      response.status(500).json({ error: databaseError('Updating fulfillment failed.', updateError) });
    }
  });
});

router.post('/admin/beats', sessions.requireAdmin, async (request, response) => {
  const { title, bpm, musicalKey, genre, mood, previewDurationSeconds, prices, files } = request.body;
  const titleError = validators.text(title, 'Beat title', { required: true, max: 255 });
  const bpmError = validators.integer(bpm, 'BPM', { min: 1, max: 400, required: false });
  const durationError = validators.integer(previewDurationSeconds, 'Preview duration', { min: 1, max: 3600, required: false });
  const priceError = Object.entries(prices || {}).map(([license, value]) => validators.money(value, `${license} price`, { required: false })).find(Boolean);
  if (titleError || bpmError || durationError || priceError) return response.status(400).json({ error: titleError || bpmError || durationError || priceError });
  if (!files?.preview || !files?.mp3 || !files?.wav || !files?.stems) return response.status(400).json({ error: 'Preview, MP3, WAV, and stems files are all required.' });
  let savedFiles;
  try {
    savedFiles = {};
    savedFiles.cover_art = await saveUpload(files.cover, 'cover', 'image');
    savedFiles.preview_file = await saveUpload(files.preview, 'preview', 'audio');
    savedFiles.mp3_file = await saveUpload(files.mp3, 'mp3', 'audio');
    savedFiles.wav_file = await saveUpload(files.wav, 'wav', 'audio');
    savedFiles.stems_file = await saveUpload(files.stems, 'stems', 'audio');
  } catch (error) {
    await deleteUploads(Object.values(savedFiles || {}));
    return response.status(400).json({ error: error.message });
  }
  try {
    const result = await runQuery(
      'INSERT INTO beats (title, bpm, musical_key, genre, mood, cover_art, preview_file, preview_duration_seconds, mp3_file, wav_file, stems_file, basic_price, premium_price, unlimited_price, exclusive_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title.trim(), bpm || null, musicalKey || null, genre || null, mood || null, savedFiles.cover_art, savedFiles.preview_file, previewDurationSeconds || null, savedFiles.mp3_file, savedFiles.wav_file, savedFiles.stems_file, prices?.basic || 0, prices?.premium || 0, prices?.unlimited || 0, prices?.exclusive || 0]
    );
    recordAuditSafely(database, { userId: request.admin.id, action: 'beat_created', entityType: 'beat', entityId: result.lastID, ipAddress: request.ip });
    response.status(201).json({ id: result.lastID, title: title.trim() });
  } catch (error) {
    await deleteUploads(Object.values(savedFiles));
    response.status(500).json({ error: databaseError('Saving the beat failed.', error) });
  }
});

router.delete('/admin/beats/:id', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) {
    return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  }
  const beatId = Number(request.params.id);
  try {
    const licenses = await queryRows('SELECT id FROM licenses WHERE beat_id = ? LIMIT 1', [beatId]);
    if (licenses.length) {
      return response.status(409).json({ error: 'This beat has issued licenses and cannot be deleted. Deactivate it to remove it from the catalog.' });
    }
    database.run('DELETE FROM beats WHERE id = ?', [beatId], function (error) {
      if (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
          return response.status(409).json({ error: 'This beat is referenced by existing records and cannot be deleted. Deactivate it to remove it from the catalog.' });
        }
        return response.status(500).json({ error: databaseError('Deleting the beat failed.', error) });
      }
      if (!this.changes) return response.status(404).json({ error: `No beat was found with ID ${beatId}.` });
      recordAuditSafely(database, {
        userId: request.admin.id,
        action: 'beat_deleted',
        entityType: 'beat',
        entityId: beatId,
        ipAddress: request.ip
      });
      response.json({ id: beatId, deleted: true });
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Checking beat references failed.', error) });
  }
});

router.patch('/admin/beats/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  if (!['published', 'unpublished', 'archived'].includes(status)) return response.status(400).json({ error: 'Beat status must be published, unpublished, or archived.' });
  database.run('UPDATE beats SET catalog_status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the beat catalog status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No beat was found with ID ${request.params.id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'beat_status_changed', entityType: 'beat', entityId: Number(request.params.id), details: { status }, ipAddress: request.ip });
    response.json({ id: Number(request.params.id), status });
  });

});

router.patch('/admin/beats/:id', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Beat ID must be a positive whole number.' });
  const { title, bpm, musicalKey, genre, mood, previewDurationSeconds, prices } = request.body;
  const titleError = validators.text(title, 'Beat title', { required: true, max: 255 });
  const bpmError = validators.integer(bpm, 'BPM', { min: 1, max: 400, required: false });
  const durationError = validators.integer(previewDurationSeconds, 'Preview duration', { min: 1, max: 3600, required: false });
  const priceError = Object.entries(prices || {}).map(([license, value]) => validators.money(value, `${license} price`, { required: false })).find(Boolean);
  const textError = validators.text(musicalKey, 'Musical key', { max: 100 }) || validators.text(genre, 'Genre', { max: 100 }) || validators.text(mood, 'Mood', { max: 100 });
  if (titleError || bpmError || durationError || priceError || textError) return response.status(400).json({ error: titleError || bpmError || durationError || priceError || textError });
  database.run(
    `UPDATE beats SET title = ?, bpm = ?, musical_key = ?, genre = ?, mood = ?, preview_duration_seconds = ?, basic_price = ?, premium_price = ?, unlimited_price = ?, exclusive_price = ? WHERE id = ?`,
    [title.trim(), bpm || null, musicalKey?.trim() || null, genre?.trim() || null, mood?.trim() || null, previewDurationSeconds || null, prices?.basic || 0, prices?.premium || 0, prices?.unlimited || 0, prices?.exclusive || 0, Number(request.params.id)],
    function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating the beat failed.', error) });
      if (!this.changes) return response.status(404).json({ error: `No beat was found with ID ${request.params.id}.` });
      recordAuditSafely(database, { userId: request.admin.id, action: 'beat_updated', entityType: 'beat', entityId: Number(request.params.id), ipAddress: request.ip });
      response.json({ id: Number(request.params.id), title: title.trim() });
    }
  );
});

router.post('/admin/merchandise', sessions.requireAdmin, async (request, response) => {
  const { title, description, price, photo } = request.body;
  const titleError = validators.text(title, 'Merchandise title', { required: true, max: 255 });
  const priceError = validators.money(price, 'Merchandise price');
  if (titleError || priceError) return response.status(400).json({ error: titleError || priceError });
  let photoFile;
  try {
    photoFile = await saveUpload(photo, 'merchandise', 'image');
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
  try {
    const result = await runQuery('INSERT INTO merchandise (title, description, price, photo) VALUES (?, ?, ?, ?)', [title.trim(), description || '', Number(price), photoFile]);
    recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_created', entityType: 'merchandise', entityId: result.lastID, ipAddress: request.ip });
    response.status(201).json({ id: result.lastID, title: title.trim() });
  } catch (error) {
    await deleteUploads([photoFile]);
    response.status(500).json({ error: databaseError('Saving the merchandise failed.', error) });
  }
});

router.patch('/admin/merchandise/:id', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Merchandise ID must be a positive whole number.' });
  const { title, description, price, photo } = request.body;
  const titleError = validators.text(title, 'Merchandise title', { required: true, max: 255 });
  const priceError = validators.money(price, 'Merchandise price');
  if (titleError || priceError) return response.status(400).json({ error: titleError || priceError });
  let photoFile = null;
  try {
    photoFile = photo ? await saveUpload(photo, 'merchandise', 'image') : null;
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
  try {
    const result = await runQuery(
      'UPDATE merchandise SET title = ?, description = ?, price = ?, photo = COALESCE(?, photo) WHERE id = ?',
      [title.trim(), String(description || '').trim(), Number(price), photoFile, Number(request.params.id)]
    );
    if (!result.changes) {
      await deleteUploads([photoFile]);
      return response.status(404).json({ error: `No merchandise was found with ID ${request.params.id}.` });
    }
    recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_updated', entityType: 'merchandise', entityId: Number(request.params.id), ipAddress: request.ip });
    response.json({ id: Number(request.params.id), title: title.trim() });
  } catch (error) {
    await deleteUploads([photoFile]);
    response.status(500).json({ error: databaseError('Updating merchandise failed.', error) });
  }
});

router.patch('/admin/merchandise/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Merchandise ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  if (!['published', 'unpublished', 'archived'].includes(status)) return response.status(400).json({ error: 'Merchandise status must be published, unpublished, or archived.' });
  database.run('UPDATE merchandise SET catalog_status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating merchandise status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No merchandise was found with ID ${request.params.id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_status_changed', entityType: 'merchandise', entityId: Number(request.params.id), details: { status }, ipAddress: request.ip });
    response.json({ id: Number(request.params.id), status });
  });
});

router.delete('/admin/merchandise/:id', sessions.requireAdmin, async (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Merchandise ID must be a positive whole number.' });
  const merchandiseId = Number(request.params.id);
  try {
    const [orderItems, sales, orders] = await Promise.all([
      queryRows("SELECT id FROM order_items WHERE product_type = 'merchandise' AND product_id = ? LIMIT 1", [merchandiseId]),
      queryRows("SELECT id FROM sales WHERE sale_type = 'merchandise' AND product_id = ? LIMIT 1", [merchandiseId]),
      queryRows("SELECT items_json FROM orders WHERE status IN ('pending', 'paid', 'partially_refunded')"),
    ]);
    const referencedByOrder = orders.some(order => {
      const items = parseOrderItems(order.items_json);
      return items?.some(item => item.type === 'merchandise' && Number(item.productId) === merchandiseId) || false;
    });
    if (orderItems.length || sales.length || referencedByOrder) {
      return response.status(409).json({ error: 'This merchandise appears in order history and cannot be deleted. Deactivate it to remove it from the catalog.' });
    }
    database.run('DELETE FROM merchandise WHERE id = ?', [merchandiseId], function (error) {
      if (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
          return response.status(409).json({ error: 'This merchandise is referenced by existing records and cannot be deleted. Deactivate it to remove it from the catalog.' });
        }
        return response.status(500).json({ error: databaseError('Deleting merchandise failed.', error) });
      }
      if (!this.changes) return response.status(404).json({ error: `No merchandise was found with ID ${merchandiseId}.` });
      recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_deleted', entityType: 'merchandise', entityId: merchandiseId, ipAddress: request.ip });
      response.json({ id: merchandiseId, deleted: true });
    });
  } catch (error) {
    response.status(500).json({ error: databaseError('Checking merchandise references failed.', error) });
  }
});

router.patch('/admin/merchandise/:id/inventory', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Merchandise ID must be a positive whole number.' });
  const stock = request.body.stockQuantity === null || request.body.stockQuantity === '' ? null : Number(request.body.stockQuantity);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return response.status(400).json({ error: 'Stock quantity must be a non-negative whole number or null for unlimited stock.' });
  database.run('UPDATE merchandise SET stock_quantity = ? WHERE id = ?', [stock, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating merchandise inventory failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No merchandise was found with ID ${request.params.id}.` });
    recordAuditSafely(database, { userId: request.admin.id, action: 'merchandise_inventory_changed', entityType: 'merchandise', entityId: Number(request.params.id), details: { stockQuantity: stock }, ipAddress: request.ip });
    if (stock !== null && stock <= 5) notifyAdminsSafely(database, {
      type: 'low_stock',
      title: 'Merchandise stock is low',
      message: `Merchandise item #${request.params.id} has been set to ${stock} item${stock === 1 ? '' : 's'} remaining.`,
      dedupeKey: `low-stock-manual:${request.params.id}:${stock}`
    });
    response.json({ id: Number(request.params.id), stockQuantity: stock });
  });
});

router.post('/admin/withdraw', sessions.requireAdmin, async (request, response) => {
  const amount = Number(request.body.amount);
  const amountError = validators.money(amount, 'Withdrawal amount');
  if (amountError) return response.status(400).json({ error: amountError });
  const password = String(request.body.password || '');
  if (!password) return response.status(400).json({ error: 'Administrator password is required to record a withdrawal.' });
  let admin;
  try {
    admin = await new Promise((resolve, reject) => database.get(
      "SELECT password_hash FROM users WHERE id = ? AND role IN ('admin', 'super_admin')",
      [request.admin.id],
      (error, row) => error ? reject(error) : resolve(row)
    ));
  } catch (error) {
    return response.status(500).json({ error: databaseError('Verifying the administrator password failed.', error) });
  }
  let matches = false;
  try {
    matches = admin ? await passwordMatches(password, admin.password_hash) : false;
  } catch (error) {
    logger.error('withdrawal_password_verification_failed', { code: error.code });
  }
  if (!matches) {
    recordAuditSafely(database, { userId: request.admin.id, action: 'withdrawal_rejected', entityType: 'withdrawal', details: { reason: 'password_mismatch' }, ipAddress: request.ip });
    return response.status(401).json({ error: 'Withdrawal password is incorrect.' });
  }
  try {
    const result = await new Promise((resolve, reject) => database.run(
      'INSERT INTO withdrawals (amount) VALUES (?)',
      [amount],
      function (insertError) { if (insertError) return reject(insertError); resolve({ id: this.lastID }); }
    ));
    recordAuditSafely(database, { userId: request.admin.id, action: 'withdrawal_recorded', entityType: 'withdrawal', entityId: result.id, details: { amount }, ipAddress: request.ip });
    response.status(201).json({ id: result.id, amount });
  } catch (error) {
    response.status(500).json({ error: databaseError('Recording the withdrawal failed.', error) });
  }
});

router.patch('/admin/reviews/:id/status', sessions.requireAdmin, (request, response) => {
  const status = String(request.body.status || '');
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Review ID must be a positive whole number.' });
  if (!['approved', 'rejected', 'removed'].includes(status)) return response.status(400).json({ error: 'Choose approved, rejected, or removed.' });
  database.run('UPDATE customer_reviews SET status = ? WHERE id = ?', [status, Number(request.params.id)], function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the review status failed.', error) });
    if (!this.changes) return response.status(404).json({ error: `No customer review was found with ID ${request.params.id}.` });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'review_status_changed',
      entityType: 'customer_review',
      entityId: Number(request.params.id),
      details: { status }
    });
    response.json({ status });
  });
});

router.patch('/admin/bookings/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Booking ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  const notes = request.body.notes === undefined ? null : String(request.body.notes || '').trim();
  const allowedStatuses = ['paid', 'confirmed', 'completed', 'cancelled', 'rescheduled'];
  if (!allowedStatuses.includes(status)) return response.status(400).json({ error: `Booking status must be one of: ${allowedStatuses.join(', ')}.` });
  if (notes.length > 5000) return response.status(400).json({ error: 'Booking notes must be 5000 characters or fewer.' });
  database.get('SELECT status, admin_notes FROM bookings WHERE id = ?', [Number(request.params.id)], (lookupError, booking) => {
    if (lookupError) return response.status(500).json({ error: databaseError('Loading the booking failed.', lookupError) });
    if (!booking) return response.status(404).json({ error: `No booking was found with ID ${request.params.id}.` });
    database.run('UPDATE bookings SET status = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?', [status, notes, Number(request.params.id)], function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating the booking status failed.', error) });
      recordAuditSafely(database, { userId: request.admin.id, action: 'booking_status_changed', entityType: 'booking', entityId: Number(request.params.id), details: { previousStatus: booking.status, status, notes: notes || booking.admin_notes || null }, ipAddress: request.ip });
      database.get('SELECT name, email, service, booking_slots_json, payment_reference FROM bookings WHERE id = ?', [Number(request.params.id)], async (emailError, updatedBooking) => {
        if (emailError) return response.status(500).json({ error: databaseError('Loading the booking customer failed.', emailError) });
        try {
          if (status === 'cancelled' && booking.status !== 'cancelled') {
            let slots = [];
            try {
              const parsedSlots = JSON.parse(updatedBooking.booking_slots_json || '[]');
              if (Array.isArray(parsedSlots)) slots = parsedSlots;
            } catch (error) {
              logger.error('booking_cancellation_slot_data_invalid', { bookingId: Number(request.params.id) });
            }
            await queueEmailSafely(database, {
              to: updatedBooking.email,
              template: 'booking_cancelled',
              idempotencyKey: `booking-cancelled:${Number(request.params.id)}`,
              data: {
                name: updatedBooking.name,
                service: updatedBooking.service,
                reference: updatedBooking.payment_reference,
                slots,
                reason: notes || null
              }
            });
          }
          const customer = await new Promise((resolve, reject) => database.get("SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')", [updatedBooking.email], (lookupError, user) => lookupError ? reject(lookupError) : resolve(user)));
          if (customer) await createNotificationSafely(database, {
            userId: customer.id,
            type: 'booking_status_changed',
            title: 'Booking status updated',
            message: `Your ${updatedBooking.service || 'studio'} booking is now ${status}.`
          });

          response.json({ id: Number(request.params.id), status, notes: notes || booking.admin_notes || null });
        } catch (notificationError) {
          response.status(500).json({ error: databaseError('Updating booking notification failed.', notificationError) });
        }
      });
    });
  });
});

router.post('/admin/orders/:reference/booking-resolution', sessions.requireAdmin, async (request, response) => {
  const reference = String(request.params.reference || '').trim();
  const action = String(request.body.action || '');
  if (!reference || reference.length > 255) return response.status(400).json({ error: 'A valid order reference is required.' });
  if (!['assign_slot', 'request_refund'].includes(action)) return response.status(400).json({ error: 'Choose assign_slot or request_refund.' });

  if (action === 'assign_slot') {
    const slots = request.body.slots;
    if (!Array.isArray(slots) || slots.some(slot => !slot || typeof slot.date !== 'string' || typeof slot.time !== 'string')) {
      return response.status(400).json({ error: 'Provide each replacement session as a date and time.' });
    }
    let bookingSettings;
    try {
      bookingSettings = await getBookingSettings(database);
    } catch (error) {
      return response.status(500).json({ error: databaseError('Loading booking availability settings failed.', error) });
    }
    try {
      const result = await database.transaction(async transaction => {
        const order = await transaction.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [reference]);
        if (!order) return { status: 404, error: 'No order was found for this reference.' };
        if (!order.fulfillment_review_required || order.status !== 'paid') return { status: 409, error: 'This paid order is not awaiting booking reconciliation.' };
        if (order.fulfillment_review_reason === 'refund_pending') return { status: 409, error: 'A refund is already pending for this order; do not assign another booking slot.' };
        const items = parseOrderItems(order.items_json);
        if (!items) return { status: 500, error: 'Order details could not be read.' };
        const bookingItem = items.find(item => item.type === 'booking');
        const oldSlots = bookingItem?.booking?.sessionSlots;
        if (!bookingItem || !Array.isArray(oldSlots) || !areAvailableBookingSlots(slots, oldSlots.length, bookingSettings.rules)) {
          return { status: 400, error: 'Provide the same number of valid, non-overlapping replacement sessions as the original booking.' };
        }
        const updatedBooking = {
          ...bookingItem.booking,
          sessionSlots: slots.map(slot => ({ date: slot.date, time: slot.time }))
        };
        const updatedItems = items.map(item => item === bookingItem ? { ...item, booking: updatedBooking } : item);
        await reserveBookingSlots(transaction, reference, updatedBooking.sessionSlots, { sessionMinutes: bookingSettings.sessionMinutes });
        await fulfillPaidBooking(transaction, order, { ...bookingItem, booking: updatedBooking });
        await transaction.run(
          `UPDATE orders
           SET items_json = ?, fulfillment_review_required = FALSE,
               fulfillment_review_reason = NULL, fulfillment_reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(updatedItems), order.id]
        );
        return { status: 200, orderId: order.id, slots: updatedBooking.sessionSlots };
      });
      if (result.status !== 200) return response.status(result.status).json({ error: result.error });
      await recordAuditSafely(database, {
        userId: request.admin.id,
        action: 'booking_payment_reconciliation_assigned',
        entityType: 'order',
        entityId: result.orderId,
        details: { reference, slots: result.slots },
        ipAddress: request.ip
      });
      return response.json({ reference, resolution: 'assigned', slots: result.slots });
    } catch (error) {
      if (error.code === 'BOOKING_SLOT_UNAVAILABLE' || error.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({ error: 'One or more replacement sessions are no longer available. Refresh availability and choose another time.' });
      }
      return response.status(500).json({ error: databaseError('Assigning the replacement booking failed.', error) });
    }
  }

  if (!config.paystackSecretKey) return response.status(503).json({ error: 'Refund processing is unavailable because PAYSTACK_SECRET_KEY is not configured.' });
  let refundDetails;
  try {
    refundDetails = await database.transaction(async transaction => {
      const order = await transaction.get('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [reference]);
      if (!order) return { status: 404, error: 'No order was found for this reference.' };
      if (!order.fulfillment_review_required || order.status !== 'paid') return { status: 409, error: 'This paid order is not awaiting booking reconciliation.' };
      if (order.fulfillment_review_reason === 'refund_pending') return { status: 200, alreadyPending: true, orderId: order.id };
      const payment = await transaction.get(
        `SELECT provider_reference FROM payments
         WHERE order_id = ? AND provider = ? AND status = ?
         ORDER BY verified_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        [order.id, 'paystack', 'paid']
      );
      if (!payment?.provider_reference) return { status: 409, error: 'A confirmed Paystack transaction could not be found for this order.' };
      await transaction.run('UPDATE orders SET fulfillment_review_reason = ? WHERE id = ?', ['refund_pending', order.id]);
      return { status: 200, orderId: order.id, amount: Number(order.amount) - Number(order.refunded_amount || 0), providerReference: payment.provider_reference, email: order.customer_email };
    });
  } catch (error) {
    return response.status(500).json({ error: databaseError('Preparing the booking refund failed.', error) });
  }
  if (refundDetails.status !== 200) return response.status(refundDetails.status).json({ error: refundDetails.error });
  if (refundDetails.alreadyPending) return response.json({ reference, resolution: 'refund_pending' });
  try {
    const providerResponse = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.paystackSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: refundDetails.providerReference,
        amount: Math.round(refundDetails.amount * 100)
      })
    });
    const providerResult = await providerResponse.json();
    if (!providerResponse.ok || !providerResult.status) {
      await runQuery(
        `UPDATE orders SET fulfillment_review_reason = ?
         WHERE reference = ? AND fulfillment_review_required = TRUE AND fulfillment_review_reason = ?`,
        ['booking_slot_unavailable', reference, 'refund_pending']
      );
      return response.status(502).json({ error: providerResult.message || 'Paystack did not accept the refund request.' });
    }
  } catch (error) {
    logger.error('booking_refund_request_uncertain', { reference, code: error.code });
    return response.status(502).json({ error: 'The refund request could not be confirmed. Check Paystack before retrying; the order is marked refund pending to prevent duplicate requests.' });
  }
  await recordAuditSafely(database, {
    userId: request.admin.id,
    action: 'booking_payment_refund_requested',
    entityType: 'order',
    entityId: refundDetails.orderId,
    details: { reference, amount: refundDetails.amount },
    ipAddress: request.ip
  });
  const customers = await queryRows(
    "SELECT id FROM users WHERE lower(email) = lower(?) AND role NOT IN ('admin', 'super_admin')",
    [refundDetails.email]
  );
  const customer = customers[0];
  if (customer?.id) await createNotificationSafely(database, {
    userId: customer.id,
    type: 'booking_refund_pending',
    title: 'Booking refund requested',
    message: 'A refund has been requested for your booking payment. We will notify you when Paystack confirms it.'
  });
  response.json({ reference, resolution: 'refund_pending' });
});

router.patch('/admin/requests/:id/status', sessions.requireAdmin, (request, response) => {
  if (!/^\d+$/.test(request.params.id) || Number(request.params.id) < 1) return response.status(400).json({ error: 'Request ID must be a positive whole number.' });
  const status = String(request.body.status || '').toLowerCase();
  const quote = request.body.quoteGhs === '' || request.body.quoteGhs === null || request.body.quoteGhs === undefined ? null : Number(request.body.quoteGhs);
  const notes = request.body.notes === undefined ? null : String(request.body.notes || '').trim();
  const statuses = ['new', 'reviewing', 'quoted', 'accepted', 'rejected', 'completed'];
  if (!statuses.includes(status)) return response.status(400).json({ error: `Request status must be one of: ${statuses.join(', ')}.` });
  if (quote !== null && (!Number.isFinite(quote) || quote < 0)) return response.status(400).json({ error: 'Quote must be a non-negative amount or blank.' });
  if (notes !== null && notes.length > 5000) return response.status(400).json({ error: 'Request notes must be 5000 characters or fewer.' });
  database.get('SELECT user_id, product_name, request_type, status AS previous_status FROM customization_requests WHERE id = ?', [Number(request.params.id)], (lookupError, requestRecord) => {
    if (lookupError) return response.status(500).json({ error: databaseError('Loading the request failed.', lookupError) });
    if (!requestRecord) return response.status(404).json({ error: 'Request was not found.' });
    database.run('UPDATE customization_requests SET status = ?, quote_gsh = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?', [status, quote, notes, Number(request.params.id)], async function (error) {
    if (error) return response.status(500).json({ error: databaseError('Updating the request failed.', error) });
    if (requestRecord.user_id) await createNotificationSafely(database, {
      userId: requestRecord.user_id,
      type: 'request_status_changed',
      title: 'Request status updated',
      message: `${requestRecord.product_name || requestRecord.request_type + ' request'} is now ${status}${quote === null ? '' : ` with a quote of GHS ${quote.toFixed(2)}`}.`
    });
    recordAuditSafely(database, {
      userId: request.admin.id,
      action: 'request_status_changed',
      entityType: 'customization_request',
      entityId: Number(request.params.id),
      details: { previousStatus: requestRecord.previous_status, status, quoteGhs: quote }
    });
    response.json({ id: Number(request.params.id), status, quoteGhs: quote, notes });
    });
  });
});

router.post('/admin/bookings/availability', sessions.requireAdmin, async (request, response) => {
  const date = String(request.body.date || '').trim();
  const time = String(request.body.time || '').trim();
  const status = String(request.body.status || 'blocked').toLowerCase();
  let settings;
  try {
    settings = await getBookingSettings(database);
  } catch (error) {
    return response.status(500).json({ error: databaseError('Loading booking availability settings failed.', error) });
  }
  if (!isAvailableBookingSlot(date, time, settings.rules)) return response.status(400).json({ error: `Choose a valid slot on an available booking day between ${settings.openTime} and ${settings.closeTime}.` });
  if (!['available', 'blocked'].includes(status)) return response.status(400).json({ error: 'Availability status must be available or blocked.' });
  database.run(
     `INSERT INTO booking_availability (slot_date, start_time, end_time, status)
      VALUES (?, ?, ?::time + INTERVAL '${settings.sessionMinutes} minutes', ?)
      ON CONFLICT (slot_date, start_time) DO UPDATE
     SET status = CASE
           WHEN booking_availability.status = 'booked'
             OR (booking_availability.status = 'reserved' AND booking_availability.hold_expires_at > CURRENT_TIMESTAMP)
           THEN booking_availability.status
           ELSE EXCLUDED.status
         END,
         booking_order_reference = CASE
           WHEN booking_availability.status = 'reserved' AND booking_availability.hold_expires_at > CURRENT_TIMESTAMP
           THEN booking_availability.booking_order_reference
           ELSE NULL
         END,
         hold_expires_at = CASE
           WHEN booking_availability.status = 'reserved' AND booking_availability.hold_expires_at > CURRENT_TIMESTAMP
           THEN booking_availability.hold_expires_at
           ELSE NULL
         END`,
    [date, time, time, status],
    function (error) {
      if (error) return response.status(500).json({ error: databaseError('Updating booking availability failed.', error) });
      database.get('SELECT status FROM booking_availability WHERE slot_date = ? AND start_time = ?', [date, time], (lookupError, slot) => {
        if (lookupError) return response.status(500).json({ error: databaseError('Reading booking availability failed.', lookupError) });
        if (!slot) return response.status(404).json({ error: 'The booking slot was not found.' });
        if (slot.status !== status && slot.status === 'booked') return response.status(409).json({ error: 'A paid booking already occupies this slot.' });
        if (slot.status === 'reserved') return response.status(409).json({ error: 'A customer is currently completing payment for this slot. Try again after the reservation expires.' });
        recordAuditSafely(database, { userId: request.admin.id, action: 'booking_availability_changed', entityType: 'booking_slot', details: { date, time, status: slot.status }, ipAddress: request.ip });
        response.json({ date, time, status: slot.status });
      });
    }
  );
});

router.delete('/admin/bookings/availability', sessions.requireAdmin, async (request, response) => {
  const date = String(request.query.date || '').trim();
  const time = String(request.query.time || '').trim();
  let settings;
  try {
    settings = await getBookingSettings(database);
  } catch (error) {
    return response.status(500).json({ error: databaseError('Loading booking availability settings failed.', error) });
  }
  if (!isAvailableBookingSlot(date, time, settings.rules)) return response.status(400).json({ error: 'Provide a valid booking date and time.' });
  database.run(
    `DELETE FROM booking_availability
     WHERE slot_date = ? AND start_time = ?
       AND (status NOT IN (?, ?) OR (status = ? AND hold_expires_at <= CURRENT_TIMESTAMP))`,
    [date, time, 'booked', 'reserved', 'reserved'],
    function (error) {
      if (error) return response.status(500).json({ error: databaseError('Removing booking availability failed.', error) });
      if (!this.changes) return response.status(404).json({ error: 'No unreserved booking slot was found.' });
      recordAuditSafely(database, { userId: request.admin.id, action: 'booking_availability_removed', entityType: 'booking_slot', details: { date, time }, ipAddress: request.ip });
      response.json({ date, time, removed: true });
    }
  );
});

module.exports = router;
