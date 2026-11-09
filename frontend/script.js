const API = window.ULTBIGBOY_API_URL || '';
window.ultbigboyCsrfHeaders = method => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase())) return {};
  const token = localStorage.getItem('customerCsrfToken') || localStorage.getItem('adminCsrfToken') || '';
  return token ? { 'X-CSRF-Token': token } : {};
};
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, options = {}) => {
  const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const csrfHeaders = window.ultbigboyCsrfHeaders(method);
  if (Object.keys(csrfHeaders).length) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers || {}).forEach((value, name) => headers.set(name, value));
    if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', csrfHeaders['X-CSRF-Token']);
    options = { ...options, headers };
  }
  return nativeFetch(input, { ...options, credentials: options.credentials || 'include' });
};
// Disables an action button and shows an inline spinner until the returned
// function is called. Calling it twice is safe, which prevents duplicate
// public form submissions from a double click or a repeated submit.
window.startActionBusy = function startActionBusy(button, label = 'Working…') {
  if (!button || button.dataset.busy === 'true') return null;
  const idleHtml = button.innerHTML;
  const wasDisabled = button.disabled;
  button.dataset.busy = 'true';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
  const spinner = document.createElement('span');
  spinner.className = 'action-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'action-busy-label';
  text.textContent = label;
  button.replaceChildren(spinner, text);
  let stopped = false;
  return function stopActionBusy() {
    if (stopped) return;
    stopped = true;
    delete button.dataset.busy;
    button.innerHTML = idleHtml;
    button.disabled = wasDisabled;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
  };
};
function createSubmissionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
const privatePageNames = new Set([
  'admin.html',
  'alerts.html',
  'bookings.html',
  'certificate.html',
  'downloads.html',
  'licenses.html',
  'orders.html',
  'payment-success.html',
  'profile.html',
  'purchases.html',
  'requests.html',
  'wishlist.html'
]);
const currentPageName = location.pathname.split('/').pop() || 'index.html';
const isPrivatePage = privatePageNames.has(currentPageName);
if (location.origin !== 'null' && !isPrivatePage) {
  const canonicalUrl = new URL(location.pathname, location.origin);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl.href;

  let openGraphUrl = document.querySelector('meta[property="og:url"]');
  if (!openGraphUrl) {
    openGraphUrl = document.createElement('meta');
    openGraphUrl.setAttribute('property', 'og:url');
    document.head.append(openGraphUrl);
  }
  openGraphUrl.content = canonicalUrl.href;

  if (!document.querySelector('script[type="application/ld+json"]')) {
    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'UltBigBoy',
      url: new URL('/', location.origin).href,
      publisher: {
        '@type': 'Organization',
        name: 'UltBigBoy',
        url: new URL('/', location.origin).href,
        logo: new URL('/Images/Logo%202.png', document.baseURI).href
      }
    });
    document.head.append(structuredData);
  }
}
// Toggle menu open/close
const menuIcon = document.getElementById('menuIcon');
const dropdownMenu = document.getElementById('dropdownMenu');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function setLoadingState(container, message) {
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  const status = document.createElement('p');
  status.className = 'data-state';
  status.setAttribute('role', 'status');
  status.textContent = message;
  container.replaceChildren(status);
}
function clearLoadingState(container) {
  container?.setAttribute('aria-busy', 'false');
}
function showRetryState(container, message, retry) {
  if (!container) return;
  container.setAttribute('aria-busy', 'false');
  const error = document.createElement('p');
  error.className = 'data-state data-state-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  const button = document.createElement('button');
  button.className = 'catalog-retry-button';
  button.type = 'button';
  button.textContent = 'Try again';
  button.addEventListener('click', retry, { once: true });
  container.replaceChildren(error, button);
}
function showInlineRetry(messageElement, message, retry) {
  if (!messageElement) return;
  messageElement.classList.add('error');
  messageElement.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.className = 'inline-retry-button';
  button.type = 'button';
  button.textContent = 'Try again';
  button.addEventListener('click', retry, { once: true });
  messageElement.replaceChildren(document.createTextNode(`${message} `), button);
}
const siteSearch = document.getElementById('site-search');

siteSearch?.closest('.search-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const query = siteSearch.value.trim();
  if (!query) {
    siteSearch.focus();
    return;
  }
  window.location.href = `/beats.html?search=${encodeURIComponent(query)}#beat-listing`;
});

const loginButton = document.querySelector('.login-button');
let refreshAuthPanel = () => {};
let customerUser = null;
try {
  customerUser = JSON.parse(sessionStorage.getItem('customerUser') || 'null');
} catch {
  customerUser = null;
}

function refreshReviewAccess() {
  const loginPrompt = document.getElementById('review-login-prompt');
  const submitButton = document.getElementById('review-submit-button');
  if (!loginPrompt || !submitButton) return;
  const loggedIn = Boolean(customerUser?.name && customerUser?.email);
  loginPrompt.hidden = loggedIn;
  submitButton.disabled = !loggedIn;
}

if (loginButton) {
  const authPanel = document.createElement('div');
  authPanel.className = 'auth-panel';
  authPanel.hidden = true;
  authPanel.setAttribute('role', 'dialog');
  authPanel.setAttribute('aria-modal', 'true');
  authPanel.setAttribute('aria-labelledby', 'auth-dialog-title');
  authPanel.innerHTML = `<div class="auth-panel-shell">
    <aside class="auth-studio-visual" aria-label="UltBigBoy music studio">
      <a class="auth-studio-brand" href="/index.html"><img src="/Images/Logo 2.png" alt="UltBigBoy home"></a>
      <div class="auth-studio-art" aria-hidden="true">
        <div class="auth-orbit auth-orbit-one"></div>
        <div class="auth-orbit auth-orbit-two"></div>
        <div class="auth-vinyl"><span></span></div>
        <div class="auth-equalizer"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="auth-soundwave"></div>
      </div>
      <p class="section-kicker">YOUR CREATIVE SPACE</p>
      <h2>YOUR SOUND.<br>YOUR NEXT<br><span>BIG MOVE.</span></h2>
      <p class="auth-studio-copy">Beats, studio sessions and everything you need to bring your next idea to life.</p>
      <div class="auth-studio-status"><span></span> THE STUDIO IS OPEN</div>
    </aside>
    <section class="auth-panel-content">
      <div class="auth-panel-header">
        <div><p class="section-kicker">ULTBIGBOY / ACCOUNT</p><h2 id="auth-dialog-title">Welcome back</h2></div>
        <button class="auth-close-button" type="button" aria-label="Close account panel">&#10005;</button>
      </div>
    <div class="auth-view active" data-auth-view="login">
      <form class="auth-form" id="login-form">
        <p class="auth-form-intro">Sign in to pick up where the music left off.</p>
        <label for="login-identifier">Email or phone number</label>
        <input id="login-identifier" name="identifier" type="text" autocomplete="username" placeholder="Email or +233..." required>
        <label for="login-password">Password</label>
        <div class="auth-password-field"><input id="login-password" name="password" type="password" autocomplete="current-password" required><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
        <button class="auth-primary-button" type="submit">Sign in</button>
        <div class="auth-form-links"><button class="auth-link-button" id="forgot-password-button" type="button">Forgot password?</button><button class="auth-link-button" data-auth-switch="signup" type="button">Create an account</button></div>
        <p class="auth-message" id="login-message" role="status" aria-live="polite"></p>
        <button class="auth-link-button" id="resend-verification-button" type="button">Resend verification email</button>
      </form>
    </div>
    <div class="auth-view" data-auth-view="reset-request">
      <form class="auth-form" id="reset-request-form">
        <h3>Reset your password</h3>
        <label for="reset-request-email">Account email</label>
        <input id="reset-request-email" name="email" type="email" autocomplete="email" required>
        <button class="auth-primary-button" type="submit">Send reset link</button>
        <button class="auth-link-button" data-auth-switch="login" type="button">Back to login</button>
        <p class="auth-message" id="reset-request-message" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div class="auth-view" data-auth-view="reset-password">
      <form class="auth-form" id="reset-password-form">
        <h3>Choose a new password</h3>
        <input name="token" type="hidden">
        <label for="reset-new-password">New password</label>
        <div class="auth-password-field"><input id="reset-new-password" name="password" type="password" minlength="12" maxlength="128" pattern="\\S{12,128}" autocomplete="new-password" required><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
        <label for="reset-confirm-password">Confirm new password</label>
        <div class="auth-password-field"><input id="reset-confirm-password" name="confirmPassword" type="password" minlength="12" maxlength="128" pattern="\\S{12,128}" autocomplete="new-password" required><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
        <p class="auth-password-hint">Use at least 12 characters. Avoid spaces and common passwords.</p>
        <button class="auth-primary-button" type="submit">Update password</button>
        <p class="auth-message" id="reset-password-message" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div class="auth-view" data-auth-view="verify-email">
      <form class="auth-form" id="verify-email-form">
        <h3>Verify your email address</h3>
        <input name="token" type="hidden">
        <p class="auth-form-intro">We sent a secure confirmation link to your inbox. Open that link to activate your account.</p>
        <button class="auth-primary-button" id="verify-email-submit" type="submit">Verify email</button>
        <button class="auth-link-button" data-auth-switch="login" type="button">Return to sign in</button>
        <p class="auth-message" id="verify-email-message" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div class="auth-view" data-auth-view="account">
      <div class="auth-account-summary">
      <div class="account-welcome-row"><div class="account-avatar" aria-hidden="true">U</div><div><p class="section-kicker">YOUR STUDIO / OVERVIEW</p><h2 id="auth-account-name"></h2><p id="auth-account-email"></p></div></div>
      <p class="account-welcome-copy">Your workspace for beats, licenses, bookings and orders.</p>
      <div class="account-studio-shortcuts" aria-label="Account shortcuts">
        <button type="button" data-account-tab="purchases"><span>01</span> Purchases <b aria-hidden="true">↗</b></button>
        <button type="button" data-account-tab="licenses"><span>02</span> Licenses <b aria-hidden="true">↗</b></button>
        <button type="button" data-account-tab="bookings"><span>03</span> Bookings <b aria-hidden="true">↗</b></button>
        <button type="button" data-account-tab="notifications"><span>04</span> Alerts <b aria-hidden="true">↗</b></button>
      </div>
      <div class="account-dashboard">
          <nav class="account-dashboard-tabs" aria-label="Account pages">
            <a class="account-dashboard-tab" href="/user/purchases.html">Purchases</a>
            <a class="account-dashboard-tab" href="/user/licenses.html">Licenses</a>
            <a class="account-dashboard-tab" href="/user/downloads.html">Downloads</a>
            <a class="account-dashboard-tab" href="/user/wishlist.html">Wishlist</a>
            <a class="account-dashboard-tab" href="/user/bookings.html">Bookings</a>
            <a class="account-dashboard-tab" href="/user/profile.html">Profile</a>
            <a class="account-dashboard-tab" href="/user/orders.html">Orders</a>
            <a class="account-dashboard-tab" href="/user/alerts.html">Alerts</a>
            <a class="account-dashboard-tab" href="/user/requests.html">Requests</a>
          </nav>
          <div id="account-dashboard-content" class="account-dashboard-content" aria-live="polite">Loading account history...</div>
        </div>
        <button class="auth-primary-button" id="logout-button" type="button">Log out</button>
        <p class="auth-message" id="logout-message" role="status" aria-live="polite"></p>
      </div>
    </div>
    <div class="auth-view" data-auth-view="signup">
      <form class="auth-form" id="signup-form">
        <div class="auth-role-buttons" role="group" aria-label="Account type">
          <button class="auth-role-button active" type="button" data-role="artist" aria-pressed="true">I'm an artist</button>
          <button class="auth-role-button" type="button" data-role="non_artist" aria-pressed="false">I'm not an artist</button>
        </div>
        <input id="signup-role" name="role" type="hidden" value="artist">
        <label for="signup-email">Gmail / email</label>
        <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@gmail.com" required>
        <div class="auth-field-row">
          <div><label for="signup-first-name">First name</label><input id="signup-first-name" name="firstName" autocomplete="given-name" required></div>
          <div><label for="signup-last-name">Last name</label><input id="signup-last-name" name="lastName" autocomplete="family-name" required></div>
        </div>
        <div id="artist-fields"><label for="signup-artist-name">Artiste name</label><input id="signup-artist-name" name="artistName" placeholder="Your public name"></div>
        <label for="signup-phone">Telephone number</label>
        <div class="phone-field"><select id="signup-country-code" aria-label="Country code" style="width: 100px; background: #22c55e38; border: 1px solid #ccc; padding: 5px;"><option value="+233">GH +233</option><option value="+1">US +1</option><option value="+44">UK +44</option><option value="+234">NG +234</option></select><input id="signup-phone" name="phone" type="tel" autocomplete="tel" placeholder="24 000 0000" required></div>
        <div id="address-field" hidden><label for="signup-address">Address</label><textarea id="signup-address" name="address" rows="2" autocomplete="street-address"></textarea></div>
        <label for="signup-password">Password</label>
        <div class="auth-password-field"><input id="signup-password" name="password" type="password" minlength="12" maxlength="128" pattern="\\S{12,128}" autocomplete="new-password" required><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
        <div class="auth-password-strength" aria-live="polite"><span class="auth-password-strength-track"><i></i></span><span class="auth-password-strength-label">Password strength</span></div>
        <p class="auth-password-hint">Use at least 12 characters without spaces.</p>
        <label for="signup-confirm-password">Confirm password</label>
        <div class="auth-password-field"><input id="signup-confirm-password" name="confirmPassword" type="password" minlength="12" maxlength="128" pattern="\\S{12,128}" autocomplete="new-password" required><button class="auth-password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
        <p class="auth-password-hint">Use at least 12 characters without spaces.</p>
        <button class="auth-primary-button" type="submit">Create account</button>
        <button class="auth-link-button" data-auth-switch="login" type="button">Already have an account? Log in</button>
        <p class="auth-message" id="signup-message" role="status" aria-live="polite"></p>
      </form>
    </div>`;
  authPanel.innerHTML += '</section></div>';
  loginButton.insertAdjacentElement('afterend', authPanel);

  const setAuthView = view => {
    authPanel.querySelectorAll('.auth-view').forEach(panel => panel.classList.toggle('active', panel.dataset.authView === view));
    const titles = {
      login: 'Welcome back',
      signup: 'Create your account',
      'reset-request': 'Reset your password',
      'reset-password': 'Choose a new password',
      'verify-email': 'Verify your email',
      account: 'Your studio'
    };
    document.getElementById('auth-dialog-title').textContent = titles[view] || 'Your account';
  };
  const setAuthMessage = (id, message, isError = true) => {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle('error', isError);
  };
  const setSignupRole = role => {
    document.getElementById('signup-role').value = role;
    document.getElementById('artist-fields').hidden = role !== 'artist';
    document.getElementById('address-field').hidden = role === 'artist';
    document.getElementById('signup-artist-name').required = role === 'artist';
    document.getElementById('signup-address').required = role !== 'artist';
    authPanel.querySelectorAll('.auth-role-button').forEach(button => {
      const active = button.dataset.role === role;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  refreshAuthPanel = () => {
    const loggedIn = Boolean(customerUser?.name && customerUser?.email);
    loginButton.textContent = loggedIn ? 'Account' : 'Login';
    loginButton.setAttribute('aria-label', loggedIn ? `Open account for ${customerUser.name}` : 'Open login');
    if (loggedIn) {
      document.getElementById('auth-account-name').textContent = `Welcome, ${customerUser.name}.`;
      document.getElementById('auth-account-email').textContent = customerUser.email;
    }
    return loggedIn;
  };
  const accountHistory = {
    purchases: { endpoint: '/api/customer/purchases', key: 'purchases' },
    licenses: { endpoint: '/api/customer/licenses', key: 'licenses' },
    downloads: { endpoint: '/api/customer/downloads', key: 'downloads' },
    wishlist: { endpoint: '/api/wishlists', key: 'wishlists' },
    bookings: { endpoint: '/api/customer/bookings', key: 'bookings' },
    profile: { endpoint: '/api/auth/profile', key: 'user' },
    orders: { endpoint: '/api/customer/orders', key: 'orders' },
    notifications: { endpoint: '/api/customer/notifications', key: 'notifications' },
    requests: { endpoint: '/api/customer/requests', key: 'requests' }
  };
  const accountFormatMoney = value => `GHS ${Number(value || 0).toFixed(2)}`;
  const renderAccountHistory = (type, items) => {
    const content = document.getElementById('account-dashboard-content');
    if (type === 'profile') {
      if (!items || typeof items !== 'object' || Array.isArray(items)) {
        throw new Error('Your profile could not be loaded because the response was invalid.');
      }
      content.innerHTML = `<form class="account-profile-form" id="account-profile-form">
        <label>First name<input name="firstName" value="${escapeHTML(items.firstName)}" required></label>
        <label>Last name<input name="lastName" value="${escapeHTML(items.lastName)}" required></label>
        <label>Phone<input name="phone" value="${escapeHTML(items.phone)}" required></label>
        ${items.role === 'artist' ? `<label>Artist name<input name="artistName" value="${escapeHTML(items.artistName)}" required></label>` : `<label>Address<textarea name="address" rows="2" required>${escapeHTML(items.address)}</textarea></label>`}
        <button class="auth-primary-button" type="submit">Save profile</button>
        <p class="auth-message" data-profile-message role="status"></p>
      </form>`;
      return;
    }
    if (!Array.isArray(items)) {
      throw new Error('Account history could not be loaded because the response was invalid.');
    }
    if (type !== 'profile' && !items.length) {
      content.innerHTML = '<p>No records found.</p>';
      return;
    }
    content.innerHTML = items.map(item => {
      if (type === 'purchases') return `<article><strong>${escapeHTML(item.product_name || 'Purchase')}</strong><span>${escapeHTML(item.license_type || item.status || 'Paid')} · ${accountFormatMoney(item.unit_amount || item.amount)} · ${escapeHTML(item.created_at || '')}</span></article>`;
      if (type === 'licenses') return `<article><strong>${escapeHTML(item.beat_title)}</strong><span>${escapeHTML(item.license_type)} license · ${escapeHTML(item.order_reference || '')} · ${escapeHTML(item.purchased_at || '')}</span><button type="button" data-license-certificate="${Number(item.id)}">Download certificate</button></article>`;
      if (type === 'downloads') return `<article><strong>${escapeHTML(item.beat_title)}</strong><span>${escapeHTML(item.license_type)} · ${escapeHTML(item.format)} · ${escapeHTML(item.created_at || '')}</span></article>`;
      if (type === 'bookings') {
        let slots = [];
        try { slots = typeof item.booking_slots_json === 'string' ? JSON.parse(item.booking_slots_json) : item.booking_slots_json || []; } catch {}
        const slotSummary = slots.map(slot => `${slot.date} at ${slot.time}`).join(', ') || `${item.preferred_date || 'Flexible'} ${item.preferred_time || ''}`;
        return `<article><strong>${escapeHTML(item.service)}</strong><span>Status: ${escapeHTML(item.status)} · ${escapeHTML(slotSummary)} · ${escapeHTML(item.created_at || '')}</span>${item.admin_notes ? `<span>Studio note: ${escapeHTML(item.admin_notes)}</span>` : ''}</article>`;
      }
      if (type === 'orders') {
        const history = (item.fulfillmentHistory || []).map(entry => `<span>Fulfillment: ${escapeHTML(entry.status)} · ${escapeHTML(entry.created_at || '')}</span>`).join('');
        return `<article><strong>${escapeHTML(item.reference)}</strong><span>Payment: ${escapeHTML(item.status)} · ${accountFormatMoney(item.amount)} · ${escapeHTML(item.created_at || '')}</span><span>Fulfillment: ${escapeHTML(item.fulfillment_status || 'unfulfilled')}</span>${item.items.map(orderItem => `<span>${escapeHTML(orderItem.product_name || 'Item')}${orderItem.license_type ? ` · ${escapeHTML(orderItem.license_type)} license` : ''}</span>`).join('')}${history}</article>`;
      }
      if (type === 'notifications') return `<article class="${item.read_at ? '' : 'account-notification-unread'}" data-notification-id="${Number(item.id)}"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.message)} · ${escapeHTML(item.created_at || '')}</span>${item.read_at ? '' : '<button type="button" data-mark-notification-read>Mark read</button>'}</article>`;
      if (type === 'requests') return `<article><strong>${escapeHTML(item.product_name || `${item.request_type} request`)}</strong><span>Status: ${escapeHTML(item.status)} · ${item.quote_gsh === null ? 'No quote yet' : accountFormatMoney(item.quote_gsh)} · ${escapeHTML(item.created_at || '')}</span>${item.admin_notes ? `<span>Studio note: ${escapeHTML(item.admin_notes)}</span>` : ''}</article>`;
      return `<article><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.genre || 'Beat')} · Added ${escapeHTML(item.addedAt || '')}</span></article>`;
    }).join('');
  };
  const loadAccountHistory = async type => {
    const content = document.getElementById('account-dashboard-content');
    const config = accountHistory[type];
    content.textContent = 'Loading account history...';
    try {
      const response = await fetch(`${API}${config.endpoint}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load account history.');
      renderAccountHistory(type, type === 'profile' ? data[config.key] : data[config.key] || []);
      if (type === 'profile') {
        const form = document.getElementById('account-profile-form');
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const message = form.querySelector('[data-profile-message]');
          const button = form.querySelector('button');
          const stopBusy = window.startActionBusy(button, 'Saving…');
          if (!stopBusy) return;
          try {
            const response = await fetch(`${API}/api/auth/profile`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.fromEntries(new FormData(form)))
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save your profile.');
            customerUser = { ...customerUser, ...result.user };
            sessionStorage.setItem('customerUser', JSON.stringify(customerUser));
            refreshAuthPanel();
            message.textContent = 'Profile saved.';
            message.classList.remove('error');
          } catch (error) {
            message.textContent = error.message;
            message.classList.add('error');
          } finally {
            stopBusy();
          }
        });
      }
    } catch (error) {
      content.innerHTML = `<p class="auth-message error">${escapeHTML(error.message)}</p>`;
    }
  };
  authPanel.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', () => {
    loadAccountHistory(button.dataset.accountTab);
  }));
  authPanel.addEventListener('click', event => {
    const toggle = event.target.closest('.auth-password-toggle');
    if (!toggle) return;
    const input = toggle.parentElement.querySelector('input');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} password`);
    toggle.setAttribute('aria-pressed', String(visible));
  });
  const signupPassword = authPanel.querySelector('#signup-password');
  signupPassword.addEventListener('input', () => {
    const strength = signupPassword.value.length < 8 ? 0 : signupPassword.value.length < 12 ? 1 : 2;
    const meter = authPanel.querySelector('.auth-password-strength');
    meter.dataset.strength = String(strength);
    meter.querySelector('.auth-password-strength-label').textContent = ['Password strength', 'Password strength: fair', 'Password strength: strong'][strength];
  });
  document.addEventListener('click', async event => {
    const certificateButton = event.target.closest('[data-license-certificate]');
    if (certificateButton) {
      const stopBusy = window.startActionBusy(certificateButton, 'Downloading…');
      if (!stopBusy) return;
      let errorMessage = '';
      try {
        const response = await fetch(`${API}/api/customer/licenses/${certificateButton.dataset.licenseCertificate}/certificate`, { credentials: 'include' });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Could not download the certificate.');
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ultbigboy-license-${certificateButton.dataset.licenseCertificate}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (error) {
        errorMessage = error.message;
      } finally {
        stopBusy();
        if (errorMessage) certificateButton.textContent = errorMessage;
      }
      return;
    }
    const button = event.target.closest('[data-mark-notification-read]');
    if (!button) return;
    const card = button.closest('[data-notification-id]');
    const stopBusy = window.startActionBusy(button, 'Updating…');
    if (!stopBusy) return;
    try {
      await fetch(`${API}/api/customer/notifications/${card.dataset.notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include'
      });
      card.classList.remove('account-notification-unread');
      button.remove();
    } catch {
      /* leave the unread state in place */
    } finally {
      stopBusy();
    }
  });

  const closeAuthPanel = () => {
    authPanel.hidden = true;
    loginButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('auth-panel-open');
    loginButton.focus();
  };
  loginButton.setAttribute('aria-haspopup', 'dialog');
  loginButton.setAttribute('aria-controls', 'customer-auth-panel');
  authPanel.id = 'customer-auth-panel';
  loginButton.addEventListener('click', () => {
    authPanel.hidden = !authPanel.hidden;
    loginButton.setAttribute('aria-expanded', String(!authPanel.hidden));
    if (!authPanel.hidden) {
      document.body.classList.add('auth-panel-open');
      const loggedIn = refreshAuthPanel();
      setAuthView(loggedIn ? 'account' : 'login');
      if (loggedIn) loadAccountHistory('purchases');
      (authPanel.querySelector('.auth-view.active input:not([type="hidden"])') || authPanel.querySelector('.auth-view.active button'))?.focus();
    } else {
      document.body.classList.remove('auth-panel-open');
    }
  });
  authPanel.querySelector('.auth-close-button').addEventListener('click', closeAuthPanel);
  authPanel.addEventListener('click', event => {
    if (event.target === authPanel) closeAuthPanel();
  });
  authPanel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAuthPanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...authPanel.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]')]
      .filter(element => element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  authPanel.querySelectorAll('[data-auth-switch]').forEach(button => button.addEventListener('click', () => setAuthView(button.dataset.authSwitch)));
  authPanel.querySelectorAll('.auth-role-button').forEach(button => button.addEventListener('click', () => setSignupRole(button.dataset.role)));
  authPanel.querySelector('#forgot-password-button').addEventListener('click', () => setAuthView('reset-request'));
  authPanel.querySelector('#logout-button').addEventListener('click', async event => {
    const stopBusy = window.startActionBusy(event.currentTarget, 'Logging out…');
    if (!stopBusy) return;
    const logoutMessage = document.getElementById('logout-message');
    try {
      const response = await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!response.ok && response.status !== 401) throw new Error('Could not end the session.');
      logoutMessage.textContent = 'You are logged out.';
      logoutMessage.classList.remove('error');
    } catch (error) {
      logoutMessage.textContent = error.message || 'Could not end the session.';
      logoutMessage.classList.add('error');
    } finally {
      customerUser = null;
      sessionStorage.removeItem('customerUser');
      sessionStorage.removeItem('customerToken');
      localStorage.removeItem('customerCsrfToken');
      window.dispatchEvent(new Event('ultbigboy:auth-changed'));
      refreshReviewAccess();
      refreshAuthPanel();
      setAuthView('login');
      stopBusy();
    }
  });

  authPanel.querySelector('#signup-form').addEventListener('submit', async event => {
    event.preventDefault();
    const signupForm = event.currentTarget;
    const form = new FormData(signupForm);
    if (form.get('password') !== form.get('confirmPassword')) return setAuthMessage('signup-message', 'Passwords do not match.');
    const phone = `${document.getElementById('signup-country-code').value}${String(form.get('phone')).replace(/\D/g, '')}`;
    const submitButton = event.submitter || signupForm.querySelector('button[type="submit"]');
    const stopBusy = window.startActionBusy(submitButton, 'Creating account…');
    if (!stopBusy) return;
    try {
      const result = await fetch(`${API}/api/auth/signup`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(form), phone }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      const verificationMessage = `${data.message || 'Account created.'}${data.verificationToken ? ` Development verification token: ${data.verificationToken}` : ''}`;
      authPanel.querySelector('#verify-email-form [name="token"]').value = data.verificationToken || '';
      authPanel.querySelector('#verify-email-submit').disabled = !data.verificationToken;
      setAuthMessage('verify-email-message', verificationMessage, false);
      signupForm.reset();
      setSignupRole('artist');
      setAuthView('verify-email');
    } catch (error) {
      setAuthMessage('signup-message', error.message || 'Could not create the account.');
    } finally {
      stopBusy();
    }
  });

  authPanel.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    const stopBusy = window.startActionBusy(submitButton, 'Signing in…');
    if (!stopBusy) return;
    const resendVerificationButton = authPanel.querySelector('#resend-verification-button');
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const adminResult = await fetch(`${API}/api/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.identifier, password: form.password }) });
      if (adminResult.ok) {
        const adminData = await adminResult.json();
        localStorage.setItem('adminCsrfToken', adminData.csrfToken || '');
        window.location.href = '/admin/admin.html';
        return;
      }
      const result = await fetch(`${API}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await result.json();
      if (result.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
        resendVerificationButton.hidden = false;
        setAuthMessage('login-message', data.error);
        return;
      }
      if (!result.ok) throw new Error(data.error);
      customerUser = data.user;
      sessionStorage.setItem('customerUser', JSON.stringify(customerUser));
      sessionStorage.removeItem('customerToken');
      localStorage.setItem('customerCsrfToken', data.csrfToken || '');
      window.dispatchEvent(new Event('ultbigboy:auth-changed'));
      refreshAuthPanel();
      setAuthView('account');
      loadAccountHistory('purchases');
      refreshReviewAccess();
    } catch (error) {
      setAuthMessage('login-message', error.message || 'Could not log in.');
    } finally {
      stopBusy();
    }
  });

  authPanel.querySelector('#resend-verification-button').addEventListener('click', async event => {
    const button = event.currentTarget;
    const stopBusy = window.startActionBusy(button, 'Sending…');
    if (!stopBusy) return;
    try {
      const identifier = authPanel.querySelector('#login-identifier').value.trim();
      const response = await fetch(`${API}/api/auth/resend-verification`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.verificationToken) {
        authPanel.querySelector('#verify-email-form [name="token"]').value = data.verificationToken;
        authPanel.querySelector('#verify-email-submit').disabled = false;
        setAuthMessage('verify-email-message', `${data.message} Development verification token: ${data.verificationToken}`, false);
        setAuthView('verify-email');
        return;
      }
      setAuthMessage('login-message', data.message, false);
    } catch (error) {
      setAuthMessage('login-message', error.message || 'Could not resend the verification email.');
    } finally {
      stopBusy();
    }
  });

  authPanel.querySelector('#reset-request-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    const stopBusy = window.startActionBusy(submitButton, 'Sending…');
    if (!stopBusy) return;
    try {
      const email = new FormData(event.currentTarget).get('email');
      const response = await fetch(`${API}/api/auth/request-password-reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After'));
        const retryMessage = response.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? ` Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
          : '';
        throw new Error(`${data.error || 'Could not request a password reset.'}${retryMessage}`);
      }
      const message = data.resetToken
        ? `${data.message} Development reset token: ${data.resetToken}`
        : data.message;
      setAuthMessage('reset-request-message', message, false);
    } catch (error) {
      setAuthMessage('reset-request-message', error.message || 'Could not request a password reset.');
    } finally {
      stopBusy();
    }
  });

  authPanel.querySelector('#reset-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if (form.password !== form.confirmPassword) return setAuthMessage('reset-password-message', 'Passwords do not match.');
    const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    const stopBusy = window.startActionBusy(submitButton, 'Updating…');
    if (!stopBusy) return;
    try {
      const response = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: form.token, password: form.password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAuthMessage('reset-password-message', data.message, false);
      const params = new URLSearchParams(location.search);
      params.delete('resetToken');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
      setTimeout(() => {
        setAuthView('login');
        setAuthMessage('login-message', 'Password updated. You can now log in.', false);
      }, 1200);
    } catch (error) {
      setAuthMessage('reset-password-message', error.message || 'Could not update the password.');
    } finally {
      stopBusy();
    }
  });

  authPanel.querySelector('#verify-email-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const stopBusy = window.startActionBusy(submitButton, 'Verifying…');
    if (!stopBusy) return;
    let verified = false;
    try {
      const token = new FormData(event.currentTarget).get('token');
      const response = await fetch(`${API}/api/auth/verify-email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      verified = true;
      setAuthMessage('verify-email-message', data.message, false);
      authPanel.querySelector('#verify-email-submit').disabled = true;
      setTimeout(() => window.location.assign(new URL('/index.html', window.location.origin).toString()), 1200);
    } catch (error) {
      setAuthMessage('verify-email-message', error.message || 'Could not verify the email address.');
    } finally {
      if (!verified) stopBusy();
      const params = new URLSearchParams(location.search);
      params.delete('verifyToken');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  });

  const actionParams = new URLSearchParams(location.search);
  const verificationToken = actionParams.get('verifyToken');
  const resetToken = actionParams.get('resetToken');
  if (verificationToken || resetToken) {
    authPanel.hidden = false;
    document.body.classList.add('auth-panel-open');
    loginButton.setAttribute('aria-expanded', 'true');
    actionParams.delete('verifyToken');
    actionParams.delete('resetToken');
    const cleanedQuery = actionParams.toString();
    history.replaceState(null, '', `${location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ''}${location.hash}`);
    if (resetToken) {
      authPanel.querySelector('#reset-password-form [name="token"]').value = resetToken;
      setAuthView('reset-password');
    } else {
      authPanel.querySelector('#verify-email-form [name="token"]').value = verificationToken;
      authPanel.querySelector('#verify-email-submit').disabled = false;
      setAuthView('verify-email');
    }
  }

  refreshAuthPanel();
}

async function restoreCustomerSession() {
  try {
    const response = await fetch(`${API}/api/auth/session`, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not restore the customer session.');
    if (data.authenticated && data.user?.role !== 'admin' && data.user?.role !== 'super_admin') {
      customerUser = data.user;
      sessionStorage.setItem('customerUser', JSON.stringify(customerUser));
      localStorage.setItem('customerCsrfToken', data.csrfToken);
    } else {
      customerUser = null;
      sessionStorage.removeItem('customerUser');
      sessionStorage.removeItem('customerToken');
      localStorage.removeItem('customerCsrfToken');
    }
    refreshReviewAccess();
    if (loginButton) refreshAuthPanel();
  } catch (error) {
    console.error('Could not restore the customer session:', error);
    customerUser = null;
    sessionStorage.removeItem('customerUser');
    refreshReviewAccess();
    if (loginButton) refreshAuthPanel();
  }
}
const customerSessionReady = restoreCustomerSession();
window.ultbigboyCustomerSessionReady = customerSessionReady;

if (menuIcon && dropdownMenu) {
  const toggleMenu = () => {
    menuIcon.classList.toggle('open');
    const isOpen = menuIcon.classList.contains('open');
    dropdownMenu.style.display = isOpen ? 'block' : 'none';
    menuIcon.setAttribute('aria-expanded', String(isOpen));
    menuIcon.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  };

  menuIcon.addEventListener('click', toggleMenu);
  menuIcon.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMenu();
    }
  });
}

// Currency flag switcher
const currencySelect = document.getElementById('currency');
const flagIcon = document.getElementById('flagIcon');

if (currencySelect && flagIcon) {
  currencySelect.addEventListener('change', () => {
  const selectedOption = currencySelect.options[currencySelect.selectedIndex];
  flagIcon.src = selectedOption.dataset.flag;
  currentCurrency = currencySelect.value;
  switchCurrency();
  });
}

// Key picker with an embedded major/minor mode switch
const keyPicker = document.getElementById('key-picker');
const keyTrigger = document.getElementById('key-trigger');
const keyValue = document.getElementById('key-value');
const keyModes = document.querySelectorAll('.key-mode');
const keyNotes = document.querySelectorAll('.key-note');
let selectedMode = 'major';
let selectedNote = '';

function updateKeyValue() {
  const modeLabel = selectedMode === 'major' ? 'Maj' : 'Min';
  keyValue.textContent = selectedNote ? `${selectedNote.toUpperCase()} ${modeLabel}` : 'All keys';
}

function closeKeyPicker() {
  keyPicker.classList.remove('open');
  keyTrigger.setAttribute('aria-expanded', 'false');
}

keyTrigger?.addEventListener('click', () => {
  const isOpen = keyPicker.classList.toggle('open');
  keyTrigger.setAttribute('aria-expanded', String(isOpen));
});

keyModes.forEach(modeButton => {
  modeButton.addEventListener('click', () => {
    selectedMode = modeButton.dataset.mode;
    keyModes.forEach(button => {
      const isActive = button === modeButton;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    updateKeyValue();
  });
});

keyNotes.forEach(noteButton => {
  noteButton.addEventListener('click', () => {
    selectedNote = noteButton.dataset.note;
    keyNotes.forEach(button => button.classList.toggle('active', button === noteButton));
    updateKeyValue();
    closeKeyPicker();
  });
});

document.addEventListener('click', event => {
  if (keyPicker && !keyPicker.contains(event.target)) {
    closeKeyPicker();
  }
});

const previewBrowseButton = document.getElementById('preview-browse-btn');
function applyPreviewFilters() {
  const previewCards = document.querySelectorAll('#beat-list .beat-card');
  const minBpm = Number(document.getElementById('bpm-min')?.value) || 0;
  const maxBpm = Number(document.getElementById('bpm-max')?.value) || Infinity;
  const genre = document.getElementById('genre')?.value || '';
  const mood = document.getElementById('mood')?.value || '';

  previewCards.forEach(card => {
    const cardBpm = Number(card.dataset.bpm);
    const matchesBpm = !card.dataset.bpm || (cardBpm >= minBpm && cardBpm <= maxBpm);
    const matchesGenre = !genre || card.dataset.genre === genre;
    const matchesMood = !mood || card.dataset.mood === mood;
    const matchesKey = !selectedNote || card.dataset.key === selectedNote;
    const matchesMode = !selectedNote || card.dataset.keyMode === selectedMode;
    card.hidden = !(matchesBpm && matchesGenre && matchesMood && matchesKey && matchesMode);
  });

  const visibleCards = Array.from(previewCards).some(card => !card.hidden);
  let emptyState = document.getElementById('preview-empty-state');
  if (!visibleCards && previewCards.length) {
    if (!emptyState) {
      emptyState = document.createElement('p');
      emptyState.id = 'preview-empty-state';
      emptyState.className = 'filter-empty-state';
      emptyState.textContent = 'No featured beats match those filters.';
      document.getElementById('beat-list')?.appendChild(emptyState);
    }
  } else {
    emptyState?.remove();
  }

  document.getElementById('beat-listing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

previewBrowseButton?.addEventListener('click', applyPreviewFilters);

const previewStateKey = 'ultbigboyPreviewState';
const previewVolumeKey = 'ultbigboyPreviewVolume';

function setupPreviewCard(card) {
  const coverButton = card.querySelector('.beat-cover');
  const audio = card.querySelector('.beat-audio');
  const playIcon = card.querySelector('.play-icon');
  if (!coverButton || !audio || !playIcon) return;
  const beatKey = card.dataset.productId || card.querySelector('h3')?.textContent?.trim().toLowerCase();
  const savedVolumeValue = localStorage.getItem(previewVolumeKey);
  const savedVolume = Number(savedVolumeValue);
  if (savedVolumeValue !== null && Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1) {
    audio.volume = savedVolume;
  } else if (savedVolumeValue !== null) {
    localStorage.removeItem(previewVolumeKey);
  }
  audio.addEventListener('loadedmetadata', () => {
    try {
      const state = JSON.parse(localStorage.getItem(previewStateKey) || 'null');
      if (state?.beatKey === beatKey && Number.isFinite(state.currentTime) && state.currentTime < audio.duration) audio.currentTime = state.currentTime;
    } catch {}
  });
  audio.addEventListener('timeupdate', () => {
    try { localStorage.setItem(previewStateKey, JSON.stringify({ beatKey, currentTime: audio.currentTime })); } catch {}
  });
  audio.addEventListener('volumechange', () => {
    try {
      if (audio.volume > 0) localStorage.setItem(previewVolumeKey, String(audio.volume));
      else localStorage.removeItem(previewVolumeKey);
    } catch {}
  });

  coverButton.addEventListener('click', () => {
    document.querySelectorAll('.beat-audio').forEach(otherAudio => {
      if (otherAudio !== audio) {
        otherAudio.pause();
        otherAudio.currentTime = 0;
      }
    });

    if (audio.paused) {
      if (audio.volume === 0) audio.volume = 1;
      audio.play().then(() => {
        playIcon.textContent = '\u275A\u275A';
        coverButton.setAttribute('aria-label', `Pause ${card.querySelector('h3')?.textContent || 'beat'} preview`);
      }).catch(() => {
        playIcon.textContent = '\u25B6';
        showCartToast('Preview could not be played.');
      });
    } else {
      audio.pause();
      playIcon.textContent = '\u25B6';
      coverButton.setAttribute('aria-label', `Play ${card.querySelector('h3')?.textContent || 'beat'} preview`);
    }
  });

  audio.addEventListener('ended', () => {
    try { localStorage.removeItem(previewStateKey); } catch {}
    playIcon.textContent = '\u25B6';
    coverButton.setAttribute('aria-label', `Play ${card.querySelector('h3')?.textContent || 'beat'} preview`);
  });
}

document.querySelectorAll('.beat-card').forEach(setupPreviewCard);

let usdToGhsRate = null;

const cartStorageKey = 'ultbigboyCart';
const pendingCartPaymentsKey = 'ultbigboyPendingCartPayments';
let cart = [];
try {
  const savedCart = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
  if (Array.isArray(savedCart)) {
    cart = savedCart.filter(item => item && typeof item.name === 'string' && (typeof item.license === 'string' || item.type === 'merchandise') && Number.isFinite(item.price) && typeof item.cover === 'string' && typeof item.selected === 'boolean')
      .map(item => ({ ...item, priceCurrency: item.priceCurrency === 'GHS' ? 'GHS' : 'USD' }));
  }
} catch {
  cart = [];
}
let currentCurrency = currencySelect ? currencySelect.value : 'USD';

function createLicenseCode() {
  const purchaseCount = Number(localStorage.getItem('licensePurchaseCount') || 0) + 1;
  localStorage.setItem('licensePurchaseCount', String(purchaseCount));
  const purchaseDate = new Date();
  const month = String(purchaseDate.getMonth() + 1).padStart(2, '0');
  const year = String(purchaseDate.getFullYear()).slice(-3);
  return `AAD-99-${month}-${year}-${purchaseCount}`;
}

const currencySymbols = {
  GHS: '₵',
  USD: '$'
};

function formatCurrency(value, currency) {
  return `${currencySymbols[currency]}${Number(value).toFixed(2)} ${currency}`;
}

function convertCartAmount(value, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return Number(value);
  if (!Number.isFinite(usdToGhsRate) || usdToGhsRate <= 0) return null;
  return fromCurrency === 'USD'
    ? Number(value) * usdToGhsRate
    : Number(value) / usdToGhsRate;
}

function updateBeatPrices() {
  document.querySelectorAll('.beat-card').forEach(card => {
    const licenseSelect = card.querySelector('.license-select');
    const priceElement = card.querySelector('.beat-price');
    if (!licenseSelect || !priceElement) {
      return;
    }
    const selectedLicense = licenseSelect.options[licenseSelect.selectedIndex];
    const basePrice = Number(selectedLicense.dataset.price);
    const convertedPrice = convertCartAmount(basePrice, 'USD', currentCurrency);
    priceElement.textContent = convertedPrice === null
      ? `${formatCurrency(basePrice, 'USD')} (GHS conversion unavailable)`
      : formatCurrency(convertedPrice, currentCurrency);
  });
}

document.querySelectorAll('.license-select').forEach(licenseSelect => {
  licenseSelect.addEventListener('change', updateBeatPrices);
});

const requestedLicense = new URLSearchParams(window.location.search).get('license');
const availableLicenses = new Set(['basic', 'premium', 'unlimited', 'exclusive']);

if (availableLicenses.has(requestedLicense)) {
  document.querySelectorAll('.license-select').forEach(licenseSelect => {
    if (licenseSelect.querySelector(`option[value="${requestedLicense}"]`)) {
      licenseSelect.value = requestedLicense;
    }
  });
}

updateBeatPrices();

async function loadDisplayExchangeRate() {
  try {
    const response = await fetch(`${API}/api/exchange-rate`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load the current exchange rate.');
    const rate = Number(data.usdToGhsRate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('The server returned an invalid exchange rate.');
    usdToGhsRate = rate;
    updateBeatPrices();
    updateCart();
    updateMerchandisePrices();
  } catch (error) {
    console.error('Currency display conversion is unavailable:', error);
  }
}
loadDisplayExchangeRate();

const catalogFilter = document.getElementById('beats-filter');
let currentCatalogPage = 1;
const requestedGenre = new URLSearchParams(window.location.search).get('genre')?.toLowerCase();
const requestedSearch = new URLSearchParams(window.location.search).get('search')?.trim().toLowerCase() || '';
if (siteSearch && requestedSearch) siteSearch.value = requestedSearch;
if (requestedGenre && catalogFilter) {
  const genreValue = requestedGenre === 'rap' ? 'hiphop' : requestedGenre;
  const genreSelect = document.getElementById('catalog-genre');
  if ([...genreSelect.options].some(option => option.value === genreValue)) genreSelect.value = genreValue;
}

function clearCatalogFilters() {
  document.getElementById('catalog-bpm-min').value = '';
  document.getElementById('catalog-bpm-max').value = '';
  document.getElementById('catalog-genre').value = '';
  document.getElementById('catalog-mood').value = '';
  selectedMode = 'major';
  keyModes.forEach(button => {
    const isMajor = button.dataset.mode === 'major';
    button.classList.toggle('active', isMajor);
    button.setAttribute('aria-pressed', String(isMajor));
  });
  selectedNote = '';
  keyNotes.forEach(button => button.classList.toggle('active', button.dataset.note === ''));
  updateKeyValue();
}

const producedList = document.querySelector('.produced-page .produced-song-list, #home-stream-releases');
const producedPagination = document.querySelector('.produced-page .produced-pagination');
const producedPageSize = 10;
function renderProducedPage(releases, page) {
  const pageCount = Math.ceil(releases.length / producedPageSize);
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const firstRelease = (currentPage - 1) * producedPageSize;
  const cards = releases.slice(firstRelease, firstRelease + producedPageSize).map(release => {
    const article = document.createElement('article');
    article.className = 'beat-card produced-song-card';
    const cover = document.createElement('div');
    cover.className = 'beat-cover song-cover';
    const image = document.createElement('img');
    const coverUrl = new URL(release.coverUrl, window.location.href);
    if (coverUrl.protocol !== 'https:' && coverUrl.origin !== window.location.origin) {
      throw new Error('A stream release has an invalid cover image.');
    }
    image.src = coverUrl.href;
    image.alt = `${release.title} cover artwork`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 600;
    image.height = 600;
    const coverLabel = document.createElement('span');
    coverLabel.className = 'song-cover-label';
    coverLabel.textContent = release.title;
    cover.append(image, coverLabel);

    const details = document.createElement('div');
    details.className = 'beat-details';
    const copy = document.createElement('div');
    copy.className = 'song-copy';
    const title = document.createElement('h3');
    title.textContent = release.title;
    const metadata = document.createElement('p');
    metadata.className = 'beat-meta';
    [ `Artist: ${release.artist}`, ...(release.credits || []) ].forEach(value => {
      const item = document.createElement('span');
      item.textContent = value;
      metadata.append(item);
    });
    copy.append(title, metadata);
    const listenLinks = document.createElement('div');
    listenLinks.className = 'song-listen-links';
    (release.links || []).forEach(link => {
      const url = new URL(link.url);
      if (url.protocol !== 'https:') throw new Error('A stream release has an invalid listening link.');
      const anchor = document.createElement('a');
      anchor.className = `song-listen-button${link.platform === 'Audiomack' ? ' audiomack-listen-button' : ''}`;
      anchor.href = url.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.setAttribute('aria-label', link.label);
      anchor.title = `Listen on ${link.platform}`;
      if (link.platform === 'Spotify') {
        const platformIcon = document.createElement('img');
        platformIcon.src = '/Images/spotify.svg';
        platformIcon.alt = '';
        platformIcon.setAttribute('aria-hidden', 'true');
        anchor.append(platformIcon);
      } else {
        const platformIcon = document.createElement('span');
        platformIcon.setAttribute('aria-hidden', 'true');
        platformIcon.textContent = '♫';
        anchor.append(platformIcon);
      }
      const platformName = document.createElement('span');
      platformName.textContent = link.platform;
      anchor.append(platformName);
      listenLinks.append(anchor);
    });
    details.append(copy, listenLinks);
    article.append(cover, details);
    return article;
  });
  producedList.replaceChildren(...cards);
  const pageButtons = Array.from({ length: pageCount }, (_, index) => {
      const button = document.createElement('button');
      const pageNumber = index + 1;
      const isActive = pageNumber === currentPage;
      button.className = `beat-page-button${isActive ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = String(pageNumber);
      button.setAttribute('aria-label', `Production songs page ${pageNumber}`);
      if (isActive) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => renderProducedPage(releases, pageNumber));
      return button;
    });
  producedPagination?.replaceChildren(...pageButtons);
}

async function loadProducedReleases() {
  if (!producedList) return;
  producedList.setAttribute('aria-busy', 'true');
  producedList.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Loading stream releases...' }));
  try {
    const response = await fetch(`${API}/api/stream-releases`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load stream releases.');
    if (!data.releases?.length) {
      producedList.innerHTML = '<p class="filter-empty-state">No stream releases are published yet.</p>';
      producedPagination?.replaceChildren();
      return;
    }
    renderProducedPage(data.releases, 1);
  } catch (error) {
    showRetryState(producedList, error.message || 'Could not load stream releases.', loadProducedReleases);
  } finally {
    producedList.setAttribute('aria-busy', 'false');
  }
}
loadProducedReleases();

function addToCart(item) {
  cart.push(item);
  updateCart();
}

function cartItemKey(item) {
  const product = Number.isInteger(Number(item.productId)) && Number(item.productId) > 0
    ? `id:${Number(item.productId)}`
    : `name:${String(item.name || '').trim().toLowerCase()}`;
  return `${item.type || 'beat'}|${product}|${String(item.license || '').toLowerCase()}`;
}

function syncCartProductButtons() {
  document.querySelectorAll('.beat-card .beat-cart-button').forEach(button => {
    const card = button.closest('.beat-card');
    const license = card.querySelector('.license-select')?.value || '';
    const inCart = cart.some(item => cartItemKey(item) === cartItemKey({
      type: 'beat',
      productId: card.dataset.productId,
      name: card.querySelector('h3')?.textContent,
      license
    }));
    button.classList.toggle('is-in-cart', inCart);
    button.disabled = inCart;
    button.innerHTML = inCart ? '<span aria-hidden="true">&#10003;</span><small>In cart</small>' : '<span aria-hidden="true">&#128722;</span>';
    button.setAttribute('aria-label', inCart ? `${card.querySelector('h3')?.textContent || 'Beat'} is in your cart` : `Add ${card.querySelector('h3')?.textContent || 'beat'} to cart`);
    button.title = inCart ? 'Already in cart' : 'Add to cart';
  });
  document.querySelectorAll('.storefront-merchandise-item .merchandise-submit-button').forEach(button => {
    const inCart = cart.some(item => item.type === 'merchandise' && cartItemKey(item) === cartItemKey({
      type: 'merchandise',
      productId: button.dataset.productId,
      name: button.dataset.productName
    }));
    button.classList.toggle('is-in-cart', inCart);
    button.disabled = inCart || button.dataset.outOfStock === 'true';
    button.textContent = inCart ? 'In cart' : button.dataset.outOfStock === 'true' ? 'Out of stock' : 'Add to cart';
    button.setAttribute('aria-label', inCart ? `${button.dataset.productName} is in your cart` : `${button.dataset.outOfStock === 'true' ? 'Out of stock:' : 'Add to cart:'} ${button.dataset.productName}`);
  });
}

function updateCart() {
  try {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  } catch {}

  document.getElementById('checkout-form-panel')?.remove();
  document.getElementById('cart-checkout-button')?.setAttribute('aria-expanded', 'false');

  const cartItems = document.getElementById("cart-items");
  const cartEmpty = document.getElementById("cart-empty");
  const cartTotal = document.getElementById("cart-total");
  const checkoutButton = document.getElementById("cart-checkout-button");
  const cartCount = document.getElementById('cart-count');
  const itemCount = cart.reduce((count, item) => count + Math.max(1, Number(item.quantity) || 1), 0);
  if (cartCount) {
    cartCount.textContent = itemCount > 99 ? '99+' : String(itemCount);
    cartCount.hidden = itemCount === 0;
  }
  cartButton?.setAttribute('aria-label', `Shopping cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`);
  syncCartProductButtons();
  if (!cartItems || !cartEmpty || !cartTotal) return;
  cartItems.innerHTML = "";
  let total = 0;
  let totalAvailable = true;
  let selectedCount = 0;

  cart.forEach((item, index) => {
    const priceCurrency = item.priceCurrency === 'GHS' ? 'GHS' : 'USD';
    const displayPrice = convertCartAmount(item.price, priceCurrency, currentCurrency);
    if (item.selected) {
      if (displayPrice === null) totalAvailable = false;
      else total += displayPrice;
      selectedCount += 1;
    }
    const li = document.createElement("li");
    li.className = 'cart-item';
    const itemKind = item.type === 'merchandise' ? 'Merchandise' : `${item.license} license`;
    const displayedPrice = displayPrice === null
      ? `${formatCurrency(item.price, priceCurrency)} (conversion unavailable)`
      : formatCurrency(displayPrice, currentCurrency);
    li.innerHTML = `<img class="cart-item-cover" src="${escapeHTML(item.cover || '/Images/Logo 2.png')}" alt="${escapeHTML(item.name)} cover art"><label class="cart-item-select"><input type="checkbox" data-cart-index="${index}" ${item.selected ? 'checked' : ''} aria-label="Select ${escapeHTML(item.name)} for checkout"><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(itemKind)}</small></span></label><span class="cart-item-actions"><strong>${displayedPrice}</strong><button type="button" class="cart-remove-button" data-cart-index="${index}" aria-label="Remove ${escapeHTML(item.name)}" title="Remove item">&#128465;</button></span>`;
    cartItems.appendChild(li);
  });

  cartTotal.textContent = totalAvailable
    ? formatCurrency(total, currentCurrency)
    : 'Currency conversion unavailable';
  cartEmpty.hidden = cart.length > 0;
  if (checkoutButton) {
    checkoutButton.disabled = selectedCount === 0;
    checkoutButton.textContent = selectedCount ? `Proceed payment (${selectedCount})` : 'Proceed payment';
  }
  cartItems.querySelectorAll('.cart-item-select input').forEach(input => {
    input.addEventListener('change', () => {
      cart[Number(input.dataset.cartIndex)].selected = input.checked;
      updateCart();
    });
  });
  cartItems.querySelectorAll('.cart-remove-button').forEach(button => {
    button.addEventListener('click', () => {
      cart.splice(Number(button.dataset.cartIndex), 1);
      updateCart();
    });
  });
}

window.addEventListener('storage', event => {
  if (event.key !== cartStorageKey) return;
  try {
    const savedCart = JSON.parse(event.newValue || '[]');
    cart = Array.isArray(savedCart) ? savedCart.filter(item => item && typeof item.name === 'string') : [];
  } catch {
    cart = [];
  }
  updateCart();
});

function switchCurrency() {
  currentCurrency = currencySelect ? currencySelect.value : currentCurrency;
  updateBeatPrices();
  updateCart();
  updateMerchandisePrices();
}

function updateMerchandisePrices() {
  document.querySelectorAll('[data-storefront-price]').forEach(priceElement => {
    const basePrice = Number(priceElement.dataset.price);
    const baseCurrency = priceElement.dataset.currency;
    const convertedPrice = convertCartAmount(basePrice, baseCurrency, currentCurrency);
    priceElement.textContent = convertedPrice === null
      ? `${formatCurrency(basePrice, baseCurrency)} (conversion unavailable)`
      : formatCurrency(convertedPrice, currentCurrency);
  });
}

function renderCatalogPagination(pagination) {
  const nav = document.querySelector('.beat-pagination:not(.produced-pagination)');
  if (!nav) return;
  const pageCount = Math.max(1, Number(pagination.pages) || 1);
  nav.replaceChildren(...Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const isActive = page === Number(pagination.page);
    const button = document.createElement('button');
    button.className = `beat-page-button${isActive ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.page = String(page);
    button.setAttribute('aria-label', `Beat page ${page}`);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
    button.textContent = String(page);
    button.addEventListener('click', () => {
      currentCatalogPage = page;
      loadDatabaseBeatCatalog();
      document.getElementById('beat-listing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return button;
  }));
}

function renderBeatStructuredData(beats) {
  if (!Array.isArray(beats) || !document.querySelector('.catalog-page')) return;
  const pageUrl = location.origin === 'null' ? null : `${location.origin}${location.pathname}`;
  const itemListElement = beats.slice(0, 20).map((beat, index) => {
    const prices = Object.values(beat.prices || {}).map(Number).filter(price => Number.isFinite(price) && price > 0);
    const product = {
      '@type': 'Product',
      name: beat.title,
      description: [beat.genre, beat.mood, beat.bpm ? `${beat.bpm} BPM` : '', beat.musicalKey].filter(Boolean).join(' · '),
      image: beat.coverUrl || (beat.coverArt ? `${API}/api/uploads/${encodeURIComponent(beat.coverArt)}` : undefined)
    };
    if (pageUrl) product.url = `${pageUrl}?search=${encodeURIComponent(beat.title)}#beat-listing`;
    if (prices.length) {
      product.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'GHS',
        lowPrice: Math.min(...prices).toFixed(2),
        highPrice: Math.max(...prices).toFixed(2),
        offerCount: prices.length,
        availability: 'https://schema.org/InStock'
      };
    }
    return { '@type': 'ListItem', position: index + 1, item: product };
  });
  let script = document.getElementById('beat-structured-data');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'beat-structured-data';
    document.head.append(script);
  }
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'UltBigBoy beats',
    itemListElement
  });
}

async function loadDatabaseBeatCatalog() {
  const catalogList = document.getElementById('beat-list');
  if (!catalogList || !document.querySelector('.catalog-page')) return;
  if (catalogList.querySelector('.beat-card')) catalogList.setAttribute('aria-busy', 'true');
  else setLoadingState(catalogList, 'Loading beats...');
  const query = new URLSearchParams({
    page: String(currentCatalogPage),
    pageSize: '11',
    search: new URLSearchParams(window.location.search).get('search') || '',
    genre: document.getElementById('catalog-genre')?.value || '',
    mood: document.getElementById('catalog-mood')?.value || '',
    key: selectedNote ? `${selectedNote} ${selectedMode === 'major' ? 'Major' : 'Minor'}` : '',
    minBpm: document.getElementById('catalog-bpm-min')?.value || '',
    maxBpm: document.getElementById('catalog-bpm-max')?.value || ''
  });
  [...query.keys()].forEach(key => { if (!query.get(key)) query.delete(key); });
  try {
    const result = await fetch(`${API}/api/beats?${query.toString()}`);
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Could not load beats.');
    const cards = data.beats.map(beat => {
      const card = document.createElement('article');
      const prices = beat.prices || {};
      const cover = beat.coverUrl || (beat.coverArt ? `${API}/api/uploads/${encodeURIComponent(beat.coverArt)}` : '/Images/Logo 2.png');
      const preview = beat.previewUrl || (beat.previewFile ? `${API}/api/uploads/${encodeURIComponent(beat.previewFile)}` : '');
      card.className = 'beat-card';
      card.dataset.bpm = beat.bpm || '';
      card.dataset.key = String(beat.musicalKey || '').toLowerCase();
      card.dataset.genre = String(beat.genre || '').toLowerCase();
      card.dataset.mood = String(beat.mood || '').toLowerCase();
      const duration = beat.previewDurationSeconds ? ` • ${Math.floor(beat.previewDurationSeconds / 60)}:${String(beat.previewDurationSeconds % 60).padStart(2, '0')}` : '';
      card.innerHTML = `<button class="beat-cover" type="button" aria-label="Play ${escapeHTML(beat.title)} preview"><img src="${escapeHTML(cover)}" alt="${escapeHTML(beat.title)} cover art"><span class="play-icon" aria-hidden="true">&#9654;</span></button><div class="beat-details"><h3>${escapeHTML(beat.title)}</h3><p class="beat-meta"><span class="meta-item">${escapeHTML(beat.bpm || '—')} BPM</span><span class="meta-item">${escapeHTML(beat.musicalKey || 'Key not set')}</span><span class="meta-item">${escapeHTML(beat.genre || 'Genre not set')}</span><span class="meta-item">${escapeHTML(beat.mood || 'Mood not set')}</span><span class="meta-item">${duration}</span></p><audio class="beat-audio" src="${escapeHTML(preview)}" preload="none"></audio><label class="license-label">License Type</label><select class="license-select">${Object.entries(prices).map(([license, price]) => `<option value="${license}" data-price="${Number(price)}">${license[0].toUpperCase() + license.slice(1)}</option>`).join('')}</select></div><div class="beat-purchase"><strong class="beat-price"></strong><button class="beat-cart-button" type="button" aria-label="Add ${escapeHTML(beat.title)} to cart"><span aria-hidden="true">&#128722;</span></button></div>`;
      card.querySelector('.license-select').setAttribute('aria-label', `License type for ${beat.title}`);
      const coverImage = card.querySelector('.beat-cover img');
      coverImage.loading = 'lazy';
      coverImage.decoding = 'async';
      coverImage.width = 600;
      coverImage.height = 600;
      card.dataset.productId = beat.id;
      setupPreviewCard(card);
      return card;
    });
    if (cards.length) catalogList.replaceChildren(...cards);
    else catalogList.innerHTML = '<p class="filter-empty-state">No beats match those filters. Try broadening your search.</p>';
    renderBeatStructuredData(data.beats);
    clearLoadingState(catalogList);
    const pagination = data.pagination || { page: currentCatalogPage, pages: 1, total: data.beats.length };
    const total = Number(pagination.total || data.beats.length);
    document.getElementById('beat-result-count').textContent = `${total} ${total === 1 ? 'beat' : 'beats'} found`;
    renderCatalogPagination(pagination);
    catalogList.querySelectorAll('.license-select').forEach(select => select.addEventListener('change', () => {
      updateBeatPrices();
      syncCartProductButtons();
    }));
    catalogList.querySelectorAll('.beat-cart-button').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.beat-card');
      const select = card.querySelector('.license-select');
      const option = select.options[select.selectedIndex];
      addToCart({ type: 'beat', productId: Number(card.dataset.productId), name: card.querySelector('h3').textContent, license: option.value, price: Number(option.dataset.price), cover: card.querySelector('img')?.src || '', selected: true });
      showCartToast('Beat added to cart.');
    }));
    updateBeatPrices();
    syncCartProductButtons();
  } catch (error) {
    showRetryState(catalogList, error.message || 'Could not load beats.', loadDatabaseBeatCatalog);
  }
}

async function loadFeaturedBeatCatalog() {
  const catalogList = document.getElementById('beat-list');
  if (!catalogList || document.querySelector('.catalog-page')) return;
  if (catalogList.querySelector('.beat-card')) catalogList.setAttribute('aria-busy', 'true');
  else setLoadingState(catalogList, 'Loading featured beats...');
  try {
    const response = await fetch(`${API}/api/beats?page=1&pageSize=6`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load featured beats.');
    catalogList.replaceChildren(...data.beats.map(beat => {
      const card = document.createElement('article');
      const prices = beat.prices || {};
      const cover = beat.coverUrl || (beat.coverArt ? `${API}/api/uploads/${encodeURIComponent(beat.coverArt)}` : '/Images/Logo 2.png');
      const preview = beat.previewUrl || '';
      const key = String(beat.musicalKey || '').toLowerCase();
      const keyMode = key.endsWith(' minor') ? 'minor' : 'major';
      const duration = beat.previewDurationSeconds ? ` • ${Math.floor(beat.previewDurationSeconds / 60)}:${String(beat.previewDurationSeconds % 60).padStart(2, '0')}` : '';
      card.className = 'beat-card';
      card.dataset.productId = beat.id;
      card.dataset.bpm = beat.bpm || '';
      card.dataset.key = key.replace(/ (major|minor)$/, '');
      card.dataset.keyMode = keyMode;
      card.dataset.genre = String(beat.genre || '').toLowerCase();
      card.dataset.mood = String(beat.mood || '').toLowerCase();
      card.innerHTML = `<button class="beat-cover" type="button" aria-label="Play ${escapeHTML(beat.title)} preview"><img src="${escapeHTML(cover)}" alt="${escapeHTML(beat.title)} cover art"><span class="play-icon" aria-hidden="true">&#9654;</span></button><div class="beat-details"><h3>${escapeHTML(beat.title)}</h3><p class="beat-meta"><span class="meta-item">${escapeHTML(beat.bpm || '—')} BPM</span><span class="meta-item">${escapeHTML(beat.musicalKey || 'Key not set')}</span><span class="meta-item">${escapeHTML(beat.genre || 'Genre not set')}</span><span class="meta-item">${escapeHTML(beat.mood || 'Mood not set')}</span><span class="meta-item">${duration}</span></p><audio class="beat-audio" src="${escapeHTML(preview)}" preload="none"></audio><label class="license-label">License Type</label><select class="license-select">${Object.entries(prices).map(([license, price]) => `<option value="${license}" data-price="${Number(price)}">${license[0].toUpperCase() + license.slice(1)}</option>`).join('')}</select></div><div class="beat-purchase"><strong class="beat-price"></strong><button class="beat-cart-button" type="button" aria-label="Add ${escapeHTML(beat.title)} to cart"><span aria-hidden="true">&#128722;</span></button></div>`;
      card.querySelector('.license-select').setAttribute('aria-label', `License type for ${beat.title}`);
      const coverImage = card.querySelector('.beat-cover img');
      coverImage.loading = 'lazy';
      coverImage.decoding = 'async';
      coverImage.width = 600;
      coverImage.height = 600;
      setupPreviewCard(card);
      return card;
    }));
    if (!data.beats.length) catalogList.innerHTML = '<p class="filter-empty-state">No featured beats are published yet. Browse all beats to explore the catalog.</p>';
    clearLoadingState(catalogList);
    catalogList.querySelectorAll('.license-select').forEach(select => select.addEventListener('change', () => {
      updateBeatPrices();
      syncCartProductButtons();
    }));
    catalogList.querySelectorAll('.beat-cart-button').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.beat-card');
      const select = card.querySelector('.license-select');
      const option = select.options[select.selectedIndex];
      addToCart({ type: 'beat', productId: Number(card.dataset.productId), name: card.querySelector('h3').textContent, license: option.value, price: Number(option.dataset.price), cover: card.querySelector('img')?.src || '', selected: true });
      setCartOpen(true);
      showCartToast('Beat added to cart.');
    }));
    updateBeatPrices();
    syncCartProductButtons();
  } catch (error) {
    showRetryState(catalogList, error.message || 'Could not load featured beats.', loadFeaturedBeatCatalog);
  }
}

document.getElementById('apply-beat-filters')?.addEventListener('click', () => {
  currentCatalogPage = 1;
  loadDatabaseBeatCatalog();
});
document.getElementById('clear-beat-filters')?.addEventListener('click', () => {
  clearCatalogFilters();
  currentCatalogPage = 1;
  loadDatabaseBeatCatalog();
});
loadDatabaseBeatCatalog();
loadFeaturedBeatCatalog();

const cartButton = document.getElementById('cart-button');
const cartDrawer = document.getElementById('cart-drawer');
const cartCloseButton = document.getElementById('cart-close-button');
const cartCheckoutButton = document.getElementById('cart-checkout-button');

function openCheckoutForm() {
  const existingPanel = document.getElementById('checkout-form-panel');
  if (existingPanel) {
    existingPanel.hidden = !existingPanel.hidden;
    cartCheckoutButton?.setAttribute('aria-expanded', String(!existingPanel.hidden));
    cartCheckoutButton.textContent = existingPanel.hidden ? `Proceed payment (${cart.filter(item => item.selected).length})` : 'Hide payment options';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'checkout-dropdown';
  panel.id = 'checkout-form-panel';
  panel.innerHTML = `<div class="checkout-dropdown-content">
    <div class="checkout-method-tabs" role="tablist" aria-label="Choose payment method"><button type="button" class="checkout-method-tab active" id="checkout-tab-mobile" role="tab" aria-selected="true" aria-controls="checkout-payment-panel" data-payment-method="mobile_money">Mobile Money</button><button type="button" class="checkout-method-tab" id="checkout-tab-card" role="tab" aria-selected="false" aria-controls="checkout-payment-panel" data-payment-method="card">Card</button></div>
    <div class="checkout-payment-panel" id="checkout-payment-panel" role="tabpanel" aria-labelledby="checkout-tab-mobile">
      <p class="checkout-method-description checkout-mobile-description">Paystack will collect your Mobile Money network and number securely.</p>
      <p class="checkout-method-description checkout-card-description" hidden>Card number, expiry, and CVV are entered securely on Paystack after you continue.</p>
    </div>
    <button class="auth-primary-button checkout-submit" type="button">Proceed with Mobile Money</button>
    <div class="checkout-card-brands" aria-label="Accepted cards: Mastercard and Visa" hidden><span class="checkout-mastercard" aria-label="Mastercard"><i></i><i></i><b>mastercard</b></span><span class="checkout-visa" aria-label="Visa">VISA</span></div>
    <p class="checkout-message" role="status" aria-live="polite"></p>
  </div>`;
  cartCheckoutButton.insertAdjacentElement('afterend', panel);
  cartCheckoutButton.setAttribute('aria-expanded', 'true');
  cartCheckoutButton.textContent = 'Hide payment options';
  const cardDescription = panel.querySelector('.checkout-card-description');
  const mobileDescription = panel.querySelector('.checkout-mobile-description');
  const submitButton = panel.querySelector('.checkout-submit');
  const message = panel.querySelector('.checkout-message');
  const methodTabs = panel.querySelectorAll('.checkout-method-tab');
  let paymentMethod = 'mobile_money';

  const setPaymentMethod = method => {
    paymentMethod = method;
    methodTabs.forEach(tab => {
      const active = tab.dataset.paymentMethod === method;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const selectedTab = panel.querySelector(`[data-payment-method="${method}"]`);
    panel.querySelector('#checkout-payment-panel').setAttribute('aria-labelledby', selectedTab.id);
    mobileDescription.hidden = method !== 'mobile_money';
    cardDescription.hidden = method !== 'card';
    submitButton.textContent = `Proceed with ${method === 'card' ? 'Card' : 'Mobile Money'}`;
    panel.querySelector('.checkout-card-brands').hidden = method !== 'card';
  };

  methodTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setPaymentMethod(tab.dataset.paymentMethod));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const nextTab = methodTabs[(index + (event.key === 'ArrowRight' ? 1 : methodTabs.length - 1)) % methodTabs.length];
      nextTab.focus();
      setPaymentMethod(nextTab.dataset.paymentMethod);
    });
  });

  submitButton.addEventListener('click', async () => {
    await customerSessionReady;
    const currentSelectedItems = cart.filter(item => item.selected);
    if (!currentSelectedItems.length) {
      message.textContent = 'Select at least one item in your cart to continue.';
      message.classList.add('error');
      return;
    }
    const paymentEmail = customerUser?.email;
    if (!paymentEmail) {
      message.textContent = 'Paystack requires an email address. Sign in before submitting payment.';
      message.classList.add('error');
      return;
    }
    message.classList.remove('error');
    message.textContent = 'Connecting to secure payment...';
    const stopBusy = window.startActionBusy(submitButton, 'Starting payment…');
    if (!stopBusy) return;
    try {
      const response = await fetch(`${API}/api/payments/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: customerUser?.name || 'Guest Customer', email: paymentEmail, items: currentSelectedItems, paymentMethod }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start payment.');
      if (!data.reference || !data.authorizationUrl) throw new Error('Payment could not be started because the response was incomplete.');
      let pendingPayments = {};
      try {
        const savedPayments = JSON.parse(localStorage.getItem(pendingCartPaymentsKey) || '{}');
        if (savedPayments && typeof savedPayments === 'object' && !Array.isArray(savedPayments)) pendingPayments = savedPayments;
      } catch {}
      pendingPayments[data.reference] = currentSelectedItems.map(cartItemKey);
      localStorage.setItem(pendingCartPaymentsKey, JSON.stringify(pendingPayments));
      window.location.href = data.authorizationUrl;
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('error');
    } finally {
      stopBusy();
    }
  });
}

function setCartOpen(isOpen) {
  if (!cartDrawer) return;
  cartDrawer.classList.toggle('open', isOpen);
  cartDrawer.setAttribute('aria-hidden', String(!isOpen));
  cartButton?.setAttribute('aria-expanded', String(isOpen));
}

cartButton?.addEventListener('click', () => setCartOpen(!cartDrawer.classList.contains('open')));
cartCloseButton?.addEventListener('click', () => setCartOpen(false));
cartCheckoutButton?.addEventListener('click', openCheckoutForm);

document.querySelectorAll('.beat-cart-button').forEach(button => {
  button.addEventListener('click', () => {
    const card = button.closest('.beat-card');
    const licenseSelect = card?.querySelector('.license-select');
    if (!card || !licenseSelect) return;
    const option = licenseSelect.options[licenseSelect.selectedIndex];
    const item = { type: 'beat', name: card.querySelector('h3').textContent, license: option.value, price: Number(option.dataset.price), cover: card.querySelector('.beat-cover img')?.src || '', selected: true };
    addToCart(item);
    const purchase = { ...item, purchasedAt: new Date() };
    if (item.license.toLowerCase() === 'basic') {
      window.basicLicensePurchase = { ...purchase, licenseCode: createLicenseCode() };
    }
    if (item.license.toLowerCase() === 'premium') {
      window.premiumLicensePurchase = { ...purchase, licenseCode: createLicenseCode() };
    }
    if (item.license.toLowerCase() === 'unlimited') {
      window.unlimitedLicensePurchase = purchase;
    }
    if (item.license.toLowerCase() === 'exclusive') {
      window.exclusiveLicensePurchase = { ...purchase, licenseCode: createLicenseCode() };
    }
    setCartOpen(true);
    showCartToast('Item added.');
  });
});

let toastTimeout;
function showCartToast(message) {
  const toast = document.getElementById('cart-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2200);
}

updateCart();

const merchandiseLists = [...document.querySelectorAll('#public-merchandise-list, #home-merchandise-list')];
if (merchandiseLists.length) {
  const loadMerchandise = async () => {
    merchandiseLists.forEach(list => {
      list.setAttribute('aria-busy', 'true');
      list.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Loading merchandise...' }));
    });
    try {
      const response = await fetch(`${API}/api/merchandise`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load merchandise.');
    merchandiseLists.forEach(merchandiseList => {
      const visibleProducts = merchandiseList.id === 'home-merchandise-list' ? data.merchandise.slice(0, 3) : data.merchandise;
      const cards = visibleProducts.map(product => {
      const card = document.createElement('article');
      card.className = 'storefront-merchandise-item';
      const image = document.createElement('img');
      image.src = product.photoUrl || (product.photo ? `${API}/api/uploads/${encodeURIComponent(product.photo)}` : '/Images/Logo 2.png');
      image.alt = `${product.title} merchandise`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 600;
      image.height = 500;
      const details = document.createElement('div');
      details.className = 'storefront-merchandise-details';
      const title = document.createElement('h3');
      title.textContent = product.title;
      const description = document.createElement('p');
      description.textContent = product.description || '';
      const price = document.createElement('strong');
      price.dataset.storefrontPrice = '';
      price.dataset.price = String(Number(product.price));
      price.dataset.currency = 'GHS';
      price.textContent = formatCurrency(Number(product.price), 'GHS');
      const button = document.createElement('button');
      button.className = 'merchandise-submit-button';
      button.type = 'button';
      button.dataset.productId = String(product.id);
      button.dataset.productName = product.title;
      const finiteStock = product.stockQuantity !== null && product.stockQuantity !== undefined;
      const outOfStock = finiteStock && Number(product.stockQuantity) < 1;
      button.dataset.outOfStock = String(outOfStock);
      button.textContent = outOfStock ? 'Out of stock' : 'Add to cart';
      button.disabled = outOfStock;
      button.addEventListener('click', () => {
        if (outOfStock) return;
        addToCart({ type: 'merchandise', productId: product.id, name: product.title, price: Number(product.price), priceCurrency: 'GHS', cover: image.src, selected: true });
        setCartOpen(true);
        showCartToast('Merchandise added.');
      });
      details.append(title, description, price, button);
      card.append(image, details);
      return card;
    });
      if (cards.length) merchandiseList.replaceChildren(...cards);
      else merchandiseList.innerHTML = '<p class="filter-empty-state">No merchandise is available to order yet.</p>';
      merchandiseList.setAttribute('aria-busy', 'false');
    });
    updateMerchandisePrices();
    syncCartProductButtons();
    } catch (error) {
      merchandiseLists.forEach(merchandiseList => {
        merchandiseList.setAttribute('aria-busy', 'false');
        showRetryState(merchandiseList, error.message || 'Merchandise could not be loaded right now.', loadMerchandise);
      });
    }
  };
  loadMerchandise();
}

const beatRequestForm = document.getElementById('beat-request-form');
const beatRequestLicense = document.getElementById('beat-request-license');
const beatRequestLicensePrice = document.getElementById('beat-request-license-price');
let beatRequestLicensePrices = {};
let beatRequestSubmissionId = createSubmissionId();

function updateBeatRequestLicensePrice() {
  const price = beatRequestLicensePrices[beatRequestLicense?.value];
  beatRequestLicensePrice?.classList.remove('error');
  beatRequestLicensePrice.textContent = Number.isFinite(price)
    ? `License request price: GHS ${price.toFixed(2)}`
    : 'Choose a license to see its price.';
}

if (beatRequestLicense && beatRequestLicensePrice) {
  beatRequestLicense.addEventListener('change', updateBeatRequestLicensePrice);
  const loadBeatRequestLicensePrices = async () => {
    beatRequestLicensePrice.classList.remove('error');
    beatRequestLicensePrice.textContent = 'Loading license prices...';
    try {
      const response = await fetch(`${API}/api/requests/beat-license-prices`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load license prices.');
      beatRequestLicensePrices = data.prices || {};
      updateBeatRequestLicensePrice();
    } catch (error) {
      showInlineRetry(beatRequestLicensePrice, error.message || 'License prices are unavailable right now.', loadBeatRequestLicensePrices);
    }
  };
  loadBeatRequestLicensePrices();
}

beatRequestForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = event.submitter || form.querySelector('button[type="submit"]');
  if (submitButton?.dataset.busy === 'true') return;
  const stopBusy = window.startActionBusy(submitButton, 'Sending…');
  const message = document.getElementById('beat-request-message');
  message.classList.remove('error');
  try {
    const formData = new FormData(form);
    const audioFile = formData.get('sampleAudio');
    formData.delete('sampleAudio');
    const payload = Object.fromEntries(formData);
    if (audioFile instanceof File && audioFile.size) {
      if (audioFile.size > 15 * 1024 * 1024) throw new Error('Audio files must be 15 MB or smaller.');
      const supportedExtension = /\.(mp3|m4a|mp4|wav|ogg)$/i.test(audioFile.name);
      const supportedMimeTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'video/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'application/octet-stream']);
      if (!supportedExtension || (audioFile.type && !supportedMimeTypes.has(audioFile.type.toLowerCase()))) throw new Error('Upload an MP3, M4A, MP4, WAV, or OGG audio file.');
      payload.sampleAudio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: audioFile.name, data: reader.result });
        reader.onerror = () => reject(new Error('Could not read the audio file.'));
        reader.readAsDataURL(audioFile);
      });
    }
    const response = await fetch(`${API}/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestType: 'beat', submissionId: beatRequestSubmissionId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    message.textContent = 'Beat request received. We will be in touch soon.';
    form.reset();
    updateBeatRequestLicensePrice();
    beatRequestSubmissionId = createSubmissionId();
  } catch (error) {
    message.textContent = error.message || 'Could not send beat request.';
    message.classList.add('error');
  } finally {
    stopBusy?.();
  }
});

const publicMain = document.querySelector('main');
let reviewsSection = document.getElementById('public-reviews');
if (publicMain && !reviewsSection) {
  reviewsSection = document.createElement('section');
  reviewsSection.className = 'public-reviews vault-section';
  reviewsSection.id = 'public-reviews';
  reviewsSection.innerHTML = `<div class="beat-listing-heading"><p class="section-kicker">COMMUNITY</p><h2>REVIEWS & COMMENTS</h2></div><div class="public-review-layout"><div id="public-review-list" class="public-review-list" aria-live="polite"><p>Loading reviews...</p></div><form id="public-review-form" class="public-review-form"><h3>Leave a review</h3><div class="review-rating-control"><span id="public-review-rating-label">Rating</span><div class="review-stars" role="group" aria-labelledby="public-review-rating-label"><button type="button" data-review-rating="1" aria-label="1 star" aria-pressed="false">&#9733;</button><button type="button" data-review-rating="2" aria-label="2 stars" aria-pressed="false">&#9733;</button><button type="button" data-review-rating="3" aria-label="3 stars" aria-pressed="false">&#9733;</button><button type="button" data-review-rating="4" aria-label="4 stars" aria-pressed="false">&#9733;</button><button type="button" data-review-rating="5" aria-label="5 stars" aria-pressed="false">&#9733;</button></div><input id="public-review-rating" name="rating" type="hidden" value=""></div><label for="public-review-text">Review</label><textarea id="public-review-text" name="review" rows="3" minlength="3" maxlength="2000" required></textarea><div class="review-login-prompt" id="review-login-prompt"><span>Log in to submit a review.</span><button type="button" id="review-login-button">Log in</button></div><button class="auth-primary-button" id="review-submit-button" type="submit" disabled>Submit</button><p class="request-form-message" id="public-review-message" role="status" aria-live="polite"></p></form></div>`;
  publicMain.append(reviewsSection);
  reviewsSection = document.getElementById('public-reviews');
}
if (reviewsSection) {
  const reviewForm = document.getElementById('public-review-form');
  const reviewRating = document.getElementById('public-review-rating');
  const reviewMessage = document.getElementById('public-review-message');
  let reviewSubmissionId = createSubmissionId();
  document.querySelectorAll('[data-review-rating]').forEach(button => button.addEventListener('click', () => {
    const selectedRating = Number(button.dataset.reviewRating);
    reviewRating.value = String(selectedRating);
    document.querySelectorAll('[data-review-rating]').forEach(star => {
      const isSelected = Number(star.dataset.reviewRating) <= selectedRating;
      star.classList.toggle('selected', isSelected);
      star.setAttribute('aria-pressed', String(isSelected));
    });
  }));
  document.getElementById('review-login-button').addEventListener('click', () => loginButton?.click());
  refreshReviewAccess();
  const loadPublicReviews = async () => {
    const reviewList = document.getElementById('public-review-list');
    try {
      const response = await fetch(`${API}/api/reviews`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reviews are unavailable right now.');
      reviewList.replaceChildren();
      if (!data.reviews?.length) {
        reviewList.innerHTML = '<p>No reviews yet. Be the first to share your thoughts.</p>';
        return;
      }
      data.reviews.forEach(review => {
        const article = document.createElement('article');
        article.className = 'public-review-item';
        const heading = document.createElement('strong');
        heading.textContent = `${review.customer_name} · ${'★'.repeat(Number(review.rating) || 0)}`;
        const text = document.createElement('p');
        text.textContent = review.review_text;
        article.append(heading, text);
        reviewList.append(article);
      });
    } catch (error) {
      showRetryState(reviewList, error.message || 'Reviews are unavailable right now.', loadPublicReviews);
    }
  };
  loadPublicReviews();
  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = event.submitter || document.getElementById('review-submit-button');
    if (submitButton?.dataset.busy === 'true') return;
    const stopBusy = window.startActionBusy(submitButton, 'Submitting…');
    try {
      await customerSessionReady;
      if (!customerUser?.name || !customerUser?.email) {
        reviewMessage.textContent = 'Please log in before submitting a review.';
        reviewMessage.classList.add('error');
        return;
      }
      if (!reviewRating.value) {
        reviewMessage.textContent = 'Choose a star rating first.';
        reviewMessage.classList.add('error');
        return;
      }
      reviewMessage.classList.remove('error');
      const response = await fetch(`${API}/api/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: Number(reviewRating.value), review: document.getElementById('public-review-text').value, submissionId: reviewSubmissionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit review.');
      reviewMessage.textContent = data.message;
      reviewForm.reset();
      reviewRating.value = '';
      document.querySelectorAll('[data-review-rating]').forEach(star => { star.classList.remove('selected'); star.setAttribute('aria-pressed', 'false'); });
      reviewSubmissionId = createSubmissionId();
    } catch (error) {
      reviewMessage.textContent = error.message || 'Could not submit review.';
      reviewMessage.classList.add('error');
    } finally {
      stopBusy?.();
      refreshReviewAccess();
    }
  });
}

const getLicenseSlides = () => document.querySelectorAll('.license-slide');
const licensePrevious = document.getElementById('license-prev');
const licenseNext = document.getElementById('license-next');
const licenseSlideFrame = document.querySelector('.license-slide-frame');
const licenseDefinitionDots = document.getElementById('license-definition-dots');
let activeLicenseSlide = 0;

function updateActiveLicenseSlide(slideIndex, shouldScroll = true) {
  const licenseSlides = getLicenseSlides();
  if (!licenseSlides.length) return;
  activeLicenseSlide = (slideIndex + licenseSlides.length) % licenseSlides.length;
  licenseSlides.forEach((slide, index) => {
    const isActive = index === activeLicenseSlide;
    const isPrevious = index === (activeLicenseSlide - 1 + licenseSlides.length) % licenseSlides.length;
    const isNext = index === (activeLicenseSlide + 1) % licenseSlides.length;
    slide.classList.toggle('active', isActive);
    slide.classList.toggle('is-previous', isPrevious);
    slide.classList.toggle('is-next', isNext);
  });
  licenseDefinitionDots?.querySelectorAll('.license-dot').forEach((dot, index) => {
    const isActive = index === activeLicenseSlide;
    dot.classList.toggle('active', isActive);
    dot.setAttribute('aria-pressed', String(isActive));
  });
  if (shouldScroll && licenseSlideFrame) {
    const slide = licenseSlides[activeLicenseSlide];
    const frameRect = licenseSlideFrame.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const targetLeft = licenseSlideFrame.scrollLeft + (slideRect.left - frameRect.left) - (licenseSlideFrame.clientWidth - slideRect.width) / 2;
    licenseSlideFrame.scrollTo({
      left: targetLeft,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
}

licensePrevious?.addEventListener('click', () => updateActiveLicenseSlide(activeLicenseSlide - 1));
licenseNext?.addEventListener('click', () => updateActiveLicenseSlide(activeLicenseSlide + 1));
licenseDefinitionDots?.addEventListener('click', event => {
  const dot = event.target.closest('.license-dot');
  if (dot) updateActiveLicenseSlide(Number(dot.dataset.slide));
});

let licenseScrollFrame;
licenseSlideFrame?.addEventListener('scroll', () => {
  cancelAnimationFrame(licenseScrollFrame);
  licenseScrollFrame = requestAnimationFrame(() => {
    const licenseSlides = getLicenseSlides();
    if (!licenseSlides.length) return;
    const frameCenter = licenseSlideFrame.getBoundingClientRect().left + licenseSlideFrame.clientWidth / 2;
    let closestIndex = activeLicenseSlide;
    let closestDistance = Infinity;
    licenseSlides.forEach((slide, index) => {
      const slideBox = slide.getBoundingClientRect();
      const distance = Math.abs(slideBox.left + slideBox.width / 2 - frameCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    updateActiveLicenseSlide(closestIndex, false);
  });
});

updateActiveLicenseSlide(0);

document.getElementById('license-browser')?.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') updateActiveLicenseSlide(activeLicenseSlide - 1);
  if (event.key === 'ArrowRight') updateActiveLicenseSlide(activeLicenseSlide + 1);
});

async function loadPublicLicenseDefinitions() {
  if (!licenseSlideFrame) return;
  licenseSlideFrame.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${API}/api/license-definitions`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load license definitions.');
    const definitions = data.definitions || [];
    if (!definitions.length) {
      licenseSlideFrame.innerHTML = '<p class="filter-empty-state">No license options are currently available.</p>';
      licenseDefinitionDots?.replaceChildren();
      return;
    }

    licenseSlideFrame.replaceChildren(...definitions.map((definition, index) => {
      const rights = definition.rights || {};
      const details = [
        `Formats: ${(rights.formats || []).map(format => String(format).toUpperCase()).join(', ') || 'Not specified'}`,
        `Commercial use: ${rights.commercialUse ? 'Allowed' : 'Not allowed'}`,
        `Distribution: ${rights.distribution ? 'Allowed' : 'Not allowed'}`,
        `Stems: ${rights.stems ? 'Included' : 'Not included'}`
      ];
      if (rights.resaleProhibited) details.push('Resale of the beat is prohibited');
      Object.entries(rights.usageLimits || {}).forEach(([name, limit]) => {
        details.push(`${name.replace(/[_-]/g, ' ')}: ${limit === null ? 'Unlimited' : limit}`);
      });
      (rights.distributionRules || []).forEach(rule => details.push(rule));

      const slide = document.createElement('article');
      slide.className = `license-slide${index === 0 ? ' active' : ''}`;
      slide.dataset.slide = String(index);
      slide.innerHTML = `<div class="license-card">
        <div class="license-card-heading"><span class="license-badge">${escapeHTML(definition.type)}</span><h3>${escapeHTML(definition.type)} rights</h3></div>
        <ul>${details.map(detail => `<li>${escapeHTML(detail)}</li>`).join('')}</ul>
        <a class="license-browse-button" href="/beats.html?license=${encodeURIComponent(definition.type)}">Browse ${escapeHTML(definition.type)} beats</a>
      </div>`;
      return slide;
    }));

    licenseDefinitionDots?.replaceChildren(...definitions.map((definition, index) => {
      const dot = document.createElement('button');
      dot.className = `license-dot${index === 0 ? ' active' : ''}`;
      dot.type = 'button';
      dot.setAttribute('aria-label', `Show ${definition.type} rights`);
      dot.setAttribute('aria-pressed', String(index === 0));
      dot.dataset.slide = String(index);
      return dot;
    }));
    updateActiveLicenseSlide(0, false);
  } catch (error) {
    showRetryState(licenseSlideFrame, error.message || 'Could not load license options.', loadPublicLicenseDefinitions);
  } finally {
    licenseSlideFrame.setAttribute('aria-busy', 'false');
  }
}
loadPublicLicenseDefinitions();

const merchandiseTrack = document.getElementById('merchandise-track');
const merchandiseCards = document.querySelectorAll('.merchandise-card');
const merchandiseDots = document.querySelectorAll('.merchandise-dot');
const merchandisePrevious = document.getElementById('merchandise-prev');
const merchandiseNext = document.getElementById('merchandise-next');
let activeMerchandiseSlide = 0;

function updateMerchandiseSlide(slideIndex) {
  if (!merchandiseCards.length) return;
  activeMerchandiseSlide = (slideIndex + merchandiseCards.length) % merchandiseCards.length;
  merchandiseCards.forEach((card, index) => {
    const relativePosition = (index - activeMerchandiseSlide + merchandiseCards.length) % merchandiseCards.length;
    card.classList.toggle('active', relativePosition === 0);
    card.classList.toggle('is-previous', relativePosition === merchandiseCards.length - 1);
    card.classList.toggle('is-next', relativePosition === 1);
    card.classList.toggle('is-hidden', relativePosition > 1 && relativePosition < merchandiseCards.length - 1);
  });
  merchandiseDots.forEach((dot, index) => {
    const isActive = index === activeMerchandiseSlide;
    dot.classList.toggle('active', isActive);
    dot.setAttribute('aria-selected', String(isActive));
  });
}

merchandisePrevious?.addEventListener('click', () => updateMerchandiseSlide(activeMerchandiseSlide - 1));
merchandiseNext?.addEventListener('click', () => updateMerchandiseSlide(activeMerchandiseSlide + 1));
merchandiseDots.forEach(dot => {
  dot.addEventListener('click', () => updateMerchandiseSlide(Number(dot.dataset.merchandiseSlide)));
});

merchandiseTrack?.addEventListener('wheel', event => {
  if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
  event.preventDefault();
  updateMerchandiseSlide(activeMerchandiseSlide + (event.deltaX > 0 ? 1 : -1));
}, { passive: false });

let merchandiseDragStart;
merchandiseTrack?.addEventListener('pointerdown', event => {
  merchandiseDragStart = event.clientX;
  merchandiseTrack.setPointerCapture(event.pointerId);
});
merchandiseTrack?.addEventListener('pointerup', event => {
  if (merchandiseDragStart === undefined) return;
  const dragDistance = event.clientX - merchandiseDragStart;
  if (Math.abs(dragDistance) > 40) {
    updateMerchandiseSlide(activeMerchandiseSlide + (dragDistance < 0 ? 1 : -1));
  }
  merchandiseDragStart = undefined;
});

document.getElementById('merchandise')?.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') updateMerchandiseSlide(activeMerchandiseSlide - 1);
  if (event.key === 'ArrowRight') updateMerchandiseSlide(activeMerchandiseSlide + 1);
});

updateMerchandiseSlide(0);

// Hero images. WebP variants are generated by backend/scripts/optimize-images.js.
const heroImages = [
  { png: '/Images/Hero1.png', webp: '/Images/Hero1.webp' },
  { png: '/Images/Hero2.png', webp: '/Images/Hero2.webp' },
  { png: '/Images/Hero3.png', webp: '/Images/Hero3.webp' },
  { png: '/Images/Hero4.png', webp: '/Images/Hero4.webp' },
  { png: '/Images/Hero5.png', webp: '/Images/Hero5.webp' }
];

let currentIndex = 0;
let heroRotationTimer;
let heroPrefetchTimer;
const heroSection = document.querySelector('.hero');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function preloadHeroImage(index) {
  const image = heroImages[index % heroImages.length];
  if (!image?.webp) return;
  const preload = new Image();
  preload.decoding = 'async';
  preload.src = image.webp;
}

function changeBackground() {
  if (!heroSection) return;
  const image = heroImages[currentIndex];
  heroSection.style.setProperty('--hero-bg', `url("${image.png}")`);
  heroSection.style.setProperty('--hero-bg-webp', `url("${image.webp}")`);
  currentIndex = (currentIndex + 1) % heroImages.length;
  window.clearTimeout(heroPrefetchTimer);
  heroPrefetchTimer = window.setTimeout(() => preloadHeroImage(currentIndex), 1200);
}

function startHeroRotation() {
  if (!heroSection || reducedMotionQuery.matches || heroRotationTimer || document.hidden) return;
  heroRotationTimer = window.setInterval(changeBackground, 5000);
}

function stopHeroRotation() {
  window.clearInterval(heroRotationTimer);
  heroRotationTimer = undefined;
}

if (heroSection) {
  changeBackground();
  if (document.readyState === 'complete') startHeroRotation();
  else window.addEventListener('load', startHeroRotation, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHeroRotation();
    else startHeroRotation();
  });
  const handleReducedMotionChange = () => {
    if (reducedMotionQuery.matches) stopHeroRotation();
    else startHeroRotation();
  };
  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
  } else if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange);
  }
}
