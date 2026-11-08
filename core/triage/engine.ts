import { classifyEpisodes } from '../cycles/episodes';
import { deriveCycles } from '../cycles/cycles';
import {
  addDays,
  diffDays,
  isAdultSexualHealthAllowed,
  isUnder18,
  mayContainOestrogen,
  parseDateKey,
} from '../model/dates';
import {
  RULESET_VERSION,
  type DangerSign,
  type DateKey,
  type DayLog,
  type Decision,
  type DoctorVisit,
  type Flow,
  type Level,
  type MedicineEntry,
  type OrangeRuleId,
  type PainSite,
  type Profile,
  type RuleId,
  type Stamp,
  type StandingFlagId,
  type Verdict,
  type WatchItem,
} from '../model/types';
import {
  isDangerScreenRequired,
  isNeutralPregnancyQuestionAllowed,
} from './flowEngine';
import {
  OPEN_EVENT_REPLACES_GREEN_TEXT,
  RULES_TABLE,
  UNDER_18_GUIDANCE_ADDON,
  type RuleExampleSnapshot,
  type TriageRuleDefinition,
} from './rules';
import {
  ECTOPIC_PAIN_SITES,
  LOWER_BELLY_PAIN_SITES,
  ONE_SIDED_PAIN_SITES,
  THRESHOLDS,
} from './thresholds';
import { createWatchItems, hoursBetweenStamps } from './watchList';

export interface TriageEvaluationInput {
  today: DateKey;
  nowStamp?: Stamp;
  profile: Profile;
  dayLog: DayLog;
  recentLogs: readonly DayLog[];
  decisions: readonly Decision[];
  medicines: readonly MedicineEntry[];
  watchItems: readonly WatchItem[];
  existingVerdicts: readonly Verdict[];
  visits: readonly DoctorVisit[];
  derived?: RuleExampleSnapshot['derived'];
}

export interface FiredEventRuleSummary {
  ruleId: OrangeRuleId;
  triggerKey: string;
  triggerDate: DateKey;
  title: string;
  reason: string;
  message: string;
}

export interface StandingFlagSummary {
  ruleId: StandingFlagId;
  title: string;
  reason: string;
  message: string;
  dueForSoftPrompt: boolean;
}

export interface TodayVerdictResult {
  level: Level | 'incomplete' | 'open-event-notice';
  ruleIds: RuleId[];
  title: string;
  reasons: string[];
  message: string;
  missingRequired: string[];
  missingCount: number;
  cautiousNeutralPregnancyHold: boolean;
  actionPrepend?: string;
}

export interface TriageEvaluationResult {
  today: TodayVerdictResult;
  firedTodayRules: RuleId[];
  firedEventRules: FiredEventRuleSummary[];
  openEvents: Verdict[];
  newEvents: Verdict[];
  overallLevel: Level | 'incomplete';
  standingFlags: StandingFlagSummary[];
  proposedWatchItems: WatchItem[];
  closedByVisitIds: string[];
}

const RULE_BY_ID = new Map<RuleId, TriageRuleDefinition>(
  RULES_TABLE.map((r) => [r.id, r]),
);

const LEVEL_RANK: Record<Level, number> = {
  green: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

const BLEEDING_FLOWS = new Set<Flow>([
  'spotting',
  'light',
  'medium',
  'heavy',
  'unsure',
]);

const PERIOD_FLOWS = new Set<Flow>(['light', 'medium', 'heavy']);
const DOCTOR_TAIL = 'If you are worried, see a doctor even if this looks fine.';

function ruleMeta(id: RuleId): TriageRuleDefinition {
  const found = RULE_BY_ID.get(id);
  if (!found) {
    throw new Error(`Missing rule metadata: ${id}`);
  }
  return found;
}

function hasAnyDanger(
  danger: readonly DangerSign[],
  targets: readonly DangerSign[],
): boolean {
  return targets.some((t) => danger.includes(t));
}

function hasAnySite(
  sites: readonly PainSite[],
  targets: readonly PainSite[],
): boolean {
  return targets.some((t) => sites.includes(t));
}

function isFeverAtLeast(
  fever: DayLog['fever'],
  minCelsius: number,
): boolean {
  if (!fever) return false;
  if (fever.c !== undefined) return fever.c >= minCelsius;
  return fever.felt === true;
}

export function isAdolescentCycleBand(
  profile: Pick<Profile, 'birthYear' | 'menarcheAge'>,
  today: DateKey,
): boolean {
  if (profile.birthYear === null || profile.menarcheAge === null) {
    return false;
  }
  const age = parseDateKey(today).year - profile.birthYear;
  return age - profile.menarcheAge < THRESHOLDS.POST_MENARCHE_ADOLESCENT_YEARS_LT;
}

function computeMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }
  const a = sorted[mid - 1] ?? 0;
  const b = sorted[mid] ?? 0;
  return (a + b) / 2;
}

function appendUniqueSentence(base: string, addon: string): string {
  if (base.includes(addon)) return base;
  return `${base.trim()} ${addon}`.trim();
}

function ensureEndsWithDoctorTail(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith(DOCTOR_TAIL)) return trimmed;
  return `${trimmed.replace(DOCTOR_TAIL, '').trim()} ${DOCTOR_TAIL}`.trim();
}

function stripDoctorTail(text: string): string {
  return text.replace(DOCTOR_TAIL, '').trim();
}

export function evaluateTriage(
  input: TriageEvaluationInput,
): TriageEvaluationResult {
  const {
    today,
    profile,
    dayLog,
    recentLogs,
    decisions,
    medicines,
    watchItems,
    existingVerdicts,
    visits,
    derived,
  } = input;
  const nowStamp: Stamp = input.nowStamp ?? `${today}T12:00:00+00:00`;

  // Merge logs up to today so today's edits always supersede stale copies
  const byDate = new Map<DateKey, DayLog>();
  for (const log of recentLogs) {
    if (log.date <= today) {
      byDate.set(log.date, log);
    }
  }
  if (dayLog.date <= today) {
    byDate.set(dayLog.date, dayLog);
  }
  const mergedLogs = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const classification = classifyEpisodes(mergedLogs, decisions, today);
  const cycleSummary = deriveCycles(classification, decisions, today);

  const activeHormones = medicines.filter(
    (m) =>
      m.category === 'hormone' &&
      (m.startDate ?? m.date) <= today &&
      (m.stopDate === null || m.stopDate === undefined || m.stopDate >= today),
  );
  const activeHormoneNames = activeHormones.map(
    (m) => m.genericName ?? m.nameShown,
  );
  const oestrogenPossible = mayContainOestrogen(profile, activeHormoneNames);
  const onAnyHormone = profile.onHormones === true || activeHormones.length > 0;

  const under18 = isUnder18(profile, today);
  const adultIntimacyAllowed = isAdultSexualHealthAllowed(profile, today);
  const neutralPregAllowed = isNeutralPregnancyQuestionAllowed(profile);
  const cycleUpperLimit = isAdolescentCycleBand(profile, today)
    ? THRESHOLDS.CYCLE_LONG_ADOLESCENT_DAYS_GT
    : THRESHOLDS.CYCLE_LONG_ADULT_DAYS_GT;

  const activeCycleLengths =
    derived?.cycleLengths ?? cycleSummary.activeCycleLengths;
  const daysSinceLastPeriodStart =
    derived?.daysSinceLastPeriodStart !== undefined
      ? derived.daysSinceLastPeriodStart
      : cycleSummary.daysSinceLastPeriodStart;

  const periodsAfterBaseline =
    cycleSummary.newBaselineDate === null
      ? classification.periodEpisodes
      : classification.periodEpisodes.filter(
          (p) => p.startDate >= (cycleSummary.newBaselineDate as string),
        );

  const latestPeriod = periodsAfterBaseline[periodsAfterBaseline.length - 1];
  const lastPeriodStartAll =
    classification.periodEpisodes[classification.periodEpisodes.length - 1]
      ?.startDate ?? null;

  // Intimacy & pregnancy tracking since last period start
  const windowStart90 = addDays(today, -THRESHOLDS.BLEEDING_AFTER_SEX_WINDOW_DAYS);
  const logsSinceLastPeriod = lastPeriodStartAll
    ? mergedLogs.filter((l) => l.date >= lastPeriodStartAll)
    : mergedLogs;

  let latestRiskDate: DateKey | null = null;
  let latestNegTestDate: DateKey | null = null;
  for (const log of logsSinceLastPeriod) {
    if (
      adultIntimacyAllowed &&
      (log.intimacy?.event === 'unprotected' || log.intimacy?.event === 'unsure')
    ) {
      latestRiskDate = log.date;
    }
    if (log.test?.kind === 'pregnancy' && log.test.result === 'negative') {
      latestNegTestDate = log.date;
    }
  }

  const daysSinceLastRiskEvent =
    derived?.daysSinceLastRiskEvent !== undefined
      ? derived.daysSinceLastRiskEvent
      : latestRiskDate
        ? diffDays(latestRiskDate, today)
        : undefined;
  const daysSinceLatestNegativeTest =
    derived?.daysSinceLatestNegativeTest !== undefined
      ? derived.daysSinceLatestNegativeTest
      : latestNegTestDate
        ? diffDays(latestNegTestDate, today)
        : undefined;
  const hasNegativeTestInLast14Days =
    derived?.hasNegativeTestInLast14Days !== undefined
      ? derived.hasNegativeTestInLast14Days
      : daysSinceLatestNegativeTest !== undefined &&
        daysSinceLatestNegativeTest < THRESHOLDS.PREG_TEST_RECENT_NEGATIVE_DAYS;

  const sexualHealthActiveForPreg =
    profile.sexualHealthQuestions !== 'off' && profile.intimacy !== 'none';
  const hasPositiveTestToday = dayLog.test?.result === 'positive';
  const hasRiskSinceLastPeriod =
    latestRiskDate !== null || derived?.daysSinceLastRiskEvent !== undefined;
  const isPregnancyPossible =
    hasPositiveTestToday ||
    (sexualHealthActiveForPreg &&
      dayLog.pregnancyChance !== 'no' &&
      (dayLog.pregnancyChance === 'yes' || hasRiskSinceLastPeriod));

  // Today fields
  const flow = dayLog.flow;
  const isBleedingToday = flow !== null && BLEEDING_FLOWS.has(flow);
  const isBleedingOrBrown =
    isBleedingToday ||
    dayLog.colour === 'brown' ||
    dayLog.discharge === 'brown';
  const painLevel = dayLog.pain?.level ?? 0;
  const painSites = dayLog.pain?.sites ?? [];
  const danger = dayLog.danger ?? [];
  const isTamponOrCup =
    dayLog.protection === 'tampon' || dayLog.protection === 'cup';
  const hasLowerBellySite = hasAnySite(painSites, LOWER_BELLY_PAIN_SITES);
  const hasOneSidedSite = hasAnySite(painSites, ONE_SIDED_PAIN_SITES);
  const hasEctopicSite = hasAnySite(painSites, ECTOPIC_PAIN_SITES);

  // Bleeding after sex counts in last 90 days (adult-gated)
  let bleedingAfterSexIn90Days = 0;
  let bleedingAfterSexWithPainIn90Days = 0;
  let latestBleedingAfterSexDate: DateKey = today;
  if (adultIntimacyAllowed) {
    for (const log of mergedLogs) {
      if (log.date < windowStart90) continue;
      if (log.intimacy?.bleedingAfter) {
        bleedingAfterSexIn90Days += 1;
        latestBleedingAfterSexDate = log.date;
        if (log.intimacy.painDuring || (log.pain?.level ?? 0) >= THRESHOLDS.ANY_PAIN_MIN) {
          bleedingAfterSexWithPainIn90Days += 1;
        }
      }
    }
  }
  const effectiveBleedingAfterSex90 = adultIntimacyAllowed
    ? (derived?.bleedingAfterSexIn90Days ?? bleedingAfterSexIn90Days)
    : 0;
  const effectiveBleedingAfterSexPain90 = adultIntimacyAllowed
    ? (derived?.bleedingAfterSexWithPainIn90Days ??
      bleedingAfterSexWithPainIn90Days)
    : 0;

  // -------------------------------------------------------------------------
  // 1. Evaluate TODAY rules (RED-01..11, ORG-14, YEL-01..09, GRN-02..04)
  // -------------------------------------------------------------------------
  const firedRed: RuleId[] = [];
  const firedTodayOrange: RuleId[] = [];
  const firedYellow: RuleId[] = [];
  const firedSupportingGreen: RuleId[] = [];

  if (dayLog.soakedPerHour === true) {
    firedRed.push('RED-01');
  }
  if (
    (flow === 'medium' || flow === 'heavy') &&
    hasAnyDanger(danger, ['dizzy', 'fainted', 'short-of-breath', 'chest-pain'])
  ) {
    firedRed.push('RED-02');
  }
  if (
    painLevel >= THRESHOLDS.SEVERE_PAIN_MIN &&
    dayLog.pain?.sudden === true &&
    hasAnyDanger(danger, ['dizzy', 'fainted', 'nausea', 'very-pale'])
  ) {
    firedRed.push('RED-03');
  }

  const red04PhysicalSign =
    painLevel >= THRESHOLDS.ANY_PAIN_MIN &&
    (hasEctopicSite || isBleedingOrBrown);
  if (red04PhysicalSign && isPregnancyPossible) {
    firedRed.push('RED-04');
  }
  if (
    hasPositiveTestToday &&
    (isBleedingToday || painLevel >= THRESHOLDS.ANY_PAIN_MIN)
  ) {
    firedRed.push('RED-05');
  }
  if (
    isTamponOrCup &&
    (isFeverAtLeast(dayLog.fever, THRESHOLDS.TSS_FEVER_C_MIN) ||
      hasAnyDanger(danger, [
        'sunburn-rash',
        'vomiting',
        'diarrhoea',
        'dizzy',
        'fainted',
        'confused',
      ]))
  ) {
    firedRed.push('RED-06');
  }
  if (
    isFeverAtLeast(dayLog.fever, THRESHOLDS.INFECTION_FEVER_C_MIN) &&
    ((painLevel >= THRESHOLDS.ANY_PAIN_MIN && hasLowerBellySite) ||
      dayLog.discharge === 'odour' ||
      dayLog.discharge === 'yellow-green')
  ) {
    firedRed.push('RED-07');
  }
  if (
    painLevel >= THRESHOLDS.SEVERE_PAIN_MIN &&
    (dayLog.pain?.reliefHelped === 'no' || dayLog.pain?.reliefHelped === 'unsure')
  ) {
    firedRed.push('RED-08');
  }
  if (
    hasAnyDanger(danger, ['fainted', 'chest-pain', 'short-of-breath', 'confused'])
  ) {
    firedRed.push('RED-09');
  }
  if (
    painLevel >= THRESHOLDS.PAIN_FOLLOWUP_MIN &&
    dayLog.pain?.sudden === true &&
    hasOneSidedSite &&
    hasAnyDanger(danger, ['vomiting'])
  ) {
    firedRed.push('RED-10');
  }
  if (
    oestrogenPossible &&
    hasAnyDanger(danger, [
      'leg-pain-or-swelling',
      'severe-headache',
      'vision-change',
    ])
  ) {
    firedRed.push('RED-11');
  }

  // ORG-14 (the ONLY Today Orange rule; upper limit removed for Law 1)
  if (
    painLevel >= THRESHOLDS.PAIN_FOLLOWUP_MIN &&
    flow === 'none' &&
    hasAnyDanger(danger, ['dizzy', 'nausea', 'very-pale'])
  ) {
    firedTodayOrange.push('ORG-14');
  }

  // Yellow Today rules (YEL-01..09)
  if (
    classification.currentSpottingStreakDays >= THRESHOLDS.SPOTTING_WATCH_DAYS_MIN &&
    classification.currentSpottingStreakDays <= THRESHOLDS.SPOTTING_WATCH_DAYS_MAX
  ) {
    firedYellow.push('YEL-01');
  }
  if (painLevel >= THRESHOLDS.PAIN_FOLLOWUP_MIN && flow === 'none') {
    firedYellow.push('YEL-02');
  }

  const medianCycle =
    derived?.medianCycleLength ??
    computeMedian(activeCycleLengths) ??
    THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS;
  const yel03CycleMin = Math.min(
    THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS,
    medianCycle + THRESHOLDS.PREG_TEST_MEDIAN_OFFSET_DAYS,
  );
  if (
    sexualHealthActiveForPreg &&
    dayLog.pregnancyChance !== 'no' &&
    daysSinceLastRiskEvent !== undefined &&
    daysSinceLastRiskEvent >= THRESHOLDS.PREG_TEST_RISK_DAYS_MIN &&
    daysSinceLastPeriodStart !== null &&
    daysSinceLastPeriodStart >= yel03CycleMin &&
    !hasNegativeTestInLast14Days
  ) {
    firedYellow.push('YEL-03');
  }

  const latestCycleLength =
    activeCycleLengths.length > 0
      ? activeCycleLengths[activeCycleLengths.length - 1]
      : undefined;
  if (
    latestCycleLength !== undefined &&
    (latestCycleLength < THRESHOLDS.CYCLE_SHORT_DAYS_LT ||
      latestCycleLength > cycleUpperLimit)
  ) {
    firedYellow.push('YEL-04');
  }

  const todayIntimacyPain =
    dayLog.intimacy?.painDuring === true ||
    painLevel >= THRESHOLDS.ANY_PAIN_MIN;
  if (
    adultIntimacyAllowed &&
    dayLog.intimacy?.bleedingAfter === true &&
    !todayIntimacyPain &&
    effectiveBleedingAfterSex90 < THRESHOLDS.BLEEDING_AFTER_SEX_COUNT_MIN
  ) {
    firedYellow.push('YEL-05');
  }

  const pregnancyCouldApplyForRetest =
    sexualHealthActiveForPreg &&
    dayLog.pregnancyChance !== 'no' &&
    (dayLog.pregnancyChance === 'yes' ||
      hasRiskSinceLastPeriod ||
      derived?.daysSinceLatestNegativeTest !== undefined);
  if (
    pregnancyCouldApplyForRetest &&
    daysSinceLatestNegativeTest !== undefined &&
    daysSinceLatestNegativeTest >= THRESHOLDS.NEGATIVE_TEST_RETEST_DAYS_MIN &&
    (!flow || !PERIOD_FLOWS.has(flow))
  ) {
    firedYellow.push('YEL-06');
  }

  if (dayLog.changeEvery === '2-3h' || dayLog.clots === 'small') {
    firedYellow.push('YEL-07');
  }
  if (dayLog.discharge === 'odour' || dayLog.discharge === 'yellow-green') {
    firedYellow.push('YEL-08');
  }
  if (
    adultIntimacyAllowed &&
    dayLog.intimacy?.painDuring === true &&
    dayLog.intimacy?.bleedingAfter !== true
  ) {
    firedYellow.push('YEL-09');
  }

  // Supporting Green rules (GRN-02..04)
  if (derived?.inPossibleWindow === true) {
    firedSupportingGreen.push('GRN-02');
  }
  if (
    derived?.matchesLeadInPattern === true &&
    (flow === 'spotting' || painLevel >= 3)
  ) {
    firedSupportingGreen.push('GRN-03');
  }
  if (
    dayLog.context &&
    (dayLog.context.stress !== undefined ||
      dayLog.context.illness === true ||
      dayLog.context.travel === true ||
      dayLog.context.weightChange === true ||
      dayLog.context.medicationChange === true ||
      dayLog.context.emergencyContraception === true)
  ) {
    firedSupportingGreen.push('GRN-04');
  }

  // -------------------------------------------------------------------------
  // 2. Evaluate EVENT rules (ORG-01..13, ORG-15)
  // -------------------------------------------------------------------------
  const firedEventRules: FiredEventRuleSummary[] = [];
  const pushEvent = (ruleId: OrangeRuleId, triggerDate: DateKey) => {
    const meta = ruleMeta(ruleId);
    let message = meta.wordsShown;
    if (ruleId === 'ORG-03' && onAnyHormone && meta.hormoneNote) {
      message = appendUniqueSentence(stripDoctorTail(message), meta.hormoneNote);
    }
    if (under18) {
      message = appendUniqueSentence(
        stripDoctorTail(message),
        UNDER_18_GUIDANCE_ADDON,
      );
    }
    message = ensureEndsWithDoctorTail(message);
    firedEventRules.push({
      ruleId,
      triggerKey: `${ruleId}:${triggerDate}`,
      triggerDate,
      title: meta.title,
      reason: meta.reasonTemplate,
      message,
    });
  };

  // ORG-01: > 7 known bleeding days in one period
  if (derived?.currentEpisodeBleedingDays !== undefined) {
    if (
      derived.currentEpisodeBleedingDays >
      THRESHOLDS.PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE
    ) {
      pushEvent('ORG-01', today);
    }
  } else {
    const recentProlonged = classification.periodEpisodes.filter(
      (ep) =>
        ep.endDate >= windowStart90 &&
        ep.knownBleedingDays > THRESHOLDS.PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE,
    );
    const ep = recentProlonged[recentProlonged.length - 1];
    if (ep) {
      pushEvent('ORG-01', ep.startDate);
    }
  }

  // ORG-02: heavy bleeding criteria in one period (or logged directly on today)
  const todayHasHeavySigns =
    dayLog.changeEvery === 'under-2h' ||
    dayLog.soakedPerHour === true ||
    dayLog.doubleProtection === true ||
    dayLog.flooding === true ||
    dayLog.clots === 'large';
  const currentEpisode =
    classification.episodes.find(
      (ep) => ep.firstDate <= today && (ep.isOpen || ep.lastDate >= addDays(today, -1)),
    ) ?? null;
  const epHeavySigns =
    currentEpisode !== null &&
    (currentEpisode.anySoakedPerHour ||
      currentEpisode.anyUnder2h ||
      currentEpisode.anyDoubleProtection ||
      currentEpisode.anyFlooding ||
      currentEpisode.anyLargeClots);
  if (todayHasHeavySigns || epHeavySigns) {
    pushEvent('ORG-02', currentEpisode?.startDate ?? today);
  }

  // ORG-03: >= 90 days since last period start (still active after hormone change)
  if (
    daysSinceLastPeriodStart !== null &&
    daysSinceLastPeriodStart >= THRESHOLDS.AMENORRHEA_DAYS_MIN
  ) {
    pushEvent('ORG-03', lastPeriodStartAll ?? today);
  }

  // ORG-04: 2 of last 3 cycles < 21 days
  const last3Cycles = activeCycleLengths.slice(-THRESHOLDS.RECENT_CYCLES_WINDOW);
  if (
    last3Cycles.filter((l) => l < THRESHOLDS.CYCLE_SHORT_DAYS_LT).length >=
    THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT
  ) {
    const latestCycleEnd =
      cycleSummary.recentValidCyclesAfterBaseline[
        cycleSummary.recentValidCyclesAfterBaseline.length - 1
      ]?.nextStartDate ?? today;
    pushEvent('ORG-04', latestCycleEnd);
  }

  // ORG-05: 2 of last 3 cycles > age upper limit
  if (
    last3Cycles.filter((l) => l > cycleUpperLimit).length >=
    THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT
  ) {
    const latestCycleEnd =
      cycleSummary.recentValidCyclesAfterBaseline[
        cycleSummary.recentValidCyclesAfterBaseline.length - 1
      ]?.nextStartDate ?? today;
    pushEvent('ORG-05', latestCycleEnd);
  }

  // ORG-06: bleeding after sex >= 2 in 90d or 1x with pain (adult only)
  if (
    adultIntimacyAllowed &&
    (effectiveBleedingAfterSexPain90 >= 1 ||
      effectiveBleedingAfterSex90 >= THRESHOLDS.BLEEDING_AFTER_SEX_COUNT_MIN)
  ) {
    pushEvent('ORG-06', latestBleedingAfterSexDate);
  }

  // ORG-07: >= 2 in-between spotting events in 90 days
  const recentInBetween = classification.inBetweenSpotting.filter(
    (s) => s.lastDate >= windowStart90,
  );
  const inBetweenCount90 =
    derived?.intermenstrualSpottingIn90Days ?? recentInBetween.length;
  if (inBetweenCount90 >= THRESHOLDS.INTERMENSTRUAL_COUNT_MIN) {
    const lastSpot = recentInBetween[recentInBetween.length - 1];
    pushEvent('ORG-07', lastSpot?.lastDate ?? today);
  }

  // ORG-08: spotting 7 or more days in a row
  const maxRecentSpotRun = Math.max(
    classification.currentSpottingStreakDays,
    ...classification.episodes
      .filter((e) => e.lastDate >= windowStart90)
      .map((e) => e.maxConsecutiveSpottingDays),
  );
  if (maxRecentSpotRun >= THRESHOLDS.SPOTTING_PROLONGED_DAYS_MIN) {
    const spotEp = classification.episodes.find(
      (e) =>
        e.lastDate >= windowStart90 &&
        e.maxConsecutiveSpottingDays >= THRESHOLDS.SPOTTING_PROLONGED_DAYS_MIN,
    );
    pushEvent('ORG-08', spotEp?.firstDate ?? today);
  }

  // ORG-09: severe pain (>= 7 or stoppedActivities) in 2 of last 3 periods
  const last3Periods = periodsAfterBaseline.slice(-THRESHOLDS.RECENT_CYCLES_WINDOW);
  const derivedPainfulCount = derived?.painfulEpisodesInLast3;
  const computedPainfulCount = last3Periods.filter(
    (p) =>
      p.maxPain >= THRESHOLDS.SEVERE_EPISODE_PAIN_MIN ||
      p.anyStoppedActivities,
  ).length;
  if (
    (derivedPainfulCount ?? computedPainfulCount) >=
    THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT
  ) {
    pushEvent('ORG-09', latestPeriod?.startDate ?? today);
  }

  // ORG-10: >= 2 heavy flow days with unusual-tiredness, very-pale, or breathless-on-effort
  const anemiaSigns: readonly DangerSign[] = [
    'unusual-tiredness',
    'very-pale',
    'breathless-on-effort',
  ];
  const recentHeavyEpisodeLogs = currentEpisode
    ? currentEpisode.heavyFlowDays
    : mergedLogs.filter((l) => l.date >= addDays(today, -14) && l.flow === 'heavy')
        .length;
  const episodeHasAnemiaSign =
    hasAnyDanger(danger, anemiaSigns) ||
    (currentEpisode !== null &&
      hasAnyDanger(currentEpisode.dangerSignsSeen, anemiaSigns));
  if (
    recentHeavyEpisodeLogs >= THRESHOLDS.HEAVY_FLOW_ANEMIA_DAYS_MIN &&
    episodeHasAnemiaSign
  ) {
    pushEvent('ORG-10', currentEpisode?.startDate ?? today);
  }

  // ORG-11: positive pregnancy test with no pain or bleeding
  if (
    hasPositiveTestToday &&
    !isBleedingToday &&
    painLevel === 0
  ) {
    pushEvent('ORG-11', today);
  }

  // ORG-12: back-passage blood outside period OR > 2 days
  const backPassageDaysInWindow = mergedLogs.filter(
    (l) =>
      l.date >= addDays(today, -14) && l.stoolBlood === 'back-passage',
  ).length;
  const onPeriodToday =
    (flow !== null && PERIOD_FLOWS.has(flow)) ||
    (currentEpisode !== null &&
      currentEpisode.kind === 'period' &&
      currentEpisode.isOpen &&
      flow !== 'none');
  if (
    (dayLog.stoolBlood === 'back-passage' && !onPeriodToday) ||
    backPassageDaysInWindow > THRESHOLDS.STOOL_BLOOD_DAYS_GT
  ) {
    pushEvent('ORG-12', today);
  }

  // ORG-13: 14+ days since negative pregnancy test with no period
  if (
    pregnancyCouldApplyForRetest &&
    daysSinceLatestNegativeTest !== undefined &&
    daysSinceLatestNegativeTest >= THRESHOLDS.NEGATIVE_TEST_DOCTOR_DAYS_MIN
  ) {
    pushEvent('ORG-13', latestNegTestDate ?? today);
  }

  // ORG-15: discharge still present at >= 72h check
  for (const w of watchItems) {
    if (w.status === 'closed') continue;
    const dischargeYes = w.checks.some(
      (c) => c.key === 'discharge-still-there' && c.answer === 'yes',
    );
    const hoursFromCreated = Math.max(
      hoursBetweenStamps(w.createdAt, w.dueAt),
      hoursBetweenStamps(w.createdAt, nowStamp),
    );
    if (dischargeYes && hoursFromCreated >= THRESHOLDS.DISCHARGE_FOLLOWUP_HOURS) {
      pushEvent('ORG-15', w.createdAt.slice(0, 10));
    }
  }

  // -------------------------------------------------------------------------
  // 3. Event deduplication + DoctorVisit closing + Open Events tracking
  // -------------------------------------------------------------------------
  const existingByKey = new Map<string, Verdict>();
  for (const v of existingVerdicts) {
    if (v.kind === 'event' && v.triggerKey) {
      existingByKey.set(v.triggerKey, v);
    }
  }

  const closedByVisitIds: string[] = [];
  const openEvents: Verdict[] = [];
  for (const v of existingVerdicts) {
    if (v.kind !== 'event') continue;
    if (v.dismissedAt || v.closedByVisit) continue;
    const eventDate = v.at.slice(0, 10);
    const closingVisit = visits.find((vis) => vis.date >= eventDate);
    if (closingVisit) {
      closedByVisitIds.push(v.id);
    } else {
      openEvents.push(v);
    }
  }

  const newEvents: Verdict[] = [];
  for (const ev of firedEventRules) {
    if (existingByKey.has(ev.triggerKey)) continue;
    const newVerdict: Verdict = {
      id: `verdict:${ev.triggerKey}`,
      at: nowStamp,
      level: 'orange',
      ruleIds: [ev.ruleId],
      title: ev.title,
      reasons: [ev.reason, ev.message],
      rulesetVersion: RULESET_VERSION,
      kind: 'event',
      triggerKey: ev.triggerKey,
    };
    newEvents.push(newVerdict);
    openEvents.push(newVerdict);
  }

  const effectiveOpenEventCount =
    derived?.openEventCount !== undefined
      ? Math.max(derived.openEventCount, openEvents.length)
      : openEvents.length;

  // -------------------------------------------------------------------------
  // 4. Evaluate STANDING FLAGS (STD-01..07) with 30-day soft-prompt pacing
  // -------------------------------------------------------------------------
  const standingFlagIds: StandingFlagId[] = [];
  const last6Cycles = activeCycleLengths.slice(
    -THRESHOLDS.STANDING_VARIATION_CYCLES_COUNT,
  );
  if (
    last6Cycles.length >= THRESHOLDS.STANDING_VARIATION_CYCLES_COUNT &&
    Math.max(...last6Cycles) - Math.min(...last6Cycles) >
      THRESHOLDS.STANDING_VARIATION_RANGE_DAYS_GT
  ) {
    standingFlagIds.push('STD-01');
  }

  if (
    last6Cycles.length >= THRESHOLDS.STANDING_VARIATION_CYCLES_COUNT &&
    last6Cycles.filter(
      (l) => l < THRESHOLDS.CYCLE_SHORT_DAYS_LT || l > cycleUpperLimit,
    ).length >= THRESHOLDS.STANDING_OUTSIDE_BAND_COUNT_MIN
  ) {
    standingFlagIds.push('STD-02');
  }

  const earliestDate =
    mergedLogs[0]?.date ?? classification.periodEpisodes[0]?.startDate ?? null;
  const has12MonthsHistory =
    earliestDate !== null &&
    diffDays(earliestDate, today) >= THRESHOLDS.STANDING_YEAR_DAYS;
  const periodsIn12m =
    derived?.periodsInLast12Months !== undefined
      ? derived.periodsInLast12Months
      : has12MonthsHistory
        ? cycleSummary.periodsInLast12MonthsAfterBaseline
        : null;
  if (
    periodsIn12m !== null &&
    periodsIn12m < THRESHOLDS.STANDING_PERIODS_PER_YEAR_LT
  ) {
    standingFlagIds.push('STD-03');
  }

  const yearAgo = addDays(today, -THRESHOLDS.STANDING_YEAR_DAYS);
  const computedMaxGap12m = Math.max(
    0,
    ...cycleSummary.cyclesInLast12MonthsAfterBaseline.map((c) => c.lengthDays),
    lastPeriodStartAll &&
      lastPeriodStartAll >= yearAgo &&
      daysSinceLastPeriodStart !== null
      ? daysSinceLastPeriodStart
      : 0,
  );
  const maxGap12m = derived?.maxGapInLast12Months ?? computedMaxGap12m;
  if (maxGap12m >= THRESHOLDS.AMENORRHEA_DAYS_MIN) {
    standingFlagIds.push('STD-04');
  }

  const computedHeavyOrLongOrPainfulInLast3 =
    derived?.prolongedOrHeavyOrPainfulInLast3 ??
    last3Periods.filter(
      (p) =>
        p.knownBleedingDays > THRESHOLDS.PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE ||
        p.anySoakedPerHour ||
        p.anyUnder2h ||
        p.anyFlooding ||
        p.anyDoubleProtection ||
        p.anyLargeClots ||
        p.maxPain >= THRESHOLDS.SEVERE_EPISODE_PAIN_MIN ||
        p.anyStoppedActivities,
    ).length;
  if (
    computedHeavyOrLongOrPainfulInLast3 >= THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT
  ) {
    standingFlagIds.push('STD-05');
  }

  if (
    inBetweenCount90 >= THRESHOLDS.INTERMENSTRUAL_COUNT_MIN ||
    (adultIntimacyAllowed &&
      effectiveBleedingAfterSex90 >= THRESHOLDS.BLEEDING_AFTER_SEX_COUNT_MIN)
  ) {
    standingFlagIds.push('STD-06');
  }

  const cyclesTotal = derived?.cyclesTotalCount ?? activeCycleLengths.length;
  if (
    cyclesTotal >= THRESHOLDS.STANDING_VARIABILITY_MIN_CYCLES &&
    derived?.consistencyS !== undefined &&
    derived.consistencyS < THRESHOLDS.STANDING_VARIABILITY_S_BELOW
  ) {
    standingFlagIds.push('STD-07');
  }

  const standingFlags: StandingFlagSummary[] = standingFlagIds.map((id) => {
    const meta = ruleMeta(id);
    const recentlyShown = existingVerdicts.some(
      (v) =>
        v.ruleIds.includes(id) && diffDays(v.at.slice(0, 10), today) < 30,
    );
    return {
      ruleId: id,
      title: meta.title,
      reason: meta.reasonTemplate,
      message: meta.wordsShown,
      dueForSoftPrompt: !recentlyShown,
    };
  });

  // -------------------------------------------------------------------------
  // 5. Required-answer check & cautious RED-04 neutral pregnancy hold
  // -------------------------------------------------------------------------
  const missingRequired: string[] = [];
  if (dayLog.flow === null || dayLog.flow === undefined) {
    missingRequired.push('flow');
  }
  if (dayLog.pain?.level === undefined) {
    missingRequired.push('pain');
  }
  if (isDangerScreenRequired(dayLog) && dayLog.dangerAnswered !== true) {
    missingRequired.push('danger');
  }
  if (
    painLevel >= THRESHOLDS.SEVERE_PAIN_MIN &&
    dayLog.pain?.reliefHelped === undefined
  ) {
    missingRequired.push('reliefHelped');
  }

  const pregnancyQuestionRelevant =
    flow === 'spotting' ||
    (painLevel >= THRESHOLDS.PAIN_FOLLOWUP_MIN &&
      (flow === 'none' || flow === null)) ||
    hasEctopicSite;
  const needsNeutralPregGuard =
    red04PhysicalSign &&
    pregnancyQuestionRelevant &&
    neutralPregAllowed &&
    !isPregnancyPossible &&
    dayLog.pregnancyChance !== 'no';

  if (needsNeutralPregGuard && dayLog.pregnancyChance === undefined) {
    missingRequired.push('pregnancyChance');
  }
  const cautiousPreferNotToSayYellow =
    needsNeutralPregGuard && dayLog.pregnancyChance === 'prefer-not-to-say';

  // -------------------------------------------------------------------------
  // 6. Compose final Today Verdict
  // -------------------------------------------------------------------------
  const firedTodayRules: RuleId[] = [
    ...firedRed,
    ...firedTodayOrange,
    ...firedYellow,
    ...firedSupportingGreen,
  ];
  const useGenericSexualHealthWording =
    !sexualHealthActiveForPreg || under18;

  let todayResult: TodayVerdictResult;
  if (firedRed.length > 0) {
    const reasons: string[] = [];
    const snippets: string[] = [];
    let actionPrepend: string | undefined;

    if (firedRed.includes('RED-06')) {
      const r6 = ruleMeta('RED-06');
      if (r6.actionPrepend) {
        actionPrepend = r6.actionPrepend;
        snippets.push(r6.actionPrepend);
      }
    }
    for (const id of firedRed) {
      const meta = ruleMeta(id);
      reasons.push(meta.reasonTemplate);
      const rawWords =
        (id === 'RED-03' || id === 'RED-04') &&
        useGenericSexualHealthWording &&
        meta.genericWordsShown
          ? meta.genericWordsShown
          : meta.wordsShown;
      const body = stripDoctorTail(
        actionPrepend ? rawWords.replace(actionPrepend, '').trim() : rawWords,
      );
      if (body && !snippets.includes(body)) {
        snippets.push(body);
      }
    }
    let message = snippets.join(' ');
    if (under18) {
      message = appendUniqueSentence(message, UNDER_18_GUIDANCE_ADDON);
    }
    message = ensureEndsWithDoctorTail(message);

    todayResult = {
      level: 'red',
      ruleIds: firedRed,
      title: 'Get care today',
      reasons,
      message,
      missingRequired,
      missingCount: missingRequired.length,
      cautiousNeutralPregnancyHold: false,
      ...(actionPrepend ? { actionPrepend } : {}),
    };
  } else if (firedTodayOrange.length > 0) {
    const meta = ruleMeta('ORG-14');
    let message = stripDoctorTail(meta.wordsShown);
    if (under18) {
      message = appendUniqueSentence(message, UNDER_18_GUIDANCE_ADDON);
    }
    message = ensureEndsWithDoctorTail(message);
    todayResult = {
      level: 'orange',
      ruleIds: firedTodayOrange,
      title: 'See a doctor soon',
      reasons: [meta.reasonTemplate],
      message,
      missingRequired,
      missingCount: missingRequired.length,
      cautiousNeutralPregnancyHold: false,
    };
  } else if (firedYellow.length > 0 || cautiousPreferNotToSayYellow) {
    const reasons = firedYellow.map((id) => ruleMeta(id).reasonTemplate);
    const snippets = firedYellow.map((id) => ruleMeta(id).wordsShown);
    if (cautiousPreferNotToSayYellow && firedYellow.length === 0) {
      reasons.push(
        'Because you logged one-sided or shoulder-tip pain, or pain with bleeding, without ruling out urgent causes.',
      );
      snippets.push(
        'Keep watching closely. Get care today if pain worsens, moves to one side or your shoulder, or bleeding increases. If you are worried, see a doctor even if this looks fine.',
      );
    }
    todayResult = {
      level: 'yellow',
      ruleIds: firedYellow,
      title: 'Keep watching',
      reasons,
      message: snippets.join(' '),
      missingRequired,
      missingCount: missingRequired.length,
      cautiousNeutralPregnancyHold: cautiousPreferNotToSayYellow,
    };
  } else if (missingRequired.length > 0) {
    const count = missingRequired.length;
    todayResult = {
      level: 'incomplete',
      ruleIds: [],
      title: 'More answers needed',
      reasons: [],
      message: `Answer ${count} more ${count === 1 ? 'question' : 'questions'} to see a result`,
      missingRequired,
      missingCount: count,
      cautiousNeutralPregnancyHold: false,
    };
  } else if (effectiveOpenEventCount > 0) {
    todayResult = {
      level: 'open-event-notice',
      ruleIds: [],
      title: 'Open flag',
      reasons: [],
      message: OPEN_EVENT_REPLACES_GREEN_TEXT,
      missingRequired: [],
      missingCount: 0,
      cautiousNeutralPregnancyHold: false,
    };
  } else {
    const greenRuleIds: RuleId[] = ['GRN-01', ...firedSupportingGreen];
    firedTodayRules.unshift('GRN-01');
    const reasons = greenRuleIds.map((id) => ruleMeta(id).reasonTemplate);
    const supportingWords = firedSupportingGreen.map(
      (id) => ruleMeta(id).wordsShown,
    );
    const message = [
      ruleMeta('GRN-01').wordsShown,
      ...supportingWords,
    ].join(' ');
    todayResult = {
      level: 'green',
      ruleIds: greenRuleIds,
      title: 'Nothing flagged',
      reasons,
      message,
      missingRequired: [],
      missingCount: 0,
      cautiousNeutralPregnancyHold: false,
    };
  }

  let overallLevel: Level | 'incomplete';
  if (todayResult.level === 'incomplete') {
    overallLevel = openEvents.length > 0 ? 'orange' : 'incomplete';
  } else if (todayResult.level === 'open-event-notice') {
    overallLevel = 'orange';
  } else {
    let best: Level = todayResult.level;
    for (const ev of openEvents) {
      if (LEVEL_RANK[ev.level] > LEVEL_RANK[best]) {
        best = ev.level;
      }
    }
    overallLevel = best;
  }

  const proposedWatchItems = createWatchItems({
    today,
    nowStamp,
    firedTodayRules,
    unclearEpisodes: classification.unclearEpisodes,
    existingWatchItems: watchItems,
  });

  return {
    today: todayResult,
    firedTodayRules,
    firedEventRules,
    openEvents,
    newEvents,
    overallLevel,
    standingFlags,
    proposedWatchItems,
    closedByVisitIds,
  };
}
