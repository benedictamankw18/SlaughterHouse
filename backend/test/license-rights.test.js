const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_LICENSE_RIGHTS,
  normalizeRights,
  parseRights,
  loadLicenseRights,
  saveLicenseRights,
  validateRightsDefinition,
  rightsForPurchasedLicense,
  rightsFor,
  allowedFormats
} = require('../services/license-rights');

test('default rights match the historic license behaviour', () => {
  assert.deepEqual(allowedFormats(DEFAULT_LICENSE_RIGHTS.basic), new Set(['mp3']));
  assert.deepEqual(allowedFormats(DEFAULT_LICENSE_RIGHTS.premium), new Set(['mp3', 'wav']));
  assert.deepEqual(allowedFormats(DEFAULT_LICENSE_RIGHTS.unlimited), new Set(['mp3', 'wav', 'stems']));
  assert.equal(DEFAULT_LICENSE_RIGHTS.exclusive.resaleProhibited, true);
});

test('normalizeRights lowercases, deduplicates, and derives stems', () => {
  assert.deepEqual(normalizeRights({ formats: ['MP3', 'WAV', 'mp3'], commercialUse: 1 }), {
    formats: ['mp3', 'wav'],
    commercialUse: true,
    distribution: false,
    stems: false,
    usageLimits: {},
    distributionRules: []
  });
  assert.equal(normalizeRights({ formats: ['stems'] }).stems, true);
  assert.equal(normalizeRights({ formats: ['mp3'], resaleProhibited: true }).resaleProhibited, true);
  assert.equal(normalizeRights(null), null);
  assert.equal(normalizeRights(['mp3']), null);
});

test('parseRights accepts JSON text and rejects malformed values', () => {
  assert.deepEqual(parseRights('{"formats":["WAV"],"commercialUse":true}'), {
    formats: ['wav'],
    commercialUse: true,
    distribution: false,
    stems: false,
    usageLimits: {},
    distributionRules: []
  });
  assert.equal(parseRights('{not json'), null);
  assert.equal(parseRights(undefined), null);
});

test('loadLicenseRights merges database overrides over the defaults', async () => {
  const database = {
    async all() {
      return [
        { license_type: 'basic', rights_json: '{"formats":["mp3","wav"],"commercialUse":true}' },
        { license_type: 'exclusive', rights_json: '{"formats":["mp3"],"commercialUse":true,"distribution":false,"resaleProhibited":true}' }
      ];
    }
  };
  const rights = await loadLicenseRights(database);
  assert.deepEqual(allowedFormats(rights.basic), new Set(['mp3', 'wav']));
  assert.equal(rights.basic.commercialUse, true);
  assert.deepEqual(rights.basic.usageLimits, {});
  assert.deepEqual(allowedFormats(rights.exclusive), new Set(['mp3']));
  assert.deepEqual(allowedFormats(rights.premium), new Set(['mp3', 'wav']), 'missing rows keep the defaults');
});

test('loadLicenseRights ignores malformed rows and unknown types are safe', async () => {
  const rights = await loadLicenseRights({ async all() { return [{ license_type: 'basic', rights_json: 'broken' }]; } });
  assert.deepEqual(allowedFormats(rights.basic), new Set(['mp3']));
  assert.deepEqual(allowedFormats(rightsFor(rights, 'unknown')), new Set(['mp3']), 'unknown licenses fall back to basic');
  assert.deepEqual(allowedFormats(rightsFor(null, 'premium')), new Set(['mp3', 'wav']), 'a missing map falls back to defaults');
});

test('license definitions validate and preserve configured limits and distribution rules', () => {
  const validation = validateRightsDefinition({
    formats: ['MP3', 'wav'],
    commercialUse: true,
    distribution: true,
    resaleProhibited: true,
    usageLimits: { streams: 100000, copies: null },
    distributionRules: ['No resale of the source file.']
  });
  assert.equal(validation.error, undefined);
  assert.deepEqual(validation.value, {
    formats: ['mp3', 'wav'],
    commercialUse: true,
    distribution: true,
    stems: false,
    resaleProhibited: true,
    usageLimits: { streams: 100000, copies: null },
    distributionRules: ['No resale of the source file.']
  });
  assert.match(validateRightsDefinition({ formats: ['exe'] }).error, /Formats/);
  assert.match(validateRightsDefinition({ formats: ['mp3'], commercialUse: true, distribution: false, usageLimits: { streams: -1 }, distributionRules: [] }).error, /Usage limits/);
  assert.match(validateRightsDefinition({ formats: ['mp3'], commercialUse: true, distribution: false, usageLimits: {}, distributionRules: [''] }).error, /Distribution rules/);
});

test('saveLicenseRights writes validated definitions to the database', async () => {
  let saved;
  const database = {
    run(query, parameters, callback) {
      saved = { query, parameters };
      callback(null);
    }
  };
  const result = await saveLicenseRights(database, 'PREMIUM', {
    formats: ['mp3'],
    commercialUse: false,
    distribution: false,
    usageLimits: { streams: 50000 },
    distributionRules: ['No paid advertising.']
  });
  assert.equal(result.error, undefined);
  assert.match(saved.query, /INSERT INTO license_rights/);
  assert.equal(saved.parameters[0], 'premium');
  assert.deepEqual(JSON.parse(saved.parameters[1]).usageLimits, { streams: 50000 });
  const invalid = await saveLicenseRights(database, 'unknown', {});
  assert.match(invalid.error, /License type/);
});

test('purchased license snapshots remain authoritative after the policy changes', () => {
  const purchased = JSON.stringify({ formats: ['mp3'], commercialUse: false, distribution: false });
  const current = JSON.stringify({ formats: ['mp3', 'wav'], commercialUse: true, distribution: true });
  assert.deepEqual(allowedFormats(rightsForPurchasedLicense(purchased, current, 'basic')), new Set(['mp3']));
  assert.equal(rightsForPurchasedLicense(null, current, 'basic').commercialUse, true);
});
