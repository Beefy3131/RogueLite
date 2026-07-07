// Generates the PWA icons (public/icon-192.png, icon-512.png, icon-maskable-512.png)
// as valid PNGs with zero dependencies. Rerun via `npm run icons`.
// Placeholder art: green XP-gem diamond on the game's dark navy — swap for real
// icons later without touching anything else.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size, pixelFn) {
  // One filter byte (0 = None) per scanline, then RGBA pixels.
  const raw = Buffer.alloc(size * (1 + size * 4));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[off++] = r;
      raw[off++] = g;
      raw[off++] = b;
      raw[off++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [26, 26, 46]; // #1a1a2e
const GEM = [0, 230, 118]; // #00e676
const GEM_DARK = [0, 160, 82];

// A diamond (XP gem) with a darker lower half, on the dark navy background.
// `gemScale` shrinks the gem to keep it inside the maskable safe zone.
function iconPixel(size, gemScale) {
  const c = size / 2;
  const r = size * gemScale;
  return (x, y) => {
    const dx = Math.abs(x + 0.5 - c);
    const dy = Math.abs(y + 0.5 - c);
    if (dx + dy <= r) return y + 0.5 > c ? [...GEM_DARK, 255] : [...GEM, 255];
    return [...BG, 255];
  };
}

writeFileSync(join(outDir, 'icon-192.png'), png(192, iconPixel(192, 0.42)));
writeFileSync(join(outDir, 'icon-512.png'), png(512, iconPixel(512, 0.42)));
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, iconPixel(512, 0.3)));
console.log('Wrote icon-192.png, icon-512.png, icon-maskable-512.png to public/');
