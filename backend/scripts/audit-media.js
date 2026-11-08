const database = require('../database');
const config = require('../config');
const storage = require('../services/storage');
const logger = require('../services/logger');

const BEAT_MEDIA_COLUMNS = [
  ['cover_art', 'beat cover art'],
  ['preview_file', 'beat preview'],
  ['mp3_file', 'beat master MP3'],
  ['wav_file', 'beat master WAV'],
  ['stems_file', 'beat stems']
];

function queryRows(query, parameters = []) {
  return new Promise((resolve, reject) => {
    database.all(query, parameters, (error, rows) => error ? reject(error) : resolve(rows || []));
  });
}

function normalizeReference(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^[A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    const uploadsIndex = segments.lastIndexOf('uploads');
    if (uploadsIndex === -1) return null;
    const fileName = decodeURIComponent(segments[uploadsIndex + 1] || '');
    return /^[A-Za-z0-9._-]+$/.test(fileName) ? fileName : null;
  } catch {
    return null;
  }
}

async function collectReferences() {
  const references = [];
  const add = (area, value, source) => {
    const key = normalizeReference(value);
    if (key) references.push({ area, key, source });
  };

  const beats = await queryRows('SELECT id, title, cover_art, preview_file, mp3_file, wav_file, stems_file FROM beats ORDER BY id');
  for (const beat of beats) {
    for (const [column, label] of BEAT_MEDIA_COLUMNS) {
      add('uploads', beat[column], `${label} for beat ${beat.id} "${beat.title}"`);
    }
  }

  const merchandise = await queryRows('SELECT id, title, photo FROM merchandise ORDER BY id');
  for (const item of merchandise) {
    add('uploads', item.photo, `photo for merchandise ${item.id} "${item.title}"`);
  }

  const releases = await queryRows('SELECT id, title, cover_url FROM stream_releases ORDER BY id');
  for (const release of releases) {
    add('uploads', release.cover_url, `cover for stream release ${release.id} "${release.title}"`);
  }

  const requests = await queryRows("SELECT id, sample_audio_file FROM customization_requests WHERE sample_audio_file IS NOT NULL AND sample_audio_file <> '' ORDER BY id");
  for (const request of requests) {
    add('uploads', request.sample_audio_file, `sample audio for customization request ${request.id}`);
  }

  const certificates = await queryRows("SELECT id, pdf_storage_path FROM license_certificates WHERE pdf_storage_path IS NOT NULL AND pdf_storage_path <> ''");
  for (const certificate of certificates) {
    add('certificates', certificate.pdf_storage_path, `PDF for license certificate ${certificate.id}`);
  }

  return references;
}

async function audit() {
  const references = await collectReferences();
  const results = await Promise.all(references.map(async reference => {
    try {
      await storage.stat(reference.key, { area: reference.area });
      return { ...reference, status: 'ok' };
    } catch (error) {
      return { ...reference, status: error.code === 'ENOENT' ? 'missing' : 'failed', error };
    }
  }));

  const missing = results.filter(result => result.status === 'missing');
  const failed = results.filter(result => result.status === 'failed');
  for (const item of missing) {
    logger.warn('media_reference_missing', { area: item.area, key: item.key, referencedBy: item.source });
  }
  for (const item of failed) {
    logger.error('media_reference_check_failed', { area: item.area, key: item.key, referencedBy: item.source, code: item.error?.code });
  }
  logger.info('media_audit_complete', {
    driver: config.storageDriver,
    checked: results.length,
    missing: missing.length,
    failed: failed.length
  });

  if (missing.length || failed.length) process.exitCode = 1;
}

audit()
  .catch(error => {
    logger.error('media_audit_failed', { code: error?.code });
    process.exitCode = 1;
  })
  .finally(() => {
    database.close().catch(() => {});
  });
