const configuredApiUrl = window.ULTBIGBOY_API_URL || new URLSearchParams(location.search).get('apiBaseUrl');
const API = configuredApiUrl || `${location.protocol}//${location.hostname}:3000`;
let adminToken = sessionStorage.getItem('adminToken');
let dashboardData = { sales: [], requests: [], orders: [], reviews: [], artists: [], withdrawals: [], analytics: {} };
const activeAdminSectionKey = 'adminActiveSection';

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
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(adminToken ? { Authorization: 'Bearer ' + adminToken } : {}), ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function filesFrom(form, names) {
  const result = {};
  for (const name of names) result[name] = await fileData(form.elements[name].files[0]);
  return result;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatMoney = value => `GHS ${Number(value || 0).toFixed(2)}`;
populateBeatSelectors($('#beat-form'));

function renderList(elementId, items, type) {
  const container = document.getElementById(elementId);
  if (!items.length) {
    container.innerHTML = '<p>No records yet.</p>';
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
    if (type === 'requests') return `<article class="admin-list-item"><strong>${escapeHtml(item.product_name || 'Request')}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${item.requested_license ? `License: ${escapeHtml(item.requested_license[0].toUpperCase() + item.requested_license.slice(1))} · ${formatMoney(item.license_price_gsh)}<br>` : ''}${escapeHtml(item.details || 'No details provided')}<br>${item.sample_link ? `<a href="${escapeHtml(item.sample_link)}" target="_blank" rel="noopener noreferrer">Open sample link</a><br>` : ''}${item.sample_audio_file ? `<a href="${API}/api/uploads/${encodeURIComponent(item.sample_audio_file)}" target="_blank" rel="noopener noreferrer">Listen to sample audio</a><br>` : ''}Created: ${escapeHtml(item.created_at || '')}</p><form class="admin-request-editor" data-request-id="${Number(item.id)}"><div class="admin-grid"><label>Status<select name="status"><option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option><option value="reviewing" ${item.status === 'reviewing' ? 'selected' : ''}>Reviewing</option><option value="quoted" ${item.status === 'quoted' ? 'selected' : ''}>Quoted</option><option value="accepted" ${item.status === 'accepted' ? 'selected' : ''}>Accepted</option><option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>Rejected</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option></select></label><label>Quote (GHS)<input name="quoteGhs" type="number" min="0" step="0.01" value="${escapeHtml(item.quote_gsh)}"></label></div><label>Admin notes<textarea name="notes" rows="2" maxlength="5000">${escapeHtml(item.admin_notes || '')}</textarea></label><div class="admin-review-actions"><button type="submit">Save request</button></div><p class="admin-message" data-request-message></p></form></article>`;
    if (type === 'orders') {
      const itemsText = item.items.map(orderItem => `${orderItem.name || 'Item'}${orderItem.license ? ` (${orderItem.license} license)` : ''}`).join(', ') || 'No line items';
      return `<article class="admin-list-item"><strong>${escapeHtml(item.reference)} · ${escapeHtml(item.status)}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${escapeHtml(itemsText)}<br>${formatMoney(item.amount)} · ${escapeHtml(item.created_at || '')}</p></article>`;
    }
    if (type === 'reviews') return `<article class="admin-list-item"><strong>${escapeHtml(item.customer_name)} · ${'★'.repeat(Number(item.rating) || 0)}${'☆'.repeat(Math.max(0, 5 - Number(item.rating || 0)))}</strong><p>${escapeHtml(item.customer_email)} · ${escapeHtml(item.status)} · ${escapeHtml(item.created_at || '')}</p><blockquote>${escapeHtml(item.review_text)}</blockquote><div class="admin-review-actions">${item.status === 'pending' ? '<button type="button" data-review-status="approved">Approve</button><button type="button" data-review-status="rejected">Reject</button>' : ''}${item.status !== 'removed' ? '<button type="button" data-review-status="removed">Remove</button>' : ''}</div><p class="admin-message" data-review-message></p><span data-review-id="${Number(item.id)}" hidden></span></article>`;
    if (type === 'customers') return `<article class="admin-list-item"><strong>${escapeHtml(item.name || item.artist_name || 'Customer')}</strong><p>${escapeHtml(item.email)} · ${escapeHtml(item.role)} · joined ${escapeHtml(item.created_at || '')} · email ${item.email_verified_at ? 'verified' : 'unverified'}</p></article>`;
    if (type === 'artists') {
      const purchases = item.purchases.length ? item.purchases.map(purchase => `<li>${escapeHtml(purchase.beat_title)} · ${escapeHtml(purchase.license)} license · ${formatMoney(Number(purchase.amount) * 10)} · ${escapeHtml(purchase.purchased_at || '')}</li>`).join('') : '<li>No beat purchases yet.</li>';
      return `<article class="admin-list-item"><strong>${escapeHtml(item.artist_name || item.name)}</strong><p>${escapeHtml(item.email)} · ${item.purchases.length} license purchase(s)</p><ul>${purchases}</ul></article>`;
    }
    if (type === 'withdrawals') return `<article class="admin-list-item"><strong>${formatMoney(item.amount)}</strong><p>${escapeHtml(item.created_at || '')}</p></article>`;
    if (type === 'audit') return `<article class="admin-list-item"><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.actor_email || 'System')} · ${escapeHtml(item.entity_type || 'event')}${item.entity_id ? ` #${escapeHtml(item.entity_id)}` : ''} · ${escapeHtml(item.created_at || '')}</p><small>${escapeHtml(item.details_json || '')}</small></article>`;
    return '';
  }).join('');
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
  const monthlySales = analytics.monthlySales || [];
  const maximum = Math.max(1, ...monthlySales.map(month => Number(month.amount) || 0));
  $('#analytics-chart').innerHTML = monthlySales.length ? monthlySales.map(month => `<div class="analytics-bar"><div class="analytics-bar-track"><span style="height:${Math.max(4, Number(month.amount) / maximum * 100)}%" title="${formatMoney(month.amount)}"></span></div><strong>${escapeHtml(formatMoney(month.amount))}</strong><small>${escapeHtml(month.month)}</small></div>`).join('') : '<p>No paid orders to chart yet.</p>';
}

function dateInputValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function renderReport(report) {
  const months = report.revenueByMonth || [];
  const maximum = Math.max(1, ...months.map(month => Number(month.revenue) || 0));
  $('#analytics-chart').innerHTML = months.length ? months.map(month => `<div class="analytics-bar"><div class="analytics-bar-track"><span style="height:${Math.max(4, Number(month.revenue) / maximum * 100)}%" title="${formatMoney(month.revenue)}"></span></div><strong>${escapeHtml(formatMoney(month.revenue))}</strong><small>${escapeHtml(month.month)}</small></div>`).join('') : '<p>No paid orders in this date range.</p>';
  const summary = report.summary || {};
  $('#report-summary').innerHTML = `<article class="admin-metric"><span>Orders in range</span><strong>${Number(summary.orderCount || 0)}</strong></article><article class="admin-metric"><span>Paid / partially refunded</span><strong>${Number(summary.paidOrderCount || 0)}</strong></article><article class="admin-metric"><span>Net order amount</span><strong>${escapeHtml(formatMoney(summary.netRevenue))}</strong></article>`;
  $('#booking-report-summary').textContent = `Bookings in range: ${(report.bookingCounts || []).map(item => `${item.status}: ${item.count}`).join(' · ') || 'none'}`;
}

function renderBusinessSettings(settings, canEdit) {
  const form = $('#business-settings-form');
  form.innerHTML = `${settings.map(setting => `<label>${escapeHtml(setting.label)}<input name="${escapeHtml(setting.key)}" type="number" min="0" max="100000000" step="0.01" value="${escapeHtml(setting.value)}" ${canEdit ? 'required' : 'disabled'}></label>`).join('')}${canEdit ? '<button class="auth-primary-button" type="submit">Save business settings</button>' : '<p>Only a super-admin can edit business settings.</p>'}`;
}

function renderStaff(staff) {
  const container = $('#staff-list');
  container.innerHTML = staff.length ? staff.map(user => `<form class="admin-list-item admin-staff-form" data-staff-id="${Number(user.id)}"><strong>${escapeHtml(user.name)} · ${escapeHtml(user.email)}</strong><p>Current role: ${escapeHtml(user.role)} · added ${escapeHtml(user.created_at || '')}</p><label>New role<select name="role"><option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option><option value="artist" ${user.role === 'artist' ? 'selected' : ''}>Artist (legacy customer role)</option><option value="non_artist" ${user.role === 'non_artist' ? 'selected' : ''}>Non-artist customer (legacy role)</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option><option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super-admin</option></select></label><button type="submit">Update role</button><p class="admin-message" data-staff-message></p></form>`).join('') : '<p>No user accounts found.</p>';
}

function renderBeatManagement() {
  const beats = dashboardData.beats || [];
  const container = $('#beat-management-list');
  container.classList.add('admin-beat-grid');
  if (!beats.length) {
    container.innerHTML = '<p>No beats have been added yet.</p>';
    return;
  }
  container.innerHTML = beats.map(beat => {
    const id = Number(beat.id);
    const active = beat.catalog_status === 'published';
    const cover = beat.cover_art
      ? `<img class="admin-beat-cover" src="${API}/api/uploads/${encodeURIComponent(beat.cover_art)}" alt="">`
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

function activateAdminSection(sectionName, persist = true) {
  const tabs = [...document.querySelectorAll('.admin-tab')];
  const selectedTab = tabs.find(tab => tab.dataset.section === sectionName && !tab.hidden)
    || tabs.find(tab => tab.dataset.section === 'overview');
  if (!selectedTab) return;
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab === selectedTab));
  document.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.adminSection === selectedTab.dataset.section));
  if (persist) sessionStorage.setItem(activeAdminSectionKey, selectedTab.dataset.section);
}

function renderMerchandiseManagement() {
  const container = $('#merchandise-management-list');
  const merchandise = dashboardData.merchandise || [];
  container.classList.add('admin-beat-grid');
  if (!merchandise.length) {
    container.innerHTML = '<p>No merchandise has been added yet.</p>';
    return;
  }
  container.innerHTML = merchandise.map(item => {
    const stock = item.stock_quantity === null || item.stock_quantity === undefined ? '' : Number(item.stock_quantity);
    const stockLabel = stock === '' ? 'Unlimited stock' : `${stock} available`;
    const id = Number(item.id);
    const active = item.catalog_status === 'published';
    const photo = item.photo
      ? `<img class="admin-beat-cover" src="${API}/api/uploads/${encodeURIComponent(item.photo)}" alt="">`
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
    const [notifications, deliveries] = await Promise.all([
      api('/api/admin/notifications'),
      api('/api/admin/email-deliveries')
    ]);
    renderAdminNotifications(notifications.notifications || [], Number(notifications.unreadCount || 0));
    renderEmailDeliveries({
      deliveries: deliveries.deliveries || [],
      counts: deliveries.counts || {}
    });
    $('#admin-alert-message').textContent = '';
  } catch (error) {
    message('admin-alert-message', error.message || 'Could not load administrator alerts.', true);
  }
}

async function loadReports() {
  const form = $('#report-filter');
  const query = new URLSearchParams();
  if (form.elements.from.value) query.set('from', form.elements.from.value);
  if (form.elements.to.value) query.set('to', form.elements.to.value);
  try {
    const report = await api(`/api/admin/reports?${query}`);
    renderReport(report);
    $('#report-message').textContent = '';
  } catch (error) {
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

async function loadStaff() {
  if (dashboardData.role !== 'super_admin') return;
  try {
    const data = await api('/api/admin/staff');
    renderStaff(data.staff || []);
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
  renderBeatManagement();
  renderMerchandiseManagement();
  renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === 'beat'), 'sales');
  renderList('requests-list', dashboardData.requests.filter(item => item.request_type === 'beat'), 'requests');
  renderList('bookings-list', dashboardData.bookings || [], 'bookings');
  renderList('orders-list', dashboardData.orders || [], 'orders');
  renderList('overview-orders', (dashboardData.orders || []).slice(0, 5), 'orders');
  renderList('reviews-list', dashboardData.reviews || [], 'reviews');
  renderList('customers-list', dashboardData.customers || [], 'customers');
  renderList('artists-list', dashboardData.artists || [], 'artists');
  renderList('withdrawals-list', dashboardData.withdrawals || [], 'withdrawals');
  loadAdminAlerts();
  loadLicenseRights();
  loadBusinessSettings();
  loadStaff();
  loadCertificates();
  if (!$('#report-filter').elements.from.value || !$('#report-filter').elements.to.value) {
    const today = new Date();
    $('#report-filter').elements.to.value = dateInputValue(today);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    $('#report-filter').elements.from.value = dateInputValue(monthAgo);
  }
  loadReports();
  loadAuditLogs();
  document.querySelectorAll('[data-sale-type]').forEach(button => {
    const type = button.dataset.saleType;
    if (button.classList.contains('active')) renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === type), 'sales');
  });
  renderList('orders-list', filterOrders('all'), 'orders');
}

function filterOrders(type) {
  if (type === 'all') return dashboardData.orders || [];
  return (dashboardData.orders || []).filter(order => order.items.some(item => item.type === type));
}

function showDashboard() {
  $('#admin-login').hidden = true;
  $('#admin-dashboard').hidden = false;
  loadDashboard().catch(error => message('admin-login-message', error.message, true));
}
if (adminToken) showDashboard();

$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await fetch(`${API}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#admin-email').value, password: $('#admin-password').value }) }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; });
    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    showDashboard();
  } catch (error) { message('admin-login-message', error.message, true); }
});

$('#admin-logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(error => {
    console.warn('Admin session could not be invalidated remotely:', error.message);
  }).finally(() => {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem(activeAdminSectionKey);
    location.reload();
  });
});

document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => {
  activateAdminSection(button.dataset.section);
}));

$('#report-filter').addEventListener('submit', event => {
  event.preventDefault();
  loadReports();
});

$('#export-report').addEventListener('click', async event => {
  const button = event.currentTarget;
  const form = $('#report-filter');
  const query = new URLSearchParams();
  if (form.elements.from.value) query.set('from', form.elements.from.value);
  if (form.elements.to.value) query.set('to', form.elements.to.value);
  button.disabled = true;
  try {
    const response = await fetch(`${API}/api/admin/reports.csv?${query}`, {
      credentials: 'include',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
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
    button.disabled = false;
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
  if (!window.confirm('Save these business price changes? They affect future checkouts and requests.')) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
    message('business-settings-message', 'Business settings saved.');
    await loadBusinessSettings();
  } catch (error) {
    message('business-settings-message', error.message || 'Could not save business settings.', true);
  } finally {
    button.disabled = false;
  }
});

$('#staff-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-staff-id]');
  if (!form) return;
  event.preventDefault();
  const role = form.elements.role.value;
  if (!window.confirm(`Change this user's role to ${role}? Their active sessions will be revoked.`)) return;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-staff-message]');
  button.disabled = true;
  try {
    await api(`/api/admin/staff/${form.dataset.staffId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    await loadStaff();
    message('staff-message', 'Staff role updated and active sessions revoked.');
  } catch (error) {
    status.textContent = error.message || 'Could not update this role.';
    status.classList.add('error');
    button.disabled = false;
  }
});

$('#admin-notifications-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-admin-notification-state]');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/admin/notifications/${button.dataset.notificationId}/${button.dataset.adminNotificationState}`, { method: 'PATCH' });
    await loadAdminAlerts();
  } catch (error) {
    button.disabled = false;
    message('admin-alert-message', error.message, true);
  }
});

$('#license-rights-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-license-editor]');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('[data-license-card]');
  const status = card.querySelector('[data-license-message]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
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
    button.disabled = false;
    status.textContent = error.message || 'Could not save this license definition.';
    status.classList.add('error');
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
  actionButton.disabled = true;
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
    actionButton.disabled = false;
    status.textContent = error.message || `Could not update the ${type} license.`;
    status.classList.add('error');
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
  button.disabled = true;
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
        credentials: 'include',
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
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
    button.disabled = false;
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
  const button = form.querySelector('button[type="submit"]');
  const formMessage = $('#license-form-message');
  button.disabled = true;
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
    button.disabled = false;
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
}));

$('#add-beat-button').addEventListener('click', () => {
  const form = $('#beat-form');
  form.reset();
  clearBeatCoverPreview();
  message('beat-message', '');
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
    message('beat-message', 'Cover art must be an image file.', true);
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

document.querySelectorAll('[data-request-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-request-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('requests-list', dashboardData.requests.filter(item => item.request_type === button.dataset.requestType), 'requests'); }));
document.querySelectorAll('[data-sale-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-sale-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === button.dataset.saleType), 'sales'); }));
document.querySelectorAll('[data-order-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-order-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('orders-list', filterOrders(button.dataset.orderType), 'orders'); }));

$('#export-orders').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch(`${API}/api/admin/orders.csv`, { credentials: 'include', headers: { Authorization: `Bearer ${adminToken || ''}` } });
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
    button.disabled = false;
  }
});

$('#reviews-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-review-status]');
  if (!button) return;
  if (button.dataset.reviewStatus === 'removed' && !window.confirm('Remove this review from public listings?')) return;
  const card = button.closest('.admin-list-item');
  const reviewId = card.querySelector('[data-review-id]').dataset.reviewId;
  button.disabled = true;
  try {
    await api(`/api/admin/reviews/${reviewId}/status`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.reviewStatus }) });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    card.querySelector('[data-review-message]').textContent = error.message;
    card.querySelector('[data-review-message]').classList.add('error');
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
  button.disabled = true;
  try {
    await api(`/api/admin/bookings/${button.dataset.saveBookingStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value, notes: notes.value }) });
    statusMessage.textContent = 'Booking status saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
  }
});

$('#booking-availability-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/admin/bookings/availability', {
      method: 'POST',
      body: JSON.stringify({ date: form.elements.date.value, time: form.elements.time.value, status: form.elements.status.value })
    });
    message('booking-availability-message', `Slot ${result.date} ${result.time} is ${result.status}.`);
  } catch (error) {
    message('booking-availability-message', error.message || 'Could not update booking availability.', true);
  } finally {
    button.disabled = false;
  }
});

$('#remove-booking-slot').addEventListener('click', async () => {
  const form = $('#booking-availability-form');
  if (!form.reportValidity()) return;
  if (!window.confirm(`Remove the availability override for ${form.elements.date.value} at ${form.elements.time.value}?`)) return;
  const button = $('#remove-booking-slot');
  button.disabled = true;
  try {
    const query = new URLSearchParams({ date: form.elements.date.value, time: form.elements.time.value });
    await api(`/api/admin/bookings/availability?${query}`, { method: 'DELETE' });
    message('booking-availability-message', 'Booking slot override removed.');
  } catch (error) {
    message('booking-availability-message', error.message || 'Could not remove booking availability.', true);
  } finally {
    button.disabled = false;
  }
});

$('#beat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const files = await filesFrom(form, ['cover', 'preview', 'mp3', 'wav', 'stems']);
    await api('/api/admin/beats', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, bpm: form.elements.bpm.value, previewDurationSeconds: form.elements.previewDurationSeconds.value, musicalKey: form.elements.musicalKey.value, genre: form.elements.genre.value, mood: form.elements.mood.value, prices: { basic: form.elements.basic.value, premium: form.elements.premium.value, unlimited: form.elements.unlimited.value, exclusive: form.elements.exclusive.value }, files }) });
    form.reset();
    clearBeatCoverPreview();
    $('#add-beat-dialog').close();
    message('beat-message', 'Beat saved.');
    await loadDashboard();
  } catch (error) { message('beat-message', error.message, true); }
});

$('#beat-management-list').addEventListener('submit', async event => {
  const form = event.target.closest('.admin-beat-editor');
  if (!form) return;
  event.preventDefault();
  const fields = form.elements;
  const statusMessage = form.closest('.admin-beat-card').querySelector('[data-beat-message]');
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
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
    saveButton.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
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
    statusButton.disabled = true;
    try {
      await api(`/api/admin/beats/${statusButton.dataset.beatStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadDashboard();
    } catch (error) {
      statusButton.disabled = false;
      statusMessage.textContent = error.message || 'Could not update beat status.';
      statusMessage.classList.add('error');
    }
    return;
  }
  const deleteButton = event.target.closest('[data-beat-delete]');
  if (!deleteButton) return;
  if (!window.confirm(`Permanently delete "${card.querySelector('.admin-beat-editor [name="title"]').value}"? This cannot be undone.`)) return;
  deleteButton.disabled = true;
  const statusMessage = card.querySelector('[data-beat-message]');
  try {
    await api(`/api/admin/beats/${deleteButton.dataset.beatDelete}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    deleteButton.disabled = false;
    statusMessage.textContent = error.message || 'Could not delete beat.';
    statusMessage.classList.add('error');
  }
});

$('#merchandise-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formMessage = $('#merchandise-form-message');
  submitButton.disabled = true;
  try {
    await api('/api/admin/merchandise', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, description: form.elements.description.value, price: form.elements.price.value, photo: await fileData(form.elements.photo.files[0]) }) });
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
    submitButton.disabled = false;
  }
});

$('#merchandise-management-list').addEventListener('submit', async event => {
  const inventoryForm = event.target.closest('.admin-inventory-form');
  if (inventoryForm) {
    event.preventDefault();
    const button = inventoryForm.querySelector('button[type="submit"]');
    const statusMessage = inventoryForm.querySelector('[data-inventory-message]');
    const value = inventoryForm.elements.stockQuantity.value.trim();
    button.disabled = true;
    try {
      await api(`/api/admin/merchandise/${inventoryForm.dataset.merchandiseId}/inventory`, {
        method: 'PATCH',
        body: JSON.stringify({ stockQuantity: value === '' ? null : Number(value) })
      });
      statusMessage.textContent = 'Inventory saved.';
      statusMessage.classList.remove('error');
      await loadDashboard();
    } catch (error) {
      button.disabled = false;
      statusMessage.textContent = error.message || 'Could not save inventory.';
      statusMessage.classList.add('error');
    }
    return;
  }
  const form = event.target.closest('.admin-merchandise-editor');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('.admin-merchandise-card');
  const button = form.querySelector('button[type="submit"]');
  const statusMessage = card.querySelector('[data-merchandise-message]');
  button.disabled = true;
  try {
    await api(`/api/admin/merchandise/${form.dataset.merchandiseId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: form.elements.title.value,
        description: form.elements.description.value,
        price: form.elements.price.value,
        photo: await fileData(form.elements.photo.files[0])
      })
    });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    statusMessage.textContent = error.message || 'Could not update merchandise.';
    statusMessage.classList.add('error');
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
    statusButton.disabled = true;
    try {
      await api(`/api/admin/merchandise/${statusButton.dataset.merchandiseStatus}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await loadDashboard();
    } catch (error) {
      statusButton.disabled = false;
      const messageElement = card.querySelector('[data-merchandise-message]');
      messageElement.textContent = error.message || 'Could not update merchandise status.';
      messageElement.classList.add('error');
    }
    return;
  }
  const deleteButton = event.target.closest('[data-merchandise-delete]');
  if (!deleteButton) return;
  const title = card.querySelector('.admin-merchandise-editor [name="title"]').value;
  if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
  deleteButton.disabled = true;
  try {
    await api(`/api/admin/merchandise/${deleteButton.dataset.merchandiseDelete}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (error) {
    deleteButton.disabled = false;
    const messageElement = card.querySelector('[data-merchandise-message]');
    messageElement.textContent = error.message || 'Could not delete merchandise.';
    messageElement.classList.add('error');
  }
});

$('#requests-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-request-id]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const statusMessage = form.querySelector('[data-request-message]');
  button.disabled = true;
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
    button.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
  }
});

$('#withdrawal-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.confirm(`Record a withdrawal of ${formatMoney(form.elements.amount.value)}?`)) return;
  try { await api('/api/admin/withdraw', { method: 'POST', body: JSON.stringify({ amount: form.elements.amount.value, password: form.elements.password.value }) }); form.reset(); message('withdrawal-message', 'Withdrawal recorded.'); } catch (error) { message('withdrawal-message', error.message, true); }
});
