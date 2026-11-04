const ROLE_NAMES = Object.freeze(['visitor', 'customer', 'admin', 'super_admin']);

const ROLE_PERMISSIONS = Object.freeze({
  visitor: Object.freeze(['public:read']),
  customer: Object.freeze(['public:read', 'customer:self']),
  admin: Object.freeze(['public:read', 'customer:self', 'admin:read', 'admin:write']),
  super_admin: Object.freeze(['public:read', 'customer:self', 'admin:read', 'admin:write', 'admin:manage_roles', 'admin:manage_license_rights', 'admin:manage_settings'])
});

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'super_admin') return 'super_admin';
  if (value === 'admin') return 'admin';
  if (['customer', 'artist', 'non_artist'].includes(value)) return 'customer';
  return 'visitor';
}

function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[normalizeRole(role)]?.includes(permission) || false;
}

function hasRoleAccess(role, requiredRole) {
  const actual = normalizeRole(role);
  if (requiredRole === 'admin') return actual === 'admin' || actual === 'super_admin';
  return actual === requiredRole;
}

module.exports = { ROLE_NAMES, ROLE_PERMISSIONS, normalizeRole, hasPermission, hasRoleAccess };
