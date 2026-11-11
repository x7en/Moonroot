/**
 * Moonroot Data Model Contract
 *
 * Pure TypeScript types for the entire app.
 * Day logs and medicine entries are the single source of truth; derived records
 * (cycles, bleeding episodes, forecasts, totals, streaks) are computed by pure functions.
 */

export const SCHEMA_VERSION = 1 as const;
export const RULESET_VERSION = '1.0' as const;

export type DateKey = string; // 'YYYY-MM-DD', the phone's local calendar date
export type Stamp = string; // ISO 8601 date-time with local offset

export type Flow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy' | 'unsure';
export type Protection = 'none' | 'liner' | 'pad' | 'tampon' | 'cup' | 'disc';
export type Clots = 'none' | 'small' | 'large'; // large = bigger than a coin, about 2.5 cm

export type PainSite =
  | 'lower-middle'
  | 'left'
  | 'right'
  | 'back'
  | 'whole-belly'
  | 'shoulder-tip'
  | 'other';

export type Level = 'green' | 'yellow' | 'orange' | 'red';

export type SymptomKey =
  | 'cramps'
  | 'headache'
  | 'bloating'
  | 'tender-breasts'
  | 'back-pain'
  | 'tiredness'
  | 'cravings'
  | 'constipation';

export type DangerSign =
  | 'dizzy'
  | 'fainted'
  | 'short-of-breath'
  | 'chest-pain'
  | 'nausea'
  | 'vomiting'
  | 'very-pale'
  | 'confused'
  | 'sunburn-rash'
  | 'diarrhoea'
  | 'unusual-tiredness'
  | 'breathless-on-effort'
  | 'leg-pain-or-swelling'
  | 'severe-headache'
  | 'vision-change';

export type RedRuleId =
  | 'RED-01'
  | 'RED-02'
  | 'RED-03'
  | 'RED-04'
  | 'RED-05'
  | 'RED-06'
  | 'RED-07'
  | 'RED-08'
  | 'RED-09'
  | 'RED-10'
  | 'RED-11';

export type OrangeRuleId =
  | 'ORG-01'
  | 'ORG-02'
  | 'ORG-03'
  | 'ORG-04'
  | 'ORG-05'
  | 'ORG-06'
  | 'ORG-07'
  | 'ORG-08'
  | 'ORG-09'
  | 'ORG-10'
  | 'ORG-11'
  | 'ORG-12'
  | 'ORG-13'
  | 'ORG-14'
  | 'ORG-15';

export type YellowRuleId =
  | 'YEL-01'
  | 'YEL-02'
  | 'YEL-03'
  | 'YEL-04'
  | 'YEL-05'
  | 'YEL-06'
  | 'YEL-07'
  | 'YEL-08'
  | 'YEL-09';

export type GreenRuleId = 'GRN-01' | 'GRN-02' | 'GRN-03' | 'GRN-04';

export type StandingFlagId =
  | 'STD-01'
  | 'STD-02'
  | 'STD-03'
  | 'STD-04'
  | 'STD-05'
  | 'STD-06'
  | 'STD-07';

export type RuleId = RedRuleId | OrangeRuleId | YellowRuleId | GreenRuleId | StandingFlagId;

export interface Profile {
  schemaVersion: number;
  createdAt: Stamp;
  birthYear: number | null;
  menarcheAge: number | null; // age at first period, in years
  selfRegularity: 'regular' | 'irregular' | 'unknown';
  lastPeriodApprox: DateKey | null; // from onboarding, always approximate
  onHormones: boolean | null; // any hormone medicine, including the pill for cycle control
  contraception:
    | 'none'
    | 'combined-pill'
    | 'progestin-pill'
    | 'implant'
    | 'hormonal-iud'
    | 'copper-iud'
    | 'injection'
    | 'condoms'
    | 'other'
    | null;
  sexualHealthQuestions: 'when-relevant' | 'off';
  intimacy: 'none' | 'active' | 'prefer-not-to-say' | null;
  conditionsNote: string;
  medicationsNote: string;
  sproutName: string | null;
  theme: string;
  units: { temperature: 'C' | 'F'; water: 'ml' | 'glasses' };
  reminders: {
    daily: { on: boolean; time: string };
    watchlist: boolean;
    quietFrom: string;
    quietTo: string;
  };
  discreetMode: boolean;
  lock: { type: 'none' | 'pin'; hash?: string; salt?: string };
  locale: string;
  region: string; // picks emergency numbers, for example 'PK'
  disclaimerAcceptedAt: Stamp | null;
  reducedMotion?: boolean;
  haptics?: boolean;
}

export interface DayLog {
  date: DateKey; // primary key
  filledFrom: 'live' | 'backfill' | 'approximate';
  flow: Flow | null;
  protection?: Protection;
  productsUsed?: number;
  soakedPerHour?: boolean; // soaked 1 or more products an hour for 2 or more hours
  changeEvery?: 'under-2h' | '2-3h' | 'over-3h'; // how often she changes a product while flowing
  flooding?: boolean; // blood leaking through in a rush
  doubleProtection?: boolean; // two products at once
  clots?: Clots;
  colour?: 'bright-red' | 'dark-red' | 'brown' | 'pink' | 'other';
  pain?: {
    level: number; // 0-10
    sites: PainSite[];
    sudden?: boolean;
    stoppedActivities?: boolean;
    reliefHelped?: 'yes' | 'no' | 'none-taken' | 'unsure'; // asked at 8 or more
  };
  symptoms: SymptomKey[]; // keys from the symptoms list under Catalogues
  danger: DangerSign[]; // warning signs she ticked today, from the danger-sign list
  dangerAnswered?: boolean; // true when danger-sign screen was answered (including 'None of these')
  fever?: { c?: number; felt?: boolean }; // c = measured in °C; felt = feels feverish, no number
  mood?: 1 | 2 | 3 | 4 | 5;
  discharge?: 'none' | 'clear' | 'white' | 'yellow-green' | 'brown' | 'odour' | 'other';
  fertility?: {
    bbt?: number;
    bbtTime?: string;
    lh?: 'negative' | 'faint' | 'positive';
    mucus?: 'dry' | 'sticky' | 'creamy' | 'watery' | 'egg-white';
  };
  context?: {
    stress?: 1 | 2 | 3 | 4 | 5;
    illness?: boolean;
    travel?: boolean;
    weightChange?: boolean;
    medicationChange?: boolean;
    emergencyContraception?: boolean;
  };
  intimacy?: {
    event: 'protected' | 'unprotected' | 'unsure';
    bleedingAfter?: boolean;
    painDuring?: boolean;
  };
  pregnancyChance?: 'yes' | 'no' | 'prefer-not-to-say'; // neutral pregnancy question (age-gated rules apply)
  stoolBlood?: 'none' | 'back-passage' | 'period' | 'unsure'; // Step 2 answer field for ORG-12
  test?: { kind: 'pregnancy'; result: 'negative' | 'positive' | 'unclear' };
  note: string;
  updatedAt: Stamp;
}

export interface BodyLog {
  date: DateKey;
  sleep?: { hours: number; quality: 1 | 2 | 3; wokeTired?: boolean };
  water?: { ml: number };
  meals?: {
    pattern: 'regular' | 'irregular' | 'skipped-some';
    tags: ('balanced' | 'sugary' | 'caffeine' | 'late-night' | 'fasting')[];
  };
  stool?: {
    count: number;
    bristol?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    pain?: boolean;
    bloating?: boolean;
    bloodSeen?: boolean;
  };
  exercise?: { minutes: number; effort: 'light' | 'moderate' | 'hard' };
  energy?: 1 | 2 | 3 | 4 | 5;
  skin?: { acne?: 0 | 1 | 2 | 3; hair?: 'none' | 'shedding' | 'new-growth' };
  updatedAt: Stamp;
}

export interface Decision {
  // what she told the app, kept apart from raw logs
  id: string;
  date: DateKey;
  at: Stamp;
  note?: string;
  kind: 'period-start' | 'not-a-period' | 'period-end' | 'ignore-in-predictions' | 'new-baseline';
}

export interface Forecast {
  // frozen when a period start is confirmed
  id: string;
  anchor: DateKey;
  madeOn: DateKey;
  basis: 'cycle-lengths' | 'lead-in-pattern' | 'ovulation';
  cyclesUsed: number;
  confidence: number; // 0-100 at the time
  likely: [DateKey, DateKey];
  possible: [DateKey, DateKey];
  peak: DateKey;
  rulesetVersion: string;
  outcome?: {
    actualStart: DateKey;
    inLikely: boolean;
    inPossible: boolean;
    errorDays: number;
  };
}

export interface Verdict {
  id: string;
  at: Stamp;
  level: Level;
  ruleIds: RuleId[];
  title: string;
  reasons: string[];
  rulesetVersion: string;
  watchId?: string;
  kind: 'today' | 'event'; // today = from today's answers, event = from her history
  triggerKey?: string; // event verdicts: the rule ID plus the trigger date
  dismissedAt?: Stamp; // she tapped Got it
  closedByVisit?: string; // id of the doctor visit that closed it
}

export interface WatchItem {
  id: string;
  createdAt: Stamp;
  dueAt: Stamp;
  status: 'open' | 'closed' | 'escalated';
  checks: { key: string; answer?: 'yes' | 'no' | 'unsure' }[];
}

export interface DoctorVisit {
  id: string;
  date: DateKey;
  note: string;
}

export interface MedicineEntry {
  id: string;
  date: DateKey; // date = the day of the dose, or the course start
  kind: 'dose' | 'course'; // dose = taken when needed, course = taken regularly
  category: 'pain-relief' | 'hormone' | 'iron-or-supplement' | 'other';
  nameShown: string; // as she picked or typed it, for example 'Ponstan Forte'
  genericName: string | null; // from the catalogue, for example 'mefenamic acid'; null if unknown
  strengthMg: number | null; // strength of one unit, copied from her pack; null if not given
  takenAt?: Stamp;
  units?: number; // dose only: units = tablets, capsules or measures
  helped?: 'yes' | 'a-little' | 'no' | 'unsure'; // dose only
  startDate?: DateKey;
  stopDate?: DateKey | null; // course only
  note: string;
  updatedAt: Stamp;
}

export type RingSource = 'checkin' | 'body' | 'followup' | 'weekly-review';
export type SproutMood = 'bright' | 'calm' | 'sleepy' | 'welcome';
export type SproutReaction = 'water' | 'sleep' | 'meal' | 'other';
export type CompanionStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CompanionState {
  rings: number;
  stage: CompanionStage;
  unlocked: string[];
  badges: string[];
  lastRingDate: DateKey | null;
  dailyRings?: { date: DateKey; sources: RingSource[] };
  welcomeDate?: DateKey | null;
  lastCheckInDate?: DateKey | null;
  lastWeeklyReviewDate?: DateKey | null;
  lastWeeklyConfidence?: number | null;
  doctorFileCreated?: boolean;
}

export interface BackupMeta {
  lastExportAt: Stamp | null;
  lastAutoBackupAt: Stamp | null;
  snoozedUntil: Stamp | null;
  passphraseAsked: boolean;
}

export interface AppSnapshotData {
  profile: Profile | null;
  dayLogs: DayLog[];
  bodyLogs: BodyLog[];
  decisions: Decision[];
  forecasts: Forecast[];
  verdicts: Verdict[];
  watchItems: WatchItem[];
  visits: DoctorVisit[];
  medicines: MedicineEntry[];
  companion: CompanionState;
  meta: BackupMeta;
}

export interface BackupEncryptionMeta {
  method: 'PBKDF2-AES-GCM';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
  iv: string;
}

export interface UnlockedBackupFile {
  format: 'moonroot-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: Stamp;
  checksum: string;
  data: AppSnapshotData;
}

export interface LockedBackupFile {
  format: 'moonroot-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: Stamp;
  checksum: string;
  encryption: BackupEncryptionMeta;
  iv: string;
  ciphertext: string;
}

export type BackupFile = UnlockedBackupFile | LockedBackupFile;

export interface MoonrootStorage {
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<void>;
  getDayLog(date: DateKey): Promise<DayLog | null>;
  getAllDayLogs(): Promise<DayLog[]>;
  saveDayLog(log: DayLog): Promise<void>;
  deleteDayLog(date: DateKey): Promise<void>;
  getAllBodyLogs(): Promise<BodyLog[]>;
  saveBodyLog(log: BodyLog): Promise<void>;
  getAllDecisions(): Promise<Decision[]>;
  saveDecision(decision: Decision): Promise<void>;
  deleteDecision(id: string): Promise<void>;
  getAllForecasts(): Promise<Forecast[]>;
  saveForecast(forecast: Forecast): Promise<void>;
  getAllVerdicts(): Promise<Verdict[]>;
  saveVerdict(verdict: Verdict): Promise<void>;
  getAllWatchItems(): Promise<WatchItem[]>;
  saveWatchItem(item: WatchItem): Promise<void>;
  getAllVisits(): Promise<DoctorVisit[]>;
  saveVisit(visit: DoctorVisit): Promise<void>;
  getAllMedicines(): Promise<MedicineEntry[]>;
  saveMedicine(entry: MedicineEntry): Promise<void>;
  deleteMedicine(id: string): Promise<void>;
  getCompanion(): Promise<CompanionState>;
  saveCompanion(state: CompanionState): Promise<void>;
  getMeta(): Promise<BackupMeta>;
  saveMeta(meta: BackupMeta): Promise<void>;
  exportAll(): Promise<AppSnapshotData>;
  replaceAll(data: AppSnapshotData): Promise<void>;
  clearAll(): Promise<void>;
}
