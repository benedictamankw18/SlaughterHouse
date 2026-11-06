(() => {
  const apiBase = window.ULTBIGBOY_API_URL || `${location.protocol}//${location.hostname}:3000`;
  const message = document.getElementById('certificate-message');
  if (!message) return;
  const certificateFetch = (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const csrfToken = sessionStorage.getItem('customerCsrfToken') || '';
    const headers = new Headers(options.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    return fetch(url, { ...options, headers });
  };
  const displayDate = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded';
  const rightRows = rights => {
    const rows = [];
    if (Array.isArray(rights?.formats)) rows.push(`Permitted formats: ${rights.formats.map(format => String(format).toUpperCase()).join(', ')}`);
    if (typeof rights?.commercialUse === 'boolean') rows.push(`Commercial use: ${rights.commercialUse ? 'Included' : 'Not included'}`);
    if (typeof rights?.distribution === 'boolean') rows.push(`Distribution: ${rights.distribution ? 'Included' : 'Not included'}`);
    if (typeof rights?.stems === 'boolean') rows.push(`Track stems: ${rights.stems ? 'Included' : 'Not included'}`);
    if (rights?.resaleProhibited) rows.push('Resale of the licensed beat is prohibited.');
    Object.entries(rights?.usageLimits || {}).forEach(([name, limit]) => rows.push(`${name.replace(/[_-]+/g, ' ')} limit: ${limit === null ? 'Unlimited' : limit}`));
    (rights?.distributionRules || []).forEach(rule => rows.push(`Distribution condition: ${rule}`));
    return rows.length ? rows : ['No permission details are recorded.'];
  };
  const setText = (id, value) => { document.getElementById(id).textContent = value || 'Not recorded'; };

  function showCertificateError(error) {
    message.textContent = error.message || 'Could not load this license certificate.';
    message.classList.add('is-error');
    const retryButton = document.createElement('button');
    retryButton.className = 'inline-retry-button';
    retryButton.type = 'button';
    retryButton.textContent = 'Try again';
    retryButton.addEventListener('click', () => {
      retryButton.remove();
      loadCertificate().catch(showCertificateError);
    }, { once: true });
    message.append(document.createTextNode(' '), retryButton);
  }

  async function loadCertificate() {
    message.classList.remove('is-error');
    message.textContent = 'Loading your certificate…';
    const licenseId = new URLSearchParams(location.search).get('licenseId');
    if (!/^[1-9]\d*$/.test(licenseId || '')) throw new Error('A valid license ID is required.');
    const token = sessionStorage.getItem('customerToken') || '';
    const response = await certificateFetch(`${apiBase}/api/customer/licenses/${encodeURIComponent(licenseId)}/certificate/details`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load this license certificate.');
    const certificate = result.certificate;
    document.getElementById('certificate-preview').hidden = false;
    document.getElementById('certificate-actions').hidden = false;
    setText('certificate-id', certificate.certificate_id);
    setText('certificate-customer', certificate.customer_name);
    setText('certificate-email', certificate.customer_email);
    setText('certificate-beat-title', certificate.beat_title);
    setText('certificate-beat-meta', [certificate.genre, certificate.bpm ? `${certificate.bpm} BPM` : '', certificate.musical_key].filter(Boolean).join(' · '));
    setText('certificate-license-type', certificate.license_type);
    setText('certificate-order', certificate.order_reference);
    setText('certificate-purchased', displayDate(certificate.purchased_at));
    setText('certificate-expires', certificate.expires_at ? displayDate(certificate.expires_at) : 'No expiration');
    setText('certificate-issued', displayDate(certificate.issued_at));
    const status = document.getElementById('certificate-status');
    status.textContent = `STATUS: ${String(certificate.status || 'unknown').toUpperCase()}`;
    status.className = `certificate-status certificate-status-${String(certificate.status || 'unknown').toLowerCase()}`;
    const rightsList = document.getElementById('certificate-rights-list');
    rightsList.replaceChildren(...rightRows(certificate.rights).map(value => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
    const verificationLink = document.getElementById('certificate-verification-link');
    verificationLink.href = certificate.verificationUrl;
    const qrToken = new URL(certificate.verificationUrl).searchParams.get('token');
    const qr = document.getElementById('certificate-qr');
    qr.src = `${apiBase}/api/certificates/qr/${encodeURIComponent(qrToken)}`;
    qr.alt = `QR code to verify certificate ${certificate.certificate_id}`;
    const download = document.getElementById('certificate-download');
    if (download.dataset.listenerAttached !== 'true') {
      download.dataset.listenerAttached = 'true';
      download.addEventListener('click', async event => {
        event.preventDefault();
        download.setAttribute('aria-disabled', 'true');
        try {
          const pdfResponse = await certificateFetch(`${apiBase}/api/customer/licenses/${encodeURIComponent(licenseId)}/certificate`, {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (!pdfResponse.ok) {
            const errorResult = await pdfResponse.json();
            throw new Error(errorResult.error || 'Could not download the certificate PDF.');
          }
          const blob = await pdfResponse.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = `${certificate.certificate_id}.pdf`;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
          message.textContent = error.message || 'Could not download the certificate PDF.';
          message.classList.add('is-error');
        } finally {
          download.removeAttribute('aria-disabled');
        }
      });
    }
    message.textContent = certificate.status === 'valid'
      ? 'This certificate is tied to your saved purchase-time license terms.'
      : `This certificate is currently ${String(certificate.status || 'unknown')}.`;
  }

  loadCertificate().catch(showCertificateError);
})();
