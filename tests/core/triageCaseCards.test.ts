import { describe, expect, it } from 'vitest';
import { CASE_CARDS } from '../../core/triage/caseCards';
import { RULES_TABLE, UNDER_18_GUIDANCE_ADDON } from '../../core/triage/rules';
import { evaluateSnapshot } from './snapshotHelper';

const EVENT_ORANGE_IDS = new Set(
  RULES_TABLE.filter((r) => r.level === 'orange' && r.kind === 'event').map((r) => r.id),
);

describe('Step 2 executable clinical CASE_CARDS (CASE-01..CASE-42)', () => {
  for (const card of CASE_CARDS) {
    it(`${card.id}: ${card.title}`, () => {
      const res = evaluateSnapshot(card.snapshot);
      const isPureEventCard =
        card.expectedRuleIds.length > 0 &&
        card.expectedRuleIds.every((id) => EVENT_ORANGE_IDS.has(id));

      if (isPureEventCard) {
        for (const expectedId of card.expectedRuleIds) {
          expect(res.openEvents.some((ev) => ev.ruleIds.includes(expectedId))).toBe(true);
        }
        // History rules must NEVER populate today.ruleIds
        for (const id of res.today.ruleIds) {
          expect(EVENT_ORANGE_IDS.has(id)).toBe(false);
        }
        expect(res.overallLevel).toBe('orange');
      } else {
        expect(res.today.level).toBe(card.expectedTodayLevel);
        for (const expectedId of card.expectedRuleIds) {
          expect(res.today.ruleIds).toContain(expectedId);
        }
      }

      if (card.id === 'CASE-06') {
        expect(res.today.message.startsWith('Remove the tampon or cup now.')).toBe(true);
      }
      if (card.id === 'CASE-37') {
        expect(res.today.message).toContain(UNDER_18_GUIDANCE_ADDON);
      }
      if (card.expectedTodayLevel === 'orange' || card.expectedTodayLevel === 'red') {
        const textToCheck = isPureEventCard
          ? res.openEvents[0]?.reasons.join(' ') ?? ''
          : res.today.message;
        if (!isPureEventCard) {
          expect(textToCheck).toContain(
            'If you are worried, see a doctor even if this looks fine.',
          );
        }
      }
    });
  }
});
