const test = require('node:test');
const assert = require('node:assert/strict');
const { BUSINESS_SETTINGS, validateDateRange, validateSettingUpdates, validateReportGranularity, buildReportPeriods } = require('../services/admin-controls');

test('business settings accepts only known non-negative currency values', () => {
  const result = validateSettingUpdates({
    booking_fee_mixtape_ghs: '750.50',
    booking_ep_album_discount_percent: 15,
    beat_default_exclusive_usd: 420,
    beat_request_license_basic_ghs: 1.15,
    usd_to_ghs_rate: '12.345678'
  });
  assert.deepEqual(result.value, [
    ['booking_fee_mixtape_ghs', '750.50'],
    ['booking_ep_album_discount_percent', '15.00'],
    ['beat_default_exclusive_usd', '420.00'],
    ['beat_request_license_basic_ghs', '1.15'],
    ['usd_to_ghs_rate', '12.345678']
  ]);
  assert.equal(validateSettingUpdates({ unknown_setting: 1 }).error.includes('cannot be changed'), true);
  assert.equal(validateSettingUpdates({ beat_default_basic_usd: -1 }).error.includes('non-negative'), true);
  assert.equal(validateSettingUpdates({ beat_default_basic_usd: 1.001 }).error.includes('two decimal places'), true);
  assert.equal(validateSettingUpdates({ usd_to_ghs_rate: 0 }).error.includes('greater than zero'), true);
  assert.equal(validateSettingUpdates({ usd_to_ghs_rate: 1000000 }).error.includes('less than 1000000'), true);
  assert.equal(validateSettingUpdates({ usd_to_ghs_rate: 1.0000001 }).error.includes('at most 6 decimal places'), true);
  assert.equal(validateSettingUpdates({ booking_ep_album_discount_percent: 100 }).error.includes('less than 100%'), true);
  assert.equal(validateSettingUpdates([]).error.includes('object'), true);
  assert.ok(Object.keys(BUSINESS_SETTINGS).length > 0);
});

test('date range accepts valid optional dates and rejects invalid or reversed ranges', () => {
  assert.deepEqual(validateDateRange('2026-01-01', '2026-12-31').value, { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(validateDateRange(null, null).value, { from: null, to: null });
  assert.equal(validateDateRange('2026-02-31', null).error, 'from must be a valid date in YYYY-MM-DD format.');
  assert.equal(validateDateRange('2026-13-01', null).error, 'from must be a valid date in YYYY-MM-DD format.');
  assert.equal(validateDateRange('2026-12-01', '2026-11-30').error, 'The start date must be on or before the end date.');
  assert.equal(validateDateRange('2024-01-01', '2025-01-02').error, 'Date ranges cannot exceed 366 days.');
  assert.deepEqual(validateDateRange('2024-01-01', '2026-12-31', 36600).value, { from: '2024-01-01', to: '2026-12-31' });
});

test('report granularity validation accepts only day, week, month, or year', () => {
  assert.equal(validateReportGranularity(undefined).value, 'day');
  assert.equal(validateReportGranularity('WEEK').value, 'week');
  assert.equal(validateReportGranularity('month').value, 'month');
  assert.equal(validateReportGranularity('year').value, 'year');
  assert.equal(validateReportGranularity('quarter').error, 'granularity must be one of day, week, month, or year.');
});

test('report periods are zero-fill ready and sorted for every granularity', () => {
  assert.deepEqual(buildReportPeriods('2026-11-08', '2026-11-10', 'day'), ['2026-11-08', '2026-11-09', '2026-11-10']);
  assert.deepEqual(buildReportPeriods('2026-11-04', '2026-11-11', 'week'), ['2026-11-02', '2026-11-09']);
  assert.deepEqual(buildReportPeriods('2026-09-15', '2026-11-02', 'month'), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(buildReportPeriods('2024-06-01', '2026-01-01', 'year'), ['2024', '2025', '2026']);
  assert.deepEqual(buildReportPeriods('2026-11-08', '2026-11-10', 'quarter'), []);
});
