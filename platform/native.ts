import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import {
  DAILY_REMINDER_ID,
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
  WATCHLIST_REMINDER_ID,
  type ReminderPlan,
} from '../app/reminders';
import type { CompanionStage, SproutMood } from '../core/model/types';

interface WidgetBridgePlugin {
  setState(options: { stage: number; mood: string; accent: string }): Promise<void>;
}

interface MoonrootPrivacyPlugin {
  setScreenPrivacy(options: { enabled: boolean }): Promise<void>;
  setDiscreetLauncher(options: { enabled: boolean }): Promise<void>;
  isDiscreetLauncher(): Promise<{ enabled: boolean }>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
const MoonrootPrivacy = registerPlugin<MoonrootPrivacyPlugin>('MoonrootPrivacy');

const DOCUMENTS_FOLDER = 'Moonroot';
const AUTO_BACKUP_PREFIX = 'moonroot-auto-backup-';

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function triggerNativeHaptic(kind: 'light' | 'medium'): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await Haptics.impact({
      style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch {
    // Graceful no-op if haptics hardware unavailable
  }
}

export async function saveExportToDocuments(filename: string, content: string): Promise<string | null> {
  if (!isNativeAndroid()) return null;
  const result = await Filesystem.writeFile({
    path: `${DOCUMENTS_FOLDER}/${filename}`,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return result.uri;
}

export async function shareOrSaveNativeFile(filename: string, content: string): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  const uri = await saveExportToDocuments(filename, content);
  if (!uri) return false;
  try {
    await Share.share({
      title: filename,
      files: [uri],
      dialogTitle: filename,
    });
  } catch {
    // User dismissed share sheet; file remains safely saved in Documents/Moonroot
  }
  return true;
}

export async function writeAutoBackupToDocuments(
  dateKey: string,
  json: string,
  keepCount = 4,
): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  const filename = `${AUTO_BACKUP_PREFIX}${dateKey}.json`;
  await Filesystem.writeFile({
    path: `${DOCUMENTS_FOLDER}/${filename}`,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  try {
    const listed = await Filesystem.readdir({
      path: DOCUMENTS_FOLDER,
      directory: Directory.Documents,
    });
    const autoBackups = listed.files
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(AUTO_BACKUP_PREFIX) && name.endsWith('.json'))
      .sort()
      .reverse();

    for (const stale of autoBackups.slice(keepCount)) {
      await Filesystem.deleteFile({
        path: `${DOCUMENTS_FOLDER}/${stale}`,
        directory: Directory.Documents,
      });
    }
  } catch {
    // Best-effort pruning; new backup already written
  }
  return true;
}

export async function syncWidgetState(input: {
  stage: CompanionStage;
  mood: SproutMood;
  accent: string;
  discreetMode: boolean;
}): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await WidgetBridge.setState({
      stage: input.stage,
      mood: input.discreetMode ? 'discreet' : input.mood,
      accent: input.accent,
    });
  } catch {
    // Best-effort native widget update
  }
}

export async function syncScreenPrivacy(enabled: boolean): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await MoonrootPrivacy.setScreenPrivacy({ enabled });
  } catch {
    // Best-effort FLAG_SECURE update
  }
}

export async function setDiscreetLauncherIcon(enabled: boolean): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await MoonrootPrivacy.setDiscreetLauncher({ enabled });
  } catch {
    // Best-effort alias switch
  }
}

export async function getDiscreetLauncherIcon(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await MoonrootPrivacy.isDiscreetLauncher();
    return Boolean(res.enabled);
  } catch {
    return false;
  }
}

export async function ensureReminderChannel(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: REMINDER_CHANNEL_NAME,
      description: 'Gentle check-in reminders without private details',
      importance: 3,
      visibility: -1, // VISIBILITY_SECRET: hidden from lock screen
      vibration: false,
    });
  } catch {
    // Ignore channel errors on unsupported environments
  }
}

export async function requestNativeNotificationPermission(): Promise<'granted' | 'denied' | 'web'> {
  if (!isNativeAndroid()) return 'web';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      await ensureReminderChannel();
      return 'granted';
    }
    const requested = await LocalNotifications.requestPermissions();
    if (requested.display === 'granted') {
      await ensureReminderChannel();
      return 'granted';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function getDeliveredReminderCount(): Promise<number> {
  if (!isNativeAndroid()) return 0;
  try {
    const res = await LocalNotifications.getDeliveredNotifications();
    return res.notifications.filter(
      (n) => n.id === DAILY_REMINDER_ID || n.id === WATCHLIST_REMINDER_ID,
    ).length;
  } catch {
    return 0;
  }
}

export async function clearDeliveredReminders(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await LocalNotifications.removeAllDeliveredNotifications();
  } catch {
    // Ignore
  }
}

export async function applyNativeReminderPlan(plan: ReminderPlan): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_REMINDER_ID }, { id: WATCHLIST_REMINDER_ID }],
    });
    if (plan.notifications.length === 0) return;

    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== 'granted') return;

    await ensureReminderChannel();
    await LocalNotifications.schedule({
      notifications: plan.notifications.map((spec) => ({
        id: spec.id,
        title: spec.title,
        body: spec.body,
        channelId: spec.channelId,
        smallIcon: 'ic_stat_moonroot',
        isExactNotification: false,
        schedule: {
          on:
            spec.every === 'week' && spec.weekday
              ? { weekday: spec.weekday, hour: spec.hour, minute: spec.minute }
              : { hour: spec.hour, minute: spec.minute },
          allowWhileIdle: false,
        },
      })),
    });
  } catch {
    // Graceful no-op when notifications unavailable
  }
}

export async function registerCheckInDeepLink(onCheckIn: () => void): Promise<() => void> {
  if (!isNativeAndroid()) return () => {};
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url?.startsWith('moonroot://checkin')) {
      onCheckIn();
    }
    const handle = await App.addListener('appUrlOpen', ({ url }) => {
      if (url.startsWith('moonroot://checkin')) {
        onCheckIn();
      }
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
