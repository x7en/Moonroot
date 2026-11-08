import { describe, expect, it } from 'vitest';
import type { MedicineEntry } from '../../core/model/types';
import { groupMedicinesForDay, summarizeMedicinesForRange } from '../../core/medicine/totals';

const ENTRIES: MedicineEntry[] = [
  {
    id: 'm1',
    date: '2026-10-30',
    kind: 'dose',
    category: 'pain-relief',
    nameShown: 'Ponstan',
    genericName: 'mefenamic acid',
    strengthMg: 250,
    units: 2,
    helped: 'a-little',
    note: '',
    updatedAt: '2026-10-30T09:00:00+05:00',
  },
  {
    id: 'm2',
    date: '2026-10-30',
    kind: 'dose',
    category: 'pain-relief',
    nameShown: 'Ponstan Forte',
    genericName: 'mefenamic acid',
    strengthMg: 500,
    units: 1,
    helped: 'yes',
    note: '',
    updatedAt: '2026-10-30T15:00:00+05:00',
  },
  {
    id: 'm3',
    date: '2026-10-30',
    kind: 'dose',
    category: 'pain-relief',
    nameShown: 'Panadol',
    genericName: 'paracetamol',
    strengthMg: null,
    units: 2,
    helped: 'unsure',
    note: '',
    updatedAt: '2026-10-30T18:00:00+05:00',
  },
  {
    id: 'm4',
    date: '2026-10-23',
    kind: 'dose',
    category: 'pain-relief',
    nameShown: 'Ponstan',
    genericName: 'mefenamic acid',
    strengthMg: 250,
    units: 1,
    helped: 'no',
    note: '',
    updatedAt: '2026-10-23T12:00:00+05:00',
  },
  {
    id: 'c1',
    date: '2026-10-01',
    kind: 'course',
    category: 'iron-or-supplement',
    nameShown: 'Iron supplement',
    genericName: 'iron',
    strengthMg: null,
    startDate: '2026-10-01',
    stopDate: null,
    note: 'Morning',
    updatedAt: '2026-10-01T08:00:00+05:00',
  },
];

describe('core/medicine/totals', () => {
  it('sums doses, units, and mg per generic name and flags same-medicine brand pairs', () => {
    const groups = groupMedicinesForDay(ENTRIES, '2026-10-30');
    expect(groups).toHaveLength(2);

    const mef = groups.find((g) => g.genericName === 'mefenamic acid');
    expect(mef).toBeDefined();
    expect(mef?.doseCount).toBe(2);
    expect(mef?.totalUnits).toBe(3);
    expect(mef?.totalMg).toBe(1000); // 2*250 + 1*500
    expect(mef?.dosesWithoutStrength).toBe(0);
    expect(mef?.sameMedicineFlag).toBe(true);
    expect(mef?.shownNames).toEqual(['Ponstan', 'Ponstan Forte']);

    const para = groups.find((g) => g.genericName === 'paracetamol');
    expect(para).toBeDefined();
    expect(para?.doseCount).toBe(1);
    expect(para?.totalUnits).toBe(2);
    expect(para?.totalMg).toBe(0);
    expect(para?.dosesWithoutStrength).toBe(1);
    expect(para?.sameMedicineFlag).toBe(false);
  });

  it('summarizes as-needed doses and courses across a date range without any limit check', () => {
    const summary = summarizeMedicinesForRange(ENTRIES, '2026-10-01', '2026-10-30');
    expect(summary.courses).toHaveLength(1);
    expect(summary.courses[0]?.nameShown).toBe('Iron supplement');

    const mef = summary.asNeeded.find((a) => a.genericName === 'mefenamic acid');
    expect(mef).toBeDefined();
    expect(mef?.totalDoses).toBe(3);
    expect(mef?.daysWithDose).toBe(2);
    expect(mef?.totalMg).toBe(1250);
    expect(mef?.helpedCounts).toEqual({
      yes: 1,
      'a-little': 1,
      no: 1,
      unsure: 0,
      unanswered: 0,
    });
    expect(JSON.stringify(summary)).not.toMatch(/limit|warning|overdose|exceed|safe/i);
  });
});
