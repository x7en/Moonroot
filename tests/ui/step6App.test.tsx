// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDefaultProfile, MoonrootStore } from '../../app/store';
import { ASK_QUESTIONS } from '../../core/ask/ask';
import { addDays } from '../../core/model/dates';
import type { BodyLog, DayLog, MedicineEntry, Profile, Verdict } from '../../core/model/types';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';

async function runAxeNoSeriousOrCritical(container: Element): Promise<void> {
  const result = await axe.run(container as axe.ElementContext, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  const seriousOrCritical = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(seriousOrCritical).toEqual([]);
  expect(result.violations).toEqual([]);
}

function makeDay(date: string, overrides: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    pain: { level: 0, sites: [] },
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T10:00:00+00:00`,
    ...overrides,
  };
}

describe('Step 6 Visual polish, Graphs, Ask your record, Empty states, and Accessibility pass', () => {
  let dbName: string;
  let store: MoonrootStore;

  beforeEach(async () => {
    dbName = `moonroot-step6-${Math.random().toString(36).slice(2)}`;
    const { IndexedDBStorage } = await import('../../data/idb');
    store = new MoonrootStore(new IndexedDBStorage(dbName));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    document.documentElement.style.fontSize = '';
    cleanup();
    await store.storage.close();
    await new Promise<void>((resolveDb) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolveDb();
      req.onerror = () => resolveDb();
      req.onblocked = () => resolveDb();
    });
  });

  it('shows honest Day-One empty states across Today, Cycle, and Body without fake sample data', async () => {
    const nowIso = getLocalStamp();
    const profile: Profile = {
      ...makeDefaultProfile(nowIso),
      birthYear: 1998,
      menarcheAge: 13,
      disclaimerAcceptedAt: nowIso,
    };
    expect(profile.sound).toBe(false);
    await store.storage.saveProfile(profile);

    const { container } = render(<App initialStore={store} />);
    await screen.findByText(/Log your first period to start\. Confidence starts at 10%/i);
    expect(screen.getByText(/Seed/i)).toBeTruthy();

    // No charts on Today
    expect(container.querySelectorAll('.graph-svg').length).toBe(0);

    // Cycle empty state -> 10% + Log your first period to start + zero SVGs
    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    await screen.findByText('Log your first period to start.');
    expect(screen.getByText('10%')).toBeTruthy();
    expect(container.querySelectorAll('svg').length).toBe(0);

    // Body empty state -> honest unlock message (0 of 14+), zero chart SVGs
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    await screen.findByText(/At least 14 non-bleeding days/i);
    expect(container.querySelectorAll('svg:not(.sprout-svg)').length).toBe(0);

    // Sound is off by default in Settings
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const soundBox = (await screen.findByLabelText('Gentle sounds')) as HTMLInputElement;
    expect(soundBox.checked).toBe(false);
  });

  it('proves no chart renders until Graphs is tapped, opens Graphs from Cycle/Body/Record, and renders unlocked lifestyle visuals only when unlocked', async () => {
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    const profile: Profile = {
      ...makeDefaultProfile(nowIso),
      birthYear: 1996,
      menarcheAge: 13,
      sproutName: 'Fern',
      disclaimerAcceptedAt: nowIso,
    };
    await store.storage.saveProfile(profile);

    // 3 completed cycles + current start so Forecast ribbon & Cycle bars populate
    const starts = [addDays(today, -95), addDays(today, -65), addDays(today, -33), addDays(today, -2)];
    for (const s of starts) {
      for (let d = 0; d < 4; d += 1) {
        const dt = addDays(s, d);
        if (dt <= today) {
          await store.storage.saveDayLog(
            makeDay(dt, {
              flow: d === 0 ? 'heavy' : d === 1 ? 'medium' : 'light',
              pain: { level: d === 0 ? 5 : 1, sites: ['lower-middle'] },
            }),
          );
        }
      }
    }

    const med: MedicineEntry = {
      id: 'med-g-1',
      date: today,
      kind: 'dose',
      category: 'pain-relief',
      nameShown: 'Ponstan',
      genericName: 'mefenamic acid',
      strengthMg: 250,
      units: 2,
      note: '',
      updatedAt: nowIso,
    };
    await store.storage.saveMedicine(med);

    const { container } = render(<App initialStore={store} />);
    await screen.findByText('Nothing flagged');

    // Today has only Sprout illustration + 28x20 FlowGlyph button icons, ZERO chart SVGs
    expect(container.querySelectorAll('.graph-svg').length).toBe(0);
    expect(container.querySelectorAll('svg[role="img"]:not(.sprout-svg)').length).toBe(0);

    // Cycle has ZERO SVGs before tapping Graphs
    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    await screen.findByText(/Next period in words/i);
    expect(container.querySelectorAll('svg').length).toBe(0);

    // Tap Graphs from Cycle -> draws hand-drawn SVG charts
    fireEvent.click(screen.getByRole('button', { name: 'Graphs' }));
    await screen.findByRole('region', { name: 'Confidence arc graph' });
    expect(screen.getByRole('region', { name: 'Forecast ribbon graph' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Cycle bars graph' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Timeline visual graph' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Medicine by week graph' })).toBeTruthy();
    // Lifestyle patterns NOT unlocked yet -> shows unlock status card, no pattern chart SVG
    expect(screen.getByRole('region', { name: 'Lifestyle patterns unlock status' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Lifestyle pattern visuals' })).toBeNull();
    expect(container.querySelectorAll('svg.graph-svg').length).toBe(5);

    // Back returns to Cycle cleanly with zero SVGs again
    fireEvent.click(screen.getByRole('button', { name: 'Back to Cycle' }));
    await screen.findByText(/Next period in words/i);
    expect(container.querySelectorAll('svg').length).toBe(0);

    // Open from Body & Record as well
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    expect(container.querySelectorAll('svg.graph-svg').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Graphs' }));
    await screen.findByRole('button', { name: 'Back to Body' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Body' }));

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(container.querySelectorAll('svg').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Graphs' }));
    await screen.findByRole('button', { name: 'Back to Record' });
    expect(screen.queryByRole('region', { name: 'Lifestyle pattern visuals' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Record' }));

    // Unlock a real lifestyle pattern (within 60d expiry window: flow-free intervals [-59..-35] and [-28..-4])
    const windows = [
      { start: -59, end: -35 },
      { start: -28, end: -4 },
    ];
    for (const w of windows) {
      for (let offset = w.start; offset <= w.end; offset += 1) {
        const dt = addDays(today, offset);
        const idx = offset - w.start;
        const isShort = idx % 2 === 0;
        const prevWasShort = idx > 0 && (idx - 1) % 2 === 0;
        await store.storage.saveDayLog(
          makeDay(dt, {
            flow: 'none',
            pain: { level: prevWasShort ? 6 : 0, sites: prevWasShort ? ['lower-middle'] : [] },
            symptoms: prevWasShort ? ['cramps'] : [],
          }),
        );
        await store.storage.saveBodyLog({
          date: dt,
          sleep: { hours: isShort ? 5 : 8, quality: isShort ? 1 : 3 },
          updatedAt: nowIso,
        });
      }
    }
    await store.init();

    fireEvent.click(screen.getByRole('button', { name: 'Graphs' }));
    await screen.findByRole('region', { name: 'Lifestyle pattern visuals' });
    expect(container.querySelectorAll('svg.graph-svg').length).toBeGreaterThanOrEqual(6);
  });

  it('runs all 10 fixed Ask questions against fixture data with zero free-text inputs', async () => {
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    const profile: Profile = {
      ...makeDefaultProfile(nowIso),
      birthYear: 1995,
      menarcheAge: 13,
      disclaimerAcceptedAt: nowIso,
    };
    await store.storage.saveProfile(profile);

    const starts = [addDays(today, -92), addDays(today, -62), addDays(today, -32), addDays(today, -2)];
    for (const s of starts) {
      await store.storage.saveDayLog(makeDay(s, { flow: 'medium', pain: { level: 4, sites: ['lower-middle'] } }));
      await store.storage.saveDayLog(makeDay(addDays(s, 1), { flow: 'heavy', pain: { level: 5, sites: ['lower-middle'] } }));
      await store.storage.saveDayLog(makeDay(addDays(s, 2), { flow: 'light' }));
    }

    const body: BodyLog = {
      date: today,
      sleep: { hours: 8, quality: 3 },
      water: { ml: 1500 },
      updatedAt: nowIso,
    };
    await store.storage.saveBodyLog(body);

    const med: MedicineEntry = {
      id: 'med-ask-1',
      date: today,
      kind: 'dose',
      category: 'pain-relief',
      nameShown: 'Ponstan',
      genericName: 'mefenamic acid',
      strengthMg: 250,
      units: 2,
      note: '',
      updatedAt: nowIso,
    };
    await store.storage.saveMedicine(med);

    const verdict: Verdict = {
      id: 'v-ask-1',
      at: nowIso,
      kind: 'today',
      level: 'yellow',
      ruleIds: ['YEL-07'],
      title: 'Keep watching',
      reasons: ['Because you logged changing every 2 to 3 hours.'],
      rulesetVersion: '1.0',
    };
    await store.storage.saveVerdict(verdict);

    const { container } = render(<App initialStore={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask your record' }));
    await screen.findByRole('region', { name: 'Questions list' });

    // Strictly zero text inputs or textareas on Ask screen (non-conversational)
    expect(container.querySelectorAll('input, textarea, select').length).toBe(0);

    const qButtons = within(screen.getByRole('region', { name: 'Questions list' })).getAllByRole('button');
    expect(qButtons).toHaveLength(10);

    for (let i = 0; i < ASK_QUESTIONS.length; i += 1) {
      const q = ASK_QUESTIONS[i];
      const btn = qButtons[i];
      if (!q || !btn) throw new Error(`Missing question/button at index ${i}`);
      fireEvent.click(btn);
      const answerRegion = await screen.findByRole('region', { name: 'Answer' });
      expect(answerRegion.textContent).toContain(q.question);
      expect(answerRegion.textContent).toContain('Date range:');
    }

    // Verify specific fixture values inside answers
    const q0 = qButtons[0];
    const q1 = qButtons[1];
    const q3 = qButtons[3];
    if (!q0 || !q1 || !q3) throw new Error('Missing expected Ask buttons');
    fireEvent.click(q0); // medicines this week
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain('mefenamic acid');
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain(
      'Check the pack for the daily limit',
    );
    fireEvent.click(q1); // last period and day
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain(addDays(today, -2));
    fireEvent.click(q3); // flagged lately
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain('Keep watching');
  });

  it('passes axe across Dusk, Dawn, and High contrast, verifies 200% phone layout rules, sound default-off & toggle, haptics, and reduced-motion stage-up rules', async () => {
    const nowIso = getLocalStamp();
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrateMock,
    });

    const profile: Profile = {
      ...makeDefaultProfile(nowIso),
      birthYear: 1998,
      menarcheAge: 13,
      theme: 'dusk',
      haptics: true,
      sound: false,
      disclaimerAcceptedAt: nowIso,
    };
    await store.storage.saveProfile(profile);

    const { container } = render(<App initialStore={store} />);
    await screen.findByText(/Ready for today's check-in/i);

    // Light haptic triggers on flow tap when haptics enabled & reduced motion off
    const noneFlowBtn = screen.getByRole('button', { name: /No flow, 0 of 3 drops/i });
    expect(noneFlowBtn.getAttribute('aria-label')).toContain('0 of 3 drops');
    fireEvent.click(noneFlowBtn);
    await waitFor(() => expect(vibrateMock).toHaveBeenCalledWith(10));

    // Check axe across Dusk, Dawn, and High contrast across main tabs + Graphs + Ask + Settings
    for (const theme of ['dusk', 'dawn', 'high-contrast'] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      const themeLabel =
        theme === 'dusk' ? 'Dusk (night)' : theme === 'dawn' ? 'Dawn (day)' : 'High contrast';
      fireEvent.click(await screen.findByRole('button', { name: themeLabel }));
      await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe(theme));
      await runAxeNoSeriousOrCritical(container);

      fireEvent.click(screen.getByRole('button', { name: 'Today' }));
      await runAxeNoSeriousOrCritical(container);

      fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
      await runAxeNoSeriousOrCritical(container);
      fireEvent.click(screen.getByRole('button', { name: 'Graphs' }));
      await runAxeNoSeriousOrCritical(container);
      // Verify every graph SVG has an accessible name
      for (const svg of container.querySelectorAll('svg.graph-svg')) {
        expect(svg.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(10);
      }
      fireEvent.click(screen.getByRole('button', { name: 'Back to Cycle' }));

      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await runAxeNoSeriousOrCritical(container);
      fireEvent.click(screen.getByRole('button', { name: 'Ask your record' }));
      await runAxeNoSeriousOrCritical(container);
      fireEvent.click(screen.getByRole('button', { name: 'Back to Record' }));

      fireEvent.click(screen.getByRole('button', { name: 'Body' }));
      await runAxeNoSeriousOrCritical(container);
    }

    // Verify 200% font scaling & 360px phone safety rules exist in stylesheets and zero fixed-width non-wrapping tables clip
    const baseCss = readFileSync(resolve(process.cwd(), 'ui/styles/base.css'), 'utf8');
    const tokensCss = readFileSync(resolve(process.cwd(), 'ui/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--dur-fast: 120ms');
    expect(tokensCss).toContain('--dur-mid: 200ms');
    expect(tokensCss).toContain('--dur-slow: 320ms');
    expect(tokensCss).toContain('--ease-out: cubic-bezier(0, 0, 0.2, 1)');
    expect(baseCss).toContain('min-height: 48px');
    expect(baseCss).toContain('outline: 2px solid var(--lamp)');
    expect(baseCss).toContain('sproutReducedStageUp 200ms ease-out 1');
    expect(baseCss).toContain('overflow-x: hidden');
    expect(baseCss).toContain('overflow-wrap: anywhere');
    expect(baseCss).toContain('white-space: normal');

    // Every rendered interactive button has a real accessible name even at 200% text scaling
    document.documentElement.style.fontSize = '32px';
    for (const btn of container.querySelectorAll('button')) {
      const label = btn.getAttribute('aria-label') || btn.textContent?.trim() || '';
      expect(label.length).toBeGreaterThan(0);
    }

    // Sound is OFF by default and can be toggled on cleanly; Reduce motion disables haptics
    vibrateMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const soundCheck = (await screen.findByLabelText('Gentle sounds')) as HTMLInputElement;
    expect(soundCheck.checked).toBe(false);
    fireEvent.click(soundCheck);
    await waitFor(() => expect(store.snapshot.profile?.sound).toBe(true));

    fireEvent.click(screen.getByLabelText('Reduce motion'));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('button', { name: /No flow, 0 of 3 drops/i }));
    await waitFor(() => expect(store.snapshot.dayLogs.length).toBeGreaterThanOrEqual(1));
    expect(vibrateMock).not.toHaveBeenCalled();
  });
});
