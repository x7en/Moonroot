import { getStageDefinition } from '../../core/companion/companion';
import {
  SPROUT_BUD,
  SPROUT_FLOWER_CENTER,
  SPROUT_FLOWER_PETALS,
  SPROUT_LEAF_PAIRS,
  SPROUT_POT,
  SPROUT_SEED,
  SPROUT_SOIL_PATH,
  SPROUT_STEM_PATHS,
  SPROUT_TENDRIL_PATH,
  SPROUT_VIEWBOX_SIZE,
} from '../../core/companion/sproutArt';
import type { CompanionStage, SproutMood, SproutReaction } from '../../core/model/types';

export interface SproutProps {
  stage: CompanionStage;
  mood: SproutMood;
  rings: number;
  name?: string | null;
  reaction?: SproutReaction | null;
  petalBurst?: boolean;
  stageUp?: boolean;
  reducedMotion?: boolean;
  size?: number;
}

export function Sprout({
  stage,
  mood,
  rings,
  name,
  reaction = null,
  petalBurst = false,
  stageUp = false,
  reducedMotion = false,
  size = 112,
}: SproutProps) {
  const stageDef = getStageDefinition(stage);
  const labelName = name && name.trim().length > 0 ? name.trim() : 'Sprout';

  const moodClass =
    mood === 'welcome'
      ? 'sprout-mood-welcome'
      : mood === 'bright'
        ? 'sprout-mood-bright'
        : mood === 'sleepy'
          ? 'sprout-mood-sleepy'
          : 'sprout-mood-calm';

  const motionClass = reducedMotion
    ? 'sprout-reduced-motion'
    : stageUp
      ? 'sprout-stage-up'
      : mood === 'welcome'
        ? 'sprout-unfurl'
        : mood === 'sleepy'
          ? 'sprout-sleepy-rest'
          : 'sprout-sway';

  // Leaf angle gently lifts for bright, rests gently down for sleepy (never brown or wilted)
  const leafPostureTransform =
    mood === 'bright'
      ? 'rotate(-4 60 72)'
      : mood === 'sleepy'
        ? 'translate(0 2) rotate(5 60 72)'
        : undefined;

  const staticGlowActive =
    reducedMotion &&
    ((reaction !== null && stage >= 1) || (petalBurst && stage >= 2));

  const showMotionParticles = !reducedMotion && reaction !== null && stage >= 1;
  const showPetalBurst = !reducedMotion && petalBurst && stage >= 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPROUT_VIEWBOX_SIZE} ${SPROUT_VIEWBOX_SIZE}`}
      role="img"
      aria-label={`${labelName}, ${stageDef.name} stage (${stage} of 6), ${mood} mood, ${rings} rings`}
      data-stage={stage}
      data-mood={mood}
      data-reaction={stage >= 1 ? (reaction ?? 'none') : 'none'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-petal-burst={petalBurst && stage >= 2 ? 'true' : 'false'}
      data-stage-up={stageUp ? 'true' : 'false'}
      class={`sprout-svg ${moodClass} ${motionClass}`}
    >
      {/* Ambient / moonflower / reduced-motion ring (flat vector, no gradient/blur) */}
      <g id="glow" data-static-glow={staticGlowActive ? 'true' : 'false'}>
        {(stage === 6 || staticGlowActive) && (
          <circle
            cx="60"
            cy={stage === 0 ? 74 : 46}
            r={stage === 6 ? 38 : 30}
            fill="none"
            stroke="var(--accent)"
            stroke-width="1.5"
          />
        )}
      </g>

      {/* Plain garden pot & soil mound */}
      <g id="pot">
        <rect
          x={SPROUT_POT.rim.x}
          y={SPROUT_POT.rim.y}
          width={SPROUT_POT.rim.width}
          height={SPROUT_POT.rim.height}
          rx={SPROUT_POT.rim.rx}
          fill="var(--surface)"
          stroke="var(--text)"
          stroke-width="1.75"
        />
        <path
          d={SPROUT_POT.bodyPath}
          fill="var(--surface)"
          stroke="var(--text)"
          stroke-width="1.75"
        />
      </g>

      <g id="soil">
        <path d={SPROUT_SOIL_PATH} fill="var(--text)" />
      </g>

      {/* Stage 0: Seed tucked beneath soil */}
      {stage === 0 && (
        <g id="seed">
          <ellipse
            cx={SPROUT_SEED.cx}
            cy={SPROUT_SEED.cy}
            rx={SPROUT_SEED.rx}
            ry={SPROUT_SEED.ry}
            fill="var(--leaf-1)"
          />
          <path
            d={SPROUT_SEED.shootPath}
            fill="none"
            stroke="var(--leaf-2)"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </g>
      )}

      {/* Stages 1-6: Botanical plant body (strictly no facial features) */}
      {stage >= 1 && (
        <g id="plant-body">
          <g id="stem">
            <path
              d={SPROUT_STEM_PATHS[stage as 1 | 2 | 3 | 4 | 5 | 6]}
              fill="none"
              stroke="var(--leaf-2)"
              stroke-width={stage >= 3 ? '3.5' : '3'}
              stroke-linecap="round"
            />
          </g>

          <g id="leaves" transform={leafPostureTransform}>
            {SPROUT_LEAF_PAIRS.filter((leaf) => stage >= leaf.minStage).map((leaf, idx) => {
              const leafFill =
                idx % 3 === 0 ? 'var(--leaf-1)' : idx % 3 === 1 ? 'var(--leaf-2)' : 'var(--leaf-3)';
              return <path key={idx} d={leaf.d} fill={leafFill} />;
            })}
          </g>

          {/* Tendril (stages 3-6) */}
          {stage >= 3 && (
            <g id="tendril">
              <path
                d={SPROUT_TENDRIL_PATH}
                fill="none"
                stroke="var(--leaf-3)"
                stroke-width="2"
                stroke-linecap="round"
              />
            </g>
          )}

          {/* Closed bud (stage 4) */}
          {stage === 4 && (
            <g id="bud">
              <path d={SPROUT_BUD.bulbPath} fill="var(--accent)" />
              <path
                d={SPROUT_BUD.sepalPath}
                fill="none"
                stroke="var(--leaf-3)"
                stroke-width="2"
                stroke-linecap="round"
              />
            </g>
          )}

          {/* Open flower (stage 5) and Moonflower (stage 6) */}
          {stage >= 5 && (
            <g id="flower">
              {SPROUT_FLOWER_PETALS.map((petal, idx) => {
                const fill = petal.role === 'upper' ? 'var(--text)' : 'var(--accent)';
                return (
                  <ellipse
                    key={idx}
                    cx={petal.cx}
                    cy={petal.cy}
                    rx={petal.rx}
                    ry={petal.ry}
                    transform={
                      petal.rotateDeg !== 0
                        ? `rotate(${petal.rotateDeg} ${petal.cx} ${petal.cy})`
                        : undefined
                    }
                    fill={fill}
                  />
                );
              })}
              <circle
                cx={SPROUT_FLOWER_CENTER.cx}
                cy={SPROUT_FLOWER_CENTER.cy}
                r={
                  stage === 6
                    ? String(SPROUT_FLOWER_CENTER.radiusStage6)
                    : String(SPROUT_FLOWER_CENTER.radiusStage5)
                }
                fill="var(--surface)"
                stroke="var(--text)"
                stroke-width="1.5"
              />
            </g>
          )}
        </g>
      )}

      {/* Sleepy peaceful "zzz" (never wilted or sad) */}
      {mood === 'sleepy' && (
        <g id="sleep-zzz" aria-hidden="true">
          <text
            x="80"
            y="34"
            fill="var(--text)"
            font-size="11"
            font-weight="700"
            font-family="var(--font-body)"
          >
            z z
          </text>
        </g>
      )}

      {/* Particle reactions (< 900 ms, completely skipped under reduced motion) */}
      <g id="particles" aria-hidden="true">
        {showMotionParticles && reaction === 'water' && (
          <g class="reaction-raindrops">
            <path d="M40 16 C38 20 38 23 40 24 C42 23 42 20 40 16 Z" fill="var(--accent)" />
            <path d="M60 10 C58 14 58 17 60 18 C62 17 62 14 60 10 Z" fill="var(--accent)" />
            <path d="M80 18 C78 22 78 25 80 26 C82 25 82 22 80 18 Z" fill="var(--accent)" />
          </g>
        )}

        {showMotionParticles && reaction === 'sleep' && (
          <g class="reaction-moonbeam">
            <path
              d="M28 18 A12 12 0 1 0 42 32 A9 9 0 1 1 28 18 Z"
              fill="var(--text)"
            />
            <line
              x1="44"
              y1="26"
              x2="74"
              y2="54"
              stroke="var(--text)"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </g>
        )}

        {showMotionParticles && reaction === 'meal' && (
          <g class="reaction-sunbeam">
            <circle cx="88" cy="22" r="7" fill="var(--accent)" />
            <line
              x1="78"
              y1="28"
              x2="58"
              y2="46"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </g>
        )}

        {showMotionParticles && reaction === 'other' && (
          <g class="reaction-sparkle">
            <path d="M35 28 L37 33 L42 35 L37 37 L35 42 L33 37 L28 35 L33 33 Z" fill="var(--leaf-1)" />
            <path
              d="M86 24 L87.5 28 L91.5 29.5 L87.5 31 L86 35 L84.5 31 L80.5 29.5 L84.5 28 Z"
              fill="var(--accent)"
            />
          </g>
        )}

        {showPetalBurst && (
          <g class="reaction-petal-burst">
            <ellipse cx="34" cy="36" rx="4" ry="2.2" transform="rotate(-30 34 36)" fill="var(--accent)" />
            <ellipse cx="88" cy="34" rx="4" ry="2.2" transform="rotate(30 88 34)" fill="var(--leaf-1)" />
            <ellipse cx="44" cy="18" rx="3.5" ry="2" transform="rotate(15 44 18)" fill="var(--text)" />
            <ellipse cx="78" cy="18" rx="3.5" ry="2" transform="rotate(-15 78 18)" fill="var(--accent)" />
          </g>
        )}
      </g>
    </svg>
  );
}
