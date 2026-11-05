(() => {
  const apiBase = window.ULTBIGBOY_API_URL || `${location.protocol}//${location.hostname}:3000`;
  const message = document.getElementById('verification-message');
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
  const displayDate = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not recorded';
  const setText = (id, value) => { document.getElementById(id).textContent = value || 'Not recorded'; };

  async function verify() {
    const token = new URLSearchParams(location.search).get('token') || '';
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('The certificate verification link is incomplete or invalid.');
    const response = await fetch(`${apiBase}/api/certificates/verify/${encodeURIComponent(token)}`, { credentials: 'omit' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Certificate could not be verified.');
    const certificate = result.certificate;
    document.getElementById('verification-result').hidden = false;
    const status = String(certificate.status || 'unknown').toLowerCase();
    const statusElement = document.getElementById('verification-status');
    statusElement.textContent = `Certificate ${status}`;
    statusElement.className = `certificate-status certificate-status-${status}`;
    setText('verification-id', certificate.certificateId);
    setText('verification-customer', certificate.customer);
    setText('verification-beat', certificate.beatTitle);
    setText('verification-license', certificate.licenseType);
    setText('verification-order', certificate.orderReference);
    setText('verification-purchased', displayDate(certificate.purchasedAt));
    setText('verification-issued', displayDate(certificate.issuedAt));
    setText('verification-terms-version', certificate.termsVersion);
    const list = document.getElementById('verification-rights');
    list.replaceChildren(...rightRows(certificate.rights).map(value => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
    document.querySelector('.verification-mark').textContent = status === 'valid' ? '✓' : '!';
    message.textContent = status === 'valid'
      ? 'This certificate is authentic and currently valid.'
      : `This certificate was located, but its current status is ${status}.`;
  }

  verify().catch(error => {
    message.textContent = error.message || 'Certificate verification failed.';
    message.classList.add('is-error');
  });
})();
