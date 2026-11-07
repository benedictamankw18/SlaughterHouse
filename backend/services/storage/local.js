const fs = require('node:fs');
const path = require('node:path');
const { apiPublicUploadUrl } = require('./public-url');

const STORAGE_AREAS = Object.freeze(['uploads', 'certificates']);

function createLocalStorage({ uploadDirectory, certificateDirectory, apiPublicUrl } = {}) {
  const directories = {
    uploads: path.resolve(uploadDirectory || path.join(process.cwd(), 'data', 'uploads')),
    certificates: path.resolve(certificateDirectory || path.join(process.cwd(), 'data', 'certificates'))
  };

  function resolvePath(key, area = 'uploads') {
    if (!STORAGE_AREAS.includes(area)) throw new Error(`Unknown storage area: ${area}`);
    if (typeof key !== 'string' || !key || path.basename(key) !== key || key === '.' || key === '..' || /[\\/]/.test(key)) {
      throw new Error('Storage keys must be simple file names.');
    }
    return path.join(directories[area], key);
  }

  async function save(data, { area = 'uploads', key } = {}) {
    const destination = resolvePath(key, area);
    await fs.promises.mkdir(directories[area], { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(destination, data, { flag: 'wx', mode: 0o600 });
    return key;
  }

  function readStream(key, { area = 'uploads', start, end } = {}) {
    const filePath = resolvePath(key, area);
    return start === undefined && end === undefined
      ? fs.createReadStream(filePath)
      : fs.createReadStream(filePath, { start, end });
  }

  async function deleteFile(key, { area = 'uploads' } = {}) {
    await fs.promises.unlink(resolvePath(key, area));
  }

  async function stat(key, { area = 'uploads' } = {}) {
    return fs.promises.stat(resolvePath(key, area));
  }

  function publicUrl(key) {
    return apiPublicUploadUrl(apiPublicUrl, key);
  }

  async function checkWritable(area) {
    if (!STORAGE_AREAS.includes(area)) throw new Error(`Unknown storage area: ${area}`);
    await fs.promises.mkdir(directories[area], { recursive: true, mode: 0o700 });
    await fs.promises.access(directories[area], fs.constants.W_OK);
  }

  return Object.freeze({ save, readStream, delete: deleteFile, stat, publicUrl, checkWritable });
}

module.exports = { createLocalStorage, STORAGE_AREAS };
