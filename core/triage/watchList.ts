import type { BleedingEpisode } from '../cycles/episodes';
import { addDays, daysFromCivil, parseDateKey } from '../model/dates';
import type { DateKey, RuleId, Stamp, WatchItem } from '../model/types';
import { THRESHOLDS } from './thresholds';

export const WATCH_CHECK_LABELS: Readonly<Record<string, string>> = {
  'discharge-still-there': 'Is the discharge still there?',
  'became-period': 'Did it become a period?',
  'bleeding-still-there': 'Is bleeding still there?',
  'bleeding-heavier': 'Has bleeding got heavier?',
  'pain-worse': 'Has the pain got worse?',
  'bleeding-started': 'Has bleeding started?',
  'bleeding-again-or-pain': 'Any more bleeding or pain after sex?',
  'symptoms-still-there': 'Are those symptoms still there?',
  'danger-signs-now':
    'Any new warning signs (dizzy, fainting, chest pain, trouble breathing, fever)?',
};

export function getWatchCheckLabel(key: string): string {
  return WATCH_CHECK_LABELS[key] ?? key;
}

function parseStampUtcMinutes(stamp: Stamp): number {
  const datePart = stamp.slice(0, 10);
  const { year, month, day } = parseDateKey(datePart);
  let totalMinutes = daysFromCivil(year, month, day) * 1440;

  if (stamp.length > 10 && stamp[10] === 'T') {
    const timeAndZone = stamp.slice(11);
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?(Z|([+-])(\d{2}):(\d{2}))?/.exec(
      timeAndZone,
    );
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2]);
      totalMinutes += hours * 60 + mins;
      if (match[5] && match[6] && match[7]) {
        const sign = match[5] === '+' ? 1 : -1;
        const offsetMins = Number(match[6]) * 60 + Number(match[7]);
        totalMinutes -= sign * offsetMins;
      }
    }
  }
  return totalMinutes;
}

export function hoursBetweenStamps(fromStamp: Stamp, toStamp: Stamp): number {
  return (parseStampUtcMinutes(toStamp) - parseStampUtcMinutes(fromStamp)) / 60;
}

function extractZoneSuffix(stamp: Stamp): string {
  const match = /(Z|[+-]\d{2}:\d{2})$/.exec(stamp);
  return match?.[1] ?? '+00:00';
}

export interface CreateWatchItemsInput {
  today: DateKey;
  nowStamp: Stamp;
  firedTodayRules: readonly RuleId[];
  unclearEpisodes: readonly BleedingEpisode[];
  existingWatchItems: readonly WatchItem[];
}

function hasOpenWithKey(items: readonly WatchItem[], firstKey: string): boolean {
  return items.some(
    (w) => w.status === 'open' && w.checks.some((c) => c.key === firstKey),
  );
}

export function createWatchItems(input: CreateWatchItemsInput): WatchItem[] {
  const { today, nowStamp, firedTodayRules, unclearEpisodes, existingWatchItems } =
    input;
  const zone = extractZoneSuffix(nowStamp);
  const nextMorning: Stamp = `${addDays(today, 1)}T09:00:00${zone}`;
  const created: WatchItem[] = [];

  const yellowFired = firedTodayRules.filter((id) => id.startsWith('YEL-'));
  if (yellowFired.includes('YEL-08') && !hasOpenWithKey(existingWatchItems, 'discharge-still-there')) {
    created.push({
      id: `watch:discharge:${today}`,
      createdAt: nowStamp,
      dueAt: nextMorning,
      status: 'open',
      checks: [{ key: 'discharge-still-there' }],
    });
  }

  const otherYellow = yellowFired.filter((id) => id !== 'YEL-08');
  if (otherYellow.length > 0) {
    const keys: string[] = [];
    if (otherYellow.includes('YEL-01') || otherYellow.includes('YEL-07')) {
      keys.push('bleeding-heavier', 'became-period');
    } else if (otherYellow.includes('YEL-02')) {
      keys.push('pain-worse', 'bleeding-started');
    } else if (otherYellow.includes('YEL-05') || otherYellow.includes('YEL-09')) {
      keys.push('bleeding-again-or-pain');
    } else {
      keys.push('symptoms-still-there');
    }
    keys.push('danger-signs-now');
    const boundedKeys = keys.slice(0, THRESHOLDS.WATCH_LIST_MAX_CHECKS);
    const signatureKey = boundedKeys[0] ?? 'symptoms-still-there';

    if (
      !hasOpenWithKey(existingWatchItems, signatureKey) &&
      !hasOpenWithKey(created, signatureKey)
    ) {
      created.push({
        id: `watch:yellow:${today}`,
        createdAt: nowStamp,
        dueAt: nextMorning,
        status: 'open',
        checks: boundedKeys.map((key) => ({ key })),
      });
    }
  }

  const openUnclear = unclearEpisodes.some((ep) => ep.isOpen);
  if (
    openUnclear &&
    !hasOpenWithKey(existingWatchItems, 'became-period') &&
    !hasOpenWithKey(created, 'became-period')
  ) {
    created.push({
      id: `watch:unclear:${today}`,
      createdAt: nowStamp,
      dueAt: nextMorning,
      status: 'open',
      checks: [{ key: 'became-period' }, { key: 'bleeding-still-there' }],
    });
  }

  return created;
}

export interface WatchAdvanceResult {
  item: WatchItem;
  raisedImmediately: boolean;
  summary: string | null;
}

export function summarizeWatchItem(item: WatchItem): string {
  const parts = item.checks.map((c) => `${getWatchCheckLabel(c.key)} ${c.answer ?? 'skipped'}`);
  return `Watch check closed (${item.createdAt.slice(0, 10)}): ${parts.join('; ')}.`;
}

export function advanceWatchItem(
  item: WatchItem,
  answers: Readonly<Record<string, 'yes' | 'no' | 'unsure'>>,
  nowStamp: Stamp,
  previousRepeatCount = 0,
): WatchAdvanceResult {
  const updatedChecks = item.checks.map((c) => {
    const nextAns = answers[c.key];
    return nextAns !== undefined ? { key: c.key, answer: nextAns } : c;
  });

  if (answers['danger-signs-now'] === 'yes') {
    const escalated: WatchItem = {
      ...item,
      status: 'escalated',
      checks: updatedChecks,
    };
    return {
      item: escalated,
      raisedImmediately: true,
      summary: 'Watch check raised: a warning sign was ticked.',
    };
  }

  const elapsedHours = hoursBetweenStamps(item.createdAt, nowStamp);
  if (elapsedHours >= THRESHOLDS.WATCH_LIST_MAX_HOURS) {
    const dischargeYes = updatedChecks.some(
      (c) => c.key === 'discharge-still-there' && c.answer === 'yes',
    );
    if (dischargeYes) {
      const escalated: WatchItem = {
        ...item,
        status: 'escalated',
        checks: updatedChecks,
      };
      return {
        item: escalated,
        raisedImmediately: false,
        summary: 'Watch check raised at 72 hours: discharge still present.',
      };
    }
    const closed: WatchItem = {
      ...item,
      status: 'closed',
      checks: updatedChecks,
    };
    return {
      item: closed,
      raisedImmediately: false,
      summary: summarizeWatchItem(closed),
    };
  }

  if (previousRepeatCount >= 2) {
    const closed: WatchItem = {
      ...item,
      status: 'closed',
      checks: updatedChecks,
    };
    return {
      item: closed,
      raisedImmediately: false,
      summary: summarizeWatchItem(closed),
    };
  }

  const zone = extractZoneSuffix(item.createdAt);
  const dueAt72h: Stamp = `${addDays(item.createdAt.slice(0, 10), 3)}T09:00:00${zone}`;
  return {
    item: {
      ...item,
      dueAt: dueAt72h,
      checks: updatedChecks,
    },
    raisedImmediately: false,
    summary: null,
  };
}
