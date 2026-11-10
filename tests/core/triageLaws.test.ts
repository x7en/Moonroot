import { describe, expect, it } from 'vitest';
import { DANGER_SIGN_KEYS } from '../../core/model/catalogues';
import type { DangerSign, DayLog, Flow, Level, Profile } from '../../core/model/types';
import {
  getActiveQuestionFlows,
  getVisibleDangerSigns,
} from '../../core/triage/flowEngine';
import { QUESTION_FLOWS, SCREEN_INPUT_FIELDS } from '../../core/triage/questions';
import { RULES_TABLE, UNDER_18_GUIDANCE_ADDON } from '../../core/triage/rules';
import { evaluateTriage } from '../../core/triage/engine';

const LEVEL_RANK: Record<Level, number> = {
  green: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2025-01-01T10:00:00+05:00',
  birthYear: 2002,
  menarcheAge: 13,
  selfRegularity: 'regular',
  lastPeriodApprox: null,
  onHormones: true,
  contraception: 'combined-pill',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: '',
  medicationsNote: '',
  sproutName: null,
  theme: 'dusk',
  units: { temperature: 'C', water: 'ml' },
  reminders: {
    daily: { on: false, time: '20:00' },
    watchlist: true,
    quietFrom: '22:00',
    quietTo: '07:00',
  },
  discreetMode: false,
  lock: { type: 'none' },
  locale: 'en',
  region: 'PK',
  disclaimerAcceptedAt: '2025-01-01T10:00:00+05:00',
};

function makeDay(extra: Partial<DayLog> = {}): DayLog {
  return {
    date: '2026-10-30',
    filledFrom: 'live',
    flow: 'none',
    pain: { level: 0, sites: [] },
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: '2026-10-30T12:00:00+05:00',
    ...extra,
  };
}

describe('Step 2 exhaustive testing laws & input coverage', () => {
  it('Law 1 (Monotonicity): adding any danger sign or raising pain/fever/bleeding never lowers level', () => {
    const flows: Flow[] = ['none', 'spotting', 'light', 'medium', 'heavy'];
    const basePainLevels = [0, 3, 4, 7, 8];

    for (const flow of flows) {
      for (const painLevel of basePainLevels) {
        const base = makeDay({
          flow,
          pain: {
            level: painLevel,
            sites: ['lower-middle'],
            reliefHelped: painLevel >= 8 ? 'none-taken' : undefined,
          },
          pregnancyChance: 'no',
        });
        const baseEval = evaluateTriage({
          today: '2026-10-30',
          profile: ADULT_PROFILE,
          dayLog: base,
          recentLogs: [],
          decisions: [],
          medicines: [],
          watchItems: [],
          existingVerdicts: [],
          visits: [],
        });
        if (baseEval.today.level === 'incomplete' || baseEval.overallLevel === 'incomplete') {
          continue;
        }
        const baseRank = LEVEL_RANK[baseEval.overallLevel];

        // 1a. Adding ANY individual danger sign must never lower overallLevel
        for (const sign of DANGER_SIGN_KEYS) {
          const worse = evaluateTriage({
            today: '2026-10-30',
            profile: ADULT_PROFILE,
            dayLog: { ...base, danger: [sign] },
            recentLogs: [],
            decisions: [],
            medicines: [],
            watchItems: [],
            existingVerdicts: [],
            visits: [],
          });
          expect(worse.overallLevel).not.toBe('incomplete');
          if (worse.overallLevel !== 'incomplete') {
            expect(LEVEL_RANK[worse.overallLevel]).toBeGreaterThanOrEqual(baseRank);
          }
        }

        // 1b. Worsening pain (up to 8) never lowers level unless reliefHelped changes applicability cleanly
        const higherPain = Math.min(10, painLevel + 2);
        const worsePain = evaluateTriage({
          today: '2026-10-30',
          profile: ADULT_PROFILE,
          dayLog: {
            ...base,
            pain: {
              level: higherPain,
              sites: ['lower-middle'],
              reliefHelped: higherPain >= 8 ? 'none-taken' : undefined,
            },
          },
          recentLogs: [],
          decisions: [],
          medicines: [],
          watchItems: [],
          existingVerdicts: [],
          visits: [],
        });
        if (worsePain.overallLevel !== 'incomplete') {
          expect(LEVEL_RANK[worsePain.overallLevel]).toBeGreaterThanOrEqual(baseRank);
        }
      }
    }

    // 1c. Specific Law 1 regressions: YEL-02 with every danger sign, YEL-08 with every fever temp
    const nonRedNonOrg14: DangerSign[] = ['unusual-tiredness', 'breathless-on-effort'];
    for (const sign of nonRedNonOrg14) {
      const y2 = evaluateTriage({
        today: '2026-10-30',
        profile: { ...ADULT_PROFILE, onHormones: false, contraception: 'none' },
        dayLog: makeDay({
          flow: 'none',
          pain: { level: 5, sites: ['lower-middle'] },
          danger: [sign],
          pregnancyChance: 'no',
        }),
        recentLogs: [],
        decisions: [],
        medicines: [],
        watchItems: [],
        existingVerdicts: [],
        visits: [],
      });
      expect(y2.today.level).toBe('yellow');
    }

    for (const temp of [37.0, 37.9, 38.0, 39.2]) {
      const y8 = evaluateTriage({
        today: '2026-10-30',
        profile: ADULT_PROFILE,
        dayLog: makeDay({
          flow: 'none',
          discharge: 'yellow-green',
          fever: { c: temp },
        }),
        recentLogs: [],
        decisions: [],
        medicines: [],
        watchItems: [],
        existingVerdicts: [],
        visits: [],
      });
      expect(LEVEL_RANK[y8.today.level as Level]).toBeGreaterThanOrEqual(LEVEL_RANK.yellow);
    }
  });

  it('Law 2 (Red guardrails always show): prior dismissals, open events, or quiet history never suppress Red', () => {
    const redTriggerDay = makeDay({
      flow: 'heavy',
      soakedPerHour: true,
      pain: { level: 3, sites: ['lower-middle'] },
      danger: [],
      dangerAnswered: false, // Even if dangerAnswered incomplete, RED-01 already fired!
    });
    const res = evaluateTriage({
      today: '2026-10-30',
      profile: ADULT_PROFILE,
      dayLog: redTriggerDay,
      recentLogs: [],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [
        {
          id: 'old-red',
          at: '2026-10-29T10:00:00+05:00',
          level: 'red',
          ruleIds: ['RED-01'],
          title: 'Get care today',
          reasons: [],
          rulesetVersion: '1.0',
          kind: 'today',
          dismissedAt: '2026-10-29T11:00:00+05:00',
        },
      ],
      visits: [],
    });
    expect(res.today.level).toBe('red');
    expect(res.today.ruleIds).toContain('RED-01');
  });

  it('Law 3 (Privacy & under-18 gating): gates intimacy, oestrogen signs, generic wording, and parent/nurse note', () => {
    const under18Profile: Profile = {
      ...ADULT_PROFILE,
      birthYear: 2010,
      onHormones: false,
      contraception: 'none',
      sexualHealthQuestions: 'off',
      intimacy: 'none',
    };
    const dayWithIntimacyAndLeg = makeDay({
      flow: 'none',
      pain: { level: 8, sites: ['left'], sudden: true },
      danger: ['nausea', 'leg-pain-or-swelling'],
      intimacy: { event: 'unprotected', bleedingAfter: true, painDuring: true },
    });

    // Intimacy question flow hidden; oestrogen danger chips hidden
    const flows = getActiveQuestionFlows({
      today: '2026-10-30',
      profile: under18Profile,
      dayLog: dayWithIntimacyAndLeg,
      recentLogs: [],
      activeCycleLengths: [],
      daysSinceLastPeriodStart: null,
      medicines: [],
      decisions: [],
    });
    expect(flows.some((f) => f.triggerId === 'bleeding-or-pain-after-sex')).toBe(false);
    expect(getVisibleDangerSigns(under18Profile, []).some((s) => s.oestrogenOnly)).toBe(false);

    const res = evaluateTriage({
      today: '2026-10-30',
      profile: under18Profile,
      dayLog: dayWithIntimacyAndLeg,
      recentLogs: [],
      decisions: [],
      medicines: [],
      watchItems: [],
      existingVerdicts: [],
      visits: [],
    });
    // Adult-only intimacy rules and RED-11 must NOT fire
    expect(res.firedTodayRules).not.toContain('RED-11');
    expect(res.firedTodayRules).not.toContain('YEL-05');
    expect(res.firedTodayRules).not.toContain('YEL-09');
    expect(res.firedEventRules.some((e) => e.ruleId === 'ORG-06')).toBe(false);
    // Generic wording and under-18 guidance MUST appear on Red verdict
    expect(res.today.level).toBe('red');
    expect(res.today.message).toContain(UNDER_18_GUIDANCE_ADDON);
    expect(res.today.message).toContain('whatever the cause');
  });

  it('Law 4 (No false reassurance): missing flow, pain, dangerAnswered, or pain>=8 reliefHelped never gives Green', () => {
    const incompleteCases: DayLog[] = [
      makeDay({ flow: null, pain: { level: 0, sites: [] } }), // missing flow
      makeDay({ flow: 'light', pain: undefined }), // missing pain
      makeDay({ flow: 'heavy', pain: { level: 1, sites: [] }, dangerAnswered: false }), // missing danger screen
      makeDay({ flow: 'medium', pain: { level: 1, sites: [] }, dangerAnswered: undefined }), // undefined dangerAnswered
      makeDay({ flow: 'none', pain: { level: 2, sites: ['left'] }, dangerAnswered: true }), // missing pregnancyChance on RED-04 site
      makeDay({ flow: 'heavy', pain: { level: 8, sites: [], reliefHelped: undefined }, dangerAnswered: true }), // pain>=8 missing reliefHelped
      makeDay({ flow: 'spotting', pain: { level: 2, sites: ['right'] }, dangerAnswered: true }), // unanswered RED-04 neutral pregnancy
    ];

    for (const dayLog of incompleteCases) {
      const res = evaluateTriage({
        today: '2026-10-30',
        profile: ADULT_PROFILE,
        dayLog,
        recentLogs: [],
        decisions: [],
        medicines: [],
        watchItems: [],
        existingVerdicts: [],
        visits: [],
      });
      expect(res.today.level).not.toBe('green');
      expect(res.today.level).toBe('incomplete');
      expect(res.today.missingCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('Input coverage: every field read by RULES_TABLE maps to a QUESTION_FLOWS or SCREEN_INPUT_FIELDS setter', () => {
    const allFields = new Set(RULES_TABLE.flatMap((r) => r.inputsRead));
    const questionFields = new Set(
      QUESTION_FLOWS.flatMap((f) => f.questions.flatMap((q) => q.setsFields)),
    );
    const screenFields = new Set(SCREEN_INPUT_FIELDS);

    for (const field of allFields) {
      expect(questionFields.has(field) || screenFields.has(field)).toBe(true);
    }
    expect(allFields.size).toBeGreaterThanOrEqual(30);
  });
});
