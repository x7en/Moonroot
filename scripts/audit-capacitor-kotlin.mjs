import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const expectedKotlinVersion = '2.0.21';
const rootBuildGradle = readFileSync(resolve(repoRoot, 'android/build.gradle'), 'utf8');
const rootVersionMatch = rootBuildGradle.match(/ext\.kotlin_version\s*=\s*(['"])([^'"]+)\1/);

if (!rootVersionMatch) {
  throw new Error('android/build.gradle must declare ext.kotlin_version explicitly.');
}

const rootKotlinVersion = rootVersionMatch[2];
if (rootKotlinVersion !== expectedKotlinVersion) {
  throw new Error(
    `Expected root Kotlin ${expectedKotlinVersion}, found ${rootKotlinVersion ?? 'none'}.`,
  );
}

if (
  !/subprojects\s*\{[\s\S]*?project\.ext\.set\(\s*['"]kotlin_version['"]\s*,\s*rootProject\.ext\.kotlin_version\s*\)/.test(
    rootBuildGradle,
  )
) {
  throw new Error('Capacitor subprojects must inherit rootProject.ext.kotlin_version.');
}

const plugins = ['filesystem', 'local-notifications'];
for (const plugin of plugins) {
  const gradlePath = resolve(
    repoRoot,
    `node_modules/@capacitor/${plugin}/android/build.gradle`,
  );
  const gradleText = readFileSync(gradlePath, 'utf8');
  const literalOverrides = [...gradleText.matchAll(/\bext\.kotlin_version\s*=\s*(['"])([^'"]+)\1/g)]
    .map((match) => match[2])
    .filter((version) => version !== rootKotlinVersion);

  if (literalOverrides.length > 0) {
    throw new Error(
      `@capacitor/${plugin} hardcodes Kotlin ${literalOverrides.join(', ')} instead of ${rootKotlinVersion}.`,
    );
  }

  const inheritsRootVersion =
    /\bext\.kotlin_version\s*=\s*project\.hasProperty\(\s*['"]kotlin_version['"]\s*\)\s*\?\s*rootProject\.ext\.kotlin_version\b/.test(
      gradleText,
    );
  if (!inheritsRootVersion) {
    throw new Error(
      `@capacitor/${plugin} must use rootProject.ext.kotlin_version when kotlin_version is supplied.`,
    );
  }
}

console.log(
  `Kotlin audit passed: @capacitor/filesystem and @capacitor/local-notifications inherit root Kotlin ${rootKotlinVersion}; no conflicting literal overrides found.`,
);
