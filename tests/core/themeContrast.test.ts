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
  const rootVars = rootMatch?.[1] ? parseCssVars(rootMatch[1]) : {};
  themes.root = rootVars;
  const attrMatches = css.matchAll(/\[data-theme=['"]([a-z0-9-]+)['"]\]\s*\{([^}]+)\}/gi);
  for (const m of attrMatches) {
    const name = m[1];
    const body = m[2];
    if (name && body) {
      themes[name] = { ...rootVars, ...parseCssVars(body) };
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

    // Default root & Dawn use Butter palette; Midnight uses #000000 AMOLED background
    expect(themes.root?.bg?.toLowerCase()).toBe('#f9f6bd');
    expect(themes.dawn?.bg?.toLowerCase()).toBe('#f9f6bd');
    expect(themes.dusk?.bg?.toLowerCase()).toBe('#3a011f');
    expect(themes.midnight?.bg?.toLowerCase()).toBe('#000000');

    // Every theme must pass >= 4.5:1 on text/bars/buttons and >= 3.0:1 on data/verdict icon badges
    for (const themeName of ['dusk', 'dawn', 'high-contrast', 'meadow', 'ocean', 'rose', 'midnight']) {
      const t = themes[themeName];
      expect(t).toBeDefined();
      if (!t) continue;

      const surfaces = [t.bg, t.surface, t['surface-2']].filter((s): s is string => Boolean(s));
      for (const surface of surfaces) {
        expect(contrastRatio(t.text ?? '', surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t['text-muted'] ?? '', surface)).toBeGreaterThanOrEqual(4.5);
      }

      expect(contrastRatio(t['accent-text'] ?? '', t.accent ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['on-accent'] ?? '', t.accent ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['bar-text'] ?? '', t.bar ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['bar-active'] ?? '', t.bar ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['lamp-text'] ?? '', t.lamp ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['data-1'] ?? '', t.bg ?? '')).toBeGreaterThanOrEqual(3.0);
      expect(contrastRatio(t['data-2'] ?? '', t.bg ?? '')).toBeGreaterThanOrEqual(3.0);

      for (const lvl of ['green', 'yellow', 'orange', 'red'] as const) {
        expect(
          contrastRatio(t[`level-${lvl}-fg`] ?? '', t[`level-${lvl}`] ?? ''),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    for (const themeName of ['dusk', 'high-contrast', 'meadow', 'ocean', 'rose', 'midnight']) {
      const t = themes[themeName];
      if (!t) continue;
      for (const surface of [t.bg, t.surface, t['surface-2']].filter((s): s is string => Boolean(s))) {
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
    }
  });
});
