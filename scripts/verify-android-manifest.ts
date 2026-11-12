import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const errors: string[] = [];

function mustExist(relPath: string): string {
  const full = resolve(root, relPath);
  if (!existsSync(full)) {
    errors.push(`Missing required file: ${relPath}`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

// 1. Source AndroidManifest.xml privacy & manifest assertions
const sourceManifest = mustExist('android/app/src/main/AndroidManifest.xml');
if (sourceManifest) {
  if (!/android:allowBackup="false"/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must declare android:allowBackup="false"');
  }
  if (!/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must declare android:dataExtractionRules="@xml/data_extraction_rules"');
  }
  if (!/android:fullBackupContent="@xml\/backup_rules"/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must declare android:fullBackupContent="@xml/backup_rules"');
  }
  if (
    !/<uses-permission[^>]*android:name="android\.permission\.INTERNET"[^>]*tools:node="remove"/.test(
      sourceManifest,
    )
  ) {
    errors.push('Source AndroidManifest.xml must explicitly remove android.permission.INTERNET');
  }
  if (
    !/<uses-permission[^>]*android:name="android\.permission\.SCHEDULE_EXACT_ALARM"[^>]*tools:node="remove"/.test(
      sourceManifest,
    )
  ) {
    errors.push('Source AndroidManifest.xml must explicitly remove SCHEDULE_EXACT_ALARM');
  }
  if (!/android:scheme="moonroot"/.test(sourceManifest) || !/android:host="checkin"/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must handle moonroot://checkin deep link');
  }
  if (!/\.LauncherDefault/.test(sourceManifest) || !/\.LauncherDiscreet/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must define .LauncherDefault and .LauncherDiscreet activity-aliases');
  }
  if (!/\.widget\.MoonrootWidgetProvider/.test(sourceManifest)) {
    errors.push('Source AndroidManifest.xml must declare .widget.MoonrootWidgetProvider');
  }
}

// 2. Backup rule XML assertions
const dataExtraction = mustExist('android/app/src/main/res/xml/data_extraction_rules.xml');
if (dataExtraction && (!dataExtraction.includes('<exclude domain="root"') || !dataExtraction.includes('<device-transfer>'))) {
  errors.push('data_extraction_rules.xml must exclude root/file/database/sharedpref/external for cloud-backup and device-transfer');
}

const backupRules = mustExist('android/app/src/main/res/xml/backup_rules.xml');
if (backupRules && !backupRules.includes('<exclude domain="root"')) {
  errors.push('backup_rules.xml must exclude root/file/database/sharedpref/external');
}

// 3. Keystore & versionCode build.gradle assertions
const keystorePath = resolve(root, 'android/app/moonroot-debug.keystore');
if (!existsSync(keystorePath) || statSync(keystorePath).size === 0) {
  errors.push('Missing committed android/app/moonroot-debug.keystore');
}

const appGradle = mustExist('android/app/build.gradle');
if (appGradle) {
  if (!appGradle.includes("project.findProperty('versionCode')")) {
    errors.push("android/app/build.gradle must read versionCode from project.findProperty('versionCode')");
  }
  if (!appGradle.includes("storeFile file('moonroot-debug.keystore')")) {
    errors.push("android/app/build.gradle must sign debug builds with file('moonroot-debug.keystore')");
  }
}

// 4. Merged manifest verification (runs in CI after `./gradlew assembleDebug`)
const mergedManifestCandidates = [
  'android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml',
  'android/app/build/intermediates/merged_manifest/debug/processDebugManifest/AndroidManifest.xml',
  'android/app/build/intermediates/merged_manifests/debug/AndroidManifest.xml',
];

let checkedBuiltManifest = false;
for (const relCandidate of mergedManifestCandidates) {
  const full = resolve(root, relCandidate);
  if (!existsSync(full)) continue;
  checkedBuiltManifest = true;
  const merged = readFileSync(full, 'utf8');

  if (!/android:allowBackup="false"/.test(merged) || /android:allowBackup="true"/.test(merged)) {
    errors.push(`Built merged manifest ${relCandidate} must set android:allowBackup="false"`);
  }
  if (/android\.permission\.INTERNET/.test(merged)) {
    errors.push(`Built merged manifest ${relCandidate} must not contain android.permission.INTERNET`);
  }
  if (/android\.permission\.SCHEDULE_EXACT_ALARM/.test(merged)) {
    errors.push(`Built merged manifest ${relCandidate} must not contain SCHEDULE_EXACT_ALARM`);
  }
}

// 5. Compiled APK manifest check via apkanalyzer / aapt2 when built APK + Android SDK exist
const apkPath = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (existsSync(apkPath)) {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    try {
      const aapt2 = execFileSync('sh', ['-c', `find "${sdkRoot}/build-tools" -name aapt2 | sort | tail -n 1`], {
        encoding: 'utf8',
      }).trim();
      if (aapt2) {
        const dumped = execFileSync(aapt2, ['dump', 'xmltree', apkPath, '--file', 'AndroidManifest.xml'], {
          encoding: 'utf8',
        });
        checkedBuiltManifest = true;
        if (/allowBackup.*=.*true/i.test(dumped) || !/allowBackup.*=.*false/i.test(dumped)) {
          errors.push('Compiled APK AndroidManifest.xml does not have allowBackup=false');
        }
        if (/android\.permission\.INTERNET/.test(dumped)) {
          errors.push('Compiled APK AndroidManifest.xml still includes android.permission.INTERNET');
        }
      }
    } catch (err) {
      errors.push(`Failed inspecting APK manifest with aapt2: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!checkedBuiltManifest) {
    errors.push('APK exists but no merged manifest or aapt2 binary was inspected.');
  }
}

// 6. Discreet widget / notification strings must contain zero health words
const healthWords = /\b(period|flow|pain|cramp|spotting|pregnant|pregnancy|doctor|symptom|bleed|blood|cycle|ovulation|fever|discharge)\b/i;
for (const widgetFile of [
  'android/app/src/main/res/values/strings.xml',
  'android/app/src/main/res/layout/moonroot_widget.xml',
  'android/app/src/main/res/xml/moonroot_widget_info.xml',
]) {
  const text = mustExist(widgetFile);
  if (text && healthWords.test(text)) {
    errors.push(`Health word detected in ${widgetFile}`);
  }
}

if (errors.length > 0) {
  console.error('Android verification failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(
  checkedBuiltManifest
    ? 'Android manifest & privacy verification passed (source + built manifest).'
    : 'Android manifest & privacy verification passed (source checks).',
);
