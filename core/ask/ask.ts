import { deriveCycles, type DerivedCycle } from '../cycles/cycles';
import { classifyEpisodes } from '../cycles/episodes';
import { analyzeLifestylePatterns } from '../insights/lifestyle';
import { summarizeMedicinesForRange } from '../medicine/totals';
import { addDays, diffDays, yearsSinceMenarche } from '../model/dates';
import type {
  BackupMeta,
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  Forecast,
  MedicineEntry,
  Profile,
  Stamp,
  Verdict,
} from '../model/types';
import { computeLivePrediction } from '../predict/forecast';
import { evaluateTriage, type StandingFlagSummary } from '../triage/engine';

export type AskQuestionId =
  | 'medicines-this-week'
  | 'last-period-and-day'
  | 'longest-and-shortest-cycles'
  | 'flagged-lately'
  | 'last-three-periods-heavy'
  | 'days-logged-this-month'
  | 'confidence-breakdown'
  | 'standing-flags'
  | 'doctor-questions'
  | 'last-backup';

export interface AskQuestionItem {
  readonly id: AskQuestionId;
  readonly question: string;
}

export const ASK_QUESTIONS: readonly AskQuestionItem[] = [
  { id: 'medicines-this-week', question: 'What medicines did I take this week?' },
  {
    id: 'last-period-and-day',
    question: 'When did my last period start, and what day is it now?',
  },
  { id: 'longest-and-shortest-cycles', question: 'What are my longest and shortest cycles?' },
  { id: 'flagged-lately', question: 'What did the app flag lately, and why?' },
  { id: 'last-three-periods-heavy', question: 'How heavy were my last three periods?' },
  { id: 'days-logged-this-month', question: 'How many days did I log this month?' },
  { id: 'confidence-breakdown', question: 'What is my confidence score made of?' },
  { id: 'standing-flags', question: 'Which long-term flags do I have?' },
  { id: 'doctor-questions', question: 'What questions could I ask my doctor?' },
  { id: 'last-backup', question: 'When was my last backup?' },
] as const;

export interface AskContext {
  readonly today: DateKey;
  readonly nowIso: Stamp;
  readonly profile: Profile;
  readonly dayLogs: readonly DayLog[];
  readonly bodyLogs: readonly BodyLog[];
  readonly decisions: readonly Decision[];
  readonly forecasts: readonly Forecast[];
  readonly medicines: readonly MedicineEntry[];
  readonly verdicts: readonly Verdict[];
  readonly meta: BackupMeta;
}

export interface AskAnswer {
  readonly questionId: AskQuestionId;
  readonly question: string;
  readonly dateRange: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly hasEnoughData: boolean;
  readonly missingReason: string | null;
}

function getHistoryBounds(input: AskContext): { start: DateKey; end: DateKey } {
  const dates: DateKey[] = [];
  for (const d of input.dayLogs) {
    if (d.date <= input.today) dates.push(d.date);
  }
  for (const b of input.bodyLogs) {
    if (b.date <= input.today) dates.push(b.date);
  }
  for (const m of input.medicines) {
    if (m.date <= input.today) dates.push(m.date);
  }
  if (dates.length === 0) {
    return { start: input.today, end: input.today };
  }
  dates.sort();
  return { start: dates[0] ?? input.today, end: input.today };
}

function formatFlowWord(flow: DayLog['flow']): string {
  if (flow === 'heavy') return 'Heavy';
  if (flow === 'medium') return 'Medium';
  if (flow === 'light') return 'Light';
  if (flow === 'spotting') return 'Spotting';
  if (flow === 'unsure') return 'Not sure';
  return 'No flow logged';
}

function describeCycleLengthList(cycles: readonly DerivedCycle[]): {
  longest: DerivedCycle;
  shortest: DerivedCycle;
} | null {
  const first = cycles[0];
  if (!first) return null;
  let longest = first;
  let shortest = first;
  for (const c of cycles) {
    if (c.lengthDays > longest.lengthDays) longest = c;
    if (c.lengthDays < shortest.lengthDays) shortest = c;
  }
  return { longest, shortest };
}

export function answerAskQuestion(id: AskQuestionId, input: AskContext): AskAnswer {
  const qItem = ASK_QUESTIONS.find((q) => q.id === id) ?? {
    id,
    question: ASK_QUESTIONS[0]?.question ?? '',
  };
  const { today, nowIso, profile, dayLogs, bodyLogs, decisions, forecasts, medicines, verdicts, meta } =
    input;
  const bounds = getHistoryBounds(input);
  const fullRange = `${bounds.start} to ${bounds.end}`;

  const classification = classifyEpisodes(dayLogs, decisions, today);
  const cycleSummary = deriveCycles(classification, decisions, today);
  const prediction = computeLivePrediction({
    today,
    profile,
    cycles: cycleSummary,
    dayLogs,
    decisions,
    existingForecasts: forecasts,
  });
  const sortedDaysUpToToday = [...dayLogs]
    .filter((d) => d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestDay = sortedDaysUpToToday[sortedDaysUpToToday.length - 1] ?? null;
  const triage = evaluateTriage({
    today,
    nowStamp: nowIso,
    profile,
    dayLog:
      latestDay ??
      ({
        date: today,
        filledFrom: 'live',
        flow: null,
        symptoms: [],
        danger: [],
        note: '',
        updatedAt: nowIso,
      } satisfies DayLog),
    recentLogs: dayLogs,
    decisions,
    medicines,
    watchItems: [],
    existingVerdicts: verdicts,
    visits: [],
  });

  switch (id) {
    case 'medicines-this-week': {
      const weekStart = addDays(today, -6);
      const dateRange = `${weekStart} to ${today}`;
      const medSummary = summarizeMedicinesForRange(medicines, weekStart, today);
      if (medSummary.asNeeded.length === 0 && medSummary.courses.length === 0) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange,
          summary: `No medicine entries recorded between ${weekStart} and ${today}.`,
          details: [],
          hasEnoughData: false,
          missingReason: `No doses or ongoing courses logged from ${weekStart} to ${today}. Use Add medicine on Today or Record to track them.`,
        };
      }

      const details: string[] = [];
      for (const group of medSummary.asNeeded) {
        const displayName = group.genericName ?? group.shownNames.join(', ');
        const mgText =
          group.totalMg > 0 ? `, ${group.totalMg} mg from strengths you entered` : '';
        const unitText = `${group.totalUnits} ${group.totalUnits === 1 ? 'unit' : 'units'} across ${group.totalDoses} ${group.totalDoses === 1 ? 'entry' : 'entries'}`;
        details.push(`${displayName}: ${unitText}${mgText}. Check the pack for the daily limit.`);
        if (group.sameMedicineFlag && group.genericName) {
          details.push(
            `Same medicine: ${group.shownNames.join(' and ')} are both ${group.genericName}.`,
          );
        }
      }
      for (const course of medSummary.courses) {
        const label = course.genericName
          ? `${course.nameShown} (${course.genericName})`
          : course.nameShown;
        details.push(
          `Regular course: ${label}, started ${course.startDate}${course.stopDate ? `, stopped ${course.stopDate}` : ' (ongoing)'}.`,
        );
      }

      const primary = medSummary.asNeeded[0];
      const leadSummary = primary
        ? `${primary.genericName ?? primary.shownNames[0]}: ${primary.totalDoses} ${primary.totalDoses === 1 ? 'dose' : 'doses'}${primary.totalMg > 0 ? `, ${primary.totalMg} mg total` : ''} logged between ${weekStart} and ${today}.`
        : `${medSummary.courses.length} ongoing medicine ${medSummary.courses.length === 1 ? 'course' : 'courses'} active between ${weekStart} and ${today}.`;

      return {
        questionId: id,
        question: qItem.question,
        dateRange,
        summary: leadSummary,
        details,
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'last-period-and-day': {
      if (cycleSummary.openCycle) {
        const start = cycleSummary.openCycle.startDate;
        const dayCount = cycleSummary.openCycle.daysSinceStart;
        const completed = cycleSummary.cycles;
        const prev = completed[completed.length - 1] ?? null;
        return {
          questionId: id,
          question: qItem.question,
          dateRange: `${start} to ${today}`,
          summary: `Your last period started on ${start}. Today (${today}) is day ${dayCount}.`,
          details: [
            `Recorded bleeding days in this period so far: ${cycleSummary.openCycle.episode.knownBleedingDays}.`,
            ...(prev
              ? [
                  `Your previous cycle ran from ${prev.startDate} for ${prev.lengthDays} days.`,
                ]
              : []),
          ],
          hasEnoughData: true,
          missingReason: null,
        };
      }

      if (profile.lastPeriodApprox) {
        const approxDays = Math.max(0, diffDays(profile.lastPeriodApprox, today));
        return {
          questionId: id,
          question: qItem.question,
          dateRange: `${profile.lastPeriodApprox} to ${today}`,
          summary: `Only your approximate onboarding date (${profile.lastPeriodApprox}) is saved — about day ${approxDays} today.`,
          details: ['Log real flow days on Today or Add earlier periods on Cycle to tighten this count.'],
          hasEnoughData: false,
          missingReason: 'No logged period flow days yet; only the approximate date from setup exists.',
        };
      }

      return {
        questionId: id,
        question: qItem.question,
        dateRange: fullRange,
        summary: 'No period start has been logged yet.',
        details: ['Log flow days on Today or use Add earlier periods on Cycle to start cycle day counts.'],
        hasEnoughData: false,
        missingReason: 'No period episode with flow has been logged yet.',
      };
    }

    case 'longest-and-shortest-cycles': {
      const activeCycles = cycleSummary.cycles.filter(
        (c) => c.isValidLength && !c.beforeBaseline && !c.ignoredInPredictions,
      );
      const pool = activeCycles.length >= 2 ? activeCycles : cycleSummary.cycles.filter((c) => c.isValidLength);
      if (pool.length < 2) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: `Not enough completed cycles yet (${pool.length} recorded).`,
          details:
            pool.length === 1 && pool[0]
              ? [`One completed cycle recorded so far: ${pool[0].lengthDays} days (started ${pool[0].startDate}).`]
              : ['Completed cycle lengths appear after at least two period starts are logged.'],
          hasEnoughData: false,
          missingReason: `Need at least 2 completed cycles to compare longest and shortest; currently ${pool.length} logged.`,
        };
      }

      const extremes = describeCycleLengthList(pool);
      const firstCycle = pool[0];
      const lastCycle = pool[pool.length - 1];
      if (!extremes || !firstCycle || !lastCycle) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: 'Not enough completed cycles yet.',
          details: [],
          hasEnoughData: false,
          missingReason: 'Completed cycles missing.',
        };
      }
      const firstStart = firstCycle.startDate;
      const lastDate = lastCycle.nextStartDate;
      const { longest, shortest } = extremes;
      return {
        questionId: id,
        question: qItem.question,
        dateRange: `${firstStart} to ${lastDate}`,
        summary: `Across ${pool.length} cycles, longest was ${longest.lengthDays} days and shortest was ${shortest.lengthDays} days.`,
        details: [
          `Longest: ${longest.lengthDays} days (started ${longest.startDate}).`,
          `Shortest: ${shortest.lengthDays} days (started ${shortest.startDate}).`,
          ...(activeCycles.length < cycleSummary.cycles.filter((c) => c.isValidLength).length
            ? ['Older cycles marked before the baseline change or ignored are excluded from predictions.']
            : []),
        ],
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'flagged-lately': {
      const windowStart = addDays(today, -29);
      const dateRange = `${windowStart} to ${today}`;
      const sortedVerdicts = [...verdicts].sort((a, b) => b.at.localeCompare(a.at));
      const nonGreenRecent = sortedVerdicts.filter(
        (v) => v.level !== 'green' && v.at.slice(0, 10) >= windowStart && v.at.slice(0, 10) <= today,
      );

      if (sortedVerdicts.length === 0) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange,
          summary: 'No check-in results have been saved yet.',
          details: [],
          hasEnoughData: false,
          missingReason: `No check-in verdicts logged between ${windowStart} and ${today}.`,
        };
      }

      if (nonGreenRecent.length === 0) {
        const olderFlag = sortedVerdicts.find((v) => v.level !== 'green');
        return {
          questionId: id,
          question: qItem.question,
          dateRange,
          summary: `No Yellow, Orange, or Red flags were triggered from ${windowStart} to ${today}.`,
          details: olderFlag
            ? [
                `Most recent earlier flag was ${olderFlag.title} (${olderFlag.ruleIds.join(', ')}) on ${olderFlag.at.slice(0, 10)}: ${olderFlag.reasons.join(' ')}`,
              ]
            : ['All recorded check-ins stayed at Nothing flagged.'],
          hasEnoughData: true,
          missingReason: null,
        };
      }

      const details = nonGreenRecent.slice(0, 5).map((v) => {
        const why = v.reasons.length > 0 ? v.reasons.join(' ') : 'Triggered by your logged answers.';
        return `${v.at.slice(0, 10)} — ${v.title} (${v.ruleIds.join(', ') || v.level}): ${why}`;
      });
      const top = nonGreenRecent[0];
      return {
        questionId: id,
        question: qItem.question,
        dateRange,
        summary: top
          ? `${nonGreenRecent.length} flag${nonGreenRecent.length === 1 ? '' : 's'} in the last 30 days. Most recent: ${top.title} on ${top.at.slice(0, 10)}.`
          : 'Recent flags found.',
        details,
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'last-three-periods-heavy': {
      const periods = [...classification.periodEpisodes]
        .filter((p) => p.startDate <= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      if (periods.length === 0) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: 'No completed or active periods have been logged yet.',
          details: [],
          hasEnoughData: false,
          missingReason: 'No period bleeding episodes found. Log flow on Today or earlier periods on Cycle.',
        };
      }

      const recentThree = periods.slice(-3);
      const firstRecent = recentThree[0];
      const lastRecent = recentThree[recentThree.length - 1];
      const rangeStart = firstRecent ? firstRecent.startDate : today;
      const rangeEnd = lastRecent ? lastRecent.endDate : today;
      const details = recentThree
        .slice()
        .reverse()
        .map((p) => {
          const heavyNotes: string[] = [];
          if (p.anySoakedPerHour) heavyNotes.push('soaked hourly 2+ hours');
          if (p.anyUnder2h) heavyNotes.push('changed under every 2 hours');
          if (p.anyDoubleProtection) heavyNotes.push('two products used');
          if (p.anyFlooding) heavyNotes.push('flooding');
          if (p.anyLargeClots) heavyNotes.push('clots bigger than a coin');
          const heavyText = heavyNotes.length > 0 ? ` · ${heavyNotes.join(', ')}` : '';
          return `${p.startDate} to ${p.endDate}: ${formatFlowWord(p.heaviestFlow)} heaviest flow, ${p.knownBleedingDays} bleeding ${p.knownBleedingDays === 1 ? 'day' : 'days'}${heavyText}.`;
        });

      const hasThree = recentThree.length === 3;
      return {
        questionId: id,
        question: qItem.question,
        dateRange: `${rangeStart} to ${rangeEnd}`,
        summary: `Showing ${recentThree.length} logged ${recentThree.length === 1 ? 'period' : 'periods'}. Heaviest flow seen: ${formatFlowWord(
          recentThree.reduce<DayLog['flow']>((best, cur) => {
            const rank = (f: DayLog['flow']) =>
              f === 'heavy' ? 4 : f === 'medium' ? 3 : f === 'light' ? 2 : f === 'spotting' ? 1 : 0;
            return rank(cur.heaviestFlow) >= rank(best) ? cur.heaviestFlow : best;
          }, 'light'),
        )}.`,
        details,
        hasEnoughData: hasThree,
        missingReason: hasThree
          ? null
          : `Only ${recentThree.length} of 3 periods logged so far; log ${3 - recentThree.length} more period${3 - recentThree.length === 1 ? '' : 's'} to compare three.`,
      };
    }

    case 'days-logged-this-month': {
      const monthStart = `${today.slice(0, 7)}-01`;
      const dateRange = `${monthStart} to ${today}`;
      const daySet = new Set(
        dayLogs.filter((d) => d.date >= monthStart && d.date <= today).map((d) => d.date),
      );
      const bodySet = new Set(
        bodyLogs.filter((b) => b.date >= monthStart && b.date <= today).map((b) => b.date),
      );
      const totalUnique = new Set([...daySet, ...bodySet]).size;

      if (totalUnique === 0) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange,
          summary: `0 days logged between ${monthStart} and ${today}.`,
          details: ['Log flow or symptoms on Today, or sleep/water/meals on Body, to start this month.'],
          hasEnoughData: false,
          missingReason: `No check-ins or Body entries found in ${today.slice(0, 7)}.`,
        };
      }

      return {
        questionId: id,
        question: qItem.question,
        dateRange,
        summary: `${totalUnique} distinct ${totalUnique === 1 ? 'day' : 'days'} logged this month (${daySet.size} check-in ${daySet.size === 1 ? 'day' : 'days'} and ${bodySet.size} Body log ${bodySet.size === 1 ? 'day' : 'days'}).`,
        details: [`Period/symptom check-ins: ${daySet.size} days.`, `Body log days: ${bodySet.size} days.`],
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'confidence-breakdown': {
      const c = prediction.confidence;
      if (c.effectiveCycles === 0) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: `Confidence starts at ${c.score}% because 0 completed cycles have been logged yet.`,
          details: [
            'Completeness grows as up to 8 cycles are recorded.',
            'Track record grows as past possible windows hold real period starts.',
            'Each period you log tightens your ranges.',
          ],
          hasEnoughData: false,
          missingReason: 'No completed cycles logged yet; confidence remains at the 10% starting baseline.',
        };
      }

      const years = yearsSinceMenarche(profile, today);
      const ageRuleNote =
        years !== null && years < 3
          ? 'Using starting age range for first 3 years after first period.'
          : 'Weighted toward recent cycle lengths (85% decay per earlier cycle).';

      return {
        questionId: id,
        question: qItem.question,
        dateRange: fullRange,
        summary: `Confidence is ${c.score}% (out of 95% max), calculated from completeness, cycle stability, and forecast track record.`,
        details: [
          `Completed cycles counted: ${c.effectiveCycles} (${Math.round(c.C * 100)}% completeness term).`,
          `Cycle regularity/stability term: ${Math.round(c.S * 100)}%.`,
          `Past possible windows held the real start in ${c.hitCount} of ${c.resolvedCount} checked cycles.`,
          ageRuleNote,
        ],
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'standing-flags': {
      const flags = triage.standingFlags;
      const completedCount = cycleSummary.cycles.filter((c) => c.isValidLength).length;
      if (flags.length === 0) {
        const enoughCycles = completedCount >= 3;
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: `No long-term flags are currently active across your logged history.`,
          details: [
            `Completed cycles in history: ${completedCount}.`,
            'History patterns are checked across cycle variation, 12-month period count, long gaps, heavy bleeding repeats, and recurring spotting.',
          ],
          hasEnoughData: enoughCycles,
          missingReason: enoughCycles
            ? null
            : `Fewer than 3 completed cycles logged (${completedCount}); most long-term flags need 3 to 6 cycles or a 12-month window.`,
        };
      }

      return {
        questionId: id,
        question: qItem.question,
        dateRange: fullRange,
        summary: `${flags.length} long-term ${flags.length === 1 ? 'flag is' : 'flags are'} active in your record.`,
        details: flags.map((f: StandingFlagSummary) => `${f.ruleId}: ${f.title} — ${f.reason}`),
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'doctor-questions': {
      const questionsToAsk: string[] = [];
      const flags = triage.standingFlags;
      const flagIds = new Set(flags.map((f: StandingFlagSummary) => f.ruleId));
      const lifestyle = analyzeLifestylePatterns({ today, dayLogs, bodyLogs });

      if (flagIds.has('STD-01') || flagIds.has('STD-02') || flagIds.has('STD-03') || flagIds.has('STD-04')) {
        questionsToAsk.push('My cycle lengths or timing varied in this record — what tests or explanations might fit?');
      }
      if (flagIds.has('STD-05') || verdicts.some((v) => v.ruleIds.includes('ORG-01') || v.ruleIds.includes('ORG-02') || v.ruleIds.includes('ORG-09'))) {
        questionsToAsk.push('Several days showed heavy bleeding or soaking signs — should we check haemoglobin, ferritin, or causes of heavy bleeding?');
      }
      if (flagIds.has('STD-06')) {
        questionsToAsk.push('Spotting between periods or bleeding after sex appeared repeatedly — what check-up do you recommend?');
      }
      if (profile.onHormones) {
        questionsToAsk.push('With my current hormone medicine, are these bleeding patterns expected?');
      }
      if (prediction.ovulation.fortyPlusTempDaysNoShift) {
        questionsToAsk.push('Over 40 temperature logs without a thermal shift were recorded — does that fit my picture?');
      }
      const firstPattern = lifestyle.patterns[0];
      if (firstPattern) {
        questionsToAsk.push(`My Body logs noticed: ${firstPattern.statement} — is that worth exploring together?`);
      }

      if (questionsToAsk.length === 0) {
        const hasAnyData = dayLogs.length > 0 || bodyLogs.length > 0;
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: hasAnyData
            ? 'No specific flagged patterns currently suggest extra clinician questions beyond a routine visit.'
            : 'Not enough logged history yet to tailor specific questions for a doctor.',
          details: [
            'You can export your full Doctor file from Record at any time to review dates, medicines, and symptoms together.',
          ],
          hasEnoughData: false,
          missingReason: hasAnyData
            ? 'No active event or standing patterns needed extra follow-up questions yet.'
            : 'No check-ins or Body logs have been entered yet.',
        };
      }

      return {
        questionId: id,
        question: qItem.question,
        dateRange: fullRange,
        summary: `${questionsToAsk.length} tailored discussion ${questionsToAsk.length === 1 ? 'prompt' : 'prompts'} based on your saved history.`,
        details: questionsToAsk,
        hasEnoughData: true,
        missingReason: null,
      };
    }

    case 'last-backup': {
      const exportDate = meta.lastExportAt ? meta.lastExportAt.slice(0, 10) : null;
      const autoDate = meta.lastAutoBackupAt ? meta.lastAutoBackupAt.slice(0, 10) : null;
      if (!exportDate && !autoDate) {
        return {
          questionId: id,
          question: qItem.question,
          dateRange: fullRange,
          summary: 'No backup file has been saved yet.',
          details: [
            `Your device currently holds ${dayLogs.length} check-in ${dayLogs.length === 1 ? 'day' : 'days'} and ${bodyLogs.length} Body ${bodyLogs.length === 1 ? 'entry' : 'entries'}.`,
            'Open Settings -> Backup and restore to save a passphrase-locked JSON backup.',
          ],
          hasEnoughData: false,
          missingReason: 'No exported or automatic backup timestamp is recorded yet.',
        };
      }

      const details: string[] = [];
      if (exportDate) details.push(`Last saved backup file: ${exportDate}.`);
      if (autoDate) details.push(`Last local auto-backup: ${autoDate}.`);
      details.push(
        `Records on device: ${dayLogs.length} check-in days, ${bodyLogs.length} Body days, ${medicines.length} medicine entries.`,
      );
      return {
        questionId: id,
        question: qItem.question,
        dateRange: fullRange,
        summary: exportDate
          ? `Your last backup file was saved on ${exportDate}.`
          : `Your last auto-backup ran on ${autoDate}.`,
        details,
        hasEnoughData: true,
        missingReason: null,
      };
    }
  }
}

export function answerAllAskQuestions(input: AskContext): AskAnswer[] {
  return ASK_QUESTIONS.map((q) => answerAskQuestion(q.id, input));
}
