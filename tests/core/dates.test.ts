import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatDateKey,
  isAdultSexualHealthAllowed,
  isUnder18,
  isValidDateKey,
  parseDateKey,
} from '../../core/model/dates';

describe('core/model/dates (pure calendar math, clock-free)', () => {
  it('parses and validates YYYY-MM-DD local calendar dates', () => {
    expect(isValidDateKey('2026-10-30')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2025-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-10-30T10:00:00Z')).toBe(false);
    expect(parseDateKey('2026-10-30')).toEqual({ year: 2026, month: 10, day: 30 });
    expect(formatDateKey(2026, 2, 5)).toBe('2026-02-05');
  });

  it('adds days cleanly across month, year, and leap-year boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('computes exact calendar day differences', () => {
    expect(diffDays('2026-10-01', '2026-10-30')).toBe(29);
    expect(diffDays('2026-10-30', '2026-10-30')).toBe(0);
    expect(diffDays('2026-10-30', '2026-10-20')).toBe(-10);
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2);
    expect(diffDays('2025-02-28', '2025-03-01')).toBe(1);
  });

  it('enforces the under-18 age rule including unknown birthYear', () => {
    expect(isUnder18({ birthYear: null }, '2026-11-08')).toBe(true);
    expect(isUnder18({ birthYear: 2010 }, '2026-11-08')).toBe(true); // 16
    expect(isUnder18({ birthYear: 2009 }, '2026-11-08')).toBe(true); // 17
    expect(isUnder18({ birthYear: 2008 }, '2026-11-08')).toBe(false); // 18
    expect(isUnder18({ birthYear: 2004 }, '2026-11-08')).toBe(false); // 22
  });

  it('gates adult sexual health questions by age and profile preference', () => {
    expect(
      isAdultSexualHealthAllowed(
        { birthYear: null, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
        '2026-11-08',
      ),
    ).toBe(false);
    expect(
      isAdultSexualHealthAllowed(
        { birthYear: 2010, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
        '2026-11-08',
      ),
    ).toBe(false);
    expect(
      isAdultSexualHealthAllowed(
        { birthYear: 2004, sexualHealthQuestions: 'off', intimacy: 'active' },
        '2026-11-08',
      ),
    ).toBe(false);
    expect(
      isAdultSexualHealthAllowed(
        { birthYear: 2004, sexualHealthQuestions: 'when-relevant', intimacy: 'none' },
        '2026-11-08',
      ),
    ).toBe(false);
    expect(
      isAdultSexualHealthAllowed(
        { birthYear: 2004, sexualHealthQuestions: 'when-relevant', intimacy: 'active' },
        '2026-11-08',
      ),
    ).toBe(true);
  });
});
