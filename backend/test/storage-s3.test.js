const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createS3Storage, PUBLIC_CACHE_CONTROL } = require('../services/storage/s3');

function objectNotFound() {
  return Object.assign(new Error('Not Found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
}

function createFakeClient() {
  const objects = new Map();
  const calls = [];
  return {
    objects,
    calls,
    async send(command) {
      const name = command.constructor.name;
      const input = command.input;
      calls.push({ name, input });
      if (name === 'HeadBucketCommand') return {};
      if (name === 'PutObjectCommand') {
        if (input.IfNoneMatch === '*' && objects.has(input.Key)) {
          throw Object.assign(new Error('Precondition Failed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
        }
        objects.set(input.Key, {
          body: Buffer.from(input.Body),
          contentType: input.ContentType,
          cacheControl: input.CacheControl
        });
        return {};
      }
      if (name === 'HeadObjectCommand') {
        const object = objects.get(input.Key);
        if (!object) throw objectNotFound();
        return { ContentLength: object.body.length };
      }
      if (name === 'GetObjectCommand') {
        const object = objects.get(input.Key);
        if (!object) throw Object.assign(new Error('No Such Key'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
        let body = object.body;
        if (input.Range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(input.Range);
          if (!match) throw new Error(`Unexpected range: ${input.Range}`);
          const start = Number(match[1]);
          const end = match[2] === '' ? body.length - 1 : Math.min(Number(match[2]), body.length - 1);
          body = body.subarray(start, end + 1);
        }
        return { Body: Readable.from([body]) };
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(input.Key);
        return {};
      }
      throw new Error(`Unhandled command: ${name}`);
    }
  };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function createStorage(overrides = {}) {
  const client = createFakeClient();
  const storage = createS3Storage({
    bucket: 'media-bucket',
    region: 'auto',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    apiPublicUrl: 'https://api.example.test',
    client,
    ...overrides
  });
  return { storage, client };
}

test('s3 storage saves, streams, stats, and deletes objects per area', async () => {
  const { storage, client } = createStorage();
  const contents = Buffer.from('public preview bytes');
  await storage.save(contents, { area: 'uploads', key: 'preview-123.mp3' });
  await storage.save(Buffer.from('certificate'), { area: 'certificates', key: 'certificate-123.pdf' });

  assert.equal((await storage.stat('preview-123.mp3', { area: 'uploads' })).size, contents.length);
  assert.deepEqual(await streamToBuffer(await storage.readStream('preview-123.mp3', { area: 'uploads' })), contents);
  assert.deepEqual(await streamToBuffer(await storage.readStream('certificate-123.pdf', { area: 'certificates' })), Buffer.from('certificate'));
  assert.ok(client.objects.get('uploads/preview-123.mp3'));
  assert.ok(client.objects.get('certificates/certificate-123.pdf'));
  assert.equal(client.objects.get('uploads/preview-123.mp3').contentType, 'audio/mpeg');
  assert.equal(client.objects.get('uploads/preview-123.mp3').cacheControl, PUBLIC_CACHE_CONTROL);
  assert.equal(client.objects.get('certificates/certificate-123.pdf').cacheControl, 'private, no-store');

  await storage.delete('preview-123.mp3', { area: 'uploads' });
  await assert.rejects(storage.stat('preview-123.mp3', { area: 'uploads' }), { code: 'ENOENT' });
});

test('s3 storage maps missing objects to ENOENT and refuses overwrites', async () => {
  const { storage } = createStorage();
  await assert.rejects(storage.stat('cover-missing.webp'), { code: 'ENOENT' });
  await assert.rejects(storage.readStream('preview-missing.mp3'), { code: 'ENOENT' });
  await storage.save(Buffer.from('first'), { key: 'cover-123.webp' });
  await assert.rejects(storage.save(Buffer.from('second'), { key: 'cover-123.webp' }), { code: 'EEXIST' });
});

test('s3 storage honours key prefixes, ranges, and traversal protection', async () => {
  const { storage, client } = createStorage({ keyPrefix: 'ultbigboy' });
  await storage.save(Buffer.from('0123456789'), { key: 'preview-range.mp3' });
  const ranged = await storage.readStream('preview-range.mp3', { start: 2, end: 5 });
  assert.equal((await streamToBuffer(ranged)).toString(), '2345');
  assert.equal(client.objects.has('ultbigboy/uploads/preview-range.mp3'), true);

  await assert.rejects(storage.save(Buffer.from('x'), { key: '../outside.txt' }), /simple file names/);
  await assert.rejects(storage.stat('../outside.txt'), /simple file names/);
  await assert.rejects(storage.save(Buffer.from('x'), { area: 'backups', key: 'cover-1.webp' }), /Unknown storage area/);
});

test('s3 storage exposes only public catalogue assets', () => {
  const { storage } = createStorage({ publicMediaBaseUrl: 'https://media.example.test/', keyPrefix: 'ultbigboy/' });
  assert.equal(storage.publicUrl('cover-123.webp'), 'https://media.example.test/ultbigboy/uploads/cover-123.webp');
  assert.equal(storage.publicUrl('merchandise-123.png'), 'https://media.example.test/ultbigboy/uploads/merchandise-123.png');
  assert.equal(storage.publicUrl('preview-123.mp3'), 'https://media.example.test/ultbigboy/uploads/preview-123.mp3');
  assert.equal(storage.publicUrl('mp3-123.mp3'), null);
  assert.equal(storage.publicUrl('wav-123.mp3'), null);
  assert.equal(storage.publicUrl('stems-123.mp3'), null);
  assert.equal(storage.publicUrl('sample-audio-123.mp3'), null);
  assert.equal(storage.publicUrl('certificate-123.pdf'), null);
});

test('s3 storage falls back to the API upload proxy without a public media base URL', () => {
  const { storage } = createStorage();
  assert.equal(storage.publicUrl('cover-123.webp'), 'https://api.example.test/api/uploads/cover-123.webp');
  assert.equal(storage.publicUrl('mp3-123.mp3'), null);
});

test('s3 storage probes write access once and retries after a failure', async () => {
  const { storage, client } = createStorage();
  await storage.checkWritable('uploads');
  await storage.checkWritable('certificates');
  const probes = () => client.calls.filter(call => call.name === 'PutObjectCommand' && call.input.Key.endsWith('health/probe')).length;
  assert.equal(probes(), 1);
  assert.equal(client.objects.has('health/probe'), false);

  let attempts = 0;
  const inner = createFakeClient();
  const failingClient = {
    async send(command) {
      if (command.constructor.name === 'PutObjectCommand' && command.input.Key.endsWith('health/probe')) {
        attempts += 1;
        if (attempts === 1) throw new Error('bucket unavailable');
      }
      return inner.send(command);
    }
  };
  const failingStorage = createS3Storage({ bucket: 'media-bucket', apiPublicUrl: 'https://api.example.test', client: failingClient });
  await assert.rejects(failingStorage.checkWritable('uploads'), /bucket unavailable/);
  await failingStorage.checkWritable('uploads');
  assert.equal(attempts, 2);
});
