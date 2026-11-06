const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const imagesDirectory = path.join(__dirname, '..', '..', 'frontend', 'Images');
const heroImages = ['Hero1.png', 'Hero2.png', 'Hero3.png', 'Hero4.png', 'Hero5.png'];

async function optimizeHero(name) {
  const input = path.join(imagesDirectory, name);
  if (!fs.existsSync(input)) {
    console.warn(`Skipping ${name}: file not found.`);
    return;
  }
  const base = path.basename(name, path.extname(name));
  const output = path.join(imagesDirectory, `${base}.webp`);
  await sharp(input).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toFile(output);
  const summary = `${path.basename(output)} ${Math.round(fs.statSync(output).size / 1024)} KB`;
  console.log(`${name}: ${summary}`);
}

(async () => {
  for (const name of heroImages) await optimizeHero(name);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
