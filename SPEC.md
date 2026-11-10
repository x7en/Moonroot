MOONROOT SPECIFICATION (SPEC.txt)

The full specification for Moonroot, a private, offline-first period and
body journal. It goes with the master prompt in
moonroot-master-prompt.txt, which says how the coding agent must work
and the rules it can never break. Final version of 8 November 2026, replacing the export of 1 November 2026 from the
document "Moonroot Master Prompt and Architecture".

Sections, in order: Product definition, System architecture, Data model,
Intelligence engines, Triage rules and question flows, Screens and
flows, Companion and gamification, Visual design system, Export and
doctor file, Build plan and APK pipeline, Testing and validation,
Safety, risks and open decisions, Sources.

The diagrams and the chart in the original document are not in this
file. The text says what they show, and the gate for each build step is
listed under Build plan and APK pipeline.

What changed in this version (8 November 2026)
----------------------------------------------
- Data model: warning signs, fever, pain relief and flooding are real fields, three catalogues are defined, there is a medicine log, a start-fresh marker, and event verdicts.
- Triage: a catch-all danger-sign rule, rules for mid-level pain with warning signs, hormone clot signs and discharge, history rules that fire once, and a green that says "Nothing flagged".
- Privacy: backups can be locked with a passphrase, and Android automatic cloud backup is switched off.
- Screens: text first, graphs only on request, a medicine log, and an Ask screen with fixed questions instead of a terminal or chatbot.
- Build plan: release 1 is steps 1 to 3, step 1 starts with a design freeze, cycle derivation moves to step 2, and the Get help sheet moves to step 1.
- Testing: exhaustive law tests, patient case cards and an input-coverage test.
Rows marked (new) or (changed) in the triage tables are unreviewed until a clinician signs them.

======================================================================
Product definition
======================================================================

Moonroot is a private, offline journal for very irregular cycles: it records first, guides second and predicts third, and it always predicts as a range.

Who it is for. One person whose cycles are very irregular, for example a drop of blood, a week of cramps, then sudden heavy flow. She uses an Android phone, wants a record a doctor can read, and may not log every day. A friend builds and maintains it from a phone with AI coding agents and GitHub, so the toolchain has to stay simple.

Pillars, in priority order
--------------------------

1. Private record. A complete day-by-day file with timeline, notes, a medicine log and export. This is the core and ships first.
2. Low-friction logging. A check-in that takes about 10 seconds, "not sure" always allowed, and a catch-up after time away.
3. Smart guidance. Follow-up questions, watch lists, four verdict levels with reasons, and standing flags for long-term patterns.
4. Probabilistic prediction. Ranges plus a confidence meter that starts at 10% and is measured, not decorative.
5. Whole-body tracking. Sleep, water, food, digestion, stress and exercise, shown as plain numbers first, and as patterns only when the data is strong enough, never as causes.
6. Calm, engaging design. A growing sprout, unlockable themes, and rewards that never punish.

Principles
----------

- Record first, prediction second.
- Ranges, not dates. With 70-day gaps the app never says "you are late". It shows days since the last period beside her own range.
- Rules, not live AI. Every verdict comes from a readable rule table a doctor can review. There is no server and no AI call.
- Triage, not diagnosis. The app sorts urgency and never names a condition as her diagnosis.
- Honest limits. It says when cycles are too variable to predict, and it estimates ovulation only from temperature, LH strip or mucus entries.
- Private by construction. No account, no analytics, no network calls. Notifications and the widget carry no health words.
- Forgiving. No streak resets, no "missed" language, at most one reminder a day.
- Text before graphs. Every screen shows numbers and words first. Charts live on one Graphs screen and appear only when she asks.
- Medicines are recorded, never advised. The app keeps what she took and adds it up, and says nothing about how much to take.
- No false reassurance. A quiet screen means "nothing flagged", never "all clear".

Non-goals
---------

- Diagnosing or treating anything.
- Use as contraception or for fertility treatment.
- Cloud sync, accounts, social features and ads.
- Calorie counting or weight targets, which can push unhealthy habits.
- Medicine dosing advice, and any free-text chatbot, terminal or AI assistant. The Ask screen uses fixed tappable questions instead.

Working constraints. Budget Android phones in the 3 GB RAM class. English first, with every string ready for Urdu. Temperatures in °C and emergency numbers set by region. The whole app must work with the phone in airplane mode.

======================================================================
System architecture
======================================================================

Moonroot is a TypeScript web app that runs entirely on the phone, with all medical logic in a pure core library that has no screen, storage or network code. The same build ships first as an installable web app and is wrapped for Android later.

Technology choices
------------------

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | Type errors catch data-shape bugs before they reach health logic |
| UI | Preact with Vite | React-style code that coding agents know, with a runtime a fraction of React's size |
| Styling | Plain CSS with custom-property tokens | Themes are token swaps, and there is no framework to ship |
| Fonts | Bundled with @fontsource | Nothing loads from the internet, so offline looks identical |
| Storage | IndexedDB through the idb library, behind a Storage interface | SQLite can replace it later without touching the core |
| Charts | Hand-drawn SVG components | Small, themeable, no chart library |
| Offline | vite-plugin-pwa (Workbox precache) plus a web manifest | Installable from Chrome on day one |
| Android | Capacitor 8 with Local Notifications, Haptics, Share, Filesystem and App plugins | Wraps the same web build into an APK |
| Widget | One small custom Kotlin plugin, WidgetBridge | The home-screen widget reads a tiny state file, never the database |
| Tests | Vitest for core, Playwright for screens, axe for accessibility | Core logic is tested without a browser |
| Hosting | GitHub Pages for the web app, GitHub Actions for the APK | Free, and workable from a phone |
| Translation | Typed message catalog (en.json, later ur.json) and logical CSS properties | Urdu and right-to-left can be added without a rewrite |

Use the current stable major of each tool and pin exact versions in package.json at the first install.

Layers. Dependencies point inward: ui calls app, app calls core, data implements the storage interface that core defines, and platform wraps anything native. core imports nothing outside its own folder. A lint rule (dependency-cruiser) fails the build if that is broken.

Because the core touches no screen or storage, the rules that decide when she should see a doctor can be tested on their own, with no phone and no browser.

Folder layout
-------------

```text
moonroot/
  core/        pure TypeScript, no DOM, no storage
    model/       types, enums, schema version, symptom, danger-sign and medicine catalogues
    cycles/      bleeding-episode classification, cycle derivation
    predict/     weighted quantiles, forecasts, confidence, lead-in learning
    ovulation/   temperature, LH strip and mucus interpretation
    triage/      rules.ts, engine.ts, questions.ts, thresholds.ts
    insights/    lifestyle correlations, pattern cards
    report/      Markdown, text, CSV and JSON builders
    companion/   rings, stages, unlock rules
    medicine/    dose totals, same-medicine detection, weekly counts
    ask/         fixed questions answered from her own data
  data/        storage adapters, migrations, backup and restore
  app/         store, reminder scheduler, routes
  ui/          screens, components, theme tokens, companion art
  platform/    web and native adapters: share, files, notifications, widget
  locales/     en.json, ur.json
  android/     generated by Capacitor, plus widget code
  tests/       unit, simulation, end-to-end
  docs/        clinical-review.md, case-cards.md, source-check.md, progress.md, exported rule table
```

Derive, do not store. Day logs are the source of truth. Cycles, bleeding episodes, streaks and badge progress are computed from the logs and her decisions by pure functions, so editing an old day can never leave stale cycle data behind. Only what cannot be recomputed is stored: frozen forecasts, verdict history, watch-list answers and companion unlocks. Recomputing three years of logs (about 1,100 days) must take under 50 ms on a budget phone.

Offline and privacy rules
-------------------------

- Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'. No third-party scripts, ever.
- The service worker caches only the app's own files.
- Request navigator.storage.persist() after the first saved log.
- In Android release builds, try removing the INTERNET permission and confirm the app still starts. If Capacitor refuses to start without it, keep it and rely on the policy above.
- Optional PIN lock: a salted PBKDF2 hash stored on the device. It is a screen lock, not encryption, and the app says so. With the lock on, hide the app preview in the recent-apps list.
- Backups can be locked with a passphrase (see Data model). The doctor file stays readable on purpose.
- Android automatic cloud backup is off: the manifest sets android:allowBackup to false and the data-extraction rules exclude everything, and a CI check fails the build if the built manifest says otherwise. Her data reaches a cloud only if she saves a backup file there herself.

Widget bridge. WidgetBridge.setState({ stage, mood, accent }) saves three values to Android SharedPreferences and asks the widget to refresh. The widget shows the companion and a check-in button and nothing else.

======================================================================
Data model
======================================================================

Every record is plain JSON in IndexedDB, keyed by local calendar date, and the day log is the single source of truth. The types below are the contract the coding agent implements in core/model.

Rules for all records
---------------------

- Dates are local calendar dates written YYYY-MM-DD, never UTC. Timestamps are ISO 8601 with the phone's offset.
- Temperature is stored in °C and water in ml. Screens convert for display.
- A day with no log means "not logged". It is never counted as "no bleeding". flow: 'none' is an explicit answer.
- Entries marked approximate count toward cycle lengths but not toward the forecast track record.
- Free text is for people. No rule or engine reads it.
- Days tagged fasting are left out of water and meal insights.
- Medicine entries are what she picked or typed. The app never converts, limits or advises on them, and totals are sums of her own entries.
- The intimacy block exists only when the profile allows it and she chose to answer. It is exported only if she ticks that option.

Types
-----

```ts
type DateKey = string;   // 'YYYY-MM-DD', the phone's local date
type Stamp = string;     // ISO 8601 date-time with offset

type Flow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy' | 'unsure';
type Protection = 'none' | 'liner' | 'pad' | 'tampon' | 'cup' | 'disc';
type Clots = 'none' | 'small' | 'large';          // large = bigger than a coin, about 2.5 cm
type PainSite = 'lower-middle' | 'left' | 'right' | 'back' | 'whole-belly' | 'other';
type Level = 'green' | 'yellow' | 'orange' | 'red';
type DangerSign = 'dizzy' | 'fainted' | 'short-of-breath' | 'chest-pain' | 'nausea' | 'vomiting'
                | 'very-pale' | 'confused' | 'sunburn-rash' | 'diarrhoea' | 'unusual-tiredness'
                | 'breathless-on-effort' | 'leg-pain-or-swelling' | 'severe-headache' | 'vision-change';

interface Profile {
  schemaVersion: number;
  createdAt: Stamp;
  birthYear: number | null;
  menarcheAge: number | null;                 // age at first period, in years
  selfRegularity: 'regular' | 'irregular' | 'unknown';
  lastPeriodApprox: DateKey | null;           // from onboarding, always approximate
  onHormones: boolean | null;                 // any hormone medicine, including the pill for cycle control
  contraception: 'none' | 'combined-pill' | 'progestin-pill' | 'implant' | 'hormonal-iud'
               | 'copper-iud' | 'injection' | 'condoms' | 'other' | null;
  sexualHealthQuestions: 'when-relevant' | 'off';
  intimacy: 'none' | 'active' | 'prefer-not-to-say' | null;
  conditionsNote: string;
  medicationsNote: string;
  sproutName: string | null;
  theme: string;
  units: { temperature: 'C' | 'F'; water: 'ml' | 'glasses' };
  reminders: { daily: { on: boolean; time: string }; watchlist: boolean; quietFrom: string; quietTo: string };
  discreetMode: boolean;
  lock: { type: 'none' | 'pin'; hash?: string; salt?: string };
  locale: string;
  region: string;                             // picks emergency numbers, for example 'PK'
  disclaimerAcceptedAt: Stamp | null;
}

interface DayLog {
  date: DateKey;                              // primary key
  filledFrom: 'live' | 'backfill' | 'approximate';
  flow: Flow | null;
  protection?: Protection;
  productsUsed?: number;
  soakedPerHour?: boolean;                    // soaked 1 or more products an hour for 2 or more hours
  changeEvery?: 'under-2h' | '2-3h' | 'over-3h';  // how often she changes a product while flowing
  flooding?: boolean;                         // blood leaking through in a rush
  doubleProtection?: boolean;                 // two products at once
  clots?: Clots;
  colour?: 'bright-red' | 'dark-red' | 'brown' | 'pink' | 'other';
  pain?: { level: number; sites: PainSite[]; sudden?: boolean; stoppedActivities?: boolean;
           reliefHelped?: 'yes' | 'no' | 'none-taken' };  // level 0-10; reliefHelped is asked at 8 or more
  symptoms: string[];                         // keys from the symptoms list under Catalogues
  danger: DangerSign[];                       // warning signs she ticked today, from the danger-sign list
  fever?: { c?: number; felt?: boolean };     // c = measured in °C; felt = feels feverish, no number
  mood?: 1 | 2 | 3 | 4 | 5;
  discharge?: 'none' | 'clear' | 'white' | 'yellow-green' | 'brown' | 'odour' | 'other';
  fertility?: { bbt?: number; bbtTime?: string; lh?: 'negative' | 'faint' | 'positive';
                mucus?: 'dry' | 'sticky' | 'creamy' | 'watery' | 'egg-white' };
  context?: { stress?: 1 | 2 | 3 | 4 | 5; illness?: boolean; travel?: boolean;
              medicationChange?: boolean; emergencyContraception?: boolean };
  intimacy?: { event: 'protected' | 'unprotected' | 'unsure'; bleedingAfter?: boolean; painDuring?: boolean };
  test?: { kind: 'pregnancy'; result: 'negative' | 'positive' | 'unclear' };
  note: string;
  updatedAt: Stamp;
}

interface BodyLog {
  date: DateKey;
  sleep?: { hours: number; quality: 1 | 2 | 3; wokeTired?: boolean };
  water?: { ml: number };
  meals?: { pattern: 'regular' | 'irregular' | 'skipped-some';
            tags: ('balanced' | 'sugary' | 'caffeine' | 'late-night' | 'fasting')[] };
  stool?: { count: number; bristol?: 1 | 2 | 3 | 4 | 5 | 6 | 7; pain?: boolean; bloating?: boolean; bloodSeen?: boolean };
  exercise?: { minutes: number; effort: 'light' | 'moderate' | 'hard' };
  energy?: 1 | 2 | 3 | 4 | 5;
  skin?: { acne?: 0 | 1 | 2 | 3; hair?: 'none' | 'shedding' | 'new-growth' };
  updatedAt: Stamp;
}

interface Decision {                           // what she told the app, kept apart from raw logs
  id: string; date: DateKey; at: Stamp; note?: string;
  kind: 'period-start' | 'not-a-period' | 'period-end' | 'ignore-in-predictions' | 'new-baseline';
}

interface Forecast {                           // frozen when a period start is confirmed
  id: string; anchor: DateKey; madeOn: DateKey;
  basis: 'cycle-lengths' | 'lead-in-pattern' | 'ovulation';
  cyclesUsed: number; confidence: number;     // 0-100 at the time
  likely: [DateKey, DateKey]; possible: [DateKey, DateKey]; peak: DateKey;
  rulesetVersion: string;
  outcome?: { actualStart: DateKey; inLikely: boolean; inPossible: boolean; errorDays: number };
}

interface Verdict {
  id: string; at: Stamp; level: Level; ruleIds: string[]; title: string; reasons: string[];
  rulesetVersion: string; watchId?: string;
  kind: 'today' | 'event';                    // today = from today's answers, event = from her history
  triggerKey?: string;                        // event verdicts: the rule ID plus the date that triggered it
  dismissedAt?: Stamp;                        // she tapped Got it
  closedByVisit?: string;                     // id of the doctor visit that closed it
}

interface WatchItem {
  id: string; createdAt: Stamp; dueAt: Stamp; status: 'open' | 'closed' | 'escalated';
  checks: { key: string; answer?: 'yes' | 'no' | 'unsure' }[];
}

interface DoctorVisit { id: string; date: DateKey; note: string }

interface MedicineEntry {
  id: string; date: DateKey;                  // date = the day of the dose, or the course start
  kind: 'dose' | 'course';                    // dose = taken when needed, course = taken regularly
  category: 'pain-relief' | 'hormone' | 'iron-or-supplement' | 'other';
  nameShown: string;                          // as she picked or typed it, for example 'Ponstan Forte'
  genericName: string | null;                 // from the catalogue, for example 'mefenamic acid'; null if unknown
  strengthMg: number | null;                  // strength of one unit, copied from her pack; null if not given
  takenAt?: Stamp; units?: number;            // dose only: units = tablets, capsules or measures
  helped?: 'yes' | 'a-little' | 'no' | 'unsure';   // dose only
  startDate?: DateKey; stopDate?: DateKey | null;  // course only
  note: string; updatedAt: Stamp;
}
interface CompanionState { rings: number; stage: 0 | 1 | 2 | 3 | 4 | 5 | 6; unlocked: string[]; badges: string[]; lastRingDate: DateKey | null }
interface BackupMeta { lastExportAt: Stamp | null; lastAutoBackupAt: Stamp | null; snoozedUntil: Stamp | null; passphraseAsked: boolean }
```

Catalogues
----------

Three fixed lists live in core/model. Each key has a label in locales/en.json, and a test fails if a rule, question or screen uses a key that is not listed.

Symptoms (the symptoms field): cramps, headache, bloating, tender-breasts, back-pain, tiredness, cravings, constipation. No rule reads them. They go to the doctor file.

Danger signs (the danger field). She ticks them on one screen, "Any of these right now?", with a None of these button. Rules read warning signs from this list and nowhere else.

| Key | Shown as | Read by |
| --- | --- | --- |
| fainted | Fainted | RED-02, RED-03, RED-06, RED-09 |
| chest-pain | Chest pain | RED-02, RED-09 |
| short-of-breath | Trouble breathing | RED-02, RED-09 |
| confused | Confused | RED-06, RED-09 |
| dizzy | Dizzy | RED-02, RED-03, RED-06, ORG-14 |
| nausea | Sick to my stomach | RED-03, ORG-14 |
| very-pale | Very pale | RED-03, ORG-10, ORG-14 |
| vomiting | Vomiting | RED-06, RED-10 |
| sunburn-rash | Sunburn-like rash | RED-06 |
| diarrhoea | Diarrhoea | RED-06 |
| unusual-tiredness | Unusually tired | ORG-10 |
| breathless-on-effort | Breathless on effort | ORG-10 |
| leg-pain-or-swelling | Leg pain or swelling | RED-11 |
| severe-headache | Sudden severe headache | RED-11 |
| vision-change | Sudden change in vision | RED-11 |

The last three appear only when she takes hormone medicine that may contain oestrogen: a combined pill, another hormone medicine, or a hormone medicine of unknown type, as recorded in her profile or in an active hormone course in the medicine log. Fever is not a chip. It is the fever field, asked on the same screen as "Fever or feeling feverish?" with an optional temperature in °C.

Medicines (the medicine catalogue). A short starter list that pairs brand names with generic names: Ponstan and Ponstan Forte with mefenamic acid, Brufen with ibuprofen, Panadol and Calpol with paracetamol. It also has category entries for hormone medicines (combined pill, progestin-only pill, other) and iron. It holds names only, with no strengths and no doses, because a number copied from memory could be wrong. She types the strength printed on her pack, and she can add any name by hand. A pharmacist checks and extends the list before release, and strength suggestions can be added only after that check.

Storage layout. One IndexedDB database named moonroot.

| Store | Key | Extra index |
| --- | --- | --- |
| profile | 'me' | none |
| dayLogs | date | none |
| bodyLogs | date | none |
| decisions | id | date |
| forecasts | id | anchor |
| verdicts | id | at |
| watchItems | id | status |
| visits | id | date |
| medicines | id | date |
| companion | 'me' | none |
| meta | 'me' | none |

Backup file. One JSON file: { format: 'moonroot-backup', schemaVersion, appVersion, exportedAt, checksum, data }, where checksum is SHA-256 over the canonical JSON of data. Restore checks the format and checksum, shows counts such as "412 days, 9 cycles" before replacing anything, and keeps a hidden pre-restore snapshot for 7 days. Version 1 replaces data and never merges. A file with a newer schema version is refused with a plain message.

Backup passphrase. At her first backup the app offers a passphrase and recommends one. A locked backup keeps the same file format, but data is replaced by iv and ciphertext, and an encryption block records the method: a key made from the passphrase with PBKDF2 and a random salt, and AES-GCM from the browser's built-in crypto. The agent adds no library for this and sets the PBKDF2 iteration count from the current OWASP guidance. The checksum is checked after unlocking. A wrong passphrase, or a file changed after export, is refused with a plain message and nothing is imported. Before she confirms, the app says that a forgotten passphrase cannot be recovered and that an unlocked backup can be read by anyone who has the file. The doctor file stays readable on purpose, and the share screen says so. The PIN stays a screen lock only.

Migrations. data/migrations.ts holds one pure function per step, migrations[n] turning version n into n + 1. They run inside a single IndexedDB upgrade transaction. Every version keeps a fixture file, and a test migrates each fixture to the latest version.

======================================================================
Intelligence engines
======================================================================

Seven pure functions in core turn her logs into a classified record, a forecast and a confidence score. None uses AI, and each takes data in and returns data out, so it can be tested without a phone.

1. Bleeding episodes. A bleeding run is a stretch of days with flow other than none. It ends after 2 logged none days in a row or 4 or more unlogged days in a row. A run is a period when it has at least one medium or heavy day, or 2 light days with protection, or she confirmed it. A run with only spotting is spotting. Anything else is unclear and triggers a follow-up within 24 to 72 hours. Her not-a-period decision always wins. The flow start is the first day of real flow, and leadInDays records how many spotting days came before it. She can move a cycle's start to the first spot with a period-start decision. Spotting not followed by flow within 14 days is stored as an in-between spotting event for the triage rules.

2. Cycles. A cycle runs from one period start to the next, so it needs two starts. Lengths outside 10 to 200 days are flagged "check this date" and not counted. Cycles she marks ignore-in-predictions stay in the record but leave the forecast. Cycles built from approximate dates count at half weight. A new-baseline decision sets a date: cycles that started before it stay in the record but leave the forecast and the history rules (see Hormone medicine and start fresh). The app offers the marker when a hormone course starts or stops, and she can set it by hand on the Cycle tab.

3. Forecast. Input is the valid cycle lengths, oldest to newest.

- Weight each length by 0.85 raised to its age in cycles, so recent cycles count more.
- While she has fewer than 8 cycles, add five prior cycles, each weighted 0.4 × (1 − n/8). At 3 or more years since her first period the prior is 25, 28, 30, 33, 37 days (FIGO normal range 24 to 38). Earlier than that it is 23, 28, 32, 37, 43 (ACOG range 21 to 45).
- Take weighted quantiles with midpoint interpolation. Likely window = 25th to 75th percentile. Possible window = 10th to 90th. Peak = median.
- Once d days have passed since the last start, recompute using only past lengths longer than d. If fewer than 3 remain, drop the likely window and show only "Day d. The longest gap you logged is M days," with the possible window ending at the larger of M and d + 14.
- The app never says "late". It shows the day count beside her own range.

4. Lead-in pattern. A signal day is the first day in the 14 days before a flow start with spotting or cramps of 3 out of 10 or more. For each cycle with a signal, the offset is flow start minus signal day. The pattern counts as learned when at least 4 cycles have offsets, the standard deviation of her last 8 offsets is 2 days or less, and at least 60% of signal events were followed by flow within 14 days. When it is learned and a signal appears with no flow yet, the forecast switches to basis lead-in-pattern: likely = signal day + the 25th to 75th percentile of her offsets. If fewer than 60% of signals were followed by flow, the pattern is marked unreliable and ignored. A learned pattern is also retired when it misses its likely window in two of its last three uses, and the Cycle tab then says "This pattern is not holding." These limits come from simulation: on random signals the rule learns a false pattern in at most 9% of histories, and on a real pattern (offsets of 5 to 9 days, signal in 4 of 5 cycles) it learns it in about 73% of histories after 5 cycles and 99% after 8. Do not loosen them without re-running the simulation. This is the engine aimed at her "one drop, a week of cramps, then heavy flow" pattern.

5. Confidence meter. A score from 10 to 95, not a probability. It starts at exactly 10 with no cycles.

```latex
\text{confidence} = \min\bigl(95,\; 10 + 30\,C + 30\,S + 30\,T\bigr)
```

- C, data: min(n, 8) / 8, where n counts approximate cycles as 0.5.
- S, consistency: max(0, 1 − IQR / 30) × min(1, (n − 2) / 4) for n of 3 or more, else 0. IQR is the weighted 75th minus 25th percentile of the last 8 cycle lengths, in days.
- T, track record: hit × max(0, 1 − width / 60) × min(1, (m − 1) / 3) for m of 2 or more resolved forecasts, else 0. hit is the share of the last 8 whose real cycle length fell inside the possible window. width is their mean possible-window width in days.
- A forecast is frozen when a period start is confirmed and scored when the next start is confirmed, so there is no hindsight. Only forecasts made from 3 or more real cycles count.
- When n is 8 or more and S is below 0.35, show: "Your cycles vary a lot, so ranges stay wide. That limit comes from the cycles, not from how you log."
- Always show the window width next to the score, for example "likely window 18 days wide".
- Once 2 or more forecasts have been scored, also show the measured count, for example "Past possible windows held the real start in 6 of the last 8." The score is called confidence in the app, never accuracy.

6. Ovulation. Only logged signals count. With none, the app says "Not enough signals to estimate ovulation" and never guesses from the calendar.

- Temperature: ovulation is estimated on the day before the first of 3 consecutive readings that each exceed the highest of the 6 readings before them, the third by at least 0.2 °C. Days tagged illness are skipped.
- LH strip: a positive strip means ovulation is likely within 24 to 36 hours.
- Mucus: the last watery or egg-white day is the peak, and ovulation is likely within 1 to 2 days.
- Two signals within 5 days of each other make ovulation confirmed. One signal makes it probable.
- After 2 confirmed cycles the app learns her luteal length (ovulation to next flow). Forecasts then use basis ovulation: ovulation date + her 10th to 90th percentile luteal length (10 to 16 days until she has two).
- Forty or more days of temperature logging with no shift is noted for the doctor file only. It is never shown as a diagnosis.
- A fixed banner says the app is not a contraception method.
- A words-only "Ways to find out" screen lists the options in plain terms: cervical mucus is free, a thermometer needs steady mornings, and strips cost money. With very irregular cycles it often says "not enough signals yet", and it adds that a doctor has better ways to check.

7. Medicine totals. Pure functions in core/medicine read her medicine entries and return sums and counts, nothing else. For a day: per generic name, the number of doses, the number of units, and the total in mg, where the total is units times strength for entries that have a strength, and entries without one count as doses marked "strength not given". Entries that share a generic name under different shown names are grouped and flagged "Same medicine", for example Ponstan and Ponstan Forte. For a date range: a weekly count per generic name, days with at least one dose, and how often she said it helped. No function compares an amount with a limit, so there is no warning level, and no output says what she should take.

Lifestyle patterns. The app tests sleep hours, water, meal pattern, stool type, stress, exercise and caffeine against next-day cramps, headache, mood and energy. Tests against spotting and against the next cycle's length are left out of this version: spotting is a bleeding variable, and very irregular cycles give too few cycles to test fairly. Both the cause day and the outcome day must have flow none, so the period itself cannot create a pattern. A pattern appears only with at least 14 days in each comparison group, at least 6 outcome events, a medium or larger effect (Cohen's d of 0.5 or more), and the same direction in both halves of the data. At most 20 pairs are tested, at most 3 patterns show at once, and each expires after 60 days without support. Wording is fixed: "On days after under 6 hours of sleep, cramps were rated 2 points higher (14 days of each). This is a pattern, not proof of cause."

======================================================================
Triage rules and question flows
======================================================================

The app sorts what she logs into four urgency levels using a fixed rule table, and it always shows which rule fired and why. It never diagnoses. Thresholds come from FIGO 2018, ACOG Committee Opinion 651, NHS and NI Direct guidance and standard first-aid practice, and a clinician must review every row before the app leaves a personal circle.

Source keys used in the tables: ACOG (also the 21 to 45 day range) · FIGO · NHS Wales · Merck · Healthline · NHS ectopic · NI Direct TSS · Std = standard practice, a clinician confirms the number.

Levels. Today's verdict is the highest level among the rules that fire from today's answers. History rules never change today's verdict. They raise one event card, once, when they first become true.

| Level | Label on screen | Meaning | Shown with |
| --- | --- | --- | --- |
| Green | Nothing flagged | Nothing in today's answers matched a warning rule | A check icon and a calm tint |
| Yellow | Keep watching | Unusual, not dangerous now | A watch list for the next 24 to 72 hours |
| Orange | See a doctor soon | A visit in the next 1 to 2 weeks is sensible | A note added to the doctor file |
| Red | Get care today | Needs same-day medical care | The Get help sheet with local emergency numbers |

Every level has its own icon and word, so colour never carries the meaning alone. An "unsure" answer to a danger question counts as "yes". Green needs every required answer for the day: flow, pain, and the danger-sign screen on any day it was asked. If one is missing, the card says "Answer N more questions to see a result" and shows no level, so skipped questions cannot produce reassurance.

Event cards. Every orange row except ORG-14 is an event rule. An event rule fires once for each trigger, named by a trigger key made of the rule ID and the date of the entry that made it true, and it never changes today's verdict. It raises an event card, which stays on Today until she taps Got it or logs a doctor visit, and then lives in verdict history and, for long-term patterns, in standing flags. While an event card is open, Green is replaced by "Nothing new today. An earlier flag is still open." so a quiet day never reads as an all-clear. Red and yellow rows are today rules: they fire from today's answers, and a new red always shows, whatever she dismissed before.

Rows marked (new) or (changed) were added or edited on 8 November 2026. Their numbers are numbers already used elsewhere in these tables, none was invented, and all of them are Std until a clinician reviews them.

Red rules: get care today
-------------------------

| ID | Fires when | Source |
| --- | --- | --- |
| RED-01 | Soaking 1 or more pads or tampons an hour for 2 or more hours in a row | ACOG (more than 1 every 1 to 2 hours), Healthline (every hour for over 2 hours) |
| RED-02 | Medium or heavy flow with dizziness, fainting, shortness of breath or chest pain | Healthline |
| RED-03 | Sudden, intense belly pain of 8 out of 10 or more, with dizziness, fainting, nausea or looking very pale | NHS ectopic |
| RED-04 | One-sided or shoulder-tip pain, or pain with bleeding or brown discharge, when pregnancy is possible or a test is positive | NHS ectopic |
| RED-05 | A positive pregnancy test with bleeding or pain | NHS ectopic |
| RED-06 | Tampon or cup in use with fever of 39 °C or more, or with a sunburn-like rash, vomiting or diarrhoea, dizziness, fainting or confusion | NI Direct TSS |
| RED-07 | Fever of 38 °C or more with lower belly pain, or with smelly or yellow-green discharge | Std |
| RED-08 | Pain of 8 out of 10 or more that usual pain relief does not ease | Std |
| RED-09 | (new) Any one of fainting, chest pain, trouble breathing or confusion, whatever else she logged, including no flow and no pain | Std |
| RED-10 | (new) Sudden one-sided belly pain of 4 or more with vomiting, whether or not pregnancy is possible | Std |
| RED-11 | (new) Hormone medicine that may contain oestrogen, with one-sided leg pain or swelling, a sudden severe headache or a sudden change in vision | Std |

RED-06 shows "Remove the tampon or cup now" before anything else. When sexual-health questions are off, RED-03 and RED-04 use generic wording: "Sudden, severe or one-sided belly pain needs same-day care, whatever the cause."

RED-08 reads pain.reliefHelped (no, or not sure). "I have not taken any" does not fire it; see Open decisions. RED-09 is the safety net for everything the other rows do not name. RED-10 and RED-04 can both fire, and the more specific text is shown. RED-11 is checked only when the oestrogen condition in Catalogues holds.

Orange rules: see a doctor soon
-------------------------------

| ID | Fires when | Source |
| --- | --- | --- |
| ORG-01 | One period lasts more than 7 days | ACOG, NHS Wales |
| ORG-02 | In one period: soaking more than 1 product every 1 to 2 hours, two products at once, flooding, or clots bigger than about 2.5 cm | ACOG, NHS Wales, FIGO (saturated within 3 hours, clots over 2.5 cm) |
| ORG-03 | 90 or more days since the last period start | ACOG ("90 days apart, even for 1 cycle"), Merck (3 missed periods) |
| ORG-04 | 2 of the last 3 cycles shorter than 21 days | ACOG |
| ORG-05 | 2 of the last 3 cycles longer than the upper limit: 45 days up to 3 years after her first period, 38 days after that | ACOG (21 to 45), FIGO (24 to 38) |
| ORG-06 | Bleeding after sex 2 or more times in 3 months, or once with pain | NHS Wales |
| ORG-07 | Spotting not followed by flow within 14 days, 2 or more times in 3 months | NHS Wales (bleeding between periods) |
| ORG-08 | Spotting on 7 or more days in a row | Std |
| ORG-09 | Pain of 7 out of 10 or more, or pain that stops normal activities, in 2 of the last 3 periods | NHS Wales (severe pain, life affected) |
| ORG-10 | Heavy flow on 2 or more days with unusual tiredness, paleness or breathlessness on effort | NHS Wales |
| ORG-11 | A positive pregnancy test without pain or bleeding | Std |
| ORG-12 | Blood seen in stool outside a period, or for more than 2 days | Std |
| ORG-13 | A negative test, then 14 more days with no period, when pregnancy was possible | Std |
| ORG-14 | (new) Pain of 4 to 7 out of 10 with dizziness, nausea or looking very pale, and no flow | Std |
| ORG-15 | (new) Smelly or yellow-green discharge still present at the 72-hour check | Std |

Yellow and green rules
----------------------

| ID | Level | Fires when | Source |
| --- | --- | --- | --- |
| YEL-01 | Yellow | Spotting on 3 to 6 days in a row | Std |
| YEL-02 | Yellow | (changed) Cramps of 4 to 7 out of 10 with no flow and no warning sign ticked. With a warning sign, ORG-14 fires instead | Std |
| YEL-03 | Yellow | Suggest a pregnancy test: a risk event since the last start, 21 or more days since that event, days since the last start at least the smaller of 35 and her median cycle plus 7, and no negative test in the last 14 days | Std (the 21 days to be confirmed in review) |
| YEL-04 | Yellow | One cycle shorter than 21 days or longer than the upper limit | ACOG, FIGO |
| YEL-05 | Yellow | Bleeding after sex once, without pain | NHS Wales |
| YEL-06 | Yellow | A negative test and no period 7 days later, with pregnancy still possible: repeat the test | Std |
| YEL-07 | Yellow | One heavy-flow sign below the orange line: a product changed every 2 to 3 hours, or small clots | NHS Wales |
| YEL-08 | Yellow | (new) Smelly or yellow-green discharge logged, without fever | Std |
| YEL-09 | Yellow | (new) Pain during sex logged, without bleeding (only when allowed) | Std |
| GRN-01 | Green | (changed) No rule above fires, every required answer is in, and no event card is open | This app |
| GRN-02 | Green | The day count is inside her own possible window | This app |
| GRN-03 | Green | Today's spotting or cramps match her learned lead-in pattern | This app |
| GRN-04 | Green | Stress, illness, travel, a new medicine or emergency contraception is logged and shown as a common reason for change | Std |

Standing flags. These come from her history, not from today's log. They show on Record and in the doctor file. A soft card on Today appears at most once every 30 days, or when a new event triggers one, so a long-term pattern never becomes a daily alarm.

| ID | Fires when | Source |
| --- | --- | --- |
| STD-01 | The last 6 cycle lengths differ by more than 9 days, longest minus shortest | FIGO (regularity 7 to 9 days) |
| STD-02 | 3 or more of the last 6 cycles fall outside her age band: under 21, or over 45 in the first 3 years after her first period, or over 38 after that | ACOG, FIGO |
| STD-03 | Fewer than 9 periods in the last 12 months | Merck |
| STD-04 | Any gap of 90 days or more in the last 12 months | ACOG |
| STD-05 | ORG-01, ORG-02 or ORG-09 happened in 2 or more of the last 3 periods | As cited in those rows |
| STD-06 | Spotting between periods, or bleeding after sex, keeps recurring | NHS Wales |
| STD-07 | 8 or more cycles logged and the confidence meter is still limited by variability | This app |

Hormone medicine and start fresh
--------------------------------

Starting or stopping hormone medicine changes bleeding, so old cycles no longer describe her. When a hormone course starts or stops in the medicine log, the app asks "Start predictions fresh from this date?" She can also set the marker by hand on the Cycle tab. The marker is a new-baseline decision. Cycles that started before it stay in the record and the doctor file, labelled "before the change", but they leave the forecast, the history rules that read cycle lengths (ORG-04, ORG-05, YEL-04) and the standing flags that read them. ORG-03 still fires after 90 days with no period, because pregnancy can happen on any medicine, and while she is on hormone medicine its card adds "Some hormone medicines stop periods. If that is expected for you, ask your doctor to confirm." The pregnancy-test rules are unchanged.

Which questions appear
----------------------

- Pregnancy and contraception questions appear only when sexualHealthQuestions is when-relevant and the trigger calls for them: a late period, pain, bleeding or a test.
- With intimacy: none, no pregnancy questions appear and red-flag text stays generic.
- With prefer-not-to-say, one neutral question appears at those triggers: "Is there any chance you could be pregnant?" with Yes, No and Prefer not to say.
- Under 18, the app never asks about sexual acts, partners or frequency and has no intimacy log. Only the neutral question above can appear, and orange and red screens add "Tell a parent, relative or school nurse if you can."
- Everyone gets the hormone medicine question in onboarding, because the pill and other hormone medicines change bleeding.
- In the first 3 years after her first period, green wording says irregular cycles are common at this stage, and the upper cycle limit is 45 days.

Question flows. Each trigger asks at most 4 one-tap questions, except that a question a red rule needs is always asked, even if it makes five. A screen of chips counts as one question.

| Trigger | Questions |
| --- | --- |
| Spotting logged | 1. Drops only, or did you need a pad or tampon? 2. Any cramps: none, mild, strong? 3. Is it more than yesterday? (hidden on the first day) 4. Chance of pregnancy (only when allowed) |
| Medium or heavy flow logged | 1. How often are you changing a pad or tampon? Every hour or more often for 2 hours or more, every 1 to 2 hours, every 2 to 3 hours, or less often. 2. Clots and leaks, as chips: none, small clots, clots bigger than a coin, flooding, two products at once. 3. Any of these right now? (the danger-sign screen) 4. Pain from 0 to 10 |
| Pain of 4 or more without flow | 1. Where: middle, left, right, back? 2. Did it start suddenly? 3. Any of these right now? (the danger-sign screen, with the fever question on it) 4. The pregnancy question, when allowed. At pain of 8 or more, one more: Has pain medicine helped? Yes, No, I have not taken any |
| Many days since the last start: once at the larger of her 75th percentile and 35 days, then at most every 14 days | "No period yet. Has anything changed lately?" with chips: stress, illness, travel, weight change, new medicine, test taken |
| Bleeding or pain after sex (only when allowed) | 1. Was there pain too? 2. Has it happened before? |
| Fever logged | 1. Are you using a tampon or cup? 2. Lower belly pain? 3. Smelly or yellow-green discharge? |
| Blood in stool logged | Is it from the back passage, or from your period? |
| Smelly or yellow-green discharge logged | 1. Any fever or feeling feverish? 2. Lower belly pain? 3. Using a tampon or cup? |
| A hormone medicine is started or stopped in the medicine log | "Start predictions fresh from this date?" Yes, No, Later |

Answer mapping. The first answer to the flow question sets soakedPerHour for the first option and changeEvery for the others (the first two options both set under-2h). Every other answer sets the DayLog field of the same name, and a test checks that every rule input has a field and a question.

Watch list. Yellow verdicts and unclear bleeding runs create a watch list of up to 3 checks, due the next morning and again at 72 hours. Each is answered Yes, No or Not sure. A Yes on a danger check raises the level at once. The list closes after 72 hours with a one-line summary in the record, and no check repeats more than twice. YEL-08 starts a watch list of one check, "Is the discharge still there?", and a Yes at the 72-hour check fires ORG-15.

Wording rules
-------------

- Plain and calm. "This can happen", never "abnormal", "late", "missed" or "failed".
- The Green label and headline say "Nothing flagged". They never say normal, common or fine, and never say she is safe. A supporting note under them may say that irregular cycles are common in the first 3 years after a first period, or that stress and illness are common reasons for change, because those are facts about her situation, not a verdict on her.
- Never name a diagnosis as hers. Conditions appear only in the doctor file, as things she can ask about.
- Every verdict shows its reason: "Because you logged soaking a pad an hour for 2 hours."
- Every orange and red screen ends with "If you are worried, see a doctor even if this looks fine."

Get help sheet. Red verdicts open a sheet with a one-tap call button. regions.json holds the numbers per region. Pakistan defaults to 1122 (Rescue 1122) and 115 (Edhi ambulance), which Wikipedia lists for Karachi, Islamabad, Lahore, Quetta and Peshawar. Confirm them for her city before release.

The sheet also carries two fixed lines that collect nothing: "If you feel unsafe, or you are thinking about hurting yourself, tell someone you trust now, or call the emergency number above." and "If someone is hurting you, or made you do something you did not want, you can tell a doctor, a nurse or an adult you trust." Under 18, the second line names "a parent, relative or school nurse". regions.json also has a field for a local mental-health line. It stays empty for a region until someone has checked the number, and the app never shows a number it has not checked. The app does not read her notes or her mood to look for distress. The sheet is one tap away from every screen, and it ships in step 1.

======================================================================
Screens and flows
======================================================================

Moonroot has four tabs, Today, Cycle, Record and Body, plus a log button on every screen, and each screen must let her finish what she came for in under 10 seconds.

| Tab | Job | What is on it |
| --- | --- | --- |
| Today | Check in and see what matters now | Companion, flow buttons, pain dial, symptom chips, Add medicine, verdict card, event cards, watch list, one forecast line, catch-up prompt |
| Cycle | See where she is in her pattern | Confidence number with its measured count, next-period windows in words, a month calendar for browsing, learned lead-in pattern, ovulation card, "Add earlier periods", a Graphs button |
| Record | Keep and share the patient file | Timeline, profile, the medicine log, standing flags with evidence, verdict history, tests and doctor visits, Ask your record (step 6), Create doctor file, backup status |
| Body | Track sleep, water, food and digestion | Four cards with plain numbers, stress and exercise, a "Fasting today" switch, lifestyle patterns once unlocked, a Graphs button |

Settings sits behind the gear on Today: profile, reminders, privacy (PIN and discreet mode), theme and companion, units, language, backup (with the passphrase choice) and restore, the rule version with its last clinical review date, and a two-step Delete all data.

Text first. Every tab shows numbers and words by default. Charts live on one Graphs screen, opened by a Graphs button on Cycle, Body and Record, and only when she asks. The month calendar on Cycle is for browsing days, not a chart.


Onboarding. Six screens, about 60 seconds. Every field except the disclaimer can be skipped.

1. Welcome. "Everything stays on this phone." She accepts one line: "This app tracks and sorts urgency. It does not diagnose."
2. About you. Birth year, age at first period (or "I don't remember"), and an optional name for her sprout.
3. Your cycles. Regular, irregular or not sure, and her last period start (or "not sure").
4. Health context. Hormone medicine (yes, no, not sure), an optional conditions note, and the pregnancy-question setting: when relevant, off, or prefer not to say. Under 18 sees only the neutral version.
5. Reminders and privacy. One optional daily reminder time, discreet notifications on by default, and an optional PIN.
6. Done. The confidence meter shows 10% with one sentence: "Each period you log tightens your ranges."

Check-in. The flow buttons (None, Spotting, Light, Medium, Heavy, Not sure) save on one tap, with a 5-second Undo. Pain, symptom chips, mood and a note are optional and sit below. A typical check-in is 1 to 4 taps. After saving, the companion reacts, then any triggered questions appear (at most 4), then the verdict card with its reason. Past days open from the Cycle calendar or the Record timeline.

Danger-sign screen. When a flow, pain, fever or discharge trigger calls for it, one screen asks "Any of these right now?" with chips from the danger-sign list, a None of these button, and the fever question with an optional temperature. There is no "not sure" chip. The screen says "If you are not sure, pick the closest one." If she leaves it unanswered, no Green shows for that day.

Medicine log. Add medicine on Today and Record opens a sheet: pick a brand or generic name or type one, the strength printed on the pack (optional), how many, and when (now by default). "Same as last time" repeats the last dose in one tap. After saving, one optional tap asks "Did it help? Yes, A little, No, Not sure." A regular course (a pill, iron) takes a start date and an optional stop date. Today shows one line per medicine, for example "Today: mefenamic acid, 2 doses, {total} mg from the strengths you entered. Check the pack for the daily limit." When two entries share a generic name, a line adds "Same medicine: Ponstan and Ponstan Forte are both mefenamic acid." No colour, warning level or reward is attached to a medicine entry. Starting or stopping a hormone course offers the start-fresh marker.

Ask your record (step 6). A button on Record opens ten tappable questions. Each answer is a short text built by core/ask from her own data, with its date range shown. There is no typing, no free text and no AI, because in a health app a wrong answer is worse than none. The ten: What medicines did I take this week? When did my last period start, and what day is it now? What are my longest and shortest cycles? What did the app flag lately, and why? How heavy were my last three periods? How many days did I log this month? What is my confidence score made of? Which long-term flags do I have? What questions could I ask my doctor? When was my last backup? Answers never give advice, and a question with too little data says what is missing.

Spotting episode. Spotting starts a short episode: up to 4 questions, a verdict, a watch list, then a check the next morning and again at 72 hours asking whether it became a period. If it did, the period starts on the first day of real flow, with an option to count from the first spot instead. If not, the run closes as spotting. "Not sure" asks once more, then closes as unclear.

Spotting alone never starts a period. The start is the first day of real flow, and she can choose to count from the first spot instead.

Catch-up. With 2 or more unlogged days, the app shows "Welcome back. Fill in the last few days?" with one row per day, up to 7. Each row has the flow buttons and Skip, and "Not sure" is the default. It takes about 20 seconds and never mentions missed days.

Empty states. Day one shows the meter at 10%, the companion as a seed, and one action: "Log your first period to start." Cycle and Body show what unlocks and when. No screen ever shows made-up data.

======================================================================
Companion and gamification
======================================================================

The companion is a sprout that grows with check-ins and never shrinks, and nothing in the reward system can punish her for a missed day.

The sprout. A small plant in a round pot of soil, drawn as flat vector shapes in three greens, a soft shadow and one warm lamp-coloured accent. It has no face, so it can never look sad or disappointed. Its mood shows only in leaf posture and glow. She can name it in onboarding. Tapping it makes it sway and shows one gentle line that never mentions health, such as "Slow growth is still growth."

Growth. Rings are the only growth currency.

- +1 ring for the first check-in of a day, whatever she logs, including "None".
- +1 ring for a Body log that day.
- +1 ring for answering a watch list or follow-up questions.
- At most 2 rings a day. Rings never decrease.

| Stage | Rings | What the sprout looks like | Unlocks |
| --- | --- | --- | --- |
| 0 Seed | 0 | A seed under the soil with a faint glow | Dusk, Dawn and High contrast themes, always available |
| 1 Sprout | 3 | Two tiny leaves | Reactions to Body logs |
| 2 Seedling | 10 | A short stem with two pairs of leaves | Petal burst when a badge is earned |
| 3 Young plant | 25 | More leaves and a small tendril | Meadow theme |
| 4 Budding | 50 | A closed bud | Ocean theme |
| 5 Blooming | 90 | An open flower | Rose theme |
| 6 Moonflower | 150 | A flower that glows softly at dusk | Midnight theme and a night-garden backdrop |

At 2 rings a day, stage 6 takes 75 days. At 1 a day it takes about five months.

Mood. Derived from check-in dates and purely visual. Bright: she checked in today, leaves lifted with a soft glow. Calm: the default, a gentle sway on a 6-second loop. Sleepy: 3 or more days since a check-in, leaves resting low with a small "zzz", never brown or wilted. Welcome: one unfurl animation on the first check-in after being sleepy.

Reactions. A water log makes raindrops fall, a sleep log brings a moonbeam, a meal log a sunbeam, and anything else a small sparkle. Each lasts under 1 second and is skipped under reduced motion.

Badges. Each is earned once and never expires.

| Badge | Earned when |
| --- | --- |
| First light | First check-in |
| Three this week | 3 check-in days in one calendar week |
| First full cycle | First cycle length recorded |
| Record keeper | First doctor file created |
| Backed up | First backup saved |
| Body scan | 5 days with a Body log |
| Pattern found | First lifestyle pattern or lead-in pattern learned |
| Steady roots | 30 check-in days in total |

Insights unlock with data. The cycle map after 3 cycles, lifestyle patterns after 14 days of Body logs, and the lead-in pattern card after 4 qualifying cycles. These are insights and never gated features. The app says what is missing: "Log 4 more nights of sleep to see your sleep pattern."

Weekly review. Sunday evening, a 20-second card with the days she checked in this week, one pattern or "nothing new yet", and the confidence change. Opening it adds a ring within the daily cap.

Themes. Dusk, Dawn and High contrast are always available. Meadow, Ocean, Rose and Midnight are cosmetic unlocks. Accessibility options are never locked.

Guardrails
----------

- No counters that reset, no countdowns, no "streak lost", no loss states.
- No random rewards or loot boxes.
- At most 1 notification a day: the daily reminder, plus a ping only while a watch list is open. Quiet hours are respected. After 3 ignored reminders in a row, reminders drop to weekly.
- Notification text carries no health words: "Moonroot: a quick check-in?"
- No sharing, leaderboards or social features.
- Sound is off by default and haptics are light.

Widget (Android). A 2 by 2 home-screen widget shows the sprout at its current stage and mood with one Check in button that opens moonroot://checkin. It shows no dates, predictions or health words. In discreet mode it shows only a leaf icon. It refreshes when the app saves state and at most every 30 minutes.

======================================================================
Visual design system
======================================================================

Moonroot looks like a small garden at dusk: deep ink-blue surfaces, moonlight text, one root-green accent and one warm lamp colour, so the app feels calm and private instead of clinical or pink.

Colour tokens. Define them as CSS custom properties on :root, with Dawn overriding them under [data-theme="dawn"]. Every unlockable theme must pass the same contrast check in CI.

| Token | Dusk (default) | Dawn | Used for |
| --- | --- | --- | --- |
| --bg | #11151F | #F3F5F9 | Screen background |
| --surface | #1A2030 | #FFFFFF | Cards and sheets |
| --surface-2 | #232B40 | #E8ECF4 | Inputs and raised chips |
| --text | #EAEFF8 | #172036 | Main text |
| --text-muted | #A3ADC4 | #55607B | Secondary text |
| --accent | #7ACBA5 | #257A59 | Primary buttons, sprout leaves |
| --lamp | #F2B96B | #B9701C | Highlights, flower, focus ring |
| --flow | #E5707F | #C2475A | Flow and period marks |
| --spotting | #F2A3A8 | #D9747C | Spotting marks |
| --sleep | #8F96F2 | #5A61CF | Sleep |
| --water | #5DB3DA | #1E7FAE | Water |
| --gut | #C49A6C | #8C6239 | Digestion |
| --level-green | #52C792 | #1F8F5F | Verdict green |
| --level-yellow | #F4C95D | #B88700 | Verdict yellow |
| --level-orange | #F5914F | #C25E0F | Verdict orange |
| --level-red | #EF5B5B | #C93232 | Verdict red |

I checked these pairs with a WCAG contrast calculation. In both themes, main and muted text reach at least 4.5 to 1 on every surface, dark button labels on the Dusk accent reach 9.3 to 1, and white labels on the Dawn accent reach 5.2 to 1. Every mark colour reaches at least 3 to 1 on its surface. Default is Dusk. Settings offers Dusk, Dawn and Match phone. Meadow, Ocean, Rose and Midnight shift the background and accent hue, and Midnight uses a true black background for AMOLED screens.

Type. Fraunces (soft, rounded serif) for the greeting, stage names and the big confidence number. Atkinson Hyperlegible for everything else, because it was designed for legibility. Bundle both through @fontsource as Latin woff2 subsets: Fraunces 600, Atkinson 400 and 700. Scale in sp: 12, 14, 16 (body, never smaller), 20, 28, 44. Use tabular figures for dates and counts. The Urdu phase adds a Nastaliq font such as Noto Nastaliq Urdu, subset to the strings used.

Shape and layout
----------------

- 8 dp grid, 16 dp side gutters, one column, centred and capped at 480 dp on wide screens.
- Primary actions sit in the lower 60% of the screen for one-handed use.
- Cards: 16 dp radius, a 1 dp border at low contrast in Dusk, a soft shadow in Dawn. Buttons: pill shape, 52 dp tall. Sheets: 24 dp top radius with a drag handle.
- Flow buttons are five droplet glyphs: an empty ring for None, one tiny drop for Spotting, then one, two and three drops for Light, Medium and Heavy. Each has a label, a 64 dp touch width, and a selected state that adds a fill, a thicker outline and a check mark.
- Pain is an arc dial from 0 to 10 with fixed stops at none, mild, strong and severe.
- Bottom bar: four tabs and a round lamp-coloured log button in the middle.

Motion. Interface transitions run 120, 200 or 320 ms with an ease-out curve. The sprout sways on a 6-second loop, reactions last under 900 ms, and a stage-up plays once for 1.2 seconds. Under reduced motion, from the phone setting or the app setting, nothing sways, reactions become a static glow, and a stage-up is a 200 ms crossfade. Haptics: a light tick on flow buttons and a medium tick on a stage-up, both optional.

Sprout art. One component, ui/companion/Sprout.tsx, draws the plant from SVG groups: pot, soil, stem, up to 8 leaves, tendril, bud, flower, glow and particles. A stage shows or hides groups, and a mood changes leaf rotation and glow. A build script exports the 7 stages as Android vector drawables for the widget from the same geometry.

Data visuals. All are hand-drawn SVG using the tokens, with a text summary for screen readers and labels of at least 12 sp. They appear only on the Graphs screen, except the confidence number, which is text. The Graphs screen also draws medicine by week, one bar series per generic name.

- Confidence: on the Cycle tab the score is text, in Fraunces 44, with the caption "likely window 18 days wide" and the measured count. The 240-degree arc from 10 to 95 is drawn only on the Graphs screen.
- Forecast ribbon: a 30-day strip with a darker accent band for the likely window, a lighter band for the possible window, a lamp marker for today, and past days as flow-coloured dots sized by amount.
- Cycle bars: one bar per cycle, a median line and a shaded band for her age range.
- Timeline: dated rows with a flow dot, pain, symptom icons and note preview.

States. Saved: a toast "Saved" with Undo for 5 seconds. Save failed: a banner "Couldn't save. Your entry is still here. Try again, or export a backup." Backup overdue: a soft card with one button. Locked: the PIN screen shows only the sprout.

Accessibility
-------------

- Touch targets of at least 48 dp with 8 dp between them.
- Screen-reader labels that carry the full meaning, such as "Heavy flow, 3 of 3 drops, selected".
- Text scales to 200% without clipping. Layouts reflow.
- Colour never carries meaning alone: verdicts have an icon and a word, flow buttons have a drop count and a label.
- Focus ring: a 2 dp --lamp outline.
- Nothing flashes more than 3 times a second.
- Sentences of 18 words or fewer, at about a grade 6 reading level.

Voice
-----

| Situation | Say | Never say |
| --- | --- | --- |
| Back after days away | "Welcome back. Want a 20-second catch-up?" | "You missed 4 days." |
| Spotting logged | "Spotting noted. Here is what to keep an eye on." | "Abnormal bleeding detected." |
| Forecast | "Your next period is likely between 14 and 26 Nov." | "Your period is late." |
| Orange verdict | "A doctor can help with this. A visit in the next week or two is a good idea." | "This is serious." |
| Save failed | "Couldn't save. Your entry is still here. Try again." | "Error 500." |

Icon and name. A crescent moon cradling a sprout on deep indigo, with no red and no droplet, so it looks like a plain garden or notes app on a shared phone. In discreet mode an optional alternate launcher name and icon (an Android activity alias, build step 7) can replace it.

======================================================================
Export and doctor file
======================================================================

One button, Create doctor file, builds a clinician-readable summary from the same data as Markdown or plain text, and the Backup button saves everything as JSON.

Options sheet. It opens before anything is built and ends in a preview, so she sees exactly what will be shared.

- Range: last 3 months, 6 months, 12 months or all.
- Include: Body log (on), notes (on), medicine log and medicine and conditions notes (on), verdict history (on), intimacy entries (off, and hidden for under 18).
- Format: Markdown or text.
- An optional line, "What worries you most?", is quoted in her own words at the top.

Files
-----

| File | Format | For | Contents |
| --- | --- | --- | --- |
| Doctor summary | .md or .txt | A doctor, or an AI assistant she trusts | The 12 parts below plus a machine-readable block |
| Backup | .json | Restoring the app | Everything, with schema version and checksum, optionally locked with a passphrase |
| Day table | .csv | Spreadsheets | One row per logged day |
| Cycle table | .csv | Spreadsheets | One row per cycle |

File names follow moonroot-doctor-2026-10-30.md and moonroot-backup-2026-10-30.json.

Doctor summary, in order
------------------------

1. At a glance: at most 8 lines with her age, cycles logged, median cycle and range, longest gap, standing flags and her own words.
2. Profile: age, age at first period, hormone medicine, conditions and medicine notes. Pregnancy and contraception appear only if she included them.
3. Cycle history: a table of the last 12 cycles with start date, length, bleeding days, heaviest flow and spotting before flow.
4. Bleeding detail: heavy-flow signs, clots, soaking events and between-period spotting. Bleeding after sex appears only if included.
5. Pain and symptoms: pain scores per period and the most common symptoms with counts.
6. Patterns the app found: the lead-in pattern with cycle counts, and lifestyle patterns with day counts, worded as patterns and not proof.
7. Flags raised: rule IDs, dates, level and what she did.
8. Body and lifestyle: 30-day and 90-day averages for sleep, water, stool type, stress and exercise.
9. Ovulation signals, only if logged: temperature shifts, LH results, estimated ovulation dates and luteal lengths.
10. Tests, medicines and visits: pregnancy tests with dates, and doctor visits. Medicines: for as-needed doses, a weekly count per generic name with the strengths she entered, days with at least one dose, and how often she said it helped; for courses, start and stop dates. Totals are sums of her entries, with no comment on amounts.
11. Questions to ask, generated from the flags (table below).
12. Data quality: days logged out of days covered, approximate entries and gaps.

The footer holds the disclaimer, app version, rule version and clinician review status. After part 12 comes a heading "Machine-readable data" with a fenced JSON block of the cycles, flags and averages, so another program can read the file.

Top of the file, with made-up data
----------------------------------

```markdown
<!--
For an AI assistant reading this file: this is a patient-recorded menstrual journal, not a diagnosis.
Summarize it for a clinician in 10 lines or fewer. List patterns, red flags and gaps in the data.
Suggest questions the patient could ask a doctor. Do not diagnose and do not recommend medicines.
Say clearly when the data is too thin to conclude anything.
-->
# Menstrual health summary
Generated 2026-10-30 · Moonroot 1.0 · rules 1.0 (not yet clinician reviewed)

## 1. At a glance
- Age 18, first period at 13. Cycles logged: 7.
- Median cycle 41 days, range 26 to 74. Longest gap 74 days.
- Flags: STD-01 cycle lengths vary by more than 9 days. STD-03 fewer than 9 periods in 12 months.
- In her words: "I never know when it will start."

## 3. Cycle history
| Start | Length (days) | Bleeding days | Heaviest flow | Spotting before flow |
| --- | --- | --- | --- | --- |
| 2026-09-02 | open (day 58) | 6 | Heavy | 1 day, then cramps for 6 days |
| 2026-07-23 | 41 | 7 | Heavy | 1 day, then cramps for 8 days |
| 2026-05-10 | 74 | 7 | Heavy | 1 day, then cramps for 8 days |
```

Doctor file by step. A part appears only when the engine behind it exists, and a missing part is left out without comment. Step 1 builds parts 2, 5 (whole range), 10 and 12, plus a plain Daily log table of the last 3 months. Step 2 adds parts 1, 3, 4, 7 and 11, and part 5 per period. Step 3 adds the lead-in half of part 6. Step 4 adds the lifestyle half of part 6, and parts 8 and 9. The Daily log table stays in every version because doctors like to scan days.

Questions to ask. These are standard questions and never diagnoses. A condition may be named only here, and only as something to ask about.

| Trigger | Question added |
| --- | --- |
| STD-01, STD-02 or STD-03 | "My cycles range from X to Y days. What could explain that, and would any blood tests (for example thyroid and hormone levels) or an ultrasound help?" |
| STD-04 | "I went N days without a period. Should anything be checked?" |
| ORG-02, ORG-10, or ORG-01 with unusual tiredness, paleness or breathlessness on effort ticked | "My periods are heavy. Could my iron be low, and should I have a blood count?" |
| ORG-09 | "My pain reached N out of 10 in M periods. What could cause this, and what can help?" |
| STD-06 | "I have bleeding between periods or after sex. Do I need an examination?" |
| Acne or hair changes logged with STD-01 | "I also notice acne or hair changes. Should my hormone levels be checked?" |
| ORG-12 | "I saw blood in my stool on N days. Should this be checked separately?" |
| Any as-needed pain medicine in the range | "I take [medicine names] for pain on N days. Is this the right medicine and amount for me, and is there anything better?" |
| A hormone course started or stopped | "I started or stopped [medicine] on [date]. How should that change my cycles?" |

Text version. Same parts, with plain headings and aligned columns, and the AI note as the first paragraph instead of a comment.

Day table columns. date, flow, products, clots, pain, symptoms, mood, sleep_hours, water_ml, stool_type, bbt_c, lh, mucus, medicines, note. Symptoms are separated by semicolons, and so are medicines, written as generic name and units, such as "mefenamic acid x2". Notes are quoted. The intimacy fields never appear in the CSV.

Sharing. On Android, the share sheet (Capacitor Share) or a save to Documents/Moonroot (Capacitor Filesystem). In the web app, a normal download. The app never uploads anything.

Backup reminders. A soft card after 14 days with changes and no backup. In the Android build, a weekly automatic backup file in Documents/Moonroot, keeping the last 4. A new phone needs only the backup file and the Restore button.

======================================================================
Build plan and APK pipeline
======================================================================

Build Moonroot in seven steps, each ending in something she can use and a gate that must pass before the next step starts. The web app is installable from step 1, and the APK comes last.

Release 1 is steps 1 to 3. Stop there, let her use it for about a month, then decide on steps 4 to 7 from what she actually logs. Step 1 begins with a design freeze and no app code: the Data model types, the three catalogues, the rule table as data with example inputs, and docs/case-cards.md, all shown to the owner before any screen is built. Until step 2 is done, the About screen and Today say that this version records only and does not check for warning signs yet.


Gate for each step

| Step | Gate that must pass before the next step starts |
| --- | --- |
| 1 Record | Her data survives a restart, a backup restores exactly (also with a passphrase, and a wrong passphrase is refused), the medicine log works, the Get help sheet is one tap away, and the doctor file opens on a phone. |
| 2 Check-in intelligence | Every rule has boundary tests, the exhaustive law tests pass, every rule input has a field and a question, and the case cards and rule table are ready to show a doctor. |
| 3 Prediction | The simulation passes its acceptance criteria, the meter starts at exactly 10, and the CSV tables match their golden files. Release 1 ends here. |
| 4 Body and ovulation | Lifestyle patterns find nothing in random data and use only days without bleeding. Ovulation estimates appear only from logged signs. |
| 5 Companion | A normal check-in takes 4 taps or fewer, and nothing in the sprout can reset or shame. |
| 6 Visual polish and Ask | No serious accessibility findings in Dusk, Dawn and High contrast, the app works at 200% text, and every Ask answer matches her data. |
| 7 Android | The APK installs over the last build with her data intact, the built manifest has automatic cloud backup off, and the widget shows no health text. |

Each gate is something the agent can show you passing before you say go for the next step.

What each step delivers
-----------------------

| Step | Deliverables |
| --- | --- |
| 1 Record | Design freeze first (types, catalogues, rule table as data, case cards), then project setup, onboarding, Today check-in with the danger-sign screen, medicine log, Record timeline, day editor, Get help sheet, doctor file (Markdown and text, the parts that exist in step 1), backup and restore with the optional passphrase, optional PIN lock, PWA manifest and service worker, GitHub Pages deploy |
| 2 Check-in intelligence | Episode classifier, cycle derivation, question flows, rule engine with the full rule table, event cards, watch lists, standing flags, catch-up, case cards, exhaustive law tests, clinical review file |
| 3 Prediction | Weighted and conditional forecasts, lead-in learning, confidence number with its measured count, frozen forecasts, the start-fresh marker, Cycle tab text, CSV tables |
| 4 Body and ovulation | Body tab with sleep, water, meals, digestion, stress and exercise as plain numbers, lifestyle patterns (days without bleeding only), temperature, LH and mucus entries, ovulation estimates, the Ways to find out screen |
| 5 Companion | Sprout art and moods, rings, badges, weekly review, unlockable themes, reactions |
| 6 Visual polish and Ask | Final tokens and themes, motion, haptics, sounds, empty states, the Graphs screen, the Ask screen, accessibility pass |
| 7 Android | Capacitor shell, reminders, widget and WidgetBridge, hidden app preview, automatic cloud backup switched off with a CI check on the built manifest, signing, APK pipeline, optional alternate launcher icon |

Repository. One repo named moonroot. main is always deployable. Each step gets a branch such as step-1-record, merged when its gate passes. Every push runs lint, type check, unit tests, the simulation and the build. GitHub Pages deploys from main with Vite base set to the repo path.

Android toolchain. Capacitor 8 targets Android SDK 36 according to Capacitor's docs. A third-party Capacitor build guide lists JDK 21, Node 22 or newer, Android Gradle Plugin 8.13.0, minSdk 24 and compileSdk 36. Before the first build, the agent confirms these against Capacitor's current environment-setup page. minSdk 24 means Android 7.0 and newer.

APK workflow. Save as .github/workflows/android.yml. The action versions are examples, so pin each to its current major version. It reads versionCode from a Gradle property, so android/app/build.gradle must use project.findProperty('versionCode') ?: 1.

```yaml
name: Android APK
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['android/**', 'src/**', 'core/**', 'package.json', '.github/workflows/android.yml']
permissions:
  contents: write
jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npx cap sync android
      - run: ./gradlew assembleDebug -PversionCode=${{ github.run_number }}
        working-directory: android
      - uses: actions/upload-artifact@v4
        with:
          name: moonroot-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
      - name: Publish a release so the phone can download it
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cp android/app/build/outputs/apk/debug/app-debug.apk moonroot.apk
          gh release create "build-${{ github.run_number }}" moonroot.apk --title "Moonroot build ${{ github.run_number }}" --notes "Debug build" --latest
```

Stable signing. Android refuses to install an update signed with a different key, and uninstalling erases the app's data. Commit one fixed android/app/moonroot-debug.keystore and point signingConfigs.debug at it, so every build carries the same signature. That key is not secret, which is fine for a private app. Before sharing the APK beyond a small circle, create a real release keystore, store it in GitHub Secrets and keep an offline copy.

First install from the phone
----------------------------

1. Open the repository's Releases page in the phone browser and download moonroot.apk from the newest build.
2. When asked, allow the browser to install unknown apps.
3. Tap the file and install. If Play Protect warns about an unknown developer, choose Install anyway.
4. Open Moonroot. If she was using the web version, restore her backup file.
5. Later builds install over the old one and keep her data.

Widget files
------------

- WidgetBridgePlugin.kt, registered in MainActivity, saves stage, mood and accent to the SharedPreferences file moonroot_widget.
- MoonrootWidgetProvider.kt reads them, sets the sprout image and attaches a PendingIntent for moonroot://checkin. The app handles the link with Capacitor's App plugin (appUrlOpen).
- res/xml/moonroot_widget_info.xml sets a 2 by 2 size (about 110 dp), no resizing and updatePeriodMillis of 1800000.
- res/drawable/sprout_stage_0.xml to sprout_stage_6.xml come from npm run widget:art.

Reminders. Use the Local Notifications plugin. Android 13 and newer asks for notification permission when she switches the reminder on. Use inexact scheduling, a channel named Reminders, and secret visibility so nothing shows on the lock screen.

Release checklist before the app leaves a personal circle
---------------------------------------------------------

- A clinician has signed off the rule table and the app's About screen shows the review date.
- Contrast check, offline test, restore test and install-over-update test all pass.
- The INTERNET permission test from the architecture section is done.
- No debug logging remains.
- The built Android manifest has automatic cloud backup off.
- docs/source-check.md has no line marked anything but verified, and the case cards and every (new) or (changed) row have been reviewed.
- The medicine catalogue has been checked by a pharmacist, and the Get help sheet numbers, including any mental-health line, have been checked for her region.
- A plain-language privacy page exists if the app is distributed.

======================================================================
Testing and validation
======================================================================

A wrong rule here can reassure someone who needs a doctor or alarm someone who does not, so testing is part of the product. Every layer below runs on every push except the clinical review, which a person does before the app is shared.

Test layers
-----------

| Layer | Tool | What it proves |
| --- | --- | --- |
| Unit | Vitest | Every pure function in core behaves: episode classification, cycle derivation, weighted quantiles, forecasts, confidence, lead-in learning, ovulation rules, companion stages |
| Boundary | Vitest, table-driven | For every triage rule, the value one below, at and one above each threshold, plus the "unsure" answer, gives the expected level and rule ID |
| Exhaustive | Vitest, generated | Every combination of the answers she can give on one day gives a level that obeys the laws below |
| Case cards | Vitest | Each patient card in docs/case-cards.md gives the stated verdict and rule IDs |
| Input coverage | Vitest | Every input a rule reads has a DayLog field and a question or screen that sets it |
| Golden files | Vitest snapshots | The doctor summary (Markdown and text), the CSV files and the backup JSON for three fixture patients match stored files byte for byte, the backup checksum verifies, and older backup versions still import |
| Simulation | npm run sim | Forecasts and the confidence meter behave on synthetic users, inside the acceptance ranges below |
| Interface | Playwright and axe | The flows below work on a phone-sized screen, offline, with no accessibility violations |
| Copy lint | npm run lint:copy | No forbidden wording reaches the screen or a notification |
| Clinical review | A clinician | Every threshold, question and piece of advice in the rule table is right for the people who will use it |

Laws. The exhaustive test walks every combination of today's answers, with history features at their boundary values, and fails on any of these: (1) adding a warning sign never lowers today's level; (2) changing a "no" to "not sure" never lowers it; (3) no danger answer of yes ever shows Green; (4) a missing required answer never shows a level. A failing law is a bug in the rule table, never a reason to change the law.

Case cards. docs/case-cards.md holds about 25 made-up patients written in plain words. Each has her answers, the level and rule IDs the app gives, and a line for a reviewer to mark Agree or Change. They are the packet a clinician reviews, and the same cards run as tests, so the code cannot drift from what was reviewed. Every red and orange rule has at least one card, and at least five cards sit just below a line.

Event, medicine and backup tests. An event rule fires once per trigger key, never again for the same key, and closes when a doctor visit is logged. Medicine totals equal the sum of the entries, entries with different shown names and one generic name are flagged as the same medicine, and no function compares an amount with a limit. A backup locked with a passphrase restores exactly. A wrong passphrase and a changed file are both refused, and nothing is imported in either case.

Unit and boundary tests
-----------------------

- Write the tests for core before the code they test. triage/, predict/ and cycles/ stay at 100% line coverage.
- Boundary tests come from the rule table itself. Each row in rules.ts carries its own example inputs, and npm run rules:export writes docs/clinical-review.md from the same data, so the code, the tests and the review document cannot drift apart.
- Cover the awkward cases: no logs at all, one log, gaps in the logs, an unlogged day inside a bleeding run, two periods within 10 days, a 150-day cycle, a clock change at midnight, a date in the future, and a restored backup whose dates overlap existing logs.
- core never reads the system clock. Today's date is always passed in, so tests can set it.

Synthetic users. The simulation uses three groups of at least 400 simulated people, 16 cycles each, drawn with a fixed random seed so results repeat. For every cycle it forecasts from the earlier cycles only (no hindsight) and scores the forecast against the real next length.

| Group | How cycle lengths are drawn | Starting estimate used |
| --- | --- | --- |
| Regular | Around 29 days, spread 2.2, never below 21 | Adult |
| Moderately irregular | Around 36 days, spread 7, between 21 and 60 | Adult |
| Very irregular | 55% around 42 days (spread 10, never below 24), 25% between 25 and 36, 20% between 60 and 95 | Fewer than 3 years since first period |

Confidence by cycles logged. The meter starts at exactly 10 for everyone and climbs as cycles are logged and forecasts prove right. A regular pattern levels off near 88, a moderately irregular one near 76 and a very irregular one near 56. The ceiling is not a flaw: a very irregular cycle is hard to predict, and the meter says so honestly.

The table below gives the checkpoints the real code must reproduce.

| Group | 0 cycles | 3 cycles | 5 cycles | 8 cycles | 12 cycles |
| --- | --- | --- | --- | --- | --- |
| Regular | 10 | 28 | 56 | 88 | 87 |
| Moderately irregular | 10 | 27 | 50 | 76 | 76 |
| Very irregular | 10 | 24 | 38 | 56 | 56 |

Window accuracy and width. Forecasts made after 4 or more cycles, scored on whether the next cycle length fell inside the window.

| Group | Possible window held it | Likely window held it | Possible window width at 8 cycles | Likely window width at 8 cycles |
| --- | --- | --- | --- | --- |
| Regular | 68 to 78% | 44 to 55% | 5 days | 3 days |
| Moderately irregular | 67 to 76% | 39 to 49% | 17 days | 9 days |
| Very irregular | 64 to 76% | 40 to 49% | 43 days | 23 days |

The possible window is built to hold the next cycle 8 times in 10 and measures 64 to 78%. The likely window is built for 1 in 2 and measures 39 to 55%. Short histories understate how much cycles vary. Two things follow. The confidence meter's track-record term uses the measured hit rate, so the meter stays honest. And for a very irregular user the possible window is about six weeks wide, which is why the record and the check-in come first and the forecast second. If the real code measures worse than these ranges, fix the code. Widening the windows is a product decision: ask first.

Lead-in pattern. One run: very irregular cycles in which a spotting or cramp signal appears 5 to 9 days before flow in 4 of 5 cycles. The pattern is learned from 8 earlier cycles and tested on the 9th cycle, at the moment its signal appears.

| Measure | Without the pattern | With the pattern |
| --- | --- | --- |
| Median error in days left until flow | 8 days | 1 day |
| Mean error in days left until flow | 10.9 days | 1.4 days |
| Likely window held the real start | 52% | 64% |

The pattern was learned in 99% of the 1,608 runs where it applied. In the opposite test, signals at random days 1 to 14 before flow, the rule wrongly learned a pattern in at most 9% of histories. These are synthetic people, so the table shows that the mechanism works, not that she has such a pattern. The app never promises one.

Acceptance criteria. npm run sim fails the build if any of these is false. The simulation uses the real core functions, not a copy.

1. Confidence is exactly 10 with no cycles, and never above 95.
2. Mean confidence never decreases from 0 to 8 cycles and never rises more than 20 points in one cycle.
3. At 8 cycles the regular group is at least 80 and the very irregular group at most 60. From 3 cycles on, regular is above moderate and moderate is above very irregular.
4. The possible window holds the next cycle between 60% and 90% of the time in every group, for forecasts made after 4 or more cycles.
5. The likely window holds it between 35% and 65% of the time in the same cases.
6. With a real lead-in pattern, the median error falls by at least half against the baseline. With random signals, a false pattern is learned in at most 10% of histories at every length from 4 to 12 cycles.

The numbers in this section come from a reference simulation written in Python with a different random generator, so expect small differences. If the real code lands outside a criterion, treat it as a bug until proven otherwise and do not loosen the criterion without asking.

Interface tests (Playwright, phone-sized screen)
------------------------------------------------

- Onboarding takes 6 screens or fewer and every optional question can be skipped.
- A normal day's check-in takes 4 taps or fewer and under 10 seconds.
- Offline: load once, go offline, reload, log a day, close and reopen. Nothing is lost.
- Backup round trip: export, wipe storage, restore. Every day, cycle and forecast matches.
- PIN lock: a wrong PIN stays locked, the right PIN opens, and the lock screen shows no health words.
- Reduced motion: with the setting on, nothing animates except fades under 100 ms.
- Large text: at 200% font size and 360 px width no button is clipped and nothing scrolls sideways.
- Under-18 profile: no screen, question, export or badge mentions sexual acts, partners or intimacy, and the only pregnancy question is the neutral one.
- Accessibility: axe finds no serious or critical violation on any screen in Dusk, Dawn and High contrast.
- Screenshots: every screen at 360 by 800 and 412 by 915 in each theme, saved as test files so a person can look through them.
- Install: the service worker caches the app shell and it opens from the home-screen icon with no network.
- Medicine: add a dose, repeat it with Same as last time, and see the totals and the same-medicine line, with no colour or warning attached.
- Graphs: no chart renders on Today, Cycle or Body until she taps Graphs.
- Ask: every question answers from fixture data, and no text field exists on the screen.
- Danger-sign screen: leaving it unanswered shows no Green, and ticking Fainted shows red whatever else is logged.

Copy lint. A script reads every string in locales/ and ui/ and fails on words the app must never say about her: abnormal, late or missed (about a period), failed, overdue, and diagnos. Names of diseases and conditions, such as PCOS, endometriosis, thyroid, anaemia or fibroids, may appear only in the doctor file and in question wording, never in a verdict or a reason. Notification text fails the lint if it contains any health word (period, flow, pain, cramp, spotting, pregnant, doctor, symptom and similar).

Copy lint also fails on "normal", "common" or "fine" used as a level label, on "safe dose", "maximum dose", "overdose", "you should take" and "you can take", and on any number followed by mg in locales/ or ui/ unless it is the {total} or {strength} placeholder.

Clinical review. npm run rules:export writes docs/clinical-review.md: every rule with its ID, level, plain-language condition, threshold, source key and the exact words shown, plus every question and every follow-up time. A doctor, or a senior medical student working under a doctor, marks each row Agree, Change or Remove. Start with rows marked Std, which come from standard practice and not from a single published threshold. The About screen says "Not yet reviewed by a clinician" until a real review is recorded, and then shows the reviewer's role and the date. Until then the app calls itself a journal that helps her decide when to talk to a doctor, not medical advice. Complete the first review before the app goes to anyone beyond the small circle it is built for.

Performance targets
-------------------

- Cold start to the Today screen in under 2.5 seconds on a 3 GB Android phone (tested with the processor slowed 4 times).
- Saving a day under 100 ms. Recomputing cycles, forecast and verdict under 50 ms with five years of logs, about 1,800 days.
- JavaScript at most 250 KB gzipped, fonts at most 250 KB, installed app at most 15 MB.
- No layout shift on the Today screen after the first paint.

======================================================================
Safety, risks and open decisions
======================================================================

What the app is not. Moonroot is a journal and a set of prompts to talk to a doctor. It does not diagnose or treat anything, it is not a way to avoid or plan a pregnancy, and it is not for emergencies. The About screen, onboarding and the doctor file all say this in plain words.

Risks and what the design does about them
-----------------------------------------

| Risk | What the design does |
| --- | --- |
| Thresholds go out of date | Every rule has an ID, a source key and a ruleset version, and each verdict stores the version it used. A clinician reviews the exported rule table, and the About screen shows the review date. |
| False reassurance | Green is labelled "Nothing flagged", needs every required answer, and is replaced by "Nothing new today" while an event card is open. "Unsure" counts as yes. RED-09 catches danger signs on any day, and the law tests prove that adding a warning sign never lowers a level. |
| Alarm fatigue from a cycle that is always irregular | History rules fire once as event cards, never daily. Long-running patterns become standing flags on the Record and doctor file, with at most a soft Today card every 30 days. A logged doctor visit closes open cards, and a new danger sign always shows. |
| Lost phone, cleared browser or uninstall erases everything | The web app asks the browser for persistent storage. There are backup nudges, a checksum on every backup, a restore test in CI, and on Android a weekly automatic backup to Documents/Moonroot. |
| Someone else uses her phone | Optional PIN lock, hidden app preview, discreet mode, and no health words in notifications or on the widget. The PIN is a screen lock and not encryption, and the app says so. Nothing is stored in any online account. |
| Plain-text exports | The doctor summary and CSV files can be read by anyone who has the file, and the share screen says so before anything is sent. Backups can be locked with a passphrase. Android automatic cloud backup is off. |
| A minor uses it | Under-18 profiles never see sexual acts, partners, frequency or the intimacy log. The only pregnancy question is the neutral one. Orange and red add "tell a parent, relative or school nurse". An unknown age is treated as under 18. |
| Used as contraception or to plan a pregnancy | Ovulation estimates come only from signs she logged, always say "estimate", and the ovulation card, onboarding and About state that this is not a way to avoid pregnancy. |
| Over-trust in predictions | Windows are ranges, never one date. The words are "likely" and "possible". The confidence meter is measured, starts at 10, and says plainly when her cycles vary too much to predict. |
| The Body tab feeds disordered eating | No calories, no weight and no food targets. Meals are logged as a pattern, and fasting is a neutral tag. Water has no shaming goal. The weekly review never praises eating less. |
| Gamification turns into pressure | Rings never decrease and no streak resets. At most one notification a day, quiet at night by default, and no guilt wording. The sprout gets sleepy and welcomes her back. It never wilts. |
| The app is used in an emergency | The Get help sheet is one tap from every screen, lists emergency numbers for her region, and says the app is not for emergencies. |
| An AI agent quietly adds tracking, a network call or a looser rule | The page policy allows only its own origin. Release builds drop the INTERNET permission if the app still works without it. Lint bans fetch, XMLHttpRequest, WebSocket and navigator.sendBeacon outside the service worker file. New dependencies need approval. Thresholds exist only in core/triage. |
| The signing key changes | One committed keystore signs every debug build, so updates install over old builds and keep her data. The release key lives in GitHub Secrets and in an offline copy. |
| The medicine log is read as dosing advice | The app records and adds up what she entered, adds "Check the pack for the daily limit", and never advises or compares an amount with a limit. Copy lint blocks advice wording and hard-coded mg amounts. |
| Logging medicine nudges more medicine | No colour, reward or streak is attached to medicine entries. The weekly count goes to the doctor file with a question, not a warning. |
| Hormone medicine makes old cycles misleading | The start-fresh marker drops older cycles from forecasts and history rules, and ORG-03 still fires after 90 days with no period. |
| The catch-all red fires too often | RED-09 uses four signs only, and a clinician can narrow it. A skipped danger-sign screen is not a yes, but it blocks Green. |
| A forgotten backup passphrase | The app says before she confirms that it cannot be recovered, and an unlocked backup stays possible. |
| Distress or danger the rules cannot see | The app reads no notes or mood. The Get help sheet carries fixed lines for feeling unsafe and for someone hurting her, one tap from every screen. |
| Lifestyle patterns that are really the period | Only days without flow are used, for both cause and outcome, and the wording says pattern, never cause. |

Open decisions and the defaults this document assumes
-----------------------------------------------------

| Decision | Default | Revisit when |
| --- | --- | --- |
| App name | Moonroot is a working name. The app id app.moonroot.journal cannot change after the first public release. | Before the APK is shared beyond a small circle |
| Language | English first. Every string lives in locales/en.json, and the layout is ready for right-to-left Urdu in ur.json. Urdu medical wording needs someone who knows both languages and medicine. | She would rather use Urdu |
| Sexual-health questions | Asked only when relevant to a symptom, never to under-18 profiles, and can be switched off in Profile. | She wants them always off or always on |
| Age | With no birth year, she is treated as under 18 for age-gated questions. | She enters her birth year |
| Companion | A faceless sprout in a pot. Naming it is optional. | Decided |
| Clinical reviewer | Not chosen yet. A gynaecologist or family doctor she trusts, or a senior medical student working under one. | Before the app goes beyond the small circle |
| Emergency numbers | Pakistan defaults 1122 and 115 in regions.json. Services differ by city. | Before release, for her city |
| ACOG figures | Some figures came from secondary summaries of ACOG Committee Opinion 651. The reviewer checks them against the opinion itself. | At the first clinical review |
| Backup passphrase | Offered at her first backup, in version 1. A forgotten passphrase cannot be recovered. | After her first restore test |
| Prolonged bleeding | ORG-01 stays orange from day 8. A clinician supplies a day count above which it becomes red. | At the first clinical review |
| Pain of 8 or more with no pain medicine tried | No rule fires until a clinician sets the level. | At the first clinical review |
| Unknown first-period age | The 38-day upper cycle limit applies, so a long cycle is flagged rather than hidden. | At the first clinical review |
| Hormone medicine behaviour | The start-fresh marker, the ORG-03 note and RED-11 as written here. | At the first clinical review |
| Rows of 8 November 2026 | RED-09 to RED-11, ORG-14, ORG-15, YEL-02 (changed), YEL-08, YEL-09 and GRN-01 (changed) use numbers already in this spec and are Std. | At the first clinical review |
| Medicine catalogue | Names only, no strengths. A pharmacist checks and extends it. | Before release |
| Mental-health line | Empty per region until someone has checked a number. | Before release, for her region |
| Terminal or chatbot | Not included. The Ask screen has fixed questions. A typed quick-log line with a confirm step can be considered later. | If she asks for it |
| Encrypting data on the phone with the PIN | Not included. The PIN is a screen lock. | If she wants it, with a recovery plan |
| Release 1 scope | Steps 1 to 3 only. | After about a month of her real use |
| Distribution | A private APK and a web link for a small circle. A store release needs its own privacy policy and review. | If she wants to share it widely |

======================================================================
Sources
======================================================================

Pages opened on 30 October 2026. The keys in the first column are the source keys used in the triage tables. Most of these pages are summaries by publishers and clinics, not the guidelines themselves, so the clinical reviewer should check the numbers against the primary documents listed after the table. The formulas, rules and screens in this document are design work and are not taken from any source.

| Key | What it supports | Page |
| --- | --- | --- |
| ACOG | Cycle and bleeding limits for girls and teenagers, and the idea of treating the cycle as a vital sign | Contemporary OB/GYN, abnormal uterine bleeding in adolescents (https://www.contemporaryobgyn.net/view/understanding-abnormal-uterine-bleeding-in-adolescents) |
| ACOG, 21 to 45 days | The cycle-length range used for teenagers | MDedge, ACOG on menses as a vital sign (https://www.mdedge.com/content/acog-think-menses-vital-sign-adolescents) |
| FIGO | Normal ranges for how often, how regular, how long and how heavy periods are | MSD Manual, normal menstrual parameters (https://www.msdmanuals.com/professional/multimedia/table/normal-menstrual-parameters) |
| NHS Wales | What counts as heavy bleeding, including soaking through protection and clots | NHS 111 Wales, heavy periods (https://111.wales.nhs.uk/heavyperiods,menorrhagia/) |
| Merck | When no periods needs a doctor, and common reasons | MSD Manual, absence of menstrual periods (https://www.msdmanuals.com/home/women-s-health-issues/menstrual-disorders-and-abnormal-uterine-bleeding/absence-of-menstrual-periods) |
| Healthline | Signs of excessive bleeding and when to get help | Healthline, excessive uterine bleeding (https://www.healthline.com/health/excessive-uterine-bleeding) |
| NHS ectopic | Warning signs of an ectopic pregnancy, such as one-sided pain, shoulder-tip pain and bleeding | NHS, ectopic pregnancy (https://www.nhs.uk/conditions/ectopic-pregnancy/) |
| NI Direct TSS | Toxic shock syndrome signs and tampon safety | NI Direct, toxic shock syndrome (https://www.nidirect.gov.uk/conditions/toxic-shock-syndrome) |
| Std | Standard practice with no single published number. A clinician confirms it. | Clinical review |
| Emergency numbers | The Pakistan defaults 1122 and 115 on the Get help sheet | Wikipedia, emergency medical services in Pakistan (https://en.wikipedia.org/wiki/Emergency_medical_services_in_Pakistan) |
| Capacitor | Android target level for the shell app | Capacitor, setting the target SDK (https://capacitorjs.com/docs/android/setting-target-sdk) |
| Toolchain | JDK, Node, Gradle plugin and SDK versions for the build, from a third party | Capgo, Capacitor Android build errors (https://capgo.app/blog/troubleshooting-capacitor-android-build-errors/) |

Primary documents the reviewer should check. None of these were opened for this document.

- ACOG Committee Opinion No. 651, Menstruation in Girls and Adolescents: Using the Menstrual Cycle as a Vital Sign.
- FIGO 2018 revision of the systems for normal and abnormal uterine bleeding (Munro and colleagues, International Journal of Gynecology and Obstetrics, 2018).
- NICE guideline NG88 on heavy menstrual bleeding.
- The current Pakistan emergency numbers from a government or Rescue 1122 source for her city.

Source check. None of the primary documents above (the ACOG opinion, the FIGO guideline, the NICE guidance) was opened for this document. In step 2 the agent writes docs/source-check.md with one line per number: verified, not found, conflicting, or not checked when it cannot open the source. The reviewer closes every line that is not verified. The Std rows have no published number behind them, and the rows marked (new) or (changed) are Std until reviewed.
