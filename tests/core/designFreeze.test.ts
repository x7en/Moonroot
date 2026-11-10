import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DANGER_SIGN_CATALOGUE,
  MEDICINE_CATALOGUE,
  SYMPTOM_CATALOGUE,
} from '../../core/model/catalogues';
import type { RuleId } from '../../core/model/types';
import { CASE_CARDS } from '../../core/triage/caseCards';
import { renderCaseCardsMarkdown, renderClinicalReviewMarkdown } from '../../core/triage/exportDoc';
import { QUESTION_FLOWS, SCREEN_INPUT_FIELDS } from '../../core/triage/questions';
import { RULES_TABLE } from '../../core/triage/rules';
import enLocale from '../../locales/en.json';

function lookupLocale(key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, enLocale);
}

describe('Moonroot Design Freeze contracts', () => {
  it('defines all 46 triage rules with unique IDs and unreviewed status', () => {
    const expectedIds: RuleId[] = [
      'RED-01',
      'RED-02',
      'RED-03',
      'RED-04',
      'RED-05',
      'RED-06',
      'RED-07',
      'RED-08',
      'RED-09',
      'RED-10',
      'RED-11',
      'ORG-01',
      'ORG-02',
      'ORG-03',
      'ORG-04',
      'ORG-05',
      'ORG-06',
      'ORG-07',
      'ORG-08',
      'ORG-09',
      'ORG-10',
      'ORG-11',
      'ORG-12',
      'ORG-13',
      'ORG-14',
      'ORG-15',
      'YEL-01',
      'YEL-02',
      'YEL-03',
      'YEL-04',
      'YEL-05',
      'YEL-06',
      'YEL-07',
      'YEL-08',
      'YEL-09',
      'GRN-01',
      'GRN-02',
      'GRN-03',
      'GRN-04',
      'STD-01',
      'STD-02',
      'STD-03',
      'STD-04',
      'STD-05',
      'STD-06',
      'STD-07',
    ];

    const actualIds = RULES_TABLE.map((r) => r.id);
    expect(actualIds).toEqual(expectedIds);
    expect(new Set(actualIds).size).toBe(46);

    for (const rule of RULES_TABLE) {
      expect(rule.reviewStatus).toBe('unreviewed');
      expect(rule.examples.length).toBeGreaterThanOrEqual(2);
      expect(rule.examples.some((e) => e.expectedFires)).toBe(true);
      expect(rule.examples.some((e) => !e.expectedFires)).toBe(true);
    }
  });

  it('marks every Orange rule except ORG-14 as an event rule', () => {
    const orangeRules = RULES_TABLE.filter((r) => r.level === 'orange');
    expect(orangeRules).toHaveLength(15);

    for (const rule of orangeRules) {
      if (rule.id === 'ORG-14') {
        expect(rule.kind).toBe('today');
      } else {
        expect(rule.kind).toBe('event');
      }
    }
  });

  it('keeps the three catalogues exact and medicine starter list strength-free', () => {
    expect(SYMPTOM_CATALOGUE).toHaveLength(8);
    expect(DANGER_SIGN_CATALOGUE).toHaveLength(15);
    expect(MEDICINE_CATALOGUE.length).toBeGreaterThanOrEqual(9);

    for (const med of MEDICINE_CATALOGUE) {
      expect('strengthMg' in med).toBe(false);
      expect(/\d+\s*mg/i.test(med.nameShown)).toBe(false);
      expect(lookupLocale(med.labelKey)).toBe(med.nameShown);
    }

    for (const s of SYMPTOM_CATALOGUE) {
      expect(s.readByRules).toEqual([]);
      expect(lookupLocale(s.labelKey)).toBe(s.defaultLabel);
    }

    for (const d of DANGER_SIGN_CATALOGUE) {
      expect(lookupLocale(d.labelKey)).toBe(d.defaultLabel);
    }
  });

  it('cross-references danger signs symmetrically between catalogues and rules', () => {
    const catalogueMap = new Map(
      DANGER_SIGN_CATALOGUE.map((item) => [item.key, new Set(item.readByRules)]),
    );

    for (const rule of RULES_TABLE) {
      for (const sign of rule.dangerSignsRead) {
        const listedRules = catalogueMap.get(sign);
        expect(listedRules).toBeDefined();
        expect(listedRules?.has(rule.id)).toBe(true);
      }
    }

    for (const item of DANGER_SIGN_CATALOGUE) {
      for (const ruleId of item.readByRules) {
        const rule = RULES_TABLE.find((r) => r.id === ruleId);
        expect(rule).toBeDefined();
        expect(rule?.dangerSignsRead).toContain(item.key);
      }
    }
  });

  it('covers every rule input field with a question flow or screen input', () => {
    const covered = new Set<string>(SCREEN_INPUT_FIELDS);
    for (const flow of QUESTION_FLOWS) {
      for (const q of flow.questions) {
        expect(typeof lookupLocale(q.promptKey)).toBe('string');
        for (const opt of q.options ?? []) {
          expect(lookupLocale(opt.labelKey)).toBe(opt.defaultLabel);
        }
        for (const field of q.setsFields) {
          covered.add(field);
        }
      }
    }

    for (const rule of RULES_TABLE) {
      expect(rule.inputsRead.length).toBeGreaterThan(0);
      for (const input of rule.inputsRead) {
        expect(covered.has(input)).toBe(true);
      }
    }
  });

  it('covers all Red and Orange rules plus >= 5 below-threshold cards in case cards', () => {
    const requiredRules = RULES_TABLE.filter((r) => r.level === 'red' || r.level === 'orange').map(
      (r) => r.id,
    );
    const coveredRules = new Set(CASE_CARDS.flatMap((c) => c.expectedRuleIds));

    for (const id of requiredRules) {
      expect(coveredRules.has(id)).toBe(true);
    }

    const belowCount = CASE_CARDS.filter((c) => c.category === 'below-threshold').length;
    expect(belowCount).toBeGreaterThanOrEqual(5);
  });

  it('keeps docs/clinical-review.md and docs/case-cards.md synced with exported generators', () => {
    const root = process.cwd();
    const reviewDoc = readFileSync(resolve(root, 'docs/clinical-review.md'), 'utf8');
    const cardsDoc = readFileSync(resolve(root, 'docs/case-cards.md'), 'utf8');

    expect(reviewDoc).toBe(renderClinicalReviewMarkdown());
    expect(cardsDoc).toBe(renderCaseCardsMarkdown());
  });
});
