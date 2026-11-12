import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  buildStageVectorPaths,
  DISCREET_LEAF_ART,
  SPROUT_VIEWBOX_SIZE,
  type VectorPathSpec,
} from '../core/companion/sproutArt';
import type { CompanionStage } from '../core/model/types';

function renderVectorXml(
  paths: readonly VectorPathSpec[],
  sizeDp = 120,
  viewport = SPROUT_VIEWBOX_SIZE,
): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${sizeDp}dp"`,
    `    android:height="${sizeDp}dp"`,
    `    android:viewportWidth="${viewport}"`,
    `    android:viewportHeight="${viewport}">`,
  ];

  for (const p of paths) {
    lines.push('    <path');
    lines.push(`        android:pathData="${p.pathData}"`);
    if (p.fillColor) {
      lines.push(`        android:fillColor="${p.fillColor}"`);
      if (p.fillAlpha !== undefined) {
        lines.push(`        android:fillAlpha="${p.fillAlpha}"`);
      }
    }
    if (p.strokeColor) {
      lines.push(`        android:strokeColor="${p.strokeColor}"`);
      lines.push(`        android:strokeWidth="${p.strokeWidth ?? 2}"`);
      if (p.strokeAlpha !== undefined) {
        lines.push(`        android:strokeAlpha="${p.strokeAlpha}"`);
      }
      if (p.strokeLineCap) {
        lines.push(`        android:strokeLineCap="${p.strokeLineCap}"`);
      }
    }
    lines[lines.length - 1] += ' />';
  }

  lines.push('</vector>');
  lines.push('');
  return lines.join('\n');
}

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
  ihdr[8] = 8;
  ihdr[9] = 6;

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

type Rgba = readonly [number, number, number, number];
const BG_DUSK: Rgba = [0x11, 0x15, 0x1f, 0xff];
const BG_DISCREET: Rgba = [0x1a, 0x20, 0x30, 0xff];
const MOON: Rgba = [0xf2, 0xb9, 0x6b, 0xff];
const SPROUT_GREEN: Rgba = [0x7a, 0xcb, 0xa5, 0xff];
const TRANSPARENT: Rgba = [0x00, 0x00, 0x00, 0x00];

function renderMoonSproutPng(size: number, roundMask: boolean, foregroundOnly: boolean): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;
      if (roundMask && Math.hypot(nx - 0.5, ny - 0.5) > 0.48) {
        rgba.set(TRANSPARENT, idx);
        continue;
      }
      const dOuter = Math.hypot(nx - 0.5, ny - 0.54);
      const dInner = Math.hypot(nx - 0.56, ny - 0.45);
      const inMoon = dOuter <= 0.31 && dInner >= 0.23;
      const inStem = Math.abs(nx - 0.5) <= 0.022 && ny >= 0.42 && ny <= 0.69;
      const leftLeaf = Math.hypot((nx - 0.41) / 0.11, (ny - 0.45) / 0.065) <= 1 && nx <= 0.51;
      const rightLeaf = Math.hypot((nx - 0.59) / 0.11, (ny - 0.43) / 0.065) <= 1 && nx >= 0.49;

      const color =
        inStem || leftLeaf || rightLeaf
          ? SPROUT_GREEN
          : inMoon
            ? MOON
            : foregroundOnly
              ? TRANSPARENT
              : BG_DUSK;
      rgba.set(color, idx);
    }
  }
  return encodePng(size, size, rgba);
}

function renderDiscreetLeafPng(size: number, roundMask: boolean, foregroundOnly: boolean): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;
      if (roundMask && Math.hypot(nx - 0.5, ny - 0.5) > 0.48) {
        rgba.set(TRANSPARENT, idx);
        continue;
      }
      // Simple symmetric botanical leaf silhouette (no moon, discreet appearance)
      const dx = (nx - 0.5) / 0.19;
      const dy = (ny - 0.47) / 0.27;
      const rx = dx * Math.cos(-0.2) - dy * Math.sin(-0.2);
      const ry = dx * Math.sin(-0.2) + dy * Math.cos(-0.2);
      const inLeaf = rx * rx + ry * ry <= 1;
      const inVein = Math.abs(nx - 0.5) <= 0.015 && ny >= 0.32 && ny <= 0.78;
      const color = inVein
        ? BG_DISCREET
        : inLeaf
          ? SPROUT_GREEN
          : foregroundOnly
            ? TRANSPARENT
            : BG_DISCREET;
      rgba.set(color, idx);
    }
  }
  return encodePng(size, size, rgba);
}

const root = process.cwd();
const resDir = resolve(root, 'android/app/src/main/res');
const drawableDir = resolve(resDir, 'drawable');
const valuesDir = resolve(resDir, 'values');
const anydpiDir = resolve(resDir, 'mipmap-anydpi-v26');

mkdirSync(drawableDir, { recursive: true });
mkdirSync(valuesDir, { recursive: true });
mkdirSync(anydpiDir, { recursive: true });

// 1. Seven stage drawables from exact shared Sprout geometry
const stages: readonly CompanionStage[] = [0, 1, 2, 3, 4, 5, 6];
for (const stage of stages) {
  const xml = renderVectorXml(buildStageVectorPaths(stage), 120, SPROUT_VIEWBOX_SIZE);
  writeFileSync(resolve(drawableDir, `sprout_stage_${stage}.xml`), xml, 'utf8');
}

// 2. Discreet leaf vector for widget discreet mode & monochrome notification small icon
writeFileSync(
  resolve(drawableDir, 'ic_moonroot_leaf.xml'),
  renderVectorXml(
    [
      { pathData: DISCREET_LEAF_ART.bladePath, fillColor: '#7ACBA5', fillAlpha: 0.94 },
      {
        pathData: DISCREET_LEAF_ART.veinPath,
        strokeColor: '#1A2030',
        strokeWidth: 2.5,
        strokeLineCap: 'round',
      },
    ],
    120,
    SPROUT_VIEWBOX_SIZE,
  ),
  'utf8',
);

writeFileSync(
  resolve(drawableDir, 'ic_stat_moonroot.xml'),
  renderVectorXml(
    [
      { pathData: DISCREET_LEAF_ART.bladePath, fillColor: '#FFFFFF' },
    ],
    24,
    SPROUT_VIEWBOX_SIZE,
  ),
  'utf8',
);

// 3. Adaptive icon backgrounds & discreet adaptive XML
writeFileSync(
  resolve(valuesDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#11151F</color>
    <color name="ic_launcher_discreet_background">#1A2030</color>
</resources>
`,
  'utf8',
);

for (const name of ['ic_launcher_discreet.xml', 'ic_launcher_discreet_round.xml']) {
  writeFileSync(
    resolve(anydpiDir, name),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_discreet_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_discreet_foreground"/>
</adaptive-icon>
`,
    'utf8',
  );
}

// 4. Density mipmap PNGs (API 24+ backward compatibility + foreground layers)
const densities = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
] as const;

for (const d of densities) {
  const dir = resolve(resDir, d.folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'ic_launcher.png'), renderMoonSproutPng(d.launcher, false, false));
  writeFileSync(resolve(dir, 'ic_launcher_round.png'), renderMoonSproutPng(d.launcher, true, false));
  writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), renderMoonSproutPng(d.foreground, false, true));

  writeFileSync(resolve(dir, 'ic_launcher_discreet.png'), renderDiscreetLeafPng(d.launcher, false, false));
  writeFileSync(resolve(dir, 'ic_launcher_discreet_round.png'), renderDiscreetLeafPng(d.launcher, true, false));
  writeFileSync(
    resolve(dir, 'ic_launcher_discreet_foreground.png'),
    renderDiscreetLeafPng(d.foreground, false, true),
  );
}

console.log('Generated Android widget drawables (sprout_stage_0..6, discreet leaf) and launcher mipmaps.');
