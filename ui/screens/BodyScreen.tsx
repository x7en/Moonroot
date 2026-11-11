import { useEffect, useRef, useState } from 'preact/hooks';
import { analyzeLifestylePatterns } from '../../core/insights/lifestyle';
import type { BodyLog, DateKey, DayLog, Profile, Stamp } from '../../core/model/types';

interface BodyScreenProps {
  today: DateKey;
  selectedDate: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLogs: readonly DayLog[];
  bodyLogs: readonly BodyLog[];
  onChangeDate: (date: DateKey) => void;
  onSaveBodyLog: (log: BodyLog) => Promise<void>;
  onSaveStress: (date: DateKey, stress: 1 | 2 | 3 | 4 | 5 | undefined) => Promise<void>;
}

const ML_PER_GLASS = 250;

const MEAL_TAGS = [
  { key: 'balanced', label: 'Balanced' },
  { key: 'sugary', label: 'Sugary' },
  { key: 'caffeine', label: 'Caffeine' },
  { key: 'late-night', label: 'Late-night' },
] as const;

const BRISTOL_TYPES = [
  { val: 1, hint: '1 · hard lumps' },
  { val: 2, hint: '2 · lumpy' },
  { val: 3, hint: '3 · cracked' },
  { val: 4, hint: '4 · smooth' },
  { val: 5, hint: '5 · soft blobs' },
  { val: 6, hint: '6 · mushy' },
  { val: 7, hint: '7 · watery' },
] as const;

function makeBlankBodyLog(date: DateKey, nowIso: Stamp): BodyLog {
  return {
    date,
    updatedAt: nowIso,
  };
}

function formatWaterDisplay(ml: number | undefined, unit: 'ml' | 'glasses'): string {
  if (ml === undefined) return '';
  if (unit === 'glasses') {
    return String(Number((ml / ML_PER_GLASS).toFixed(1)));
  }
  return String(Math.round(ml));
}

export function BodyScreen({
  today,
  selectedDate,
  nowIso,
  profile,
  dayLogs,
  bodyLogs,
  onChangeDate,
  onSaveBodyLog,
  onSaveStress,
}: BodyScreenProps) {
  const existingBody = bodyLogs.find((b) => b.date === selectedDate) ?? null;
  const existingDay = dayLogs.find((d) => d.date === selectedDate) ?? null;
  const waterUnit = profile.units.water;

  const draftRef = useRef<BodyLog | null>(null);
  const lastDateRef = useRef<DateKey>(selectedDate);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingWritesRef = useRef(0);

  if (lastDateRef.current !== selectedDate) {
    lastDateRef.current = selectedDate;
    draftRef.current = null;
  }

  const current: BodyLog = draftRef.current ?? existingBody ?? makeBlankBodyLog(selectedDate, nowIso);

  const [sleepDraft, setSleepDraft] = useState(
    current.sleep?.hours !== undefined ? String(current.sleep.hours) : '',
  );
  const [waterDraft, setWaterDraft] = useState(
    formatWaterDisplay(current.water?.ml, waterUnit),
  );
  const [stoolCountDraft, setStoolCountDraft] = useState(
    current.stool?.count !== undefined ? String(current.stool.count) : '',
  );
  const [exerciseMinDraft, setExerciseMinDraft] = useState(
    current.exercise?.minutes !== undefined ? String(current.exercise.minutes) : '',
  );

  useEffect(() => {
    if (pendingWritesRef.current === 0) {
      draftRef.current = null;
    }
    setSleepDraft(existingBody?.sleep?.hours !== undefined ? String(existingBody.sleep.hours) : '');
    setWaterDraft(formatWaterDisplay(existingBody?.water?.ml, waterUnit));
    setStoolCountDraft(
      existingBody?.stool?.count !== undefined ? String(existingBody.stool.count) : '',
    );
    setExerciseMinDraft(
      existingBody?.exercise?.minutes !== undefined ? String(existingBody.exercise.minutes) : '',
    );
  }, [selectedDate, existingBody, waterUnit]);

  function patchBody(
    updater: Partial<BodyLog> | ((prev: BodyLog) => Partial<BodyLog>),
  ): Promise<void> {
    const base: BodyLog = draftRef.current ?? existingBody ?? makeBlankBodyLog(selectedDate, nowIso);
    const patch = typeof updater === 'function' ? updater(base) : updater;
    const next: BodyLog = {
      ...base,
      ...patch,
      date: selectedDate,
      updatedAt: nowIso,
    };
    draftRef.current = next;
    pendingWritesRef.current += 1;

    const run = writeChainRef.current.then(async () => {
      try {
        await onSaveBodyLog(next);
      } finally {
        pendingWritesRef.current -= 1;
        if (pendingWritesRef.current === 0) {
          draftRef.current = null;
        }
      }
    });
    writeChainRef.current = run;
    return run;
  }

  function saveSleepHours(raw: string): void {
    setSleepDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      void patchBody({ sleep: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) return;
    void patchBody((prev) => ({
      sleep: {
        hours: Number(parsed.toFixed(1)),
        quality: prev.sleep?.quality ?? 2,
        wokeTired: prev.sleep?.wokeTired,
      },
    }));
  }

  function saveWaterInput(raw: string): void {
    setWaterDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      void patchBody({ water: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const ml =
      waterUnit === 'glasses' ? Math.round(parsed * ML_PER_GLASS) : Math.round(parsed);
    void patchBody({ water: { ml } });
  }

  function saveStoolCount(raw: string): void {
    setStoolCountDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      void patchBody({ stool: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 30) return;
    void patchBody((prev) => ({
      stool: {
        ...prev.stool,
        count: Math.round(parsed),
      },
    }));
  }

  function saveExerciseMinutes(raw: string): void {
    setExerciseMinDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      void patchBody({ exercise: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 720) return;
    void patchBody((prev) => ({
      exercise: {
        minutes: Math.round(parsed),
        effort: prev.exercise?.effort ?? 'moderate',
      },
    }));
  }

  const currentTags = current.meals?.tags ?? [];
  const isFasting = currentTags.includes('fasting');

  function toggleMealTag(tag: 'balanced' | 'sugary' | 'caffeine' | 'late-night' | 'fasting'): void {
    void patchBody((prev) => {
      const prevTags = prev.meals?.tags ?? [];
      const has = prevTags.includes(tag);
      const nextTags = has ? prevTags.filter((t) => t !== tag) : [...prevTags, tag];
      return {
        meals: {
          pattern: prev.meals?.pattern ?? (tag === 'fasting' && !has ? 'skipped-some' : 'regular'),
          tags: nextTags,
        },
      };
    });
  }

  const lifestyle = analyzeLifestylePatterns({
    today,
    dayLogs,
    bodyLogs,
  });

  const currentStress = existingDay?.context?.stress;
  const waterPresets =
    waterUnit === 'glasses' ? [2, 4, 6, 8, 10] : [500, 1000, 1500, 2000, 2500];

  return (
    <div>
      <section class="card" aria-label="Body day picker">
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <label htmlFor="body-date-picker" class="field-label" style={{ margin: 0 }}>
            Body log date
          </label>
          {selectedDate !== today && (
            <button type="button" class="btn btn-small" onClick={() => onChangeDate(today)}>
              Back to today
            </button>
          )}
        </div>
        <div class="field" style={{ marginTop: '8px', marginBottom: 0 }}>
          <input
            id="body-date-picker"
            class="input"
            type="date"
            max={today}
            value={selectedDate}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (v && v <= today) onChangeDate(v);
            }}
          />
        </div>
      </section>

      <section class="card" aria-label="Sleep">
        <h2 class="card-title">Sleep</h2>
        <div class="field">
          <label htmlFor="sleep-hours-input">Hours slept</label>
          <div class="chip-group" style={{ marginBottom: '8px' }}>
            {[5, 6, 7, 8, 9].map((h) => (
              <button
                key={h}
                type="button"
                class="chip tabular"
                aria-pressed={current.sleep?.hours === h}
                onClick={() => saveSleepHours(String(h))}
              >
                {h}h
              </button>
            ))}
          </div>
          <input
            id="sleep-hours-input"
            class="input tabular"
            type="number"
            min="0"
            max="24"
            step="0.5"
            inputMode="decimal"
            value={sleepDraft}
            placeholder="e.g. 7.5"
            onInput={(e) => saveSleepHours((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field" style={{ marginBottom: 0 }}>
          <span class="field-label">Sleep quality</span>
          <div class="chip-group">
            {(
              [
                { val: 1, label: '1 · Restless' },
                { val: 2, label: '2 · Okay' },
                { val: 3, label: '3 · Rested' },
              ] as const
            ).map((q) => (
              <button
                key={q.val}
                type="button"
                class="chip"
                aria-pressed={current.sleep?.quality === q.val}
                onClick={() =>
                  void patchBody((prev) => ({
                    sleep: {
                      hours: prev.sleep?.hours ?? 7,
                      quality: q.val,
                      wokeTired: prev.sleep?.wokeTired,
                    },
                  }))
                }
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              class="chip"
              aria-pressed={current.sleep?.wokeTired === true}
              onClick={() =>
                void patchBody((prev) => ({
                  sleep: {
                    hours: prev.sleep?.hours ?? 7,
                    quality: prev.sleep?.quality ?? 2,
                    wokeTired: !prev.sleep?.wokeTired,
                  },
                }))
              }
            >
              Woke tired
            </button>
          </div>
        </div>
      </section>

      <section class="card" aria-label="Water">
        <h2 class="card-title">Water</h2>
        <div class="field" style={{ marginBottom: 0 }}>
          <label htmlFor="water-amount-input">
            {waterUnit === 'glasses' ? 'Water (glasses, 250 ml each)' : 'Water (ml)'}
          </label>
          <div class="chip-group" style={{ marginBottom: '8px' }}>
            {waterPresets.map((preset) => {
              const targetMl = waterUnit === 'glasses' ? preset * ML_PER_GLASS : preset;
              return (
                <button
                  key={preset}
                  type="button"
                  class="chip tabular"
                  aria-pressed={current.water?.ml === targetMl}
                  onClick={() => saveWaterInput(String(preset))}
                >
                  {waterUnit === 'glasses' ? `${preset} glasses` : `${preset} ml`}
                </button>
              );
            })}
          </div>
          <input
            id="water-amount-input"
            class="input tabular"
            type="number"
            min="0"
            step={waterUnit === 'glasses' ? '0.5' : '50'}
            inputMode="decimal"
            value={waterDraft}
            placeholder={waterUnit === 'glasses' ? 'e.g. 6' : 'e.g. 1500'}
            onInput={(e) => saveWaterInput((e.target as HTMLInputElement).value)}
          />
        </div>
      </section>

      <section class="card" aria-label="Meals and fasting">
        <h2 class="card-title">Meals</h2>
        <div class="field">
          <span class="field-label">Meal pattern</span>
          <div class="chip-group">
            {(
              [
                { value: 'regular', label: 'Regular' },
                { value: 'irregular', label: 'Irregular' },
                { value: 'skipped-some', label: 'Skipped some' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={current.meals?.pattern === opt.value}
                onClick={() =>
                  void patchBody((prev) => ({
                    meals: {
                      pattern: opt.value,
                      tags: prev.meals?.tags ?? [],
                    },
                  }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <button
            type="button"
            class="chip"
            aria-pressed={isFasting}
            onClick={() => toggleMealTag('fasting')}
          >
            Fasting today
          </button>
          <p class="muted" style={{ margin: '6px 0 0 0' }}>
            Fasting days stay out of water and meal patterns.
          </p>
        </div>

        <div class="field" style={{ marginBottom: 0 }}>
          <span class="field-label">Tags (optional)</span>
          <div class="chip-group">
            {MEAL_TAGS.map((tag) => (
              <button
                key={tag.key}
                type="button"
                class="chip"
                aria-pressed={currentTags.includes(tag.key)}
                onClick={() => toggleMealTag(tag.key)}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="card" aria-label="Digestion">
        <h2 class="card-title">Digestion</h2>
        <div class="field">
          <label htmlFor="stool-count-input">Stool count today</label>
          <input
            id="stool-count-input"
            class="input tabular"
            type="number"
            min="0"
            max="30"
            inputMode="numeric"
            value={stoolCountDraft}
            placeholder="e.g. 1"
            onInput={(e) => saveStoolCount((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <span class="field-label">Bristol stool type (1 to 7)</span>
          <div class="chip-group">
            {BRISTOL_TYPES.map((t) => (
              <button
                key={t.val}
                type="button"
                class="chip tabular"
                aria-pressed={current.stool?.bristol === t.val}
                onClick={() =>
                  void patchBody((prev) => ({
                    stool: {
                      ...prev.stool,
                      count: prev.stool?.count ?? 1,
                      bristol: prev.stool?.bristol === t.val ? undefined : t.val,
                    },
                  }))
                }
              >
                {t.hint}
              </button>
            ))}
          </div>
        </div>

        <div class="chip-group">
          <button
            type="button"
            class="chip"
            aria-pressed={current.stool?.pain === true}
            onClick={() =>
              void patchBody((prev) => ({
                stool: {
                  ...prev.stool,
                  count: prev.stool?.count ?? 1,
                  pain: !prev.stool?.pain,
                },
              }))
            }
          >
            Pain with stool
          </button>
          <button
            type="button"
            class="chip"
            aria-pressed={current.stool?.bloating === true}
            onClick={() =>
              void patchBody((prev) => ({
                stool: {
                  ...prev.stool,
                  count: prev.stool?.count ?? 1,
                  bloating: !prev.stool?.bloating,
                },
              }))
            }
          >
            Bloating
          </button>
          <button
            type="button"
            class="chip"
            aria-pressed={current.stool?.bloodSeen === true}
            onClick={() =>
              void patchBody((prev) => ({
                stool: {
                  ...prev.stool,
                  count: prev.stool?.count ?? 1,
                  bloodSeen: !prev.stool?.bloodSeen,
                },
              }))
            }
          >
            Blood seen
          </button>
        </div>
        {current.stool?.bloodSeen === true && (
          <p class="muted" style={{ margin: '8px 0 0 0' }}>
            Also note blood in stool on Today so safety checks can sort it.
          </p>
        )}
      </section>

      <section class="card" aria-label="Stress, exercise, energy and skin">
        <h2 class="card-title">Stress, exercise, energy and skin</h2>
        <div class="field">
          <span class="field-label">Stress today (1 to 5)</span>
          <div class="chip-group">
            {([1, 2, 3, 4, 5] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                class="chip tabular"
                aria-label={`Stress ${lvl} of 5`}
                aria-pressed={currentStress === lvl}
                onClick={() =>
                  void onSaveStress(selectedDate, currentStress === lvl ? undefined : lvl)
                }
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <label htmlFor="exercise-minutes-input">Exercise (minutes)</label>
          <input
            id="exercise-minutes-input"
            class="input tabular"
            type="number"
            min="0"
            max="720"
            inputMode="numeric"
            value={exerciseMinDraft}
            placeholder="e.g. 30"
            onInput={(e) => saveExerciseMinutes((e.target as HTMLInputElement).value)}
          />
          <div class="chip-group" style={{ marginTop: '8px' }}>
            {(['light', 'moderate', 'hard'] as const).map((eff) => (
              <button
                key={eff}
                type="button"
                class="chip"
                aria-pressed={current.exercise?.effort === eff}
                onClick={() =>
                  void patchBody((prev) => ({
                    exercise: {
                      minutes: prev.exercise?.minutes ?? 20,
                      effort: eff,
                    },
                  }))
                }
              >
                {eff}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Energy (1 to 5)</span>
          <div class="chip-group">
            {([1, 2, 3, 4, 5] as const).map((en) => (
              <button
                key={en}
                type="button"
                class="chip tabular"
                aria-label={`Energy ${en} of 5`}
                aria-pressed={current.energy === en}
                onClick={() =>
                  void patchBody({ energy: current.energy === en ? undefined : en })
                }
              >
                {en}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <span class="field-label">Acne</span>
          <div class="chip-group">
            {(
              [
                { value: 0, label: 'None' },
                { value: 1, label: 'Mild' },
                { value: 2, label: 'Moderate' },
                { value: 3, label: 'Severe' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={current.skin?.acne === opt.value}
                onClick={() =>
                  void patchBody((prev) => ({
                    skin: {
                      ...prev.skin,
                      acne: opt.value,
                    },
                  }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div class="field" style={{ marginBottom: 0 }}>
          <span class="field-label">Hair changes</span>
          <div class="chip-group">
            {(
              [
                { value: 'none', label: 'None' },
                { value: 'shedding', label: 'Shedding' },
                { value: 'new-growth', label: 'New hair growth' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                class="chip"
                aria-pressed={current.skin?.hair === opt.value}
                onClick={() =>
                  void patchBody((prev) => ({
                    skin: {
                      ...prev.skin,
                      hair: opt.value,
                    },
                  }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section class="card" aria-label="Lifestyle patterns">
        <h2 class="card-title">Lifestyle patterns</h2>
        {lifestyle.patterns.length > 0 ? (
          <div>
            {lifestyle.patterns.map((pat) => (
              <p key={pat.id} style={{ margin: '0 0 8px 0' }}>
                {pat.statement}
              </p>
            ))}
          </div>
        ) : (
          <div>
            <p class="muted" style={{ marginTop: 0 }}>
              Patterns look only at days without bleeding on that day and the next day. At least 14
              non-bleeding days in each comparison group are needed before a pattern unlocks.
            </p>
            <div class="muted tabular" style={{ fontSize: '0.9rem' }}>
              {lifestyle.readiness.map((item) => (
                <div key={item.causeKey}>
                  {item.label}: {item.loggedNonBleedingDays} of {item.requiredMinDays}+ non-bleeding
                  days logged
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
