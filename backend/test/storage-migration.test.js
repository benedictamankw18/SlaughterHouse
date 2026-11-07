const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { migrateLocalMedia } = require('../services/storage/migrate-local-media');

function createTargetStorage() {
  const objects = new Map();
  return {
    objects,
    async save(contents, { area, key }) {
      const objectKey = `${area}/${key}`;
      if (objects.has(objectKey)) throw Object.assign(new Error('Already exists'), { code: 'EEXIST' });
      objects.set(objectKey, Buffer.from(contents));
    },
    async readStream(key, { area }) {
      return Readable.from([objects.get(`${area}/${key}`)]);
    },
    async stat(key, { area }) {
      const contents = objects.get(`${area}/${key}`);
      if (!contents) throw Object.assign(new Error('Missing object'), { code: 'ENOENT' });
      return { size: contents.length };
    }
  };
}

test('local media migration is resumable and verifies existing objects', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultbigboy-media-migration-'));
  const directories = {
    uploads: path.join(root, 'uploads'),
    certificates: path.join(root, 'certificates')
  };
  await Promise.all(Object.values(directories).map(directory => fs.mkdir(directory, { recursive: true })));
  await fs.writeFile(path.join(directories.uploads, 'mp3-21.mp3'), Buffer.from('paid master'));
  await fs.writeFile(path.join(directories.certificates, 'certificate-21.pdf'), Buffer.from('private certificate'));
  const targetStorage = createTargetStorage();

  try {
    const first = await migrateLocalMedia({ directories, targetStorage });
    assert.deepEqual(first, {
      uploads: { copied: 1, alreadyPresent: 0 },
      certificates: { copied: 1, alreadyPresent: 0 }
    });
    const second = await migrateLocalMedia({ directories, targetStorage });
    assert.deepEqual(second, {
      uploads: { copied: 0, alreadyPresent: 1 },
      certificates: { copied: 0, alreadyPresent: 1 }
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('local media migration stops if a destination object differs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultbigboy-media-mismatch-'));
  const directory = path.join(root, 'uploads');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'mp3-21.mp3'), Buffer.from('local master'));
  const targetStorage = createTargetStorage();
  targetStorage.objects.set('uploads/mp3-21.mp3', Buffer.from('different master'));

  try {
    await assert.rejects(
      migrateLocalMedia({
        directories: { uploads: directory, certificates: path.join(root, 'certificates') },
        targetStorage
      }),
      /Existing object does not match local media: uploads\/mp3-21\.mp3/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('local media migration treats missing source directories as empty', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultbigboy-media-missing-'));

  try {
    const result = await migrateLocalMedia({
      directories: {
        uploads: path.join(root, 'uploads'),
        certificates: path.join(root, 'certificates')
      },
      targetStorage: createTargetStorage()
    });
    assert.deepEqual(result, {
      uploads: { copied: 0, alreadyPresent: 0 },
      certificates: { copied: 0, alreadyPresent: 0 }
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
