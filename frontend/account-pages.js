const accountPageDefinitions = {
  purchases: { title: 'Purchases', description: 'A record of completed purchases.', endpoint: '/api/customer/purchases', key: 'purchases' },
  licenses: { title: 'Licenses', description: 'Review your beat licenses and download certificates.', endpoint: '/api/customer/licenses', key: 'licenses' },
  downloads: { title: 'Downloads', description: 'Your beat download activity.', endpoint: '/api/customer/downloads', key: 'downloads' },
  wishlist: { title: 'Wishlist', description: 'Beats you have saved for later.', endpoint: '/api/wishlists', key: 'wishlists' },
  bookings: { title: 'Bookings', description: 'Your studio session requests and booking updates.', endpoint: '/api/customer/bookings', key: 'bookings' },
  profile: { title: 'Profile', description: 'Keep your customer contact details up to date.', endpoint: '/api/auth/profile', key: 'user' },
  orders: { title: 'Orders', description: 'Payment and fulfillment status for your orders.', endpoint: '/api/customer/orders', key: 'orders' },
  alerts: { title: 'Alerts', description: 'Updates about purchases, licenses, and bookings.', endpoint: '/api/customer/notifications', key: 'notifications' },
  requests: { title: 'Requests', description: 'Track your custom beat and merchandise requests.', endpoint: '/api/customer/requests', key: 'requests' }
};

const accountPageLinks = [
  ['purchases', 'Purchases', 'purchases.html'],
  ['licenses', 'Licenses', 'licenses.html'],
  ['downloads', 'Downloads', 'downloads.html'],
  ['wishlist', 'Wishlist', 'wishlist.html'],
  ['bookings', 'Bookings', 'bookings.html'],
  ['profile', 'Profile', 'profile.html'],
  ['orders', 'Orders', 'orders.html'],
  ['alerts', 'Alerts', 'alerts.html'],
  ['requests', 'Requests', 'requests.html']
];

const accountPageRoot = document.getElementById('account-page');
if (accountPageRoot) {
  const pageType = accountPageRoot.dataset.accountPage;
  const page = accountPageDefinitions[pageType];
  const apiBase = window.ULTBIGBOY_API_URL || `${location.protocol}//${location.hostname}:3000`;
  const escapeAccountHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const money = value => `GHS ${Number(value || 0).toFixed(2)}`;

  if (!page) {
    accountPageRoot.innerHTML = '<section class="account-page-state" role="alert"><h1>Page not found</h1><a href="index.html">Return to UltBigBoy</a></section>';
  } else {
    document.title = `${page.title} | UltBigBoy Account`;
    accountPageRoot.innerHTML = `
      <div class="account-page-heading">
        <p class="section-kicker">YOUR STUDIO / ACCOUNT</p>
        <h1>${page.title}</h1>
        <p>${page.description}</p>
        <p class="account-page-customer" id="account-page-customer"></p>
      </div>
      <nav class="account-page-nav" aria-label="Account pages">
        ${accountPageLinks.map(([type, title, href]) => `<a href="${href}"${type === pageType ? ' aria-current="page"' : ''}>${title}</a>`).join('')}
      </nav>
      <p class="account-page-message" id="account-page-message" role="status" aria-live="polite"></p>
      <section class="account-page-content" id="account-page-content" aria-live="polite">Loading your account...</section>`;

    const content = document.getElementById('account-page-content');
    const status = document.getElementById('account-page-message');
    const token = () => sessionStorage.getItem('customerToken') || '';
    const request = async (path, options = {}) => {
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
          ...(options.headers || {})
        }
      });
      if (response.status === 204) return {};
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not complete the request.');
      return result;
    };

    const renderRows = rows => {
      if (!Array.isArray(rows)) throw new Error('The account response had an invalid format.');
      if (!rows.length) {
        content.innerHTML = `<div class="account-page-state"><h2>No ${page.title.toLowerCase()} yet</h2><p>Your ${page.title.toLowerCase()} will appear here when available.</p></div>`;
        return;
      }

      content.innerHTML = rows.map(item => {
        if (pageType === 'purchases') {
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.product_name || 'Purchase')}</h2><p>${escapeAccountHtml(item.product_type || 'Item')}${item.license_type ? ` · ${escapeAccountHtml(item.license_type)} license` : ''}</p><p>${money(item.unit_amount || item.amount)} · ${Number(item.quantity || 1)} item(s) · ${escapeAccountHtml(item.created_at || '')}</p><small>Order ${escapeAccountHtml(item.reference || '')}</small></article>`;
        }
        if (pageType === 'licenses') {
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.beat_title || 'Beat')}</h2><p>${escapeAccountHtml(item.license_type)} license · Order ${escapeAccountHtml(item.order_reference || '')}</p><p>Purchased ${escapeAccountHtml(item.purchased_at || '')}</p><button class="auth-primary-button" type="button" data-account-action="certificate" data-id="${Number(item.id)}">Download certificate</button></article>`;
        }
        if (pageType === 'downloads') {
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.beat_title || 'Beat')}</h2><p>${escapeAccountHtml(item.license_type)} license · ${escapeAccountHtml(item.format)} format</p><p>Order ${escapeAccountHtml(item.order_reference || '')} · Downloaded ${escapeAccountHtml(item.created_at || '')}</p></article>`;
        }
        if (pageType === 'wishlist') {
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.title || 'Beat')}</h2><p>${escapeAccountHtml([item.genre, item.mood, item.bpm ? `${item.bpm} BPM` : ''].filter(Boolean).join(' · ') || 'Beat')}</p><p>Added ${escapeAccountHtml(item.addedAt || '')}</p><div class="account-page-actions"><a href="beats.html#beat-listing">View beats</a><button type="button" data-account-action="remove-wishlist" data-id="${Number(item.id)}">Remove</button></div></article>`;
        }
        if (pageType === 'bookings') {
          let slots = [];
          try { slots = typeof item.booking_slots_json === 'string' ? JSON.parse(item.booking_slots_json) : item.booking_slots_json || []; } catch {}
          const schedule = slots.map(slot => `${slot.date || ''} at ${slot.time || ''}`).join(' · ') || `${item.preferred_date || 'Date pending'} ${item.preferred_time || ''}`;
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.service || 'Studio session')}</h2><p>Status: ${escapeAccountHtml(item.status || 'pending')}</p><p>${escapeAccountHtml(schedule)}</p>${item.artist_count ? `<p>${Number(item.artist_count)} artist(s)${item.song_count ? ` · ${Number(item.song_count)} song(s)` : ''}</p>` : ''}${item.admin_notes ? `<p class="account-page-note">Studio note: ${escapeAccountHtml(item.admin_notes)}</p>` : ''}<small>Requested ${escapeAccountHtml(item.created_at || '')}</small></article>`;
        }
        if (pageType === 'orders') {
          const items = Array.isArray(item.items) ? item.items.map(orderItem => `<li>${escapeAccountHtml(orderItem.product_name || 'Item')}${orderItem.license_type ? ` · ${escapeAccountHtml(orderItem.license_type)} license` : ''} · ${Number(orderItem.quantity || 1)} item(s)</li>`).join('') : '';
          const history = Array.isArray(item.fulfillmentHistory) ? item.fulfillmentHistory.map(entry => `<p>Fulfillment: ${escapeAccountHtml(entry.status)} · ${escapeAccountHtml(entry.created_at || '')}</p>`).join('') : '';
          return `<article class="account-page-card"><h2>Order ${escapeAccountHtml(item.reference)}</h2><p>Payment: ${escapeAccountHtml(item.status)} · ${money(item.amount)} · ${escapeAccountHtml(item.created_at || '')}</p><p>Fulfillment: ${escapeAccountHtml(item.fulfillment_status || 'unfulfilled')}</p><ul>${items}</ul>${history}</article>`;
        }
        if (pageType === 'alerts') {
          return `<article class="account-page-card${item.read_at ? '' : ' is-unread'}" data-notification-id="${Number(item.id)}"><h2>${escapeAccountHtml(item.title || 'Account update')}</h2><p>${escapeAccountHtml(item.message || '')}</p><small>${escapeAccountHtml(item.created_at || '')}</small><div class="account-page-actions">${item.read_at ? '<button type="button" data-account-action="mark-unread">Mark unread</button>' : '<button type="button" data-account-action="mark-read">Mark read</button>'}</div></article>`;
        }
        if (pageType === 'requests') {
          const quote = item.quote_gsh === null || item.quote_gsh === undefined ? 'No quote yet' : `Quote: ${money(item.quote_gsh)}`;
          return `<article class="account-page-card"><h2>${escapeAccountHtml(item.product_name || `${item.request_type || 'Custom'} request`)}</h2><p>Status: ${escapeAccountHtml(item.status || 'new')} · ${escapeAccountHtml(quote)} · ${escapeAccountHtml(item.created_at || '')}</p>${item.requested_license ? `<p>Requested license: ${escapeAccountHtml(item.requested_license)}</p>` : ''}${item.details ? `<p>${escapeAccountHtml(item.details)}</p>` : ''}${item.admin_notes ? `<p class="account-page-note">Studio note: ${escapeAccountHtml(item.admin_notes)}</p>` : ''}</article>`;
        }
        return '';
      }).join('');
    };

    const renderProfile = user => {
      if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('Your profile could not be loaded.');
      content.innerHTML = `<form class="account-page-profile" id="account-page-profile">
        <label>Email<input value="${escapeAccountHtml(user.email)}" type="email" disabled></label>
        <div class="account-page-profile-row"><label>First name<input name="firstName" value="${escapeAccountHtml(user.firstName)}" maxlength="100" required></label><label>Last name<input name="lastName" value="${escapeAccountHtml(user.lastName)}" maxlength="100" required></label></div>
        <label>Phone<input name="phone" value="${escapeAccountHtml(user.phone)}" required></label>
        ${user.role === 'artist' ? `<label>Artist name<input name="artistName" value="${escapeAccountHtml(user.artistName)}" maxlength="255" required></label>` : `<label>Address<textarea name="address" rows="3" maxlength="2000" required>${escapeAccountHtml(user.address)}</textarea></label>`}
        <button class="auth-primary-button" type="submit">Save profile</button>
      </form>`;
    };

    const loadPage = async () => {
      status.textContent = '';
      status.classList.remove('is-error');
      if (!token()) {
        document.getElementById('account-page-customer').textContent = '';
        content.innerHTML = '<div class="account-page-state"><h2>Sign in to view your account</h2><p>Your account pages are private and available after signing in.</p><button class="auth-primary-button" type="button" data-open-login>Sign in</button></div>';
        return;
      }
      content.textContent = 'Loading your account...';
      try {
        const result = await request(page.endpoint);
        const user = (() => {
          try { return JSON.parse(sessionStorage.getItem('customerUser') || 'null'); } catch { return null; }
        })();
        document.getElementById('account-page-customer').textContent = user?.name ? `Signed in as ${user.name}` : '';
        if (pageType === 'profile') renderProfile(result[page.key]);
        else renderRows(result[page.key] || []);
      } catch (error) {
        content.innerHTML = `<div class="account-page-state" role="alert"><h2>Could not load this page</h2><p>${escapeAccountHtml(error.message)}</p><button type="button" data-account-action="reload">Try again</button></div>`;
      }
    };

    accountPageRoot.addEventListener('click', async event => {
      if (event.target.closest('[data-open-login]')) {
        document.querySelector('.login-button')?.click();
        return;
      }
      const button = event.target.closest('[data-account-action]');
      if (!button) return;
      const action = button.dataset.accountAction;
      if (action === 'reload') return loadPage();
      button.disabled = true;
      try {
        if (action === 'remove-wishlist') {
          await request(`/api/wishlists/${button.dataset.id}`, { method: 'DELETE' });
          await loadPage();
        } else if (action === 'mark-read' || action === 'mark-unread') {
          const card = button.closest('[data-notification-id]');
          const nextState = action === 'mark-read' ? 'read' : 'unread';
          await request(`/api/customer/notifications/${card.dataset.notificationId}/${nextState}`, { method: 'PATCH' });
          await loadPage();
        } else if (action === 'certificate') {
          const response = await fetch(`${apiBase}/api/customer/licenses/${button.dataset.id}/certificate`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token()}` }
          });
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Could not download the certificate.');
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `ultbigboy-license-${button.dataset.id}.pdf`;
          link.click();
          URL.revokeObjectURL(objectUrl);
          button.disabled = false;
        }
      } catch (error) {
        status.textContent = error.message || 'The action could not be completed.';
        status.classList.add('is-error');
        button.disabled = false;
      }
    });

    accountPageRoot.addEventListener('submit', async event => {
      if (event.target.id !== 'account-page-profile') return;
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = '';
      status.classList.remove('is-error');
      try {
        const result = await request('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const storedUser = (() => {
          try { return JSON.parse(sessionStorage.getItem('customerUser') || '{}'); } catch { return {}; }
        })();
        sessionStorage.setItem('customerUser', JSON.stringify({ ...storedUser, ...result.user }));
        document.getElementById('account-page-customer').textContent = `Signed in as ${result.user.name}`;
        status.textContent = 'Profile saved.';
      } catch (error) {
        status.textContent = error.message || 'Could not save your profile.';
        status.classList.add('is-error');
      } finally {
        button.disabled = false;
      }
    });

    window.addEventListener('ultbigboy:auth-changed', loadPage);
    loadPage();
  }
}
