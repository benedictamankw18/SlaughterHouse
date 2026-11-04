const DEFAULT_LICENSE_RIGHTS = Object.freeze({
  basic: Object.freeze({ formats: ['mp3'], commercialUse: false, distribution: false, stems: false, usageLimits: {}, distributionRules: [] }),
  premium: Object.freeze({ formats: ['mp3', 'wav'], commercialUse: true, distribution: false, stems: false, usageLimits: {}, distributionRules: [] }),
  unlimited: Object.freeze({ formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true, usageLimits: {}, distributionRules: [] }),
  exclusive: Object.freeze({ formats: ['mp3', 'wav', 'stems'], commercialUse: true, distribution: true, stems: true, resaleProhibited: true, usageLimits: {}, distributionRules: [] })
});

const ALLOWED_FORMATS = new Set(['mp3', 'wav', 'stems']);
const LICENSE_TYPES = new Set(Object.keys(DEFAULT_LICENSE_RIGHTS));

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
    ...(value.resaleProhibited ? { resaleProhibited: true } : {}),
    usageLimits: value.usageLimits && typeof value.usageLimits === 'object' && !Array.isArray(value.usageLimits) ? { ...value.usageLimits } : {},
    distributionRules: Array.isArray(value.distributionRules) ? [...value.distributionRules] : []
  };
}

function validateRightsDefinition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'License rights must be an object.' };
  const allowedFields = new Set(['formats', 'commercialUse', 'distribution', 'resaleProhibited', 'usageLimits', 'distributionRules']);
  const unknownField = Object.keys(value).find(key => !allowedFields.has(key));
  if (unknownField) return { error: `Unknown license-rights field: ${unknownField}.` };
  if (!Array.isArray(value.formats) || value.formats.length === 0 || value.formats.some(format => typeof format !== 'string' || !ALLOWED_FORMATS.has(format.toLowerCase()))) {
    return { error: 'Formats must be a non-empty list containing only mp3, wav, and stems.' };
  }
  for (const field of ['commercialUse', 'distribution']) {
    if (typeof value[field] !== 'boolean') return { error: `${field} must be true or false.` };
  }
  if (value.resaleProhibited !== undefined && typeof value.resaleProhibited !== 'boolean') {
    return { error: 'resaleProhibited must be true or false.' };
  }
  if (value.usageLimits === undefined || !value.usageLimits || typeof value.usageLimits !== 'object' || Array.isArray(value.usageLimits)) {
    return { error: 'usageLimits must be an object with named non-negative integer limits; use null as a limit value for unlimited.' };
  }
  const limitEntries = Object.entries(value.usageLimits);
  if (limitEntries.length > 30 || limitEntries.some(([name, limit]) => !/^[a-z][a-z0-9_]{0,49}$/i.test(name) || (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)))) {
    return { error: 'Usage limits must have valid names and non-negative whole-number values (or null for unlimited).' };
  }
  if (!Array.isArray(value.distributionRules) || value.distributionRules.length > 30 || value.distributionRules.some(rule => typeof rule !== 'string' || !rule.trim() || rule.trim().length > 500)) {
    return { error: 'Distribution rules must be a list of up to 30 non-empty text rules, each at most 500 characters.' };
  }
  return {
    value: normalizeRights({
      ...value,
      formats: value.formats.map(format => format.toLowerCase()),
      distributionRules: value.distributionRules.map(rule => rule.trim())
    })
  };
}

function parseRights(value) {
  if (typeof value === 'string') {
    try { return normalizeRights(JSON.parse(value)); } catch { return null; }
  }
  return normalizeRights(value);
}

function cloneRights(rights) {
  return {
    ...rights,
    formats: [...(rights.formats || [])],
    usageLimits: { ...(rights.usageLimits || {}) },
    distributionRules: [...(rights.distributionRules || [])]
  };
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

async function saveLicenseRights(db, licenseType, definition) {
  const type = String(licenseType || '').toLowerCase();
  if (!LICENSE_TYPES.has(type)) return { error: `License type must be one of: ${[...LICENSE_TYPES].join(', ')}.` };
  const validation = validateRightsDefinition(definition);
  if (validation.error) return validation;
  await new Promise((resolve, reject) => db.run(
    `INSERT INTO license_rights (license_type, rights_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE rights_json = VALUES(rights_json)`,
    [type, JSON.stringify(validation.value)],
    error => error ? reject(error) : resolve()
  ));
  return { value: validation.value };
}

function rightsFor(rights, licenseType) {
  const type = String(licenseType || '').toLowerCase();
  return rights?.[type] || rights?.basic || cloneRights(DEFAULT_LICENSE_RIGHTS[type] || DEFAULT_LICENSE_RIGHTS.basic);
}

function rightsForPurchasedLicense(snapshot, currentDefinition, licenseType) {
  return parseRights(snapshot)
    || parseRights(currentDefinition)
    || rightsFor(DEFAULT_LICENSE_RIGHTS, licenseType);
}

function allowedFormats(rights) {
  return new Set((rights?.formats || []).map(format => String(format).toLowerCase()));
}

module.exports = {
  DEFAULT_LICENSE_RIGHTS,
  normalizeRights,
  validateRightsDefinition,
  parseRights,
  loadLicenseRights,
  saveLicenseRights,
  rightsFor,
  rightsForPurchasedLicense,
  allowedFormats
};
