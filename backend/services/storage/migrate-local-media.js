const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function checksum(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function migrateDirectory(directory, area, targetStorage) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { copied: 0, alreadyPresent: 0 };
    throw error;
  }

  let copied = 0;
  let alreadyPresent = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const key = entry.name;
    if (path.basename(key) !== key || /[\\/]/.test(key)) {
      throw new Error(`Local media contains an unsupported storage key in ${area}.`);
    }

    const contents = await fs.readFile(path.join(directory, key));
    try {
      await verifyExistingObject(targetStorage, area, key, contents);
      alreadyPresent += 1;
      continue;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await targetStorage.save(contents, { area, key });
      copied += 1;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await verifyExistingObject(targetStorage, area, key, contents);
      alreadyPresent += 1;
    }
  }
  return { copied, alreadyPresent };
}

async function verifyExistingObject(targetStorage, area, key, contents) {
  const stat = await targetStorage.stat(key, { area });
  const existing = await streamToBuffer(await targetStorage.readStream(key, { area }));
  if (Number(stat.size) !== contents.length || checksum(existing) !== checksum(contents)) {
    throw new Error(`Existing object does not match local media: ${area}/${key}`);
  }
}

async function migrateLocalMedia({ directories, targetStorage }) {
  const summary = {};
  for (const area of ['uploads', 'certificates']) {
    summary[area] = await migrateDirectory(directories[area], area, targetStorage);
  }
  return summary;
}

module.exports = { migrateLocalMedia };
