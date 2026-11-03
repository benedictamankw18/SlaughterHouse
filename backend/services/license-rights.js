const DEFAULT_LICENSE_RIGHTS = Object.freeze({
  basic: Object.freeze({ formats: ['mp3'], commercialUse: false, distribution: false, stems: false }),
  premium: Object.freeze({ formats: ['mp3', 'wav'], commercialUse: true, distribution: false, stems: false }),
  unlimited: Object.freeze({ formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true }),
  exclusive: Object.freeze({ formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true, resaleProhibited: true })
});

function normalizeRights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const formats = Array.isArray(value.formats)
    ? [...new Set(value.formats.map(format => String(format).toLowerCase()).filter(Boolean))]
    : [];
  return {
    formats,
    commercialUse: Boolean(value.commercialUse),
    distribution: Boolean(value.distribution),
    stems: formats.includes('stems'),
    ...(value.resaleProhibited ? { resaleProhibited: true } : {})
  };
}

function parseRights(value) {
  if (typeof value === 'string') {
    try { return normalizeRights(JSON.parse(value)); } catch { return null; }
  }
  return normalizeRights(value);
}

function cloneRights(rights) {
  return { ...rights, formats: [...(rights.formats || [])] };
}

async function loadLicenseRights(db) {
  const rows = await db.all('SELECT license_type, rights_json FROM license_rights');
  const rights = {};
  for (const [licenseType, defaults] of Object.entries(DEFAULT_LICENSE_RIGHTS)) {
    rights[licenseType] = cloneRights(defaults);
  }
  for (const row of rows || []) {
    const parsed = parseRights(row.rights_json);
    if (parsed) rights[String(row.license_type).toLowerCase()] = parsed;
  }
  return rights;
}

function rightsFor(rights, licenseType) {
  const type = String(licenseType || '').toLowerCase();
  return rights?.[type] || rights?.basic || cloneRights(DEFAULT_LICENSE_RIGHTS[type] || DEFAULT_LICENSE_RIGHTS.basic);
}

function allowedFormats(rights) {
  return new Set((rights?.formats || []).map(format => String(format).toLowerCase()));
}

module.exports = { DEFAULT_LICENSE_RIGHTS, normalizeRights, parseRights, loadLicenseRights, rightsFor, allowedFormats };
