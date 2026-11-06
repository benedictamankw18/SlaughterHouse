const crypto = require('node:crypto');
const path = require('node:path');
const storage = require('./storage');
const monitoring = require('./monitoring');
const logger = require('./logger');

function hasValidFileSignature(bytes, kind) {
  if (kind === 'image') {
    return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
  }
  return bytes.subarray(0, 3).toString() === 'ID3'
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    || bytes.subarray(0, 4).toString() === 'OggS'
    || (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE')
    || bytes.subarray(4, 8).toString() === 'ftyp';
}

async function saveUpload(file, prefix, kind) {
  if (!file?.data || !file.name) return null;
  try {
    if (typeof prefix !== 'string' || !/^[a-z0-9-]+$/i.test(prefix)) throw new Error('Invalid upload category.');
    const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid upload format.');
    const extension = path.extname(file.name).toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    const rules = {
      image: { extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']), mime: new Set(['image/jpeg', 'image/png', 'image/webp']), maxBytes: 5 * 1024 * 1024 },
      audio: { extensions: new Set(['.mp3', '.wav', '.ogg', '.m4a', '.mp4']), mime: new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'video/mp4']), maxBytes: 25 * 1024 * 1024 }
    };
    const rule = rules[kind];
    if (!rule || !rule.extensions.has(extension) || !rule.mime.has(match[1].toLowerCase()) || bytes.length > rule.maxBytes || !hasValidFileSignature(bytes, kind)) {
      throw new Error(kind === 'image' ? 'Upload a valid JPG, PNG, or WebP image up to 5 MB.' : 'Upload a valid audio file up to 25 MB.');
    }
    const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extension}`;
    await storage.save(bytes, { area: 'uploads', key: filename });
    return filename;
  } catch (error) {
    monitoring.increment('uploadFailures');
    throw error;
  }
}

async function deleteUpload(filename) {
  await storage.delete(filename, { area: 'uploads' });
}

async function deleteUploads(filenames) {
  const results = await Promise.allSettled(filenames.filter(Boolean).map(deleteUpload));
  for (const result of results) {
    if (result.status === 'rejected') logger.error('upload_cleanup_failed', { code: result.reason?.code });
  }
}

module.exports = { saveUpload, deleteUpload, deleteUploads };
