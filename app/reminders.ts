import { diffDays } from '../core/model/dates';
import type { DateKey, Profile } from '../core/model/types';

export const REMINDER_CHANNEL_ID = 'reminders';
export const REMINDER_CHANNEL_NAME = 'Reminders';
export const DAILY_REMINDER_ID = 1001;
export const WATCHLIST_REMINDER_ID = 1002;
export const REMINDER_TITLE = 'Moonroot';
export const REMINDER_BODY = 'Moonroot: a quick check-in?';
export const MAX_IGNORED_BEFORE_WEEKLY = 3;

export interface ReminderTrackerState {
  ignoredStreak: number;
  lastPromptDate: DateKey | null;
  lastCheckInDate: DateKey | null;
}

export interface ScheduledReminderSpec {
  readonly id: number;
  readonly channelId: string;
  readonly title: string;
  readonly body: string;
  readonly every: 'day' | 'week';
  readonly hour: number;
  readonly minute: number;
  readonly weekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly isExactNotification: false;
  readonly allowWhileIdle: false;
}

export interface ReminderPlan {
  readonly cadence: 'none' | 'daily' | 'weekly';
  readonly adjustedForQuietHours: boolean;
  readonly effectiveTime: string;
  readonly droppedToWeekly: boolean;
  readonly notifications: readonly ScheduledReminderSpec[];
}

function parseHhMm(raw: string, fallbackHour = 20, fallbackMin = 0): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return { hour: fallbackHour, minute: fallbackMin };
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return { hour: fallbackHour, minute: fallbackMin };
  }
  return { hour: h, minute: m };
}

function formatHhMm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isTimeInQuietHours(hhmm: string, quietFrom: string, quietTo: string): boolean {
  const t = parseHhMm(hhmm);
  const qf = parseHhMm(quietFrom, 22, 0);
  const qt = parseHhMm(quietTo, 8, 0);

  const tMin = t.hour * 60 + t.minute;
  const fMin = qf.hour * 60 + qf.minute;
  const toMin = qt.hour * 60 + qt.minute;

  if (fMin === toMin) return false;
  if (fMin < toMin) {
    return tMin >= fMin && tMin < toMin;
  }
  return tMin >= fMin || tMin < toMin;
}

export function resolveEffectiveReminderTime(
  preferredTime: string,
  quietFrom: string,
  quietTo: string,
): { hour: number; minute: number; adjustedForQuietHours: boolean; effectiveTime: string } {
  const pref = parseHhMm(preferredTime, 20, 0);
  const prefStr = formatHhMm(pref.hour, pref.minute);
  if (!isTimeInQuietHours(prefStr, quietFrom, quietTo)) {
    return { ...pref, adjustedForQuietHours: false, effectiveTime: prefStr };
  }
  const qt = parseHhMm(quietTo, 8, 0);
  return {
    hour: qt.hour,
    minute: qt.minute,
    adjustedForQuietHours: true,
    effectiveTime: formatHhMm(qt.hour, qt.minute),
  };
}

export function defaultReminderTracker(): ReminderTrackerState {
  return {
    ignoredStreak: 0,
    lastPromptDate: null,
    lastCheckInDate: null,
  };
}

export function reconcileDeliveredReminders(
  prev: ReminderTrackerState,
  deliveredCount: number,
): ReminderTrackerState {
  if (deliveredCount <= prev.ignoredStreak) return prev;
  return {
    ...prev,
    ignoredStreak: Math.min(30, deliveredCount),
  };
}

export function advanceReminderTracker(
  prev: ReminderTrackerState,
  today: DateKey,
  options: {
    hasCheckInToday: boolean;
    reminderEnabled: boolean;
  },
): ReminderTrackerState {
  if (options.hasCheckInToday) {
    return {
      ignoredStreak: 0,
      lastPromptDate: today,
      lastCheckInDate: today,
    };
  }
  if (!options.reminderEnabled) {
    return prev;
  }
  if (prev.lastPromptDate === null) {
    return {
      ...prev,
      lastPromptDate: today,
    };
  }
  if (prev.lastPromptDate >= today) {
    return prev;
  }
  const gapDays = Math.max(0, diffDays(prev.lastPromptDate, today));
  const checkInRecent =
    prev.lastCheckInDate !== null && prev.lastCheckInDate >= prev.lastPromptDate;
  const nextIgnored = checkInRecent
    ? Math.max(0, gapDays - 1)
    : prev.ignoredStreak + gapDays;

  return {
    ignoredStreak: Math.min(30, nextIgnored),
    lastPromptDate: today,
    lastCheckInDate: prev.lastCheckInDate,
  };
}

function capacitorWeekdayFromDateKey(date: DateKey): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = date.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  // Capacitor Weekday enum: Sunday = 1 .. Saturday = 7
  return (utcDay + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function computeReminderPlan(input: {
  today: DateKey;
  profile: Profile;
  hasOpenWatchItem: boolean;
  tracker: ReminderTrackerState;
}): ReminderPlan {
  const { today, profile, hasOpenWatchItem, tracker } = input;
  const dailyOn = profile.reminders.daily.on;
  const watchPingOn = profile.reminders.watchlist && hasOpenWatchItem;

  const resolved = resolveEffectiveReminderTime(
    profile.reminders.daily.time,
    profile.reminders.quietFrom,
    profile.reminders.quietTo,
  );

  if (!dailyOn && !watchPingOn) {
    return {
      cadence: 'none',
      adjustedForQuietHours: resolved.adjustedForQuietHours,
      effectiveTime: resolved.effectiveTime,
      droppedToWeekly: false,
      notifications: [],
    };
  }

  const droppedToWeekly = dailyOn && tracker.ignoredStreak >= MAX_IGNORED_BEFORE_WEEKLY;

  // Enforce at most 1 notification per day: if daily reminder is active, no separate second ping is scheduled.
  if (dailyOn) {
    const weekday = capacitorWeekdayFromDateKey(today);
    return {
      cadence: droppedToWeekly ? 'weekly' : 'daily',
      adjustedForQuietHours: resolved.adjustedForQuietHours,
      effectiveTime: resolved.effectiveTime,
      droppedToWeekly,
      notifications: [
        {
          id: DAILY_REMINDER_ID,
          channelId: REMINDER_CHANNEL_ID,
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          every: droppedToWeekly ? 'week' : 'day',
          hour: resolved.hour,
          minute: resolved.minute,
          ...(droppedToWeekly ? { weekday } : {}),
          isExactNotification: false,
          allowWhileIdle: false,
        },
      ],
    };
  }

  // Watch-list reminder only (daily reminder is off), max 1/day, outside quiet hours, zero health words
  return {
    cadence: 'daily',
    adjustedForQuietHours: resolved.adjustedForQuietHours,
    effectiveTime: resolved.effectiveTime,
    droppedToWeekly: false,
    notifications: [
      {
        id: WATCHLIST_REMINDER_ID,
        channelId: REMINDER_CHANNEL_ID,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        every: 'day',
        hour: resolved.hour,
        minute: resolved.minute,
        isExactNotification: false,
        allowWhileIdle: false,
      },
    ],
  };
}
