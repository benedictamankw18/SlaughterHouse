const path = require('node:path');
const storage = require('./index');
const logger = require('../logger');

async function sendStoredFile(response, key, {
  area = 'uploads',
  downloadName = null,
  headers = {}
} = {}) {
  let file;
  let stream;
  try {
    file = await storage.stat(key, { area });
    stream = storage.readStream(key, { area });
    await new Promise((resolve, reject) => {
      stream.once('open', resolve);
      stream.once('error', reject);
    });
  } catch (error) {
    stream?.destroy();
    if (error.code !== 'ENOENT' && error.message !== 'Storage keys must be simple file names.') {
      logger.error('storage_file_open_failed', { area, code: error.code });
    }
    return response.sendStatus(error.code === 'ENOENT' || error.message === 'Storage keys must be simple file names.' ? 404 : 500);
  }

  response.setHeader('Content-Length', file.size);
  response.type(path.extname(key));
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  if (downloadName) response.attachment(downloadName);
  stream.once('error', error => {
    logger.error('storage_file_stream_failed', { area, code: error.code });
    if (!response.headersSent) response.status(error.code === 'ENOENT' ? 404 : 500).end();
    else response.destroy(error);
  });
  stream.pipe(response);
  return response;
}

module.exports = { sendStoredFile };
