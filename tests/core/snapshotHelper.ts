import type { DayLog, MedicineEntry, Profile, WatchItem } from '../../core/model/types';
import type { RuleExampleSnapshot } from '../../core/triage/rules';
import { evaluateTriage } from '../../core/triage/engine';

export const TEST_DEFAULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2026-01-01T10:00:00+05:00',
  birthYear: 2002,
  menarcheAge: 13,
  selfRegularity: 'regular',
  lastPeriodApprox: null,
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: '',
  medicationsNote: '',
  sproutName: null,
  theme: 'dusk',
  units: { temperature: 'C', water: 'ml' },
  reminders: {
    daily: { on: false, time: '20:00' },
    watchlist: true,
    quietFrom: '22:00',
    quietTo: '07:00',
  },
  discreetMode: false,
  lock: { type: 'none' },
  locale: 'en',
  region: 'PK',
  disclaimerAcceptedAt: '2026-01-01T10:00:00+05:00',
};

export function toTestDayLog(date: string, partial: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: `${date}T12:00:00+05:00`,
    ...partial,
  };
}

export function evaluateSnapshot(snapshot: RuleExampleSnapshot) {
  const profile: Profile = { ...TEST_DEFAULT_PROFILE, ...snapshot.profile };
  const recentToday = (snapshot.recentLogs ?? []).find(
    (l) => l.date === snapshot.today,
  );
  const dayLog = toTestDayLog(snapshot.today, snapshot.dayLog ?? recentToday);
  const recentLogs: DayLog[] = (snapshot.recentLogs ?? []).map((l, idx) =>
    toTestDayLog(l.date ?? `2026-10-${String(idx + 1).padStart(2, '0')}`, l),
  );
  if (!recentLogs.some((l) => l.date === dayLog.date)) {
    recentLogs.push(dayLog);
  }
  const medicines: MedicineEntry[] = (snapshot.medicines ?? []).map((m, idx) => ({
    id: m.id ?? `med-${idx}`,
    date: m.date ?? snapshot.today,
    kind: m.kind ?? 'course',
    category: m.category ?? 'hormone',
    nameShown: m.nameShown ?? 'Combined pill',
    genericName: m.genericName ?? null,
    strengthMg: m.strengthMg ?? null,
    stopDate: m.stopDate ?? null,
    note: m.note ?? '',
    updatedAt: m.updatedAt ?? `${snapshot.today}T10:00:00+05:00`,
    ...m,
  }));
  const watchItems: WatchItem[] = (snapshot.watchItems ?? []).map((w, idx) => ({
    id: w.id ?? `watch-${idx}`,
    createdAt: w.createdAt ?? `${snapshot.today}T09:00:00+05:00`,
    dueAt: w.dueAt ?? `${snapshot.today}T09:00:00+05:00`,
    status: w.status ?? 'open',
    checks: w.checks ?? [],
  }));

  return evaluateTriage({
    today: snapshot.today,
    profile,
    dayLog,
    recentLogs,
    decisions: [],
    medicines,
    watchItems,
    existingVerdicts: [],
    visits: [],
    derived: snapshot.derived,
  });
}
