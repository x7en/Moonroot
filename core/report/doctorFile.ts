import { deriveCycles } from '../cycles/cycles';
import { classifyEpisodes } from '../cycles/episodes';
import { summarizeMedicinesForRange } from '../medicine/totals';
import { SYMPTOM_CATALOGUE } from '../model/catalogues';
import { addDays, diffDays, isUnder18, parseDateKey } from '../model/dates';
import {
  RULESET_VERSION,
  SCHEMA_VERSION,
  type DateKey,
  type DayLog,
  type Decision,
  type DoctorVisit,
  type Forecast,
  type MedicineEntry,
  type Profile,
  type RuleId,
  type Verdict,
  type WatchItem,
} from '../model/types';
import { computeConfidence } from '../predict/confidence';
import { analyzeLeadInPattern } from '../predict/leadIn';
import { evaluateTriage } from '../triage/engine';

export type DoctorFileRange = '3m' | '6m' | '12m' | 'all';
export type DoctorFileFormat = 'md' | 'txt';

export interface DoctorFileOptions {
  range: DoctorFileRange;
  format: DoctorFileFormat;
  includeNotes: boolean;
  includeMedicines: boolean;
  includeIntimacy: boolean;
  includeVerdicts?: boolean;
  worryNote?: string;
}

export interface DoctorFileInput {
  today: DateKey;
  appVersion: string;
  profile: Profile | null;
  dayLogs: readonly DayLog[];
  medicines: readonly MedicineEntry[];
  visits: readonly DoctorVisit[];
  decisions?: readonly Decision[];
  verdicts?: readonly Verdict[];
  watchItems?: readonly WatchItem[];
  forecasts?: readonly Forecast[];
  options: DoctorFileOptions;
}

export interface DoctorFileOutput {
  filename: string;
  content: string;
}

const SYMPTOM_LABELS = new Map<string, string>(
  SYMPTOM_CATALOGUE.map((s) => [s.key, s.defaultLabel]),
);

function rangeStartDate(today: DateKey, range: DoctorFileRange, logs: readonly DayLog[]): DateKey {
  if (range === '3m') return addDays(today, -89);
  if (range === '6m') return addDays(today, -179);
  if (range === '12m') return addDays(today, -364);
  const sortedDates = logs.map((l) => l.date).sort();
  return sortedDates[0] ?? today;
}

function medianNumber(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1] ?? 0;
  const b = sorted[mid] ?? 0;
  return Number(((a + b) / 2).toFixed(1));
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
}

function heading(text: string, format: DoctorFileFormat, level: 1 | 2 = 2): string {
  if (format === 'md') {
    return `${'#'.repeat(level)} ${text}`;
  }
  const underline = level === 1 ? '='.repeat(text.length) : '-'.repeat(text.length);
  return `${text}\n${underline}`;
}

function fallbackMinorProfile(today: DateKey): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: `${today}T00:00:00Z`,
    birthYear: null,
    menarcheAge: null,
    selfRegularity: 'unknown',
    lastPeriodApprox: null,
    onHormones: null,
    contraception: null,
    sexualHealthQuestions: 'off',
    intimacy: 'none',
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

/**
 * Step 3 doctor summary builder:
 * Generates Parts 1, 2, 3, 4, 5 (whole range + per period), 6 (lead-in pattern),
 * 7, 10, 11, 12, plain Daily log table (last 3 months), footer, and machine-readable JSON block.
 * Parts belonging to Step 4 (6 lifestyle patterns, 8, 9) are omitted until implemented.
 */
export function buildDoctorFile(input: DoctorFileInput): DoctorFileOutput {
  const {
    today,
    appVersion,
    profile,
    dayLogs,
    medicines,
    visits,
    decisions = [],
    verdicts = [],
    watchItems = [],
    forecasts = [],
    options,
  } = input;
  const format = options.format;
  const includeVerdicts = options.includeVerdicts !== false;
  const under18 = profile ? isUnder18(profile, today) : true;
  const allowIntimacyExport = Boolean(options.includeIntimacy && !under18);

  const sortedLogs = [...dayLogs]
    .filter((l) => l.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const fromDate = rangeStartDate(today, options.range, sortedLogs);
  const rangeLogs = sortedLogs.filter((l) => l.date >= fromDate && l.date <= today);

  const todayLog: DayLog = sortedLogs.find((l) => l.date === today) ?? {
    date: today,
    filledFrom: 'live',
    flow: null,
    symptoms: [],
    danger: [],
    note: '',
    updatedAt: `${today}T00:00:00Z`,
  };

  const effectiveProfile = profile ?? fallbackMinorProfile(today);
  const episodeSummary = classifyEpisodes(sortedLogs, decisions, today);
  const cycleSummary = deriveCycles(episodeSummary, decisions, today);
  const leadIn = analyzeLeadInPattern({
    today,
    dayLogs: sortedLogs,
    cycles: cycleSummary,
    resolvedForecasts: forecasts,
  });
  const confidenceSummary = computeConfidence({
    activeCycles: cycleSummary.recentValidCyclesAfterBaseline,
    resolvedForecasts: forecasts,
    cycles: cycleSummary.cycles,
    newBaselineDate: cycleSummary.newBaselineDate,
  });
  const triage = evaluateTriage({
    today,
    profile: effectiveProfile,
    dayLog: todayLog,
    recentLogs: sortedLogs,
    decisions,
    medicines,
    watchItems,
    existingVerdicts: verdicts,
    visits,
  });

  const aiInstruction = [
    'For an AI assistant reading this file: this is a patient-recorded menstrual journal, not a diagnosis.',
    'Summarize it for a clinician in 10 lines or fewer. List patterns, red flags and gaps in the data.',
    'Suggest questions the patient could ask a doctor. Do not diagnose and do not recommend medicines.',
    'Say clearly when the data is too thin to conclude anything.',
  ].join(' ');

  const lines: string[] = [];
  if (format === 'md') {
    lines.push('<!--', aiInstruction, '-->');
  } else {
    lines.push(aiInstruction, '');
  }

  lines.push(heading('Menstrual health summary', format, 1));
  lines.push(
    `Generated ${today} · Moonroot ${appVersion} · rules ${RULESET_VERSION} (not yet clinician reviewed)`,
  );
  lines.push(`Range: ${fromDate} to ${today}`);
  if (options.worryNote && options.worryNote.trim()) {
    lines.push(`In her words: "${options.worryNote.trim()}"`);
  }
  lines.push('');

  // Shared cycle statistics
  const todayYear = parseDateKey(today).year;
  const ageStr =
    profile && profile.birthYear !== null ? `${todayYear - profile.birthYear} years` : 'Not entered';
  const menarcheStr =
    profile && profile.menarcheAge !== null ? `${profile.menarcheAge} years` : 'Not entered';
  const validCycles = cycleSummary.cycles.filter((c) => c.isValidLength);
  const validPostBaselineLengths = cycleSummary.activeCycleLengths;
  const statLengths =
    validPostBaselineLengths.length > 0
      ? validPostBaselineLengths
      : cycleSummary.allValidCycleLengths;
  const medianCycle = medianNumber(statLengths);
  const minCycle = statLengths.length > 0 ? Math.min(...statLengths) : null;
  const maxCycle = statLengths.length > 0 ? Math.max(...statLengths) : null;
  const longestGap = Math.max(maxCycle ?? 0, cycleSummary.daysSinceLastPeriodStart ?? 0);

  // Part 1. At a glance (at most 8 lines)
  lines.push(heading('1. At a glance', format, 2));
  lines.push(
    `- Age: ${ageStr}${profile?.menarcheAge !== null && profile?.menarcheAge !== undefined ? `, first period at ${profile.menarcheAge}` : ''}. Cycles logged: ${validCycles.length}.`,
  );
  if (medianCycle !== null && minCycle !== null && maxCycle !== null) {
    lines.push(
      `- Median cycle: ${medianCycle} days, range ${minCycle} to ${maxCycle}. Longest gap: ${longestGap} days.`,
    );
  } else {
    lines.push(
      `- Complete cycles logged: ${validCycles.length}.${longestGap > 0 ? ` Current gap since start: ${longestGap} days.` : ''}`,
    );
  }
  if (triage.standingFlags.length > 0) {
    lines.push(
      `- Standing flags: ${triage.standingFlags.map((f) => `${f.ruleId} (${f.title})`).join('; ')}.`,
    );
  } else {
    lines.push('- Standing flags: none in current history.');
  }
  if (triage.openEvents.length > 0) {
    lines.push(
      `- Open event flags: ${triage.openEvents.map((e) => `${e.ruleIds.join(', ')} (${e.triggerKey?.split(':')[1] ?? e.at.slice(0, 10)})`).join(', ')}.`,
    );
  }
  if (options.worryNote && options.worryNote.trim()) {
    lines.push(`- In her words: "${options.worryNote.trim()}"`);
  }
  lines.push('');

  // Part 2. Profile
  lines.push(heading('2. Profile', format, 2));
  const hormoneStr =
    profile?.onHormones === true
      ? 'Yes'
      : profile?.onHormones === false
        ? 'No'
        : 'Not sure / not entered';

  lines.push(`- Age: ${ageStr}`);
  lines.push(`- Age at first period: ${menarcheStr}`);
  lines.push(`- Self-described cycle regularity: ${profile?.selfRegularity ?? 'unknown'}`);
  lines.push(
    `- Last period noted at onboarding (approximate): ${profile?.lastPeriodApprox ?? 'Not entered'}`,
  );
  lines.push(`- Hormone medicine: ${hormoneStr}`);
  if (allowIntimacyExport && profile) {
    lines.push(`- Contraception recorded: ${profile.contraception ?? 'Not entered'}`);
  }
  if (options.includeMedicines && profile) {
    lines.push(`- Conditions note: ${profile.conditionsNote.trim() || 'None entered'}`);
    lines.push(`- Medications note: ${profile.medicationsNote.trim() || 'None entered'}`);
  }
  lines.push('');

  // Part 3. Cycle history (up to last 12 cycles + ongoing open cycle)
  lines.push(heading('3. Cycle history', format, 2));
  const recentCycles = cycleSummary.cycles.slice(-12).reverse();
  const openCycle = cycleSummary.openCycle;

  if (recentCycles.length === 0 && !openCycle) {
    lines.push('- Not enough period starts logged yet to build a cycle table.');
  } else {
    if (format === 'md') {
      lines.push('| Start | Length (days) | Bleeding days | Heaviest flow | Spotting before flow |');
      lines.push('| --- | --- | --- | --- | --- |');
    }
    if (openCycle) {
      const lengthLabel = `open (day ${openCycle.daysSinceStart})`;
      const leadStr =
        openCycle.episode.leadInDays > 0 ? `${openCycle.episode.leadInDays} day(s)` : 'none';
      if (format === 'md') {
        lines.push(
          `| ${openCycle.startDate} | ${lengthLabel} | ${openCycle.episode.knownBleedingDays} | ${openCycle.episode.heaviestFlow} | ${leadStr} |`,
        );
      } else {
        lines.push(
          `${openCycle.startDate} | length=${lengthLabel} | bleeding=${openCycle.episode.knownBleedingDays}d | heaviest=${openCycle.episode.heaviestFlow} | spotting_before=${leadStr}`,
        );
      }
    }
    for (const c of recentCycles) {
      const flags: string[] = [];
      if (c.beforeBaseline) flags.push('before the change');
      if (c.dateCheckFlag) flags.push(c.dateCheckFlag);
      if (c.ignoredInPredictions) flags.push('ignored');
      if (c.approximate) flags.push('approx');
      const flagSuffix = flags.length > 0 ? ` (${flags.join(', ')})` : '';
      const leadStr = c.leadInDays > 0 ? `${c.leadInDays} day(s)` : 'none';
      if (format === 'md') {
        lines.push(
          `| ${c.startDate} | ${c.lengthDays}${flagSuffix} | ${c.bleedingDays} | ${c.episode.heaviestFlow} | ${leadStr} |`,
        );
      } else {
        lines.push(
          `${c.startDate} | length=${c.lengthDays}${flagSuffix} | bleeding=${c.bleedingDays}d | heaviest=${c.episode.heaviestFlow} | spotting_before=${leadStr}`,
        );
      }
    }
  }
  lines.push('');

  // Part 4. Bleeding detail
  lines.push(heading('4. Bleeding detail', format, 2));
  const heavySignDays = rangeLogs.filter(
    (l) =>
      l.soakedPerHour === true ||
      l.changeEvery === 'under-2h' ||
      l.changeEvery === '2-3h' ||
      l.doubleProtection === true ||
      l.flooding === true ||
      l.clots === 'small' ||
      l.clots === 'large',
  );
  const prolongedPeriods = episodeSummary.periodEpisodes.filter(
    (ep) => ep.endDate >= fromDate && ep.knownBleedingDays > 7,
  );
  const inBetweenInRange = episodeSummary.inBetweenSpotting.filter(
    (s) => s.lastDate >= fromDate && s.lastDate <= today,
  );
  if (heavySignDays.length > 0) {
    const soakedCount = heavySignDays.filter((l) => l.soakedPerHour === true).length;
    const under2hCount = heavySignDays.filter((l) => l.changeEvery === 'under-2h').length;
    const largeClotCount = heavySignDays.filter((l) => l.clots === 'large').length;
    const floodingCount = heavySignDays.filter((l) => l.flooding === true).length;
    lines.push(
      `- Heavy-flow signs logged on ${heavySignDays.length} day(s) in range: hourly soaking=${soakedCount}, every 1-2h change=${under2hCount}, large clots=${largeClotCount}, flooding=${floodingCount}.`,
    );
  } else {
    lines.push('- Heavy-flow signs (clots, flooding, frequent changes): none logged in range.');
  }
  lines.push(
    `- Prolonged periods (> 7 known bleeding days): ${prolongedPeriods.length > 0 ? prolongedPeriods.map((p) => `${p.startDate} (${p.knownBleedingDays} days)`).join(', ') : 'none'}.`,
  );
  lines.push(
    `- Between-period spotting events: ${inBetweenInRange.length > 0 ? inBetweenInRange.map((s) => `${s.firstDate} (${s.consecutiveDays}d)`).join(', ') : 'none'}.`,
  );
  if (allowIntimacyExport) {
    const bleedingAfterSexDays = rangeLogs.filter((l) => l.intimacy?.bleedingAfter === true);
    lines.push(
      `- Bleeding after sex (included by preference): ${bleedingAfterSexDays.length} day(s)${bleedingAfterSexDays.length > 0 ? ` (${bleedingAfterSexDays.map((l) => l.date).join(', ')})` : ''}.`,
    );
  }
  lines.push('');

  // Part 5. Pain and symptoms (whole range + per period)
  lines.push(heading('5. Pain and symptoms', format, 2));
  const painScores = rangeLogs
    .map((l) => l.pain?.level)
    .filter((v): v is number => typeof v === 'number');
  if (painScores.length > 0) {
    const minPain = Math.min(...painScores);
    const maxPain = Math.max(...painScores);
    const medPain = medianNumber(painScores);
    lines.push(
      `- Pain scores logged (${painScores.length} days): min ${minPain}/10, median ${medPain}/10, max ${maxPain}/10.`,
    );
  } else {
    lines.push('- Pain scores logged: none in this range.');
  }

  const periodsInRange = episodeSummary.periodEpisodes.filter(
    (p) => p.endDate >= fromDate && p.startDate <= today,
  );
  if (periodsInRange.length > 0) {
    lines.push('- Pain per period:');
    for (const p of [...periodsInRange].reverse().slice(0, 12)) {
      lines.push(
        `  - Period starting ${p.startDate}: peak pain ${p.maxPain}/10, stopped normal activities=${p.anyStoppedActivities ? 'yes' : 'no'}, bleeding days=${p.knownBleedingDays}.`,
      );
    }
  }

  const symptomCounts = new Map<string, number>();
  for (const log of rangeLogs) {
    for (const key of log.symptoms) {
      symptomCounts.set(key, (symptomCounts.get(key) ?? 0) + 1);
    }
  }
  const rankedSymptoms = Array.from(symptomCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (rankedSymptoms.length > 0) {
    const summary = rankedSymptoms
      .map(([key, count]) => `${SYMPTOM_LABELS.get(key) ?? key} (${count})`)
      .join(', ');
    lines.push(`- Most common symptoms: ${summary}.`);
  } else {
    lines.push('- Symptoms logged: none in this range.');
  }
  lines.push('');

  // Part 6. Patterns the app found (Step 3: lead-in pattern only; wording states pattern, not proof)
  lines.push(heading('6. Patterns the app found', format, 2));
  const totalCyclesChecked =
    cycleSummary.cycles.filter((c) => !c.beforeBaseline).length +
    (cycleSummary.openCycle &&
    (cycleSummary.newBaselineDate === null ||
      cycleSummary.openCycle.startDate >= cycleSummary.newBaselineDate)
      ? 1
      : 0);
  if (leadIn.status === 'learned' && leadIn.offsetRangeDays && leadIn.medianOffsetDays !== null) {
    lines.push(
      `- Lead-in pattern (spotting or cramps of 3 or more before flow): seen in ${leadIn.cyclesWithSignal} of ${Math.max(leadIn.cyclesWithSignal, totalCyclesChecked)} cycle(s), typically ${leadIn.medianOffsetDays} days before flow starts (likely offset ${leadIn.offsetRangeDays[0]} to ${leadIn.offsetRangeDays[1]} days; ${leadIn.followedSignalEvents} of ${leadIn.totalSignalEvents} signal events followed by flow within 14 days). This is a pattern in logged data, not proof of cause.`,
    );
  } else if (leadIn.status === 'unreliable') {
    lines.push(
      `- Lead-in signals: spotting or cramps of 3 or more appeared before ${leadIn.cyclesWithSignal} cycle(s), but fewer than 60% of signal events (${leadIn.followedSignalEvents} of ${leadIn.totalSignalEvents}) were followed by flow within 14 days, so it is not used as a pattern.`,
    );
  } else if (leadIn.status === 'retired') {
    lines.push(
      `- Lead-in pattern: previously noted across ${leadIn.cyclesWithSignal} cycle(s), but missed its likely window in 2 of the last 3 uses ("This pattern is not holding.").`,
    );
  } else {
    lines.push(
      `- Lead-in pattern: not enough consistent cycles yet (${leadIn.cyclesWithSignal} of 4 cycles with pre-flow spotting or cramps of 3 or more).`,
    );
  }
  lines.push('');

  // Part 7. Flags raised (respects includeVerdicts toggle)
  if (includeVerdicts) {
    lines.push(heading('7. Flags raised', format, 2));
    if (triage.standingFlags.length > 0) {
      lines.push('- Standing history flags:');
      for (const s of triage.standingFlags) {
        lines.push(`  - ${s.ruleId}: ${s.title} — ${s.reason}`);
      }
    }

    const storedEvents = verdicts.filter(
      (v) => v.at.slice(0, 10) >= fromDate && v.at.slice(0, 10) <= today,
    );
    const eventRows: string[] = [];
    const seenKeys = new Set<string>();

    for (const v of storedEvents) {
      const key = v.triggerKey ?? `${v.at}:${v.ruleIds.join(',')}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const status = v.closedByVisit
        ? `closed by doctor visit (${v.closedByVisit})`
        : v.dismissedAt
          ? `acknowledged (${v.dismissedAt.slice(0, 10)})`
          : 'open / recorded';
      eventRows.push(
        `  - ${v.at.slice(0, 10)} [${v.level}] ${v.ruleIds.join(', ') || 'none'}: ${v.reasons.join(' ')} — ${status}.`,
      );
    }
    for (const ev of triage.firedEventRules) {
      if (seenKeys.has(ev.triggerKey)) continue;
      seenKeys.add(ev.triggerKey);
      const isClosedByVisit = visits.some((v) => v.date >= ev.triggerDate);
      const status = isClosedByVisit ? 'doctor visit logged after trigger' : 'open';
      eventRows.push(
        `  - ${ev.triggerDate} [orange] ${ev.ruleId}: ${ev.reason} — ${status}.`,
      );
    }
    if (triage.today.ruleIds.length > 0 && triage.today.level !== 'green') {
      eventRows.push(
        `  - ${today} [${triage.today.level}] ${triage.today.ruleIds.join(', ')}: ${triage.today.reasons.join(' ')} — active today.`,
      );
    }

    if (eventRows.length > 0) {
      lines.push('- Verdict and event log:');
      lines.push(...eventRows);
    } else {
      lines.push('- Verdict and event flags: none raised in this range.');
    }
    lines.push('');
  }

  // Part 10. Tests, medicines and visits
  lines.push(heading('10. Tests, medicines and visits', format, 2));
  const testLogs = rangeLogs.filter((l) => l.test?.kind === 'pregnancy');
  if (testLogs.length > 0) {
    for (const t of testLogs) {
      lines.push(`- Pregnancy test on ${t.date}: ${t.test?.result}`);
    }
  } else {
    lines.push('- Pregnancy tests: none logged in this range.');
  }

  const rangeVisits = visits
    .filter((v) => v.date >= fromDate && v.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rangeVisits.length > 0) {
    for (const v of rangeVisits) {
      lines.push(`- Doctor visit on ${v.date}: ${v.note.trim() || 'No note'}`);
    }
  } else {
    lines.push('- Doctor visits: none logged in this range.');
  }

  const medSummary = summarizeMedicinesForRange(medicines, fromDate, today);
  if (options.includeMedicines) {
    if (medSummary.asNeeded.length > 0) {
      lines.push('- As-needed medicines (sums of entries logged):');
      for (const item of medSummary.asNeeded) {
        const label = item.genericName
          ? `${item.genericName} (${item.shownNames.join(', ')})`
          : item.shownNames.join(', ');
        const mgPart =
          item.totalMg > 0 ? `${item.totalMg} mg from entered strengths` : 'strength not given';
        const ungivenPart =
          item.dosesWithoutStrength > 0 && item.totalMg > 0
            ? ` (+${item.dosesWithoutStrength} without strength)`
            : '';
        lines.push(
          `  - ${label}: ${item.totalDoses} doses across ${item.daysWithDose} days (~${item.weeklyAverageDoses}/week), ${mgPart}${ungivenPart}; helped: yes=${item.helpedCounts.yes}, a little=${item.helpedCounts['a-little']}, no=${item.helpedCounts.no}, unsure=${item.helpedCounts.unsure}.`,
        );
      }
    } else {
      lines.push('- As-needed medicines: none logged in this range.');
    }

    if (medSummary.courses.length > 0) {
      lines.push('- Regular medicine courses:');
      for (const c of medSummary.courses) {
        lines.push(
          `  - ${c.nameShown}${c.genericName ? ` (${c.genericName})` : ''}: started ${c.startDate}, ${c.stopDate ? `stopped ${c.stopDate}` : 'ongoing'}.`,
        );
      }
    }
    lines.push('- Note: Medicine totals are sums of her own entries, with no assessment of amount.');
  }
  lines.push('');

  // Part 11. Questions to ask (conditions named ONLY here as things to ask a doctor)
  lines.push(heading('11. Questions to ask', format, 2));
  const firedRuleSet = new Set<RuleId>([
    ...triage.standingFlags.map((s) => s.ruleId),
    ...triage.firedEventRules.map((e) => e.ruleId),
    ...triage.firedTodayRules,
    ...verdicts.flatMap((v) => v.ruleIds),
  ]);
  const questionsToAsk: string[] = [];

  if (firedRuleSet.has('STD-01') || firedRuleSet.has('STD-02') || firedRuleSet.has('STD-03')) {
    if (minCycle !== null && maxCycle !== null && minCycle !== maxCycle) {
      questionsToAsk.push(
        `My cycles range from ${minCycle} to ${maxCycle} days. What could explain that, and would any blood tests (for example thyroid and hormone levels) or an ultrasound help?`,
      );
    } else {
      questionsToAsk.push(
        'My cycle lengths or gaps vary. What could explain that, and would any blood tests (for example thyroid and hormone levels) or an ultrasound help?',
      );
    }
  }
  if (firedRuleSet.has('STD-04') || firedRuleSet.has('ORG-03')) {
    questionsToAsk.push(
      `I went ${longestGap} days without a period. Should anything be checked?`,
    );
  }
  const hasProlongedWithAnemiaSigns =
    firedRuleSet.has('ORG-01') &&
    rangeLogs.some(
      (l) =>
        l.danger.includes('unusual-tiredness') ||
        l.danger.includes('very-pale') ||
        l.danger.includes('breathless-on-effort'),
    );
  if (firedRuleSet.has('ORG-02') || firedRuleSet.has('ORG-10') || hasProlongedWithAnemiaSigns) {
    questionsToAsk.push(
      'My periods are heavy. Could my iron be low, and should I have a blood count?',
    );
  }
  if (firedRuleSet.has('ORG-09')) {
    const painfulPeriods = periodsInRange.filter(
      (p) => p.maxPain >= 7 || p.anyStoppedActivities,
    );
    const maxPeriodPain =
      painfulPeriods.length > 0 ? Math.max(...painfulPeriods.map((p) => p.maxPain)) : 7;
    questionsToAsk.push(
      `My pain reached ${maxPeriodPain} out of 10 in ${Math.max(2, painfulPeriods.length)} periods. What could cause this, and what can help?`,
    );
  }
  if (firedRuleSet.has('STD-06') || firedRuleSet.has('ORG-06') || firedRuleSet.has('ORG-07')) {
    if (allowIntimacyExport || firedRuleSet.has('ORG-06')) {
      questionsToAsk.push(
        'I have bleeding between periods or after sex. Do I need an examination?',
      );
    } else {
      questionsToAsk.push('I have bleeding between periods. Do I need an examination?');
    }
  }
  const nonPeriodStoolDays = rangeLogs.filter(
    (l) =>
      l.stoolBlood === 'back-passage' &&
      (l.flow === 'none' || l.flow === 'spotting' || l.flow === null),
  ).length;
  const allStoolDays = rangeLogs.filter((l) => l.stoolBlood === 'back-passage').length;
  if (firedRuleSet.has('ORG-12') || nonPeriodStoolDays > 0 || allStoolDays > 2) {
    questionsToAsk.push(
      `I saw blood in my stool on ${Math.max(1, allStoolDays)} day(s). Should this be checked separately?`,
    );
  }
  if (options.includeMedicines) {
    const painMeds = medSummary.asNeeded.filter((item) =>
      medicines.some(
        (m) =>
          m.kind === 'dose' &&
          m.category === 'pain-relief' &&
          m.date >= fromDate &&
          m.date <= today &&
          (m.genericName ?? m.nameShown) === (item.genericName ?? item.shownNames[0]),
      ),
    );
    if (painMeds.length > 0) {
      const names = painMeds.map((p) => p.shownNames.join(' / ')).join(', ');
      const uniqueDays = new Set(
        medicines
          .filter(
            (m) =>
              m.kind === 'dose' &&
              m.category === 'pain-relief' &&
              m.date >= fromDate &&
              m.date <= today,
          )
          .map((m) => m.date),
      ).size;
      questionsToAsk.push(
        `I take ${names} for pain on ${uniqueDays} day(s). Is this the right medicine and amount for me, and is there anything better?`,
      );
    }

    const changedHormones = medSummary.courses.filter((c) => {
      const raw = medicines.find((m) => m.id === c.id);
      if (!raw || raw.category !== 'hormone') return false;
      return (
        (c.startDate >= fromDate && c.startDate <= today) ||
        (c.stopDate !== null && c.stopDate >= fromDate && c.stopDate <= today)
      );
    });
    for (const h of changedHormones) {
      const changeDate =
        h.stopDate !== null && h.stopDate >= fromDate && h.stopDate <= today
          ? h.stopDate
          : h.startDate;
      const actionVerb =
        h.stopDate !== null && h.stopDate === changeDate ? 'stopped' : 'started';
      questionsToAsk.push(
        `I ${actionVerb} ${h.nameShown} on ${changeDate}. How should that change my cycles?`,
      );
    }
  }

  if (questionsToAsk.length > 0) {
    for (const q of questionsToAsk) {
      lines.push(`- "${q}"`);
    }
  } else {
    lines.push('- No specific flag-triggered questions in this range.');
  }
  lines.push('');

  // Part 12. Data quality
  lines.push(heading('12. Data quality', format, 2));
  const daysCovered = Math.max(1, diffDays(fromDate, today) + 1);
  const approxCount = rangeLogs.filter((l) => l.filledFrom === 'approximate').length;
  const backfillCount = rangeLogs.filter((l) => l.filledFrom === 'backfill').length;
  const checkDateCycles = cycleSummary.cycles.filter((c) => c.dateCheckFlag !== null).length;
  let gapDaysOver2 = 0;
  for (let i = 1; i < rangeLogs.length; i++) {
    const prev = rangeLogs[i - 1];
    const curr = rangeLogs[i];
    if (!prev || !curr) continue;
    const gap = diffDays(prev.date, curr.date) - 1;
    if (gap >= 2) gapDaysOver2 += 1;
  }
  lines.push(`- Days logged: ${rangeLogs.length} out of ${daysCovered} days in range.`);
  lines.push(`- Approximate entries: ${approxCount}. Backfilled entries: ${backfillCount}.`);
  lines.push(`- Multi-day gaps (2 or more unlogged days between logs): ${gapDaysOver2}.`);
  if (checkDateCycles > 0) {
    lines.push(`- Cycles flagged "check this date" (<10 or >200 days): ${checkDateCycles}.`);
  }
  lines.push('');

  // Plain Daily log table of last 3 months
  const tableFrom = addDays(today, -89);
  const tableStart = fromDate > tableFrom ? fromDate : tableFrom;
  const tableLogs = sortedLogs.filter((l) => l.date >= tableStart && l.date <= today);

  lines.push(heading('Daily log (last 3 months)', format, 2));
  if (tableLogs.length === 0) {
    lines.push('No day logs in the last 3 months.');
  } else {
    const medsByDate = new Map<DateKey, MedicineEntry[]>();
    if (options.includeMedicines) {
      for (const m of medicines) {
        if (m.kind !== 'dose') continue;
        const arr = medsByDate.get(m.date) ?? [];
        arr.push(m);
        medsByDate.set(m.date, arr);
      }
    }

    if (format === 'md') {
      lines.push(
        '| Date | Flow | Protection | Clots | Pain | Symptoms | Danger signs | Medicines | Note |',
      );
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    }

    for (const log of tableLogs) {
      const flowStr = log.flow ?? 'unlogged';
      const protStr = log.protection ?? '-';
      const clotsStr = log.clots ?? '-';
      const painStr = log.pain ? `${log.pain.level}/10` : '-';
      const symStr =
        log.symptoms.length > 0
          ? log.symptoms.map((s) => SYMPTOM_LABELS.get(s) ?? s).join('; ')
          : '-';
      const dangerStr =
        log.danger.length > 0
          ? log.danger.join('; ')
          : log.dangerAnswered
            ? 'none'
            : '-';
      const dayMeds = medsByDate.get(log.date) ?? [];
      const medStr = options.includeMedicines
        ? dayMeds.length > 0
          ? dayMeds
              .map((m) => `${m.genericName ?? m.nameShown} x${m.units ?? 1}`)
              .join('; ')
          : '-'
        : '(omitted)';
      const intimacyBit =
        allowIntimacyExport && log.intimacy
          ? ` [intimacy: ${log.intimacy.event}${log.intimacy.bleedingAfter ? ', bleeding after' : ''}${log.intimacy.painDuring ? ', pain during' : ''}]`
          : '';
      const noteStr = options.includeNotes
        ? escapeCell(`${log.note || '-'}${intimacyBit}`)
        : allowIntimacyExport && intimacyBit
          ? escapeCell(intimacyBit.trim())
          : '(omitted)';

      if (format === 'md') {
        lines.push(
          `| ${log.date} | ${flowStr} | ${protStr} | ${clotsStr} | ${painStr} | ${escapeCell(symStr)} | ${escapeCell(dangerStr)} | ${escapeCell(medStr)} | ${noteStr} |`,
        );
      } else {
        lines.push(
          `${log.date} | flow=${flowStr} | prot=${protStr} | clots=${clotsStr} | pain=${painStr} | symptoms=${symStr} | danger=${dangerStr} | meds=${medStr} | note=${noteStr}`,
        );
      }
    }
  }
  lines.push('');

  // Footer
  lines.push(heading('About this file', format, 2));
  lines.push(
    '- Disclaimer: Moonroot is a private journal that records symptoms and sorts urgency. It does not diagnose any condition.',
  );
  lines.push(
    `- Version: Moonroot ${appVersion} · rules ${RULESET_VERSION} · Clinician review: Not yet clinician reviewed`,
  );
  lines.push('');

  // Machine-readable block
  const machinePayload = {
    schemaVersion: profile?.schemaVersion ?? 1,
    rulesetVersion: RULESET_VERSION,
    clinicianReviewed: false,
    generated: today,
    range: { from: fromDate, to: today },
    daysLogged: rangeLogs.length,
    daysCovered,
    symptomCounts: Object.fromEntries(rankedSymptoms),
    painSummary:
      painScores.length > 0
        ? {
            days: painScores.length,
            min: Math.min(...painScores),
            median: medianNumber(painScores),
            max: Math.max(...painScores),
          }
        : null,
    cyclesSummary: {
      validCyclesCount: validCycles.length,
      validCycleLengths: statLengths,
      baselineDate: cycleSummary.newBaselineDate,
      daysSinceLastStart: cycleSummary.daysSinceLastPeriodStart,
      longestGapDays: longestGap,
    },
    confidenceScore: confidenceSummary.score,
    leadInPattern: {
      status: leadIn.status,
      cyclesWithSignal: leadIn.cyclesWithSignal,
      totalSignalEvents: leadIn.totalSignalEvents,
      followedSignalEvents: leadIn.followedSignalEvents,
      offsetRangeDays: leadIn.offsetRangeDays,
    },
    standingFlags: triage.standingFlags.map((s) => ({
      ruleId: s.ruleId,
      title: s.title,
      reason: s.reason,
    })),
    openEventIds: triage.openEvents.flatMap((e) => e.ruleIds),
    medicinesSummary: options.includeMedicines ? medSummary : null,
  };

  lines.push(heading('Machine-readable data', format, 2));
  if (format === 'md') {
    lines.push('```json', JSON.stringify(machinePayload, null, 2), '```');
  } else {
    lines.push(JSON.stringify(machinePayload, null, 2));
  }
  lines.push('');

  return {
    filename: `moonroot-doctor-${today}.${format}`,
    content: lines.join('\n'),
  };
}
