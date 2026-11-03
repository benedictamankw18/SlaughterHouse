const configuredApiUrl = window.ULTBIGBOY_API_URL || new URLSearchParams(location.search).get('apiBaseUrl');
const API = configuredApiUrl || `${location.protocol}//${location.hostname}:3000`;
let adminToken = sessionStorage.getItem('adminToken');
let dashboardData = { sales: [], requests: [], orders: [], reviews: [], artists: [], withdrawals: [], analytics: {} };

const $ = selector => document.querySelector(selector);
const message = (id, text, error = false) => { const element = document.getElementById(id); element.textContent = text; element.classList.toggle('error', error); };

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

function renderBeatManagement() {
  const beats = dashboardData.beats || [];
  const container = $('#beat-management-list');
  if (!beats.length) {
    container.innerHTML = '<p>No beats have been added yet.</p>';
    return;
  }
  container.innerHTML = beats.map(beat => `<form class="admin-card admin-beat-editor" data-beat-id="${Number(beat.id)}">
    <div class="admin-beat-editor-heading"><strong>${escapeHtml(beat.title)}</strong><span>Beat #${Number(beat.id)}</span></div>
    <div class="admin-grid">
      <label>Title<input name="title" value="${escapeHtml(beat.title)}" required></label>
      <label>Status<select name="status"><option value="published" ${beat.catalog_status === 'published' ? 'selected' : ''}>Published</option><option value="unpublished" ${beat.catalog_status === 'unpublished' ? 'selected' : ''}>Unpublished</option><option value="archived" ${beat.catalog_status === 'archived' ? 'selected' : ''}>Archived</option></select></label>
      <label>BPM<input name="bpm" type="number" min="1" max="400" value="${escapeHtml(beat.bpm)}"></label>
      <label>Preview seconds<input name="previewDurationSeconds" type="number" min="1" max="3600" value="${escapeHtml(beat.preview_duration_seconds)}"></label>
      <label>Key<input name="musicalKey" value="${escapeHtml(beat.musical_key)}"></label>
      <label>Genre<input name="genre" value="${escapeHtml(beat.genre)}"></label>
      <label>Mood<input name="mood" value="${escapeHtml(beat.mood)}"></label>
    </div>
    <div class="admin-grid admin-prices">
      <label>Basic<input name="basic" type="number" min="0" step="0.01" value="${escapeHtml(beat.basic_price)}"></label>
      <label>Premium<input name="premium" type="number" min="0" step="0.01" value="${escapeHtml(beat.premium_price)}"></label>
      <label>Unlimited<input name="unlimited" type="number" min="0" step="0.01" value="${escapeHtml(beat.unlimited_price)}"></label>
      <label>Exclusive<input name="exclusive" type="number" min="0" step="0.01" value="${escapeHtml(beat.exclusive_price)}"></label>
    </div>
    <div class="admin-review-actions"><button type="submit">Save changes</button><button type="button" data-beat-status="${Number(beat.id)}">Apply status</button></div>
    <p class="admin-message" data-beat-message></p>
  </form>`).join('');
}

function renderMerchandiseManagement() {
  const container = $('#merchandise-management-list');
  const merchandise = dashboardData.merchandise || [];
  if (!merchandise.length) {
    container.innerHTML = '<p>No merchandise has been added yet.</p>';
    return;
  }
  container.innerHTML = merchandise.map(item => {
    const stock = item.stock_quantity === null || item.stock_quantity === undefined ? '' : Number(item.stock_quantity);
    const stockLabel = stock === '' ? 'Unlimited stock' : `${stock} available`;
    return `<article class="admin-list-item"><div class="admin-inventory-heading"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(stockLabel)}</span></div><p>${formatMoney(item.price)}</p><form class="admin-inventory-form" data-merchandise-id="${Number(item.id)}"><label>Stock quantity (leave blank for unlimited)<input name="stockQuantity" type="number" min="0" step="1" value="${escapeHtml(stock)}"></label><button type="submit">Save inventory</button><p class="admin-message" data-inventory-message></p></form></article>`;
  }).join('');
}

async function loadDashboard() {
  dashboardData = await api('/api/admin/data');
  renderAnalytics(dashboardData.analytics || {});
  renderBeatManagement();
  renderMerchandiseManagement();
  renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === 'beat'), 'sales');
  renderList('requests-list', dashboardData.requests.filter(item => item.request_type === 'beat'), 'requests');
  renderList('bookings-list', dashboardData.bookings || [], 'bookings');
  renderList('orders-list', dashboardData.orders || [], 'orders');
  renderList('overview-orders', (dashboardData.orders || []).slice(0, 5), 'orders');
  renderList('reviews-list', dashboardData.reviews || [], 'reviews');
  renderList('artists-list', dashboardData.artists || [], 'artists');
  renderList('withdrawals-list', dashboardData.withdrawals || [], 'withdrawals');
  api('/api/admin/audit-logs?limit=50').then(data => renderList('audit-list', data.logs || [], 'audit')).catch(error => message('admin-login-message', error.message, true));
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
    location.reload();
  });
});

document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.adminSection === button.dataset.section));
}));

document.querySelectorAll('[data-content-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-content-type]').forEach(item => item.classList.toggle('active', item === button));
  $('#beat-form').hidden = button.dataset.contentType !== 'beat';
  $('#merchandise-form').hidden = button.dataset.contentType !== 'merchandise';
  $('#merchandise-management').hidden = button.dataset.contentType !== 'merchandise';
}));

document.querySelectorAll('[data-sale-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-sale-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === button.dataset.saleType), 'sales'); }));
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

$('#beat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const files = await filesFrom(form, ['cover', 'preview', 'mp3', 'wav', 'stems']);
    await api('/api/admin/beats', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, bpm: form.elements.bpm.value, musicalKey: form.elements.musicalKey.value, genre: form.elements.genre.value, mood: form.elements.mood.value, prices: { basic: form.elements.basic.value, premium: form.elements.premium.value, unlimited: form.elements.unlimited.value, exclusive: form.elements.exclusive.value }, files }) });
    form.reset(); message('beat-message', 'Beat saved.');
    loadDashboard();
  } catch (error) { message('beat-message', error.message, true); }
});

$('#beat-management-list').addEventListener('submit', async event => {
  const form = event.target.closest('.admin-beat-editor');
  if (!form) return;
  event.preventDefault();
  const fields = form.elements;
  const statusMessage = form.querySelector('[data-beat-message]');
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
    await api(`/api/admin/beats/${form.dataset.beatId}/status`, { method: 'PATCH', body: JSON.stringify({ status: fields.status.value }) });
    statusMessage.textContent = 'Beat details and status saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    saveButton.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
  }
});

$('#beat-management-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-beat-status]');
  if (!button) return;
  const form = button.closest('.admin-beat-editor');
  const statusMessage = form.querySelector('[data-beat-message]');
  button.disabled = true;
  try {
    await api(`/api/admin/beats/${button.dataset.beatStatus}/status`, { method: 'PATCH', body: JSON.stringify({ status: form.elements.status.value }) });
    statusMessage.textContent = 'Beat status saved.';
    statusMessage.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('error');
  }
});

$('#merchandise-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/api/admin/merchandise', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, description: form.elements.description.value, price: form.elements.price.value, photo: await fileData(form.elements.photo.files[0]) }) });
    form.reset(); message('merchandise-message', 'Merchandise saved.');
    loadDashboard();
  } catch (error) { message('merchandise-message', error.message, true); }
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

$('#merchandise-management-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-merchandise-id]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const statusMessage = form.querySelector('[data-inventory-message]');
  const value = form.elements.stockQuantity.value.trim();
  button.disabled = true;
  try {
    await api(`/api/admin/merchandise/${form.dataset.merchandiseId}/inventory`, {
      method: 'PATCH',
      body: JSON.stringify({ stockQuantity: value === '' ? null : Number(value) })
    });
    statusMessage.textContent = 'Inventory saved.';
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
  try { await api('/api/admin/withdraw', { method: 'POST', body: JSON.stringify({ amount: form.elements.amount.value, password: form.elements.password.value }) }); form.reset(); message('withdrawal-message', 'Withdrawal recorded.'); } catch (error) { message('withdrawal-message', error.message, true); }
});
