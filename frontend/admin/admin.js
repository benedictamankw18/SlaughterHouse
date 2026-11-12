const API = window.ULTBIGBOY_API_URL || '';
let adminMfaChallengeToken = null;
let adminMfaEnrollment = false;
let dashboardData = { sales: [], requests: [], orders: [], reviews: [], artists: [], withdrawals: [], analytics: {} };
let staffRecords = [];
let reportState = { granularity: 'day', metric: 'revenue', chart: 'line' };
let lastReport = null;
let reportRequestId = 0;
const activeAdminSectionKey = 'adminActiveSection';
const adminCsrfHeaders = method => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase())) return {};
  const token = localStorage.getItem('adminCsrfToken') || '';
  return token ? { 'X-CSRF-Token': token } : {};
};

const $ = selector => document.querySelector(selector);
const message = (id, text, error = false) => { const element = document.getElementById(id); element.textContent = text; element.classList.toggle('error', error); };
const beatGenres = [
  { value: 'afrobeat', label: 'Afrobeat' },
  { value: 'amapiano', label: 'Amapiano' },
  { value: 'trap', label: 'Trap' },
  { value: 'hiphop', label: 'Rap / Hip Hop' },
  { value: 'highlife', label: 'Highlife' },
  { value: 'rnb', label: 'R&B' },
  { value: 'dancehall', label: 'Dancehall' },
  { value: 'reggae', label: 'Reggae' },
  { value: 'asakaa', label: 'Asakaa' }
];
const beatMoods = ['emotional', 'sad', 'happy', 'energetic', 'romantic', 'dark', 'chill', 'uplifting', 'storytelling', 'dance', 'other', 'cool']
  .map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const beatKeys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  .flatMap(note => ['Major', 'Minor'].map(mode => ({ value: `${note} ${mode}`, label: `${note} ${mode}` })));
const beatBpms = Array.from({ length: 181 }, (_, index) => {
  const value = index + 40;
  return { value: String(value), label: String(value) };
});
const beatPriceUsd = value => `$${Number(value || 0).toFixed(2)} USD`;
let beatCoverObjectUrl;

function beatSelectMarkup(name, label, options, selectedValue = '', placeholder = `Select ${label.toLowerCase()}`) {
  const selected = String(selectedValue ?? '');
  const availableOptions = [...options];
  if (selected && !availableOptions.some(option => option.value === selected)) {
    availableOptions.push({ value: selected, label: `${selected} (current)` });
  }
  return `<label>${label}<select name="${name}">${beatOptionsMarkup(availableOptions, selected, placeholder)}</select></label>`;
}

function beatOptionsMarkup(options, selectedValue = '', placeholder = '') {
  const selected = String(selectedValue ?? '');
  return `<option value="">${escapeHtml(placeholder)}</option>${options.map(option =>
    `<option value="${escapeHtml(option.value)}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('')}`;
}

function populateBeatSelectors(form) {
  form.elements.bpm.innerHTML = beatOptionsMarkup(beatBpms, '', 'Select BPM');
  form.elements.musicalKey.innerHTML = beatOptionsMarkup(beatKeys, '', 'Select key');
  form.elements.genre.innerHTML = beatOptionsMarkup(beatGenres, '', 'Select genre');
  form.elements.mood.innerHTML = beatOptionsMarkup(beatMoods, '', 'Select mood');
}

function clearBeatCoverPreview() {
  const preview = $('#beat-cover-preview');
  if (beatCoverObjectUrl) URL.revokeObjectURL(beatCoverObjectUrl);
  beatCoverObjectUrl = null;
  preview.removeAttribute('src');
  preview.hidden = true;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...adminCsrfHeaders(options.method), ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// Mirrors the server-side upload rules so an oversized or unsupported file is
// reported before it is base64-encoded into a very large request body.
const UPLOAD_RULES = Object.freeze({
  image: {
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
    mime: new Set(['image/jpeg', 'image/png', 'image/webp']),
    maxBytes: 5 * 1024 * 1024,
    maxLabel: '5 MB',
    description: 'JPG, PNG, or WebP image'
  },
  audio: {
    extensions: new Set(['.mp3', '.wav', '.ogg', '.m4a', '.mp4']),
    mime: new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'video/mp4']),
    maxBytes: 25 * 1024 * 1024,
    maxLabel: '25 MB',
    description: 'MP3, WAV, OGG, M4A, or MP4 audio file'
  }
});

function formatUploadSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 1 ? megabytes.toFixed(2) : megabytes.toFixed(1)} MB`;
}

function validateUploadFile(file, kind, label) {
  const rule = UPLOAD_RULES[kind];
  if (!rule) throw new Error(`${label}: This upload type is not supported.`);
  const extension = (/\.[^.\\/]+$/.exec(file.name) || [''])[0].toLowerCase();
  if (!rule.extensions.has(extension) || !rule.mime.has(String(file.type || '').toLowerCase())) {
    throw new Error(`${label}: Choose a ${rule.description}.`);
  }
  if (file.size > rule.maxBytes) {
    throw new Error(`${label} is ${formatUploadSize(file.size)}. The maximum is ${rule.maxLabel}.`);
  }
}

function fileData(file, kind, label) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    try {
      validateUploadFile(file, kind, label);
    } catch (error) {
      reject(error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesFrom(form, fields) {
  const result = {};
  for (const { name, kind, label } of fields) result[name] = await fileData(form.elements[name].files[0], kind, label);
  return result;
}

// Disables an action button and shows an inline spinner until the returned
// function is called. Calling it twice is safe, which prevents duplicate
// add/create/delete requests from a double click or a repeated submit.
function startButtonBusy(button, label = 'Working…') {
  if (!button || button.dataset.busy === 'true') return null;
  const idleHtml = button.innerHTML;
  button.dataset.busy = 'true';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
  const spinner = document.createElement('span');
  spinner.className = 'admin-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'admin-busy-label';
  text.textContent = label;
  button.replaceChildren(spinner, text);
  return function stopButtonBusy() {
    if (button.dataset.busy !== 'true') return;
    delete button.dataset.busy;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
    button.innerHTML = idleHtml;
  };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatMoney = value => `GHS ${Number(value || 0).toFixed(2)}`;
populateBeatSelectors($('#beat-form'));

function renderList(elementId, items, type) {
  const container = document.getElementById(elementId);
  if (!items.length) {
    container.innerHTML = '<p>No records match these filters.</p>';
    return;
  }
  container.innerHTML = items.map(item => {
    if (type === 'sales') return `<article class="admin-list-item"><strong>${escapeHtml(item.product_name || 'Sale')}</strong><p>${escapeHtml(item.buyer_name || 'Buyer not recorded')} · ${escapeHtml(item.buyer_email || 'No email')} · ${formatMoney(item.amount)} · ${escapeHtml(item.created_at || '')}</p></article>`;
    if (type === 'bookings') {
      let slots = [];
      try { slots = typeof item.booking_slots_json === 'string' ? JSON.parse(item.booking_slots_json) : item.booking_slots_json || []; } catch {}
      const slotSummary = slots.length
        ? slots.map((slot, index) => `<br>Session ${index + 1}: ${escapeHtml(slot.date)} at ${escapeHtml(slot.time)}`).join('')
        : `<br>Preferred: ${escapeHtml(item.preferred_date || 'Flexible')} ${escapeHtml(item.preferred_time || '')}`;
      return `<article class="admin-list-item"><strong>${escapeHtml(item.service)}</strong><p>${escapeHtml(item.name)} · ${escapeHtml(item.email)} · ${escapeHtml(item.phone || 'No phone')}<br>Artists: ${escapeHtml(item.artist_count || 1)}${item.song_count ? `<br>Songs: ${escapeHtml(item.song_count)}` : ''}${slotSummary}<br>${escapeHtml(item.details || 'No details provided')}<br>Status: ${escapeHtml(item.status || 'new')}</p><label class="admin-note-field">Admin notes<textarea data-booking-notes="${Number(item.id)}" rows="2" maxlength="5000">${escapeHtml(item.admin_notes || '')}</textarea></label><div class="admin-review-actions"><select data-booking-status="${Number(item.id)}" aria-label="Booking status"><option value="paid" ${item.status === 'paid' ? 'selected' : ''}>Paid</option><option value="confirmed" ${item.status === 'confirmed' ? 'selected' : ''}>Confirmed</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option><option value="cancelled" ${item.status === 'cancelled' ? 'selected' : ''}>Cancelled</option><option value="rescheduled" ${item.status === 'rescheduled' ? 'selected' : ''}>Rescheduled</option></select><button type="button" data-save-booking-status="${Number(item.id)}">Save status</button></div><p class="admin-message" data-booking-message></p></article>`;
    }
    if (type === 'requests') return `<article class="admin-list-item"><strong>${escapeHtml(item.product_name || 'Request')}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${item.requested_license ? `License: ${escapeHtml(item.requested_license[0].toUpperCase() + item.requested_license.slice(1))} · ${formatMoney(item.license_price_gsh)}<br>` : ''}${escapeHtml(item.details || 'No details provided')}<br>${item.sample_link ? `<a href="${escapeHtml(item.sample_link)}" target="_blank" rel="noopener noreferrer">Open sample link</a><br>` : ''}${item.sample_audio_file ? `<a href="${API}/api/admin/uploads/${encodeURIComponent(item.sample_audio_file)}" target="_blank" rel="noopener noreferrer">Listen to sample audio</a><br>` : ''}Created: ${escapeHtml(item.created_at || '')}</p><form class="admin-request-editor" data-request-id="${Number(item.id)}"><div class="admin-grid"><label>Status<select name="status"><option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option><option value="reviewing" ${item.status === 'reviewing' ? 'selected' : ''}>Reviewing</option><option value="quoted" ${item.status === 'quoted' ? 'selected' : ''}>Quoted</option><option value="accepted" ${item.status === 'accepted' ? 'selected' : ''}>Accepted</option><option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>Rejected</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option></select></label><label>Quote (GHS)<input name="quoteGhs" type="number" min="0" step="0.01" value="${escapeHtml(item.quote_gsh)}"></label></div><label>Admin notes<textarea name="notes" rows="2" maxlength="5000">${escapeHtml(item.admin_notes || '')}</textarea></label><div class="admin-review-actions"><button type="submit">Save request</button></div><p class="admin-message" data-request-message></p></form></article>`;
    if (type === 'orders') {
      const itemsText = item.items.map(orderItem => `${orderItem.name || 'Item'}${orderItem.license ? ` (${orderItem.license} license)` : ''}`).join(', ') || 'No line items';
      const booking = item.items.find(orderItem => orderItem.type === 'booking');
      const originalSlots = booking?.booking?.sessionSlots
        || (booking?.booking?.preferredDate && booking.booking.preferredTime
          ? [{ date: booking.booking.preferredDate, time: booking.booking.preferredTime }]
          : []);
      const refundPending = item.fulfillment_review_reason === 'refund_pending';
      const reconciliationControls = refundPending
        ? '<p>Refund request pending Paystack confirmation. Do not assign a replacement slot.</p>'
        : !originalSlots.length
          ? '<p>Original session details are unavailable. Request a refund or contact support.</p><div class="admin-review-actions"><button type="button" data-request-booking-refund>Request full refund</button></div>'
        : `<div class="admin-grid">${originalSlots.map((slot, index) => `<label>Replacement session ${index + 1} date<input type="date" data-replacement-date="${index}" required></label><label>Replacement session ${index + 1} time<input type="time" data-replacement-time="${index}" required></label>`).join('')}</div>
          <div class="admin-review-actions"><button type="button" data-assign-replacement-slot>Assign replacement slot</button><button type="button" data-request-booking-refund>Request full refund</button></div>`;
      const reconciliation = item.fulfillment_review_required && booking
        ? `<section class="admin-booking-reconciliation" data-booking-resolution="${escapeHtml(item.reference)}">
          <strong>Booking fulfillment needs review</strong>
          <p>${escapeHtml(item.fulfillment_review_reason || 'Payment received, but the original slot was unavailable.')}</p>
          ${reconciliationControls}
          <p class="admin-message" data-booking-resolution-message role="status"></p>
        </section>`
        : '';
      return `<article class="admin-list-item"><strong>${escapeHtml(item.reference)} · ${escapeHtml(item.status)}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${escapeHtml(itemsText)}<br>${formatMoney(item.amount)} · ${escapeHtml(item.created_at || '')}</p>${reconciliation}</article>`;
    }
    if (type === 'reviews') return `<article class="admin-list-item"><strong>${escapeHtml(item.customer_name)} · ${'★'.repeat(Number(item.rating) || 0)}${'☆'.repeat(Math.max(0, 5 - Number(item.rating || 0)))}</strong><p>${escapeHtml(item.customer_email)} · ${escapeHtml(item.status)} · ${escapeHtml(item.created_at || '')}</p><blockquote>${escapeHtml(item.review_text)}</blockquote><div class="admin-review-actions">${item.status === 'pending' ? '<button type="button" data-review-status="approved">Approve</button><button type="button" data-review-status="rejected">Reject</button>' : ''}${item.status !== 'removed' ? '<button type="button" data-review-status="removed">Remove</button>' : ''}</div><p class="admin-message" data-review-message></p><span data-review-id="${Number(item.id)}" hidden></span></article>`;
    if (type === 'customers') return `<article class="admin-list-item"><strong>${escapeHtml(item.name || item.artist_name || 'Customer')}</strong><p>${escapeHtml(item.email)} · ${escapeHtml(item.role)} · joined ${escapeHtml(item.created_at || '')} · email ${item.email_verified_at ? 'verified' : 'unverified'}</p></article>`;
    if (type === 'withdrawals') return `<article class="admin-list-item"><strong>${formatMoney(item.amount)}</strong><p>${escapeHtml(item.created_at || '')}</p></article>`;
    if (type === 'audit') return `<article class="admin-list-item"><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.actor_email || 'System')} · ${escapeHtml(item.entity_type || 'event')}${item.entity_id ? ` #${escapeHtml(item.entity_id)}` : ''} · ${escapeHtml(item.created_at || '')}</p><small>${escapeHtml(item.details_json || '')}</small></article>`;
    return '';
  }).join('');
}

function searchRecords(items, query) {
  const search = String(query || '').trim().toLowerCase();
  return !search ? items : items.filter(item => JSON.stringify(item).toLowerCase().includes(search));
}

function filterByDateRange(items, from, to, field = 'created_at') {
  return items.filter(item => {
    const date = String(item[field] || '').slice(0, 10);
    return (!from || (date && date >= from)) && (!to || (date && date <= to));
  });
}

function filterContentRecords(items, searchId, statusId, statusField = 'catalog_status') {
  const query = document.getElementById(searchId).value;
  const status = document.getElementById(statusId).value;
  return searchRecords(items, query).filter(item =>
    !status || (status === 'active' ? item[statusField] === 'published' : item[statusField] !== 'published')
  );
}

function filterContent() {
  const type = document.querySelector('[data-content-type].active')?.dataset.contentType || 'beat';
  $('#content-beat-filters').hidden = type !== 'beat';
  $('#content-merchandise-filters').hidden = type !== 'merchandise';
  $('#content-release-filters').hidden = type !== 'stream-releases';
  if (type === 'beat') {
    renderBeatManagement(filterContentRecords(dashboardData.beats || [], 'content-beat-search', 'content-beat-status'));
  } else if (type === 'merchandise') {
    renderMerchandiseManagement(filterContentRecords(dashboardData.merchandise || [], 'content-merchandise-search', 'content-merchandise-status'));
  } else {
    renderStreamReleaseManagement(filterContentRecords(dashboardData.streamReleases || [], 'content-release-search', 'content-release-status', 'status'));
  }
}

function filterSales() {
  const type = document.querySelector('[data-sale-type].active')?.dataset.saleType || 'beat';
  let items = (dashboardData.sales || []).filter(item => item.sale_type === type);
  items = searchRecords(items, $('#sales-search').value);
  items = filterByDateRange(items, $('#sales-from').value, $('#sales-to').value);
  renderList('sales-list', items, 'sales');
}

function filterOrders(type = document.querySelector('[data-order-type].active')?.dataset.orderType || 'all') {
  let items = type === 'all' ? dashboardData.orders || [] : (dashboardData.orders || []).filter(order =>
    order.items.some(item => item.type === type)
  );
  const status = $('#orders-status').value;
  if (status) items = items.filter(order => order.status === status);
  items = searchRecords(items, $('#orders-search').value);
  renderList('orders-list', items, 'orders');
}

function filterRequests() {
  const type = document.querySelector('[data-request-type].active')?.dataset.requestType || 'beat';
  if (type === 'bookings') {
    renderList('bookings-list', dashboardData.bookings || [], 'bookings');
    $('#requests-list').innerHTML = '';
    return;
  }
  let items = (dashboardData.requests || []).filter(item => item.request_type === type);
  const status = $('#requests-status').value;
  if (status) items = items.filter(item => item.status === status);
  items = searchRecords(items, $('#requests-search').value);
  renderList('requests-list', items, 'requests');
  $('#bookings-list').innerHTML = '';
}

function filterReviews() {
  let items = dashboardData.reviews || [];
  const status = $('#reviews-status').value;
  if (status) items = items.filter(item => item.status === status);
  items = searchRecords(items, $('#reviews-search').value);
  renderList('reviews-list', items, 'reviews');
}

function filterCustomers() {
  let items = dashboardData.customers || [];
  const role = $('#customers-role').value;
  const emailStatus = $('#customers-email-status').value;
  if (role) items = items.filter(item => item.role === role);
  if (emailStatus) items = items.filter(item => Boolean(item.email_verified_at) === (emailStatus === 'verified'));
  items = searchRecords(items, $('#customers-search').value);
  renderList('customers-list', items, 'customers');
}

function filterArtists() {
  let items = dashboardData.artists || [];
  const purchases = $('#artists-purchases').value;
  if (purchases) items = items.filter(item => purchases === 'has-purchases' ? item.purchases.length > 0 : item.purchases.length === 0);
  items = searchRecords(items, $('#artists-search').value);
  renderArtistsGrid(items);
}

function renderArtistsGrid(artists) {
  const container = $('#artists-list');
  if (!artists.length) {
    container.innerHTML = dashboardData.artists?.length ? '<p>No artists match these filters.</p>' : '<p>No artists registered yet.</p>';
    return;
  }
  container.innerHTML = artists.map(artist => {
    const initials = String(artist.artist_name || artist.name || 'A').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const purchases = artist.purchases || [];
    const totalGhs = purchases.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const firstRate = purchases.length ? purchases[0].exchange_rate : null;
    return `<article class="admin-card admin-artist-card" data-artist-id="${Number(artist.id)}">
      <div class="admin-artist-avatar">${escapeHtml(initials)}</div>
      <div class="admin-artist-card-content">
        <div class="admin-beat-editor-heading">
          <strong>${escapeHtml(artist.artist_name || artist.name)}</strong>
          <span class="admin-beat-status">${escapeHtml(artist.role)}</span>
        </div>
        <p class="admin-beat-summary">${escapeHtml(artist.email)}</p>
        <p class="admin-beat-summary">${purchases.length} license purchase${purchases.length === 1 ? '' : 's'}${totalGhs > 0 ? ` · GHS ${totalGhs.toFixed(2)}` : ''}${firstRate ? ` · USD/GHS ${firstRate}` : ''}</p>
        <div class="admin-review-actions admin-artist-actions">
          <button type="button" data-view-artist-purchases="${Number(artist.id)}">View purchases</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderArtistPurchasesDialog(artistId) {
  const artist = dashboardData.artists.find(a => Number(a.id) === Number(artistId));
  if (!artist) return;
  const container = $('#artist-purchases-content');
  const purchases = artist.purchases || [];
  if (!purchases.length) {
    container.innerHTML = '<p>No beat purchases found for this artist.</p>';
  } else {
    container.innerHTML = `<table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr><th style="text-align:left;padding:6px 0;color:rgba(255,255,255,.52);font-size:.7rem;text-transform:uppercase">Beat</th><th style="text-align:left;padding:6px 0;color:rgba(255,255,255,.52);font-size:.7rem;text-transform:uppercase">License</th><th style="text-align:right;padding:6px 0;color:rgba(255,255,255,.52);font-size:.7rem;text-transform:uppercase">Amount</th><th style="text-align:left;padding:6px 0;color:rgba(255,255,255,.52);font-size:.7rem;text-transform:uppercase">Purchased</th></tr>
      </thead>
      <tbody>
        ${purchases.map(p => `<tr>
          <td style="padding:6px 0;color:rgba(255,255,255,.78)">${escapeHtml(p.beat_title)}</td>
          <td style="padding:6px 0;color:rgba(255,255,255,.78)">${escapeHtml(p.license)}</td>
          <td style="padding:6px 0;color:rgba(255,255,255,.78);text-align:right">${p.amount === null ? 'GHS unavailable' : formatMoney(p.amount)}${p.exchange_rate ? ` · ${escapeHtml(p.exchange_rate)}` : ''}</td>
          <td style="padding:6px 0;color:rgba(255,255,255,.78)">${escapeHtml(p.purchased_at || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }
  $('#artist-purchases-title').textContent = `Purchased Items — ${escapeHtml(artist.artist_name || artist.name)}`;
  $('#artist-purchases-dialog').showModal();
}

function filterStaff() {
  const role = $('#staff-role').value;
  let items = role ? staffRecords.filter(user => user.role === role) : staffRecords;
  items = searchRecords(items, $('#staff-search').value);
  renderStaff(items);
}

function renderAnalytics(analytics) {
  $('#metric-revenue').textContent = formatMoney(analytics.revenue);
  $('#metric-paid-orders').textContent = analytics.paidOrders || 0;
  $('#metric-pending-orders').textContent = analytics.pendingOrders || 0;
  $('#metric-beat-licenses').textContent = analytics.beatLicenses || 0;
  $('#metric-merchandise-orders').textContent = analytics.merchandiseOrders || 0;
  $('#metric-pending-reviews').textContent = analytics.pendingReviews || 0;
  $('#metric-withdrawals').textContent = formatMoney(analytics.withdrawals);
  $('#metric-net-revenue').textContent = formatMoney(Number(analytics.revenue || 0) - Number(analytics.withdrawals || 0));
}

function dateInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const REPORT_RANGE_DAYS = { day: 30, week: 84, month: 365 };
const REPORT_METRIC_LABELS = { revenue: 'Revenue', withdrawals: 'Withdrawals', both: 'Revenue and withdrawals' };
const ANALYTICS_CHART_WIDTH = 760;
const ANALYTICS_CHART_HEIGHT = 300;
const ANALYTICS_CHART_SPACE = { top: 24, right: 24, bottom: 74, left: 86 };

function setReportRange(granularity) {
  const form = $('#report-filter');
  if (!form) return;
  const today = new Date();
  form.elements.to.value = dateInputValue(today);
  const days = REPORT_RANGE_DAYS[granularity];
  if (!days) {
    form.elements.from.value = '';
    return;
  }
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  form.elements.from.value = dateInputValue(start);
}

function formatReportPeriod(period, granularity) {
  if (granularity === 'year') return String(period);
  if (granularity === 'month') {
    const [year, month] = String(period).split('-').map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const date = new Date(`${period}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(period);
  const label = date.toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return granularity === 'week' ? `Week of ${label}` : label;
}

function formatChartMoney(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1000000) return `GHS ${(amount / 1000000).toFixed(1)}m`;
  if (Math.abs(amount) >= 1000) return `GHS ${(amount / 1000).toFixed(1)}k`;
  return `GHS ${Math.round(amount)}`;
}

function analyticsChartGeometry(periods, series) {
  const { top, right, bottom, left } = ANALYTICS_CHART_SPACE;
  const innerWidth = ANALYTICS_CHART_WIDTH - left - right;
  const innerHeight = ANALYTICS_CHART_HEIGHT - top - bottom;
  const maximum = Math.max(1, ...series.flatMap(item => item.values));
  const lineStep = periods.length > 1 ? innerWidth / (periods.length - 1) : 0;
  return {
    top, right, bottom, left, innerWidth, innerHeight, maximum,
    lineX: index => left + (periods.length > 1 ? index * lineStep : innerWidth / 2),
    groupWidth: innerWidth / Math.max(1, periods.length),
    y: value => top + innerHeight - (value / maximum) * innerHeight
  };
}

function analyticsChartLabel(periods, series) {
  return `${series.map(item => item.label).join(' and ')} by ${reportState.granularity}, ${periods.length} periods.`;
}

function analyticsAxisMarkup(periods, geometry, labelX) {
  const parts = [];
  for (let index = 0; index <= 4; index += 1) {
    const value = (geometry.maximum / 4) * index;
    const gridY = geometry.y(value);
    parts.push(`<line x1="${geometry.left}" y1="${gridY}" x2="${ANALYTICS_CHART_WIDTH - geometry.right}" y2="${gridY}" class="analytics-grid" />`);
    parts.push(`<text x="${geometry.left - 10}" y="${gridY + 4}" text-anchor="end" class="analytics-axis-text">${escapeHtml(formatChartMoney(value))}</text>`);
  }
  const labelStep = Math.max(1, Math.ceil(periods.length / 8));
  periods.forEach((period, index) => {
    if (index % labelStep !== 0 && index !== periods.length - 1) return;
    parts.push(`<text x="${labelX(index)}" y="${geometry.top + geometry.innerHeight + 24}" text-anchor="middle" class="analytics-axis-text">${escapeHtml(formatReportPeriod(period, reportState.granularity))}</text>`);
  });
  return parts.join('');
}

function renderLineChart(periods, series) {
  const geometry = analyticsChartGeometry(periods, series);
  const paths = series.map(item => {
    const points = item.values.map((value, index) => `${geometry.lineX(index)},${geometry.y(value)}`).join(' ');
    const dots = item.values.map((value, index) => `<circle cx="${geometry.lineX(index)}" cy="${geometry.y(value)}" r="3" fill="${item.color}" class="analytics-point"><title>${escapeHtml(`${item.label} · ${formatReportPeriod(periods[index], reportState.granularity)}: ${formatMoney(value)}`)}</title></circle>`).join('');
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />${dots}`;
  }).join('');
  return `<svg viewBox="0 0 ${ANALYTICS_CHART_WIDTH} ${ANALYTICS_CHART_HEIGHT}" role="img" aria-label="${escapeHtml(analyticsChartLabel(periods, series))}" preserveAspectRatio="xMidYMid meet">${analyticsAxisMarkup(periods, geometry, geometry.lineX)}${paths}</svg>`;
}

function renderHistogramChart(periods, series) {
  const geometry = analyticsChartGeometry(periods, series);
  const barWidth = Math.max(2, Math.min(28, (geometry.groupWidth * 0.72) / Math.max(1, series.length)));
  const bars = series.map((item, seriesIndex) => item.values.map((value, index) => {
    const height = (value / geometry.maximum) * geometry.innerHeight;
    const offset = (geometry.groupWidth - barWidth * series.length) / 2;
    const x = geometry.left + index * geometry.groupWidth + offset + seriesIndex * barWidth;
    const y = geometry.top + geometry.innerHeight - height;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(0, height)}" rx="2" fill="${item.color}" class="analytics-bar-rect"><title>${escapeHtml(`${item.label} · ${formatReportPeriod(periods[index], reportState.granularity)}: ${formatMoney(value)}`)}</title></rect>`;
  }).join('')).join('');
  return `<svg viewBox="0 0 ${ANALYTICS_CHART_WIDTH} ${ANALYTICS_CHART_HEIGHT}" role="img" aria-label="${escapeHtml(analyticsChartLabel(periods, series))}" preserveAspectRatio="xMidYMid meet">${analyticsAxisMarkup(periods, geometry, index => geometry.left + (index + 0.5) * geometry.groupWidth)}${bars}</svg>`;
}

function renderAnalyticsLegend(series) {
  return `<div class="analytics-legend">${series.map(item => `<span><i style="background:${item.color}" aria-hidden="true"></i>${escapeHtml(item.label)}</span>`).join('')}</div>`;
}

function renderReport(report) {
  lastReport = report;
  const summary = report.summary || {};
  $('#report-summary').innerHTML = `<article class="admin-metric"><span>Orders in range</span><strong>${Number(summary.orderCount || 0)}</strong></article><article class="admin-metric"><span>Paid / partially refunded</span><strong>${Number(summary.paidOrderCount || 0)}</strong></article><article class="admin-metric"><span>Net order amount</span><strong>${escapeHtml(formatMoney(summary.netRevenue))}</strong></article><article class="admin-metric"><span>Withdrawals in range</span><strong>${escapeHtml(formatMoney(summary.withdrawals))}</strong></article><article class="admin-metric"><span>Net after withdrawals</span><strong>${escapeHtml(formatMoney(summary.netAfterWithdrawals))}</strong></article>`;
  $('#booking-report-summary').textContent = `Bookings in range: ${(report.bookingCounts || []).map(item => `${item.status}: ${item.count}`).join(' · ') || 'none'}`;
  const metricLabel = REPORT_METRIC_LABELS[reportState.metric] || REPORT_METRIC_LABELS.revenue;
  $('#analytics-chart-title').innerHTML = `${escapeHtml(metricLabel)} by ${escapeHtml(reportState.granularity)} <small>(GHS)</small>`;
  const revenueRows = report.revenueByPeriod || [];
  const withdrawalRows = report.withdrawalsByPeriod || [];
  const periods = [...new Set([...revenueRows, ...withdrawalRows].map(item => item.period))];
  const revenueByPeriod = new Map(revenueRows.map(item => [item.period, Number(item.revenue) || 0]));
  const withdrawalsByPeriod = new Map(withdrawalRows.map(item => [item.period, Number(item.withdrawals) || 0]));
  const series = [];
  if (reportState.metric !== 'withdrawals') {
    series.push({ label: 'Revenue', color: '#22c55e', values: periods.map(period => revenueByPeriod.get(period) || 0) });
  }
  if (reportState.metric !== 'revenue') {
    series.push({ label: 'Withdrawals', color: '#f59e0b', values: periods.map(period => withdrawalsByPeriod.get(period) || 0) });
  }
  const chart = $('#analytics-chart');
  const hasData = series.some(item => item.values.some(value => value > 0));
  if (!periods.length || !hasData) {
    chart.innerHTML = '<p class="analytics-empty">No paid orders or withdrawals in this range.</p>';
    return;
  }
  chart.innerHTML = `${reportState.chart === 'histogram' ? renderHistogramChart(periods, series) : renderLineChart(periods, series)}${renderAnalyticsLegend(series)}`;
}

function renderBusinessSettings(settings, canEdit) {
  const form = $('#business-settings-form');
  form.innerHTML = `${settings.map(setting => {
    const exchangeRate = setting.key === 'usd_to_ghs_rate';
    const updatedAt = setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : null;
    const rateStatus = exchangeRate
      ? `<small>${!updatedAt ? 'No exchange rate is configured. Beat checkout is unavailable until one is saved.' : setting.fresh ? `Current rate updated ${escapeHtml(updatedAt)}.` : `STALE: last updated ${escapeHtml(updatedAt)}. Beat checkout is disabled until refreshed.`} Rates expire after 24 hours.</small>`
      : '';
    return `<label>${escapeHtml(setting.label)}<input name="${escapeHtml(setting.key)}" type="number" min="${exchangeRate ? '0.000001' : '0'}" max="${exchangeRate ? '999999.999999' : '100000000'}" step="${exchangeRate ? '0.000001' : '0.01'}" value="${escapeHtml(setting.value)}" ${canEdit ? 'required' : 'disabled'}>${rateStatus}</label>`;
  }).join('')}${canEdit ? '<button class="auth-primary-button" type="submit">Save business settings</button>' : '<p>Only a super-admin can edit business settings.</p>'}`;
}

function renderBookingSettings(settings, canEdit) {
  const form = $('#booking-settings-form');
  if (!form) return;
  const weekdays = [
    ['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3],
    ['Thursday', 4], ['Friday', 5], ['Saturday', 6]
  ];
  const selected = new Set((settings.availableWeekdays || []).map(Number));
  const disabled = canEdit ? '' : 'disabled';
  const sessionMinutes = Number(settings.sessionMinutes) || 140;
  form.innerHTML = `
    <fieldset class="admin-weekdays" ${disabled}>
      <legend>Available weekdays</legend>
      <div class="admin-weekdays-grid">
        ${weekdays.map(([label, value]) => `<label><input type="checkbox" name="availableWeekdays" value="${value}" ${selected.has(value) ? 'checked' : ''} ${disabled}>${label}</label>`).join('')}
      </div>
    </fieldset>
    <div class="admin-settings-grid">
      <label>Open time<input name="openTime" type="time" value="${escapeHtml(settings.openTime || '')}" required ${disabled}></label>
      <label>Close time<input name="closeTime" type="time" value="${escapeHtml(settings.closeTime || '')}" required ${disabled}></label>
      <label>Slot interval (minutes)<input name="slotStepMinutes" type="number" min="5" max="240" step="5" value="${Number(settings.slotStepMinutes) || 20}" required ${disabled}></label>
      <label>Same-day notice (minutes)<input name="sameDayLeadMinutes" type="number" min="0" max="1440" step="5" value="${Number(settings.sameDayLeadMinutes) || 0}" required ${disabled}></label>
      <label>Available from (optional)<input name="availableFrom" type="date" value="${escapeHtml(settings.availableFrom || '')}" ${disabled}></label>
      <label>Available until (optional)<input name="availableUntil" type="date" value="${escapeHtml(settings.availableUntil || '')}" ${disabled}></label>
    </div>
    <p class="admin-form-hint">Each session lasts ${sessionMinutes} minutes and must finish by the close time. Leave the date range blank to allow bookings indefinitely.</p>
    ${canEdit ? '<button class="auth-primary-button" type="submit">Save booking availability</button>' : '<p>Only a super-admin can edit booking availability.</p>'}`;

  const slotForm = $('#booking-availability-form');
  if (slotForm) {
    const closeMinutes = timeToMinutes(settings.closeTime);
    const lastStart = closeMinutes === null ? null : closeMinutes - sessionMinutes;
    slotForm.elements.time.min = settings.openTime || '';
    slotForm.elements.time.max = lastStart !== null && lastStart >= 0 ? minutesToTime(lastStart) : '';
    slotForm.elements.time.step = Math.max(60, (Number(settings.slotStepMinutes) || 20) * 60);
  }
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
}

function minutesToTime(totalMinutes) {
  const value = Number(totalMinutes);
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) return '';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function renderStaff(staff) {
  const container = $('#staff-list');
  container.innerHTML = staff.length ? staff.map(user => `<form class="admin-list-item admin-staff-form" data-staff-id="${Number(user.id)}"><strong>${escapeHtml(user.name)} · ${escapeHtml(user.email)}</strong><p>Current role: ${escapeHtml(user.role)} · added ${escapeHtml(user.created_at || '')}</p><label>New role<select name="role"><option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option><option value="artist" ${user.role === 'artist' ? 'selected' : ''}>Artist (legacy customer role)</option><option value="non_artist" ${user.role === 'non_artist' ? 'selected' : ''}>Non-artist customer (legacy role)</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option><option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super-admin</option></select></label><button type="submit">Update role</button><p class="admin-message" data-staff-message></p></form>`).join('') : staffRecords.length ? '<p>No staff accounts match these filters.</p>' : '<p>No user accounts found.</p>';
}

function renderBeatManagement(beats = dashboardData.beats || []) {
  const container = $('#beat-management-list');
  container.classList.add('admin-beat-grid');
  if (!beats.length) {
    container.innerHTML = dashboardData.beats?.length ? '<p>No beats match these filters.</p>' : '<p>No beats have been added yet.</p>';
    return;
  }
  container.innerHTML = beats.map(beat => {
    const id = Number(beat.id);
    const active = beat.catalog_status === 'published';
    const coverSrc = beat.cover_url || (beat.cover_art ? `${API}/api/uploads/${encodeURIComponent(beat.cover_art)}` : '');
    const cover = coverSrc
      ? `<img class="admin-beat-cover" src="${escapeHtml(coverSrc)}" alt="">`
      : '<div class="admin-beat-cover admin-beat-cover-empty" aria-hidden="true">No cover art</div>';
    return `<article class="admin-card admin-beat-card" data-beat-id="${id}">
      ${cover}
      <div class="admin-beat-card-content">
        <div class="admin-beat-editor-heading"><strong>${escapeHtml(beat.title)}</strong><span class="admin-beat-status ${active ? 'is-active' : ''}">${active ? 'Active' : escapeHtml(beat.catalog_status || 'Unpublished')}</span></div>
        <p class="admin-beat-summary">${escapeHtml(beat.genre || 'Genre not set')}${beat.bpm ? ` · ${escapeHtml(beat.bpm)} BPM` : ''}${beat.musical_key ? ` · ${escapeHtml(beat.musical_key)}` : ''}</p>
        <details class="admin-beat-details">
          <summary>Show details</summary>
          <dl><div><dt>Beat ID</dt><dd>${id}</dd></div><div><dt>Mood</dt><dd>${escapeHtml(beat.mood || 'Not set')}</dd></div><div><dt>Preview length</dt><dd>${escapeHtml(beat.preview_duration_seconds || 'Not set')} sec</dd></div><div><dt>Basic (USD)</dt><dd>${beatPriceUsd(beat.basic_price)}</dd></div><div><dt>Premium (USD)</dt><dd>${beatPriceUsd(beat.premium_price)}</dd></div><div><dt>Unlimited (USD)</dt><dd>${beatPriceUsd(beat.unlimited_price)}</dd></div><div><dt>Exclusive (USD)</dt><dd>${beatPriceUsd(beat.exclusive_price)}</dd></div></dl>
        </details>
        <div class="admin-review-actions admin-beat-actions">
          <button type="button" data-beat-edit>Edit</button>
          <button type="button" data-beat-status="${id}" data-next-status="${active ? 'unpublished' : 'published'}">${active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-beat-delete" data-beat-delete="${id}">Delete</button>
        </div>
        <form class="admin-beat-editor" data-beat-id="${id}" hidden>
          <div class="admin-grid">
            <label>Title<input name="title" value="${escapeHtml(beat.title)}" required></label>
            ${beatSelectMarkup('bpm', 'BPM', beatBpms, beat.bpm, 'Select BPM')}
            <label>Preview seconds<input name="previewDurationSeconds" type="number" min="1" max="3600" value="${escapeHtml(beat.preview_duration_seconds)}"></label>
            ${beatSelectMarkup('musicalKey', 'Key', beatKeys, beat.musical_key, 'Select key')}
            ${beatSelectMarkup('genre', 'Genre', beatGenres, beat.genre, 'Select genre')}
            ${beatSelectMarkup('mood', 'Mood', beatMoods, beat.mood, 'Select mood')}
          </div>
          <div class="admin-grid admin-prices">
            <label>Basic price (USD)<input name="basic" type="number" min="0" step="0.01" value="${escapeHtml(beat.basic_price)}"></label>
            <label>Premium price (USD)<input name="premium" type="number" min="0" step="0.01" value="${escapeHtml(beat.premium_price)}"></label>
            <label>Unlimited price (USD)<input name="unlimited" type="number" min="0" step="0.01" value="${escapeHtml(beat.unlimited_price)}"></label>
            <label>Exclusive price (USD)<input name="exclusive" type="number" min="0" step="0.01" value="${escapeHtml(beat.exclusive_price)}"></label>
          </div>
          <div class="admin-review-actions"><button type="submit">Save changes</button><button type="button" data-beat-cancel>Cancel</button></div>
        </form>
        <p class="admin-message" data-beat-message role="status"></p>
      </div>
    </article>`;
  }).join('');
}

function streamReleasePayload(form) {
  let links;
  try {
    links = JSON.parse(form.elements.links.value);
  } catch {
    throw new Error('Streaming links must be valid JSON.');
  }
  return {
    title: form.elements.title.value,
    artist: form.elements.artist.value,
    credits: form.elements.credits.value.split(/\r?\n/).map(credit => credit.trim()).filter(Boolean),
    coverUrl: form.elements.coverUrl.value,
    coverImage: null,
    links
  };
}

async function streamReleasePayloadWithCover(form) {
  const payload = streamReleasePayload(form);
  payload.coverImage = await fileData(form.elements.coverImage.files[0], 'image', 'Cover image');
  return payload;
}

function streamReleaseCoverSource(coverUrl) {
  const value = String(coverUrl || '');
  return value.startsWith('/api/uploads/') ? `${API}${value}` : value;
}

function clearStreamReleaseCoverPreview(form) {
  const preview = form.querySelector('[data-stream-cover-preview]');
  if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
  if (!preview) return;
  delete preview.dataset.objectUrl;
  preview.removeAttribute('src');
  preview.hidden = true;
}

function renderStreamReleaseManagement(releases = dashboardData.streamReleases || []) {
  const container = $('#stream-release-management-list');
  container.querySelectorAll('[data-stream-cover-preview][data-object-url]').forEach(preview => URL.revokeObjectURL(preview.dataset.objectUrl));
  if (!releases.length) {
    container.innerHTML = dashboardData.streamReleases?.length ? '<p>No stream releases match these filters.</p>' : '<p>No stream releases have been added yet.</p>';
    return;
  }
  container.innerHTML = releases.map(release => {
    const id = Number(release.id);
    const active = release.status === 'published';
    const coverUrl = streamReleaseCoverSource(release.cover_url);
    const cover = coverUrl
      ? `<img class="admin-beat-cover admin-release-cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(release.title)} cover" loading="lazy">`
      : '<div class="admin-beat-cover admin-beat-cover-empty" aria-hidden="true">No cover image</div>';
    return `<article class="admin-card admin-beat-card admin-stream-release-card" data-stream-release-id="${id}">
      ${cover}
      <div class="admin-beat-card-content">
        <div class="admin-beat-editor-heading"><strong>${escapeHtml(release.title)}</strong><span class="admin-beat-status ${active ? 'is-active' : ''}">${active ? 'Active' : 'Inactive'}</span></div>
        <p class="admin-beat-summary">${escapeHtml(release.artist)}</p>
        <details class="admin-beat-details">
          <summary>Show details</summary>
          <p>Release ID: ${id}</p>
          <p><strong>Credits</strong><br>${escapeHtml((release.credits || []).join('\n') || 'No credits added.')}</p>
          <ul>${(release.links || []).map(link => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label || link.platform)}</a> · ${escapeHtml(link.platform)}</li>`).join('')}</ul>
        </details>
        <div class="admin-review-actions admin-beat-actions">
          <button type="button" data-stream-release-edit-toggle>Edit</button>
          <button type="button" data-stream-release-status="${id}" data-next-status="${active ? 'unpublished' : 'published'}">${active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-beat-delete" data-stream-release-delete="${id}">Delete</button>
        </div>
        <form class="admin-form admin-beat-editor admin-stream-release-editor" data-stream-release-id="${id}" hidden>
          <label>Title<input name="title" maxlength="255" value="${escapeHtml(release.title)}" required></label>
          <label>Artist<input name="artist" maxlength="500" value="${escapeHtml(release.artist)}" required></label>
          <label>Credits (one per line)<textarea name="credits" rows="3" maxlength="5200">${escapeHtml((release.credits || []).join('\n'))}</textarea></label>
          <label>Browse cover image<input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp"><span class="admin-field-help">JPG, PNG, or WebP · up to 5 MB</span><img class="admin-beat-cover admin-cover-preview" data-stream-cover-preview alt="Selected cover image preview" hidden></label>
          <label>Or cover image URL<input name="coverUrl" type="url" maxlength="1000" value="${escapeHtml(release.cover_url)}" placeholder="https://... or Images/cover.jpg"></label>
          <label>Streaming links (JSON)<textarea name="links" rows="6" required>${escapeHtml(JSON.stringify(release.links || [], null, 2))}</textarea></label>
          <div class="admin-review-actions"><button type="submit">Save changes</button><button type="button" data-stream-release-edit-cancel>Cancel</button></div>
          <p class="admin-message" data-stream-release-item-message role="status"></p>
        </form>
      </div>
    </article>`;
  }).join('');
}

function activateAdminSection(sectionName, persist = true) {
  const tabs = [...document.querySelectorAll('.admin-tab')];
  const selectedTab = tabs.find(tab => tab.dataset.section === sectionName && !tab.hidden)
    || tabs.find(tab => tab.dataset.section === 'overview');
  if (!selectedTab) return;
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab === selectedTab));
  document.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.adminSection === selectedTab.dataset.section));
  if (persist) sessionStorage.setItem(activeAdminSectionKey, selectedTab.dataset.section);
}

function renderMerchandiseManagement(merchandise = dashboardData.merchandise || []) {
  const container = $('#merchandise-management-list');
  container.classList.add('admin-beat-grid');
  if (!merchandise.length) {
    container.innerHTML = dashboardData.merchandise?.length ? '<p>No merchandise matches these filters.</p>' : '<p>No merchandise has been added yet.</p>';
    return;
  }
  container.innerHTML = merchandise.map(item => {
    const stock = item.stock_quantity === null || item.stock_quantity === undefined ? '' : Number(item.stock_quantity);
    const stockLabel = stock === '' ? 'Unlimited stock' : `${stock} available`;
    const id = Number(item.id);
    const active = item.catalog_status === 'published';
    const photoSrc = item.photo_url || (item.photo ? `${API}/api/uploads/${encodeURIComponent(item.photo)}` : '');
    const photo = photoSrc
      ? `<img class="admin-beat-cover" src="${escapeHtml(photoSrc)}" alt="">`
      : '<div class="admin-beat-cover admin-beat-cover-empty" aria-hidden="true">No photo</div>';
    return `<article class="admin-card admin-beat-card admin-merchandise-card" data-merchandise-card="${id}">
      ${photo}
      <div class="admin-beat-card-content">
        <div class="admin-beat-editor-heading"><strong>${escapeHtml(item.title)}</strong><span class="admin-beat-status ${active ? 'is-active' : ''}">${active ? 'Active' : escapeHtml(item.catalog_status || 'Unpublished')}</span></div>
        <p class="admin-beat-summary">${formatMoney(item.price)} · ${escapeHtml(stockLabel)}</p>
        <details class="admin-beat-details">
          <summary>Show details</summary>
          <p>${escapeHtml(item.description || 'No description provided.')}</p>
          <p>Product ID: ${id}<br>Added: ${escapeHtml(item.created_at || 'Unknown')}</p>
          <form class="admin-inventory-form" data-merchandise-id="${id}">
            <label>Stock quantity (leave blank for unlimited)<input name="stockQuantity" type="number" min="0" step="1" value="${escapeHtml(stock)}"></label>
            <button type="submit">Save inventory</button>
            <p class="admin-message" data-inventory-message role="status"></p>
          </form>
        </details>
        <div class="admin-review-actions admin-beat-actions">
          <button type="button" data-merchandise-edit>Edit</button>
          <button type="button" data-merchandise-status="${id}" data-next-status="${active ? 'unpublished' : 'published'}">${active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="admin-beat-delete" data-merchandise-delete="${id}">Delete</button>
        </div>
        <form class="admin-beat-editor admin-merchandise-editor" data-merchandise-id="${id}" hidden>
          <label>Title<input name="title" value="${escapeHtml(item.title)}" required></label>
          <label>Description<textarea name="description" rows="3">${escapeHtml(item.description || '')}</textarea></label>
          <label>Price (GHS)<input name="price" type="number" min="0" step="0.01" value="${escapeHtml(item.price)}" required></label>
          <label>Replace photo (optional)<input name="photo" type="file" accept="image/*"></label>
          <div class="admin-review-actions"><button type="submit">Save changes</button><button type="button" data-merchandise-cancel>Cancel</button></div>
        </form>
        <p class="admin-message" data-merchandise-message role="status"></p>
      </div>
    </article>`;
  }).join('');
}

function renderAdminNotifications(notifications, unreadCount) {
  const badge = $('#admin-unread-count');
  badge.textContent = unreadCount ? String(unreadCount) : '';
  badge.hidden = !unreadCount;
  const container = $('#admin-notifications-list');
  if (!notifications.length) {
    container.innerHTML = '<p>No administrator notifications yet.</p>';
    return;
  }
  container.innerHTML = notifications.map(item => `<article class="admin-list-item ${item.read_at ? '' : 'admin-notification-unread'}">
    <strong>${escapeHtml(item.title)}</strong><span class="admin-delivery-status">${item.read_at ? 'Read' : 'Unread'}</span>
    <p>${escapeHtml(item.message)}<br>${escapeHtml(item.type)} · ${escapeHtml(item.created_at || '')}</p>
    <div class="admin-review-actions"><button type="button" data-admin-notification-state="${item.read_at ? 'unread' : 'read'}" data-notification-id="${Number(item.id)}">Mark ${item.read_at ? 'unread' : 'read'}</button></div>
  </article>`).join('');
}

function renderEmailDeliveries({ deliveries, counts }) {
  $('#email-delivery-counts').innerHTML = ['pending', 'processing', 'sent', 'failed'].map(status => `<article class="admin-metric"><span>${status} email</span><strong>${Number(counts[status] || 0)}</strong></article>`).join('');
  const container = $('#email-deliveries-list');
  if (!deliveries.length) {
    container.innerHTML = '<p>No email delivery records yet.</p>';
    return;
  }
  container.innerHTML = deliveries.map(item => `<article class="admin-list-item">
    <strong>${escapeHtml(item.template)}<span class="admin-delivery-status">${escapeHtml(item.status)}</span></strong>
    <p>${escapeHtml(item.recipient)} · ${Number(item.attempts)} attempt(s) · queued ${escapeHtml(item.created_at || '')}${item.sent_at ? `<br>Sent ${escapeHtml(item.sent_at)}` : ''}${item.last_error ? `<br>Error: ${escapeHtml(item.last_error)}` : ''}</p>
  </article>`).join('');
}

function renderLicenseRights(definitions) {
  const canEdit = dashboardData.role === 'super_admin';
  const activeDefinitions = definitions.filter(definition => definition.active);
  $('#add-license-button').hidden = !canEdit;
  $('#license-rights-list').classList.add('admin-beat-grid');
  $('#license-rights-list').innerHTML = activeDefinitions.length
    ? activeDefinitions.map(({ type, rights }) => `<article class="admin-card admin-beat-card" data-license-card="${escapeHtml(type)}">
      <div class="admin-beat-card-content">
        <div class="admin-beat-editor-heading"><strong>${escapeHtml(type[0].toUpperCase() + type.slice(1))} license</strong><span class="admin-beat-status is-active">Active</span></div>
        <details class="admin-beat-details">
          <summary>Show details</summary>
          <p>Formats: ${escapeHtml((rights.formats || []).join(', '))}</p>
          <p>Commercial use: ${rights.commercialUse ? 'Allowed' : 'Not allowed'}<br>Distribution: ${rights.distribution ? 'Allowed' : 'Not allowed'}<br>Stems: ${rights.stems ? 'Included' : 'Not included'}<br>Resale prohibited: ${rights.resaleProhibited ? 'Yes' : 'No'}</p>
          <p>Usage limits: ${escapeHtml(JSON.stringify(rights.usageLimits || {}))}</p>
          <p>Distribution rules: ${escapeHtml((rights.distributionRules || []).join('; ') || 'None specified')}</p>
        </details>
        ${canEdit ? `<div class="admin-review-actions admin-beat-actions">
          <button type="button" data-license-edit>Edit</button>
          <button type="button" data-license-status="false">Deactivate</button>
          <button type="button" class="admin-beat-delete" data-license-delete>Delete</button>
        </div>
        <form class="admin-beat-editor" data-license-editor data-license-type="${escapeHtml(type)}" hidden>
          <label>Download formats (comma-separated)<input name="formats" value="${escapeHtml((rights.formats || []).join(', '))}" required></label>
          <label class="license-switch"><input name="commercialUse" type="checkbox" role="switch" ${rights.commercialUse ? 'checked' : ''}><span>Commercial use</span></label>
          <label class="license-switch"><input name="distribution" type="checkbox" role="switch" ${rights.distribution ? 'checked' : ''}><span>Distribution allowed</span></label>
          <label class="license-switch"><input name="resaleProhibited" type="checkbox" role="switch" ${rights.resaleProhibited ? 'checked' : ''}><span>Resale prohibited</span></label>
          <label>Usage limits (JSON; use null for unlimited)<textarea name="usageLimits" rows="3">${escapeHtml(JSON.stringify(rights.usageLimits || {}, null, 2))}</textarea></label>
          <label>Distribution rules (one per line)<textarea name="distributionRules" rows="4">${escapeHtml((rights.distributionRules || []).join('\n'))}</textarea></label>
          <div class="admin-review-actions"><button type="submit">Save changes</button><button type="button" data-license-cancel>Cancel</button></div>
        </form>
        <p class="admin-message" data-license-message role="status"></p>` : ''}
      </div>
    </article>`).join('')
    : '<p>No active license definitions. Use Add License to reactivate a built-in tier.</p>';
  if (!canEdit) $('#license-rights-list').insertAdjacentHTML('afterbegin', '<p>Only a super-admin can manage license definitions.</p>');
  const inactive = definitions.filter(definition => !definition.active);
  const typeSelect = $('#license-form').elements.type;
  typeSelect.innerHTML = inactive.length
    ? inactive.map(definition => `<option value="${escapeHtml(definition.type)}">${escapeHtml(definition.type[0].toUpperCase() + definition.type.slice(1))}</option>`).join('')
    : '<option value="" selected>No inactive built-in licenses</option>';
  typeSelect.disabled = !inactive.length;
  $('#license-form').querySelector('button[type="submit"]').disabled = !inactive.length;
}

async function loadLicenseRights() {
  try {
    const data = await api('/api/admin/license-definitions');
    renderLicenseRights(data.definitions || []);
    message('license-rights-message', '');
  } catch (error) {
    message('license-rights-message', error.message || 'Could not load license definitions.', true);
  }
}

async function loadAdminAlerts() {
  try {
    const notifications = await api('/api/admin/notifications');
    renderAdminNotifications(notifications.notifications || [], Number(notifications.unreadCount || 0));
    $('#admin-alert-message').textContent = '';
  } catch (error) {
    message('admin-alert-message', error.message || 'Could not load administrator alerts.', true);
  }
}

async function loadEmailDeliveries() {
  try {
    const deliveries = await api('/api/admin/email-deliveries');
    renderEmailDeliveries({
      deliveries: deliveries.deliveries || [],
      counts: deliveries.counts || {}
    });
    $('#email-delivery-message').textContent = '';
  } catch (error) {
    message('email-delivery-message', error.message || 'Could not load email delivery status.', true);
  }
}

async function loadReports() {
  const form = $('#report-filter');
  const query = new URLSearchParams();
  if (form.elements.from.value) query.set('from', form.elements.from.value);
  if (form.elements.to.value) query.set('to', form.elements.to.value);
  query.set('granularity', reportState.granularity);
  const requestId = ++reportRequestId;
  try {
    const report = await api(`/api/admin/reports?${query}`);
    if (requestId !== reportRequestId) return;
    renderReport(report);
    $('#report-message').textContent = '';
  } catch (error) {
    if (requestId !== reportRequestId) return;
    message('report-message', error.message || 'Could not load reports.', true);
  }
}

async function loadAuditLogs() {
  const form = $('#audit-filter');
  const query = new URLSearchParams();
  for (const field of ['search', 'action', 'from', 'to']) {
    const value = form.elements[field].value.trim();
    if (value) query.set(field, value);
  }
  try {
    const data = await api(`/api/admin/audit-logs?${query}&limit=100`);
    renderList('audit-list', data.logs || [], 'audit');
    $('#audit-message').textContent = '';
  } catch (error) {
    message('audit-message', error.message || 'Could not load audit logs.', true);
  }
}

async function loadBusinessSettings() {
  try {
    const data = await api('/api/admin/settings');
    renderBusinessSettings(data.settings || [], Boolean(data.canEdit));
    $('#business-settings-message').textContent = '';
  } catch (error) {
    message('business-settings-message', error.message || 'Could not load business settings.', true);
  }
}

async function loadBookingSettings() {
  try {
    const data = await api('/api/admin/bookings/settings');
    renderBookingSettings(data.settings || {}, Boolean(data.canEdit));
    $('#booking-settings-message').textContent = '';
  } catch (error) {
    message('booking-settings-message', error.message || 'Could not load booking availability settings.', true);
  }
}

async function loadStaff() {
  if (dashboardData.role !== 'super_admin') return;
  try {
    const data = await api('/api/admin/staff');
    staffRecords = data.staff || [];
    filterStaff();
    $('#staff-message').textContent = '';
  } catch (error) {
    message('staff-message', error.message || 'Could not load staff accounts.', true);
  }
}

async function loadCertificates() {
  const form = $('#certificate-filter');
  const params = new URLSearchParams(new FormData(form));
  const suffix = params.toString();
  const container = $('#certificate-list');
  container.innerHTML = '<p>Loading certificate records…</p>';
  try {
    const data = await api(`/api/admin/certificates${suffix ? `?${suffix}` : ''}`);
    const certificates = data.certificates || [];
    if (!certificates.length) {
      container.innerHTML = '<p>No certificate records match these filters.</p>';
      return true;
    }
    container.innerHTML = certificates.map(item => {
      const status = String(item.status || 'unknown').toLowerCase();
      const rights = escapeHtml(JSON.stringify(item.rights || {}, null, 2));
      return `<article class="admin-list-item admin-certificate-card" data-certificate-id="${Number(item.id)}">
        <div class="admin-certificate-heading"><div><strong>${escapeHtml(item.beat_title || 'Beat')}</strong><p>${escapeHtml(item.certificate_id)} · ${escapeHtml(item.license_type)} · Order ${escapeHtml(item.order_reference || 'not recorded')}</p><p>${escapeHtml(item.customer_name || 'Customer')} · ${escapeHtml(item.customer_email || 'No email')}</p></div><span class="certificate-status certificate-status-${escapeHtml(status)}">${escapeHtml(status)}</span></div>
        <details class="admin-certificate-rights"><summary>Purchase-time rights</summary><pre>${rights}</pre></details>
        <div class="admin-certificate-actions"><button type="button" data-certificate-details="${Number(item.id)}">Details &amp; history</button><button type="button" data-certificate-pdf="${Number(item.id)}">Download PDF</button>${status === 'valid' ? `<button type="button" data-certificate-action="revoke" data-certificate-id="${Number(item.id)}">Revoke</button>` : ''}${['valid', 'revoked'].includes(status) ? `<button type="button" data-certificate-action="reissue" data-certificate-id="${Number(item.id)}">Reissue</button>` : ''}</div>
        <div class="admin-certificate-detail-panel" data-certificate-detail-panel hidden></div>
      </article>`;
    }).join('');
    message('certificate-admin-message', `${certificates.length} certificate record(s) loaded.`);
    return true;
  } catch (error) {
    container.innerHTML = '';
    message('certificate-admin-message', error.message || 'Could not load certificate records.', true);
    return false;
  }
}

async function loadDashboard() {
  dashboardData = await api('/api/admin/data');
  document.querySelector('[data-section="license-rights"]').hidden = false;
  document.querySelector('[data-admin-section="license-rights"]').hidden = false;
  document.querySelector('[data-section="settings"]').hidden = false;
  document.querySelector('[data-admin-section="settings"]').hidden = false;
  document.querySelector('[data-section="staff"]').hidden = dashboardData.role !== 'super_admin';
  document.querySelector('[data-admin-section="staff"]').hidden = dashboardData.role !== 'super_admin';
  activateAdminSection(sessionStorage.getItem(activeAdminSectionKey) || 'overview', false);
  renderAnalytics(dashboardData.analytics || {});
  filterContent();
  filterSales();
  filterRequests();
  renderList('bookings-list', dashboardData.bookings || [], 'bookings');
  filterOrders();
  renderList('overview-orders', (dashboardData.orders || []).slice(0, 5), 'orders');
  filterReviews();
  filterCustomers();
  filterArtists();
  renderList('withdrawals-list', dashboardData.withdrawals || [], 'withdrawals');
  loadAdminAlerts();
  loadEmailDeliveries();
  loadLicenseRights();
  loadBusinessSettings();
  loadBookingSettings();
  loadStaff();
  loadCertificates();
  if (!$('#report-filter').elements.from.value && !$('#report-filter').elements.to.value) {
    setReportRange(reportState.granularity);
  }
  loadReports();
  loadAuditLogs();
}

function showDashboard() {
  $('#admin-login').hidden = true;
  $('#admin-dashboard').hidden = false;
  loadDashboard().catch(error => {
    if (error.code === 'ADMIN_MFA_REQUIRED') {
      sessionStorage.removeItem('adminToken');
      localStorage.removeItem('adminCsrfToken');
      $('#admin-dashboard').hidden = true;
      $('#admin-login').hidden = false;
      message('admin-login-message', 'Administrator MFA setup is required. Sign in again to enroll.', true);
      return;
    }
    message('admin-login-message', error.message, true);
  });
}

async function restoreAdminSession() {
  try {
    const session = await api('/api/admin/session');
    localStorage.setItem('adminCsrfToken', session.csrfToken);
    showDashboard();
  } catch (error) {
    if (![401, 403].includes(error.status)) message('admin-login-message', error.message, true);
    $('#admin-dashboard').hidden = true;
    $('#admin-login').hidden = false;
  }
}
restoreAdminSession();

function showAdminMfaChallenge(data) {
  sessionStorage.removeItem('adminToken');
  localStorage.removeItem('adminCsrfToken');
  adminMfaChallengeToken = data.challengeToken;
  adminMfaEnrollment = Boolean(data.mfaEnrollmentRequired);
  $('#admin-login').hidden = true;
  $('#admin-mfa-panel').hidden = false;
  $('#admin-mfa-form').hidden = false;
  $('#admin-mfa-recovery').hidden = true;
  $('#admin-mfa-qr').hidden = !adminMfaEnrollment;
  $('#admin-mfa-secret-row').hidden = !adminMfaEnrollment;
  $('#admin-mfa-title').textContent = adminMfaEnrollment ? 'Set up authenticator MFA' : 'Verify your identity';
  $('#admin-mfa-instructions').textContent = adminMfaEnrollment
    ? 'Scan this QR code with an authenticator app, then enter its six-digit code to enable MFA.'
    : 'Enter the current six-digit code from your authenticator app, or use one of your recovery codes.';
  if (adminMfaEnrollment) {
    $('#admin-mfa-qr').src = data.qrCodeDataUrl;
    $('#admin-mfa-secret').textContent = data.secret;
    $('#admin-mfa-code').inputMode = 'numeric';
  } else {
    $('#admin-mfa-qr').removeAttribute('src');
    $('#admin-mfa-code').inputMode = 'text';
  }
  $('#admin-mfa-code').value = '';
  $('#admin-mfa-code').focus();
}

function saveAdminSession(data) {
  sessionStorage.removeItem('adminToken');
  localStorage.setItem('adminCsrfToken', data.csrfToken || '');
  adminMfaChallengeToken = null;
  $('#admin-mfa-panel').hidden = true;
  showDashboard();
}

$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const stopBusy = startButtonBusy(event.submitter || $('#admin-login-form button[type="submit"]'), 'Signing in…');
  if (!stopBusy) return;
  try {
    const data = await fetch(`${API}/api/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#admin-email').value, password: $('#admin-password').value }) }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; });
    $('#admin-password').value = '';
    if (data.mfaRequired || data.mfaEnrollmentRequired) return showAdminMfaChallenge(data);
    saveAdminSession(data);
  } catch (error) { message('admin-login-message', error.message, true); }
  finally { stopBusy(); }
});

$('#admin-mfa-form').addEventListener('submit', async event => {
  event.preventDefault();
  const stopBusy = startButtonBusy(event.submitter || $('#admin-mfa-form button[type="submit"]'), 'Verifying…');
  if (!stopBusy) return;
  try {
    const data = await api('/api/admin/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeToken: adminMfaChallengeToken, code: $('#admin-mfa-code').value })
    });
    if (data.mfaSetupComplete) {
      $('#admin-mfa-form').hidden = true;
      $('#admin-mfa-recovery').hidden = false;
      const list = $('#admin-mfa-recovery-codes');
      list.replaceChildren(...data.recoveryCodes.map(code => {
        const item = document.createElement('li');
        item.textContent = code;
        return item;
      }));
      return;
    }
    saveAdminSession(data);
  } catch (error) {
    message('admin-mfa-message', error.message, true);
  } finally {
    stopBusy();
  }
});

$('#admin-mfa-confirm').addEventListener('click', async event => {
  const stopBusy = startButtonBusy(event.currentTarget, 'Finishing setup…');
  if (!stopBusy) return;
  try {
    const data = await api('/api/admin/mfa/complete', {
      method: 'POST',
      body: JSON.stringify({ challengeToken: adminMfaChallengeToken })
    });
    saveAdminSession(data);
  } catch (error) {
    message('admin-mfa-message', error.message, true);
  } finally {
    stopBusy();
  }
});

$('#admin-logout').addEventListener('click', async event => {
  const stopBusy = startButtonBusy(event.currentTarget, 'Logging out…');
  if (!stopBusy) return;
  await api('/api/admin/logout', { method: 'POST' }).catch(error => {
    console.warn('Admin session could not be invalidated remotely:', error.message);
  }).finally(() => {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminCsrfToken');
    sessionStorage.removeItem(activeAdminSectionKey);
    stopBusy();
    location.reload();
  });
});

document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => {
  activateAdminSection(button.dataset.section);
}));

$('#report-filter').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
  const stopBusy = startButtonBusy(button, 'Running…');
  if (!stopBusy) return;
  try {
    await loadReports();
  } finally {
    stopBusy();
  }
});

document.querySelectorAll('[data-report-granularity]').forEach(button => button.addEventListener('click', () => {
  reportState.granularity = button.dataset.reportGranularity;
  document.querySelectorAll('[data-report-granularity]').forEach(item => item.classList.toggle('active', item === button));
  setReportRange(reportState.granularity);
  loadReports();
}));

document.querySelectorAll('[data-report-metric]').forEach(button => button.addEventListener('click', () => {
  reportState.metric = button.dataset.reportMetric;
  document.querySelectorAll('[data-report-metric]').forEach(item => item.classList.toggle('active', item === button));
  if (lastReport) renderReport(lastReport);
}));

document.querySelectorAll('[data-report-chart]').forEach(button => button.addEventListener('click', () => {
  reportState.chart = button.dataset.reportChart;
  document.querySelectorAll('[data-report-chart]').forEach(item => item.classList.toggle('active', item === button));
  if (lastReport) renderReport(lastReport);
}));

$('#export-report').addEventListener('click', async event => {
  const button = event.currentTarget;
  const stopBusy = startButtonBusy(button, 'Exporting…');
  if (!stopBusy) return;
  const form = $('#report-filter');
  const query = new URLSearchParams();
  if (form.elements.from.value) query.set('from', form.elements.from.value);
  if (form.elements.to.value) query.set('to', form.elements.to.value);
  try {
    const response = await fetch(`${API}/api/admin/reports.csv?${query}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Could not export the filtered report.');
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = 'ultbigboy-report.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    message('report-message', error.message || 'Could not export the filtered report.', true);
  } finally {
    stopBusy();
  }
});

$('#audit-filter').addEventListener('submit', event => {
  event.preventDefault();
  loadAuditLogs();
});

$('#business-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const settings = Object.fromEntries([...form.elements].filter(element => element.name && element.type === 'number').map(element => [element.name, element.value]));
  if (!window.confirm('Save these business settings? Price and exchange-rate changes affect future checkouts and requests.')) return;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
    message('business-settings-message', 'Business settings saved.');
    await loadBusinessSettings();
  } catch (error) {
    message('business-settings-message', error.message || 'Could not save business settings.', true);
  } finally {
    stopBusy();
  }
});

$('#booking-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const availableWeekdays = [...form.querySelectorAll('input[name="availableWeekdays"]:checked')].map(input => Number(input.value));
  if (!availableWeekdays.length) {
    message('booking-settings-message', 'Choose at least one available weekday.', true);
    return;
  }
  const settings = {
    availableWeekdays,
    openTime: form.elements.openTime.value,
    closeTime: form.elements.closeTime.value,
    slotStepMinutes: Number(form.elements.slotStepMinutes.value),
    sameDayLeadMinutes: Number(form.elements.sameDayLeadMinutes.value),
    availableFrom: form.elements.availableFrom.value || '',
    availableUntil: form.elements.availableUntil.value || ''
  };
  if (!window.confirm('Save these booking availability settings? Changes apply to future bookings.')) return;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/bookings/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
    message('booking-settings-message', 'Booking availability saved.');
    await loadBookingSettings();
  } catch (error) {
    message('booking-settings-message', error.message || 'Could not save booking availability.', true);
  } finally {
    stopBusy();
  }
});

$('#staff-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-staff-id]');
  if (!form) return;
  event.preventDefault();
  const role = form.elements.role.value;
  if (!window.confirm(`Change this user's role to ${role}? Their active sessions will be revoked.`)) return;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Updating…');
  if (!stopBusy) return;
  const status = form.querySelector('[data-staff-message]');
  try {
    await api(`/api/admin/staff/${form.dataset.staffId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    await loadStaff();
    message('staff-message', 'Staff role updated and active sessions revoked.');
  } catch (error) {
    status.textContent = error.message || 'Could not update this role.';
    status.classList.add('error');
  } finally {
    stopBusy();
  }
});

$('#admin-notifications-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-admin-notification-state]');
  if (!button) return;
  const stopBusy = startButtonBusy(button, 'Updating…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/notifications/${button.dataset.notificationId}/${button.dataset.adminNotificationState}`, { method: 'PATCH' });
    await loadAdminAlerts();
  } catch (error) {
    message('admin-alert-message', error.message, true);
  } finally {
    stopBusy();
  }
});

$('#license-rights-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-license-editor]');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('[data-license-card]');
  const status = card.querySelector('[data-license-message]');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    let usageLimits;
    try { usageLimits = JSON.parse(form.elements.usageLimits.value); } catch { throw new Error('Usage limits must be valid JSON.'); }
    const definition = {
      formats: form.elements.formats.value.split(',').map(format => format.trim()).filter(Boolean),
      commercialUse: form.elements.commercialUse.checked,
      distribution: form.elements.distribution.checked,
      resaleProhibited: form.elements.resaleProhibited.checked,
      usageLimits,
      distributionRules: form.elements.distributionRules.value.split(/\r?\n/).map(rule => rule.trim()).filter(Boolean)
    };
    await api(`/api/admin/license-rights/${encodeURIComponent(form.dataset.licenseType)}`, { method: 'PUT', body: JSON.stringify(definition) });
    await loadLicenseRights();
  } catch (error) {
    status.textContent = error.message || 'Could not save this license definition.';
    status.classList.add('error');
  } finally {
    stopBusy();
  }
});

$('#license-rights-list').addEventListener('click', async event => {
  const card = event.target.closest('[data-license-card]');
  if (!card) return;
  const editButton = event.target.closest('[data-license-edit]');
  if (editButton) {
    const form = card.querySelector('[data-license-editor]');
    form.hidden = !form.hidden;
    editButton.textContent = form.hidden ? 'Edit' : 'Close editor';
    return;
  }
  if (event.target.closest('[data-license-cancel]')) {
    card.querySelector('[data-license-editor]').hidden = true;
    card.querySelector('[data-license-edit]').textContent = 'Edit';
    return;
  }
  const type = card.dataset.licenseCard;
  const status = card.querySelector('[data-license-message]');
  const statusButton = event.target.closest('[data-license-status]');
  const deleteButton = event.target.closest('[data-license-delete]');
  if (!statusButton && !deleteButton) return;
  if (deleteButton && !window.confirm(`Delete the ${type} license definition? Its custom rights will be removed and the tier deactivated. Rights snapshots already issued to customers will be kept.`)) return;
  if (statusButton && !window.confirm(`Deactivate the ${type} license? It will no longer be offered for new beat purchases.`)) return;
  const actionButton = statusButton || deleteButton;
  const stopBusy = startButtonBusy(actionButton, deleteButton ? 'Deleting…' : 'Deactivating…');
  if (!stopBusy) return;
  try {
    if (deleteButton) {
      await api(`/api/admin/license-definitions/${encodeURIComponent(type)}`, { method: 'DELETE' });
    } else {
      await api(`/api/admin/license-definitions/${encodeURIComponent(type)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false })
      });
    }
    await loadLicenseRights();
  } catch (error) {
    status.textContent = error.message || `Could not update the ${type} license.`;
    status.classList.add('error');
  } finally {
    stopBusy();
  }
});

$('#certificate-filter').addEventListener('submit', event => {
  event.preventDefault();
  loadCertificates();
});

$('#certificate-list').addEventListener('click', async event => {
  const detailsButton = event.target.closest('[data-certificate-details]');
  const pdfButton = event.target.closest('[data-certificate-pdf]');
  const actionButton = event.target.closest('[data-certificate-action]');
  if (!detailsButton && !pdfButton && !actionButton) return;
  const button = detailsButton || pdfButton || actionButton;
  const stopBusy = startButtonBusy(button, actionButton ? 'Working…' : 'Loading…');
  if (!stopBusy) return;
  try {
    if (detailsButton) {
      const card = detailsButton.closest('.admin-certificate-card');
      const panel = card.querySelector('[data-certificate-detail-panel]');
      if (panel.hidden) {
        if (!panel.dataset.loaded) {
          const result = await api(`/api/admin/certificates/${detailsButton.dataset.certificateDetails}`);
          const certificate = result.certificate;
          const history = result.history || [];
          panel.innerHTML = `<h3>Certificate details</h3><p>Status: ${escapeHtml(certificate.status)} · Issued ${escapeHtml(certificate.issued_at || '')} · Terms ${escapeHtml(certificate.terms_version)}</p><p>Verification: <a href="${escapeHtml(certificate.verificationUrl)}" target="_blank" rel="noopener noreferrer">Open public verification</a></p><h4>Administrative history</h4>${history.length ? `<ol>${history.map(entry => `<li><strong>${escapeHtml(entry.action)}</strong> · ${escapeHtml(entry.actor_name || 'System')} · ${escapeHtml(entry.created_at || '')}${entry.reason ? `<p>${escapeHtml(entry.reason)}</p>` : ''}</li>`).join('')}</ol>` : '<p>No history events recorded.</p>'}`;
          panel.dataset.loaded = 'true';
        }
        panel.hidden = false;
        detailsButton.textContent = 'Hide details';
      } else {
        panel.hidden = true;
        detailsButton.textContent = 'Details & history';
      }
    } else if (pdfButton) {
      const response = await fetch(`${API}/api/admin/certificates/${pdfButton.dataset.certificatePdf}/pdf`, {
        credentials: 'include'
      });
      if (!response.ok) {
        let result = {};
        try { result = await response.json(); } catch {}
        throw new Error(result.error || 'Could not download the certificate PDF.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `certificate-${pdfButton.dataset.certificatePdf}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } else {
      const action = actionButton.dataset.certificateAction;
      const reason = window.prompt(`Enter the reason to ${action} this certificate (required):`)?.trim();
      if (!reason) return;
      if (!window.confirm(`${action === 'revoke' ? 'Revoke' : 'Reissue'} this certificate? The action and reason will be recorded.`)) return;
      await api(`/api/admin/certificates/${actionButton.dataset.certificateId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      if (await loadCertificates()) message('certificate-admin-message', `Certificate ${action} completed.`);
    }
  } catch (error) {
    message('certificate-admin-message', error.message || 'Could not complete the certificate action.', true);
  } finally {
    stopBusy();
  }
});

$('#add-license-button').addEventListener('click', () => {
  const formMessage = $('#license-form-message');
  formMessage.textContent = '';
  formMessage.classList.remove('error');
  $('#add-license-dialog').showModal();
  $('#license-form').elements.type.focus();
});

$('#close-add-license').addEventListener('click', () => $('#add-license-dialog').close());

$('#license-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formMessage = $('#license-form-message');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Activating…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/license-definitions', {
      method: 'POST',
      body: JSON.stringify({ type: form.elements.type.value })
    });
    $('#add-license-dialog').close();
    await loadLicenseRights();
  } catch (error) {
    formMessage.textContent = error.message || 'Could not activate this license.';
    formMessage.classList.add('error');
  } finally {
    stopBusy();
  }
});

document.querySelectorAll('[data-content-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-content-type]').forEach(item => item.classList.toggle('active', item === button));
  $('#add-beat-button').hidden = button.dataset.contentType !== 'beat';
  $('#beat-message').hidden = button.dataset.contentType !== 'beat';
  $('#beat-management').hidden = button.dataset.contentType !== 'beat';
  $('#add-merchandise-button').hidden = button.dataset.contentType !== 'merchandise';
  $('#merchandise-message').hidden = button.dataset.contentType !== 'merchandise';
  $('#merchandise-management').hidden = button.dataset.contentType !== 'merchandise';
  $('#add-stream-release-button').hidden = button.dataset.contentType !== 'stream-releases';
  $('#stream-release-message').hidden = button.dataset.contentType !== 'stream-releases';
  $('#stream-release-management').hidden = button.dataset.contentType !== 'stream-releases';
  filterContent();
}));

$('#add-beat-button').addEventListener('click', () => {
  const form = $('#beat-form');
  form.reset();
  clearBeatCoverPreview();
  message('beat-message', '');
  message('beat-form-message', '');
  $('#add-beat-dialog').showModal();
  form.elements.title.focus();
});

$('#close-add-beat').addEventListener('click', () => $('#add-beat-dialog').close());

$('#beat-form').elements.cover.addEventListener('change', event => {
  const file = event.currentTarget.files[0];
  clearBeatCoverPreview();
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    event.currentTarget.value = '';
    message('beat-form-message', 'Cover art must be an image file.', true);
    return;
  }
  beatCoverObjectUrl = URL.createObjectURL(file);
  const preview = $('#beat-cover-preview');
  preview.src = beatCoverObjectUrl;
  preview.hidden = false;
});

$('#add-merchandise-button').addEventListener('click', () => {
  const formMessage = $('#merchandise-form-message');
  formMessage.textContent = '';
  formMessage.classList.remove('error');
  $('#add-merchandise-dialog').showModal();
  $('#merchandise-form').elements.title.focus();
});

$('#close-add-merchandise').addEventListener('click', () => $('#add-merchandise-dialog').close());

$('#add-stream-release-button').addEventListener('click', () => {
  const form = $('#stream-release-form');
  form.reset();
  clearStreamReleaseCoverPreview(form);
  form.elements.links.value = '[{"platform":"Spotify","url":"https://","label":"Listen on Spotify"}]';
  message('stream-release-form-message', '');
  $('#add-stream-release-dialog').showModal();
  form.elements.title.focus();
});

$('#close-add-stream-release').addEventListener('click', () => $('#add-stream-release-dialog').close());

$('#stream-release-form').elements.coverImage.addEventListener('change', event => {
  const form = event.currentTarget.form;
  const preview = form.querySelector('[data-stream-cover-preview]');
  clearStreamReleaseCoverPreview(form);
  const file = event.currentTarget.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    event.currentTarget.value = '';
    message('stream-release-form-message', 'Choose a JPG, PNG, or WebP image up to 5 MB.', true);
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  preview.src = objectUrl;
  preview.dataset.objectUrl = objectUrl;
  preview.hidden = false;
  message('stream-release-form-message', '');
});

$('#stream-release-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Creating…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/stream-releases', { method: 'POST', body: JSON.stringify(await streamReleasePayloadWithCover(form)) });
    $('#add-stream-release-dialog').close();
    message('stream-release-message', 'Stream release created as inactive. Activate it when it is ready to publish.');
    await loadDashboard();
  } catch (error) {
    message('stream-release-form-message', error.message || 'Could not create stream release.', true);
  } finally {
    stopBusy();
  }
});

$('#stream-release-management-list').addEventListener('change', event => {
  if (!event.target.matches('[name="coverImage"]')) return;
  const input = event.target;
  const form = input.form;
  const preview = form.querySelector('[data-stream-cover-preview]');
  clearStreamReleaseCoverPreview(form);
  const file = input.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    input.value = '';
    const statusMessage = form.querySelector('[data-stream-release-item-message]');
    statusMessage.textContent = 'Choose a JPG, PNG, or WebP image up to 5 MB.';
    statusMessage.classList.add('error');
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  preview.src = objectUrl;
  preview.dataset.objectUrl = objectUrl;
  preview.hidden = false;
});

$('#stream-release-management-list').addEventListener('submit', async event => {
  const form = event.target.closest('.admin-stream-release-editor');
  if (!form) return;
  event.preventDefault();
  const statusMessage = form.querySelector('[data-stream-release-item-message]');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/stream-releases/${form.dataset.streamReleaseId}`, {
      method: 'PATCH',
      body: JSON.stringify(await streamReleasePayloadWithCover(form))
    });
    message('stream-release-message', 'Stream release updated.');
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not update stream release.';
    statusMessage.classList.add('error');
  } finally {
    stopBusy();
  }
});

$('#stream-release-management-list').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-stream-release-edit-toggle]');
  const cancelEditButton = event.target.closest('[data-stream-release-edit-cancel]');
  if (editButton || cancelEditButton) {
    const card = (editButton || cancelEditButton).closest('[data-stream-release-id]');
    const form = card.querySelector('.admin-stream-release-editor');
    form.hidden = editButton ? !form.hidden : true;
    if (editButton && !form.hidden) form.elements.title.focus();
    if (cancelEditButton) {
      clearStreamReleaseCoverPreview(form);
      form.reset();
    }
    return;
  }
  const statusButton = event.target.closest('[data-stream-release-status]');
  const deleteButton = event.target.closest('[data-stream-release-delete]');
  const button = statusButton || deleteButton;
  if (!button) return;
  const id = statusButton?.dataset.streamReleaseStatus || deleteButton.dataset.streamReleaseDelete;
  const card = button.closest('[data-stream-release-id]');
  const statusMessage = card.querySelector('[data-stream-release-item-message]');
  if (deleteButton && !window.confirm('Delete this stream release? This cannot be undone.')) return;
  const stopBusy = startButtonBusy(button, deleteButton ? 'Deleting…' : 'Updating…');
  if (!stopBusy) return;
  try {
    if (statusButton) {
      await api(`/api/admin/stream-releases/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusButton.dataset.nextStatus })
      });
      message('stream-release-message', `Stream release ${statusButton.dataset.nextStatus === 'published' ? 'activated' : 'deactivated'}.`);
    } else {
      await api(`/api/admin/stream-releases/${id}`, { method: 'DELETE' });
      message('stream-release-message', 'Stream release deleted.');
    }
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not update stream release.';
    statusMessage.classList.add('error');
    stopBusy();
  }
});

document.querySelectorAll('[data-request-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-request-type]').forEach(item => item.classList.toggle('active', item === button));
  filterRequests();
}));
document.querySelectorAll('[data-sale-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-sale-type]').forEach(item => item.classList.toggle('active', item === button));
  filterSales();
}));
document.querySelectorAll('[data-order-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-order-type]').forEach(item => item.classList.toggle('active', item === button));
  filterOrders(button.dataset.orderType);
}));

$('#orders-list').addEventListener('click', async event => {
  const assignButton = event.target.closest('[data-assign-replacement-slot]');
  const refundButton = event.target.closest('[data-request-booking-refund]');
  const button = assignButton || refundButton;
  if (!button) return;
  const section = button.closest('[data-booking-resolution]');
  const statusMessage = section.querySelector('[data-booking-resolution-message]');
  const reference = section.dataset.bookingResolution;
  const stopBusy = startButtonBusy(button, assignButton ? 'Assigning…' : 'Requesting…');
  if (!stopBusy) return;
  try {
    if (assignButton) {
      const dates = [...section.querySelectorAll('[data-replacement-date]')];
      const times = [...section.querySelectorAll('[data-replacement-time]')];
      const slots = dates.map((input, index) => ({ date: input.value, time: times[index]?.value || '' }));
      if (slots.some(slot => !slot.date || !slot.time)) throw new Error('Choose a replacement date and time for every session.');
      await api(`/api/admin/orders/${encodeURIComponent(reference)}/booking-resolution`, {
        method: 'POST',
        body: JSON.stringify({ action: 'assign_slot', slots })
      });
      message('orders-message', 'Replacement booking assigned and customer notified.');
    } else {
      if (!window.confirm(`Request a full Paystack refund for paid booking ${reference}?`)) return;
      const result = await api(`/api/admin/orders/${encodeURIComponent(reference)}/booking-resolution`, {
        method: 'POST',
        body: JSON.stringify({ action: 'request_refund' })
      });
      message('orders-message', result.resolution === 'refund_pending'
        ? 'Refund request is pending Paystack confirmation.'
        : 'Refund request submitted.');
    }
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not resolve the booking payment.';
    statusMessage.classList.add('error');
  } finally {
    stopBusy();
  }
});

[
  ['content-beat-search', filterContent], ['content-beat-status', filterContent],
  ['content-merchandise-search', filterContent], ['content-merchandise-status', filterContent],
  ['content-release-search', filterContent], ['content-release-status', filterContent],
  ['sales-search', filterSales], ['sales-from', filterSales], ['sales-to', filterSales],
  ['orders-search', filterOrders], ['orders-status', filterOrders],
  ['requests-search', filterRequests], ['requests-status', filterRequests],
  ['reviews-search', filterReviews], ['reviews-status', filterReviews],
  ['customers-search', filterCustomers], ['customers-role', filterCustomers], ['customers-email-status', filterCustomers],
  ['artists-search', filterArtists], ['artists-purchases', filterArtists],
  ['staff-search', filterStaff], ['staff-role', filterStaff]
].forEach(([id, filter]) => {
  const control = document.getElementById(id);
  control.addEventListener(control.tagName === 'INPUT' && control.type === 'search' ? 'input' : 'change', () => filter());
});

let certificateSearchTimer;
$('#certificate-filter').elements.q.addEventListener('input', () => {
  clearTimeout(certificateSearchTimer);
  certificateSearchTimer = setTimeout(loadCertificates, 250);
});
$('#certificate-filter').querySelectorAll('select, input[type="date"]').forEach(control =>
  control.addEventListener('change', loadCertificates)
);

$('#export-orders').addEventListener('click', async event => {
  const button = event.currentTarget;
  const stopBusy = startButtonBusy(button, 'Exporting…');
  if (!stopBusy) return;
  try {
    const response = await fetch(`${API}/api/admin/orders.csv`, { credentials: 'include' });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Could not export orders.');
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = 'ultbigboy-orders.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    message('admin-login-message', error.message, true);
  } finally {
    stopBusy();
  }
});

$('#reviews-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-review-status]');
  if (!button) return;
  if (button.dataset.reviewStatus === 'removed' && !window.confirm('Remove this review from public listings?')) return;
  const card = button.closest('.admin-list-item');
  const reviewId = card.querySelector('[data-review-id]').dataset.reviewId;
  const stopBusy = startButtonBusy(button, 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/reviews/${reviewId}/status`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.reviewStatus }) });
    await loadDashboard();
  } catch (error) {
    card.querySelector('[data-review-message]').textContent = error.message;
    card.querySelector('[data-review-message]').classList.add('error');
    stopBusy();
  }
});

$('#bookings-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-save-booking-status]');
  if (!button) return;
  const card = button.closest('.admin-list-item');
  const select = card.querySelector(`[data-booking-status="${button.dataset.saveBookingStatus}"]`);
  const notes = card.querySelector(`[data-booking-notes="${button.dataset.saveBookingStatus}"]`);
  const statusMessage = card.querySelector('[data-booking-message]');
  if (select.value === 'cancelled' && !window.confirm('Cancel this booking? This sends a cancellation notice to the customer.')) return;
  const stopBusy = startButtonBusy(button, 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/bookings/${button.dataset.saveBookingStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value, notes: notes.value }) });
    statusMessage.textContent = 'Booking status saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
    stopBusy();
  }
});

$('#booking-availability-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    const result = await api('/api/admin/bookings/availability', {
      method: 'POST',
      body: JSON.stringify({ date: form.elements.date.value, time: form.elements.time.value, status: form.elements.status.value })
    });
    message('booking-availability-message', `Slot ${result.date} ${result.time} is ${result.status}.`);
  } catch (error) {
    message('booking-availability-message', error.message || 'Could not update booking availability.', true);
  } finally {
    stopBusy();
  }
});

$('#remove-booking-slot').addEventListener('click', async event => {
  const form = $('#booking-availability-form');
  if (!form.reportValidity()) return;
  if (!window.confirm(`Remove the availability override for ${form.elements.date.value} at ${form.elements.time.value}?`)) return;
  const stopBusy = startButtonBusy(event.currentTarget, 'Removing…');
  if (!stopBusy) return;
  try {
    const query = new URLSearchParams({ date: form.elements.date.value, time: form.elements.time.value });
    await api(`/api/admin/bookings/availability?${query}`, { method: 'DELETE' });
    message('booking-availability-message', 'Booking slot override removed.');
  } catch (error) {
    message('booking-availability-message', error.message || 'Could not remove booking availability.', true);
  } finally {
    stopBusy();
  }
});

$('#beat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving beat…');
  if (!stopBusy) return;
  try {
    const files = await filesFrom(form, [
      { name: 'cover', kind: 'image', label: 'Cover art' },
      { name: 'preview', kind: 'audio', label: 'Tagged preview file' },
      { name: 'mp3', kind: 'audio', label: 'Main MP3' },
      { name: 'wav', kind: 'audio', label: 'WAV file' },
      { name: 'stems', kind: 'audio', label: 'Track stems' }
    ]);
    await api('/api/admin/beats', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, bpm: form.elements.bpm.value, previewDurationSeconds: form.elements.previewDurationSeconds.value, musicalKey: form.elements.musicalKey.value, genre: form.elements.genre.value, mood: form.elements.mood.value, prices: { basic: form.elements.basic.value, premium: form.elements.premium.value, unlimited: form.elements.unlimited.value, exclusive: form.elements.exclusive.value }, files }) });
    form.reset();
    clearBeatCoverPreview();
    message('beat-form-message', '');
    $('#add-beat-dialog').close();
    message('beat-message', 'Beat saved.');
    await loadDashboard();
  } catch (error) { message('beat-form-message', error.message, true); }
  finally { stopBusy(); }
});

$('#beat-management-list').addEventListener('submit', async event => {
  const form = event.target.closest('.admin-beat-editor');
  if (!form) return;
  event.preventDefault();
  const fields = form.elements;
  const statusMessage = form.closest('.admin-beat-card').querySelector('[data-beat-message]');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/beats/${form.dataset.beatId}`, { method: 'PATCH', body: JSON.stringify({
      title: fields.title.value,
      bpm: fields.bpm.value,
      previewDurationSeconds: fields.previewDurationSeconds.value,
      musicalKey: fields.musicalKey.value,
      genre: fields.genre.value,
      mood: fields.mood.value,
      prices: { basic: fields.basic.value, premium: fields.premium.value, unlimited: fields.unlimited.value, exclusive: fields.exclusive.value }
    }) });
    statusMessage.textContent = 'Beat details saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
    stopBusy();
  }
});

$('#beat-management-list').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-beat-edit]');
  const card = event.target.closest('.admin-beat-card');
  if (!card) return;
  if (editButton) {
    const form = card.querySelector('.admin-beat-editor');
    form.hidden = !form.hidden;
    editButton.textContent = form.hidden ? 'Edit' : 'Close editor';
    return;
  }
  if (event.target.closest('[data-beat-cancel]')) {
    card.querySelector('.admin-beat-editor').hidden = true;
    card.querySelector('[data-beat-edit]').textContent = 'Edit';
    return;
  }
  const statusButton = event.target.closest('[data-beat-status]');
  if (statusButton) {
    const statusMessage = card.querySelector('[data-beat-message]');
    const status = statusButton.dataset.nextStatus;
    const verb = status === 'published' ? 'Activate' : 'Deactivate';
    if (!window.confirm(`${verb} "${card.querySelector('.admin-beat-editor [name="title"]').value}"?`)) return;
    const stopBusy = startButtonBusy(statusButton, status === 'published' ? 'Activating…' : 'Deactivating…');
    if (!stopBusy) return;
    try {
      await api(`/api/admin/beats/${statusButton.dataset.beatStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadDashboard();
    } catch (error) {
      statusMessage.textContent = error.message || 'Could not update beat status.';
      statusMessage.classList.add('error');
      stopBusy();
    }
    return;
  }
  const deleteButton = event.target.closest('[data-beat-delete]');
  if (!deleteButton) return;
  if (!window.confirm(`Permanently delete "${card.querySelector('.admin-beat-editor [name="title"]').value}"? This cannot be undone.`)) return;
  const statusMessage = card.querySelector('[data-beat-message]');
  const stopBusy = startButtonBusy(deleteButton, 'Deleting…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/beats/${deleteButton.dataset.beatDelete}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not delete beat.';
    statusMessage.classList.add('error');
    stopBusy();
  }
});

$('#merchandise-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formMessage = $('#merchandise-form-message');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/merchandise', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, description: form.elements.description.value, price: form.elements.price.value, photo: await fileData(form.elements.photo.files[0], 'image', 'Photo') }) });
    form.reset();
    $('#add-merchandise-dialog').close();
    formMessage.textContent = '';
    formMessage.classList.remove('error');
    message('merchandise-message', 'Merchandise saved.');
    await loadDashboard();
  } catch (error) {
    formMessage.textContent = error.message || 'Could not save merchandise.';
    formMessage.classList.add('error');
  } finally {
    stopBusy();
  }
});

$('#merchandise-management-list').addEventListener('submit', async event => {
  const inventoryForm = event.target.closest('.admin-inventory-form');
  if (inventoryForm) {
    event.preventDefault();
    const statusMessage = inventoryForm.querySelector('[data-inventory-message]');
    const value = inventoryForm.elements.stockQuantity.value.trim();
    const stopBusy = startButtonBusy(inventoryForm.querySelector('button[type="submit"]'), 'Saving…');
    if (!stopBusy) return;
    try {
      await api(`/api/admin/merchandise/${inventoryForm.dataset.merchandiseId}/inventory`, {
        method: 'PATCH',
        body: JSON.stringify({ stockQuantity: value === '' ? null : Number(value) })
      });
      statusMessage.textContent = 'Inventory saved.';
      statusMessage.classList.remove('error');
      await loadDashboard();
    } catch (error) {
      statusMessage.textContent = error.message || 'Could not save inventory.';
      statusMessage.classList.add('error');
      stopBusy();
    }
    return;
  }
  const form = event.target.closest('.admin-merchandise-editor');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('.admin-merchandise-card');
  const statusMessage = card.querySelector('[data-merchandise-message]');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/merchandise/${form.dataset.merchandiseId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: form.elements.title.value,
        description: form.elements.description.value,
        price: form.elements.price.value,
        photo: await fileData(form.elements.photo.files[0], 'image', 'Photo')
      })
    });
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not update merchandise.';
    statusMessage.classList.add('error');
    stopBusy();
  }
});

$('#merchandise-management-list').addEventListener('click', async event => {
  const card = event.target.closest('.admin-merchandise-card');
  if (!card) return;
  const editButton = event.target.closest('[data-merchandise-edit]');
  if (editButton) {
    const form = card.querySelector('.admin-merchandise-editor');
    form.hidden = !form.hidden;
    editButton.textContent = form.hidden ? 'Edit' : 'Close editor';
    return;
  }
  if (event.target.closest('[data-merchandise-cancel]')) {
    card.querySelector('.admin-merchandise-editor').hidden = true;
    card.querySelector('[data-merchandise-edit]').textContent = 'Edit';
    return;
  }
  const statusButton = event.target.closest('[data-merchandise-status]');
  if (statusButton) {
    const status = statusButton.dataset.nextStatus;
    const title = card.querySelector('.admin-merchandise-editor [name="title"]').value;
    if (!window.confirm(`${status === 'published' ? 'Activate' : 'Deactivate'} "${title}"?`)) return;
    const stopBusy = startButtonBusy(statusButton, status === 'published' ? 'Activating…' : 'Deactivating…');
    if (!stopBusy) return;
    try {
      await api(`/api/admin/merchandise/${statusButton.dataset.merchandiseStatus}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await loadDashboard();
    } catch (error) {
      const messageElement = card.querySelector('[data-merchandise-message]');
      messageElement.textContent = error.message || 'Could not update merchandise status.';
      messageElement.classList.add('error');
      stopBusy();
    }
    return;
  }
  const deleteButton = event.target.closest('[data-merchandise-delete]');
  if (!deleteButton) return;
  const title = card.querySelector('.admin-merchandise-editor [name="title"]').value;
  if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
  const stopBusy = startButtonBusy(deleteButton, 'Deleting…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/merchandise/${deleteButton.dataset.merchandiseDelete}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    const messageElement = card.querySelector('[data-merchandise-message]');
    messageElement.textContent = error.message || 'Could not delete merchandise.';
    messageElement.classList.add('error');
    stopBusy();
  }
});

$('#requests-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-request-id]');
  if (!form) return;
  event.preventDefault();
  const statusMessage = form.querySelector('[data-request-message]');
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Saving…');
  if (!stopBusy) return;
  try {
    await api(`/api/admin/requests/${form.dataset.requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: form.elements.status.value,
        quoteGhs: form.elements.quoteGhs.value,
        notes: form.elements.notes.value
      })
    });
    statusMessage.textContent = 'Request saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
    stopBusy();
  }
});

$('#withdrawal-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.confirm(`Record a withdrawal of ${formatMoney(form.elements.amount.value)}?`)) return;
  const stopBusy = startButtonBusy(form.querySelector('button[type="submit"]'), 'Recording…');
  if (!stopBusy) return;
  try {
    await api('/api/admin/withdraw', { method: 'POST', body: JSON.stringify({ amount: form.elements.amount.value, password: form.elements.password.value }) });
    form.reset();
    message('withdrawal-message', 'Withdrawal recorded.');
  } catch (error) {
    message('withdrawal-message', error.message, true);
  } finally {
    stopBusy();
  }
});

$('#artists-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-view-artist-purchases]');
  if (!button) return;
  renderArtistPurchasesDialog(button.dataset.viewArtistPurchases);
});

$('#close-artist-purchases').addEventListener('click', () => {
  $('#artist-purchases-dialog').close();
});

$('#artist-purchases-dialog').addEventListener('click', event => {
  if (event.target === $('#artist-purchases-dialog')) $('#artist-purchases-dialog').close();
});
