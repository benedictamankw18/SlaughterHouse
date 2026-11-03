const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_LICENSE_RIGHTS,
  normalizeRights,
  parseRights,
  loadLicenseRights,
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
    stems: false
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
    stems: false
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
  assert.deepEqual(allowedFormats(rights.exclusive), new Set(['mp3']));
  assert.deepEqual(allowedFormats(rights.premium), new Set(['mp3', 'wav']), 'missing rows keep the defaults');
});

test('loadLicenseRights ignores malformed rows and unknown types are safe', async () => {
  const rights = await loadLicenseRights({ async all() { return [{ license_type: 'basic', rights_json: 'broken' }]; } });
  assert.deepEqual(allowedFormats(rights.basic), new Set(['mp3']));
  assert.deepEqual(allowedFormats(rightsFor(rights, 'unknown')), new Set(['mp3']), 'unknown licenses fall back to basic');
  assert.deepEqual(allowedFormats(rightsFor(null, 'premium')), new Set(['mp3', 'wav']), 'a missing map falls back to defaults');
});
