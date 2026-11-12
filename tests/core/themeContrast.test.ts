import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function parseCssVars(blockBody: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const matches = blockBody.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi);
  for (const m of matches) {
    const key = m[1];
    const val = m[2]?.trim();
    if (key && val) vars[key] = val;
  }
  return vars;
}

function extractThemesFromCss(css: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/i);
  if (rootMatch?.[1]) {
    themes.dusk = parseCssVars(rootMatch[1]);
  }
  const attrMatches = css.matchAll(/\[data-theme=['"]([a-z0-9-]+)['"]\]\s*\{([^}]+)\}/gi);
  for (const m of attrMatches) {
    const name = m[1];
    const body = m[2];
    if (name && body) {
      themes[name] = { ...(themes.dusk ?? {}), ...parseCssVars(body) };
    }
  }
  return themes;
}

function relativeLuminance(hex: string): number {
  const clean = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Expected 6-digit hex color, got: ${hex}`);
  }
  const channels = [1, 3, 5].map((idx) => {
    const c = parseInt(clean.slice(idx, idx + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('Theme WCAG contrast checks', () => {
  it('verifies all themes exist and unlockable + dark themes meet WCAG AA contrast targets', () => {
    const css = readFileSync(resolve(process.cwd(), 'ui/styles/tokens.css'), 'utf8');
    const themes = extractThemesFromCss(css);

    for (const required of ['dusk', 'dawn', 'high-contrast', 'meadow', 'ocean', 'rose', 'midnight']) {
      expect(themes[required]).toBeDefined();
    }

    // Midnight uses a true #000000 AMOLED background
    expect(themes.midnight?.bg?.toLowerCase()).toBe('#000000');

    // Every unlockable theme + dusk + high-contrast must pass >= 4.5:1 on text & buttons and >= 3.0:1 on marks
    for (const themeName of ['dusk', 'high-contrast', 'meadow', 'ocean', 'rose', 'midnight']) {
      const t = themes[themeName];
      expect(t).toBeDefined();
      if (!t) continue;

      const surfaces = [t.bg, t.surface, t['surface-2']].filter((s): s is string => Boolean(s));
      for (const surface of surfaces) {
        expect(contrastRatio(t.text ?? '', surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t['text-muted'] ?? '', surface)).toBeGreaterThanOrEqual(4.5);

        for (const mark of [
          t.flow,
          t.spotting,
          t.sleep,
          t.water,
          t.gut,
          t['level-green'],
          t['level-yellow'],
          t['level-orange'],
          t['level-red'],
        ]) {
          expect(contrastRatio(mark ?? '', surface)).toBeGreaterThanOrEqual(3.0);
        }
      }

      expect(contrastRatio(t['accent-text'] ?? '', t.accent ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['lamp-text'] ?? '', t.lamp ?? '')).toBeGreaterThanOrEqual(4.5);
    }

    // Dawn main text, muted text, accent button text >= 4.5:1
    const dawn = themes.dawn;
    expect(dawn).toBeDefined();
    if (dawn) {
      for (const surface of [dawn.bg, dawn.surface, dawn['surface-2']]) {
        expect(contrastRatio(dawn.text ?? '', surface ?? '')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(dawn['text-muted'] ?? '', surface ?? '')).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(dawn['accent-text'] ?? '', dawn.accent ?? '')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
