const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_NAMES, normalizeRole, hasPermission, hasRoleAccess } = require('../services/roles');

test('role normalization maps existing customer types and fails closed for unknown values', () => {
  assert.deepEqual(ROLE_NAMES, ['visitor', 'customer', 'admin', 'super_admin']);
  assert.equal(normalizeRole(null), 'visitor');
  assert.equal(normalizeRole('artist'), 'customer');
  assert.equal(normalizeRole('non_artist'), 'customer');
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('super_admin'), 'super_admin');
  assert.equal(normalizeRole('unexpected'), 'visitor');
});

test('role access keeps super-admin-only permissions separate from admin access', () => {
  assert.equal(hasRoleAccess('admin', 'admin'), true);
  assert.equal(hasRoleAccess('super_admin', 'admin'), true);
  assert.equal(hasRoleAccess('admin', 'super_admin'), false);
  assert.equal(hasRoleAccess('customer', 'admin'), false);
  assert.equal(hasRoleAccess('visitor', 'visitor'), true);
  assert.equal(hasPermission('admin', 'admin:write'), true);
  assert.equal(hasPermission('admin', 'admin:manage_license_rights'), false);
  assert.equal(hasPermission('super_admin', 'admin:manage_license_rights'), true);
  assert.equal(hasPermission('customer', 'customer:self'), true);
  assert.equal(hasPermission('visitor', 'customer:self'), false);
});
