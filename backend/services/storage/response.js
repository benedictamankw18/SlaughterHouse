const path = require('node:path');
const storage = require('./index');
const logger = require('../logger');

function isMissingObject(error) {
  return error?.code === 'ENOENT' || error?.message === 'Storage keys must be simple file names.';
}

function parseRangeHeader(value, size) {
  if (!value || !Number.isFinite(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value).trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function sendStoredFile(response, key, {
  area = 'uploads',
  downloadName = null,
  headers = {},
  range = null
} = {}) {
  let file;
  try {
    file = await storage.stat(key, { area });
  } catch (error) {
    if (!isMissingObject(error)) logger.error('storage_file_stat_failed', { area, code: error.code });
    return response.sendStatus(isMissingObject(error) ? 404 : 500);
  }

  const requestedRange = parseRangeHeader(range, file.size);
  if (requestedRange?.invalid) {
    response.setHeader('Content-Range', `bytes */${file.size}`);
    return response.sendStatus(416);
  }

  const start = requestedRange ? requestedRange.start : undefined;
  const end = requestedRange ? requestedRange.end : undefined;
  let stream;
  try {
    stream = await storage.readStream(key, { area, start, end });
  } catch (error) {
    if (!isMissingObject(error)) logger.error('storage_file_open_failed', { area, code: error.code });
    return response.sendStatus(isMissingObject(error) ? 404 : 500);
  }

  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Length', requestedRange ? end - start + 1 : file.size);
  response.type(path.extname(key));
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  if (requestedRange) {
    response.status(206);
    response.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
  }
  if (downloadName) response.attachment(downloadName);
  stream.once('error', error => {
    logger.error('storage_file_stream_failed', { area, code: error.code });
    if (!response.headersSent) response.status(isMissingObject(error) ? 404 : 500).end();
    else response.destroy(error);
  });
  stream.pipe(response);
  return response;
}

module.exports = { sendStoredFile };
