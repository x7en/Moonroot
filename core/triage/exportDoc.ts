import { RULESET_VERSION } from '../model/types';
import { CASE_CARDS } from './caseCards';
import { QUESTION_FLOWS } from './questions';
import { RULES_TABLE, type TriageRuleDefinition } from './rules';

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderRuleSection(title: string, rules: readonly TriageRuleDefinition[]): string {
  const lines: string[] = [
    `## ${title}`,
    '',
    '| ID | Level | Kind | Status | Source | Condition | Threshold | Exact words shown | Clinician mark |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const rule of rules) {
    const marker = rule.specMarker ? ` (${rule.specMarker})` : '';
    const note = rule.clinicalReviewNote ? ` Note: ${rule.clinicalReviewNote}` : '';
    const extraWords = [
      rule.actionPrepend ? `Prepend: "${rule.actionPrepend}"` : '',
      rule.genericWordsShown ? `Generic: "${rule.genericWordsShown}"` : '',
      rule.hormoneNote ? `Hormone note: "${rule.hormoneNote}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const fullWords = [rule.wordsShown, extraWords].filter(Boolean).join(' ');

    lines.push(
      `| ${rule.id}${marker} | ${rule.level} | ${rule.kind} | **${rule.reviewStatus}** | ${rule.sourceKey} | ${escapeCell(rule.plainCondition + note)} | ${escapeCell(rule.thresholdDescription)} | ${escapeCell(fullWords)} | [ ] Agree  [ ] Change  [ ] Remove |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function renderClinicalReviewMarkdown(): string {
  const red = RULES_TABLE.filter((r) => r.level === 'red');
  const orange = RULES_TABLE.filter((r) => r.level === 'orange');
  const yellow = RULES_TABLE.filter((r) => r.level === 'yellow');
  const green = RULES_TABLE.filter((r) => r.level === 'green');
  const standing = RULES_TABLE.filter((r) => r.level === 'standing');

  const lines: string[] = [
    '# Moonroot Clinical Review Packet',
    '',
    `- **Ruleset version**: ${RULESET_VERSION}`,
    '- **Overall clinical review status**: **UNREVIEWED** (Not yet reviewed by a clinician)',
    '- **Source**: Generated directly from `core/triage/rules.ts` and `core/triage/questions.ts` via `npm run rules:export`.',
    '',
    'Every row below is marked **unreviewed** until a clinician (or a senior medical student working under a doctor) signs it off. Start with rows marked `Std`, `(new)`, `(changed)`, or `(user-decision)`.',
    '',
    '## Medical Interpretations Pending Clinical Sign-Off (8 November 2026)',
    '',
    '1. **Fever without measured temperature** (`RED-06`, `RED-07`): **unreviewed (`Std`)** — If `fever.c` is absent and `fever.felt === true`, treat as fever present. Measured `fever.c` always takes precedence over `fever.felt`.',
    '2. **Pain threshold for RED-04, RED-05, RED-07**: **unreviewed (`Std`)** — Any logged pain (`pain.level >= 1`) satisfies the pain condition; lower belly pain in `RED-07` maps to `lower-middle`, `left`, `right`, or `whole-belly`.',
    '3. **ORG-01 prolonged period counting rule**: **unreviewed (`Std`)** — Counts known logged bleeding days (`flow !== "none"`) > 7 within the confirmed period episode, excluding unlogged days and explicit `none` days.',
    '4. **YEL-02 & YEL-08 Law 1 monotonicity fix**: **unreviewed (`Std`)** — Base yellow rules remain active when non-red warning signs or sub-threshold fever are logged so adding a sign never drops Yellow to Green.',
    '5. **ORG-12 stool blood field**: **unreviewed (`Std`)** — Step 2 reads `DayLog.stoolBlood`; fires only on `back-passage`, ignores `period`, and leaves `unsure` unresolved for follow-up.',
    '6. **Open clinical questions flagged during design freeze**:',
    '   - `ORG-14` stops at pain `4–7`, while `RED-03` requires `sudden === true` and `RED-08` requires failed pain medicine; confirm how non-sudden pain `8–10` with `dizzy`/`nausea`/`very-pale` and no medicine tried should be classified.',
    '   - Confirm whether `RED-06` should remain `tampon` and `cup` only, or also include menstrual `disc`.',
    '   - Confirm whether `ORG-01` becomes Red above a specific bleeding day count.',
    '',
    renderRuleSection('Red Rules: Get Care Today', red),
    renderRuleSection('Orange Rules: See a Doctor Soon', orange),
    renderRuleSection('Yellow Rules: Keep Watching', yellow),
    renderRuleSection('Green & Supporting Rules', green),
    renderRuleSection('Standing Flags (Record & Doctor File)', standing),
    '## Question Flows and Follow-up Schedule',
    '',
    '| Trigger | When asked | Max Qs | Follow-up / Watch window | Questions & fields set | Clinician mark |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const flow of QUESTION_FLOWS) {
    const qText = flow.questions
      .map((q) => {
        const gate = q.ageOrSettingGate ? ` [${q.ageOrSettingGate}]` : '';
        return `${q.defaultPrompt}${gate} -> ${q.setsFields.join(', ')}`;
      })
      .join('; ');
    lines.push(
      `| ${escapeCell(flow.triggerLabel)} | ${escapeCell(flow.conditionSummary)} | ${flow.maxQuestionsNormally}${flow.allowExtraForRedRule ? ' (+red)' : ''} | ${escapeCell(flow.followUpWindow ?? 'None')} | ${escapeCell(qText)} | [ ] Agree  [ ] Change |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function renderCaseCardsMarkdown(): string {
  const lines: string[] = [
    '# Moonroot Patient Case Cards',
    '',
    `- **Total cards**: ${CASE_CARDS.length}`,
    `- **Ruleset version**: ${RULESET_VERSION} (**UNREVIEWED**)`,
    '- **Source**: Generated from `core/triage/caseCards.ts` via `npm run rules:export`. The same cards execute as tests in Step 2 so the review packet and engine cannot drift apart.',
    '',
  ];

  for (const card of CASE_CARDS) {
    const rulesStr = card.expectedRuleIds.length > 0 ? card.expectedRuleIds.join(', ') : 'None';
    lines.push(`## ${card.id}: ${card.title}`);
    lines.push('');
    lines.push(`- **Category**: ${card.category}`);
    lines.push(`- **Patient scenario**: ${card.plainStory}`);
    lines.push(`- **Answers logged**: ${card.answersSummary.join(' · ')}`);
    lines.push(`- **App verdict**: \`${card.expectedTodayLevel}\` · **Rules**: \`${rulesStr}\``);
    if (card.expectedTextNotes && card.expectedTextNotes.length > 0) {
      lines.push(`- **Display / clinical notes**: ${card.expectedTextNotes.join(' ')}`);
    }
    lines.push('- **Reviewer decision**: [ ] Agree   [ ] Change: ____________________________');
    lines.push('');
  }

  return lines.join('\n');
}
