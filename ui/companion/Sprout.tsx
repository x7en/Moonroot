import type { CompanionStage, SproutMood, SproutReaction } from '../../core/model/types';
import { getStageDefinition } from '../../core/companion/companion';

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

  const glowOpacity =
    reducedMotion && (reaction !== null || petalBurst)
      ? 0.52
      : mood === 'bright' || mood === 'welcome' || stage === 6
        ? 0.34
        : 0.14;

  const showMotionParticles = !reducedMotion && reaction !== null;
  const showPetalBurst = !reducedMotion && petalBurst && stage >= 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${labelName}, ${stageDef.name} stage (${stage} of 6), ${mood} mood, ${rings} rings`}
      data-stage={stage}
      data-mood={mood}
      data-reaction={reaction ?? 'none'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-petal-burst={petalBurst ? 'true' : 'false'}
      data-stage-up={stageUp ? 'true' : 'false'}
      class={`sprout-svg ${moodClass} ${motionClass}`}
    >
      {/* Ambient / moonflower / reduced-motion static glow */}
      <g id="glow" data-static-glow={reducedMotion && (reaction !== null || petalBurst) ? 'true' : 'false'}>
        <circle
          cx="60"
          cy={stage === 0 ? 78 : 54}
          r={stage === 6 ? 44 : 34}
          fill={stage === 6 ? 'var(--lamp)' : 'var(--accent)'}
          opacity={glowOpacity}
        />
        {stage === 6 && (
          <circle
            cx="60"
            cy="42"
            r="26"
            fill="none"
            stroke="var(--lamp)"
            strokeWidth="1.5"
            opacity={0.45}
          />
        )}
      </g>

      {/* Terracotta-slate garden pot & soil mound */}
      <g id="pot">
        <rect
          x="33"
          y="78"
          width="54"
          height="8"
          rx="4"
          fill="var(--surface-2)"
          stroke="var(--gut)"
          strokeWidth="1.75"
        />
        <path
          d="M38 86 L82 86 L76 109 Q75 112 72 112 L48 112 Q45 112 44 109 Z"
          fill="var(--surface-2)"
          stroke="var(--gut)"
          strokeWidth="1.75"
        />
      </g>

      <g id="soil">
        <path
          d="M36 78 Q60 69 84 78 Z"
          fill="var(--gut)"
          opacity="0.88"
        />
      </g>

      {/* Stage 0: Seed tucked warmly beneath soil */}
      {stage === 0 && (
        <g id="seed">
          <ellipse
            cx="60"
            cy="74"
            rx="7"
            ry="5"
            fill="var(--lamp)"
            opacity="0.92"
          />
          <path
            d="M60 69 Q62 63 65 62"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Stages 1-6: Botanical plant body (strictly no facial features) */}
      {stage >= 1 && (
        <g id="plant-body">
          <g id="stem">
            <path
              d={
                stage === 1
                  ? 'M60 76 Q60 64 60 56'
                  : stage === 2
                    ? 'M60 76 Q58 60 60 44'
                    : stage <= 4
                      ? 'M60 76 Q57 56 60 36'
                      : 'M60 76 Q56 54 60 30'
              }
              fill="none"
              stroke="var(--accent)"
              strokeWidth={stage >= 3 ? '3.5' : '3'}
              strokeLinecap="round"
            />
          </g>

          <g id="leaves" transform={leafPostureTransform}>
            {/* Pair 1: lower leaves (stages 1-6) */}
            <path
              d="M60 62 C50 60 44 52 46 47 C52 48 58 54 60 62 Z"
              fill="var(--accent)"
              opacity="0.92"
            />
            <path
              d="M60 60 C70 58 76 50 74 45 C68 46 62 52 60 60 Z"
              fill="var(--accent)"
              opacity="0.82"
            />

            {/* Pair 2: mid-stem leaves (stages 2-6) */}
            {stage >= 2 && (
              <>
                <path
                  d="M59 50 C48 48 41 39 44 33 C51 35 57 41 59 50 Z"
                  fill="var(--accent)"
                  opacity="0.88"
                />
                <path
                  d="M60 48 C71 46 78 37 75 31 C68 33 62 39 60 48 Z"
                  fill="var(--accent)"
                  opacity="0.78"
                />
              </>
            )}

            {/* Pair 3: upper foliage leaves (stages 3-6) */}
            {stage >= 3 && (
              <>
                <path
                  d="M60 40 C50 37 45 29 48 24 C54 26 58 32 60 40 Z"
                  fill="var(--accent)"
                  opacity="0.95"
                />
                <path
                  d="M60 39 C70 36 75 28 72 23 C66 25 62 31 60 39 Z"
                  fill="var(--accent)"
                  opacity="0.86"
                />
              </>
            )}

            {/* Pair 4: crown leaves (stages 5-6) */}
            {stage >= 5 && (
              <>
                <path
                  d="M58 68 C47 68 41 62 43 57 C49 58 55 62 58 68 Z"
                  fill="var(--accent)"
                  opacity="0.74"
                />
                <path
                  d="M62 67 C73 67 79 61 77 56 C71 57 65 61 62 67 Z"
                  fill="var(--accent)"
                  opacity="0.74"
                />
              </>
            )}
          </g>

          {/* Tendril (stages 3-6) */}
          {stage >= 3 && (
            <g id="tendril">
              <path
                d="M59 44 C51 42 46 49 51 54 C54 57 57 53 54 50"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.88"
              />
            </g>
          )}

          {/* Closed bud (stage 4) */}
          {stage === 4 && (
            <g id="bud">
              <path
                d="M60 21 C53 27 54 36 60 37 C66 36 67 27 60 21 Z"
                fill="var(--lamp)"
                opacity="0.95"
              />
              <path
                d="M55 33 Q60 38 65 33"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Open flower (stage 5) and luminous Moonflower (stage 6) */}
          {stage >= 5 && (
            <g id="flower">
              <ellipse
                cx="60"
                cy="20"
                rx="5"
                ry="8"
                fill={stage === 6 ? 'var(--text)' : 'var(--lamp)'}
                opacity="0.92"
              />
              <ellipse
                cx="51"
                cy="25"
                rx="7"
                ry="4.5"
                transform="rotate(-24 51 25)"
                fill={stage === 6 ? 'var(--text)' : 'var(--lamp)'}
                opacity="0.88"
              />
              <ellipse
                cx="69"
                cy="25"
                rx="7"
                ry="4.5"
                transform="rotate(24 69 25)"
                fill={stage === 6 ? 'var(--text)' : 'var(--lamp)'}
                opacity="0.88"
              />
              <ellipse
                cx="53"
                cy="33"
                rx="6"
                ry="4"
                transform="rotate(20 53 33)"
                fill={stage === 6 ? 'var(--accent)' : 'var(--lamp)'}
                opacity="0.82"
              />
              <ellipse
                cx="67"
                cy="33"
                rx="6"
                ry="4"
                transform="rotate(-20 67 33)"
                fill={stage === 6 ? 'var(--accent)' : 'var(--lamp)'}
                opacity="0.82"
              />
              <circle cx="60" cy="27" r={stage === 6 ? '5.5' : '4.5'} fill="var(--lamp)" />
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
            fill="var(--text-muted)"
            fontSize="11"
            fontWeight="700"
            fontFamily="var(--font-body)"
          >
            z z
          </text>
        </g>
      )}

      {/* Particle reactions (< 900 ms, completely skipped under reduced motion) */}
      <g id="particles" aria-hidden="true">
        {showMotionParticles && reaction === 'water' && (
          <g class="reaction-raindrops">
            <path d="M40 16 C38 20 38 23 40 24 C42 23 42 20 40 16 Z" fill="var(--water)" />
            <path d="M60 10 C58 14 58 17 60 18 C62 17 62 14 60 10 Z" fill="var(--water)" />
            <path d="M80 18 C78 22 78 25 80 26 C82 25 82 22 80 18 Z" fill="var(--water)" />
          </g>
        )}

        {showMotionParticles && reaction === 'sleep' && (
          <g class="reaction-moonbeam">
            <path
              d="M28 18 A12 12 0 1 0 42 32 A9 9 0 1 1 28 18 Z"
              fill="var(--sleep)"
              opacity="0.9"
            />
            <line
              x1="44"
              y1="26"
              x2="74"
              y2="54"
              stroke="var(--sleep)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.65"
            />
          </g>
        )}

        {showMotionParticles && reaction === 'meal' && (
          <g class="reaction-sunbeam">
            <circle cx="88" cy="22" r="7" fill="var(--lamp)" opacity="0.92" />
            <line
              x1="78"
              y1="28"
              x2="58"
              y2="46"
              stroke="var(--lamp)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.7"
            />
          </g>
        )}

        {showMotionParticles && reaction === 'other' && (
          <g class="reaction-sparkle">
            <path d="M35 28 L37 33 L42 35 L37 37 L35 42 L33 37 L28 35 L33 33 Z" fill="var(--lamp)" />
            <path d="M86 24 L87.5 28 L91.5 29.5 L87.5 31 L86 35 L84.5 31 L80.5 29.5 L84.5 28 Z" fill="var(--accent)" />
          </g>
        )}

        {showPetalBurst && (
          <g class="reaction-petal-burst">
            <ellipse cx="34" cy="36" rx="4" ry="2.2" transform="rotate(-30 34 36)" fill="var(--lamp)" />
            <ellipse cx="88" cy="34" rx="4" ry="2.2" transform="rotate(30 88 34)" fill="var(--accent)" />
            <ellipse cx="44" cy="18" rx="3.5" ry="2" transform="rotate(15 44 18)" fill="var(--spotting)" />
            <ellipse cx="78" cy="18" rx="3.5" ry="2" transform="rotate(-15 78 18)" fill="var(--lamp)" />
          </g>
        )}
      </g>
    </svg>
  );
}
