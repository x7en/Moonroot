import type { RuleInputField } from './rules';

export type QuestionTriggerId =
  | 'spotting-logged'
  | 'medium-or-heavy-flow'
  | 'pain-4-plus-no-flow'
  | 'many-days-no-period'
  | 'bleeding-or-pain-after-sex'
  | 'fever-logged'
  | 'blood-in-stool'
  | 'odour-or-yellow-green-discharge'
  | 'hormone-course-changed'
  | 'watch-list-followup';

export interface QuestionOptionSpec {
  value: string;
  labelKey: string;
  defaultLabel: string;
  setsNote?: string;
}

export interface FollowUpQuestionSpec {
  id: string;
  promptKey: string;
  defaultPrompt: string;
  answerType: 'single-choice' | 'multi-choice' | 'scale-0-10' | 'danger-screen' | 'yes-no-unsure';
  setsFields: readonly RuleInputField[];
  ageOrSettingGate?: 'sexual-health-allowed' | 'adult-intimacy-allowed' | 'pain-8-or-more' | 'after-day-1';
  requiredForGreen?: boolean;
  options?: readonly QuestionOptionSpec[];
}

export interface QuestionFlowSpec {
  triggerId: QuestionTriggerId;
  triggerLabel: string;
  conditionSummary: string;
  maxQuestionsNormally: number;
  allowExtraForRedRule: boolean;
  followUpWindow?: string;
  questions: readonly FollowUpQuestionSpec[];
}

/**
 * Declarative question flows and answer mappings from SPEC.md.
 * Step 2 executes these dynamically; the design freeze uses them for clinical review
 * and input-coverage verification.
 */
export const QUESTION_FLOWS: readonly QuestionFlowSpec[] = [
  {
    triggerId: 'spotting-logged',
    triggerLabel: 'Spotting logged',
    conditionSummary: "flow === 'spotting'",
    maxQuestionsNormally: 4,
    allowExtraForRedRule: true,
    followUpWindow: 'Watch list next morning and at 72 hours asking if it became a period',
    questions: [
      {
        id: 'spot-protection',
        promptKey: 'questions.spotting.protection',
        defaultPrompt: 'Drops only, or did you need a pad or tampon?',
        answerType: 'single-choice',
        setsFields: ['dayLog.protection'],
        options: [
          { value: 'none', labelKey: 'questions.spotting.dropsOnly', defaultLabel: 'Drops only' },
          { value: 'liner', labelKey: 'protection.liner', defaultLabel: 'Liner' },
          { value: 'pad', labelKey: 'protection.pad', defaultLabel: 'Pad' },
          { value: 'tampon', labelKey: 'protection.tampon', defaultLabel: 'Tampon' },
          { value: 'cup', labelKey: 'protection.cup', defaultLabel: 'Cup' },
        ],
      },
      {
        id: 'spot-cramps',
        promptKey: 'questions.spotting.cramps',
        defaultPrompt: 'Any cramps: none, mild, strong?',
        answerType: 'single-choice',
        setsFields: ['dayLog.pain.level'],
      },
      {
        id: 'spot-more-than-yesterday',
        promptKey: 'questions.spotting.moreThanYesterday',
        defaultPrompt: 'Is it more than yesterday?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.flow'],
        ageOrSettingGate: 'after-day-1',
      },
      {
        id: 'spot-pregnancy',
        promptKey: 'questions.pregnancyChance',
        defaultPrompt: 'Is there any chance you could be pregnant?',
        answerType: 'single-choice',
        setsFields: ['dayLog.pregnancyChance'],
        ageOrSettingGate: 'sexual-health-allowed',
        options: [
          { value: 'yes', labelKey: 'common.yes', defaultLabel: 'Yes' },
          { value: 'no', labelKey: 'common.no', defaultLabel: 'No' },
          {
            value: 'prefer-not-to-say',
            labelKey: 'common.preferNotToSay',
            defaultLabel: 'Prefer not to say',
          },
        ],
      },
    ],
  },
  {
    triggerId: 'medium-or-heavy-flow',
    triggerLabel: 'Medium or heavy flow logged',
    conditionSummary: "flow === 'medium' || flow === 'heavy'",
    maxQuestionsNormally: 4,
    allowExtraForRedRule: true,
    questions: [
      {
        id: 'flow-change-frequency',
        promptKey: 'questions.heavy.changeEvery',
        defaultPrompt: 'How often are you changing a pad or tampon?',
        answerType: 'single-choice',
        setsFields: ['dayLog.soakedPerHour', 'dayLog.changeEvery'],
        options: [
          {
            value: 'soaked-hourly-2h',
            labelKey: 'questions.heavy.soakedHourly2h',
            defaultLabel: 'Every hour or more often for 2 hours or more',
            setsNote: "sets soakedPerHour=true and changeEvery='under-2h'",
          },
          {
            value: 'under-2h',
            labelKey: 'questions.heavy.every1to2h',
            defaultLabel: 'Every 1 to 2 hours',
            setsNote: "sets changeEvery='under-2h'",
          },
          {
            value: '2-3h',
            labelKey: 'questions.heavy.every2to3h',
            defaultLabel: 'Every 2 to 3 hours',
          },
          {
            value: 'over-3h',
            labelKey: 'questions.heavy.lessOften',
            defaultLabel: 'Less often',
          },
        ],
      },
      {
        id: 'flow-clots-leaks',
        promptKey: 'questions.heavy.clotsAndLeaks',
        defaultPrompt: 'Clots and leaks',
        answerType: 'multi-choice',
        setsFields: ['dayLog.clots', 'dayLog.flooding', 'dayLog.doubleProtection'],
        options: [
          { value: 'clots-none', labelKey: 'clots.none', defaultLabel: 'None' },
          { value: 'clots-small', labelKey: 'clots.small', defaultLabel: 'Small clots' },
          {
            value: 'clots-large',
            labelKey: 'clots.large',
            defaultLabel: 'Clots bigger than a coin',
          },
          { value: 'flooding', labelKey: 'questions.heavy.flooding', defaultLabel: 'Flooding' },
          {
            value: 'doubleProtection',
            labelKey: 'questions.heavy.doubleProtection',
            defaultLabel: 'Two products at once',
          },
        ],
      },
      {
        id: 'flow-danger-screen',
        promptKey: 'questions.dangerScreen',
        defaultPrompt: 'Any of these right now?',
        answerType: 'danger-screen',
        requiredForGreen: true,
        setsFields: ['dayLog.danger', 'dayLog.dangerAnswered', 'dayLog.fever.c', 'dayLog.fever.felt'],
      },
      {
        id: 'flow-pain',
        promptKey: 'questions.painScale',
        defaultPrompt: 'Pain from 0 to 10',
        answerType: 'scale-0-10',
        requiredForGreen: true,
        setsFields: [
          'dayLog.pain.level',
          'dayLog.pain.sites',
          'dayLog.pain.stoppedActivities',
          'dayLog.pain.reliefHelped',
        ],
      },
    ],
  },
  {
    triggerId: 'pain-4-plus-no-flow',
    triggerLabel: 'Pain of 4 or more without flow',
    conditionSummary: "pain.level >= 4 && (flow === 'none' || flow === null)",
    maxQuestionsNormally: 4,
    allowExtraForRedRule: true,
    questions: [
      {
        id: 'pain-sites',
        promptKey: 'questions.pain.where',
        defaultPrompt: 'Where is the pain?',
        answerType: 'multi-choice',
        setsFields: ['dayLog.pain.sites', 'dayLog.pain.stoppedActivities'],
        options: [
          { value: 'lower-middle', labelKey: 'painSite.lowerMiddle', defaultLabel: 'Middle' },
          { value: 'left', labelKey: 'painSite.left', defaultLabel: 'Left' },
          { value: 'right', labelKey: 'painSite.right', defaultLabel: 'Right' },
          { value: 'back', labelKey: 'painSite.back', defaultLabel: 'Back' },
          { value: 'whole-belly', labelKey: 'painSite.wholeBelly', defaultLabel: 'Whole belly' },
          { value: 'shoulder-tip', labelKey: 'painSite.shoulderTip', defaultLabel: 'Shoulder tip' },
        ],
      },
      {
        id: 'pain-sudden',
        promptKey: 'questions.pain.sudden',
        defaultPrompt: 'Did it start suddenly?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.pain.sudden'],
      },
      {
        id: 'pain-danger-screen',
        promptKey: 'questions.dangerScreen',
        defaultPrompt: 'Any of these right now?',
        answerType: 'danger-screen',
        requiredForGreen: true,
        setsFields: ['dayLog.danger', 'dayLog.dangerAnswered', 'dayLog.fever.c', 'dayLog.fever.felt'],
      },
      {
        id: 'pain-pregnancy',
        promptKey: 'questions.pregnancyChance',
        defaultPrompt: 'Is there any chance you could be pregnant?',
        answerType: 'single-choice',
        setsFields: ['dayLog.pregnancyChance'],
        ageOrSettingGate: 'sexual-health-allowed',
      },
      {
        id: 'pain-relief-helped',
        promptKey: 'questions.pain.reliefHelped',
        defaultPrompt: 'Has pain medicine helped?',
        answerType: 'single-choice',
        setsFields: ['dayLog.pain.reliefHelped'],
        ageOrSettingGate: 'pain-8-or-more',
        requiredForGreen: true,
        options: [
          { value: 'yes', labelKey: 'common.yes', defaultLabel: 'Yes' },
          { value: 'no', labelKey: 'common.no', defaultLabel: 'No' },
          {
            value: 'none-taken',
            labelKey: 'questions.pain.noneTaken',
            defaultLabel: 'I have not taken any',
          },
          { value: 'unsure', labelKey: 'common.notSure', defaultLabel: 'Not sure' },
        ],
      },
    ],
  },
  {
    triggerId: 'many-days-no-period',
    triggerLabel: 'Many days since the last start',
    conditionSummary: 'daysSinceLastStart >= max(p75, 35), shown at most every 14 days',
    maxQuestionsNormally: 1,
    allowExtraForRedRule: false,
    questions: [
      {
        id: 'no-period-context',
        promptKey: 'questions.noPeriod.changed',
        defaultPrompt: 'No period yet. Has anything changed lately?',
        answerType: 'multi-choice',
        setsFields: [
          'dayLog.context.stress',
          'dayLog.context.illness',
          'dayLog.context.travel',
          'dayLog.context.weightChange',
          'dayLog.context.medicationChange',
          'dayLog.context.emergencyContraception',
          'dayLog.test.result',
        ],
      },
    ],
  },
  {
    triggerId: 'bleeding-or-pain-after-sex',
    triggerLabel: 'Bleeding or pain after sex (only when allowed)',
    conditionSummary: 'adult + sexualHealthQuestions allowed + intimacy bleedingAfter or painDuring',
    maxQuestionsNormally: 2,
    allowExtraForRedRule: false,
    questions: [
      {
        id: 'sex-pain-too',
        promptKey: 'questions.afterSex.painToo',
        defaultPrompt: 'Was there pain too?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.intimacy.painDuring', 'dayLog.intimacy.bleedingAfter', 'dayLog.intimacy.event'],
        ageOrSettingGate: 'adult-intimacy-allowed',
      },
      {
        id: 'sex-happened-before',
        promptKey: 'questions.afterSex.before',
        defaultPrompt: 'Has it happened before?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.intimacy.bleedingAfter'],
        ageOrSettingGate: 'adult-intimacy-allowed',
      },
    ],
  },
  {
    triggerId: 'fever-logged',
    triggerLabel: 'Fever logged',
    conditionSummary: 'fever.c !== undefined || fever.felt === true',
    maxQuestionsNormally: 4,
    allowExtraForRedRule: true,
    questions: [
      {
        id: 'fever-tampon-or-cup',
        promptKey: 'questions.tamponOrCup',
        defaultPrompt: 'Are you using a tampon or cup?',
        answerType: 'single-choice',
        setsFields: ['dayLog.protection'],
      },
      {
        id: 'fever-lower-belly-pain',
        promptKey: 'questions.lowerBellyPain',
        defaultPrompt: 'Lower belly pain?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.pain.level', 'dayLog.pain.sites'],
      },
      {
        id: 'fever-discharge',
        promptKey: 'questions.discharge',
        defaultPrompt: 'Smelly or yellow-green discharge?',
        answerType: 'single-choice',
        setsFields: ['dayLog.discharge'],
      },
      {
        id: 'fever-danger-screen',
        promptKey: 'questions.dangerScreen',
        defaultPrompt: 'Any of these right now?',
        answerType: 'danger-screen',
        requiredForGreen: true,
        setsFields: ['dayLog.danger', 'dayLog.dangerAnswered'],
      },
    ],
  },
  {
    triggerId: 'blood-in-stool',
    triggerLabel: 'Blood in stool logged',
    conditionSummary: 'stool blood entry logged (DayLog or Step 4 BodyLog)',
    maxQuestionsNormally: 1,
    allowExtraForRedRule: false,
    questions: [
      {
        id: 'stool-blood-source',
        promptKey: 'questions.stoolBlood',
        defaultPrompt: 'Is it from the back passage, or from your period?',
        answerType: 'single-choice',
        setsFields: ['dayLog.stoolBlood'],
        options: [
          {
            value: 'back-passage',
            labelKey: 'questions.stoolBloodOptions.backPassage',
            defaultLabel: 'Back passage',
          },
          { value: 'period', labelKey: 'questions.stoolBloodOptions.period', defaultLabel: 'Period' },
          { value: 'unsure', labelKey: 'common.notSure', defaultLabel: 'Not sure' },
        ],
      },
    ],
  },
  {
    triggerId: 'odour-or-yellow-green-discharge',
    triggerLabel: 'Smelly or yellow-green discharge logged',
    conditionSummary: "discharge === 'odour' || discharge === 'yellow-green'",
    maxQuestionsNormally: 4,
    allowExtraForRedRule: true,
    followUpWindow: 'Watch list next morning and at 72 hours asking: Is the discharge still there?',
    questions: [
      {
        id: 'discharge-fever',
        promptKey: 'questions.feverish',
        defaultPrompt: 'Any fever or feeling feverish?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.fever.c', 'dayLog.fever.felt'],
      },
      {
        id: 'discharge-lower-belly-pain',
        promptKey: 'questions.lowerBellyPain',
        defaultPrompt: 'Lower belly pain?',
        answerType: 'yes-no-unsure',
        setsFields: ['dayLog.pain.level', 'dayLog.pain.sites'],
      },
      {
        id: 'discharge-tampon-or-cup',
        promptKey: 'questions.tamponOrCup',
        defaultPrompt: 'Using a tampon or cup?',
        answerType: 'single-choice',
        setsFields: ['dayLog.protection'],
      },
      {
        id: 'discharge-danger-screen',
        promptKey: 'questions.dangerScreen',
        defaultPrompt: 'Any of these right now?',
        answerType: 'danger-screen',
        requiredForGreen: true,
        setsFields: ['dayLog.danger', 'dayLog.dangerAnswered'],
      },
    ],
  },
  {
    triggerId: 'hormone-course-changed',
    triggerLabel: 'A hormone medicine is started or stopped in the medicine log',
    conditionSummary: 'MedicineEntry with category=hormone started or stopped',
    maxQuestionsNormally: 1,
    allowExtraForRedRule: false,
    questions: [
      {
        id: 'hormone-start-fresh',
        promptKey: 'questions.startFresh',
        defaultPrompt: 'Start predictions fresh from this date?',
        answerType: 'single-choice',
        setsFields: ['decision.new-baseline'],
      },
    ],
  },
  {
    triggerId: 'watch-list-followup',
    triggerLabel: 'Watch list morning and 72-hour check-ins',
    conditionSummary: 'Open watch item due next morning or at 72 hours',
    maxQuestionsNormally: 3,
    allowExtraForRedRule: true,
    followUpWindow: 'Due next morning (~12-24h) and again at 72 hours; closes after 72h',
    questions: [
      {
        id: 'watch-discharge-still-there',
        promptKey: 'questions.watch.dischargeStillThere',
        defaultPrompt: 'Is the discharge still there?',
        answerType: 'yes-no-unsure',
        setsFields: ['watchItem.checks'],
      },
    ],
  },
] as const;

/**
 * Additional direct fields captured on core screens (Today, Day Editor, Onboarding, Medicine Log)
 * so input coverage checks account for every field read by rules.
 */
export const SCREEN_INPUT_FIELDS: readonly RuleInputField[] = [
  'dayLog.flow',
  'dayLog.colour',
  'dayLog.discharge',
  'dayLog.protection',
  'dayLog.pain.level',
  'dayLog.pain.sites',
  'dayLog.pain.sudden',
  'dayLog.pain.stoppedActivities',
  'dayLog.pain.reliefHelped',
  'dayLog.danger',
  'dayLog.dangerAnswered',
  'dayLog.fever.c',
  'dayLog.fever.felt',
  'dayLog.test.result',
  'dayLog.pregnancyChance',
  'dayLog.stoolBlood',
  'dayLog.context.stress',
  'dayLog.context.illness',
  'dayLog.context.travel',
  'dayLog.context.weightChange',
  'dayLog.context.medicationChange',
  'dayLog.context.emergencyContraception',
  'dayLog.intimacy.event',
  'dayLog.intimacy.bleedingAfter',
  'dayLog.intimacy.painDuring',
  'profile.birthYear',
  'profile.menarcheAge',
  'profile.onHormones',
  'profile.contraception',
  'profile.sexualHealthQuestions',
  'profile.intimacy',
  'medicineEntry.hormoneActive',
  'cycle.derived',
  'episode.derived',
  'forecast.derived',
  'decision.new-baseline',
  'watchItem.checks',
  'verdict.openEvents',
] as const;
