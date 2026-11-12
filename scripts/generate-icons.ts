import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const BG = [0x70, 0x01, 0x43, 0xff] as const; // #700143 royal purple
const MOON = [0xf9, 0xf6, 0xbd, 0xff] as const; // #F9F6BD butter crescent
const SPROUT = [0x8a, 0x9a, 0x3a, 0xff] as const; // #8A9A3A sprout leaf green

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i] as number;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(8 + len + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, len, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + len));
  view.setUint32(8 + len, crc, false);
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  return png;
}

function renderMoonSproutIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Crescent moon: outer circle minus shifted inner circle
      const dOuter = Math.hypot(nx - 0.5, ny - 0.54);
      const dInner = Math.hypot(nx - 0.56, ny - 0.45);
      const inMoon = dOuter <= 0.31 && dInner >= 0.23;

      // Sprout stem + two leaves cradled inside crescent
      const inStem = Math.abs(nx - 0.5) <= 0.022 && ny >= 0.42 && ny <= 0.69;
      const leftLeaf =
        Math.hypot((nx - 0.41) / 0.11, (ny - 0.45) / 0.065) <= 1 &&
        nx <= 0.51;
      const rightLeaf =
        Math.hypot((nx - 0.59) / 0.11, (ny - 0.43) / 0.065) <= 1 &&
        nx >= 0.49;

      const idx = (y * size + x) * 4;
      const color = inStem || leftLeaf || rightLeaf ? SPROUT : inMoon ? MOON : BG;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }
  return encodePng(size, size, rgba);
}

const iconsDir = resolve(process.cwd(), 'public/icons');
mkdirSync(iconsDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Moonroot crescent and sprout">
  <title>Moonroot crescent and sprout</title>
  <rect width="512" height="512" rx="112" fill="#700143"/>
  <path d="M132 276a132 132 0 0 0 248 24 108 108 0 0 1-196-54 110 110 0 0 1 12-50 132 132 0 0 0-64 80Z" fill="#F9F6BD"/>
  <path d="M256 350V218" stroke="#8A9A3A" stroke-width="20" stroke-linecap="round"/>
  <path d="M256 250c-54-2-92-36-96-78 48-6 86 22 96 78Z" fill="#8A9A3A"/>
  <path d="M256 234c54-2 92-36 96-78-48-6-86 22-96 78Z" fill="#8A9A3A"/>
</svg>
`;

writeFileSync(resolve(iconsDir, 'moonroot-icon.svg'), svg, 'utf8');
writeFileSync(resolve(iconsDir, 'icon-192.png'), renderMoonSproutIcon(192));
writeFileSync(resolve(iconsDir, 'icon-512.png'), renderMoonSproutIcon(512));
console.log('Generated SVG and PNG app icons in public/icons/');
