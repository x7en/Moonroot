import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  isNative: true,
  platform: 'android',
  widgetSetState: vi.fn(async () => {}),
  setScreenPrivacy: vi.fn(async () => {}),
  setDiscreetLauncher: vi.fn(async () => {}),
  isDiscreetLauncher: vi.fn(async () => ({ enabled: false })),
  createChannel: vi.fn(async () => {}),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  getDeliveredNotifications: vi.fn(async () => ({ notifications: [] as Array<{ id: number }> })),
  removeAllDeliveredNotifications: vi.fn(async () => {}),
  writeFile: vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///Documents/${path}` })),
  readdir: vi.fn(async () => ({
    files: [
      { name: 'moonroot-auto-backup-2026-11-08.json' },
      { name: 'moonroot-auto-backup-2026-11-01.json' },
      { name: 'moonroot-auto-backup-2026-10-25.json' },
      { name: 'moonroot-auto-backup-2026-10-18.json' },
      { name: 'moonroot-auto-backup-2026-10-11.json' },
    ],
  })),
  deleteFile: vi.fn(async () => {}),
  share: vi.fn(async () => {}),
  getLaunchUrl: vi.fn(async () => null as { url: string } | null),
  addUrlListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativeMocks.isNative,
    getPlatform: () => nativeMocks.platform,
  },
  registerPlugin: (name: string) => {
    if (name === 'WidgetBridge') {
      return { setState: nativeMocks.widgetSetState };
    }
    return {
      setScreenPrivacy: nativeMocks.setScreenPrivacy,
      setDiscreetLauncher: nativeMocks.setDiscreetLauncher,
      isDiscreetLauncher: nativeMocks.isDiscreetLauncher,
    };
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: nativeMocks.createChannel,
    checkPermissions: nativeMocks.checkPermissions,
    requestPermissions: nativeMocks.requestPermissions,
    schedule: nativeMocks.schedule,
    cancel: nativeMocks.cancel,
    getDeliveredNotifications: nativeMocks.getDeliveredNotifications,
    removeAllDeliveredNotifications: nativeMocks.removeAllDeliveredNotifications,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: nativeMocks.writeFile,
    readdir: nativeMocks.readdir,
    deleteFile: nativeMocks.deleteFile,
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: nativeMocks.share },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: nativeMocks.getLaunchUrl,
    addListener: nativeMocks.addUrlListener,
  },
}));

vi.mock('@capacitor/haptics', () => ({
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
  Haptics: { impact: vi.fn(async () => {}) },
}));

import {
  advanceReminderTracker,
  computeReminderPlan,
  defaultReminderTracker,
  isTimeInQuietHours,
  reconcileDeliveredReminders,
  REMINDER_BODY,
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
  REMINDER_TITLE,
  resolveEffectiveReminderTime,
} from '../../app/reminders';
import { buildStageVectorPaths } from '../../core/companion/sproutArt';
import type { CompanionStage, Profile } from '../../core/model/types';
import {
  applyNativeReminderPlan,
  registerCheckInDeepLink,
  syncWidgetState,
  writeAutoBackupToDocuments,
} from '../../platform/native';

function makeTestProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    schemaVersion: 1,
    createdAt: '2026-10-01T08:00:00+00:00',
    birthYear: 1998,
    menarcheAge: 13,
    selfRegularity: 'regular',
    lastPeriodApprox: '2026-10-15',
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'prefer-not-to-say',
    conditionsNote: '',
    medicationsNote: '',
    sproutName: null,
    theme: 'dusk',
    units: { temperature: 'C', water: 'ml' },
    reminders: {
      daily: { on: true, time: '20:00' },
      watchlist: true,
      quietFrom: '22:00',
      quietTo: '08:00',
    },
    discreetMode: true,
    lock: { type: 'none' },
    locale: 'en',
    region: 'PK',
    disclaimerAcceptedAt: '2026-10-01T08:00:00+00:00',
    ...overrides,
  };
}

describe('Step 7 reminders scheduler', () => {
  it('detects overnight and same-day quiet hours accurately', () => {
    expect(isTimeInQuietHours('23:15', '22:00', '08:00')).toBe(true);
    expect(isTimeInQuietHours('07:59', '22:00', '08:00')).toBe(true);
    expect(isTimeInQuietHours('08:00', '22:00', '08:00')).toBe(false);
    expect(isTimeInQuietHours('21:59', '22:00', '08:00')).toBe(false);
    expect(isTimeInQuietHours('14:00', '13:00', '15:00')).toBe(true);
    expect(isTimeInQuietHours('16:00', '13:00', '15:00')).toBe(false);
  });

  it('clamps reminder time outside quiet hours', () => {
    const clamped = resolveEffectiveReminderTime('23:30', '22:00', '08:00');
    expect(clamped).toEqual({
      hour: 8,
      minute: 0,
      adjustedForQuietHours: true,
      effectiveTime: '08:00',
    });

    const unadjusted = resolveEffectiveReminderTime('20:15', '22:00', '08:00');
    expect(unadjusted).toEqual({
      hour: 20,
      minute: 15,
      adjustedForQuietHours: false,
      effectiveTime: '20:15',
    });
  });

  it('schedules at most 1 notification per day with discreet copy and inexact alarm flags', () => {
    const plan = computeReminderPlan({
      today: '2026-11-08',
      profile: makeTestProfile(),
      hasOpenWatchItem: true,
      tracker: defaultReminderTracker(),
    });

    expect(plan.cadence).toBe('daily');
    expect(plan.notifications).toHaveLength(1);
    const [n] = plan.notifications;
    if (!n) throw new Error('Expected one notification');
    expect(n.channelId).toBe(REMINDER_CHANNEL_ID);
    expect(REMINDER_CHANNEL_NAME).toBe('Reminders');
    expect(n.title).toBe('Moonroot');
    expect(n.body).toBe('Moonroot: a quick check-in?');
    expect(n.isExactNotification).toBe(false);
    expect(n.allowWhileIdle).toBe(false);
    expect(n.every).toBe('day');
    expect(`${n.title} ${n.body}`).not.toMatch(
      /period|flow|pain|cramp|spotting|pregnant|doctor|symptom|bleed|cycle|ovulation/i,
    );
  });

  it('allows watch-list follow-up ping only when daily reminder is off, still max 1/day and zero health words', () => {
    const profile = makeTestProfile({
      reminders: {
        daily: { on: false, time: '20:00' },
        watchlist: true,
        quietFrom: '22:00',
        quietTo: '08:00',
      },
    });

    const withOpenWatch = computeReminderPlan({
      today: '2026-11-08',
      profile,
      hasOpenWatchItem: true,
      tracker: defaultReminderTracker(),
    });
    expect(withOpenWatch.notifications).toHaveLength(1);
    expect(withOpenWatch.notifications[0]?.body).toBe(REMINDER_BODY);

    const noOpenWatch = computeReminderPlan({
      today: '2026-11-08',
      profile,
      hasOpenWatchItem: false,
      tracker: defaultReminderTracker(),
    });
    expect(noOpenWatch.notifications).toHaveLength(0);
    expect(noOpenWatch.cadence).toBe('none');
  });

  it('drops to weekly after 3 ignored reminders in a row and restores daily on check-in', () => {
    let tracker = defaultReminderTracker();
    tracker = advanceReminderTracker(tracker, '2026-11-01', {
      hasCheckInToday: false,
      reminderEnabled: true,
    });
    tracker = advanceReminderTracker(tracker, '2026-11-02', {
      hasCheckInToday: false,
      reminderEnabled: true,
    });
    tracker = advanceReminderTracker(tracker, '2026-11-03', {
      hasCheckInToday: false,
      reminderEnabled: true,
    });
    tracker = advanceReminderTracker(tracker, '2026-11-04', {
      hasCheckInToday: false,
      reminderEnabled: true,
    });
    expect(tracker.ignoredStreak).toBe(3);

    const weeklyPlan = computeReminderPlan({
      today: '2026-11-04',
      profile: makeTestProfile(),
      hasOpenWatchItem: false,
      tracker,
    });
    expect(weeklyPlan.droppedToWeekly).toBe(true);
    expect(weeklyPlan.cadence).toBe('weekly');
    const [weeklyNotif] = weeklyPlan.notifications;
    expect(weeklyNotif?.every).toBe('week');
    expect(weeklyNotif?.weekday).toBeGreaterThanOrEqual(1);
    expect(weeklyNotif?.weekday).toBeLessThanOrEqual(7);

    // Delivered count reconciliation also promotes ignoredStreak to 3
    const deliveredTracker = reconcileDeliveredReminders(defaultReminderTracker(), 3);
    expect(deliveredTracker.ignoredStreak).toBe(3);

    // Checking in resets back to daily
    const reset = advanceReminderTracker(tracker, '2026-11-05', {
      hasCheckInToday: true,
      reminderEnabled: true,
    });
    expect(reset.ignoredStreak).toBe(0);
    const dailyAgain = computeReminderPlan({
      today: '2026-11-05',
      profile: makeTestProfile(),
      hasOpenWatchItem: false,
      tracker: reset,
    });
    expect(dailyAgain.droppedToWeekly).toBe(false);
    expect(dailyAgain.cadence).toBe('daily');
  });
});

describe('Step 7 Capacitor native bridge & Android project checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.isNative = true;
    nativeMocks.platform = 'android';
  });

  it('syncWidgetState writes only stage, mood, accent and masks mood in discreet mode', async () => {
    await syncWidgetState({ stage: 4, mood: 'bright', accent: '#6AAEDB', discreetMode: false });
    expect(nativeMocks.widgetSetState).toHaveBeenLastCalledWith({
      stage: 4,
      mood: 'bright',
      accent: '#6AAEDB',
    });

    await syncWidgetState({ stage: 4, mood: 'bright', accent: '#6AAEDB', discreetMode: true });
    expect(nativeMocks.widgetSetState).toHaveBeenLastCalledWith({
      stage: 4,
      mood: 'discreet',
      accent: '#6AAEDB',
    });
  });

  it('applyNativeReminderPlan configures secret channel, inexact alarms, and zero schedule.every overwrite', async () => {
    const plan = computeReminderPlan({
      today: '2026-11-08',
      profile: makeTestProfile(),
      hasOpenWatchItem: false,
      tracker: defaultReminderTracker(),
    });
    await applyNativeReminderPlan(plan);

    expect(nativeMocks.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminders',
        name: 'Reminders',
        visibility: -1,
      }),
    );
    expect(nativeMocks.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          channelId: 'reminders',
          isExactNotification: false,
          schedule: {
            on: { hour: 20, minute: 0 },
            allowWhileIdle: false,
          },
        }),
      ],
    });
  });

  it('writeAutoBackupToDocuments keeps only the latest 4 weekly backups', async () => {
    const ok = await writeAutoBackupToDocuments('2026-11-08', '{"format":"moonroot-backup"}', 4);
    expect(ok).toBe(true);
    expect(nativeMocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'Moonroot/moonroot-auto-backup-2026-11-08.json',
        directory: 'DOCUMENTS',
      }),
    );
    expect(nativeMocks.deleteFile).toHaveBeenCalledTimes(1);
    expect(nativeMocks.deleteFile).toHaveBeenCalledWith({
      path: 'Moonroot/moonroot-auto-backup-2026-10-11.json',
      directory: 'DOCUMENTS',
    });
  });

  it('registerCheckInDeepLink handles moonroot://checkin URLs on launch and appUrlOpen', async () => {
    nativeMocks.getLaunchUrl.mockResolvedValueOnce({ url: 'moonroot://checkin' });
    const handler = vi.fn();
    const unsub = await registerCheckInDeepLink(handler);
    expect(handler).toHaveBeenCalledTimes(1);

    const listenerCall = nativeMocks.addUrlListener.mock.calls[0] as unknown as [
      string,
      (e: { url: string }) => void,
    ];
    expect(listenerCall[0]).toBe('appUrlOpen');
    listenerCall[1]({ url: 'moonroot://checkin' });
    expect(handler).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('verifies generated Android vector art, keystore, privacy manifest, and pinned GitHub Actions', () => {
    const root = process.cwd();
    const stages: CompanionStage[] = [0, 1, 2, 3, 4, 5, 6];
    for (const stage of stages) {
      const xml = readFileSync(
        resolve(root, `android/app/src/main/res/drawable/sprout_stage_${stage}.xml`),
        'utf8',
      );
      expect(xml).toContain('<vector');
      expect(xml).not.toMatch(/face|eye|mouth/i);
      expect(buildStageVectorPaths(stage).length).toBeGreaterThan(0);
    }

    const leafXml = readFileSync(
      resolve(root, 'android/app/src/main/res/drawable/ic_moonroot_leaf.xml'),
      'utf8',
    );
    expect(leafXml).toContain('<vector');

    expect(existsSync(resolve(root, 'android/app/moonroot-debug.keystore'))).toBe(true);
    expect(statSync(resolve(root, 'android/app/moonroot-debug.keystore')).size).toBeGreaterThan(500);

    const manifest = readFileSync(
      resolve(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android.permission.INTERNET');
    expect(manifest).toContain('tools:node="remove"');
    expect(manifest).toContain('.LauncherDefault');
    expect(manifest).toContain('.LauncherDiscreet');
    expect(manifest).toContain('.widget.MoonrootWidgetProvider');

    const widgetBackground = readFileSync(
      resolve(root, 'android/app/src/main/res/drawable/widget_bg.xml'),
      'utf8',
    );
    expect(widgetBackground).toContain('#CFD78C');
    expect(widgetBackground).toContain('#700143');
    const widgetButton = readFileSync(
      resolve(root, 'android/app/src/main/res/drawable/widget_btn_bg.xml'),
      'utf8',
    );
    expect(widgetButton).toContain('#700143');
    const launcherBackground = readFileSync(
      resolve(root, 'android/app/src/main/res/values/ic_launcher_background.xml'),
      'utf8',
    );
    expect(launcherBackground).toContain('#F9F6BD');
    expect(launcherBackground).toContain('#700143');

    const workflow = readFileSync(resolve(root, '.github/workflows/android.yml'), 'utf8');
    expect(workflow).toContain('actions/checkout@v4');
    expect(workflow).toContain('actions/setup-node@v4');
    expect(workflow).toContain('actions/setup-java@v4');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('-PversionCode=${{ github.run_number }}');
    expect(workflow).toContain('moonroot.apk');
  });
});
