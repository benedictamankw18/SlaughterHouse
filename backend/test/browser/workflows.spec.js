const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const customer = {
  name: 'Browser Test Customer',
  email: 'browser@example.test',
  phone: '+233240000000',
  role: 'artist'
};

const beat = {
  id: 21,
  title: 'Browser Test Beat',
  bpm: 120,
  musicalKey: 'C Major',
  genre: 'afrobeat',
  mood: 'uplifting',
  prices: { basic: 100, premium: 200, unlimited: 300, exclusive: 400 }
};

async function mockApi(page, options = {}) {
  const calls = [];
  let adminReviewStatus = 'pending';
  let adminStreamReleases = [];
  let nextStreamReleaseId = 70;
  const reconciliationOrders = [
    {
      id: 3,
      reference: 'ORDER-REVIEW-ASSIGN',
      status: 'paid',
      customer_name: 'Alex Artist',
      customer_email: 'alex@example.test',
      amount: 250,
      fulfillment_review_required: true,
      fulfillment_review_reason: 'booking_slot_unavailable',
      items: [{
        type: 'booking',
        name: 'Mixtape',
        booking: {
          sessionSlots: [
            { date: '2030-01-08', time: '11:00' },
            { date: '2030-01-09', time: '11:00' }
          ]
        }
      }]
    },
    {
      id: 4,
      reference: 'ORDER-REVIEW-REFUND',
      status: 'paid',
      customer_name: 'Sam Buyer',
      customer_email: 'sam@example.test',
      amount: 250,
      fulfillment_review_required: true,
      fulfillment_review_reason: 'booking_slot_unavailable',
      items: [{
        type: 'booking',
        name: 'Mixtape',
        booking: { sessionSlots: [{ date: '2030-01-10', time: '11:00' }] }
      }]
    }
  ];
  await page.addInitScript(() => {
    window.ULTBIGBOY_API_URL = '';
  });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let data = null;
    try {
      data = request.postDataJSON();
    } catch {}
    let status = 200;
    let body = {};
    const responseHeaders = {};
    const cookies = request.headers().cookie || '';

    calls.push({ method, path, search: url.search, data });

    if (path === '/api/auth/session') {
      body = cookies.includes('ultbigboy_customer_session=test-customer-token')
        ? { authenticated: true, csrfToken: 'test-customer-csrf', user: customer }
        : { authenticated: false };
    } else if (path === '/api/admin/session') {
      body = cookies.includes('ultbigboy_admin_session=test-admin-token')
        ? { authenticated: true, csrfToken: 'test-admin-csrf', email: 'admin@example.test', role: options.adminRole || 'admin' }
        : { error: 'Admin login required.' };
      if (!cookies.includes('ultbigboy_admin_session=test-admin-token')) status = 401;
    } else if (path === '/api/exchange-rate') {
      body = { usdToGhsRate: 12.5, updatedAt: new Date().toISOString() };
    } else if (path === '/api/beats') {
      body = { beats: [beat], pagination: { page: 1, pages: 1, total: 1 } };
    } else if (path === '/api/reviews') {
      body = method === 'POST'
        ? { message: 'Review submitted for moderation.' }
        : { reviews: [] };
    } else if (path === '/api/requests/beat-license-prices') {
      body = { prices: { basic: 100, premium: 200, unlimited: 300, exclusive: 400 } };
    } else if (path === '/api/bookings/fees') {
      body = { fees: { mixtape: 250, 'full-production': 1000, 'beat-production': 500, 'adverts-promos': 250 } };
    } else if (path === '/api/auth/signup') {
      body = { message: 'Account created. Verify your email.', verificationToken: 'test-verification-token' };
    } else if (path === '/api/auth/verify-email') {
      body = { message: 'Email address verified successfully.' };
    } else if (path === '/api/admin/login') {
      if (options.adminMfaEnrollment) {
        body = {
          mfaEnrollmentRequired: true,
          challengeToken: 'test-mfa-challenge',
          secret: 'JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/png;base64,aGVsbG8='
        };
      } else if (options.adminLogin) {
        body = { csrfToken: 'test-admin-csrf', email: 'admin@example.test', role: options.adminRole || 'admin' };
        responseHeaders['Set-Cookie'] = 'ultbigboy_admin_session=test-admin-token; Path=/; HttpOnly; SameSite=Lax';
      }
      else {
        status = 401;
        body = { error: 'Invalid administrator credentials.' };
      }
    } else if (path === '/api/admin/mfa/verify') {
      body = { mfaSetupComplete: true, recoveryCodes: ['A'.repeat(20), 'B'.repeat(20)] };
    } else if (path === '/api/admin/mfa/complete') {
      body = { csrfToken: 'test-admin-csrf', email: 'admin@example.test', role: options.adminRole || 'admin' };
      responseHeaders['Set-Cookie'] = 'ultbigboy_admin_session=test-admin-token; Path=/; HttpOnly; SameSite=Lax';
    } else if (path === '/api/auth/login') {
      body = { csrfToken: 'test-customer-csrf', user: customer };
      responseHeaders['Set-Cookie'] = 'ultbigboy_customer_session=test-customer-token; Path=/; HttpOnly; SameSite=Lax';
    } else if (path === '/api/payments/initialize' || path === '/api/bookings/initialize-payment') {
      body = {
        reference: 'browser-test-reference',
        authorizationUrl: 'http://127.0.0.1:4173/mock-paystack'
      };
    } else if (path === '/api/admin/data') {
      body = {
        role: options.adminRole || 'admin',
        analytics: {},
        sales: options.adminFilters ? [
          { id: 1, sale_type: 'beat', product_name: 'Night Drive Beat', buyer_name: 'Alex Artist', buyer_email: 'alex@example.test', amount: 40, created_at: '2026-11-05' },
          { id: 2, sale_type: 'beat', product_name: 'Sunrise Beat', buyer_name: 'Sam Buyer', buyer_email: 'sam@example.test', amount: 30, created_at: '2026-10-05' },
          { id: 3, sale_type: 'merchandise', product_name: 'Tour Shirt', buyer_name: 'Alex Artist', buyer_email: 'alex@example.test', amount: 25, created_at: '2026-11-04' }
        ] : [],
        requests: options.adminFilters ? [
          { id: 1, request_type: 'beat', product_name: 'Night Drive', customer_name: 'Alex Artist', customer_email: 'alex@example.test', details: 'Afrobeat request', status: 'new' },
          { id: 2, request_type: 'merchandise', product_name: 'Tour Shirt', customer_name: 'Sam Buyer', customer_email: 'sam@example.test', details: 'Custom shirt', status: 'accepted' }
        ] : [],
        bookings: [],
        orders: [
          ...(options.adminFilters ? [
          { id: 1, reference: 'ORDER-PAID-1', status: 'paid', customer_name: 'Alex Artist', customer_email: 'alex@example.test', amount: 40, created_at: '2026-11-05', items: [{ type: 'beat', name: 'Night Drive' }] },
          { id: 2, reference: 'ORDER-PENDING-2', status: 'pending', customer_name: 'Sam Buyer', customer_email: 'sam@example.test', amount: 30, created_at: '2026-11-04', items: [{ type: 'merchandise', name: 'Tour Shirt' }] }
          ] : []),
          ...(options.adminReconciliation ? reconciliationOrders : [])
        ],
        reviews: options.adminReview ? [{
          id: 55,
          customer_name: customer.name,
          customer_email: customer.email,
          rating: 5,
          status: adminReviewStatus,
          review_text: 'A mock review for browser testing.'
        }] : options.adminFilters ? [
          { id: 56, customer_name: 'Alex Artist', customer_email: 'alex@example.test', rating: 5, status: 'approved', review_text: 'Excellent night-drive beat.' },
          { id: 57, customer_name: 'Sam Buyer', customer_email: 'sam@example.test', rating: 3, status: 'pending', review_text: 'Waiting for an update.' }
        ] : [],
        beats: options.adminFilters ? [
          { id: 31, title: 'Night Drive', genre: 'afrobeat', catalog_status: 'published' },
          { id: 32, title: 'Sunrise', genre: 'hiphop', catalog_status: 'unpublished' }
        ] : [],
        merchandise: options.adminFilters ? [
          { id: 41, title: 'Tour Shirt', description: 'Black tour shirt', price: 20, catalog_status: 'published' },
          { id: 42, title: 'Logo Cap', description: 'Embroidered cap', price: 15, catalog_status: 'unpublished' }
        ] : [],
        streamReleases: options.adminFilters ? [
          { id: 51, title: 'Night Drive Single', artist: 'Alex Artist', credits: [], links: [], status: 'published' },
          { id: 52, title: 'Sunrise EP', artist: 'Sam Artist', credits: [], links: [], status: 'unpublished' }
        ] : adminStreamReleases,
        customers: options.adminFilters ? [
          { id: 61, name: 'Alex Artist', artist_name: 'Alex A', email: 'alex@example.test', role: 'artist', created_at: '2026-11-01', email_verified_at: '2026-11-01' },
          { id: 62, name: 'Sam Buyer', email: 'sam@example.test', role: 'customer', created_at: '2026-10-01', email_verified_at: null }
        ] : [],
        artists: options.adminPricing ? [
          { id: 73, name: 'Snapshot Artist', artist_name: 'Snapshot', email: 'snapshot@example.test', purchases: [{ beat_title: 'Snapshot Beat', license: 'basic', amount: 154.32, exchange_rate: 12.345678, purchased_at: '2026-11-07' }] }
        ] : options.adminFilters ? [
          { id: 71, name: 'Alex Artist', artist_name: 'Alex A', email: 'alex@example.test', purchases: [{ beat_title: 'Night Drive', license: 'basic', amount: 4, purchased_at: '2026-11-05' }] },
          { id: 72, name: 'Sam Artist', artist_name: 'Sam S', email: 'sam@example.test', purchases: [] }
        ] : [],
        withdrawals: []
      };
    } else if (path === '/api/admin/notifications') {
      body = { notifications: [], unreadCount: 0 };
    } else if (path === '/api/admin/email-deliveries') {
      body = { deliveries: [], counts: {} };
    } else if (path === '/api/admin/license-definitions') {
      body = { definitions: [] };
    } else if (path === '/api/admin/settings') {
      body = {
        settings: options.adminPricing ? [{
          key: 'usd_to_ghs_rate',
          label: 'USD to GHS exchange rate',
          value: '12.345678',
          updatedAt: new Date().toISOString(),
          fresh: true
        }] : [],
        canEdit: true
      };
    } else if (path === '/api/admin/staff') {
      body = { staff: options.adminFilters ? [
        { id: 81, name: 'Admin One', email: 'admin@example.test', role: 'admin', created_at: '2026-01-01' },
        { id: 82, name: 'Super Admin', email: 'super@example.test', role: 'super_admin', created_at: '2026-01-02' }
      ] : [] };
    } else if (path === '/api/admin/certificates') {
      body = { certificates: [] };
    } else if (/^\/api\/admin\/orders\/[^/]+\/booking-resolution$/.test(path) && method === 'POST') {
      const order = reconciliationOrders.find(item => path.includes(encodeURIComponent(item.reference)));
      if (order) order.fulfillment_review_required = false;
      body = { reference: order?.reference, resolution: data.action === 'assign_slot' ? 'assigned' : 'refund_pending' };
    } else if (path === '/api/admin/reports') {
      body = { summary: {}, revenueByMonth: [], bookingCounts: [] };
    } else if (path === '/api/admin/audit-logs') {
      body = { logs: [] };
    } else if (path.startsWith('/api/admin/reviews/') && method === 'PATCH') {
      adminReviewStatus = data.status;
      body = { message: 'Review status updated.' };
    } else if (path === '/api/admin/stream-releases' && method === 'POST') {
      const release = { ...data, id: ++nextStreamReleaseId, credits_json: data.credits, cover_url: data.coverUrl || 'https://example.test/cover.jpg', links_json: data.links, status: 'unpublished' };
      adminStreamReleases.push(release);
      status = 201;
      body = { id: release.id, title: release.title, status: release.status };
    } else if (/^\/api\/admin\/stream-releases\/\d+\/status$/.test(path) && method === 'PATCH') {
      const release = adminStreamReleases.find(item => item.id === Number(path.split('/')[path.split('/').length - 2]));
      if (release) release.status = data.status;
      body = { id: release?.id, status: data.status };
    } else if (/^\/api\/admin\/stream-releases\/\d+$/.test(path) && method === 'PATCH') {
      const release = adminStreamReleases.find(item => item.id === Number(path.split('/').pop()));
      if (release) Object.assign(release, data, { credits_json: data.credits, cover_url: data.coverUrl || release.cover_url, links_json: data.links });
      body = { id: release?.id, title: data.title };
    } else if (/^\/api\/admin\/stream-releases\/\d+$/.test(path) && method === 'DELETE') {
      adminStreamReleases = adminStreamReleases.filter(item => item.id !== Number(path.split('/').pop()));
      body = { deleted: true };
    } else if (path.startsWith('/api/customer/')) {
      body = { purchases: [], licenses: [], bookings: [], orders: [], notifications: [] };
    } else if (path === '/api/merchandise') {
      body = { merchandise: [] };
    } else if (path === '/api/stream-releases') {
      body = { releases: [] };
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: responseHeaders,
      body: JSON.stringify(body)
    });
  });
  return calls;
}

async function openAuth(page, view = 'login') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Login' }).click();
  if (view === 'signup') await page.getByRole('button', { name: 'Create an account' }).click();
}

async function seedCustomerSession(page) {
  await page.context().addCookies([{
    name: 'ultbigboy_customer_session',
    value: 'test-customer-token',
    url: 'http://127.0.0.1:4173',
    httpOnly: true,
    sameSite: 'Lax'
  }]);
  await page.addInitScript(() => localStorage.setItem('customerCsrfToken', 'test-customer-csrf'));
}

async function seedAdminSession(page) {
  await page.context().addCookies([{
    name: 'ultbigboy_admin_session',
    value: 'test-admin-token',
    url: 'http://127.0.0.1:4173',
    httpOnly: true,
    sameSite: 'Lax'
  }]);
  await page.addInitScript(() => localStorage.setItem('adminCsrfToken', 'test-admin-csrf'));
}

test('signup submits the entered profile and enters email verification', async ({ page }) => {
  const calls = await mockApi(page);
  await openAuth(page, 'signup');

  await page.locator('#signup-email').fill(customer.email);
  await page.locator('#signup-first-name').fill('Browser');
  await page.locator('#signup-last-name').fill('Tester');
  await page.locator('#signup-phone').fill('240000000');
  await page.locator('#signup-password').fill('SecurePassphrase123!');
  await page.locator('#signup-confirm-password').fill('SecurePassphrase123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Verify your email address' })).toBeVisible();
  const signup = calls.find(call => call.path === '/api/auth/signup');
  expect(signup.data).toMatchObject({
    email: customer.email,
    firstName: 'Browser',
    lastName: 'Tester',
    phone: '+233240000000'
  });
});

test('successful email verification redirects to index.html', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto(`/?verifyToken=${'a'.repeat(64)}`);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await page.waitForURL(url => url.pathname.endsWith('/index.html'));

  expect(calls.some(call => call.path === '/api/auth/verify-email')).toBe(true);
});

test('login keeps the session in a cookie and opens the account view', async ({ page }) => {
  await mockApi(page);
  await openAuth(page);

  await page.locator('#login-identifier').fill(customer.email);
  await page.locator('#login-password').fill('Secure123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: customer.name })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('customerCsrfToken'))).toBe('test-customer-csrf');
  expect(await page.evaluate(() => sessionStorage.getItem('customerToken'))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain('customer_session');
});

test('search navigates to the catalog and forwards the query to the beats API', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/');
  await page.locator('#site-search').fill('night drive');
  await page.locator('.search-form button[type="submit"]').click();

  await expect(page).toHaveURL(/beats\.html\?search=night%20drive#beat-listing$/);
  await expect(page.locator('#beat-list .beat-card h3')).toHaveText(beat.title);
  expect(calls.some(call => call.path === '/api/beats' && call.search.includes('search=night+drive'))).toBeTruthy();
});

test('cart adds a catalog beat and updates the item count and selected total', async ({ page }) => {
  await mockApi(page);
  await page.goto('/beats.html');

  const card = page.locator('#beat-list .beat-card').filter({ hasText: beat.title });
  await card.getByRole('button', { name: `Add ${beat.title} to cart` }).click();
  await page.locator('#cart-button').click();
  await expect(page.locator('#cart-drawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#cart-count')).toHaveText('1');
  await expect(page.locator('#cart-items')).toContainText(beat.title);
  await expect(page.locator('#cart-checkout-button')).toBeEnabled();
});

test('checkout sends selected cart items and stays on the mocked payment origin', async ({ page }) => {
  const calls = await mockApi(page);
  await seedCustomerSession(page);
  await page.goto('/beats.html');

  const card = page.locator('#beat-list .beat-card').filter({ hasText: beat.title });
  await card.getByRole('button', { name: `Add ${beat.title} to cart` }).click();
  await page.locator('#cart-button').click();
  await page.locator('#cart-checkout-button').click();
  await page.getByRole('button', { name: 'Proceed with Mobile Money' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:4173/mock-paystack');
  const checkout = calls.find(call => call.path === '/api/payments/initialize');
  expect(checkout.data).toMatchObject({
    email: customer.email,
    paymentMethod: 'mobile_money',
    items: [expect.objectContaining({ name: beat.title, productId: beat.id })]
  });
});

test('booking submits a valid slot and requested service to mocked payment', async ({ page }) => {
  const calls = await mockApi(page);
  await seedCustomerSession(page);
  await page.goto('/booking.html');

  await page.locator('#booking-service').selectOption('mixtape');
  await page.locator('#booking-artist-count').selectOption('1');
  const slot = page.locator('.booking-session-slot').first();
  await slot.locator('[data-session-date]').fill(await page.evaluate(() => {
    const date = new Date();
    while (![0, 2, 3, 4].includes(date.getDay())) date.setDate(date.getDate() + 1);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }));
  await slot.locator('[data-session-time]').fill('11:00');
  await page.locator('#booking-details').fill('Browser test booking.');
  await expect(page.locator('#booking-submit')).toBeEnabled();
  await page.locator('#booking-submit').click();

  await expect(page).toHaveURL('http://127.0.0.1:4173/mock-paystack');
  const booking = calls.find(call => call.path === '/api/bookings/initialize-payment');
  expect(booking.data).toMatchObject({
    service: 'mixtape',
    artistCount: '1',
    email: customer.email,
    slots: [expect.objectContaining({ time: '11:00' })]
  });
});

test('customer submits a rated review', async ({ page }) => {
  const calls = await mockApi(page);
  await seedCustomerSession(page);
  await page.goto('/');

  await page.locator('[data-review-rating="5"]').click();
  await page.locator('#public-review-text').fill('Great production and sound.');
  await page.locator('#review-submit-button').click();

  await expect(page.locator('#public-review-message')).toContainText('Review submitted for moderation.');
  const review = calls.find(call => call.path === '/api/reviews' && call.method === 'POST');
  expect(review.data).toEqual({ rating: 5, review: 'Great production and sound.' });
});

test('admin signs in and approves a pending customer review', async ({ page }) => {
  const calls = await mockApi(page, { adminLogin: true, adminReview: true });
  await page.goto('/admin.html');

  await page.locator('#admin-email').fill('admin@example.test');
  await page.locator('#admin-password').fill('Secure123');
  await page.getByRole('button', { name: 'Enter dashboard' }).click();
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.locator('#reviews-list')).toContainText('approved');
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  const approval = calls.find(call => call.path === '/api/admin/reviews/55/status');
  expect(approval.method).toBe('PATCH');
  expect(approval.data).toEqual({ status: 'approved' });
});

test('admin creates, updates, activates, deactivates, and deletes a stream release', async ({ page }) => {
  const calls = await mockApi(page, { adminLogin: true });
  await page.goto('/admin.html');
  await page.locator('#admin-email').fill('admin@example.test');
  await page.locator('#admin-password').fill('Secure123');
  await page.getByRole('button', { name: 'Enter dashboard' }).click();
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Stream releases' }).click();
  await page.getByRole('button', { name: 'Add stream release' }).click();

  const createForm = page.locator('#stream-release-form');
  await createForm.locator('[name="title"]').fill('Browser Test Release');
  await createForm.locator('[name="artist"]').fill('Browser Test Artist');
  await createForm.locator('[name="credits"]').fill('Producer: Browser Test');
  await createForm.locator('[name="coverImage"]').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=', 'base64')
  });
  await createForm.locator('[name="links"]').fill('[{"platform":"Spotify","url":"https://open.spotify.com/track/test","label":"Listen on Spotify"}]');
  await createForm.getByRole('button', { name: 'Create stream release' }).click();

  const card = page.locator('article[data-stream-release-id="71"]');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.locator('[name="title"]').fill('Browser Test Release Updated');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.locator('[name="title"]')).toHaveValue('Browser Test Release Updated');
  await card.getByRole('button', { name: 'Activate' }).click();
  await expect(card.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  await card.getByRole('button', { name: 'Deactivate' }).click();
  await expect(card.getByRole('button', { name: 'Activate' })).toBeVisible();

  page.on('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('article[data-stream-release-id="71"]')).toHaveCount(0);
  expect(calls.filter(call => call.path.startsWith('/api/admin/stream-releases')).map(call => call.method))
    .toEqual(['POST', 'PATCH', 'PATCH', 'PATCH', 'DELETE']);
  expect(calls.find(call => call.path === '/api/admin/stream-releases' && call.method === 'POST').data.coverImage.name).toBe('cover.png');
});

test('admin list sections search and filter their records', async ({ page }) => {
  const calls = await mockApi(page, { adminLogin: true, adminFilters: true, adminRole: 'super_admin' });
  await page.goto('/admin.html');
  await page.locator('#admin-email').fill('admin@example.test');
  await page.locator('#admin-password').fill('Secure123');
  await page.getByRole('button', { name: 'Enter dashboard' }).click();
  await expect(page.locator('#admin-dashboard')).toBeVisible();

  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.locator('#content-beat-status').selectOption('inactive');
  await expect(page.locator('#beat-management-list')).toContainText('Sunrise');
  await expect(page.locator('#beat-management-list')).not.toContainText('Night Drive');
  await page.locator('#content-beat-status').selectOption('');
  await page.locator('#content-beat-search').fill('night drive');
  await expect(page.locator('#beat-management-list')).toContainText('Night Drive');
  await expect(page.locator('#beat-management-list')).not.toContainText('Sunrise');
  await page.getByRole('button', { name: 'Merchandise', exact: true }).click();
  await page.locator('#content-merchandise-status').selectOption('inactive');
  await expect(page.locator('#merchandise-management-list')).toContainText('Logo Cap');
  await expect(page.locator('#merchandise-management-list')).not.toContainText('Tour Shirt');
  await page.getByRole('button', { name: 'Stream releases' }).click();
  await page.locator('#content-release-search').fill('sam artist');
  await expect(page.locator('#stream-release-management-list')).toContainText('Sunrise EP');
  await expect(page.locator('#stream-release-management-list')).not.toContainText('Night Drive Single');

  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.locator('#sales-search').fill('night drive');
  await expect(page.locator('#sales-list')).toContainText('Night Drive Beat');
  await expect(page.locator('#sales-list')).not.toContainText('Sunrise Beat');
  await page.locator('#sales-search').fill('');
  await page.locator('#sales-from').fill('2026-11-01');
  await expect(page.locator('#sales-list')).toContainText('Night Drive Beat');
  await expect(page.locator('#sales-list')).not.toContainText('Sunrise Beat');

  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await page.locator('#orders-status').selectOption('paid');
  await expect(page.locator('#orders-list')).toContainText('ORDER-PAID-1');
  await expect(page.locator('#orders-list')).not.toContainText('ORDER-PENDING-2');
  await page.locator('#orders-search').fill('alex@example.test');
  await expect(page.locator('#orders-list')).toContainText('ORDER-PAID-1');

  await page.getByRole('button', { name: 'Requests', exact: true }).click();
  await page.getByRole('button', { name: 'Merchandise requests' }).click();
  await page.locator('#requests-status').selectOption('accepted');
  await expect(page.locator('#requests-list')).toContainText('Tour Shirt');
  await expect(page.locator('#requests-list')).not.toContainText('Night Drive');
  await page.locator('#requests-search').fill('sam@example.test');
  await expect(page.locator('#requests-list')).toContainText('Custom shirt');

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.locator('#reviews-status').selectOption('pending');
  await expect(page.locator('#reviews-list')).toContainText('Waiting for an update.');
  await expect(page.locator('#reviews-list')).not.toContainText('Excellent night-drive beat.');
  await page.locator('#reviews-search').fill('alex@example.test');
  await expect(page.locator('#reviews-list')).toContainText('No records match these filters.');

  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.locator('#customers-role').selectOption('artist');
  await page.locator('#customers-email-status').selectOption('verified');
  await expect(page.locator('#customers-list')).toContainText('alex@example.test');
  await expect(page.locator('#customers-list')).not.toContainText('sam@example.test');
  await page.locator('#customers-search').fill('sam');
  await expect(page.locator('#customers-list')).toContainText('No records match these filters.');

  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.locator('#artists-purchases').selectOption('has-purchases');
  await page.locator('#artists-search').fill('alex');
  await expect(page.locator('#artists-list')).toContainText('Alex A');
  await expect(page.locator('#artists-list')).not.toContainText('Sam S');

  await page.getByRole('button', { name: 'Certificates', exact: true }).click();
  await page.locator('#certificate-filter [name="q"]').fill('night drive');
  await page.locator('#certificate-filter [name="status"]').selectOption('valid');
  await expect.poll(() => calls.some(call => call.path === '/api/admin/certificates' && call.search.includes('status=valid'))).toBe(true);

  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await expect(page.locator('#staff-list')).toContainText('Admin One');
  await page.locator('#staff-role').selectOption('super_admin');
  await expect(page.locator('#staff-list')).toContainText('Super Admin');
  await expect(page.locator('#staff-list')).not.toContainText('Admin One');
  await page.locator('#staff-search').fill('no match');
  await expect(page.locator('#staff-list')).toContainText('No staff accounts match these filters.');
});

test('admin completes required MFA enrollment before entering the dashboard', async ({ page }) => {
  const calls = await mockApi(page, { adminMfaEnrollment: true });
  await page.goto('/admin.html');
  await page.locator('#admin-email').fill('admin@example.test');
  await page.locator('#admin-password').fill('test-password');
  await page.getByRole('button', { name: 'Enter dashboard' }).click();

  await expect(page.locator('#admin-mfa-panel')).toBeVisible();
  await expect(page.locator('#admin-mfa-title')).toHaveText('Set up authenticator MFA');
  await expect(page.locator('#admin-mfa-qr')).toBeVisible();
  await expect(page.locator('#admin-mfa-secret')).toHaveText('JBSWY3DPEHPK3PXP');
  await page.locator('#admin-mfa-code').fill('123456');
  await page.getByRole('button', { name: 'Verify code' }).click();

  await expect(page.locator('#admin-mfa-recovery')).toBeVisible();
  await expect(page.locator('#admin-mfa-recovery-codes li')).toHaveCount(2);
  await page.getByRole('button', { name: 'I saved my recovery codes' }).click();

  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await expect.poll(() => calls.some(call => call.path === '/api/admin/data')).toBe(true);
  expect(calls.map(call => call.path)).toEqual(expect.arrayContaining([
    '/api/admin/login',
    '/api/admin/mfa/verify',
    '/api/admin/mfa/complete',
    '/api/admin/data'
  ]));
});

test('policy pages are reachable and cross-linked from the footer', async ({ page }) => {
  const policies = [
    { path: '/privacy.html', title: 'Privacy Policy' },
    { path: '/terms.html', title: 'Terms of Service' },
    { path: '/refunds.html', title: 'Refund & Cancellation Policy' },
    { path: '/cookies.html', title: 'Cookie Policy' }
  ];

  for (const policy of policies) {
    await page.goto(policy.path);
    await expect(page.getByRole('heading', { level: 1, name: policy.title })).toBeVisible();
    const policyNavigation = page.getByRole('navigation', { name: 'Policies and terms' });
    await expect(policyNavigation.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', 'privacy.html');
    await expect(policyNavigation.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', 'terms.html');
    await expect(policyNavigation.getByRole('link', { name: 'Refunds', exact: true })).toHaveAttribute('href', 'refunds.html');
    await expect(policyNavigation.getByRole('link', { name: 'Cookies', exact: true })).toHaveAttribute('href', 'cookies.html');
  }
});

test('policy pages have no automated WCAG 2.1 A/AA violations', async ({ page }) => {
  const policies = [
    { path: '/privacy.html', heading: 'Privacy Policy' },
    { path: '/terms.html', heading: 'Terms of Service' },
    { path: '/refunds.html', heading: 'Refund & Cancellation Policy' },
    { path: '/cookies.html', heading: 'Cookie Policy' }
  ];
  const violations = [];

  for (const policy of policies) {
    await page.goto(policy.path);
    await expect(page.getByRole('heading', { level: 1, name: policy.heading })).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    violations.push(...scan.violations.map(violation => ({
      page: policy.path,
      id: violation.id,
      nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary }))
    })));
  }

  expect(violations).toEqual([]);
});

test('admin resolves paid booking cases by assigning replacement sessions or requesting refunds', async ({ page }) => {
  const calls = await mockApi(page, { adminLogin: true, adminReconciliation: true });
  await seedAdminSession(page);
  await page.goto('/admin.html');
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();

  const assignment = page.locator('[data-booking-resolution="ORDER-REVIEW-ASSIGN"]').filter({ visible: true }).first();
  await expect(assignment).toContainText('Booking fulfillment needs review');
  await assignment.locator('[data-replacement-date="0"]').fill('2030-01-15');
  await assignment.locator('[data-replacement-time="0"]').fill('11:00');
  await assignment.locator('[data-replacement-date="1"]').fill('2030-01-16');
  await assignment.locator('[data-replacement-time="1"]').fill('11:00');
  await assignment.getByRole('button', { name: 'Assign replacement slot' }).click();
  await expect(page.locator('[data-booking-resolution="ORDER-REVIEW-ASSIGN"]').filter({ visible: true })).toHaveCount(0);
  const assignedCall = calls.find(call => call.path.endsWith('/ORDER-REVIEW-ASSIGN/booking-resolution'));
  expect(assignedCall.data).toEqual({
    action: 'assign_slot',
    slots: [
      { date: '2030-01-15', time: '11:00' },
      { date: '2030-01-16', time: '11:00' }
    ]
  });

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-booking-resolution="ORDER-REVIEW-REFUND"]').filter({ visible: true })
    .getByRole('button', { name: 'Request full refund' }).click();
  await expect(page.locator('[data-booking-resolution="ORDER-REVIEW-REFUND"]').filter({ visible: true })).toHaveCount(0);
  expect(calls.find(call => call.path.endsWith('/ORDER-REVIEW-REFUND/booking-resolution')).data)
    .toEqual({ action: 'request_refund' });
});

test('admin displays saved GHS purchase amounts and exchange-rate freshness', async ({ page }) => {
  await mockApi(page, { adminLogin: true, adminPricing: true });
  await seedAdminSession(page);
  await page.goto('/admin.html');
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await expect(page.locator('#artists-list')).toContainText('GHS 154.32');
  await expect(page.locator('#artists-list')).toContainText('USD/GHS 12.345678');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#business-settings-form')).toContainText('Rates expire after 24 hours.');
  await expect(page.locator('#business-settings-form input[name="usd_to_ghs_rate"]')).toHaveValue('12.345678');
});

test('key storefront and admin pages have no automated WCAG 2.1 A/AA violations', async ({ page }) => {
  await mockApi(page, { adminReview: true });
  const pages = [
    { path: '/', heading: 'UltBigBoy' },
    { path: '/beats.html', heading: 'Browse all beats' },
    { path: '/booking.html', heading: 'Book a session' },
    { path: '/merchandise.html', heading: 'SHOP FROM THE VAULT' },
    { path: '/produced.html', heading: 'Stream Productions' }
  ];
  const violations = [];

  for (const route of pages) {
    await page.goto(route.path);
    await expect(page.getByRole('main')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    violations.push(...scan.violations.map(violation => ({
      page: route.path,
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary }))
    })));
  }

  await seedAdminSession(page);
  await page.goto('/admin.html');
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  const adminScan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  violations.push(...adminScan.violations.map(violation => ({
    page: '/admin.html',
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary }))
  })));

  await openAuth(page);
  const authScan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  violations.push(...authScan.violations.map(violation => ({
    page: 'account dialog',
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary }))
  })));

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('storefront layouts fit mobile, tablet, laptop, and desktop viewports', async ({ page }) => {
  await mockApi(page);
  const viewports = [
    { name: 'mobile', width: 360, height: 800 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1024, height: 768 },
    { name: 'desktop', width: 1440, height: 900 }
  ];
  const pages = [
    { path: '/', heading: 'UltBigBoy' },
    { path: '/beats.html', heading: 'Browse all beats' },
    { path: '/booking.html', heading: 'Book a session' },
    { path: '/merchandise.html', heading: 'SHOP FROM THE VAULT' },
    { path: '/produced.html', heading: 'Stream Productions' },
    { path: '/admin.html', heading: 'Admin dashboard', admin: true }
  ];
  await seedAdminSession(page);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of pages) {
      await page.goto(route.path);
      await expect(page.getByRole('main')).toBeVisible();
      if (route.admin) await expect(page.locator('#admin-dashboard')).toBeVisible();
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      }));
      expect(
        dimensions.documentWidth,
        `${route.path} overflows horizontally at ${viewport.name} (${viewport.width}px)`
      ).toBeLessThanOrEqual(dimensions.viewportWidth);
    }
  }
});
