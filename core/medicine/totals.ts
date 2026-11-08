import { diffDays } from '../model/dates';
import type { DateKey, MedicineEntry } from '../model/types';

export interface DailyMedicineGroup {
  key: string;
  genericName: string | null;
  shownNames: string[];
  sameMedicineFlag: boolean;
  doseCount: number;
  totalUnits: number;
  totalMg: number;
  dosesWithoutStrength: number;
}

export interface HelpedCounts {
  yes: number;
  'a-little': number;
  no: number;
  unsure: number;
  unanswered: number;
}

export interface RangeAsNeededSummary {
  key: string;
  genericName: string | null;
  shownNames: string[];
  sameMedicineFlag: boolean;
  totalDoses: number;
  weeklyAverageDoses: number;
  daysWithDose: number;
  totalUnits: number;
  totalMg: number;
  dosesWithoutStrength: number;
  helpedCounts: HelpedCounts;
}

export interface RangeCourseSummary {
  id: string;
  nameShown: string;
  genericName: string | null;
  category: MedicineEntry['category'];
  startDate: DateKey;
  stopDate: DateKey | null;
}

export interface MedicineRangeSummary {
  from: DateKey;
  to: DateKey;
  asNeeded: RangeAsNeededSummary[];
  courses: RangeCourseSummary[];
}

function groupKeyFor(entry: MedicineEntry): string {
  const canonical = (entry.genericName ?? entry.nameShown).trim().toLowerCase();
  return canonical;
}

/**
 * Pure aggregation for a single calendar day.
 * Sums only what she entered; never compares with any dose limit or recommends amounts.
 */
export function groupMedicinesForDay(
  entries: readonly MedicineEntry[],
  date: DateKey,
): DailyMedicineGroup[] {
  const map = new Map<string, DailyMedicineGroup>();

  for (const entry of entries) {
    if (entry.kind !== 'dose' || entry.date !== date) continue;

    const key = groupKeyFor(entry);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        genericName: entry.genericName,
        shownNames: [],
        sameMedicineFlag: false,
        doseCount: 0,
        totalUnits: 0,
        totalMg: 0,
        dosesWithoutStrength: 0,
      };
      map.set(key, group);
    }

    if (!group.shownNames.includes(entry.nameShown)) {
      group.shownNames.push(entry.nameShown);
    }

    const units = entry.units ?? 1;
    group.doseCount += 1;
    group.totalUnits += units;
    if (entry.strengthMg !== null && Number.isFinite(entry.strengthMg)) {
      group.totalMg += units * entry.strengthMg;
    } else {
      group.dosesWithoutStrength += 1;
    }
    group.sameMedicineFlag = group.genericName !== null && group.shownNames.length > 1;
  }

  return Array.from(map.values());
}

/**
 * Pure aggregation across a date range [from, to].
 */
export function summarizeMedicinesForRange(
  entries: readonly MedicineEntry[],
  from: DateKey,
  to: DateKey,
): MedicineRangeSummary {
  const totalDays = Math.max(1, diffDays(from, to) + 1);
  const weeks = Math.max(1, totalDays / 7);

  const doseMap = new Map<
    string,
    {
      group: RangeAsNeededSummary;
      dates: Set<DateKey>;
    }
  >();
  const courses: RangeCourseSummary[] = [];

  for (const entry of entries) {
    if (entry.kind === 'course') {
      const start = entry.startDate ?? entry.date;
      const stop = entry.stopDate ?? null;
      if (start <= to && (stop === null || stop >= from)) {
        courses.push({
          id: entry.id,
          nameShown: entry.nameShown,
          genericName: entry.genericName,
          category: entry.category,
          startDate: start,
          stopDate: stop,
        });
      }
      continue;
    }

    if (entry.date < from || entry.date > to) continue;

    const key = groupKeyFor(entry);
    let bucket = doseMap.get(key);
    if (!bucket) {
      bucket = {
        group: {
          key,
          genericName: entry.genericName,
          shownNames: [],
          sameMedicineFlag: false,
          totalDoses: 0,
          weeklyAverageDoses: 0,
          daysWithDose: 0,
          totalUnits: 0,
          totalMg: 0,
          dosesWithoutStrength: 0,
          helpedCounts: {
            yes: 0,
            'a-little': 0,
            no: 0,
            unsure: 0,
            unanswered: 0,
          },
        },
        dates: new Set<DateKey>(),
      };
      doseMap.set(key, bucket);
    }

    const { group, dates } = bucket;
    dates.add(entry.date);
    if (!group.shownNames.includes(entry.nameShown)) {
      group.shownNames.push(entry.nameShown);
    }

    const units = entry.units ?? 1;
    group.totalDoses += 1;
    group.totalUnits += units;
    if (entry.strengthMg !== null && Number.isFinite(entry.strengthMg)) {
      group.totalMg += units * entry.strengthMg;
    } else {
      group.dosesWithoutStrength += 1;
    }

    if (entry.helped) {
      group.helpedCounts[entry.helped] += 1;
    } else {
      group.helpedCounts.unanswered += 1;
    }

    group.sameMedicineFlag = group.genericName !== null && group.shownNames.length > 1;
    group.daysWithDose = dates.size;
    group.weeklyAverageDoses = Number((group.totalDoses / weeks).toFixed(1));
  }

  return {
    from,
    to,
    asNeeded: Array.from(doseMap.values()).map((b) => b.group),
    courses: courses.sort((a, b) => a.startDate.localeCompare(b.startDate)),
  };
}
