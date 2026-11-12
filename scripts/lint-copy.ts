import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { RULES_TABLE } from '../core/triage/rules';
import { QUESTION_FLOWS } from '../core/triage/questions';
import { DANGER_SIGN_CATALOGUE, MEDICINE_CATALOGUE, SYMPTOM_CATALOGUE } from '../core/model/catalogues';

interface Violation {
  source: string;
  message: string;
}

const violations: Violation[] = [];

// 1. Check forbidden patient-facing words across locales/ and (when present) ui/
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\babnormal\b/i, reason: 'Never use "abnormal" in user-facing copy' },
  { pattern: /\boverdue\b/i, reason: 'Never use "overdue" in user-facing copy' },
  { pattern: /\bfailed\b/i, reason: 'Never use "failed" about a cycle/period' },
  {
    pattern: /\blate(?!-night)\b/i,
    reason: 'Never call a period "late" or use "late" in user-facing copy (except late-night tag)',
  },
  {
    pattern: /\bmissed\b/i,
    reason: 'Never say "missed" in user-facing copy',
  },
  {
    pattern: /\bdiagnos(e|is|ed|ing)\b/i,
    reason: 'Forbidden "diagnos*" except in the disclaimer "does not diagnose"',
  },
  {
    pattern: /\b(PCOS|endometriosis|thyroid|anaemia|anemia|fibroids|ectopic|toxic shock)\b/i,
    reason: 'Disease/condition names may appear only in doctor-file questions, never in UI/verdict copy',
  },
  {
    pattern: /\b(safe dose|maximum dose|overdose|you should take|you can take)\b/i,
    reason: 'Never give medicine dosing advice',
  },
  {
    pattern: /\b\d+(\.\d+)?\s*mg\b/i,
    reason: 'Never hard-code milligram amounts; only {total} or {strength} placeholders are allowed',
  },
];

// Allowed exact disclaimer substrings where "does not diagnose" is explicitly required by SPEC.md
const ALLOWED_DIAGNOSIS_PHRASES = [
  /does not diagnose/i,
  /not diagnose/i,
];

function checkUserCopy(source: string, text: string): void {
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (!pattern.test(text)) continue;
    if (
      reason.includes('diagnos') &&
      ALLOWED_DIAGNOSIS_PHRASES.some((allowed) => allowed.test(text))
    ) {
      continue;
    }
    violations.push({ source, message: `${reason}: "${text}"` });
  }
}

function walkLocaleJson(obj: unknown, pathPrefix: string, fileLabel: string): void {
  if (typeof obj === 'string') {
    checkUserCopy(`${fileLabel}:${pathPrefix}`, obj);

    if (pathPrefix.startsWith('levels.')) {
      if (/\b(normal|common|fine)\b/i.test(obj)) {
        violations.push({
          source: `${fileLabel}:${pathPrefix}`,
          message: `Level label must not use normal/common/fine: "${obj}"`,
        });
      }
      if (pathPrefix === 'levels.green' && obj !== 'Nothing flagged') {
        violations.push({
          source: `${fileLabel}:${pathPrefix}`,
          message: `Green level label must be "Nothing flagged", got "${obj}"`,
        });
      }
    }

    if (pathPrefix.startsWith('notifications.')) {
      if (
        /\b(period|flow|pain|cramp|spotting|pregnant|pregnancy|doctor|symptom|bleed|blood|cycle|ovulation|fever|discharge)\b/i.test(
          obj,
        )
      ) {
        violations.push({
          source: `${fileLabel}:${pathPrefix}`,
          message: `Notification text must carry no health words: "${obj}"`,
        });
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => walkLocaleJson(item, `${pathPrefix}[${index}]`, fileLabel));
    return;
  }

  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = pathPrefix ? `${pathPrefix}.${k}` : k;
      walkLocaleJson(v, nextPath, fileLabel);
    }
  }
}

const root = process.cwd();
const localesDir = resolve(root, 'locales');
if (existsSync(localesDir)) {
  for (const file of readdirSync(localesDir)) {
    if (!file.endsWith('.json')) continue;
    const raw = readFileSync(join(localesDir, file), 'utf8');
    walkLocaleJson(JSON.parse(raw), '', `locales/${file}`);
  }
}

// Check all rule strings shown to user
for (const rule of RULES_TABLE) {
  checkUserCopy(`rules.ts:${rule.id}.title`, rule.title);
  checkUserCopy(`rules.ts:${rule.id}.reasonTemplate`, rule.reasonTemplate);
  checkUserCopy(`rules.ts:${rule.id}.wordsShown`, rule.wordsShown);
  if (rule.genericWordsShown) {
    checkUserCopy(`rules.ts:${rule.id}.genericWordsShown`, rule.genericWordsShown);
  }
  if (rule.actionPrepend) {
    checkUserCopy(`rules.ts:${rule.id}.actionPrepend`, rule.actionPrepend);
  }
  if (rule.hormoneNote) {
    checkUserCopy(`rules.ts:${rule.id}.hormoneNote`, rule.hormoneNote);
  }
  if (rule.level === 'green' && rule.id === 'GRN-01' && rule.title !== 'Nothing flagged') {
    violations.push({
      source: `rules.ts:${rule.id}.title`,
      message: `GRN-01 title must be "Nothing flagged", got "${rule.title}"`,
    });
  }
}

// Check question prompts and labels
for (const flow of QUESTION_FLOWS) {
  for (const q of flow.questions) {
    checkUserCopy(`questions.ts:${flow.triggerId}.${q.id}`, q.defaultPrompt);
    for (const opt of q.options ?? []) {
      checkUserCopy(`questions.ts:${flow.triggerId}.${q.id}.${opt.value}`, opt.defaultLabel);
    }
  }
}

// Check catalogues (especially medicine catalogue for zero mg/doses)
for (const item of [...SYMPTOM_CATALOGUE, ...DANGER_SIGN_CATALOGUE]) {
  checkUserCopy(`catalogues.ts:${item.key}`, item.defaultLabel);
}
for (const med of MEDICINE_CATALOGUE) {
  checkUserCopy(`catalogues.ts:${med.id}`, med.nameShown);
  if (med.genericName) {
    checkUserCopy(`catalogues.ts:${med.id}.generic`, med.genericName);
  }
}

// Check ui/ directory if present (Step 1 screens onwards)
function walkUiFiles(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkUiFiles(full);
    } else if (['.ts', '.tsx'].includes(extname(full))) {
      const content = readFileSync(full, 'utf8');
      const stringLiterals = content.match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? [];
      for (const lit of stringLiterals) {
        const inner = lit.slice(1, -1);
        checkUserCopy(full.replace(`${root}/`, ''), inner);
      }
    }
  }
}
walkUiFiles(resolve(root, 'ui'));
walkUiFiles(resolve(root, 'core/ask'));
walkUiFiles(resolve(root, 'app'));

// Check notification copy and Android widget / discreet strings carry zero health words
const DISCREET_HEALTH_WORDS =
  /\b(period|flow|pain|cramp|spotting|pregnant|pregnancy|doctor|symptom|bleed|blood|cycle|ovulation|fever|discharge|menstrua|uterus|vaginal)\b/i;

const reminderFiles = [
  resolve(root, 'app/reminders.ts'),
  resolve(root, 'android/app/src/main/res/values/strings.xml'),
  resolve(root, 'android/app/src/main/res/layout/moonroot_widget.xml'),
  resolve(root, 'android/app/src/main/res/xml/moonroot_widget_info.xml'),
  resolve(root, 'android/app/src/main/java/app/moonroot/journal/widget/MoonrootWidgetProvider.kt'),
];

for (const filePath of reminderFiles) {
  if (!existsSync(filePath)) continue;
  const rel = filePath.replace(`${root}/`, '');
  const content = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.xml')) {
    const textMatches = [
      ...(content.match(/>([^<]+)</g) ?? []).map((m) => m.slice(1, -1).trim()),
      ...(content.match(/android:text="([^"]+)"/g) ?? []).map((m) => m.slice(14, -1)),
    ];
    for (const txt of textMatches) {
      if (!txt || txt.startsWith('@')) continue;
      checkUserCopy(rel, txt);
      if (DISCREET_HEALTH_WORDS.test(txt)) {
        violations.push({
          source: rel,
          message: `Android widget/launcher XML must carry zero health words: "${txt}"`,
        });
      }
    }
  } else {
    const stringLiterals = content.match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? [];
    for (const lit of stringLiterals) {
      const inner = lit.slice(1, -1);
      if (filePath.endsWith('reminders.ts') && !/Moonroot|Reminders|check-in/i.test(inner)) {
        continue;
      }
      if (filePath.endsWith('MoonrootWidgetProvider.kt') && !/[a-z]{3,}/i.test(inner)) {
        continue;
      }
      if (
        (filePath.endsWith('reminders.ts') || filePath.endsWith('MoonrootWidgetProvider.kt')) &&
        DISCREET_HEALTH_WORDS.test(inner)
      ) {
        violations.push({
          source: rel,
          message: `Reminder/widget literal must carry zero health words: "${inner}"`,
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Copy lint failed:');
  for (const v of violations) {
    console.error(`  - [${v.source}] ${v.message}`);
  }
  process.exit(1);
}

console.log('Copy lint passed with 0 violations.');
