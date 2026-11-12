import {
  awardCompanionRing,
  buildWeeklyReviewSummary,
  deriveSproutMood,
  getStageDefinition,
  isCheckInDayLog,
  isPopulatedBodyLog,
  isSundayEvening,
  reconcileCompanionState,
  type StageDefinition,
  type WeeklyReviewSummary,
} from '../core/companion/companion';
import { deriveCycles } from '../core/cycles/cycles';
import { classifyEpisodes } from '../core/cycles/episodes';
import { analyzeLifestylePatterns, type LifestyleAnalysisResult } from '../core/insights/lifestyle';
import { addDays, diffDays } from '../core/model/dates';
import {
  RULESET_VERSION,
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupMeta,
  type BodyLog,
  type CompanionStage,
  type CompanionState,
  type DateKey,
  type DayLog,
  type Decision,
  type DoctorVisit,
  type MedicineEntry,
  type Profile,
  type RingSource,
  type SproutMood,
  type Stamp,
  type StandingFlagId,
  type Verdict,
} from '../core/model/types';
import { type OvulationAnalysisResult } from '../core/ovulation/ovulation';
import {
  computeLivePrediction,
  reconcileForecasts,
  type CycleWindowResult,
} from '../core/predict/forecast';
import { getCatchUpDays } from '../core/triage/catchUp';
import { evaluateTriage, type TriageEvaluationResult } from '../core/triage/engine';
import { getActiveQuestionFlows } from '../core/triage/flowEngine';
import { advanceWatchItem, getWatchCheckLabel, summarizeWatchItem } from '../core/triage/watchList';
export { getWatchCheckLabel, summarizeWatchItem };
import {
  createBackupFile,
  inspectBackupFile,
  restoreBackupFile,
  type BackupPreview,
} from '../data/backup';

export type { BackupPreview };
import { IndexedDBStorage } from '../data/idb';
import { defaultBackupMeta } from '../data/migrations';
import { createPinLock, verifyPin } from '../data/pin';

export { createPinLock };
import regionsData from '../data/regions.json';
import {
  applyNativeReminderPlan,
  clearDeliveredReminders,
  getDeliveredReminderCount,
  isNativeAndroid,
  syncScreenPrivacy,
  syncWidgetState,
  writeAutoBackupToDocuments,
} from '../platform/native';
import { exportAppFile, getLocalDateKey, getLocalStamp, prefersLightTheme } from '../platform/web';
import {
  advanceReminderTracker,
  computeReminderPlan,
  defaultReminderTracker,
  reconcileDeliveredReminders,
  type ReminderPlan,
  type ReminderTrackerState,
} from './reminders';

export const APP_VERSION = '0.2.0';

export interface RegionEmergencyInfo {
  code: string;
  name: string;
  emergency: Array<{ number: string; label: string; note: string }>;
  mentalHealthLine: string;
}

export function getRegionOptions(): RegionEmergencyInfo[] {
  return Object.entries(regionsData).map(([code, info]) => ({
    code,
    name: info.name,
    emergency: info.emergency,
    mentalHealthLine: info.mentalHealthLine,
  }));
}

export function getRegionEmergencyInfo(regionCode: string): RegionEmergencyInfo {
  const entry =
    (regionsData as Record<string, Omit<RegionEmergencyInfo, 'code'>>)[regionCode] ??
    regionsData.PK;
  return {
    code: regionCode in regionsData ? regionCode : 'PK',
    name: entry.name,
    emergency: entry.emergency,
    mentalHealthLine: entry.mentalHealthLine,
  };
}

export function makeDefaultProfile(nowIso: Stamp = getLocalStamp()): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso,
    birthYear: null,
    menarcheAge: null,
    selfRegularity: 'unknown',
    lastPeriodApprox: null,
    onHormones: null,
    contraception: null,
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'prefer-not-to-say',
    conditionsNote: '',
    medicationsNote: '',
    sproutName: null,
    theme: 'dawn',
    units: { temperature: 'C', water: 'ml' },
    reminders: {
      daily: { on: false, time: '20:00' },
      watchlist: true,
      quietFrom: '22:00',
      quietTo: '08:00',
    },
    discreetMode: true,
    lock: { type: 'none' },
    locale: 'en',
    region: 'PK',
    disclaimerAcceptedAt: null,
    reducedMotion: false,
    haptics: true,
    sound: false,
  };
}

export function makeEmptyDayLog(date: DateKey, nowIso: Stamp = getLocalStamp()): DayLog {
  return {
    date,
    filledFrom: date === getLocalDateKey() ? 'live' : 'backfill',
    flow: null,
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: nowIso,
  };
}

export function isBackupOverdue(meta: BackupMeta, dayLogsCount: number, today: DateKey): boolean {
  if (dayLogsCount === 0) return false;
  if (meta.snoozedUntil && meta.snoozedUntil.slice(0, 10) > today) return false;
  if (!meta.lastExportAt) return dayLogsCount >= 3;
  const lastDate = meta.lastExportAt.slice(0, 10);
  return diffDays(lastDate, today) >= 14;
}

export function computeStep2Snapshot(
  snapshot: AppSnapshotData,
  selectedDate: DateKey,
  today: DateKey,
  nowIso: Stamp,
) {
  const profile = snapshot.profile ?? makeDefaultProfile(nowIso);
  const episodes = classifyEpisodes(snapshot.dayLogs, snapshot.decisions, today);
  const cycles = deriveCycles(episodes, snapshot.decisions, today);
  const selectedDayLog =
    snapshot.dayLogs.find((d) => d.date === selectedDate) ??
    makeEmptyDayLog(selectedDate, nowIso);
  const todayDayLog =
    snapshot.dayLogs.find((d) => d.date === today) ?? makeEmptyDayLog(today, nowIso);

  const triageToday: TriageEvaluationResult = evaluateTriage({
    today,
    nowStamp: nowIso,
    profile,
    dayLog: todayDayLog,
    recentLogs: snapshot.dayLogs,
    decisions: snapshot.decisions,
    medicines: snapshot.medicines,
    watchItems: snapshot.watchItems,
    existingVerdicts: snapshot.verdicts,
    visits: snapshot.visits,
  });

  const triageSelected: TriageEvaluationResult =
    selectedDate === today
      ? triageToday
      : evaluateTriage({
          today: selectedDate,
          nowStamp: nowIso,
          profile,
          dayLog: selectedDayLog,
          recentLogs: snapshot.dayLogs.filter((l) => l.date <= selectedDate),
          decisions: snapshot.decisions,
          medicines: snapshot.medicines,
          watchItems: snapshot.watchItems,
          existingVerdicts: snapshot.verdicts,
          visits: snapshot.visits,
        });

  const catchUpDays = getCatchUpDays(snapshot.dayLogs, today);

  const activeFlows = getActiveQuestionFlows({
    today: selectedDate,
    profile,
    dayLog: selectedDayLog,
    recentLogs: snapshot.dayLogs,
    activeCycleLengths: cycles.activeCycleLengths,
    daysSinceLastPeriodStart: cycles.daysSinceLastPeriodStart,
    medicines: snapshot.medicines,
    decisions: snapshot.decisions,
  });

  return {
    episodes,
    cycles,
    triageToday,
    triageSelected,
    catchUpDays,
    activeFlows,
  };
}

export function computeStep3Snapshot(
  snapshot: AppSnapshotData,
  selectedDate: DateKey,
  today: DateKey,
  nowIso: Stamp,
) {
  const step2 = computeStep2Snapshot(snapshot, selectedDate, today, nowIso);
  const profile = snapshot.profile ?? makeDefaultProfile(nowIso);
  const prediction: CycleWindowResult = computeLivePrediction({
    today,
    profile,
    cycles: step2.cycles,
    dayLogs: snapshot.dayLogs,
    decisions: snapshot.decisions,
    existingForecasts: snapshot.forecasts,
  });
  return {
    ...step2,
    prediction,
  };
}

export function computeStep4Snapshot(
  snapshot: AppSnapshotData,
  selectedDate: DateKey,
  today: DateKey,
  nowIso: Stamp,
): ReturnType<typeof computeStep3Snapshot> & {
  lifestyle: LifestyleAnalysisResult;
  ovulation: OvulationAnalysisResult;
} {
  const step3 = computeStep3Snapshot(snapshot, selectedDate, today, nowIso);
  const lifestyle = analyzeLifestylePatterns({
    today,
    dayLogs: snapshot.dayLogs,
    bodyLogs: snapshot.bodyLogs,
  });
  return {
    ...step3,
    lifestyle,
    ovulation: step3.prediction.ovulation,
  };
}

export function computeStep5Snapshot(
  snapshot: AppSnapshotData,
  selectedDate: DateKey,
  today: DateKey,
  nowIso: Stamp,
): ReturnType<typeof computeStep4Snapshot> & {
  mood: SproutMood;
  stageInfo: StageDefinition;
  sundayEvening: boolean;
  weeklyReview: WeeklyReviewSummary;
} {
  const step4 = computeStep4Snapshot(snapshot, selectedDate, today, nowIso);
  const mood = deriveSproutMood({
    today,
    dayLogs: snapshot.dayLogs,
    companion: snapshot.companion,
  });
  const stageInfo = getStageDefinition(snapshot.companion.stage);
  const sundayEvening = isSundayEvening(today, nowIso);
  const patternText =
    step4.lifestyle.patterns[0]?.statement ??
    (step4.prediction.leadIn.status === 'learned'
      ? `Spotting or cramps appeared around ${step4.prediction.leadIn.medianOffsetDays} days before flow in ${step4.prediction.leadIn.cyclesWithSignal} cycles.`
      : null);
  const weeklyReview = buildWeeklyReviewSummary({
    today,
    dayLogs: snapshot.dayLogs,
    companion: snapshot.companion,
    confidenceScore: step4.prediction.confidence.score,
    patternText,
  });

  return {
    ...step4,
    mood,
    stageInfo,
    sundayEvening,
    weeklyReview,
  };
}

export interface CompanionUpdateOutcome {
  awarded: 0 | 1;
  stageChanged: boolean;
  newStage: CompanionStage;
  newlyEarnedBadges: string[];
  newlyUnlockedThemes: string[];
}

function hasNewFollowUpAnswer(prev: DayLog | null, next: DayLog): boolean {
  if (next.dangerAnswered === true && prev?.dangerAnswered !== true) return true;
  if (next.changeEvery !== undefined && prev?.changeEvery !== next.changeEvery) return true;
  if (next.soakedPerHour !== undefined && prev?.soakedPerHour !== next.soakedPerHour) return true;
  if (next.clots !== undefined && prev?.clots !== next.clots) return true;
  if (next.pregnancyChance !== undefined && prev?.pregnancyChance !== next.pregnancyChance) return true;
  if (next.stoolBlood !== undefined && prev?.stoolBlood !== next.stoolBlood) return true;
  if (
    next.pain &&
    next.pain.sites.length > 0 &&
    (prev?.pain?.sites.length ?? 0) === 0
  ) {
    return true;
  }
  if (next.pain?.reliefHelped !== undefined && prev?.pain?.reliefHelped !== next.pain.reliefHelped) {
    return true;
  }
  return false;
}

const REMINDER_TRACKER_STORAGE_KEY = 'moonroot_reminder_tracker';

function resolveWidgetAccent(theme: Profile['theme']): string {
  const effective = theme === 'auto' || theme === 'system' ? (prefersLightTheme() ? 'dawn' : 'dusk') : theme;
  switch (effective) {
    case 'dawn':
      return '#700143';
    case 'meadow':
      return '#6EC4A8';
    case 'ocean':
      return '#6AAEDB';
    case 'rose':
      return '#D4889E';
    case 'high-contrast':
      return '#00E5A3';
    case 'midnight':
      return '#84D9B2';
    case 'dusk':
    default:
      return '#CFD78C';
  }
}

function loadReminderTracker(): ReminderTrackerState {
  try {
    if (typeof localStorage === 'undefined') return defaultReminderTracker();
    const raw = localStorage.getItem(REMINDER_TRACKER_STORAGE_KEY);
    if (!raw) return defaultReminderTracker();
    const parsed = JSON.parse(raw) as Partial<ReminderTrackerState>;
    return {
      ignoredStreak: typeof parsed.ignoredStreak === 'number' ? parsed.ignoredStreak : 0,
      lastPromptDate: typeof parsed.lastPromptDate === 'string' ? parsed.lastPromptDate : null,
      lastCheckInDate: typeof parsed.lastCheckInDate === 'string' ? parsed.lastCheckInDate : null,
    };
  } catch {
    return defaultReminderTracker();
  }
}

function saveReminderTracker(state: ReminderTrackerState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REMINDER_TRACKER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

export class MoonrootStore {
  readonly storage: IndexedDBStorage;
  snapshot: AppSnapshotData;
  locked = false;
  lastCompanionEvent: CompanionUpdateOutcome | null = null;
  reminderTracker: ReminderTrackerState = loadReminderTracker();

  constructor(storage = new IndexedDBStorage()) {
    this.storage = storage;
    this.snapshot = {
      profile: null,
      dayLogs: [],
      bodyLogs: [],
      decisions: [],
      forecasts: [],
      verdicts: [],
      watchItems: [],
      visits: [],
      medicines: [],
      companion: {
        rings: 0,
        stage: 0,
        unlocked: ['dusk', 'dawn', 'high-contrast'],
        badges: [],
        lastRingDate: null,
      },
      meta: defaultBackupMeta(),
    };
  }

  async init(): Promise<void> {
    this.snapshot = await this.storage.exportAll();
    this.locked = this.snapshot.profile?.lock.type === 'pin';
    await syncScreenPrivacy(this.snapshot.profile?.lock.type === 'pin');
    if (this.snapshot.profile && !this.locked) {
      await this.syncForecasts();
      await this.syncCompanionState();
      await this.syncNativeEnvironment();
    }
  }

  async unlockWithPin(pin: string): Promise<boolean> {
    const lock = this.snapshot.profile?.lock;
    if (!lock || lock.type !== 'pin') {
      this.locked = false;
      return true;
    }
    const ok = await verifyPin(pin, lock);
    if (ok) {
      this.locked = false;
      await this.syncForecasts();
      await this.syncCompanionState();
      await this.syncNativeEnvironment();
    }
    return ok;
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.storage.saveProfile(profile);
    this.snapshot = { ...this.snapshot, profile };
    await this.syncForecasts();
    await syncScreenPrivacy(profile.lock.type === 'pin');
    await this.syncNativeEnvironment();
  }

  async setPin(pin: string | null): Promise<void> {
    if (!this.snapshot.profile) return;
    const lock = pin ? await createPinLock(pin) : { type: 'none' as const };
    await this.saveProfile({ ...this.snapshot.profile, lock });
  }

  getDayLog(date: DateKey): DayLog | null {
    return this.snapshot.dayLogs.find((d) => d.date === date) ?? null;
  }

  getBodyLog(date: DateKey): BodyLog | null {
    return this.snapshot.bodyLogs.find((b) => b.date === date) ?? null;
  }

  private async updateCompanionInternal(
    sources: readonly RingSource[],
    actionDate: DateKey,
    extra: { doctorFileCreated?: boolean } = {},
  ): Promise<CompanionUpdateOutcome> {
    const prev = this.snapshot.companion;
    let working = prev;
    let totalAwarded: 0 | 1 = 0;
    let anyStageChanged = false;
    const unlockedSet = new Set<string>();

    for (const source of sources) {
      const res = awardCompanionRing(working, source, actionDate);
      working = res.next;
      if (res.awarded === 1) totalAwarded = 1;
      if (res.stageChanged) anyStageChanged = true;
      for (const theme of res.newlyUnlockedThemes) {
        unlockedSet.add(theme);
      }
    }

    const episodes = classifyEpisodes(
      this.snapshot.dayLogs,
      this.snapshot.decisions,
      actionDate,
    );
    const cycles = deriveCycles(episodes, this.snapshot.decisions, actionDate);
    const lifestyle = analyzeLifestylePatterns({
      today: actionDate,
      dayLogs: this.snapshot.dayLogs,
      bodyLogs: this.snapshot.bodyLogs,
    });
    const prediction = computeLivePrediction({
      today: actionDate,
      profile: this.snapshot.profile ?? makeDefaultProfile(),
      cycles,
      dayLogs: this.snapshot.dayLogs,
      decisions: this.snapshot.decisions,
      existingForecasts: this.snapshot.forecasts,
    });

    const reconciled = reconcileCompanionState({
      companion: working,
      today: actionDate,
      dayLogs: this.snapshot.dayLogs,
      bodyLogs: this.snapshot.bodyLogs,
      completedCycleCount: cycles.cycles.length,
      hasPattern: lifestyle.patterns.length > 0 || prediction.leadIn.status === 'learned',
      meta: this.snapshot.meta,
      doctorFileCreated: extra.doctorFileCreated ?? working.doctorFileCreated,
    });

    const newlyEarnedBadges = reconciled.badges.filter((b) => !prev.badges.includes(b));
    if (JSON.stringify(reconciled) !== JSON.stringify(prev)) {
      await this.storage.saveCompanion(reconciled);
      this.snapshot = { ...this.snapshot, companion: reconciled };
    }

    const outcome: CompanionUpdateOutcome = {
      awarded: totalAwarded,
      stageChanged: anyStageChanged || reconciled.stage > prev.stage,
      newStage: reconciled.stage,
      newlyEarnedBadges,
      newlyUnlockedThemes: [...unlockedSet],
    };
    this.lastCompanionEvent = outcome;
    return outcome;
  }

  async syncCompanionState(today: DateKey = getLocalDateKey()): Promise<CompanionUpdateOutcome> {
    return this.updateCompanionInternal([], today);
  }

  async markDoctorFileCreated(today: DateKey = getLocalDateKey()): Promise<CompanionUpdateOutcome> {
    return this.updateCompanionInternal([], today, { doctorFileCreated: true });
  }

  async openWeeklyReview(
    today: DateKey = getLocalDateKey(),
    nowIso: Stamp = getLocalStamp(),
  ): Promise<CompanionUpdateOutcome> {
    const step4 = computeStep4Snapshot(this.snapshot, today, today, nowIso);
    const confidenceScore = step4.prediction.confidence.score;
    const outcome = await this.updateCompanionInternal(['weekly-review'], today);
    const nextComp: CompanionState = {
      ...this.snapshot.companion,
      lastWeeklyReviewDate: today,
      lastWeeklyConfidence: confidenceScore,
    };
    if (JSON.stringify(nextComp) !== JSON.stringify(this.snapshot.companion)) {
      await this.storage.saveCompanion(nextComp);
      this.snapshot = { ...this.snapshot, companion: nextComp };
    }
    return outcome;
  }

  async saveBodyLog(log: BodyLog, actionToday: DateKey = getLocalDateKey()): Promise<BodyLog | null> {
    const previous = this.getBodyLog(log.date);
    await this.storage.saveBodyLog(log);
    const others = this.snapshot.bodyLogs.filter((b) => b.date !== log.date);
    this.snapshot = {
      ...this.snapshot,
      bodyLogs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)),
    };
    if (isPopulatedBodyLog(log)) {
      await this.updateCompanionInternal(['body'], actionToday);
    } else {
      await this.syncCompanionState(actionToday);
    }
    return previous;
  }

  async syncTriageState(
    today: DateKey = getLocalDateKey(),
    nowIso: Stamp = getLocalStamp(),
  ): Promise<void> {
    const profile = this.snapshot.profile;
    if (!profile) return;

    const existingTodayLog = this.getDayLog(today);
    const dayLog = existingTodayLog ?? makeEmptyDayLog(today, nowIso);
    const triage = evaluateTriage({
      today,
      nowStamp: nowIso,
      profile,
      dayLog,
      recentLogs: this.snapshot.dayLogs,
      decisions: this.snapshot.decisions,
      medicines: this.snapshot.medicines,
      watchItems: this.snapshot.watchItems,
      existingVerdicts: this.snapshot.verdicts,
      visits: this.snapshot.visits,
    });

    const nextVerdicts = [...this.snapshot.verdicts];
    let verdictsChanged = false;

    for (const closedId of triage.closedByVisitIds) {
      const idx = nextVerdicts.findIndex((v) => v.id === closedId);
      const target = nextVerdicts[idx];
      if (target && !target.closedByVisit) {
        const triggerDate = target.triggerKey?.split(':')[1] ?? target.at.slice(0, 10);
        const closingVisit = this.snapshot.visits.find((vis) => vis.date >= triggerDate);
        const updated: Verdict = {
          ...target,
          closedByVisit: closingVisit?.id ?? 'visit',
        };
        nextVerdicts[idx] = updated;
        await this.storage.saveVerdict(updated);
        verdictsChanged = true;
      }
    }

    for (const ev of triage.newEvents) {
      if (!nextVerdicts.some((v) => v.triggerKey === ev.triggerKey)) {
        nextVerdicts.push(ev);
        await this.storage.saveVerdict(ev);
        verdictsChanged = true;
      }
    }

    if (
      existingTodayLog &&
      (triage.today.level === 'green' ||
        triage.today.level === 'yellow' ||
        triage.today.level === 'orange' ||
        triage.today.level === 'red')
    ) {
      const todayVerdictId = `today-${today}`;
      const existingIdx = nextVerdicts.findIndex((v) => v.id === todayVerdictId);
      const prevVerdict = existingIdx >= 0 ? nextVerdicts[existingIdx] : undefined;
      const sameRules =
        prevVerdict &&
        prevVerdict.level === triage.today.level &&
        prevVerdict.ruleIds.join(',') === triage.today.ruleIds.join(',');
      if (!sameRules) {
        const nextTodayVerdict: Verdict = {
          id: todayVerdictId,
          at: nowIso,
          level: triage.today.level,
          ruleIds: triage.today.ruleIds,
          title: triage.today.title,
          reasons: triage.today.reasons,
          rulesetVersion: RULESET_VERSION,
          kind: 'today',
        };
        if (existingIdx >= 0) {
          nextVerdicts[existingIdx] = nextTodayVerdict;
        } else {
          nextVerdicts.push(nextTodayVerdict);
        }
        await this.storage.saveVerdict(nextTodayVerdict);
        verdictsChanged = true;
      }
    }

    const nextWatchItems = [...this.snapshot.watchItems];
    let watchChanged = false;
    for (const item of triage.proposedWatchItems) {
      if (!nextWatchItems.some((w) => w.id === item.id)) {
        nextWatchItems.push(item);
        await this.storage.saveWatchItem(item);
        watchChanged = true;
      }
    }

    if (verdictsChanged || watchChanged) {
      this.snapshot = {
        ...this.snapshot,
        verdicts: nextVerdicts.sort((a, b) => a.at.localeCompare(b.at)),
        watchItems: nextWatchItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      };
    }
  }

  async syncForecasts(today: DateKey = getLocalDateKey()): Promise<void> {
    const profile = this.snapshot.profile;
    if (!profile) return;

    const episodes = classifyEpisodes(this.snapshot.dayLogs, this.snapshot.decisions, today);
    const cycles = deriveCycles(episodes, this.snapshot.decisions, today);
    const rec = reconcileForecasts({
      today,
      profile,
      cycles,
      dayLogs: this.snapshot.dayLogs,
      decisions: this.snapshot.decisions,
      existingForecasts: this.snapshot.forecasts,
    });

    if (rec.changed) {
      const prevById = new Map(this.snapshot.forecasts.map((f) => [f.id, f]));
      for (const f of rec.forecasts) {
        const prev = prevById.get(f.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(f)) {
          await this.storage.saveForecast(f);
        }
      }
      this.snapshot = {
        ...this.snapshot,
        forecasts: rec.forecasts,
      };
    }
  }

  async saveApproximatePeriod(
    startDate: DateKey,
    durationDays = 4,
    nowIso: Stamp = getLocalStamp(),
  ): Promise<number> {
    const count = Math.max(1, Math.min(10, Math.round(durationDays)));
    const existingByDate = new Map(this.snapshot.dayLogs.map((l) => [l.date, l]));
    let added = 0;

    for (let i = 0; i < count; i += 1) {
      const date = addDays(startDate, i);
      const existing = existingByDate.get(date);
      if (existing && existing.filledFrom !== 'approximate' && existing.flow !== null) {
        continue;
      }
      const entry: DayLog = {
        date,
        filledFrom: 'approximate',
        flow: i === 0 || i === 1 ? 'medium' : 'light',
        symptoms: existing?.symptoms ?? [],
        danger: existing?.danger ?? [],
        dangerAnswered: true,
        note: existing?.note ?? '',
        updatedAt: nowIso,
      };
      await this.storage.saveDayLog(entry);
      existingByDate.set(date, entry);
      added += 1;
    }

    if (added > 0) {
      this.snapshot = {
        ...this.snapshot,
        dayLogs: [...existingByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      };
      await this.syncTriageState(getLocalDateKey(), nowIso);
      await this.syncForecasts(getLocalDateKey());
      await this.syncCompanionState(getLocalDateKey());
    }
    return added;
  }

  async saveDayLog(log: DayLog, actionToday: DateKey = getLocalDateKey()): Promise<DayLog | null> {
    const previous = this.getDayLog(log.date);
    await this.storage.saveDayLog(log);
    const others = this.snapshot.dayLogs.filter((d) => d.date !== log.date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState(actionToday, log.updatedAt);
    await this.syncForecasts(actionToday);
    const sources: RingSource[] = [];
    if (isCheckInDayLog(log)) {
      sources.push('checkin');
    }
    if (log.filledFrom !== 'approximate' && hasNewFollowUpAnswer(previous, log)) {
      sources.push('followup');
    }
    await this.updateCompanionInternal(sources, actionToday);
    if (isCheckInDayLog(log)) {
      this.reminderTracker = advanceReminderTracker(this.reminderTracker, actionToday, {
        hasCheckInToday: true,
        reminderEnabled: Boolean(this.snapshot.profile?.reminders.daily.on),
      });
      saveReminderTracker(this.reminderTracker);
      await clearDeliveredReminders();
    }
    await this.syncNativeEnvironment(actionToday);
    return previous;
  }

  async restorePreviousDayLog(date: DateKey, previous: DayLog | null): Promise<void> {
    if (previous) {
      await this.saveDayLog(previous);
    } else {
      await this.storage.deleteDayLog(date);
      this.snapshot = {
        ...this.snapshot,
        dayLogs: this.snapshot.dayLogs.filter((d) => d.date !== date),
      };
      await this.syncTriageState();
      await this.syncForecasts();
    }
  }

  async deleteDayLog(date: DateKey): Promise<void> {
    await this.storage.deleteDayLog(date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: this.snapshot.dayLogs.filter((d) => d.date !== date),
    };
    await this.syncTriageState();
    await this.syncForecasts();
  }

  async saveDecision(decision: Decision): Promise<void> {
    await this.storage.saveDecision(decision);
    const others = this.snapshot.decisions.filter((d) => d.id !== decision.id);
    this.snapshot = {
      ...this.snapshot,
      decisions: [...others, decision].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState(getLocalDateKey(), decision.at);
    await this.syncForecasts(getLocalDateKey());
    await this.syncCompanionState(getLocalDateKey());
  }

  async deleteDecision(id: string): Promise<void> {
    await this.storage.deleteDecision(id);
    this.snapshot = {
      ...this.snapshot,
      decisions: this.snapshot.decisions.filter((d) => d.id !== id),
    };
    await this.syncTriageState();
    await this.syncForecasts();
  }

  async dismissEventCard(verdictId: string, nowIso: Stamp = getLocalStamp()): Promise<void> {
    const target = this.snapshot.verdicts.find((v) => v.id === verdictId);
    if (!target) return;
    const updated: Verdict = { ...target, dismissedAt: nowIso };
    await this.storage.saveVerdict(updated);
    this.snapshot = {
      ...this.snapshot,
      verdicts: this.snapshot.verdicts.map((v) => (v.id === verdictId ? updated : v)),
    };
  }

  async dismissStandingPrompt(
    ruleId: StandingFlagId,
    title: string,
    reason: string,
    today: DateKey = getLocalDateKey(),
    nowIso: Stamp = getLocalStamp(),
  ): Promise<void> {
    const ack: Verdict = {
      id: `std-ack-${ruleId}-${today}`,
      at: nowIso,
      level: 'orange',
      ruleIds: [ruleId],
      title,
      reasons: [reason],
      rulesetVersion: RULESET_VERSION,
      kind: 'event',
      triggerKey: `${ruleId}:${today}`,
      dismissedAt: nowIso,
    };
    await this.storage.saveVerdict(ack);
    const others = this.snapshot.verdicts.filter((v) => v.id !== ack.id);
    this.snapshot = {
      ...this.snapshot,
      verdicts: [...others, ack].sort((a, b) => a.at.localeCompare(b.at)),
    };
  }

  async answerWatchCheck(
    watchId: string,
    answers: Record<string, 'yes' | 'no' | 'unsure'>,
    nowIso: Stamp = getLocalStamp(),
  ): Promise<void> {
    const target = this.snapshot.watchItems.find((w) => w.id === watchId);
    if (!target) return;
    const result = advanceWatchItem(target, answers, nowIso);
    await this.storage.saveWatchItem(result.item);
    this.snapshot = {
      ...this.snapshot,
      watchItems: this.snapshot.watchItems.map((w) =>
        w.id === watchId ? result.item : w,
      ),
    };
    await this.syncTriageState(getLocalDateKey(), nowIso);
    await this.updateCompanionInternal(['followup'], getLocalDateKey());
  }

  async saveMedicine(entry: MedicineEntry): Promise<void> {
    await this.storage.saveMedicine(entry);
    const others = this.snapshot.medicines.filter((m) => m.id !== entry.id);
    this.snapshot = {
      ...this.snapshot,
      medicines: [...others, entry].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState(getLocalDateKey(), entry.updatedAt);
  }

  async deleteMedicine(id: string): Promise<void> {
    await this.storage.deleteMedicine(id);
    this.snapshot = {
      ...this.snapshot,
      medicines: this.snapshot.medicines.filter((m) => m.id !== id),
    };
    await this.syncTriageState();
  }

  async saveVisit(visit: DoctorVisit): Promise<void> {
    await this.storage.saveVisit(visit);
    const others = this.snapshot.visits.filter((v) => v.id !== visit.id);
    this.snapshot = {
      ...this.snapshot,
      visits: [...others, visit].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState();
  }

  async exportBackup(passphrase?: string): Promise<{ filename: string; json: string }> {
    const nowIso = getLocalStamp();
    const today = getLocalDateKey();
    const current = await this.storage.exportAll();
    const json = await createBackupFile(current, {
      appVersion: APP_VERSION,
      exportedAt: nowIso,
      passphrase,
    });
    const nextMeta: BackupMeta = {
      ...current.meta,
      lastExportAt: nowIso,
      passphraseAsked: true,
    };
    await this.storage.saveMeta(nextMeta);
    this.snapshot = { ...current, meta: nextMeta };
    await this.syncCompanionState(today);
    return { filename: `moonroot-backup-${today}.json`, json };
  }

  async snoozeBackupNudge(): Promise<void> {
    const snoozeDate = addDays(getLocalDateKey(), 7);
    const nextMeta: BackupMeta = {
      ...this.snapshot.meta,
      snoozedUntil: `${snoozeDate}T00:00:00+00:00`,
    };
    await this.storage.saveMeta(nextMeta);
    this.snapshot = { ...this.snapshot, meta: nextMeta };
  }

  async inspectBackup(rawText: string): Promise<BackupPreview> {
    return inspectBackupFile(rawText);
  }

  getReminderPlan(today: DateKey = getLocalDateKey()): ReminderPlan {
    const profile = this.snapshot.profile ?? makeDefaultProfile();
    const hasOpenWatchItem = this.snapshot.watchItems.some((w) => w.status === 'open');
    return computeReminderPlan({
      today,
      profile,
      hasOpenWatchItem,
      tracker: this.reminderTracker,
    });
  }

  async syncNativeEnvironment(today: DateKey = getLocalDateKey()): Promise<void> {
    const profile = this.snapshot.profile;
    await syncScreenPrivacy(profile?.lock.type === 'pin');
    if (!profile || this.locked) return;

    const mood = deriveSproutMood({
      today,
      dayLogs: this.snapshot.dayLogs,
      companion: this.snapshot.companion,
    });
    await syncWidgetState({
      stage: this.snapshot.companion.stage,
      mood,
      accent: resolveWidgetAccent(profile.theme),
      discreetMode: profile.discreetMode,
    });

    const hasCheckInToday = this.snapshot.dayLogs.some(
      (d) => d.date === today && isCheckInDayLog(d),
    );
    const hasOpenWatchItem = this.snapshot.watchItems.some((w) => w.status === 'open');
    const delivered = await getDeliveredReminderCount();
    let tracker = advanceReminderTracker(this.reminderTracker, today, {
      hasCheckInToday,
      reminderEnabled: profile.reminders.daily.on,
    });
    if (!hasCheckInToday) {
      tracker = reconcileDeliveredReminders(tracker, delivered);
    }
    this.reminderTracker = tracker;
    saveReminderTracker(tracker);

    const plan = computeReminderPlan({
      today,
      profile,
      hasOpenWatchItem,
      tracker,
    });
    await applyNativeReminderPlan(plan);

    if (isNativeAndroid() && this.snapshot.dayLogs.length > 0) {
      const lastAuto = this.snapshot.meta.lastAutoBackupAt;
      const stale = !lastAuto || diffDays(lastAuto.slice(0, 10), today) >= 7;
      if (stale) {
        const nowIso = getLocalStamp();
        const json = await createBackupFile(this.snapshot, {
          appVersion: APP_VERSION,
          exportedAt: nowIso,
        });
        const written = await writeAutoBackupToDocuments(today, json, 4);
        if (written) {
          const nextMeta: BackupMeta = { ...this.snapshot.meta, lastAutoBackupAt: nowIso };
          await this.storage.saveMeta(nextMeta);
          this.snapshot = { ...this.snapshot, meta: nextMeta };
        }
      }
    }
  }

  async restoreBackup(rawText: string, passphrase?: string): Promise<AppSnapshotData> {
    const restored = await restoreBackupFile(rawText, {
      storage: this.storage,
      passphrase,
      nowIso: getLocalStamp(),
    });
    this.snapshot = restored;
    this.locked = false;
    await this.syncTriageState();
    await this.syncForecasts();
    await this.syncCompanionState();
    await this.syncNativeEnvironment();
    return restored;
  }

  async deleteAllData(): Promise<void> {
    await this.storage.clearAll();
    this.snapshot = await this.storage.exportAll();
    this.locked = false;
    this.reminderTracker = defaultReminderTracker();
    saveReminderTracker(this.reminderTracker);
    await syncScreenPrivacy(false);
    await applyNativeReminderPlan({
      cadence: 'none',
      adjustedForQuietHours: false,
      effectiveTime: '20:00',
      droppedToWeekly: false,
      notifications: [],
    });
  }

  downloadFile(filename: string, content: string, mimeType?: string): void {
    void exportAppFile(filename, content, mimeType);
  }
}
