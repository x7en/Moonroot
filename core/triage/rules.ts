import type {
  DangerSign,
  DateKey,
  DayLog,
  Level,
  MedicineEntry,
  Profile,
  RuleId,
  WatchItem,
} from '../model/types';
import { THRESHOLDS } from './thresholds';

export type SourceKey =
  | 'ACOG'
  | 'FIGO'
  | 'NHS Wales'
  | 'Merck'
  | 'Healthline'
  | 'NHS ectopic'
  | 'NI Direct TSS'
  | 'Std'
  | 'This app';

export type RuleInputField =
  | 'dayLog.flow'
  | 'dayLog.protection'
  | 'dayLog.soakedPerHour'
  | 'dayLog.changeEvery'
  | 'dayLog.flooding'
  | 'dayLog.doubleProtection'
  | 'dayLog.clots'
  | 'dayLog.colour'
  | 'dayLog.discharge'
  | 'dayLog.pain.level'
  | 'dayLog.pain.sites'
  | 'dayLog.pain.sudden'
  | 'dayLog.pain.stoppedActivities'
  | 'dayLog.pain.reliefHelped'
  | 'dayLog.danger'
  | 'dayLog.dangerAnswered'
  | 'dayLog.fever.c'
  | 'dayLog.fever.felt'
  | 'dayLog.pregnancyChance'
  | 'dayLog.stoolBlood'
  | 'dayLog.test.result'
  | 'dayLog.context.stress'
  | 'dayLog.context.illness'
  | 'dayLog.context.travel'
  | 'dayLog.context.weightChange'
  | 'dayLog.context.medicationChange'
  | 'dayLog.context.emergencyContraception'
  | 'dayLog.intimacy.event'
  | 'dayLog.intimacy.bleedingAfter'
  | 'dayLog.intimacy.painDuring'
  | 'profile.birthYear'
  | 'profile.menarcheAge'
  | 'profile.onHormones'
  | 'profile.contraception'
  | 'profile.sexualHealthQuestions'
  | 'profile.intimacy'
  | 'medicineEntry.hormoneActive'
  | 'cycle.derived'
  | 'episode.derived'
  | 'forecast.derived'
  | 'decision.new-baseline'
  | 'watchItem.checks'
  | 'verdict.openEvents';

export interface RuleExampleSnapshot {
  today: DateKey;
  profile?: Partial<Profile>;
  dayLog?: Partial<DayLog>;
  recentLogs?: Partial<DayLog>[];
  medicines?: Partial<MedicineEntry>[];
  watchItems?: Partial<WatchItem>[];
  derived?: {
    cycleLengths?: number[];
    daysSinceLastPeriodStart?: number;
    currentEpisodeBleedingDays?: number;
    recentPeriodsCount?: number;
    periodsInLast12Months?: number;
    maxGapInLast12Months?: number;
    heavyEpisodesInLast3?: number;
    painfulEpisodesInLast3?: number;
    prolongedOrHeavyOrPainfulInLast3?: number;
    intermenstrualSpottingIn90Days?: number;
    bleedingAfterSexIn90Days?: number;
    bleedingAfterSexWithPainIn90Days?: number;
    inPossibleWindow?: boolean;
    matchesLeadInPattern?: boolean;
    consistencyS?: number;
    cyclesTotalCount?: number;
    openEventCount?: number;
    medianCycleLength?: number;
    daysSinceLastRiskEvent?: number;
    hasNegativeTestInLast14Days?: boolean;
    daysSinceLatestNegativeTest?: number;
  };
}

export interface RuleExample {
  id: string;
  kind: 'fires' | 'below-threshold' | 'unsure' | 'conservative-default';
  label: string;
  input: RuleExampleSnapshot;
  expectedFires: boolean;
}

export interface TriageRuleDefinition {
  id: RuleId;
  level: Level | 'standing';
  kind: 'today' | 'event' | 'standing' | 'supporting';
  sourceKey: SourceKey;
  reviewStatus: 'unreviewed';
  specMarker?: 'new' | 'changed' | 'user-decision';
  clinicalReviewNote?: string;
  plainCondition: string;
  thresholdDescription: string;
  title: string;
  reasonTemplate: string;
  wordsShown: string;
  genericWordsShown?: string;
  actionPrepend?: string;
  hormoneNote?: string;
  inputsRead: readonly RuleInputField[];
  dangerSignsRead: readonly DangerSign[];
  examples: readonly RuleExample[];
}

const BASE_DATE = '2026-10-30';

export const RULES_TABLE: readonly TriageRuleDefinition[] = [
  // =========================================================================
  // RED RULES: Get care today
  // =========================================================================
  {
    id: 'RED-01',
    level: 'red',
    kind: 'today',
    sourceKey: 'Healthline',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'ACOG cites >1 pad every 1-2h; Healthline cites hourly for >2h.',
    plainCondition: 'Soaking 1 or more pads or tampons an hour for 2 or more hours in a row.',
    thresholdDescription: `soakedPerHour === true (>= ${THRESHOLDS.SOAKING_CONSECUTIVE_HOURS_MIN} consecutive hours)`,
    title: 'Get care today',
    reasonTemplate: 'Because you logged soaking a pad or tampon every hour for 2 hours or more.',
    wordsShown:
      'Heavy bleeding this fast needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.soakedPerHour'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'RED-01-fires',
        kind: 'fires',
        label: 'At threshold: soaked >= 1 product/hr for 2+ hours',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'heavy', soakedPerHour: true, danger: [], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'RED-01-below',
        kind: 'below-threshold',
        label: 'Below threshold: changing every 1-2 hours, not soaking hourly for 2h',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'heavy',
            soakedPerHour: false,
            changeEvery: 'under-2h',
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-02',
    level: 'red',
    kind: 'today',
    sourceKey: 'Healthline',
    reviewStatus: 'unreviewed',
    plainCondition:
      'Medium or heavy flow with dizziness, fainting, shortness of breath or chest pain.',
    thresholdDescription:
      "flow in ['medium', 'heavy'] and danger includes dizzy, fainted, short-of-breath, or chest-pain",
    title: 'Get care today',
    reasonTemplate: 'Because you logged medium or heavy bleeding with a warning sign.',
    wordsShown:
      'Bleeding with dizziness, fainting, trouble breathing or chest pain needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.flow', 'dayLog.danger'],
    dangerSignsRead: ['dizzy', 'fainted', 'short-of-breath', 'chest-pain'],
    examples: [
      {
        id: 'RED-02-fires',
        kind: 'fires',
        label: 'At threshold: medium flow + dizzy',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'medium', danger: ['dizzy'], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'RED-02-below',
        kind: 'below-threshold',
        label: 'Below threshold: light flow + dizzy (does not meet RED-02 medium/heavy)',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'light', danger: ['dizzy'], dangerAnswered: true },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-03',
    level: 'red',
    kind: 'today',
    sourceKey: 'NHS ectopic',
    reviewStatus: 'unreviewed',
    plainCondition:
      'Sudden, intense belly pain of 8 out of 10 or more, with dizziness, fainting, nausea or looking very pale.',
    thresholdDescription: `pain.level >= ${THRESHOLDS.SEVERE_PAIN_MIN} and pain.sudden === true and danger includes dizzy, fainted, nausea, or very-pale`,
    title: 'Get care today',
    reasonTemplate: 'Because you logged sudden severe pain with a warning sign.',
    wordsShown:
      'Sudden, severe belly pain with dizziness, fainting, nausea or paleness needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    genericWordsShown:
      'Sudden, severe or one-sided belly pain needs same-day care, whatever the cause. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.pain.level', 'dayLog.pain.sudden', 'dayLog.pain.sites', 'dayLog.danger'],
    dangerSignsRead: ['dizzy', 'fainted', 'nausea', 'very-pale'],
    examples: [
      {
        id: 'RED-03-fires',
        kind: 'fires',
        label: 'At threshold: sudden pain 8/10 + nausea',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 8, sites: ['lower-middle'], sudden: true },
            danger: ['nausea'],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-03-below-pain',
        kind: 'below-threshold',
        label: 'Below threshold: sudden pain 7/10 + nausea (ORG-14 applies instead)',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 7, sites: ['lower-middle'], sudden: true },
            danger: ['nausea'],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
      {
        id: 'RED-03-below-not-sudden',
        kind: 'below-threshold',
        label: 'Below threshold: pain 8/10 not sudden + nausea',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 8, sites: ['lower-middle'], sudden: false, reliefHelped: 'none-taken' },
            danger: ['nausea'],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-04',
    level: 'red',
    kind: 'today',
    sourceKey: 'NHS ectopic',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'User decision #3 (unreviewed): pain threshold set to pain.level >= 1; shoulder-tip added to PainSite.',
    plainCondition:
      'One-sided or shoulder-tip pain (1+ out of 10), or any pain (1+) with bleeding or brown discharge, when pregnancy is possible or a test is positive.',
    thresholdDescription: `pain.level >= ${THRESHOLDS.ANY_PAIN_MIN} and (sites includes left/right/shoulder-tip OR bleeding/brown discharge) and (pregnancy possible or test positive)`,
    title: 'Get care today',
    reasonTemplate:
      'Because you logged one-sided or shoulder-tip pain, or pain with bleeding, when pregnancy may be possible.',
    wordsShown:
      'This kind of pain when pregnancy is possible needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    genericWordsShown:
      'Sudden, severe or one-sided belly pain needs same-day care, whatever the cause. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'dayLog.pain.level',
      'dayLog.pain.sites',
      'dayLog.flow',
      'dayLog.colour',
      'dayLog.discharge',
      'dayLog.pregnancyChance',
      'dayLog.test.result',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'RED-04-fires-shoulder',
        kind: 'fires',
        label: 'At threshold: pain 1/10 at shoulder-tip with pregnancyChance=yes',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'none',
            pain: { level: 1, sites: ['shoulder-tip'] },
            pregnancyChance: 'yes',
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-04-fires-bleeding',
        kind: 'fires',
        label: 'At threshold: pain 2/10 lower-middle with spotting and pregnancyChance=yes',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'spotting',
            pain: { level: 2, sites: ['lower-middle'] },
            pregnancyChance: 'yes',
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-04-below-no-pain',
        kind: 'below-threshold',
        label: 'Below threshold: pain 0/10 with spotting and pregnancyChance=yes',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'spotting',
            pain: { level: 0, sites: [] },
            pregnancyChance: 'yes',
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-05',
    level: 'red',
    kind: 'today',
    sourceKey: 'NHS ectopic',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote: 'User decision #3 (unreviewed): any pain means pain.level >= 1.',
    plainCondition: 'A positive pregnancy test with bleeding or pain (1+ out of 10).',
    thresholdDescription: `test.result === 'positive' and (bleeding flow or pain.level >= ${THRESHOLDS.ANY_PAIN_MIN})`,
    title: 'Get care today',
    reasonTemplate: 'Because you logged a positive pregnancy test with bleeding or pain.',
    wordsShown:
      'Bleeding or pain with a positive pregnancy test needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.test.result', 'dayLog.flow', 'dayLog.pain.level'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'RED-05-fires',
        kind: 'fires',
        label: 'At threshold: positive pregnancy test + pain 1/10',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 1, sites: ['lower-middle'] },
            test: { kind: 'pregnancy', result: 'positive' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-05-below',
        kind: 'below-threshold',
        label: 'Below threshold: positive pregnancy test with no bleeding and pain 0/10 (ORG-11 instead)',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            test: { kind: 'pregnancy', result: 'positive' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-06',
    level: 'red',
    kind: 'today',
    sourceKey: 'NI Direct TSS',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'User decision #2 (unreviewed): fever.felt === true without fever.c counts as fever present; measured fever.c overrides felt.',
    plainCondition:
      'Tampon or cup in use with fever of 39 °C or more (or feeling feverish with no temperature measured), or with a sunburn-like rash, vomiting, diarrhoea, dizziness, fainting or confusion.',
    thresholdDescription: `protection in ['tampon', 'cup'] and (fever.c >= ${THRESHOLDS.TSS_FEVER_C_MIN} or (!fever.c && fever.felt) or danger in [sunburn-rash, vomiting, diarrhoea, dizzy, fainted, confused])`,
    title: 'Get care today',
    reasonTemplate:
      'Because you logged using a tampon or cup with a high fever, feeling feverish, or a warning sign.',
    actionPrepend: 'Remove the tampon or cup now.',
    wordsShown:
      'Remove the tampon or cup now. These signs with a tampon or cup need urgent medical care today. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.protection', 'dayLog.fever.c', 'dayLog.fever.felt', 'dayLog.danger'],
    dangerSignsRead: [
      'sunburn-rash',
      'vomiting',
      'diarrhoea',
      'dizzy',
      'fainted',
      'confused',
    ],
    examples: [
      {
        id: 'RED-06-fires-temp',
        kind: 'fires',
        label: 'At threshold: tampon + fever 39.0 °C',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'medium',
            protection: 'tampon',
            fever: { c: 39.0 },
            pain: { level: 2, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-06-fires-felt',
        kind: 'conservative-default',
        label: 'Conservative default: cup + felt feverish with no measured temperature',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'medium',
            protection: 'cup',
            fever: { felt: true },
            pain: { level: 2, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-06-below-temp',
        kind: 'below-threshold',
        label: 'Below threshold: tampon + measured fever 38.9 °C and no danger signs',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'medium',
            protection: 'tampon',
            fever: { c: 38.9, felt: true },
            pain: { level: 2, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-07',
    level: 'red',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'User decisions #2 & #3 (unreviewed): felt fever without temp counts as fever; lower belly pain means level >= 1 at lower-middle, left, right, or whole-belly.',
    plainCondition:
      'Fever of 38 °C or more (or feeling feverish with no temperature measured) with lower belly pain (1+) or smelly or yellow-green discharge.',
    thresholdDescription: `(fever.c >= ${THRESHOLDS.INFECTION_FEVER_C_MIN} or (!fever.c && fever.felt)) and ((pain.level >= ${THRESHOLDS.ANY_PAIN_MIN} and lower belly site) or discharge in ['odour', 'yellow-green'])`,
    title: 'Get care today',
    reasonTemplate:
      'Because you logged a fever or feeling feverish with lower belly pain or unusual discharge.',
    wordsShown:
      'Fever with lower belly pain or unusual discharge needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'dayLog.fever.c',
      'dayLog.fever.felt',
      'dayLog.pain.level',
      'dayLog.pain.sites',
      'dayLog.discharge',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'RED-07-fires-temp',
        kind: 'fires',
        label: 'At threshold: fever 38.0 °C + lower-middle pain 1/10',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            fever: { c: 38.0 },
            pain: { level: 1, sites: ['lower-middle'] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-07-fires-felt',
        kind: 'conservative-default',
        label: 'Conservative default: felt feverish (no temp) + yellow-green discharge',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            fever: { felt: true },
            discharge: 'yellow-green',
            pain: { level: 0, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-07-below-temp',
        kind: 'below-threshold',
        label: 'Below threshold: measured fever 37.9 °C + lower-middle pain 2/10',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            fever: { c: 37.9, felt: true },
            pain: { level: 2, sites: ['lower-middle'] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-08',
    level: 'red',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    clinicalReviewNote:
      'Pain >= 8 with reliefHelped === "none-taken" does not fire until a clinician sets a level (Open decisions).',
    plainCondition: 'Pain of 8 out of 10 or more that usual pain medicine does not ease.',
    thresholdDescription: `pain.level >= ${THRESHOLDS.SEVERE_PAIN_MIN} and pain.reliefHelped in ['no', 'unsure']`,
    title: 'Get care today',
    reasonTemplate: 'Because you logged severe pain that pain medicine has not eased.',
    wordsShown:
      'Severe pain that pain medicine does not ease needs medical care today. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.pain.level', 'dayLog.pain.reliefHelped'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'RED-08-fires-no',
        kind: 'fires',
        label: 'At threshold: pain 8/10 + reliefHelped=no',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'heavy',
            pain: { level: 8, sites: ['lower-middle'], reliefHelped: 'no' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-08-fires-unsure',
        kind: 'unsure',
        label: 'Unsure counts conservatively: pain 8/10 + reliefHelped=unsure',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'heavy',
            pain: { level: 8, sites: ['lower-middle'], reliefHelped: 'unsure' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-08-below-none-taken',
        kind: 'below-threshold',
        label: 'Below threshold: pain 8/10 + reliefHelped=none-taken',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'heavy',
            pain: { level: 8, sites: ['lower-middle'], reliefHelped: 'none-taken' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-09',
    level: 'red',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote: 'Added 8 Nov 2026 as a catch-all safety net; clinician to review.',
    plainCondition:
      'Any one of fainting, chest pain, trouble breathing or confusion, whatever else is logged.',
    thresholdDescription: "danger includes any of ['fainted', 'chest-pain', 'short-of-breath', 'confused']",
    title: 'Get care today',
    reasonTemplate: 'Because you logged a serious warning sign.',
    wordsShown:
      'Fainting, chest pain, trouble breathing or confusion needs medical care today. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.danger'],
    dangerSignsRead: ['fainted', 'chest-pain', 'short-of-breath', 'confused'],
    examples: [
      {
        id: 'RED-09-fires-alone',
        kind: 'fires',
        label: 'At threshold: fainted ticked even with no flow and no pain',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, danger: ['fainted'], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'RED-09-below',
        kind: 'below-threshold',
        label: 'Below threshold: dizzy alone with no flow and no pain',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, danger: ['dizzy'], dangerAnswered: true },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-10',
    level: 'red',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote: 'Added 8 Nov 2026; works regardless of pregnancy settings.',
    plainCondition:
      'Sudden one-sided belly pain of 4 or more with vomiting, whether or not pregnancy is possible.',
    thresholdDescription: `pain.level >= ${THRESHOLDS.PAIN_FOLLOWUP_MIN} and pain.sudden === true and sites includes left or right and danger includes vomiting`,
    title: 'Get care today',
    reasonTemplate: 'Because you logged sudden one-sided belly pain with vomiting.',
    wordsShown:
      'Sudden one-sided belly pain with vomiting needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.pain.level', 'dayLog.pain.sudden', 'dayLog.pain.sites', 'dayLog.danger'],
    dangerSignsRead: ['vomiting'],
    examples: [
      {
        id: 'RED-10-fires',
        kind: 'fires',
        label: 'At threshold: sudden right-sided pain 4/10 + vomiting',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 4, sites: ['right'], sudden: true },
            danger: ['vomiting'],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-10-below-pain',
        kind: 'below-threshold',
        label: 'Below threshold: sudden right-sided pain 3/10 + vomiting',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 3, sites: ['right'], sudden: true },
            danger: ['vomiting'],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'RED-11',
    level: 'red',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote: 'Added 8 Nov 2026 for hormone medicine that may contain oestrogen.',
    plainCondition:
      'Taking hormone medicine that may contain oestrogen, with leg pain or swelling, a sudden severe headache, or a sudden change in vision.',
    thresholdDescription:
      'oestrogen-possible profile or active hormone course AND danger includes leg-pain-or-swelling, severe-headache, or vision-change',
    title: 'Get care today',
    reasonTemplate:
      'Because you logged a warning sign while taking hormone medicine that may contain oestrogen.',
    wordsShown:
      'Leg pain or swelling, a sudden severe headache or a sudden vision change while on hormone medicine needs same-day medical care. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'profile.onHormones',
      'profile.contraception',
      'medicineEntry.hormoneActive',
      'dayLog.danger',
    ],
    dangerSignsRead: ['leg-pain-or-swelling', 'severe-headache', 'vision-change'],
    examples: [
      {
        id: 'RED-11-fires',
        kind: 'fires',
        label: 'At threshold: combined pill + leg pain or swelling',
        input: {
          today: BASE_DATE,
          profile: { onHormones: true, contraception: 'combined-pill' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            danger: ['leg-pain-or-swelling'],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'RED-11-below-progestin',
        kind: 'below-threshold',
        label: 'Below threshold: progestin-only pill (no oestrogen) + leg pain or swelling',
        input: {
          today: BASE_DATE,
          profile: { onHormones: true, contraception: 'progestin-pill' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            danger: ['leg-pain-or-swelling'],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },

  // =========================================================================
  // ORANGE RULES: See a doctor soon
  // =========================================================================
  {
    id: 'ORG-01',
    level: 'orange',
    kind: 'event',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'User decision #4 (unreviewed): counts known bleeding days (flow !== "none") > 7 within the confirmed period episode, excluding unlogged days and explicit none days. Clinician to also supply upper day count where prolonged bleeding becomes red.',
    plainCondition: 'One period has more than 7 logged bleeding days.',
    thresholdDescription: `known bleeding days in period episode > ${THRESHOLDS.PERIOD_DURATION_DAYS_MAX_BEFORE_ORANGE}`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because this period has lasted more than 7 logged bleeding days.',
    wordsShown:
      'A period lasting more than 7 days is worth checking with a doctor in the next week or two. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['episode.derived', 'dayLog.flow'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-01-fires',
        kind: 'fires',
        label: 'At threshold: 8 known bleeding days in one period',
        input: {
          today: BASE_DATE,
          derived: { currentEpisodeBleedingDays: 8 },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-01-below',
        kind: 'below-threshold',
        label: 'Below threshold: 7 known bleeding days in one period',
        input: {
          today: BASE_DATE,
          derived: { currentEpisodeBleedingDays: 7 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-02',
    level: 'orange',
    kind: 'event',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Also cites ACOG and FIGO (clots > 2.5 cm, saturated within 3h).',
    plainCondition:
      'In one period: soaking more than 1 product every 1 to 2 hours, using two products at once, flooding, or clots bigger than about 2.5 cm.',
    thresholdDescription:
      "changeEvery === 'under-2h' || soakedPerHour === true || doubleProtection === true || flooding === true || clots === 'large'",
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged signs of heavy bleeding in this period.',
    wordsShown:
      'A doctor can help with bleeding this heavy. A visit in the next week or two is a good idea. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'episode.derived',
      'dayLog.changeEvery',
      'dayLog.soakedPerHour',
      'dayLog.doubleProtection',
      'dayLog.flooding',
      'dayLog.clots',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-02-fires-clots',
        kind: 'fires',
        label: 'At threshold: large clots (> ~2.5 cm) during period',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'heavy', clots: 'large', danger: [], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-02-below-small-clots',
        kind: 'below-threshold',
        label: 'Below threshold: small clots and changing every 2-3h (YEL-07 instead)',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'heavy',
            clots: 'small',
            changeEvery: '2-3h',
            flooding: false,
            doubleProtection: false,
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-03',
    level: 'orange',
    kind: 'event',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Also cites Merck (3 months without a period). Still active on hormone medicine.',
    plainCondition: '90 or more days since the last period start.',
    thresholdDescription: `daysSinceLastPeriodStart >= ${THRESHOLDS.AMENORRHEA_DAYS_MIN}`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because it has been 90 days or more since your last period started.',
    wordsShown:
      'Going 90 days without a period is worth checking with a doctor in the next week or two. If you are worried, see a doctor even if this looks fine.',
    hormoneNote:
      'Some hormone medicines stop periods. If that is expected for you, ask your doctor to confirm.',
    inputsRead: ['cycle.derived', 'profile.onHormones', 'medicineEntry.hormoneActive'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-03-fires',
        kind: 'fires',
        label: 'At threshold: 90 days since last period start',
        input: {
          today: BASE_DATE,
          derived: { daysSinceLastPeriodStart: 90 },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-03-below',
        kind: 'below-threshold',
        label: 'Below threshold: 89 days since last period start',
        input: {
          today: BASE_DATE,
          derived: { daysSinceLastPeriodStart: 89 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-04',
    level: 'orange',
    kind: 'event',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    plainCondition: '2 of the last 3 cycles were shorter than 21 days.',
    thresholdDescription: `>= ${THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT} of last ${THRESHOLDS.RECENT_CYCLES_WINDOW} valid cycles since baseline < ${THRESHOLDS.CYCLE_SHORT_DAYS_LT} days`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because 2 of your last 3 cycles were shorter than 21 days.',
    wordsShown:
      'Having cycles shorter than 21 days more than once is worth discussing with a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['cycle.derived', 'decision.new-baseline'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-04-fires',
        kind: 'fires',
        label: 'At threshold: 2 of last 3 cycles are 20 days',
        input: {
          today: BASE_DATE,
          derived: { cycleLengths: [28, 20, 20] },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-04-below',
        kind: 'below-threshold',
        label: 'Below threshold: 2 of last 3 cycles are 21 days',
        input: {
          today: BASE_DATE,
          derived: { cycleLengths: [28, 21, 21] },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-05',
    level: 'orange',
    kind: 'event',
    sourceKey: 'FIGO',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Uses ACOG (45 days) < 3 years after first period, FIGO (38 days) after or unknown.',
    plainCondition:
      '2 of the last 3 cycles were longer than the age limit (45 days up to 3 years after first period, 38 days after that or if unknown).',
    thresholdDescription: `>= ${THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT} of last ${THRESHOLDS.RECENT_CYCLES_WINDOW} cycles > ${THRESHOLDS.CYCLE_LONG_ADOLESCENT_DAYS_GT} (adolescent) or > ${THRESHOLDS.CYCLE_LONG_ADULT_DAYS_GT} (adult/unknown)`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because 2 of your last 3 cycles were longer than the usual range for your age.',
    wordsShown:
      'Repeated long gaps between periods are worth checking with a doctor in the next week or two. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['cycle.derived', 'decision.new-baseline', 'profile.birthYear', 'profile.menarcheAge'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-05-fires-adult',
        kind: 'fires',
        label: 'At threshold (adult): 2 of last 3 cycles are 39 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2004, menarcheAge: 13 },
          derived: { cycleLengths: [30, 39, 39] },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-05-below-adolescent',
        kind: 'below-threshold',
        label: 'Below threshold (within 3y of menarche): 2 cycles of 45 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2012, menarcheAge: 13 },
          derived: { cycleLengths: [32, 45, 45] },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-06',
    level: 'orange',
    kind: 'event',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition: 'Bleeding after sex 2 or more times in 3 months, or once with pain.',
    thresholdDescription: `within ${THRESHOLDS.BLEEDING_AFTER_SEX_WINDOW_DAYS} days: >= ${THRESHOLDS.BLEEDING_AFTER_SEX_COUNT_MIN} bleedingAfter events OR >= 1 with pain`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged bleeding after sex more than once, or with pain.',
    wordsShown:
      'Bleeding after sex with pain, or more than once, should be checked by a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'dayLog.intimacy.bleedingAfter',
      'dayLog.intimacy.painDuring',
      'dayLog.pain.level',
      'profile.birthYear',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-06-fires-pain',
        kind: 'fires',
        label: 'At threshold (adult): bleeding after sex once with pain',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', intimacy: { event: 'protected', bleedingAfter: true, painDuring: true } },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-06-below-once-no-pain',
        kind: 'below-threshold',
        label: 'Below threshold: bleeding after sex once without pain (YEL-05 instead)',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', intimacy: { event: 'protected', bleedingAfter: true, painDuring: false } },
          derived: { bleedingAfterSexIn90Days: 1, bleedingAfterSexWithPainIn90Days: 0 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-07',
    level: 'orange',
    kind: 'event',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition: 'Spotting not followed by flow within 14 days, 2 or more times in 3 months.',
    thresholdDescription: `>= ${THRESHOLDS.INTERMENSTRUAL_COUNT_MIN} spotting events in ${THRESHOLDS.INTERMENSTRUAL_WINDOW_DAYS} days with no flow within ${THRESHOLDS.INTERMENSTRUAL_FOLLOWUP_DAYS} days`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged spotting between periods more than once in the last 3 months.',
    wordsShown:
      'Repeated spotting between periods is worth checking with a doctor in the next week or two. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['episode.derived', 'dayLog.flow'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-07-fires',
        kind: 'fires',
        label: 'At threshold: 2 in-between spotting events in 90 days',
        input: {
          today: BASE_DATE,
          derived: { intermenstrualSpottingIn90Days: 2 },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-07-below',
        kind: 'below-threshold',
        label: 'Below threshold: 1 in-between spotting event in 90 days',
        input: {
          today: BASE_DATE,
          derived: { intermenstrualSpottingIn90Days: 1 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-08',
    level: 'orange',
    kind: 'event',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition: 'Spotting on 7 or more days in a row.',
    thresholdDescription: `consecutive days of flow === 'spotting' >= ${THRESHOLDS.SPOTTING_PROLONGED_DAYS_MIN}`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged spotting for 7 or more days in a row.',
    wordsShown:
      'Spotting for a week or more without turning into a period is worth checking with a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.flow', 'episode.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-08-fires',
        kind: 'fires',
        label: 'At threshold: 7 consecutive spotting days',
        input: {
          today: BASE_DATE,
          recentLogs: Array.from({ length: 7 }, (_, i) => ({
            date: `2026-10-${24 + i}`,
            flow: 'spotting' as const,
          })),
        },
        expectedFires: true,
      },
      {
        id: 'ORG-08-below',
        kind: 'below-threshold',
        label: 'Below threshold: 6 consecutive spotting days (YEL-01 instead)',
        input: {
          today: BASE_DATE,
          recentLogs: Array.from({ length: 6 }, (_, i) => ({
            date: `2026-10-${25 + i}`,
            flow: 'spotting' as const,
          })),
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-09',
    level: 'orange',
    kind: 'event',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition:
      'Pain of 7 out of 10 or more, or pain that stops normal activities, in 2 of the last 3 periods.',
    thresholdDescription: `>= ${THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT} of last ${THRESHOLDS.RECENT_CYCLES_WINDOW} periods with pain.level >= ${THRESHOLDS.SEVERE_EPISODE_PAIN_MIN} or stoppedActivities === true`,
    title: 'See a doctor soon',
    reasonTemplate:
      'Because pain reached 7 or more, or stopped your normal activities, in 2 of your last 3 periods.',
    wordsShown:
      'Strong period pain that stops your daily life is worth bringing to a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['episode.derived', 'dayLog.pain.level', 'dayLog.pain.stoppedActivities'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-09-fires',
        kind: 'fires',
        label: 'At threshold: 2 of last 3 periods had pain >= 7 or stoppedActivities',
        input: {
          today: BASE_DATE,
          derived: { painfulEpisodesInLast3: 2 },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-09-below',
        kind: 'below-threshold',
        label: 'Below threshold: 1 of last 3 periods had pain >= 7',
        input: {
          today: BASE_DATE,
          derived: { painfulEpisodesInLast3: 1 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-10',
    level: 'orange',
    kind: 'event',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition:
      'Heavy flow on 2 or more days with unusual tiredness, paleness or breathlessness on effort.',
    thresholdDescription: `>= ${THRESHOLDS.HEAVY_FLOW_ANEMIA_DAYS_MIN} days of flow === 'heavy' in episode and danger includes unusual-tiredness, very-pale, or breathless-on-effort`,
    title: 'See a doctor soon',
    reasonTemplate:
      'Because you logged 2 or more heavy flow days along with unusual tiredness, paleness or breathlessness.',
    wordsShown:
      'Heavy bleeding alongside tiredness, paleness or breathlessness is worth checking with a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.flow', 'dayLog.danger', 'episode.derived'],
    dangerSignsRead: ['unusual-tiredness', 'very-pale', 'breathless-on-effort'],
    examples: [
      {
        id: 'ORG-10-fires',
        kind: 'fires',
        label: 'At threshold: 2 heavy days + very-pale',
        input: {
          today: BASE_DATE,
          recentLogs: [
            { date: '2026-10-29', flow: 'heavy', danger: [] },
            { date: '2026-10-30', flow: 'heavy', danger: ['very-pale'], dangerAnswered: true },
          ],
        },
        expectedFires: true,
      },
      {
        id: 'ORG-10-below',
        kind: 'below-threshold',
        label: 'Below threshold: 1 heavy day + very-pale',
        input: {
          today: BASE_DATE,
          recentLogs: [{ date: '2026-10-30', flow: 'heavy', danger: ['very-pale'], dangerAnswered: true }],
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-11',
    level: 'orange',
    kind: 'event',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition: 'A positive pregnancy test without pain or bleeding.',
    thresholdDescription: "test.result === 'positive' and no bleeding flow and pain.level === 0",
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged a positive pregnancy test.',
    wordsShown:
      'Arrange to see a doctor or clinic soon to confirm and plan next steps. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.test.result', 'dayLog.flow', 'dayLog.pain.level'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-11-fires',
        kind: 'fires',
        label: 'At threshold: positive pregnancy test with flow=none and pain=0',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            test: { kind: 'pregnancy', result: 'positive' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-11-below-negative',
        kind: 'below-threshold',
        label: 'Below threshold: negative pregnancy test',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            test: { kind: 'pregnancy', result: 'negative' },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-12',
    level: 'orange',
    kind: 'event',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      "User decision #1 (unreviewed): Step 2 reads DayLog.stoolBlood. Fires ONLY for 'back-passage' outside a period or on > 2 days; 'period' does not fire; 'unsure' stays unresolved.",
    plainCondition:
      'Blood from the back passage outside a period, or on more than 2 days.',
    thresholdDescription: `stoolBlood === 'back-passage' outside a period OR on > ${THRESHOLDS.STOOL_BLOOD_DAYS_GT} days`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because you logged blood from the back passage.',
    wordsShown:
      'Blood from the back passage is separate from your period and should be checked by a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.stoolBlood', 'dayLog.flow'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-12-fires',
        kind: 'fires',
        label: 'At threshold: stoolBlood=back-passage outside a period',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', stoolBlood: 'back-passage', pain: { level: 0, sites: [] } },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-12-below-period',
        kind: 'below-threshold',
        label: 'Below threshold: stoolBlood=period (not back passage)',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'heavy', stoolBlood: 'period', pain: { level: 0, sites: [] } },
        },
        expectedFires: false,
      },
      {
        id: 'ORG-12-below-unsure',
        kind: 'unsure',
        label: 'Unsure does not fire ORG-12 by itself; stays unresolved for follow-up',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'light', stoolBlood: 'unsure', pain: { level: 0, sites: [] } },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-13',
    level: 'orange',
    kind: 'event',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition:
      'A negative pregnancy test, then 14 more days with no period, when pregnancy was possible.',
    thresholdDescription: `daysSinceLatestNegativeTest >= ${THRESHOLDS.NEGATIVE_TEST_DOCTOR_DAYS_MIN} with no period start since and pregnancy possible`,
    title: 'See a doctor soon',
    reasonTemplate:
      'Because 14 days have passed since a negative test with still no period.',
    wordsShown:
      'If 14 days have passed since a negative test and your period has not started, check with a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: [
      'dayLog.test.result',
      'dayLog.pregnancyChance',
      'cycle.derived',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-13-fires',
        kind: 'fires',
        label: 'At threshold: 14 days since negative test with no period',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', pregnancyChance: 'yes' },
          derived: { daysSinceLatestNegativeTest: 14 },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-13-below',
        kind: 'below-threshold',
        label: 'Below threshold: 13 days since negative test (YEL-06 applies at >= 7 days)',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', pregnancyChance: 'yes' },
          derived: { daysSinceLatestNegativeTest: 13 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-14',
    level: 'orange',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote:
      'Added 8 Nov 2026 (only Orange row that is a Today rule, not an event card). Clinician note: at pain 8-10 that is NOT sudden and no pain medicine tried, ORG-14 stops at 7 and RED-03/RED-08 do not fire — confirm whether ORG-14 should extend to 4..10.',
    plainCondition:
      'Pain of 4 to 7 out of 10 with dizziness, nausea or looking very pale, and no flow.',
    thresholdDescription: `pain.level in ${THRESHOLDS.PAIN_FOLLOWUP_MIN}..${THRESHOLDS.PAIN_MODERATE_MAX} and flow === 'none' and danger includes dizzy, nausea, or very-pale`,
    title: 'See a doctor soon',
    reasonTemplate:
      'Because you logged moderate pain with dizziness, nausea or paleness and no flow.',
    wordsShown:
      'Pain like this alongside dizziness, nausea or paleness should be checked by a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['dayLog.pain.level', 'dayLog.flow', 'dayLog.danger'],
    dangerSignsRead: ['dizzy', 'nausea', 'very-pale'],
    examples: [
      {
        id: 'ORG-14-fires',
        kind: 'fires',
        label: 'At threshold: pain 4/10 + flow=none + dizzy',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 4, sites: ['lower-middle'] },
            danger: ['dizzy'],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'ORG-14-below-pain',
        kind: 'below-threshold',
        label: 'Below threshold: pain 3/10 + flow=none + dizzy',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 3, sites: ['lower-middle'] },
            danger: ['dizzy'],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'ORG-15',
    level: 'orange',
    kind: 'event',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote: 'Added 8 Nov 2026 from YEL-08 72-hour watch-list check.',
    plainCondition: 'Smelly or yellow-green discharge still present at the 72-hour check.',
    thresholdDescription: `watch item discharge check answered 'yes' at >= ${THRESHOLDS.DISCHARGE_FOLLOWUP_HOURS} hours`,
    title: 'See a doctor soon',
    reasonTemplate: 'Because unusual discharge was still there at your 72-hour check.',
    wordsShown:
      'Discharge that stays smelly or yellow-green after 3 days should be checked by a doctor soon. If you are worried, see a doctor even if this looks fine.',
    inputsRead: ['watchItem.checks', 'dayLog.discharge'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'ORG-15-fires',
        kind: 'fires',
        label: 'At threshold: 72h watch check discharge-still-there answered yes',
        input: {
          today: '2026-11-02',
          watchItems: [
            {
              id: 'w-1',
              createdAt: '2026-10-30T10:00:00+05:00',
              dueAt: '2026-11-02T10:00:00+05:00',
              status: 'open',
              checks: [{ key: 'discharge-still-there', answer: 'yes' }],
            },
          ],
        },
        expectedFires: true,
      },
      {
        id: 'ORG-15-below',
        kind: 'below-threshold',
        label: 'Below threshold: 72h watch check answered no',
        input: {
          today: '2026-11-02',
          watchItems: [
            {
              id: 'w-1',
              createdAt: '2026-10-30T10:00:00+05:00',
              dueAt: '2026-11-02T10:00:00+05:00',
              status: 'open',
              checks: [{ key: 'discharge-still-there', answer: 'no' }],
            },
          ],
        },
        expectedFires: false,
      },
    ],
  },

  // =========================================================================
  // YELLOW RULES: Keep watching
  // =========================================================================
  {
    id: 'YEL-01',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition: 'Spotting on 3 to 6 days in a row.',
    thresholdDescription: `consecutive days of flow === 'spotting' in ${THRESHOLDS.SPOTTING_WATCH_DAYS_MIN}..${THRESHOLDS.SPOTTING_WATCH_DAYS_MAX}`,
    title: 'Keep watching',
    reasonTemplate: 'Because you logged spotting for 3 to 6 days in a row.',
    wordsShown:
      'Spotting noted. Keep an eye on whether it stops or turns into a period over the next 24 to 72 hours.',
    inputsRead: ['dayLog.flow', 'episode.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-01-fires',
        kind: 'fires',
        label: 'At threshold: 3 consecutive spotting days',
        input: {
          today: BASE_DATE,
          recentLogs: Array.from({ length: 3 }, (_, i) => ({
            date: `2026-10-${28 + i}`,
            flow: 'spotting' as const,
          })),
        },
        expectedFires: true,
      },
      {
        id: 'YEL-01-below',
        kind: 'below-threshold',
        label: 'Below threshold: 2 consecutive spotting days',
        input: {
          today: BASE_DATE,
          recentLogs: [
            { date: '2026-10-29', flow: 'spotting' },
            { date: '2026-10-30', flow: 'spotting' },
          ],
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-02',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'Changed 8 Nov 2026 + User decision #5 (Law 1 fix): fires on cramps 4-7 with flow=none even when a warning sign is ticked, so adding a non-red/non-ORG-14 warning sign never lowers Yellow to Green. ORG-14 or Red takes precedence when those fire.',
    plainCondition: 'Cramps of 4 to 7 out of 10 with no flow.',
    thresholdDescription: `pain.level in ${THRESHOLDS.PAIN_FOLLOWUP_MIN}..${THRESHOLDS.PAIN_MODERATE_MAX} and flow === 'none'`,
    title: 'Keep watching',
    reasonTemplate: 'Because you logged moderate cramps without bleeding.',
    wordsShown:
      'Keep watching over the next 24 to 72 hours to see if bleeding starts or the cramps ease.',
    inputsRead: ['dayLog.pain.level', 'dayLog.flow'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-02-fires-clean',
        kind: 'fires',
        label: 'At threshold: pain 4/10 with flow=none and no danger signs',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 4, sites: ['lower-middle'] }, danger: [], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-02-fires-with-other-sign',
        kind: 'fires',
        label: 'Law 1 preservation: pain 4/10 + flow=none + unusual-tiredness stays Yellow',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            pain: { level: 4, sites: ['lower-middle'] },
            danger: ['unusual-tiredness'],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-02-below',
        kind: 'below-threshold',
        label: 'Below threshold: pain 3/10 with flow=none',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 3, sites: ['lower-middle'] }, danger: [], dangerAnswered: true },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-03',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: '21-day interval from risk event to be confirmed in clinical review.',
    plainCondition:
      'Suggest a pregnancy test: a risk event since the last start, 21 or more days since that event, days since the last start at least min(35, median cycle + 7), and no negative test in the last 14 days.',
    thresholdDescription: `daysSinceRiskEvent >= ${THRESHOLDS.PREG_TEST_RISK_DAYS_MIN} && daysSinceLastStart >= min(${THRESHOLDS.PREG_TEST_CYCLE_FALLBACK_DAYS}, median + ${THRESHOLDS.PREG_TEST_MEDIAN_OFFSET_DAYS}) && no negative test in ${THRESHOLDS.PREG_TEST_RECENT_NEGATIVE_DAYS} days`,
    title: 'Keep watching',
    reasonTemplate:
      'Because enough time has passed since a risk event and your last period start to consider a pregnancy test.',
    wordsShown:
      'Consider taking a pregnancy test if one could apply, and keep watching over the next few days.',
    inputsRead: [
      'dayLog.intimacy.event',
      'dayLog.test.result',
      'cycle.derived',
      'profile.birthYear',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-03-fires',
        kind: 'fires',
        label: 'At threshold: 21d since risk event, 35d since start, no recent negative test',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          derived: {
            daysSinceLastRiskEvent: 21,
            daysSinceLastPeriodStart: 35,
            hasNegativeTestInLast14Days: false,
          },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-03-below',
        kind: 'below-threshold',
        label: 'Below threshold: 20d since risk event',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          derived: {
            daysSinceLastRiskEvent: 20,
            daysSinceLastPeriodStart: 35,
            hasNegativeTestInLast14Days: false,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-04',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Also cites FIGO (24-38 adult range).',
    plainCondition: 'One recent cycle shorter than 21 days or longer than the age upper limit.',
    thresholdDescription: `latest valid cycle since baseline < ${THRESHOLDS.CYCLE_SHORT_DAYS_LT} or > age limit (${THRESHOLDS.CYCLE_LONG_ADOLESCENT_DAYS_GT} / ${THRESHOLDS.CYCLE_LONG_ADULT_DAYS_GT})`,
    title: 'Keep watching',
    reasonTemplate: 'Because your latest cycle fell outside the typical range for your age.',
    wordsShown:
      'One shorter or longer cycle can happen. Keep logging so you can see whether it repeats.',
    inputsRead: ['cycle.derived', 'decision.new-baseline', 'profile.birthYear', 'profile.menarcheAge'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-04-fires-short',
        kind: 'fires',
        label: 'At threshold: 1 cycle of 20 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, menarcheAge: 13 },
          derived: { cycleLengths: [20] },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-04-below-short',
        kind: 'below-threshold',
        label: 'Below threshold: 1 cycle of 21 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, menarcheAge: 13 },
          derived: { cycleLengths: [21] },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-05',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition: 'Bleeding after sex once, without pain.',
    thresholdDescription: 'intimacy.bleedingAfter === true and no pain and < 2 occurrences in 90 days',
    title: 'Keep watching',
    reasonTemplate: 'Because you logged light bleeding after sex once without pain.',
    wordsShown:
      'Keep watching over the next 24 to 72 hours. If it happens again or pain starts, let a doctor know.',
    inputsRead: [
      'dayLog.intimacy.bleedingAfter',
      'dayLog.intimacy.painDuring',
      'dayLog.pain.level',
      'profile.birthYear',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-05-fires',
        kind: 'fires',
        label: 'At threshold: first bleeding after sex with pain=0',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            intimacy: { event: 'protected', bleedingAfter: true, painDuring: false },
          },
          derived: { bleedingAfterSexIn90Days: 1 },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-05-below',
        kind: 'below-threshold',
        label: 'Below threshold: no bleeding after sex',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            intimacy: { event: 'protected', bleedingAfter: false, painDuring: false },
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-06',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition:
      'A negative pregnancy test and no period 7 days later, with pregnancy still possible: repeat the test.',
    thresholdDescription: `daysSinceLatestNegativeTest >= ${THRESHOLDS.NEGATIVE_TEST_RETEST_DAYS_MIN} with no period start since and pregnancy possible`,
    title: 'Keep watching',
    reasonTemplate:
      'Because 7 days have passed since a negative pregnancy test and your period has not started.',
    wordsShown:
      'If pregnancy could still be possible, repeat the pregnancy test now and keep watching.',
    inputsRead: [
      'dayLog.test.result',
      'dayLog.pregnancyChance',
      'cycle.derived',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-06-fires',
        kind: 'fires',
        label: 'At threshold: 7 days after negative test with no period',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', pregnancyChance: 'yes' },
          derived: { daysSinceLatestNegativeTest: 7 },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-06-below',
        kind: 'below-threshold',
        label: 'Below threshold: 6 days after negative test',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: { flow: 'none', pregnancyChance: 'yes' },
          derived: { daysSinceLatestNegativeTest: 6 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-07',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition:
      'One heavy-flow sign below the orange line: a product changed every 2 to 3 hours, or small clots.',
    thresholdDescription: "changeEvery === '2-3h' || clots === 'small'",
    title: 'Keep watching',
    reasonTemplate: 'Because you logged changing a product every 2 to 3 hours or small clots.',
    wordsShown:
      'Keep watching your flow over the next 24 to 72 hours. Log any change if it gets heavier.',
    inputsRead: ['dayLog.changeEvery', 'dayLog.clots'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-07-fires',
        kind: 'fires',
        label: 'At threshold: changeEvery=2-3h',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'heavy', changeEvery: '2-3h', pain: { level: 2, sites: [] }, danger: [], dangerAnswered: true },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-07-below',
        kind: 'below-threshold',
        label: 'Below threshold: changeEvery=over-3h and clots=none',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'medium',
            changeEvery: 'over-3h',
            clots: 'none',
            pain: { level: 2, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-08',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'user-decision',
    clinicalReviewNote:
      'Added 8 Nov 2026 + User decision #5 (Law 1 fix): fires on smelly or yellow-green discharge even if fever is logged, so fever below RED-07 never lowers Yellow to Green. Starts 72h watch check.',
    plainCondition: 'Smelly or yellow-green discharge logged.',
    thresholdDescription: "discharge in ['odour', 'yellow-green']",
    title: 'Keep watching',
    reasonTemplate: 'Because you logged smelly or yellow-green discharge.',
    wordsShown:
      'Keep watching over the next 24 to 72 hours. We will check back at 72 hours to see if it is still there.',
    inputsRead: ['dayLog.discharge'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-08-fires-no-fever',
        kind: 'fires',
        label: 'At threshold: yellow-green discharge with no fever',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            discharge: 'yellow-green',
            pain: { level: 0, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-08-fires-low-fever',
        kind: 'fires',
        label: 'Law 1 preservation: odour discharge + fever 37.5 °C stays Yellow',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            discharge: 'odour',
            fever: { c: 37.5 },
            pain: { level: 0, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-08-below',
        kind: 'below-threshold',
        label: 'Below threshold: white discharge',
        input: {
          today: BASE_DATE,
          dayLog: {
            flow: 'none',
            discharge: 'white',
            pain: { level: 0, sites: [] },
            danger: [],
            dangerAnswered: true,
          },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'YEL-09',
    level: 'yellow',
    kind: 'today',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    specMarker: 'new',
    clinicalReviewNote: 'Added 8 Nov 2026; only active when adult intimacy logging is allowed.',
    plainCondition: 'Pain during sex logged, without bleeding (only when allowed).',
    thresholdDescription: 'intimacy.painDuring === true and intimacy.bleedingAfter !== true (adult only)',
    title: 'Keep watching',
    reasonTemplate: 'Because you logged pain during sex.',
    wordsShown:
      'Keep watching if this happens again. Mention ongoing pain during sex to a doctor.',
    inputsRead: [
      'dayLog.intimacy.painDuring',
      'dayLog.intimacy.bleedingAfter',
      'profile.birthYear',
      'profile.sexualHealthQuestions',
      'profile.intimacy',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'YEL-09-fires',
        kind: 'fires',
        label: 'At threshold (adult): painDuring=true without bleedingAfter',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            intimacy: { event: 'protected', painDuring: true, bleedingAfter: false },
          },
        },
        expectedFires: true,
      },
      {
        id: 'YEL-09-below',
        kind: 'below-threshold',
        label: 'Below threshold: painDuring=false',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
          dayLog: {
            flow: 'none',
            pain: { level: 0, sites: [] },
            intimacy: { event: 'protected', painDuring: false, bleedingAfter: false },
          },
        },
        expectedFires: false,
      },
    ],
  },

  // =========================================================================
  // GREEN & SUPPORTING RULES
  // =========================================================================
  {
    id: 'GRN-01',
    level: 'green',
    kind: 'today',
    sourceKey: 'This app',
    reviewStatus: 'unreviewed',
    specMarker: 'changed',
    clinicalReviewNote:
      'Changed 8 Nov 2026: labelled "Nothing flagged", requires all required answers (flow, pain, and danger screen/reliefHelped when asked), and does not show while an event card is open.',
    plainCondition: 'No rule above fires, every required answer is in, and no event card is open.',
    thresholdDescription: 'no Red/Yellow/ORG-14 rule fires && missingRequired === 0 && openEventCount === 0',
    title: 'Nothing flagged',
    reasonTemplate: 'Nothing in today’s answers matched a warning rule.',
    wordsShown: 'Nothing flagged in today’s answers.',
    inputsRead: [
      'dayLog.flow',
      'dayLog.pain.level',
      'dayLog.pain.reliefHelped',
      'dayLog.dangerAnswered',
      'verdict.openEvents',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'GRN-01-fires',
        kind: 'fires',
        label: 'All required answers logged, no rules triggered, no open event cards',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'light', pain: { level: 2, sites: [] }, danger: [], dangerAnswered: true },
          derived: { openEventCount: 0 },
        },
        expectedFires: true,
      },
      {
        id: 'GRN-01-below-open-event',
        kind: 'below-threshold',
        label: 'Blocked when an event card is open (shows Nothing new today instead)',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'light', pain: { level: 2, sites: [] }, danger: [], dangerAnswered: true },
          derived: { openEventCount: 1 },
        },
        expectedFires: false,
      },
      {
        id: 'GRN-01-below-missing-danger',
        kind: 'below-threshold',
        label: 'Blocked when danger screen was triggered (heavy flow) but dangerAnswered is false',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'heavy', pain: { level: 2, sites: [] }, danger: [], dangerAnswered: false },
          derived: { openEventCount: 0 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'GRN-02',
    level: 'green',
    kind: 'supporting',
    sourceKey: 'This app',
    reviewStatus: 'unreviewed',
    plainCondition: 'The day count is inside her own possible window.',
    thresholdDescription: 'today within forecast.possible window (Step 3)',
    title: 'Inside your possible window',
    reasonTemplate: 'Your cycle day count is inside your own possible window.',
    wordsShown: 'Today is inside the possible window from your earlier cycles.',
    inputsRead: ['forecast.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'GRN-02-fires',
        kind: 'fires',
        label: 'Inside possible window',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, danger: [] },
          derived: { inPossibleWindow: true },
        },
        expectedFires: true,
      },
      {
        id: 'GRN-02-below',
        kind: 'below-threshold',
        label: 'Outside possible window',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, danger: [] },
          derived: { inPossibleWindow: false },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'GRN-03',
    level: 'green',
    kind: 'supporting',
    sourceKey: 'This app',
    reviewStatus: 'unreviewed',
    plainCondition: 'Today’s spotting or cramps match her learned lead-in pattern.',
    thresholdDescription: 'learned lead-in pattern active and today has spotting or pain >= 3 (Step 3)',
    title: 'Matches your lead-in pattern',
    reasonTemplate: 'Your spotting or cramps today match your learned lead-in pattern.',
    wordsShown: 'This matches the pattern you logged before earlier periods.',
    inputsRead: ['forecast.derived', 'dayLog.flow', 'dayLog.pain.level'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'GRN-03-fires',
        kind: 'fires',
        label: 'Matches learned lead-in pattern',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'spotting', pain: { level: 3, sites: [] }, danger: [] },
          derived: { matchesLeadInPattern: true },
        },
        expectedFires: true,
      },
      {
        id: 'GRN-03-below',
        kind: 'below-threshold',
        label: 'No learned lead-in match',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, danger: [] },
          derived: { matchesLeadInPattern: false },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'GRN-04',
    level: 'green',
    kind: 'supporting',
    sourceKey: 'Std',
    reviewStatus: 'unreviewed',
    plainCondition:
      'Stress, illness, travel, weight change, a new medicine or emergency contraception is logged.',
    thresholdDescription: 'any DayLog.context reason logged',
    title: 'Context noted',
    reasonTemplate: 'Because you logged something that can affect cycle timing.',
    wordsShown: 'Stress, illness, travel, weight change or new medicine are common reasons for cycle change.',
    inputsRead: [
      'dayLog.context.stress',
      'dayLog.context.illness',
      'dayLog.context.travel',
      'dayLog.context.weightChange',
      'dayLog.context.medicationChange',
      'dayLog.context.emergencyContraception',
    ],
    dangerSignsRead: [],
    examples: [
      {
        id: 'GRN-04-fires',
        kind: 'fires',
        label: 'Illness logged in context',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, context: { illness: true } },
        },
        expectedFires: true,
      },
      {
        id: 'GRN-04-below',
        kind: 'below-threshold',
        label: 'No context factors logged',
        input: {
          today: BASE_DATE,
          dayLog: { flow: 'none', pain: { level: 0, sites: [] }, context: {} },
        },
        expectedFires: false,
      },
    ],
  },

  // =========================================================================
  // STANDING FLAGS: Long-term patterns for Record & Doctor file
  // =========================================================================
  {
    id: 'STD-01',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'FIGO',
    reviewStatus: 'unreviewed',
    plainCondition: 'The last 6 cycle lengths differ by more than 9 days, longest minus shortest.',
    thresholdDescription: `last ${THRESHOLDS.STANDING_VARIATION_CYCLES_COUNT} valid cycles since baseline: max - min > ${THRESHOLDS.STANDING_VARIATION_RANGE_DAYS_GT} days`,
    title: 'Cycle lengths vary by more than 9 days',
    reasonTemplate: 'Your last 6 cycles varied by more than 9 days between shortest and longest.',
    wordsShown: 'Your cycle lengths vary by more than 9 days. Worth sharing with a doctor.',
    inputsRead: ['cycle.derived', 'decision.new-baseline'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-01-fires',
        kind: 'fires',
        label: 'At threshold: 6 cycles spanning 28 to 38 days (diff = 10)',
        input: {
          today: BASE_DATE,
          derived: { cycleLengths: [28, 30, 32, 34, 36, 38] },
        },
        expectedFires: true,
      },
      {
        id: 'STD-01-below',
        kind: 'below-threshold',
        label: 'Below threshold: 6 cycles spanning 28 to 37 days (diff = 9)',
        input: {
          today: BASE_DATE,
          derived: { cycleLengths: [28, 30, 31, 33, 35, 37] },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-02',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Also cites FIGO (24-38 adult range).',
    plainCondition:
      '3 or more of the last 6 cycles fall outside her age band (< 21, or > 45 in first 3 years after first period, > 38 after).',
    thresholdDescription: `>= ${THRESHOLDS.STANDING_OUTSIDE_BAND_COUNT_MIN} of last ${THRESHOLDS.STANDING_VARIATION_CYCLES_COUNT} cycles outside age band`,
    title: 'Cycles often outside your age range',
    reasonTemplate: '3 or more of your last 6 cycles were outside the typical length range for your age.',
    wordsShown: 'Several recent cycles fell outside the typical range for your age.',
    inputsRead: ['cycle.derived', 'decision.new-baseline', 'profile.birthYear', 'profile.menarcheAge'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-02-fires',
        kind: 'fires',
        label: 'At threshold (adult): 3 of last 6 cycles are 39 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, menarcheAge: 13 },
          derived: { cycleLengths: [30, 39, 32, 39, 31, 39] },
        },
        expectedFires: true,
      },
      {
        id: 'STD-02-below',
        kind: 'below-threshold',
        label: 'Below threshold (adult): 2 of last 6 cycles are 39 days',
        input: {
          today: BASE_DATE,
          profile: { birthYear: 2002, menarcheAge: 13 },
          derived: { cycleLengths: [30, 39, 32, 39, 31, 35] },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-03',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'Merck',
    reviewStatus: 'unreviewed',
    plainCondition: 'Fewer than 9 periods in the last 12 months (once 12 months of history exist).',
    thresholdDescription: `periods in last ${THRESHOLDS.STANDING_YEAR_DAYS} days < ${THRESHOLDS.STANDING_PERIODS_PER_YEAR_LT}`,
    title: 'Fewer than 9 periods in 12 months',
    reasonTemplate: 'You logged fewer than 9 periods over the last 12 months.',
    wordsShown: 'You had fewer than 9 periods in the past year.',
    inputsRead: ['cycle.derived', 'episode.derived', 'decision.new-baseline'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-03-fires',
        kind: 'fires',
        label: 'At threshold: 8 periods across 12 months of logging',
        input: {
          today: BASE_DATE,
          derived: { periodsInLast12Months: 8 },
        },
        expectedFires: true,
      },
      {
        id: 'STD-03-below',
        kind: 'below-threshold',
        label: 'Below threshold: 9 periods across 12 months of logging',
        input: {
          today: BASE_DATE,
          derived: { periodsInLast12Months: 9 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-04',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'ACOG',
    reviewStatus: 'unreviewed',
    plainCondition: 'Any gap of 90 days or more in the last 12 months.',
    thresholdDescription: `max gap in last ${THRESHOLDS.STANDING_YEAR_DAYS} days >= ${THRESHOLDS.AMENORRHEA_DAYS_MIN}`,
    title: 'Gap of 90 days or more in the last year',
    reasonTemplate: 'You went 90 days or more without a period in the last 12 months.',
    wordsShown: 'You had at least one gap of 90 days or more in the last 12 months.',
    inputsRead: ['cycle.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-04-fires',
        kind: 'fires',
        label: 'At threshold: 90-day gap in last 12 months',
        input: {
          today: BASE_DATE,
          derived: { maxGapInLast12Months: 90 },
        },
        expectedFires: true,
      },
      {
        id: 'STD-04-below',
        kind: 'below-threshold',
        label: 'Below threshold: 89-day longest gap in last 12 months',
        input: {
          today: BASE_DATE,
          derived: { maxGapInLast12Months: 89 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-05',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    clinicalReviewNote: 'Aggregates ORG-01 (ACOG), ORG-02 (NHS Wales/FIGO), and ORG-09 (NHS Wales).',
    plainCondition: 'ORG-01, ORG-02 or ORG-09 happened in 2 or more of the last 3 periods.',
    thresholdDescription: `>= ${THRESHOLDS.RECENT_CYCLES_TRIGGER_COUNT} of last ${THRESHOLDS.RECENT_CYCLES_WINDOW} periods had prolonged, heavy, or severe-pain criteria`,
    title: 'Repeated heavy, prolonged or very painful periods',
    reasonTemplate: '2 or more of your last 3 periods included heavy bleeding, lasting over 7 days, or severe pain.',
    wordsShown: 'Repeated heavy, prolonged or severe-pain periods are worth bringing to a doctor.',
    inputsRead: ['episode.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-05-fires',
        kind: 'fires',
        label: 'At threshold: 2 of last 3 periods met ORG-01/02/09',
        input: {
          today: BASE_DATE,
          derived: { prolongedOrHeavyOrPainfulInLast3: 2 },
        },
        expectedFires: true,
      },
      {
        id: 'STD-05-below',
        kind: 'below-threshold',
        label: 'Below threshold: 1 of last 3 periods met ORG-01/02/09',
        input: {
          today: BASE_DATE,
          derived: { prolongedOrHeavyOrPainfulInLast3: 1 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-06',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'NHS Wales',
    reviewStatus: 'unreviewed',
    plainCondition: 'Spotting between periods, or bleeding after sex, keeps recurring.',
    thresholdDescription: `>= ${THRESHOLDS.INTERMENSTRUAL_COUNT_MIN} intermenstrual spotting events OR >= ${THRESHOLDS.BLEEDING_AFTER_SEX_COUNT_MIN} bleeding-after-sex events`,
    title: 'Recurring spotting between periods or after sex',
    reasonTemplate: 'Spotting between periods or bleeding after sex has happened repeatedly.',
    wordsShown: 'Recurring bleeding between periods or after sex is worth discussing with a doctor.',
    inputsRead: ['episode.derived', 'dayLog.intimacy.bleedingAfter'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-06-fires',
        kind: 'fires',
        label: 'At threshold: 2 intermenstrual spotting events in 90 days',
        input: {
          today: BASE_DATE,
          derived: { intermenstrualSpottingIn90Days: 2 },
        },
        expectedFires: true,
      },
      {
        id: 'STD-06-below',
        kind: 'below-threshold',
        label: 'Below threshold: 1 intermenstrual spotting event and 0 after-sex events',
        input: {
          today: BASE_DATE,
          derived: { intermenstrualSpottingIn90Days: 1, bleedingAfterSexIn90Days: 0 },
        },
        expectedFires: false,
      },
    ],
  },
  {
    id: 'STD-07',
    level: 'standing',
    kind: 'standing',
    sourceKey: 'This app',
    reviewStatus: 'unreviewed',
    plainCondition:
      '8 or more cycles logged and the confidence meter is still limited by cycle variability.',
    thresholdDescription: `cycles >= ${THRESHOLDS.STANDING_VARIABILITY_MIN_CYCLES} and consistency S < ${THRESHOLDS.STANDING_VARIABILITY_S_BELOW}`,
    title: 'Cycles remain highly variable',
    reasonTemplate: 'With 8 or more cycles logged, your cycle lengths vary widely.',
    wordsShown:
      'Your cycles vary a lot, so ranges stay wide. That limit comes from the cycles, not from how you log.',
    inputsRead: ['cycle.derived', 'forecast.derived'],
    dangerSignsRead: [],
    examples: [
      {
        id: 'STD-07-fires',
        kind: 'fires',
        label: 'At threshold: 8 cycles with consistency S = 0.34',
        input: {
          today: BASE_DATE,
          derived: { cyclesTotalCount: 8, consistencyS: 0.34 },
        },
        expectedFires: true,
      },
      {
        id: 'STD-07-below',
        kind: 'below-threshold',
        label: 'Below threshold: 8 cycles with consistency S = 0.35',
        input: {
          today: BASE_DATE,
          derived: { cyclesTotalCount: 8, consistencyS: 0.35 },
        },
        expectedFires: false,
      },
    ],
  },
] as const;

export const UNDER_18_GUIDANCE_ADDON =
  'Tell a parent, relative or school nurse if you can.' as const;
export const OPEN_EVENT_REPLACES_GREEN_TEXT =
  'Nothing new today. An earlier flag is still open.' as const;
