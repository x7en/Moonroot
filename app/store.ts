import { deriveCycles } from '../core/cycles/cycles';
import { classifyEpisodes } from '../core/cycles/episodes';
import { addDays, diffDays } from '../core/model/dates';
import {
  RULESET_VERSION,
  SCHEMA_VERSION,
  type AppSnapshotData,
  type BackupMeta,
  type DateKey,
  type DayLog,
  type Decision,
  type DoctorVisit,
  type MedicineEntry,
  type Profile,
  type Stamp,
  type StandingFlagId,
  type Verdict,
} from '../core/model/types';
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
import { downloadTextFile, getLocalDateKey, getLocalStamp } from '../platform/web';

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
    theme: 'dusk',
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

export class MoonrootStore {
  readonly storage: IndexedDBStorage;
  snapshot: AppSnapshotData;
  locked = false;

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
    }
    return ok;
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.storage.saveProfile(profile);
    this.snapshot = { ...this.snapshot, profile };
  }

  async setPin(pin: string | null): Promise<void> {
    if (!this.snapshot.profile) return;
    const lock = pin ? await createPinLock(pin) : { type: 'none' as const };
    await this.saveProfile({ ...this.snapshot.profile, lock });
  }

  getDayLog(date: DateKey): DayLog | null {
    return this.snapshot.dayLogs.find((d) => d.date === date) ?? null;
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

  async saveDayLog(log: DayLog): Promise<DayLog | null> {
    const previous = this.getDayLog(log.date);
    await this.storage.saveDayLog(log);
    const others = this.snapshot.dayLogs.filter((d) => d.date !== log.date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState(getLocalDateKey(), log.updatedAt);
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
    }
  }

  async deleteDayLog(date: DateKey): Promise<void> {
    await this.storage.deleteDayLog(date);
    this.snapshot = {
      ...this.snapshot,
      dayLogs: this.snapshot.dayLogs.filter((d) => d.date !== date),
    };
    await this.syncTriageState();
  }

  async saveDecision(decision: Decision): Promise<void> {
    await this.storage.saveDecision(decision);
    const others = this.snapshot.decisions.filter((d) => d.id !== decision.id);
    this.snapshot = {
      ...this.snapshot,
      decisions: [...others, decision].sort((a, b) => a.date.localeCompare(b.date)),
    };
    await this.syncTriageState(getLocalDateKey(), decision.at);
  }

  async deleteDecision(id: string): Promise<void> {
    await this.storage.deleteDecision(id);
    this.snapshot = {
      ...this.snapshot,
      decisions: this.snapshot.decisions.filter((d) => d.id !== id),
    };
    await this.syncTriageState();
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

  async restoreBackup(rawText: string, passphrase?: string): Promise<AppSnapshotData> {
    const restored = await restoreBackupFile(rawText, {
      storage: this.storage,
      passphrase,
      nowIso: getLocalStamp(),
    });
    this.snapshot = restored;
    this.locked = false;
    await this.syncTriageState();
    return restored;
  }

  async deleteAllData(): Promise<void> {
    await this.storage.clearAll();
    this.snapshot = await this.storage.exportAll();
    this.locked = false;
  }

  downloadFile(filename: string, content: string, mimeType?: string): void {
    downloadTextFile(filename, content, mimeType);
  }
}
