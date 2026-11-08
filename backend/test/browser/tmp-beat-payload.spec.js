const { test, expect } = require('@playwright/test');

async function mockApi(page) {
  const calls = [];
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
    calls.push({ method, path, data });
    let body = {};
    let status = 200;
    const responseHeaders = {};
    const cookies = request.headers().cookie || '';
    if (path === '/api/auth/session') {
      body = { authenticated: false };
    } else if (path === '/api/admin/session') {
      body = cookies.includes('ultbigboy_admin_session=test-admin-token')
        ? { authenticated: true, csrfToken: 'test-admin-csrf', email: 'admin@example.test', role: 'admin' }
        : { error: 'Admin login required.' };
      if (!cookies.includes('ultbigboy_admin_session=test-admin-token')) status = 401;
    } else if (path === '/api/exchange-rate') {
      body = { usdToGhsRate: 12.5, updatedAt: new Date().toISOString() };
    } else if (path === '/api/beats') {
      body = { beats: [], pagination: { page: 1, pages: 1, total: 0 } };
    } else if (path === '/api/admin/login') {
      body = { csrfToken: 'test-admin-csrf', email: 'admin@example.test', role: 'admin' };
      responseHeaders['Set-Cookie'] = 'ultbigboy_admin_session=test-admin-token; Path=/; HttpOnly; SameSite=Lax';
    }
    await route.fulfill({ status, headers: responseHeaders, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

test('capture beat payload', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/admin/admin.html');
  await page.locator('#admin-email').fill('admin@example.test');
  await page.locator('#admin-password').fill('Secure123');
  await page.getByRole('button', { name: 'Enter dashboard' }).click();
  await expect(page.locator('#admin-dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: 'Add beat' }).click();

  const form = page.locator('#beat-form');
  await form.locator('[name="title"]').fill('Payload Test Beat');
  for (const price of ['basic', 'premium', 'unlimited', 'exclusive']) await form.locator(`[name="${price}"]`).fill('10');
  const mp3 = { name: 'track.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3track') };
  await form.locator('[name="preview"]').setInputFiles(mp3);
  await form.locator('[name="mp3"]').setInputFiles(mp3);
  await form.locator('[name="wav"]').setInputFiles({ name: 'track.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFtestWAVE') });
  await form.locator('[name="stems"]').setInputFiles(mp3);

  const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/beats');
  await form.getByRole('button', { name: 'Save beat' }).click();
  await response;

  const call = calls.find(item => item.path === '/api/admin/beats' && item.method === 'POST');
  console.log('CAPTURED KEYS:', call && Object.keys(call.data || {}));
  console.log('CAPTURED TITLE:', call && JSON.stringify(call.data && call.data.title));
  console.log('FILES:', call && Object.fromEntries(Object.entries(call.data.files || {}).map(([k, v]) => [k, v && { name: v.name, prefix: v.data && v.data.slice(0, 30) }])));
});
