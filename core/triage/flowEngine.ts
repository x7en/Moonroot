import { DANGER_SIGN_CATALOGUE, type DangerSignCatalogueItem } from '../model/catalogues';
import {
  addDays,
  diffDays,
  isAdultSexualHealthAllowed,
  mayContainOestrogen,
} from '../model/dates';
import type {
  DateKey,
  DayLog,
  Decision,
  MedicineEntry,
  Profile,
} from '../model/types';
import {
  QUESTION_FLOWS,
  type FollowUpQuestionSpec,
  type QuestionFlowSpec,
} from './questions';
import { THRESHOLDS } from './thresholds';

export interface QuestionFlowInput {
  today: DateKey;
  profile: Pick<
    Profile,
    'birthYear' | 'onHormones' | 'contraception' | 'sexualHealthQuestions' | 'intimacy'
  >;
  dayLog: Partial<DayLog>;
  recentLogs: readonly Partial<DayLog>[];
  activeCycleLengths: readonly number[];
  daysSinceLastPeriodStart: number | null;
  medicines: readonly MedicineEntry[];
  decisions: readonly Decision[];
  lastNoPeriodQuestionDate?: DateKey | null;
}

export interface ActiveQuestionFlow {
  triggerId: QuestionFlowSpec['triggerId'];
  triggerLabel: string;
  followUpWindow?: string;
  questions: readonly FollowUpQuestionSpec[];
}

export function isDangerScreenRequired(dayLog: Partial<DayLog>): boolean {
  if (dayLog.flow === 'medium' || dayLog.flow === 'heavy') return true;
  if (
    (dayLog.pain?.level ?? 0) >= THRESHOLDS.PAIN_FOLLOWUP_MIN &&
    (dayLog.flow === 'none' || dayLog.flow === null || dayLog.flow === undefined)
  ) {
    return true;
  }
  if (dayLog.fever?.c !== undefined || dayLog.fever?.felt === true) return true;
  if (dayLog.discharge === 'odour' || dayLog.discharge === 'yellow-green') return true;
  return (dayLog.danger?.length ?? 0) > 0;
}

export function getVisibleDangerSigns(
  profile: Pick<Profile, 'onHormones' | 'contraception'>,
  activeHormoneNames: readonly string[],
): readonly DangerSignCatalogueItem[] {
  const showOestrogen = mayContainOestrogen(profile, activeHormoneNames);
  return DANGER_SIGN_CATALOGUE.filter((item) => !item.oestrogenOnly || showOestrogen);
}

export function isNeutralPregnancyQuestionAllowed(
  profile: Pick<Profile, 'sexualHealthQuestions' | 'intimacy'>,
): boolean {
  return (
    profile.sexualHealthQuestions === 'when-relevant' &&
    profile.intimacy !== 'none'
  );
}

function p75OrFallback(lengths: readonly number[]): number {
  if (lengths.length === 0) return THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS;
  const sorted = [...lengths].sort((a, b) => a - b);
  const idx = Math.floor(0.75 * (sorted.length - 1));
  return sorted[idx] ?? THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS;
}

export function getActiveQuestionFlows(
  input: QuestionFlowInput,
): readonly ActiveQuestionFlow[] {
  const {
    today,
    profile,
    dayLog,
    recentLogs,
    activeCycleLengths,
    daysSinceLastPeriodStart,
    medicines,
    decisions,
    lastNoPeriodQuestionDate,
  } = input;

  const yesterday = addDays(today, -1);
  const hasSpottingBeforeToday = recentLogs.some(
    (l) => l.date === yesterday && l.flow === 'spotting',
  );
  const neutralPregAllowed = isNeutralPregnancyQuestionAllowed(profile);
  const adultIntimacyAllowed = isAdultSexualHealthAllowed(profile, today);
  const painLevel = dayLog.pain?.level ?? 0;

  const hasHormoneChangeToday = medicines.some(
    (m) =>
      m.category === 'hormone' &&
      ((m.startDate ?? m.date) === today || m.stopDate === today),
  );
  const hasBaselineToday = decisions.some(
    (d) => d.kind === 'new-baseline' && d.date === today,
  );

  const noPeriodThreshold = Math.max(
    THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS,
    p75OrFallback(activeCycleLengths),
  );
  const noPeriodDue =
    daysSinceLastPeriodStart !== null &&
    daysSinceLastPeriodStart >= noPeriodThreshold &&
    (!lastNoPeriodQuestionDate ||
      diffDays(lastNoPeriodQuestionDate, today) >= 14);

  const triggerMatches: Record<QuestionFlowSpec['triggerId'], boolean> = {
    'spotting-logged': dayLog.flow === 'spotting',
    'medium-or-heavy-flow': dayLog.flow === 'medium' || dayLog.flow === 'heavy',
    'pain-4-plus-no-flow':
      painLevel >= THRESHOLDS.PAIN_FOLLOWUP_MIN &&
      (dayLog.flow === 'none' || dayLog.flow === null || dayLog.flow === undefined),
    'many-days-no-period': noPeriodDue,
    'bleeding-or-pain-after-sex':
      adultIntimacyAllowed &&
      (dayLog.intimacy?.bleedingAfter === true || dayLog.intimacy?.painDuring === true),
    'fever-logged': dayLog.fever?.c !== undefined || dayLog.fever?.felt === true,
    'blood-in-stool': dayLog.stoolBlood !== undefined,
    'odour-or-yellow-green-discharge':
      dayLog.discharge === 'odour' || dayLog.discharge === 'yellow-green',
    'hormone-course-changed': hasHormoneChangeToday && !hasBaselineToday,
    'watch-list-followup': false,
  };

  const result: ActiveQuestionFlow[] = [];
  for (const flow of QUESTION_FLOWS) {
    if (!triggerMatches[flow.triggerId]) continue;

    const visibleQuestions = flow.questions.filter((q) => {
      if (q.ageOrSettingGate === 'after-day-1') return hasSpottingBeforeToday;
      if (q.ageOrSettingGate === 'sexual-health-allowed') return neutralPregAllowed;
      if (q.ageOrSettingGate === 'adult-intimacy-allowed') return adultIntimacyAllowed;
      if (q.ageOrSettingGate === 'pain-8-or-more') {
        return painLevel >= THRESHOLDS.SEVERE_PAIN_MIN;
      }
      return true;
    });

    const needsExtraRed =
      flow.allowExtraForRedRule &&
      visibleQuestions.some((q) => q.ageOrSettingGate === 'pain-8-or-more');
    const maxAllowed = flow.maxQuestionsNormally + (needsExtraRed ? 1 : 0);

    result.push({
      triggerId: flow.triggerId,
      triggerLabel: flow.triggerLabel,
      followUpWindow: flow.followUpWindow,
      questions: visibleQuestions.slice(0, maxAllowed),
    });
  }

  return result;
}
