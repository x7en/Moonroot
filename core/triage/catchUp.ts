import { addDays, diffDays } from '../model/dates';
import type { DateKey, DayLog } from '../model/types';

const MAX_CATCH_UP_DAYS = 7;
const MIN_MISSING_DAYS_FOR_CATCH_UP = 2;

export function getCatchUpDays(
  dayLogs: readonly Pick<DayLog, 'date'>[],
  today: DateKey,
): readonly DateKey[] {
  let latestPrior: DateKey | null = null;
  for (const log of dayLogs) {
    if (log.date < today && (latestPrior === null || log.date > latestPrior)) {
      latestPrior = log.date;
    }
  }
  if (latestPrior === null) return [];

  const gapDays = diffDays(latestPrior, today) - 1;
  if (gapDays < MIN_MISSING_DAYS_FOR_CATCH_UP) return [];

  const count = Math.min(gapDays, MAX_CATCH_UP_DAYS);
  const start = addDays(today, -count);
  const result: DateKey[] = [];
  for (let i = 0; i < count; i += 1) {
    result.push(addDays(start, i));
  }
  return result;
}
