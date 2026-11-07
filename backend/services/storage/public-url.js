// Catalogue artwork and public previews are the only uploads that may be exposed
// without authentication. Master audio, stems, sample audio, and certificates are
// always served through authenticated routes.
const PUBLIC_UPLOAD_PREFIX = /^(cover|merchandise|preview)-[A-Za-z0-9._-]+$/i;

function isPublicUploadKey(key) {
  return typeof key === 'string' && PUBLIC_UPLOAD_PREFIX.test(key);
}

function apiUploadPath(key) {
  return `/api/uploads/${encodeURIComponent(key)}`;
}

function apiPublicUploadUrl(apiPublicUrl, key) {
  if (!isPublicUploadKey(key)) return null;
  return new URL(apiUploadPath(key), apiPublicUrl).toString();
}

function joinUrl(...parts) {
  return parts
    .map(part => String(part || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

module.exports = {
  PUBLIC_UPLOAD_PREFIX,
  isPublicUploadKey,
  apiUploadPath,
  apiPublicUploadUrl,
  joinUrl
};
