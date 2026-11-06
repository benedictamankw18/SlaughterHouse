const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalStorage } = require('../services/storage/local');

test('local storage saves, streams, stats, and deletes files in their private areas', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultbigboy-storage-'));
  const storage = createLocalStorage({
    uploadDirectory: path.join(root, 'private', 'uploads'),
    certificateDirectory: path.join(root, 'private', 'certificates'),
    apiPublicUrl: 'https://api.example.test'
  });
  const contents = Buffer.from('local private asset');
  try {
    await storage.save(contents, { area: 'uploads', key: 'preview-123.mp3' });
    await storage.save(Buffer.from('certificate'), { area: 'certificates', key: 'certificate-123.pdf' });
    assert.equal((await storage.stat('preview-123.mp3', { area: 'uploads' })).size, contents.length);
    assert.deepEqual(await streamToBuffer(storage.readStream('preview-123.mp3', { area: 'uploads' })), contents);
    assert.deepEqual(
      await fs.readFile(path.join(root, 'private', 'certificates', 'certificate-123.pdf')),
      Buffer.from('certificate')
    );
    assert.equal(storage.publicUrl('preview-123.mp3'), 'https://api.example.test/api/uploads/preview-123.mp3');
    assert.equal(storage.publicUrl('cover-123.webp'), 'https://api.example.test/api/uploads/cover-123.webp');
    assert.equal(storage.publicUrl('merchandise-123.png'), 'https://api.example.test/api/uploads/merchandise-123.png');
    assert.equal(storage.publicUrl('sample-audio-123.mp3'), null);
    assert.equal(storage.publicUrl('mp3-123.mp3'), null);
    await storage.delete('preview-123.mp3', { area: 'uploads' });
    await assert.rejects(storage.stat('preview-123.mp3', { area: 'uploads' }), { code: 'ENOENT' });
    await storage.checkWritable('certificates');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('local storage refuses traversal and non-exclusive overwrites', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ultbigboy-storage-'));
  const storage = createLocalStorage({
    uploadDirectory: path.join(root, 'uploads'),
    certificateDirectory: path.join(root, 'certificates'),
    apiPublicUrl: 'https://api.example.test'
  });
  try {
    await assert.rejects(storage.save(Buffer.from('x'), { key: '..\\outside.txt' }), /simple file names/);
    assert.throws(() => storage.readStream('../outside.txt'), /simple file names/);
    await storage.save(Buffer.from('first'), { key: 'cover-123.jpg' });
    await assert.rejects(storage.save(Buffer.from('second'), { key: 'cover-123.jpg' }), { code: 'EEXIST' });
    assert.equal((await fs.readFile(path.join(root, 'uploads', 'cover-123.jpg'))).toString(), 'first');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
