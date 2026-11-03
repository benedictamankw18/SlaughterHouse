window.ULTBIGBOY_API_URL = window.ULTBIGBOY_API_URL || new URLSearchParams(location.search).get('apiBaseUrl') || `${location.protocol}//${location.hostname}:3000`;
const API = window.ULTBIGBOY_API_URL;
// Toggle menu open/close
const menuIcon = document.getElementById('menuIcon');
const dropdownMenu = document.getElementById('dropdownMenu');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const siteSearch = document.getElementById('site-search');

siteSearch?.closest('.search-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const query = siteSearch.value.trim();
  if (!query) {
    siteSearch.focus();
    return;
  }
  window.location.href = `beats.html?search=${encodeURIComponent(query)}#beat-listing`;
});

const loginButton = document.querySelector('.login-button');
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
  const loggedIn = Boolean(customerUser?.name && customerUser?.email && sessionStorage.getItem('customerToken'));
  loginPrompt.hidden = loggedIn;
  submitButton.disabled = !loggedIn;
}

if (loginButton) {
  const authPanel = document.createElement('div');
  authPanel.className = 'auth-panel';
  authPanel.hidden = true;
  authPanel.innerHTML = `
    <div class="auth-panel-header">
      <div><p class="section-kicker">Account</p><h2>Welcome back</h2></div>
      <button class="auth-close-button" type="button" aria-label="Close account panel">&#10005;</button>
    </div>
    <div class="auth-view active" data-auth-view="login">
      <form class="auth-form" id="login-form">
        <label for="login-identifier">Email or phone number</label>
        <input id="login-identifier" name="identifier" type="text" autocomplete="username" placeholder="Email or +233..." required>
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        <button class="auth-primary-button" type="submit">Log in</button>
        <button class="auth-link-button" id="forgot-password-button" type="button">Forgot password?</button>
        <button class="auth-link-button" data-auth-switch="signup" type="button">Create an account</button>
        <p class="auth-message" id="login-message" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div class="auth-view" data-auth-view="account">
      <div class="auth-account-summary">
        <p class="section-kicker">Signed in</p>
        <h2 id="auth-account-name"></h2>
        <p id="auth-account-email"></p>
        <div class="account-dashboard">
          <div class="account-dashboard-tabs" role="tablist" aria-label="Account history">
            <button type="button" class="account-dashboard-tab active" data-account-tab="purchases">Purchases</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="licenses">Licenses</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="downloads">Downloads</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="wishlist">Wishlist</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="bookings">Bookings</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="profile">Profile</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="orders">Orders</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="notifications">Alerts</button>
            <button type="button" class="account-dashboard-tab" data-account-tab="requests">Requests</button>
          </div>
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
        <div class="phone-field"><select id="signup-country-code" aria-label="Country code"><option value="+233">GH +233</option><option value="+1">US +1</option><option value="+44">UK +44</option><option value="+234">NG +234</option></select><input id="signup-phone" name="phone" type="tel" autocomplete="tel" placeholder="24 000 0000" required></div>
        <div id="address-field" hidden><label for="signup-address">Address</label><textarea id="signup-address" name="address" rows="2" autocomplete="street-address"></textarea></div>
        <label for="signup-password">Password</label>
        <input id="signup-password" name="password" type="password" minlength="8" pattern="[A-Za-z0-9]{8,}" autocomplete="new-password" required>
        <label for="signup-confirm-password">Confirm password</label>
        <input id="signup-confirm-password" name="confirmPassword" type="password" minlength="8" pattern="[A-Za-z0-9]{8,}" autocomplete="new-password" required>
        <p class="auth-password-hint">At least 8 characters, letters and numbers only.</p>
        <button class="auth-primary-button" type="submit">Create account</button>
        <button class="auth-link-button" data-auth-switch="login" type="button">Already have an account? Log in</button>
        <p class="auth-message" id="signup-message" role="status" aria-live="polite"></p>
      </form>
    </div>`;
  loginButton.insertAdjacentElement('afterend', authPanel);

  const setAuthView = view => {
    authPanel.querySelectorAll('.auth-view').forEach(panel => panel.classList.toggle('active', panel.dataset.authView === view));
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
  const refreshAuthPanel = () => {
    const loggedIn = Boolean(customerUser?.name && customerUser?.email && sessionStorage.getItem('customerToken'));
    loginButton.textContent = loggedIn ? 'Account' : 'Login';
    loginButton.setAttribute('aria-label', loggedIn ? `Open account for ${customerUser.name}` : 'Open login');
    if (loggedIn) {
      document.getElementById('auth-account-name').textContent = customerUser.name;
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
      if (type === 'profile') return `<form class="account-profile-form" id="account-profile-form">
        <label>First name<input name="firstName" value="${escapeHTML(items.firstName)}" required></label>
        <label>Last name<input name="lastName" value="${escapeHTML(items.lastName)}" required></label>
        <label>Phone<input name="phone" value="${escapeHTML(items.phone)}" required></label>
        ${items.role === 'artist' ? `<label>Artist name<input name="artistName" value="${escapeHTML(items.artistName)}" required></label>` : `<label>Address<textarea name="address" rows="2" required>${escapeHTML(items.address)}</textarea></label>`}
        <button class="auth-primary-button" type="submit">Save profile</button>
        <p class="auth-message" data-profile-message role="status"></p>
      </form>`;
      if (type === 'orders') return `<article><strong>${escapeHTML(item.reference)}</strong><span>${escapeHTML(item.status)} · ${accountFormatMoney(item.amount)} · ${escapeHTML(item.created_at || '')}</span><span>${item.items.map(orderItem => escapeHTML(orderItem.product_name || 'Item')).join(', ')}</span></article>`;
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
      const response = await fetch(`${API}${config.endpoint}`, { credentials: 'include', headers: { Authorization: `Bearer ${sessionStorage.getItem('customerToken') || ''}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load account history.');
      renderAccountHistory(type, type === 'profile' ? data[config.key] : data[config.key] || []);
      if (type === 'profile') {
        const form = document.getElementById('account-profile-form');
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const message = form.querySelector('[data-profile-message]');
          const button = form.querySelector('button');
          button.disabled = true;
          try {
            const response = await fetch(`${API}/api/auth/profile`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('customerToken') || ''}` },
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
            button.disabled = false;
          }
        });
      }
    } catch (error) {
      content.innerHTML = `<p class="auth-message error">${escapeHTML(error.message)}</p>`;
    }
  };
  authPanel.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', () => {
    authPanel.querySelectorAll('[data-account-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
    loadAccountHistory(button.dataset.accountTab);
  }));
  document.addEventListener('click', async event => {
    const certificateButton = event.target.closest('[data-license-certificate]');
    if (certificateButton) {
      certificateButton.disabled = true;
      try {
        const response = await fetch(`${API}/api/customer/licenses/${certificateButton.dataset.licenseCertificate}/certificate`, { credentials: 'include', headers: { Authorization: `Bearer ${sessionStorage.getItem('customerToken') || ''}` } });
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
        certificateButton.textContent = error.message;
      } finally {
        certificateButton.disabled = false;
      }
      return;
    }
    const button = event.target.closest('[data-mark-notification-read]');
    if (!button) return;
    const card = button.closest('[data-notification-id]');
    button.disabled = true;
    try {
      await fetch(`${API}/api/customer/notifications/${card.dataset.notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { Authorization: `Bearer ${sessionStorage.getItem('customerToken') || ''}` }
      });
      card.classList.remove('account-notification-unread');
      button.remove();
    } catch {
      button.disabled = false;
    }
  });

  loginButton.addEventListener('click', () => {
    authPanel.hidden = !authPanel.hidden;
    loginButton.setAttribute('aria-expanded', String(!authPanel.hidden));
    if (!authPanel.hidden) {
      const loggedIn = refreshAuthPanel();
      setAuthView(loggedIn ? 'account' : 'login');
      if (loggedIn) loadAccountHistory('purchases');
    }
  });
  authPanel.querySelector('.auth-close-button').addEventListener('click', () => {
    authPanel.hidden = true;
    loginButton.setAttribute('aria-expanded', 'false');
  });
  authPanel.querySelectorAll('[data-auth-switch]').forEach(button => button.addEventListener('click', () => setAuthView(button.dataset.authSwitch)));
  authPanel.querySelectorAll('.auth-role-button').forEach(button => button.addEventListener('click', () => setSignupRole(button.dataset.role)));
  authPanel.querySelector('#forgot-password-button').addEventListener('click', () => setAuthMessage('login-message', 'Password reset is not available yet. Please contact the producer.'));
  authPanel.querySelector('#logout-button').addEventListener('click', async () => {
    const token = sessionStorage.getItem('customerToken');
    const logoutMessage = document.getElementById('logout-message');
    try {
      if (token) {
        const response = await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok && response.status !== 401) throw new Error('Could not end the session.');
      }
      logoutMessage.textContent = 'You are logged out.';
      logoutMessage.classList.remove('error');
    } catch (error) {
      logoutMessage.textContent = error.message || 'Could not end the session.';
      logoutMessage.classList.add('error');
    } finally {
      customerUser = null;
      sessionStorage.removeItem('customerUser');
      sessionStorage.removeItem('customerToken');
      refreshReviewAccess();
      refreshAuthPanel();
      setAuthView('login');
    }
  });

  authPanel.querySelector('#signup-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) return setAuthMessage('signup-message', 'Passwords do not match.');
    const phone = `${document.getElementById('signup-country-code').value}${String(form.get('phone')).replace(/\D/g, '')}`;
    try {
      const result = await fetch(`${API}/api/auth/signup`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(form), phone }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setAuthMessage('signup-message', 'Account created. You can now log in.', false);
      event.currentTarget.reset();
      setSignupRole('artist');
    } catch (error) {
      setAuthMessage('signup-message', error.message || 'Could not create the account.');
    }
  });

  authPanel.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const adminResult = await fetch(`${API}/api/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.identifier, password: form.password }) });
      if (adminResult.ok) {
        const adminData = await adminResult.json();
        sessionStorage.setItem('adminToken', adminData.token);
        window.location.href = 'admin.html';
        return;
      }
      const result = await fetch(`${API}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      customerUser = data.user;
      sessionStorage.setItem('customerUser', JSON.stringify(customerUser));
      sessionStorage.setItem('customerToken', data.token);
      refreshAuthPanel();
      loadAccountHistory('purchases');
      setAuthMessage('login-message', `Welcome, ${data.user.name}.`, false);
      refreshReviewAccess();
    } catch (error) {
      setAuthMessage('login-message', error.message || 'Could not log in.');
    }
  });

  refreshAuthPanel();
}

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
  updateBeatPrices();
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
  const savedVolume = Number(localStorage.getItem(previewVolumeKey));
  if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) audio.volume = savedVolume;
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
    try { localStorage.setItem(previewVolumeKey, String(audio.volume)); } catch {}
  });

  coverButton.addEventListener('click', () => {
    document.querySelectorAll('.beat-audio').forEach(otherAudio => {
      if (otherAudio !== audio) {
        otherAudio.pause();
        otherAudio.currentTime = 0;
      }
    });

    if (audio.paused) {
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

// Beat prices use USD as the base currency.
const rates = {
  GHS: 10,
  USD: 1,
  GBP: 0.79
};

const cartStorageKey = 'ultbigboyCart';
let cart = [];
try {
  const savedCart = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
  if (Array.isArray(savedCart)) {
    cart = savedCart.filter(item => item && typeof item.name === 'string' && (typeof item.license === 'string' || item.type === 'merchandise') && Number.isFinite(item.price) && typeof item.cover === 'string' && typeof item.selected === 'boolean');
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
  USD: '$',
  GBP: '£'
};

function updateBeatPrices() {
  document.querySelectorAll('.beat-card').forEach(card => {
    const licenseSelect = card.querySelector('.license-select');
    const priceElement = card.querySelector('.beat-price');
    if (!licenseSelect || !priceElement) {
      return;
    }
    const selectedLicense = licenseSelect.options[licenseSelect.selectedIndex];
    const basePrice = Number(selectedLicense.dataset.price);
    const convertedPrice = (basePrice * rates[currentCurrency]).toFixed(2);
    priceElement.textContent = `${currencySymbols[currentCurrency]}${convertedPrice} ${currentCurrency}`;
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

const catalogFilter = document.getElementById('beats-filter');
const catalogCards = document.querySelectorAll('#beat-list .beat-card');
const catalogPageButtons = document.querySelectorAll('.beat-pagination:not(.produced-pagination) .beat-page-button');
const catalogPageSize = 11;
let currentCatalogPage = 1;
const requestedGenre = new URLSearchParams(window.location.search).get('genre')?.toLowerCase();
const requestedSearch = new URLSearchParams(window.location.search).get('search')?.trim().toLowerCase() || '';
if (siteSearch && requestedSearch) siteSearch.value = requestedSearch;
if (requestedGenre && catalogFilter) {
  const genreValue = requestedGenre === 'rap' ? 'hiphop' : requestedGenre;
  const genreSelect = document.getElementById('catalog-genre');
  if ([...genreSelect.options].some(option => option.value === genreValue)) genreSelect.value = genreValue;
}

function renderCatalogPage() {
  const matchingCards = Array.from(catalogCards).filter(card => card.dataset.filterMatch !== 'false');
  const pageCount = Math.max(1, Math.ceil(matchingCards.length / catalogPageSize));
  const resultCount = document.getElementById('beat-result-count');
  if (resultCount) {
    resultCount.textContent = `${matchingCards.length} ${matchingCards.length === 1 ? 'beat' : 'beats'} found`;
  }
  const catalogList = document.getElementById('beat-list');
  let emptyState = document.getElementById('catalog-empty-state');
  if (!matchingCards.length && catalogList) {
    if (!emptyState) {
      emptyState = document.createElement('p');
      emptyState.id = 'catalog-empty-state';
      emptyState.className = 'filter-empty-state';
      emptyState.textContent = 'No beats match those filters. Try broadening your search.';
      catalogList.appendChild(emptyState);
    }
  } else {
    emptyState?.remove();
  }
  currentCatalogPage = Math.min(currentCatalogPage, pageCount);
  const firstCard = (currentCatalogPage - 1) * catalogPageSize;
  const lastCard = firstCard + catalogPageSize;

  catalogCards.forEach(card => {
    const cardIndex = matchingCards.indexOf(card);
    const shouldHide = cardIndex < firstCard || cardIndex >= lastCard || card.dataset.filterMatch === 'false';
    card.hidden = shouldHide;
    card.classList.toggle('is-paginated-hidden', shouldHide);
  });

  catalogPageButtons.forEach(button => {
    const page = Number(button.dataset.page);
    const isActive = page === currentCatalogPage;
    button.hidden = page > pageCount;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function applyCatalogFilters() {
  if (!catalogFilter) {
    return;
  }

  const minBpm = Number(document.getElementById('catalog-bpm-min').value) || 0;
  const maxBpm = Number(document.getElementById('catalog-bpm-max').value) || Infinity;
  const genre = document.getElementById('catalog-genre').value;
  const mood = document.getElementById('catalog-mood').value;
  const search = requestedSearch;

  catalogCards.forEach(card => {
    const cardBpm = Number(card.dataset.bpm);
    const matchesBpm = !card.dataset.bpm || (cardBpm >= minBpm && cardBpm <= maxBpm);
    const matchesGenre = !genre || card.dataset.genre === genre;
    const matchesKey = !selectedNote || card.dataset.key === selectedNote;
    const matchesMode = !selectedNote || card.dataset.keyMode === selectedMode;
    const matchesMood = !mood || card.dataset.mood === mood;
    const searchableText = card.textContent.toLowerCase();
    const matchesSearch = !search || searchableText.includes(search);
    card.dataset.filterMatch = String(matchesBpm && matchesGenre && matchesKey && matchesMode && matchesMood && matchesSearch);
  });

  currentCatalogPage = 1;
  renderCatalogPage();
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
  applyCatalogFilters();
}

document.getElementById('apply-beat-filters')?.addEventListener('click', applyCatalogFilters);
document.getElementById('clear-beat-filters')?.addEventListener('click', clearCatalogFilters);

catalogPageButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentCatalogPage = Number(button.dataset.page);
    renderCatalogPage();
  });
});

if (catalogFilter) {
  applyCatalogFilters();
}

const producedSongCards = Array.from(document.querySelectorAll('.produced-song-card'));
const producedPagination = document.querySelector('.produced-pagination');
const producedPageSize = 10;
if (producedPagination && producedSongCards.length) {
  let currentProducedPage = 1;
  const producedPageCount = Math.ceil(producedSongCards.length / producedPageSize);
  const renderProducedPage = page => {
    currentProducedPage = Math.min(Math.max(1, page), producedPageCount);
    const firstSong = (currentProducedPage - 1) * producedPageSize;
    producedSongCards.forEach((card, index) => {
      card.hidden = index < firstSong || index >= firstSong + producedPageSize;
    });
    const pageButtons = Array.from({ length: producedPageCount }, (_, index) => {
      const button = document.createElement('button');
      const pageNumber = index + 1;
      const isActive = pageNumber === currentProducedPage;
      button.className = `beat-page-button${isActive ? ' active' : ''}`;
      button.type = 'button';
      button.textContent = String(pageNumber);
      button.setAttribute('aria-label', `Production songs page ${pageNumber}`);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
      button.addEventListener('click', () => renderProducedPage(pageNumber));
      return button;
    });
    producedPagination.replaceChildren(...pageButtons);
  };
  renderProducedPage(1);
}

function addToCart(item) {
  cart.push(item);
  updateCart();
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
  if (!cartItems || !cartEmpty || !cartTotal) return;
  cartItems.innerHTML = "";
  let total = 0;
  let selectedCount = 0;

  cart.forEach((item, index) => {
    if (item.selected) {
      total += item.price;
      selectedCount += 1;
    }
    const li = document.createElement("li");
    li.className = 'cart-item';
    const itemKind = item.type === 'merchandise' ? 'Merchandise' : `${item.license} license`;
    li.innerHTML = `<img class="cart-item-cover" src="${escapeHTML(item.cover || 'Images/Logo 2.png')}" alt="${escapeHTML(item.name)} cover art"><label class="cart-item-select"><input type="checkbox" data-cart-index="${index}" ${item.selected ? 'checked' : ''} aria-label="Select ${escapeHTML(item.name)} for checkout"><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(itemKind)}</small></span></label><span class="cart-item-actions"><strong>${convertPrice(item.price)}</strong><button type="button" class="cart-remove-button" data-cart-index="${index}" aria-label="Remove ${escapeHTML(item.name)}" title="Remove item">&#128465;</button></span>`;
    cartItems.appendChild(li);
  });

  cartTotal.textContent = convertPrice(total);
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

function switchCurrency() {
  currentCurrency = currencySelect ? currencySelect.value : currentCurrency;
  updateBeatPrices();
  updateCart();

  // Update all product prices on the page
  document.querySelectorAll(".product").forEach(product => {
    const basePrice = product.getAttribute("data-price");
    product.querySelector(".price").textContent = convertPrice(basePrice);
  });
}

function convertPrice(price) {
  const converted = (price * rates[currentCurrency]).toFixed(2);
  return `${currencySymbols[currentCurrency]}${converted} ${currentCurrency}`;
}

async function loadDatabaseBeatCatalog() {
  const catalogList = document.getElementById('beat-list');
  if (!catalogList || !document.querySelector('.catalog-page')) return;
  const query = new URLSearchParams({
    page: '1',
    pageSize: '50',
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
    catalogList.replaceChildren(...data.beats.map(beat => {
      const card = document.createElement('article');
      const prices = beat.prices || {};
      const cover = beat.coverArt ? `${API}/api/uploads/${encodeURIComponent(beat.coverArt)}` : 'Images/Logo 2.png';
      const preview = beat.previewUrl || (beat.previewFile ? `${API}/api/uploads/${encodeURIComponent(beat.previewFile)}` : '');
      card.className = 'beat-card';
      card.dataset.bpm = beat.bpm || '';
      card.dataset.key = String(beat.musicalKey || '').toLowerCase();
      card.dataset.genre = String(beat.genre || '').toLowerCase();
      card.dataset.mood = String(beat.mood || '').toLowerCase();
      const duration = beat.previewDurationSeconds ? ` • ${Math.floor(beat.previewDurationSeconds / 60)}:${String(beat.previewDurationSeconds % 60).padStart(2, '0')}` : '';
      card.innerHTML = `<button class="beat-cover" type="button" aria-label="Play ${escapeHTML(beat.title)} preview"><img src="${escapeHTML(cover)}" alt="${escapeHTML(beat.title)} cover art"><span class="play-icon" aria-hidden="true">&#9654;</span></button><div class="beat-details"><h3>${escapeHTML(beat.title)}</h3><p class="beat-meta"><span class="meta-item">${escapeHTML(beat.bpm || '—')} BPM</span><span class="meta-item">${escapeHTML(beat.musicalKey || 'Key not set')}</span><span class="meta-item">${escapeHTML(beat.genre || 'Genre not set')}</span><span class="meta-item">${escapeHTML(beat.mood || 'Mood not set')}</span><span class="meta-item">${duration}</span></p><audio class="beat-audio" src="${escapeHTML(preview)}" preload="none"></audio><label class="license-label">License Type</label><select class="license-select">${Object.entries(prices).map(([license, price]) => `<option value="${license}" data-price="${Number(price)}">${license[0].toUpperCase() + license.slice(1)}</option>`).join('')}</select></div><div class="beat-purchase"><strong class="beat-price"></strong><button class="beat-cart-button" type="button" aria-label="Add ${escapeHTML(beat.title)} to cart"><span aria-hidden="true">&#128722;</span></button></div>`;
      card.dataset.productId = beat.id;
      setupPreviewCard(card);
      return card;
    }));
    document.getElementById('beat-result-count').textContent = `${data.beats.length} ${data.beats.length === 1 ? 'beat' : 'beats'} found`;
    catalogList.querySelectorAll('.license-select').forEach(select => select.addEventListener('change', updateBeatPrices));
    catalogList.querySelectorAll('.beat-cart-button').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.beat-card');
      const select = card.querySelector('.license-select');
      const option = select.options[select.selectedIndex];
      addToCart({ type: 'beat', productId: Number(card.dataset.productId), name: card.querySelector('h3').textContent, license: option.value, price: Number(option.dataset.price), cover: card.querySelector('img')?.src || '', selected: true });
      showCartToast('Beat added to cart.');
    }));
    updateBeatPrices();
  } catch (error) {
    catalogList.innerHTML = `<p class="filter-empty-state">${escapeHTML(error.message)}</p>`;
  }
}

async function loadFeaturedBeatCatalog() {
  const catalogList = document.getElementById('beat-list');
  if (!catalogList || document.querySelector('.catalog-page')) return;
  try {
    const response = await fetch(`${API}/api/beats?page=1&pageSize=6`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load featured beats.');
    catalogList.replaceChildren(...data.beats.map(beat => {
      const card = document.createElement('article');
      const prices = beat.prices || {};
      const cover = beat.coverArt ? `${API}/api/uploads/${encodeURIComponent(beat.coverArt)}` : 'Images/Logo 2.png';
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
      setupPreviewCard(card);
      return card;
    }));
    catalogList.querySelectorAll('.license-select').forEach(select => select.addEventListener('change', updateBeatPrices));
    catalogList.querySelectorAll('.beat-cart-button').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.beat-card');
      const select = card.querySelector('.license-select');
      const option = select.options[select.selectedIndex];
      addToCart({ type: 'beat', productId: Number(card.dataset.productId), name: card.querySelector('h3').textContent, license: option.value, price: Number(option.dataset.price), cover: card.querySelector('img')?.src || '', selected: true });
      setCartOpen(true);
      showCartToast('Beat added to cart.');
    }));
    updateBeatPrices();
  } catch (error) {
    catalogList.innerHTML = `<p class="filter-empty-state">${escapeHTML(error.message)}</p>`;
  }
}

document.getElementById('apply-beat-filters')?.addEventListener('click', loadDatabaseBeatCatalog);
document.getElementById('clear-beat-filters')?.addEventListener('click', () => setTimeout(loadDatabaseBeatCatalog, 0));
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
    submitButton.disabled = true;
    try {
      const response = await fetch(`${API}/api/payments/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: customerUser?.name || 'Guest Customer', email: paymentEmail, items: currentSelectedItems, paymentMethod }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start payment.');
      window.location.href = data.authorizationUrl;
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('error');
      submitButton.disabled = false;
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

const merchandiseList = document.getElementById('public-merchandise-list');
if (merchandiseList) {
  fetch(`${API}/api/merchandise`).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load merchandise.');
    merchandiseList.replaceChildren();
    data.merchandise.forEach(product => {
      const card = document.createElement('article');
      card.className = 'storefront-merchandise-item';
      const image = document.createElement('img');
      image.src = product.photo ? `${API}/api/uploads/${encodeURIComponent(product.photo)}` : 'Images/Logo 2.png';
      image.alt = `${product.title} merchandise`;
      const details = document.createElement('div');
      details.className = 'storefront-merchandise-details';
      const title = document.createElement('h3');
      title.textContent = product.title;
      const description = document.createElement('p');
      description.textContent = product.description || '';
      const price = document.createElement('strong');
      price.textContent = `GHS ${Number(product.price).toFixed(2)}`;
      const button = document.createElement('button');
      button.className = 'merchandise-submit-button';
      button.type = 'button';
      const finiteStock = product.stockQuantity !== null && product.stockQuantity !== undefined;
      const outOfStock = finiteStock && Number(product.stockQuantity) < 1;
      button.textContent = outOfStock ? 'Out of stock' : 'Add to cart';
      button.disabled = outOfStock;
      button.addEventListener('click', () => {
        if (outOfStock) return;
        addToCart({ type: 'merchandise', productId: product.id, name: product.title, price: Number(product.price) / rates.GHS, cover: image.src, selected: true });
        setCartOpen(true);
        showCartToast('Merchandise added.');
      });
      details.append(title, description, price, button);
      card.append(image, details);
      merchandiseList.append(card);
    });
    if (!data.merchandise.length) merchandiseList.innerHTML = '<p>No merchandise is available to order yet.</p>';
  }).catch(() => { merchandiseList.innerHTML = '<p>Merchandise could not be loaded right now.</p>'; });
}

const beatRequestForm = document.getElementById('beat-request-form');
const beatRequestLicense = document.getElementById('beat-request-license');
const beatRequestLicensePrice = document.getElementById('beat-request-license-price');
let beatRequestLicensePrices = {};

function updateBeatRequestLicensePrice() {
  const price = beatRequestLicensePrices[beatRequestLicense?.value];
  beatRequestLicensePrice.textContent = Number.isFinite(price)
    ? `License request price: GHS ${price.toFixed(2)}`
    : 'Choose a license to see its price.';
}

if (beatRequestLicense && beatRequestLicensePrice) {
  beatRequestLicense.addEventListener('change', updateBeatRequestLicensePrice);
  fetch(`${API}/api/requests/beat-license-prices`)
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load license prices.');
      beatRequestLicensePrices = data.prices || {};
      updateBeatRequestLicensePrice();
    })
    .catch(() => {
      beatRequestLicensePrice.textContent = 'License prices are unavailable right now. Please try again later.';
      beatRequestLicensePrice.classList.add('error');
    });
}

beatRequestForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('beat-request-message');
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
    const response = await fetch(`${API}/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestType: 'beat' }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    message.textContent = 'Beat request received. We will be in touch soon.';
    form.reset();
    updateBeatRequestLicensePrice();
  } catch (error) {
    message.textContent = error.message || 'Could not send beat request.';
    message.classList.add('error');
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
  fetch(`${API}/api/reviews`).then(response => response.json()).then(data => {
    const reviewList = document.getElementById('public-review-list');
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
  }).catch(() => { document.getElementById('public-review-list').innerHTML = '<p>Reviews are unavailable right now.</p>'; });
  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
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
    try {
      const response = await fetch(`${API}/api/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('customerToken') || ''}` }, body: JSON.stringify({ rating: Number(reviewRating.value), review: document.getElementById('public-review-text').value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit review.');
      reviewMessage.textContent = data.message;
      reviewForm.reset();
      reviewRating.value = '';
      document.querySelectorAll('[data-review-rating]').forEach(star => { star.classList.remove('selected'); star.setAttribute('aria-pressed', 'false'); });
      refreshReviewAccess();
    } catch (error) {
      reviewMessage.textContent = error.message || 'Could not submit review.';
      reviewMessage.classList.add('error');
    }
  });
}

const licenseSlides = document.querySelectorAll('.license-slide');
const licenseDots = document.querySelectorAll('.license-dot');
const licensePrevious = document.getElementById('license-prev');
const licenseNext = document.getElementById('license-next');
const licenseSlideFrame = document.querySelector('.license-slide-frame');
let activeLicenseSlide = 0;

function updateActiveLicenseSlide(slideIndex, shouldScroll = true) {
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
  licenseDots.forEach((dot, index) => {
    const isActive = index === activeLicenseSlide;
    dot.classList.toggle('active', isActive);
    dot.setAttribute('aria-selected', String(isActive));
  });
  if (shouldScroll) {
    licenseSlides[activeLicenseSlide].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

licensePrevious?.addEventListener('click', () => updateActiveLicenseSlide(activeLicenseSlide - 1));
licenseNext?.addEventListener('click', () => updateActiveLicenseSlide(activeLicenseSlide + 1));
licenseDots.forEach(dot => {
  dot.addEventListener('click', () => updateActiveLicenseSlide(Number(dot.dataset.slide)));
});

let licenseScrollFrame;
licenseSlideFrame?.addEventListener('scroll', () => {
  cancelAnimationFrame(licenseScrollFrame);
  licenseScrollFrame = requestAnimationFrame(() => {
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

const basicLicenseTermsButton = document.getElementById('basic-license-terms-button');
const basicLicenseTermsDialog = document.getElementById('basic-license-terms-dialog');
const basicLicenseTermsClose = document.getElementById('basic-license-terms-close');

function closeBasicLicenseTerms() {
  if (!basicLicenseTermsDialog) return;
  basicLicenseTermsDialog.hidden = true;
  document.body.classList.remove('license-dialog-open');
  basicLicenseTermsButton?.focus();
}

basicLicenseTermsButton?.addEventListener('click', () => {
  if (!basicLicenseTermsDialog) return;
  const purchase = window.basicLicensePurchase;
  if (purchase) {
    document.getElementById('basic-license-beat-title').textContent = purchase.name;
    document.getElementById('basic-license-agreement-date').textContent = purchase.purchasedAt.toLocaleString();
    document.getElementById('basic-license-fee').textContent = convertPrice(purchase.price);
    document.getElementById('basic-license-code').textContent = purchase.licenseCode;
  }
  basicLicenseTermsDialog.hidden = false;
  document.body.classList.add('license-dialog-open');
  basicLicenseTermsClose?.focus();
});
basicLicenseTermsClose?.addEventListener('click', closeBasicLicenseTerms);
basicLicenseTermsDialog?.addEventListener('click', event => {
  if (event.target === basicLicenseTermsDialog) closeBasicLicenseTerms();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && basicLicenseTermsDialog && !basicLicenseTermsDialog.hidden) {
    closeBasicLicenseTerms();
  }
});

const premiumLicenseTermsButton = document.getElementById('premium-license-terms-button');
const premiumLicenseTermsDialog = document.getElementById('premium-license-terms-dialog');
const premiumLicenseTermsClose = document.getElementById('premium-license-terms-close');

function closePremiumLicenseTerms() {
  if (!premiumLicenseTermsDialog) return;
  premiumLicenseTermsDialog.hidden = true;
  document.body.classList.remove('license-dialog-open');
  premiumLicenseTermsButton?.focus();
}

premiumLicenseTermsButton?.addEventListener('click', () => {
  if (!premiumLicenseTermsDialog) return;
  const purchase = window.premiumLicensePurchase;
  if (purchase) {
    document.getElementById('premium-license-beat-title').textContent = purchase.name;
    document.getElementById('premium-license-agreement-date').textContent = purchase.purchasedAt.toLocaleString();
    document.getElementById('premium-license-fee').textContent = convertPrice(purchase.price);
    document.getElementById('premium-license-code').textContent = purchase.licenseCode;
  }
  premiumLicenseTermsDialog.hidden = false;
  document.body.classList.add('license-dialog-open');
  premiumLicenseTermsClose?.focus();
});
premiumLicenseTermsClose?.addEventListener('click', closePremiumLicenseTerms);
premiumLicenseTermsDialog?.addEventListener('click', event => {
  if (event.target === premiumLicenseTermsDialog) closePremiumLicenseTerms();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && premiumLicenseTermsDialog && !premiumLicenseTermsDialog.hidden) {
    closePremiumLicenseTerms();
  }
});

const unlimitedLicenseTermsButton = document.getElementById('unlimited-license-terms-button');
const unlimitedLicenseTermsDialog = document.getElementById('unlimited-license-terms-dialog');
const unlimitedLicenseTermsClose = document.getElementById('unlimited-license-terms-close');

function closeUnlimitedLicenseTerms() {
  if (!unlimitedLicenseTermsDialog) return;
  unlimitedLicenseTermsDialog.hidden = true;
  document.body.classList.remove('license-dialog-open');
  unlimitedLicenseTermsButton?.focus();
}

unlimitedLicenseTermsButton?.addEventListener('click', () => {
  if (!unlimitedLicenseTermsDialog) return;
  const purchase = window.unlimitedLicensePurchase;
  if (purchase) {
    document.getElementById('unlimited-license-beat-title').textContent = purchase.name;
    document.getElementById('unlimited-license-agreement-date').textContent = purchase.purchasedAt.toLocaleString();
    document.getElementById('unlimited-license-fee').textContent = convertPrice(purchase.price);
  }
  unlimitedLicenseTermsDialog.hidden = false;
  document.body.classList.add('license-dialog-open');
  unlimitedLicenseTermsClose?.focus();
});
unlimitedLicenseTermsClose?.addEventListener('click', closeUnlimitedLicenseTerms);
unlimitedLicenseTermsDialog?.addEventListener('click', event => {
  if (event.target === unlimitedLicenseTermsDialog) closeUnlimitedLicenseTerms();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && unlimitedLicenseTermsDialog && !unlimitedLicenseTermsDialog.hidden) {
    closeUnlimitedLicenseTerms();
  }
});

const exclusiveLicenseTermsButton = document.getElementById('exclusive-license-terms-button');
const exclusiveLicenseTermsDialog = document.getElementById('exclusive-license-terms-dialog');
const exclusiveLicenseTermsClose = document.getElementById('exclusive-license-terms-close');

function closeExclusiveLicenseTerms() {
  if (!exclusiveLicenseTermsDialog) return;
  exclusiveLicenseTermsDialog.hidden = true;
  document.body.classList.remove('license-dialog-open');
  exclusiveLicenseTermsButton?.focus();
}

exclusiveLicenseTermsButton?.addEventListener('click', () => {
  if (!exclusiveLicenseTermsDialog) return;
  const purchase = window.exclusiveLicensePurchase;
  if (purchase) {
    document.getElementById('exclusive-license-beat-title').textContent = purchase.name;
    document.getElementById('exclusive-license-agreement-date').textContent = purchase.purchasedAt.toLocaleString();
    document.getElementById('exclusive-license-fee').textContent = convertPrice(purchase.price);
    document.getElementById('exclusive-license-code').textContent = purchase.licenseCode;
  }
  exclusiveLicenseTermsDialog.hidden = false;
  document.body.classList.add('license-dialog-open');
  exclusiveLicenseTermsClose?.focus();
});
exclusiveLicenseTermsClose?.addEventListener('click', closeExclusiveLicenseTerms);
exclusiveLicenseTermsDialog?.addEventListener('click', event => {
  if (event.target === exclusiveLicenseTermsDialog) closeExclusiveLicenseTerms();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && exclusiveLicenseTermsDialog && !exclusiveLicenseTermsDialog.hidden) {
    closeExclusiveLicenseTerms();
  }
});

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

// Replace these with your uploaded image paths
const images = [
  "images/Hero1.png",
  "images/Hero2.png",
  "images/Hero3.png",
  "images/Hero4.png",
  "images/Hero5.png",
];

let currentIndex = 0;
const heroSection = document.querySelector(".hero");

function changeBackground() {
  heroSection?.style.setProperty('--hero-bg', `url("${images[currentIndex]}")`);
  currentIndex = (currentIndex + 1) % images.length;
}

// Initial background
if (heroSection) {
  changeBackground();
  setInterval(changeBackground, 5000);
}
