import type { CompanionStage } from '../model/types';

export interface LeafPathSpec {
  readonly d: string;
  readonly opacity: number;
  readonly minStage: CompanionStage;
}

export interface FlowerPetalSpec {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly rotateDeg: number;
  readonly opacity: number;
  readonly role: 'upper' | 'lower';
}

export const SPROUT_VIEWBOX_SIZE = 120;

export const SPROUT_POT = {
  rim: { x: 33, y: 78, width: 54, height: 8, rx: 4 },
  bodyPath: 'M38 86 L82 86 L76 109 Q75 112 72 112 L48 112 Q45 112 44 109 Z',
} as const;

export const SPROUT_SOIL_PATH = 'M36 78 Q60 69 84 78 Z';

export const SPROUT_SEED = {
  cx: 60,
  cy: 74,
  rx: 7,
  ry: 5,
  shootPath: 'M60 69 Q62 63 65 62',
} as const;

export const SPROUT_STEM_PATHS: Readonly<Record<Exclude<CompanionStage, 0>, string>> = {
  1: 'M60 76 Q60 64 60 56',
  2: 'M60 76 Q58 60 60 44',
  3: 'M60 76 Q57 56 60 36',
  4: 'M60 76 Q57 56 60 36',
  5: 'M60 76 Q56 54 60 30',
  6: 'M60 76 Q56 54 60 30',
};

export const SPROUT_LEAF_PAIRS: readonly LeafPathSpec[] = [
  // Pair 1: lower leaves (stages 1-6)
  { d: 'M60 62 C50 60 44 52 46 47 C52 48 58 54 60 62 Z', opacity: 0.92, minStage: 1 },
  { d: 'M60 60 C70 58 76 50 74 45 C68 46 62 52 60 60 Z', opacity: 0.82, minStage: 1 },
  // Pair 2: mid-stem leaves (stages 2-6)
  { d: 'M59 50 C48 48 41 39 44 33 C51 35 57 41 59 50 Z', opacity: 0.88, minStage: 2 },
  { d: 'M60 48 C71 46 78 37 75 31 C68 33 62 39 60 48 Z', opacity: 0.78, minStage: 2 },
  // Pair 3: upper foliage leaves (stages 3-6)
  { d: 'M60 40 C50 37 45 29 48 24 C54 26 58 32 60 40 Z', opacity: 0.95, minStage: 3 },
  { d: 'M60 39 C70 36 75 28 72 23 C66 25 62 31 60 39 Z', opacity: 0.86, minStage: 3 },
  // Pair 4: crown leaves (stages 5-6)
  { d: 'M58 68 C47 68 41 62 43 57 C49 58 55 62 58 68 Z', opacity: 0.74, minStage: 5 },
  { d: 'M62 67 C73 67 79 61 77 56 C71 57 65 61 62 67 Z', opacity: 0.74, minStage: 5 },
];

export const SPROUT_TENDRIL_PATH =
  'M59 44 C51 42 46 49 51 54 C54 57 57 53 54 50';

export const SPROUT_BUD = {
  bulbPath: 'M60 21 C53 27 54 36 60 37 C66 36 67 27 60 21 Z',
  sepalPath: 'M55 33 Q60 38 65 33',
} as const;

export const SPROUT_FLOWER_PETALS: readonly FlowerPetalSpec[] = [
  { cx: 60, cy: 20, rx: 5, ry: 8, rotateDeg: 0, opacity: 0.92, role: 'upper' },
  { cx: 51, cy: 25, rx: 7, ry: 4.5, rotateDeg: -24, opacity: 0.88, role: 'upper' },
  { cx: 69, cy: 25, rx: 7, ry: 4.5, rotateDeg: 24, opacity: 0.88, role: 'upper' },
  { cx: 53, cy: 33, rx: 6, ry: 4, rotateDeg: 20, opacity: 0.82, role: 'lower' },
  { cx: 67, cy: 33, rx: 6, ry: 4, rotateDeg: -20, opacity: 0.82, role: 'lower' },
];

export const SPROUT_FLOWER_CENTER = {
  cx: 60,
  cy: 27,
  radiusStage5: 4.5,
  radiusStage6: 5.5,
} as const;

// Plain botanical leaf used for discreet widget & discreet launcher art
export const DISCREET_LEAF_ART = {
  bladePath: 'M60 24 C86 30 92 64 60 94 C28 64 34 30 60 24 Z',
  veinPath: 'M60 34 L60 96 M60 56 L72 46 M60 70 L47 59',
} as const;

export function circlePathData(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

export function ellipsePathData(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotateDeg = 0,
): string {
  if (rotateDeg === 0) {
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
  }
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const p1x = Number((cx - rx * cos).toFixed(2));
  const p1y = Number((cy - rx * sin).toFixed(2));
  const p2x = Number((cx + rx * cos).toFixed(2));
  const p2y = Number((cy + rx * sin).toFixed(2));
  return `M ${p1x} ${p1y} A ${rx} ${ry} ${rotateDeg} 1 0 ${p2x} ${p2y} A ${rx} ${ry} ${rotateDeg} 1 0 ${p1x} ${p1y} Z`;
}

export function roundedRectPathData(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const right = x + w;
  const bottom = y + h;
  return (
    `M ${x + r} ${y} ` +
    `L ${right - r} ${y} A ${r} ${r} 0 0 1 ${right} ${y + r} ` +
    `L ${right} ${bottom - r} A ${r} ${r} 0 0 1 ${right - r} ${bottom} ` +
    `L ${x + r} ${bottom} A ${r} ${r} 0 0 1 ${x} ${bottom - r} ` +
    `L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
  );
}

export interface VectorPathSpec {
  readonly pathData: string;
  readonly fillColor?: string;
  readonly fillAlpha?: number;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeAlpha?: number;
  readonly strokeLineCap?: 'round';
}

const PALETTE = {
  surface2: '#232B40',
  text: '#EAEFF8',
  accent: '#7ACBA5',
  lamp: '#F2B96B',
  gut: '#C49A6C',
} as const;

export function buildStageVectorPaths(stage: CompanionStage): readonly VectorPathSpec[] {
  const paths: VectorPathSpec[] = [];

  // Ambient glow
  paths.push({
    pathData: circlePathData(60, stage === 0 ? 78 : 54, stage === 6 ? 44 : 34),
    fillColor: stage === 6 ? PALETTE.lamp : PALETTE.accent,
    fillAlpha: stage === 6 ? 0.34 : 0.2,
  });
  if (stage === 6) {
    paths.push({
      pathData: circlePathData(60, 42, 26),
      strokeColor: PALETTE.lamp,
      strokeWidth: 1.5,
      strokeAlpha: 0.45,
    });
  }

  // Pot & soil
  paths.push({
    pathData: roundedRectPathData(
      SPROUT_POT.rim.x,
      SPROUT_POT.rim.y,
      SPROUT_POT.rim.width,
      SPROUT_POT.rim.height,
      SPROUT_POT.rim.rx,
    ),
    fillColor: PALETTE.surface2,
    strokeColor: PALETTE.gut,
    strokeWidth: 1.75,
  });
  paths.push({
    pathData: SPROUT_POT.bodyPath,
    fillColor: PALETTE.surface2,
    strokeColor: PALETTE.gut,
    strokeWidth: 1.75,
  });
  paths.push({
    pathData: SPROUT_SOIL_PATH,
    fillColor: PALETTE.gut,
    fillAlpha: 0.88,
  });

  if (stage === 0) {
    paths.push({
      pathData: ellipsePathData(SPROUT_SEED.cx, SPROUT_SEED.cy, SPROUT_SEED.rx, SPROUT_SEED.ry),
      fillColor: PALETTE.lamp,
      fillAlpha: 0.92,
    });
    paths.push({
      pathData: SPROUT_SEED.shootPath,
      strokeColor: PALETTE.accent,
      strokeWidth: 2,
      strokeLineCap: 'round',
    });
    return paths;
  }

  // Stem
  paths.push({
    pathData: SPROUT_STEM_PATHS[stage],
    strokeColor: PALETTE.accent,
    strokeWidth: stage >= 3 ? 3.5 : 3,
    strokeLineCap: 'round',
  });

  // Leaves
  for (const leaf of SPROUT_LEAF_PAIRS) {
    if (stage >= leaf.minStage) {
      paths.push({
        pathData: leaf.d,
        fillColor: PALETTE.accent,
        fillAlpha: leaf.opacity,
      });
    }
  }

  // Tendril
  if (stage >= 3) {
    paths.push({
      pathData: SPROUT_TENDRIL_PATH,
      strokeColor: PALETTE.accent,
      strokeWidth: 2,
      strokeAlpha: 0.88,
      strokeLineCap: 'round',
    });
  }

  // Bud (stage 4)
  if (stage === 4) {
    paths.push({
      pathData: SPROUT_BUD.bulbPath,
      fillColor: PALETTE.lamp,
      fillAlpha: 0.95,
    });
    paths.push({
      pathData: SPROUT_BUD.sepalPath,
      strokeColor: PALETTE.accent,
      strokeWidth: 2,
      strokeLineCap: 'round',
    });
  }

  // Flower (stages 5-6)
  if (stage >= 5) {
    for (const petal of SPROUT_FLOWER_PETALS) {
      const fill =
        stage === 6
          ? petal.role === 'upper'
            ? PALETTE.text
            : PALETTE.accent
          : PALETTE.lamp;
      paths.push({
        pathData: ellipsePathData(petal.cx, petal.cy, petal.rx, petal.ry, petal.rotateDeg),
        fillColor: fill,
        fillAlpha: petal.opacity,
      });
    }
    paths.push({
      pathData: circlePathData(
        SPROUT_FLOWER_CENTER.cx,
        SPROUT_FLOWER_CENTER.cy,
        stage === 6 ? SPROUT_FLOWER_CENTER.radiusStage6 : SPROUT_FLOWER_CENTER.radiusStage5,
      ),
      fillColor: PALETTE.lamp,
    });
  }

  return paths;
}
