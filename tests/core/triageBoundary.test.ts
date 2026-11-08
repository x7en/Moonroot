import { describe, expect, it } from 'vitest';
import { RULES_TABLE } from '../../core/triage/rules';
import { evaluateTriage } from '../../core/triage/engine';
import {
  TEST_DEFAULT_PROFILE,
  evaluateSnapshot,
  toTestDayLog,
} from './snapshotHelper';

describe('Step 2 triage rule boundaries (all 46 RULES_TABLE specs)', () => {
  for (const rule of RULES_TABLE) {
    for (const ex of rule.examples) {
      it(`${rule.id} — ${ex.id}: ${ex.label}`, () => {
        const res = evaluateSnapshot(ex.input);
        const allFired = new Set([
          ...res.firedTodayRules,
          ...res.firedEventRules.map((e) => e.ruleId),
          ...res.standingFlags.map((s) => s.ruleId),
        ]);
        expect(allFired.has(rule.id)).toBe(ex.expectedFires);
      });
    }
  }

  it('ORG-12 counts >2 days of back-passage blood even during a period and rejects unsure', () => {
    const res = evaluateTriage({
      today: '2026-10-30',
      profile: TEST_DEFAULT_PROFILE,
      dayLog: toTestDayLog('2026-10-30', { flow: 'heavy', stoolBlood: 'back-passage', dangerAnswered: true, pain: { level: 1, sites: [] } }),
      recentLogs: [
        toTestDayLog('2026-10-28', { flow: 'heavy', stoolBlood: 'back-passage' }),
        toTestDayLog('2026-10-29', { flow: 'heavy', stoolBlood: 'back-passage' }),
        toTestDayLog('2026-10-30', { flow: 'heavy', stoolBlood: 'back-passage', dangerAnswered: true, pain: { level: 1, sites: [] } }),
      ],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    expect(res.firedEventRules.some((e) => e.ruleId === 'ORG-12')).toBe(true);

    const periodBlood = evaluateTriage({
      today: '2026-10-30',
      profile: TEST_DEFAULT_PROFILE,
      dayLog: toTestDayLog('2026-10-30', { flow: 'heavy', stoolBlood: 'period', dangerAnswered: true, pain: { level: 1, sites: [] } }),
      recentLogs: [
        toTestDayLog('2026-10-28', { flow: 'heavy', stoolBlood: 'period' }),
        toTestDayLog('2026-10-29', { flow: 'heavy', stoolBlood: 'period' }),
        toTestDayLog('2026-10-30', { flow: 'heavy', stoolBlood: 'period', dangerAnswered: true, pain: { level: 1, sites: [] } }),
      ],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    expect(periodBlood.firedEventRules.some((e) => e.ruleId === 'ORG-12')).toBe(false);
  });

  it('handles RED-04 cautiously and neutrally on prefer-not-to-say or unanswered without inventing yes or false Green', () => {
    const preferNot = evaluateSnapshot({
      today: '2026-10-30',
      profile: { birthYear: 2010, sexualHealthQuestions: 'when-relevant', intimacy: 'prefer-not-to-say' },
      dayLog: {
        flow: 'spotting',
        pain: { level: 2, sites: ['right'] },
        pregnancyChance: 'prefer-not-to-say',
        danger: [],
        dangerAnswered: true,
      },
    });
    // Does NOT invent yes (no RED-04), does NOT trap in incomplete, does NOT reassure with Green!
    expect(preferNot.firedTodayRules).not.toContain('RED-04');
    expect(preferNot.today.level).toBe('yellow');
    expect(preferNot.today.cautiousNeutralPregnancyHold).toBe(true);

    const unanswered = evaluateSnapshot({
      today: '2026-10-30',
      profile: { birthYear: 2010, sexualHealthQuestions: 'when-relevant', intimacy: 'prefer-not-to-say' },
      dayLog: {
        flow: 'spotting',
        pain: { level: 2, sites: ['right'] },
        danger: [],
        dangerAnswered: true,
      },
    });
    expect(unanswered.firedTodayRules).not.toContain('RED-04');
    expect(unanswered.today.level).toBe('incomplete');
    expect(unanswered.today.missingCount).toBe(1);
  });

  it('keeps Law 1 pain 7/8/10 monotonicity across YEL-02, ORG-14, RED-03, and RED-08', () => {
    // 1) pain 7, no flow -> Yellow (YEL-02)
    const p7 = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 7, sites: ['lower-middle'], sudden: false }, danger: [], dangerAnswered: true },
    });
    expect(p7.today.level).toBe('yellow');
    expect(p7.today.ruleIds).toContain('YEL-02');

    // 2) pain 8, no flow, relief none-taken -> Yellow (YEL-02)
    const p8 = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 8, sites: ['lower-middle'], sudden: false, reliefHelped: 'none-taken' }, danger: [], dangerAnswered: true },
    });
    expect(p8.today.level).toBe('yellow');
    expect(p8.today.ruleIds).toContain('YEL-02');
    expect(p8.firedTodayRules).not.toContain('RED-08');

    // 3) pain 10, no flow, relief none-taken -> Yellow (YEL-02)
    const p10 = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 10, sites: ['lower-middle'], sudden: false, reliefHelped: 'none-taken' }, danger: [], dangerAnswered: true },
    });
    expect(p10.today.level).toBe('yellow');
    expect(p10.today.ruleIds).toContain('YEL-02');

    // 4) pain 7 + dizziness, no flow -> Orange (ORG-14)
    const p7Dizzy = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 7, sites: ['lower-middle'], sudden: false }, danger: ['dizzy'], dangerAnswered: true },
    });
    expect(p7Dizzy.today.level).toBe('orange');
    expect(p7Dizzy.today.ruleIds).toContain('ORG-14');

    // 5) pain 8 + dizziness, no flow, relief none-taken -> Orange (ORG-14)
    const p8Dizzy = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 8, sites: ['lower-middle'], sudden: false, reliefHelped: 'none-taken' }, danger: ['dizzy'], dangerAnswered: true },
    });
    expect(p8Dizzy.today.level).toBe('orange');
    expect(p8Dizzy.today.ruleIds).toContain('ORG-14');
    expect(p8Dizzy.firedTodayRules).not.toContain('RED-08');

    // 6) pain 10 + dizziness, no flow, relief none-taken -> Orange (ORG-14)
    const p10Dizzy = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 10, sites: ['lower-middle'], sudden: false, reliefHelped: 'none-taken' }, danger: ['dizzy'], dangerAnswered: true },
    });
    expect(p10Dizzy.today.level).toBe('orange');
    expect(p10Dizzy.today.ruleIds).toContain('ORG-14');

    // 7) pain 8 + sudden + dizziness/nausea/very-pale -> Red (RED-03 wins)
    const p8SuddenDizzy = evaluateSnapshot({
      today: '2026-10-30',
      dayLog: { flow: 'none', pain: { level: 8, sites: ['lower-middle'], sudden: true, reliefHelped: 'none-taken' }, danger: ['nausea'], dangerAnswered: true },
    });
    expect(p8SuddenDizzy.today.level).toBe('red');
    expect(p8SuddenDizzy.today.ruleIds).toContain('RED-03');

    // 8) pain 8 + reliefHelped no / unsure -> Red (RED-08 wins)
    for (const reliefHelped of ['no', 'unsure'] as const) {
      const p8Red08 = evaluateSnapshot({
        today: '2026-10-30',
        dayLog: { flow: 'none', pain: { level: 8, sites: ['lower-middle'], sudden: false, reliefHelped }, danger: ['very-pale'], dangerAnswered: true },
      });
      expect(p8Red08.today.level).toBe('red');
      expect(p8Red08.today.ruleIds).toContain('RED-08');
    }
  });
});
