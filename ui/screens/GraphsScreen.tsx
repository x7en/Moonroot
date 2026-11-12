import { computeStep3Snapshot } from '../../app/store';
import {
  buildConfidenceArcGeometry,
  buildCycleBars,
  buildForecastRibbon,
  buildMedicineWeeklySeries,
} from '../../core/graphs/graphs';
import { analyzeLifestylePatterns } from '../../core/insights/lifestyle';
import { addDays, yearsSinceMenarche } from '../../core/model/dates';
import type {
  BackupMeta,
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  Forecast,
  MedicineEntry,
  Profile,
  Stamp,
  Verdict,
  WatchItem,
} from '../../core/model/types';

interface GraphsScreenProps {
  today: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLogs: readonly DayLog[];
  bodyLogs: readonly BodyLog[];
  decisions: readonly Decision[];
  forecasts: readonly Forecast[];
  medicines: readonly MedicineEntry[];
  verdicts: readonly Verdict[];
  watchItems: readonly WatchItem[];
  visits: readonly DoctorVisit[];
  meta: BackupMeta;
  returnLabel: string;
  onBack: () => void;
}

const SERIES_COLORS = ['var(--data-1)', 'var(--data-2)', 'var(--accent)', 'var(--text)'] as const;

export function GraphsScreen({
  today,
  nowIso,
  profile,
  dayLogs,
  bodyLogs,
  decisions,
  forecasts,
  medicines,
  verdicts,
  watchItems,
  visits,
  meta,
  returnLabel,
  onBack,
}: GraphsScreenProps) {
  const step3 = computeStep3Snapshot(
    {
      profile,
      dayLogs: [...dayLogs],
      bodyLogs: [...bodyLogs],
      decisions: [...decisions],
      forecasts: [...forecasts],
      verdicts: [...verdicts],
      watchItems: [...watchItems],
      visits: [...visits],
      medicines: [...medicines],
      companion: {
        rings: 0,
        stage: 0,
        unlocked: ['dusk', 'dawn', 'high-contrast'],
        badges: [],
        lastRingDate: null,
      },
      meta,
    },
    today,
    today,
    nowIso,
  );

  const { prediction, cycles } = step3;
  const arc = buildConfidenceArcGeometry(prediction.confidence.score, 120, 92, 68);
  const yearsSince = yearsSinceMenarche(profile, today);
  const ageUpper = yearsSince !== null && yearsSince < 3 ? 45 : 38;
  const cycleBars = buildCycleBars(cycles.cycles, ageUpper);
  const ribbon = buildForecastRibbon({
    today,
    dayLogs,
    likely: prediction.likely,
    possible: prediction.possible,
  });
  const medicineWeekly = buildMedicineWeeklySeries(medicines, today);
  const lifestyle = analyzeLifestylePatterns({ today, dayLogs, bodyLogs });

  // 14-day timeline points (past 13 days through today)
  const dayByDate = new Map(dayLogs.map((l) => [l.date, l]));
  const timelineDays = Array.from({ length: 14 }, (_, idx) => {
    const date = addDays(today, idx - 13);
    return { date, log: dayByDate.get(date) ?? null };
  });
  const hasAnyRecentTimeline = timelineDays.some((d) => d.log !== null);

  return (
    <div>
      <section aria-label="Graphs header" style={{ marginBottom: '14px' }}>
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 class="screen-title" style={{ marginBottom: '4px' }}>
              Graphs
            </h1>
            <p class="muted" style={{ margin: 0 }}>
              Visuals from your saved entries only. Open anytime from Cycle, Body, or Record.
            </p>
          </div>
          <button type="button" class="btn btn-small" onClick={onBack}>
            Back to {returnLabel}
          </button>
        </div>
      </section>

      {/* 1. Confidence arc (10 to 95) */}
      <section class="chart-section" aria-label="Confidence arc graph">
        <h2 class="card-title">Confidence arc</h2>
        <svg
          class="graph-svg"
          viewBox="0 0 240 156"
          role="img"
          aria-label={`Confidence arc at ${prediction.confidence.score} percent on a scale from 10 to 95`}
        >
          <path
            d={`M ${arc.trackStart.x} ${arc.trackStart.y} A 68 68 0 1 1 ${arc.trackEnd.x} ${arc.trackEnd.y}`}
            fill="none"
            stroke="var(--surface)"
            stroke-width="14"
            stroke-linecap="round"
          />
          {arc.sweepAngleDeg > 0 && (
            <path
              d={`M ${arc.trackStart.x} ${arc.trackStart.y} A 68 68 0 ${arc.largeArcFill} 1 ${arc.fillEnd.x} ${arc.fillEnd.y}`}
              fill="none"
              stroke="var(--data-1)"
              stroke-width="14"
              stroke-linecap="round"
            />
          )}
          <circle cx={arc.fillEnd.x} cy={arc.fillEnd.y} r="7" fill="var(--data-2)" />
          <text
            x="120"
            y="90"
            text-anchor="middle"
            fill="var(--data-1)"
            font-size="28"
            font-weight="700"
            font-family="var(--font-body)"
          >
            {prediction.confidence.score}%
          </text>
          <text
            x="61"
            y="148"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="12"
            font-weight="700"
          >
            10
          </text>
          <text
            x="179"
            y="148"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="12"
            font-weight="700"
          >
            95
          </text>
        </svg>
        <p class="muted" style={{ margin: '4px 0 0 0' }}>
          {prediction.confidence.effectiveCycles === 0
            ? 'Starts at 10% until periods are logged.'
            : `${prediction.confidence.effectiveCycles} effective cycles · ${prediction.confidence.hitCount} of ${prediction.confidence.resolvedCount} checked windows matched.`}
        </p>
      </section>

      {/* 2. Forecast ribbon */}
      <section class="chart-section" aria-label="Forecast ribbon graph">
        <h2 class="card-title">30-day forecast ribbon</h2>
        {!prediction.anchor ? (
          <p class="muted" style={{ margin: 0 }}>
            Log your first period start to draw likely and possible forecast bands on this strip.
          </p>
        ) : (
          <>
            <svg
              class="graph-svg"
              viewBox="0 0 320 92"
              role="img"
              aria-label={`30-day forecast ribbon around ${today}`}
            >
              {ribbon.map((pt) => {
                const x = 10 + pt.index * 10;
                return (
                  <g key={pt.date}>
                    {pt.inPossible && (
                      <rect
                        x={x}
                        y="26"
                        width="9"
                        height="30"
                        rx="2"
                        fill="var(--surface)"
                      />
                    )}
                    {pt.inLikely && (
                      <rect
                        x={x}
                        y="22"
                        width="9"
                        height="38"
                        rx="2"
                        fill="var(--data-1)"
                      />
                    )}
                    {pt.dotRadius > 0 && (
                      <circle
                        cx={x + 4.5}
                        cy="41"
                        r={pt.dotRadius}
                        fill="var(--data-2)"
                      />
                    )}
                    {pt.isToday && (
                      <line
                        x1={x + 4.5}
                        y1="14"
                        x2={x + 4.5}
                        y2="68"
                        stroke="var(--text)"
                        stroke-width="2.5"
                      />
                    )}
                  </g>
                );
              })}
              <text x="10" y="84" fill="var(--text-muted)" font-size="12">
                {addDays(today, -14).slice(5)}
              </text>
              <text x="154" y="13" text-anchor="middle" fill="var(--text)" font-size="12" font-weight="700">
                Today
              </text>
              <text x="310" y="84" text-anchor="end" fill="var(--text-muted)" font-size="12">
                {addDays(today, 15).slice(5)}
              </text>
            </svg>
            <div class="graph-legend">
              <span class="graph-legend-item">
                <span class="graph-swatch" style={{ backgroundColor: 'var(--data-1)' }} />
                Likely band
              </span>
              <span class="graph-legend-item">
                <span class="graph-swatch" style={{ backgroundColor: 'var(--surface)' }} />
                Possible band
              </span>
              <span class="graph-legend-item">
                <span class="graph-swatch" style={{ backgroundColor: 'var(--data-2)', borderRadius: '999px' }} />
                Logged flow
              </span>
            </div>
          </>
        )}
      </section>

      {/* 3. Cycle length bars */}
      <section class="chart-section" aria-label="Cycle bars graph">
        <h2 class="card-title">Cycle length bars</h2>
        {cycleBars.bars.length === 0 ? (
          <p class="muted" style={{ margin: 0 }}>
            Log two period starts to draw cycle bars, your median line, and typical range.
          </p>
        ) : (
          <>
            <svg
              class="graph-svg"
              viewBox="0 0 320 160"
              role="img"
              aria-label={`Cycle length bars across ${cycleBars.bars.length} cycles, median ${cycleBars.medianDays ?? 0} days`}
            >
              {/* Age band */}
              {(() => {
                const topY = 16 + (1 - cycleBars.ageBandHigh / cycleBars.maxScaleDays) * 108;
                const botY = 16 + (1 - cycleBars.ageBandLow / cycleBars.maxScaleDays) * 108;
                return (
                  <rect
                    x="28"
                    y={topY}
                    width="282"
                    height={Math.max(4, botY - topY)}
                    fill="var(--surface)"
                  />
                );
              })()}
              {/* Median line */}
              {cycleBars.medianDays !== null && (
                <line
                  x1="28"
                  y1={16 + (1 - cycleBars.medianDays / cycleBars.maxScaleDays) * 108}
                  x2="310"
                  y2={16 + (1 - cycleBars.medianDays / cycleBars.maxScaleDays) * 108}
                  stroke="var(--data-2)"
                  stroke-width="2"
                  stroke-dasharray="4 4"
                />
              )}
              <text x="4" y="24" fill="var(--text-muted)" font-size="12">
                {cycleBars.maxScaleDays}d
              </text>
              <text x="4" y="124" fill="var(--text-muted)" font-size="12">
                0d
              </text>
              {cycleBars.bars.map((bar, idx) => {
                const slotW = 276 / cycleBars.bars.length;
                const barW = Math.min(26, Math.max(10, slotW * 0.62));
                const x = 32 + idx * slotW + (slotW - barW) / 2;
                const h = Math.max(6, bar.heightRatio * 108);
                const y = 124 - h;
                return (
                  <g key={bar.id}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      rx="4"
                      fill={bar.approximate ? 'var(--data-2)' : 'var(--data-1)'}
                    />
                    <text
                      x={x + barW / 2}
                      y={Math.max(12, y - 3)}
                      text-anchor="middle"
                      fill="var(--text)"
                      font-size="12"
                    >
                      {bar.lengthDays}
                    </text>
                  </g>
                );
              })}
              <text x="170" y="150" text-anchor="middle" fill="var(--text-muted)" font-size="12">
                Most recent {cycleBars.bars.length} cycles (days)
              </text>
            </svg>
            <div class="graph-legend">
              <span class="graph-legend-item">
                <span class="graph-swatch" style={{ backgroundColor: 'var(--data-2)' }} />
                Median ({cycleBars.medianDays}d)
              </span>
              <span class="graph-legend-item">
                <span class="graph-swatch" style={{ backgroundColor: 'var(--surface)' }} />
                Typical range (21–{cycleBars.ageBandHigh}d)
              </span>
            </div>
          </>
        )}
      </section>

      {/* 4. Timeline visual (last 14 days) */}
      <section class="chart-section" aria-label="Timeline visual graph">
        <h2 class="card-title">14-day flow and pain visual</h2>
        {!hasAnyRecentTimeline ? (
          <p class="muted" style={{ margin: 0 }}>
            Log check-ins on Today to see flow dots and pain bars over the last 14 days.
          </p>
        ) : (
          <svg
            class="graph-svg"
            viewBox="0 0 320 116"
            role="img"
            aria-label="14-day timeline of logged flow dots and pain heights from 0 to 10"
          >
            {timelineDays.map((item, idx) => {
              const x = 16 + idx * 21;
              const pain = item.log?.pain?.level ?? 0;
              const barH = (pain / 10) * 52;
              const flow = item.log?.flow ?? null;
              const dotR =
                flow === 'heavy'
                  ? 7
                  : flow === 'medium'
                    ? 5.5
                    : flow === 'light'
                      ? 4
                      : flow === 'spotting'
                        ? 2.8
                        : 0;
              return (
                <g key={item.date}>
                  <rect x={x} y="24" width="12" height="52" rx="3" fill="var(--surface)" />
                  {pain > 0 && (
                    <rect
                      x={x}
                      y={76 - barH}
                      width="12"
                      height={barH}
                      rx="3"
                      fill="var(--data-1)"
                    />
                  )}
                  {dotR > 0 && (
                    <circle
                      cx={x + 6}
                      cy="14"
                      r={dotR}
                      fill="var(--data-2)"
                    />
                  )}
                </g>
              );
            })}
            <text x="16" y="100" fill="var(--text-muted)" font-size="12">
              {addDays(today, -13).slice(5)}
            </text>
            <text x="155" y="100" text-anchor="middle" fill="var(--text-muted)" font-size="12">
              Flow &amp; pain 0–10
            </text>
            <text x="304" y="100" text-anchor="end" fill="var(--text-muted)" font-size="12">
              Today
            </text>
          </svg>
        )}
      </section>

      {/* 5. Medicine by week bars */}
      <section class="chart-section" aria-label="Medicine by week graph">
        <h2 class="card-title">Medicine entries by week</h2>
        {medicineWeekly.series.length === 0 ? (
          <p class="muted" style={{ margin: 0 }}>
            No medicine doses logged in the last 4 weeks. Entries added on Today appear by generic
            name here.
          </p>
        ) : (
          <>
            <svg
              class="graph-svg"
              viewBox="0 0 320 144"
              role="img"
              aria-label={`Weekly medicine dose counts by generic name across 4 weeks`}
            >
              {medicineWeekly.weeks.map((wk, wIdx) => {
                const groupX = 24 + wIdx * 72;
                const seriesCount = Math.min(4, medicineWeekly.series.length);
                const subW = Math.min(20, 48 / Math.max(1, seriesCount));
                return (
                  <g key={wk.label}>
                    {medicineWeekly.series.slice(0, 4).map((ser, sIdx) => {
                      const count = ser.counts[wIdx] ?? 0;
                      const h = (count / medicineWeekly.maxCount) * 86;
                      const x = groupX + sIdx * (subW + 2);
                      const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
                      return (
                        <g key={ser.key}>
                          <rect
                            x={x}
                            y={104 - h}
                            width={subW}
                            height={Math.max(count > 0 ? 4 : 0, h)}
                            rx="3"
                            fill={color}
                          />
                          {count > 0 && (
                            <text
                              x={x + subW / 2}
                              y={Math.max(12, 100 - h)}
                              text-anchor="middle"
                              fill="var(--text)"
                              font-size="12"
                            >
                              {count}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    <text
                      x={groupX + 20}
                      y="128"
                      text-anchor="middle"
                      fill="var(--text-muted)"
                      font-size="12"
                    >
                      {wk.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div class="graph-legend">
              {medicineWeekly.series.slice(0, 4).map((ser, sIdx) => (
                <span key={ser.key} class="graph-legend-item">
                  <span
                    class="graph-swatch"
                    style={{ backgroundColor: SERIES_COLORS[sIdx % SERIES_COLORS.length] }}
                  />
                  {ser.genericName}
                </span>
              ))}
            </div>
            <p class="muted" style={{ margin: '6px 0 0 0' }}>
              Counts entries you saved. Check the pack for the daily limit.
            </p>
          </>
        )}
      </section>

      {/* 6. Lifestyle patterns visual (only if already unlocked) */}
      {lifestyle.patterns.length > 0 ? (
        <section class="chart-section" aria-label="Lifestyle pattern visuals">
          <h2 class="card-title">Unlocked lifestyle patterns</h2>
          {lifestyle.patterns.map((p) => {
            const totalDays = Math.max(1, p.groupACount + p.groupBCount);
            const widthA = Math.round((p.groupACount / totalDays) * 168);
            const widthB = Math.round((p.groupBCount / totalDays) * 168);
            return (
              <div key={p.id} class="row-stack" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <p style={{ margin: '0 0 6px 0', fontWeight: 700 }}>{p.statement}</p>
                <svg
                  class="graph-svg"
                  viewBox="0 0 300 66"
                  role="img"
                  aria-label={`${p.statement}. Comparison across ${p.groupACount} pattern days and ${p.groupBCount} other days, shift ${p.diffPoints}.`}
                >
                  <text x="2" y="20" fill="var(--text)" font-size="12">
                    Focus group ({p.groupACount}d)
                  </text>
                  <rect x="128" y="8" width={Math.max(8, widthA)} height="16" rx="4" fill="var(--data-1)" />
                  <text x="2" y="48" fill="var(--text-muted)" font-size="12">
                    Other days ({p.groupBCount}d)
                  </text>
                  <rect x="128" y="36" width={Math.max(8, widthB)} height="16" rx="4" fill="var(--data-2)" />
                </svg>
                <p class="muted" style={{ margin: '2px 0 0 0' }}>
                  Effect d = {p.effectD} · Diff {p.diffPoints} · This is a pattern, not proof of cause.
                </p>
              </div>
            );
          })}
        </section>
      ) : (
        <section class="chart-section" aria-label="Lifestyle patterns unlock status">
          <h2 class="card-title">Lifestyle patterns</h2>
          <p class="muted" style={{ margin: 0 }}>
            Unlocks after 14 flow-free Body days with a qualifying shift (currently{' '}
            <strong class="tabular">{lifestyle.nonBleedingDaysCount}</strong> flow-free days). No
            chart is drawn until a pattern unlocks.
          </p>
        </section>
      )}
    </div>
  );
}
