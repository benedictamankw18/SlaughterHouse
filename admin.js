const API = 'http://localhost:3000';
const previewMode = true;
let adminToken = sessionStorage.getItem('adminToken');
let dashboardData = { sales: [], requests: [], orders: [], reviews: [], artists: [], withdrawals: [], analytics: {} };

const $ = selector => document.querySelector(selector);
const message = (id, text, error = false) => { const element = document.getElementById(id); element.textContent = text; element.classList.toggle('error', error); };

async function api(path, options = {}) {
  if (previewMode) throw new Error('Preview only: API actions are not connected yet.');
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, ...(options.headers || {}) } });
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
      return `<article class="admin-list-item"><strong>${escapeHtml(item.service)}</strong><p>${escapeHtml(item.name)} · ${escapeHtml(item.email)} · ${escapeHtml(item.phone || 'No phone')}<br>Artists: ${escapeHtml(item.artist_count || 1)}${item.song_count ? `<br>Songs: ${escapeHtml(item.song_count)}` : ''}${slotSummary}<br>${escapeHtml(item.details || 'No details provided')}<br>Status: ${escapeHtml(item.status || 'new')}</p></article>`;
    }
    if (type === 'requests') return `<article class="admin-list-item"><strong>${escapeHtml(item.product_name || 'Request')}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${item.requested_license ? `License: ${escapeHtml(item.requested_license[0].toUpperCase() + item.requested_license.slice(1))} · ${formatMoney(item.license_price_gsh)}<br>` : ''}${escapeHtml(item.details || 'No details provided')}<br>${item.sample_link ? `<a href="${escapeHtml(item.sample_link)}" target="_blank" rel="noopener noreferrer">Open sample link</a><br>` : ''}${item.sample_audio_file ? `<a href="${API}/api/uploads/${encodeURIComponent(item.sample_audio_file)}" target="_blank" rel="noopener noreferrer">Listen to sample audio</a><br>` : ''}Status: ${escapeHtml(item.status || 'new')} · ${escapeHtml(item.created_at || '')}</p></article>`;
    if (type === 'orders') {
      const itemsText = item.items.map(orderItem => `${orderItem.name || 'Item'}${orderItem.license ? ` (${orderItem.license} license)` : ''}`).join(', ') || 'No line items';
      return `<article class="admin-list-item"><strong>${escapeHtml(item.reference)} · ${escapeHtml(item.status)}</strong><p>${escapeHtml(item.customer_name)} · ${escapeHtml(item.customer_email)}<br>${escapeHtml(itemsText)}<br>${formatMoney(item.amount)} · ${escapeHtml(item.created_at || '')}</p></article>`;
    }
    if (type === 'reviews') return `<article class="admin-list-item"><strong>${escapeHtml(item.customer_name)} · ${'★'.repeat(Number(item.rating) || 0)}${'☆'.repeat(Math.max(0, 5 - Number(item.rating || 0)))}</strong><p>${escapeHtml(item.customer_email)} · ${escapeHtml(item.status)} · ${escapeHtml(item.created_at || '')}</p><blockquote>${escapeHtml(item.review_text)}</blockquote>${item.status === 'pending' ? `<div class="admin-review-actions"><button type="button" data-review-id="${Number(item.id)}" data-review-status="approved">Approve</button><button type="button" data-review-id="${Number(item.id)}" data-review-status="rejected">Reject</button></div>` : ''}</article>`;
    if (type === 'artists') {
      const purchases = item.purchases.length ? item.purchases.map(purchase => `<li>${escapeHtml(purchase.beat_title)} · ${escapeHtml(purchase.license)} license · ${formatMoney(Number(purchase.amount) * 10)} · ${escapeHtml(purchase.purchased_at || '')}</li>`).join('') : '<li>No beat purchases yet.</li>';
      return `<article class="admin-list-item"><strong>${escapeHtml(item.artist_name || item.name)}</strong><p>${escapeHtml(item.email)} · ${item.purchases.length} license purchase(s)</p><ul>${purchases}</ul></article>`;
    }
    if (type === 'withdrawals') return `<article class="admin-list-item"><strong>${formatMoney(item.amount)}</strong><p>${escapeHtml(item.created_at || '')}</p></article>`;
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

async function loadDashboard() {
  dashboardData = await api('/api/admin/data');
  renderAnalytics(dashboardData.analytics || {});
  renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === 'beat'), 'sales');
  renderList('requests-list', dashboardData.requests.filter(item => item.request_type === 'beat'), 'requests');
  renderList('bookings-list', dashboardData.bookings || [], 'bookings');
  renderList('orders-list', dashboardData.orders || [], 'orders');
  renderList('overview-orders', (dashboardData.orders || []).slice(0, 5), 'orders');
  renderList('reviews-list', dashboardData.reviews || [], 'reviews');
  renderList('artists-list', dashboardData.artists || [], 'artists');
  renderList('withdrawals-list', dashboardData.withdrawals || [], 'withdrawals');
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
  if (previewMode) {
    $('#admin-preview-notice').hidden = false;
    renderAnalytics(dashboardData.analytics);
    renderList('sales-list', [], 'sales');
    renderList('requests-list', [], 'requests');
    renderList('bookings-list', [], 'bookings');
    renderList('orders-list', [], 'orders');
    renderList('overview-orders', [], 'orders');
    renderList('reviews-list', [], 'reviews');
    renderList('artists-list', [], 'artists');
    renderList('withdrawals-list', [], 'withdrawals');
    return;
  }
  loadDashboard().catch(error => message('admin-login-message', error.message, true));
}
if (previewMode ? sessionStorage.getItem('adminPreviewMode') === 'true' : adminToken) showDashboard();

$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (previewMode) {
      const username = $('#admin-email').value.trim().toLowerCase();
      if (username !== 'admin' || $('#admin-password').value !== 'admin') throw new Error('Invalid preview login.');
      sessionStorage.setItem('adminPreviewMode', 'true');
      showDashboard();
      return;
    }
    const data = await fetch(`${API}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('#admin-email').value, password: $('#admin-password').value }) }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; });
    adminToken = data.token;
    sessionStorage.setItem('adminToken', adminToken);
    showDashboard();
  } catch (error) { message('admin-login-message', error.message, true); }
});

$('#admin-logout').addEventListener('click', () => { sessionStorage.removeItem('adminToken'); sessionStorage.removeItem('adminPreviewMode'); location.reload(); });

document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.adminSection === button.dataset.section));
}));

document.querySelectorAll('[data-content-type]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-content-type]').forEach(item => item.classList.toggle('active', item === button));
  $('#beat-form').hidden = button.dataset.contentType !== 'beat';
  $('#merchandise-form').hidden = button.dataset.contentType !== 'merchandise';
}));

document.querySelectorAll('[data-sale-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-sale-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === button.dataset.saleType), 'sales'); }));
document.querySelectorAll('[data-request-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-request-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('requests-list', dashboardData.requests.filter(item => item.request_type === button.dataset.requestType), 'requests'); }));
document.querySelectorAll('[data-sale-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-sale-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('sales-list', dashboardData.sales.filter(item => item.sale_type === button.dataset.saleType), 'sales'); }));
document.querySelectorAll('[data-order-type]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-order-type]').forEach(item => item.classList.toggle('active', item === button)); renderList('orders-list', filterOrders(button.dataset.orderType), 'orders'); }));

$('#reviews-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-review-id]');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/admin/reviews/${button.dataset.reviewId}/status`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.reviewStatus }) });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    message('admin-login-message', error.message, true);
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

$('#merchandise-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/api/admin/merchandise', { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, description: form.elements.description.value, price: form.elements.price.value, photo: await fileData(form.elements.photo.files[0]) }) });
    form.reset(); message('merchandise-message', 'Merchandise saved.');
    loadDashboard();
  } catch (error) { message('merchandise-message', error.message, true); }
});

$('#withdrawal-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api('/api/admin/withdraw', { method: 'POST', body: JSON.stringify({ amount: form.elements.amount.value, password: form.elements.password.value }) }); form.reset(); message('withdrawal-message', 'Withdrawal recorded.'); } catch (error) { message('withdrawal-message', error.message, true); }
});
