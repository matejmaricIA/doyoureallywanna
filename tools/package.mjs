// Zip the extension/ folder for the stores. Usage: npm run package
//
//   dist/do-you-really-wanna-<version>-chromium.zip  Edge Add-ons, Chrome Web Store
//   dist/do-you-really-wanna-<version>-firefox.zip   Firefox Add-ons
//
// The same files in both. Only manifest.json differs: the Chromium one
// leaves out the keys only Firefox reads, which Edge Add-ons refuses
// (tools/lib/manifests.mjs, D-036).
//
// A tiny zip writer instead of a dependency. Timestamps are fixed, so the
// same source always gives the same zips.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { chromiumManifest } from './lib/manifests.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'extension');

const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json ${manifest.version} vs package.json ${pkg.version}`);
  process.exit(1);
}

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name);
      if (name.startsWith('.')) return [];
      return statSync(full).isDirectory() ? listFiles(full) : [full];
    });
}

/** Every file of extension/, as [path inside the zip, contents]. @type {[string, Buffer][]} */
const files = listFiles(source).map((file) => [
  path.relative(source, file).split(path.sep).join('/'),
  readFileSync(file),
]);

const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const DOS_TIME = 0;

/** @param {[string, Buffer][]} entries @returns {Buffer} */
function zip(entries) {
  /** @type {Buffer[]} */
  const local = [];
  /** @type {Buffer[]} */
  const central = [];
  let offset = 0;

  for (const [file, data] of entries) {
    const name = Buffer.from(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += header.length + name.length + packed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const count = central.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const chromium = Buffer.from(`${JSON.stringify(chromiumManifest(manifest), null, 2)}\n`);

/** @type {[string, [string, Buffer][]][]} */
const targets = [
  ['chromium', files.map(([name, data]) => [name, name === 'manifest.json' ? chromium : data])],
  ['firefox', files],
];

const outDir = path.join(root, 'dist');
mkdirSync(outDir, { recursive: true });
for (const [target, entries] of targets) {
  const outFile = path.join(outDir, `do-you-really-wanna-${manifest.version}-${target}.zip`);
  const data = zip(entries);
  writeFileSync(outFile, data);
  console.log(`wrote ${path.relative(root, outFile)} (${entries.length} files, ${(data.length / 1024).toFixed(1)} KB)`);
}
