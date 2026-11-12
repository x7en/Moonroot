import { deriveCycles } from '../cycles/cycles';
import { classifyEpisodes } from '../cycles/episodes';
import { SYMPTOM_CATALOGUE } from '../model/catalogues';
import { addDays } from '../model/dates';
import type {
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  MedicineEntry,
} from '../model/types';
import type { DoctorFileRange } from './doctorFile';

export interface CsvExportOutput {
  filename: string;
  content: string;
}

export interface DayCsvInput {
  today: DateKey;
  dayLogs: readonly DayLog[];
  medicines: readonly MedicineEntry[];
  bodyLogs?: readonly BodyLog[];
  range?: DoctorFileRange;
  includeBody?: boolean;
  includeNotes?: boolean;
  includeMedicines?: boolean;
}

export interface CycleCsvInput {
  today: DateKey;
  dayLogs: readonly DayLog[];
  decisions?: readonly Decision[];
}

const SYMPTOM_LABELS = new Map<string, string>(
  SYMPTOM_CATALOGUE.map((s) => [s.key, s.defaultLabel]),
);

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: ReadonlyArray<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

function rangeStart(today: DateKey, range: DoctorFileRange, dates: readonly DateKey[]): DateKey {
  if (range === '3m') return addDays(today, -89);
  if (range === '6m') return addDays(today, -179);
  if (range === '12m') return addDays(today, -364);
  return dates[0] ?? today;
}

/**
 * Day table CSV (one row per logged day, chronological, never includes intimacy fields).
 * Columns: date, flow, products, clots, pain, symptoms, mood, sleep_hours, water_ml,
 *          stool_type, bbt_c, lh, mucus, medicines, note
 */
export function buildDayTableCsv(input: DayCsvInput): CsvExportOutput {
  const {
    today,
    dayLogs,
    medicines,
    bodyLogs = [],
    range = 'all',
    includeBody = true,
    includeNotes = true,
    includeMedicines = true,
  } = input;

  const sortedLogs = [...dayLogs]
    .filter((l) => l.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const fromDate = rangeStart(
    today,
    range,
    sortedLogs.map((l) => l.date),
  );
  const filteredLogs = sortedLogs.filter((l) => l.date >= fromDate && l.date <= today);

  const bodyByDate = new Map<DateKey, BodyLog>(bodyLogs.map((b) => [b.date, b]));
  const medsByDate = new Map<DateKey, MedicineEntry[]>();
  if (includeMedicines) {
    for (const m of medicines) {
      if (m.kind !== 'dose') continue;
      const arr = medsByDate.get(m.date) ?? [];
      arr.push(m);
      medsByDate.set(m.date, arr);
    }
  }

  const lines: string[] = [
    csvRow([
      'date',
      'flow',
      'products',
      'clots',
      'pain',
      'symptoms',
      'mood',
      'sleep_hours',
      'water_ml',
      'stool_type',
      'bbt_c',
      'lh',
      'mucus',
      'medicines',
      'note',
    ]),
  ];

  for (const log of filteredLogs) {
    const body = bodyByDate.get(log.date);
    const dayMeds = medsByDate.get(log.date) ?? [];
    const products = log.protection
      ? log.productsUsed !== undefined
        ? `${log.protection} (${log.productsUsed})`
        : log.protection
      : '';
    const symptoms = log.symptoms.map((s) => SYMPTOM_LABELS.get(s) ?? s).join('; ');
    const medStr = includeMedicines
      ? dayMeds.map((m) => `${m.genericName ?? m.nameShown} x${m.units ?? 1}`).join('; ')
      : '';

    lines.push(
      csvRow([
        log.date,
        log.flow ?? '',
        products,
        log.clots ?? '',
        log.pain ? log.pain.level : '',
        symptoms,
        log.mood ?? '',
        includeBody ? body?.sleep?.hours ?? '' : '',
        includeBody ? body?.water?.ml ?? '' : '',
        includeBody ? body?.stool?.bristol ?? '' : '',
        log.fertility?.bbt ?? '',
        log.fertility?.lh ?? '',
        log.fertility?.mucus ?? '',
        medStr,
        includeNotes ? log.note : '',
      ]),
    );
  }

  return {
    filename: `moonroot-days-${today}.csv`,
    content: lines.join('\n'),
  };
}

/**
 * Cycle table CSV (one row per derived cycle, chronological).
 */
export function buildCycleTableCsv(input: CycleCsvInput): CsvExportOutput {
  const { today, dayLogs, decisions = [] } = input;
  const sortedLogs = [...dayLogs]
    .filter((l) => l.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const episodes = classifyEpisodes(sortedLogs, decisions, today);
  const summary = deriveCycles(episodes, decisions, today);

  const lines: string[] = [
    csvRow([
      'cycle_number',
      'start_date',
      'end_date',
      'next_start_date',
      'length_days',
      'bleeding_days',
      'heaviest_flow',
      'lead_in_days',
      'peak_pain',
      'stopped_activities',
      'approximate',
      'ignored_in_predictions',
      'before_baseline',
      'date_check_flag',
    ]),
  ];

  for (let idx = 0; idx < summary.cycles.length; idx += 1) {
    const c = summary.cycles[idx];
    if (!c) continue;
    lines.push(
      csvRow([
        idx + 1,
        c.startDate,
        c.episode.endDate,
        c.nextStartDate,
        c.lengthDays,
        c.bleedingDays,
        c.episode.heaviestFlow,
        c.leadInDays,
        c.episode.maxPain,
        c.episode.anyStoppedActivities,
        c.approximate,
        c.ignoredInPredictions,
        c.beforeBaseline,
        c.dateCheckFlag ?? '',
      ]),
    );
  }

  return {
    filename: `moonroot-cycles-${today}.csv`,
    content: lines.join('\n'),
  };
}
