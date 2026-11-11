import { diffDays, parseDateKey, daysFromCivil } from '../model/dates';
import type {
  BackupMeta,
  BodyLog,
  CompanionStage,
  CompanionState,
  DateKey,
  DayLog,
  RingSource,
  SproutMood,
  Stamp,
} from '../model/types';

export interface StageDefinition {
  stage: CompanionStage;
  name: string;
  minRings: number;
  unlocksSummary: string;
}

export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  {
    stage: 0,
    name: 'Seed',
    minRings: 0,
    unlocksSummary: 'Dusk, Dawn, and High contrast themes are always ready.',
  },
  {
    stage: 1,
    name: 'Sprout',
    minRings: 3,
    unlocksSummary: 'Unlocks plant reactions when you log in Body.',
  },
  {
    stage: 2,
    name: 'Seedling',
    minRings: 10,
    unlocksSummary: 'Unlocks a petal burst when you earn a badge.',
  },
  {
    stage: 3,
    name: 'Young plant',
    minRings: 25,
    unlocksSummary: 'Unlocks the Meadow theme.',
  },
  {
    stage: 4,
    name: 'Budding',
    minRings: 50,
    unlocksSummary: 'Unlocks the Ocean theme.',
  },
  {
    stage: 5,
    name: 'Blooming',
    minRings: 90,
    unlocksSummary: 'Unlocks the Rose theme.',
  },
  {
    stage: 6,
    name: 'Moonflower',
    minRings: 150,
    unlocksSummary: 'Unlocks the Midnight theme and a night-garden backdrop.',
  },
] as const;

export const MAX_RINGS_PER_DAY = 2;

export const ALWAYS_AVAILABLE_THEMES = ['dusk', 'dawn', 'high-contrast'] as const;

export interface ThemeDefinition {
  id: string;
  label: string;
  alwaysAvailable: boolean;
  requiredStage: CompanionStage;
  note: string;
}

export const THEME_CATALOGUE: readonly ThemeDefinition[] = [
  {
    id: 'dusk',
    label: 'Dusk (night)',
    alwaysAvailable: true,
    requiredStage: 0,
    note: 'Always available',
  },
  {
    id: 'dawn',
    label: 'Dawn (day)',
    alwaysAvailable: true,
    requiredStage: 0,
    note: 'Always available',
  },
  {
    id: 'auto',
    label: 'Match phone',
    alwaysAvailable: true,
    requiredStage: 0,
    note: 'Follows device light or dark mode',
  },
  {
    id: 'high-contrast',
    label: 'High contrast',
    alwaysAvailable: true,
    requiredStage: 0,
    note: 'Always available for accessibility',
  },
  {
    id: 'meadow',
    label: 'Meadow',
    alwaysAvailable: false,
    requiredStage: 3,
    note: 'Unlocks at Stage 3 (Young plant)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    alwaysAvailable: false,
    requiredStage: 4,
    note: 'Unlocks at Stage 4 (Budding)',
  },
  {
    id: 'rose',
    label: 'Rose',
    alwaysAvailable: false,
    requiredStage: 5,
    note: 'Unlocks at Stage 5 (Blooming)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    alwaysAvailable: false,
    requiredStage: 6,
    note: 'Unlocks at Stage 6 (Moonflower)',
  },
] as const;

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  { id: 'first-light', name: 'First light', description: 'First check-in' },
  {
    id: 'three-this-week',
    name: 'Three this week',
    description: '3 check-in days in one calendar week',
  },
  {
    id: 'first-full-cycle',
    name: 'First full cycle',
    description: 'First cycle length recorded',
  },
  {
    id: 'record-keeper',
    name: 'Record keeper',
    description: 'First doctor file created',
  },
  {
    id: 'backed-up',
    name: 'Backed up',
    description: 'First backup saved',
  },
  {
    id: 'body-scan',
    name: 'Body scan',
    description: '5 days with a Body log',
  },
  {
    id: 'pattern-found',
    name: 'Pattern found',
    description: 'First lifestyle or lead-in pattern learned',
  },
  {
    id: 'steady-roots',
    name: 'Steady roots',
    description: '30 check-in days in total',
  },
] as const;

/**
 * Calm tap lines that never mention health, bodies, or missed days.
 */
export const TAP_MESSAGES: readonly string[] = [
  'Slow growth is still growth.',
  'Take things at your own pace.',
  'Quiet days are part of growing too.',
  'One small step at a time.',
  'Roots grow gently before leaves open.',
  'Here whenever you want to stop by.',
] as const;

export function pickTapMessage(tapCount: number): string {
  const idx = ((tapCount % TAP_MESSAGES.length) + TAP_MESSAGES.length) % TAP_MESSAGES.length;
  return TAP_MESSAGES[idx] ?? 'Slow growth is still growth.';
}

export function stageForRings(rings: number): CompanionStage {
  const safe = Math.max(0, Math.floor(rings));
  let matched: CompanionStage = 0;
  for (const def of STAGE_DEFINITIONS) {
    if (safe >= def.minRings) {
      matched = def.stage;
    }
  }
  return matched;
}

export function getStageDefinition(stage: CompanionStage): StageDefinition {
  return STAGE_DEFINITIONS.find((s) => s.stage === stage) ?? STAGE_DEFINITIONS[0] as StageDefinition;
}

export function unlockedThemesForStage(
  stage: CompanionStage,
  existingUnlocked: readonly string[] = [],
): string[] {
  const set = new Set<string>([...ALWAYS_AVAILABLE_THEMES, ...existingUnlocked]);
  for (const def of THEME_CATALOGUE) {
    if (!def.alwaysAvailable && stage >= def.requiredStage) {
      set.add(def.id);
    }
  }
  return [...set];
}

export function canUseTheme(themeId: string, companion: Pick<CompanionState, 'stage' | 'unlocked'>): boolean {
  const def = THEME_CATALOGUE.find((t) => t.id === themeId);
  if (!def) return false;
  if (def.alwaysAvailable) return true;
  return companion.stage >= def.requiredStage || companion.unlocked.includes(themeId);
}

/**
 * Pure Gregorian weekday calculation without reading system Date:
 * 1970-01-01 (civil day 0) was Thursday (4). Returns 0 = Sunday .. 6 = Saturday.
 */
export function weekdayFromDateKey(date: DateKey): number {
  const { year, month, day } = parseDateKey(date);
  const civil = daysFromCivil(year, month, day);
  return (((civil + 4) % 7) + 7) % 7;
}

export function extractLocalHour(nowStamp: Stamp): number {
  const raw = Number(nowStamp.slice(11, 13));
  return Number.isFinite(raw) ? raw : 0;
}

export function isSundayEvening(today: DateKey, nowStamp: Stamp): boolean {
  return weekdayFromDateKey(today) === 0 && extractLocalHour(nowStamp) >= 17;
}

export function isCheckInDayLog(log: DayLog): boolean {
  if (log.filledFrom === 'approximate') return false;
  return (
    log.flow !== null ||
    log.pain !== undefined ||
    log.symptoms.length > 0 ||
    log.danger.length > 0 ||
    log.dangerAnswered === true ||
    log.note.trim().length > 0
  );
}

export function isPopulatedBodyLog(log: BodyLog): boolean {
  return Boolean(
    log.sleep ||
      log.water ||
      log.meals ||
      log.stool ||
      log.exercise ||
      log.energy !== undefined ||
      log.skin,
  );
}

function getLatestDate(a: DateKey | null | undefined, b: DateKey | null | undefined): DateKey | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

export function awardCompanionRing(
  prev: CompanionState,
  source: RingSource,
  actionDate: DateKey,
): {
  next: CompanionState;
  awarded: 0 | 1;
  stageChanged: boolean;
  newlyUnlockedThemes: string[];
} {
  const sameDay = prev.dailyRings?.date === actionDate;
  const existingSources = sameDay && prev.dailyRings ? prev.dailyRings.sources : [];

  const prevCheckIn = prev.lastCheckInDate ?? null;
  const returningFromSleepy =
    source === 'checkin' &&
    prevCheckIn !== null &&
    actionDate > prevCheckIn &&
    diffDays(prevCheckIn, actionDate) >= 3;

  const nextCheckInDate =
    source === 'checkin' ? getLatestDate(prevCheckIn, actionDate) : prevCheckIn;

  const nextWelcomeDate = returningFromSleepy
    ? actionDate
    : prev.welcomeDate === actionDate
      ? prev.welcomeDate
      : null;

  const alreadyCountedSource = existingSources.includes(source);
  const reachedCap = existingSources.length >= MAX_RINGS_PER_DAY;
  const awarded: 0 | 1 = alreadyCountedSource || reachedCap ? 0 : 1;

  const nextRings = prev.rings + awarded;
  const computedStage = stageForRings(nextRings);
  const nextStage: CompanionStage =
    computedStage > prev.stage ? computedStage : prev.stage;
  const stageChanged = nextStage > prev.stage;

  const nextUnlocked = unlockedThemesForStage(nextStage, prev.unlocked);
  const newlyUnlockedThemes = nextUnlocked.filter((t) => !prev.unlocked.includes(t));

  const nextSources =
    awarded === 1 ? [...existingSources, source] : existingSources;

  const next: CompanionState = {
    ...prev,
    rings: nextRings,
    stage: nextStage,
    unlocked: nextUnlocked,
    badges: [...prev.badges],
    lastRingDate: awarded === 1 ? getLatestDate(prev.lastRingDate, actionDate) : prev.lastRingDate,
    dailyRings: {
      date: actionDate,
      sources: nextSources,
    },
    lastCheckInDate: nextCheckInDate,
    welcomeDate: nextWelcomeDate,
  };

  return {
    next,
    awarded,
    stageChanged,
    newlyUnlockedThemes,
  };
}

function weekBucketId(date: DateKey): number {
  const { year, month, day } = parseDateKey(date);
  const civil = daysFromCivil(year, month, day);
  // Monday-start week bucket
  const mondayOffset = (((civil + 3) % 7) + 7) % 7;
  return civil - mondayOffset;
}

export function reconcileCompanionState(input: {
  companion: CompanionState;
  today: DateKey;
  dayLogs: readonly DayLog[];
  bodyLogs: readonly BodyLog[];
  completedCycleCount: number;
  hasPattern: boolean;
  meta: Pick<BackupMeta, 'lastExportAt' | 'lastAutoBackupAt'> & Partial<BackupMeta>;
  doctorFileCreated?: boolean;
}): CompanionState {
  const prev = input.companion;
  const badgeSet = new Set<string>(prev.badges);

  const checkInDates = new Set<DateKey>();
  for (const log of input.dayLogs) {
    if (isCheckInDayLog(log)) {
      checkInDates.add(log.date);
    }
  }
  if (prev.lastCheckInDate) {
    checkInDates.add(prev.lastCheckInDate);
  }

  if (checkInDates.size >= 1) {
    badgeSet.add('first-light');
  }
  if (checkInDates.size >= 30) {
    badgeSet.add('steady-roots');
  }

  const weekCounts = new Map<number, number>();
  for (const d of checkInDates) {
    const bucket = weekBucketId(d);
    weekCounts.set(bucket, (weekCounts.get(bucket) ?? 0) + 1);
  }
  for (const cnt of weekCounts.values()) {
    if (cnt >= 3) {
      badgeSet.add('three-this-week');
      break;
    }
  }

  if (input.completedCycleCount >= 1) {
    badgeSet.add('first-full-cycle');
  }

  const doctorCreated = Boolean(input.doctorFileCreated ?? prev.doctorFileCreated);
  if (doctorCreated) {
    badgeSet.add('record-keeper');
  }

  if (input.meta.lastExportAt !== null || input.meta.lastAutoBackupAt !== null) {
    badgeSet.add('backed-up');
  }

  const bodyDays = new Set<DateKey>();
  for (const b of input.bodyLogs) {
    if (isPopulatedBodyLog(b)) {
      bodyDays.add(b.date);
    }
  }
  if (bodyDays.size >= 5) {
    badgeSet.add('body-scan');
  }

  if (input.hasPattern) {
    badgeSet.add('pattern-found');
  }

  const computedStage = stageForRings(prev.rings);
  const nextStage: CompanionStage =
    computedStage > prev.stage ? computedStage : prev.stage;
  const nextUnlocked = unlockedThemesForStage(nextStage, prev.unlocked);

  let latestCheckIn = prev.lastCheckInDate ?? null;
  for (const d of checkInDates) {
    latestCheckIn = getLatestDate(latestCheckIn, d);
  }

  return {
    ...prev,
    rings: prev.rings,
    stage: nextStage,
    unlocked: nextUnlocked,
    badges: [...badgeSet],
    lastCheckInDate: latestCheckIn,
    doctorFileCreated: doctorCreated || undefined,
  };
}

export function deriveSproutMood(input: {
  today: DateKey;
  dayLogs: readonly DayLog[];
  companion: Pick<CompanionState, 'lastCheckInDate' | 'welcomeDate'>;
}): SproutMood {
  const checkedInToday = input.dayLogs.some(
    (d) => d.date === input.today && (isCheckInDayLog(d) || d.flow !== null),
  );
  if (checkedInToday && input.companion.welcomeDate === input.today) {
    return 'welcome';
  }
  if (checkedInToday) {
    return 'bright';
  }

  let latestPast: DateKey | null = null;
  for (const d of input.dayLogs) {
    if (d.date < input.today && (isCheckInDayLog(d) || d.flow !== null)) {
      latestPast = getLatestDate(latestPast, d.date);
    }
  }
  if (input.companion.lastCheckInDate && input.companion.lastCheckInDate < input.today) {
    latestPast = getLatestDate(latestPast, input.companion.lastCheckInDate);
  }

  if (latestPast !== null && diffDays(latestPast, input.today) >= 3) {
    return 'sleepy';
  }

  return 'calm';
}

export interface WeeklyReviewSummary {
  daysCheckedInThisWeek: number;
  patternText: string;
  confidenceScore: number;
  confidenceDelta: number | null;
  alreadyOpenedToday: boolean;
}

export function buildWeeklyReviewSummary(input: {
  today: DateKey;
  dayLogs: readonly DayLog[];
  companion: Pick<CompanionState, 'lastWeeklyReviewDate' | 'lastWeeklyConfidence'>;
  confidenceScore: number;
  patternText: string | null;
}): WeeklyReviewSummary {
  const currentBucket = weekBucketId(input.today);
  const weekDates = new Set<DateKey>();
  for (const d of input.dayLogs) {
    if (weekBucketId(d.date) === currentBucket && (isCheckInDayLog(d) || d.flow !== null)) {
      weekDates.add(d.date);
    }
  }

  const prevConf = input.companion.lastWeeklyConfidence;
  const confidenceDelta =
    prevConf !== null && prevConf !== undefined ? input.confidenceScore - prevConf : null;

  return {
    daysCheckedInThisWeek: weekDates.size,
    patternText:
      input.patternText ?? 'Nothing new yet. Patterns appear after more days are logged.',
    confidenceScore: input.confidenceScore,
    confidenceDelta,
    alreadyOpenedToday: input.companion.lastWeeklyReviewDate === input.today,
  };
}
