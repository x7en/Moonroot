import type { DateKey, Profile } from './types';

export interface ParsedDateKey {
  year: number;
  month: number;
  day: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

export function isValidDateKey(value: string): value is DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (month < 1 || month > 12) return false;
  const maxDay = daysInMonth(year, month);
  return day >= 1 && day <= maxDay;
}

export function parseDateKey(key: DateKey): ParsedDateKey {
  if (!isValidDateKey(key)) {
    throw new Error(`Invalid DateKey: ${key}`);
  }
  const [y, m, d] = key.split('-').map(Number);
  return { year: y as number, month: m as number, day: d as number };
}

export function formatDateKey(year: number, month: number, day: number): DateKey {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts a Gregorian calendar date to an integer day count since 1970-01-01.
 * Uses pure integer arithmetic so core/ never reads the system clock or timezone offsets.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y >= 0 ? y / 400 : (y - 399) / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

export function civilFromDays(daysSinceEpoch: number): ParsedDateKey {
  const z = daysSinceEpoch + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function addDays(key: DateKey, deltaDays: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const next = civilFromDays(daysFromCivil(year, month, day) + deltaDays);
  return formatDateKey(next.year, next.month, next.day);
}

export function diffDays(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return daysFromCivil(b.year, b.month, b.day) - daysFromCivil(a.year, a.month, a.day);
}

export function isUnder18(profile: Pick<Profile, 'birthYear'>, today: DateKey): boolean {
  if (profile.birthYear === null) return true;
  const { year } = parseDateKey(today);
  return year - profile.birthYear < 18;
}

export function isAdultSexualHealthAllowed(
  profile: Pick<Profile, 'birthYear' | 'sexualHealthQuestions' | 'intimacy'>,
  today: DateKey,
): boolean {
  if (isUnder18(profile, today)) return false;
  if (profile.sexualHealthQuestions === 'off') return false;
  if (profile.intimacy === 'none') return false;
  return true;
}

/**
 * Checks whether an active hormone course or profile contraception may contain oestrogen.
 * Controls visibility of the 3 oestrogen-gated danger signs and RED-11.
 */
export function mayContainOestrogen(
  profile: Pick<Profile, 'onHormones' | 'contraception'>,
  activeHormoneNames: readonly string[] = [],
): boolean {
  if (profile.contraception === 'combined-pill') return true;
  if (
    profile.onHormones === true &&
    (profile.contraception === null || profile.contraception === 'other')
  ) {
    return true;
  }
  if (profile.contraception === 'other' && profile.onHormones !== false) {
    return true;
  }
  for (const name of activeHormoneNames) {
    const lower = name.toLowerCase();
    if (lower.includes('progestin-only') || lower.includes('progestin pill')) {
      continue;
    }
    return true;
  }
  return false;
}
