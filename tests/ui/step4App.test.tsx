// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MoonrootStore } from '../../app/store';
import { addDays } from '../../core/model/dates';
import type { Profile } from '../../core/model/types';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';

let activeStore: MoonrootStore | null = null;

async function clearMoonrootDb(): Promise<void> {
  if (activeStore) {
    await activeStore.storage.close();
    activeStore = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('moonroot');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function runAxe(container: Element): Promise<void> {
  const results = await axe.run(container as axe.ElementContext, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
}

function makeAdultProfile(nowIso: string): Profile {
  return {
    schemaVersion: 1,
    createdAt: nowIso,
    birthYear: 1998,
    menarcheAge: 13,
    selfRegularity: 'irregular',
    lastPeriodApprox: null,
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'active',
    conditionsNote: '',
    medicationsNote: '',
    sproutName: 'Fern',
    theme: 'dusk',
    units: { temperature: 'C', water: 'ml' },
    reminders: {
      daily: { on: false, time: '20:00' },
      watchlist: true,
      quietFrom: '22:00',
      quietTo: '08:00',
    },
    discreetMode: true,
    lock: { type: 'none' },
    locale: 'en',
    region: 'PK',
    disclaimerAcceptedAt: nowIso,
  };
}

describe('Step 4 Body tab, lifestyle patterns, ovulation UI, Ways to find out, and unit conversion', () => {
  beforeEach(async () => {
    await clearMoonrootDb();
  });

  afterEach(async () => {
    cleanup();
    await clearMoonrootDb();
  });

  it('logs Body metrics with plain numbers, switches water & temperature units, excludes disordered-eating targets, and passes axe', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    await store.init();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.saveProfile(makeAdultProfile(nowIso));

    const { container } = render(<App initialStore={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Body' }));
    await screen.findByRole('heading', { name: 'Sleep' });

    // Confirm Body tab avoids calories/weight/goal-bar dieting language
    const initialBodyText = document.body.textContent?.toLowerCase() ?? '';
    expect(initialBodyText).not.toContain('calorie');
    expect(initialBodyText).not.toContain('weight goal');

    // Log Sleep, Water (ml), Fasting today, Stool Bristol, Stress, Exercise, Energy, Skin
    fireEvent.click(screen.getByRole('button', { name: '7h' }));
    fireEvent.click(screen.getByRole('button', { name: '1500 ml' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fasting today' }));
    fireEvent.click(screen.getByRole('button', { name: '4 · smooth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stress 3 of 5' }));
    fireEvent.input(screen.getByLabelText('Exercise (minutes)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Energy 4 of 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mild' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shedding' }));

    await waitFor(() => {
      const b = store.getBodyLog(today);
      expect(b?.sleep?.hours).toBe(7);
      expect(b?.water?.ml).toBe(1500);
      expect(b?.meals?.tags).toContain('fasting');
      expect(b?.stool?.bristol).toBe(4);
      expect(b?.exercise?.minutes).toBe(25);
      expect(b?.energy).toBe(4);
      expect(b?.skin?.acne).toBe(1);
      expect(b?.skin?.hair).toBe('shedding');
      expect(store.getDayLog(today)?.context?.stress).toBe(3);
    });
    expect(document.body.textContent).toContain('Fasting days stay out of water and meal patterns.');
    await runAxe(container);

    // Switch units in Settings to F and glasses (250 ml)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: '°F' }));
    fireEvent.click(screen.getByRole('button', { name: 'glasses (250 ml)' }));

    // Log 6 glasses on Body -> stored as 1500 ml internally
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    await screen.findByRole('button', { name: '6 glasses' });
    fireEvent.click(screen.getByRole('button', { name: '10 glasses' }));
    await waitFor(() => {
      expect(store.getBodyLog(today)?.water?.ml).toBe(2500);
    });

    // Log Morning temperature in °F on Today -> converts and stores in °C internally
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const bbtInput = await screen.findByLabelText(/Morning temperature \(°F\)/i);
    fireEvent.input(bbtInput, { target: { value: '97.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'LH positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'egg-white' }));

    await waitFor(() => {
      const log = store.getDayLog(today);
      expect(log?.fertility?.bbt).toBeCloseTo(36.5, 1);
      expect(log?.fertility?.lh).toBe('positive');
      expect(log?.fertility?.mucus).toBe('egg-white');
    });
  });

  it('shows unlocked lifestyle patterns on Body, shows Ovulation card + Ways to find out on Cycle, and wires Body logs to Doctor File', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.storage.saveProfile(makeAdultProfile(nowIso));

    // Seed 2 confirmed past cycles + 1 confirmed open cycle + 36 non-bleeding sleep/pain days directly into storage before init
    const c1Start = addDays(today, -95);
    const c2Start = addDays(today, -67);
    const c3Start = addDays(today, -39);
    for (const s of [c1Start, c2Start, c3Start]) {
      await store.storage.saveDayLog({
        date: s,
        filledFrom: 'live',
        flow: 'medium',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
      await store.storage.saveDayLog({
        date: addDays(s, 1),
        filledFrom: 'live',
        flow: 'medium',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
      // Confirmed ovulation signals 14 days after start
      const ovDay = addDays(s, 14);
      await store.storage.saveDayLog({
        date: ovDay,
        filledFrom: 'live',
        flow: 'none',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        fertility: { lh: 'positive', mucus: 'egg-white' },
        note: '',
        updatedAt: nowIso,
      });
    }

    // 36 non-bleeding days inside open cycle [c3Start+2 .. today-1]
    for (let i = 0; i < 36; i += 1) {
      const date = addDays(today, -(36 - i));
      if (date <= addDays(c3Start, 1)) continue;
      const existing = await store.storage.getDayLog(date);
      const shortSleepToday = i % 2 === 0;
      const shortSleepPrev = i > 0 && (i - 1) % 2 === 0;
      await store.storage.saveDayLog({
        ...(existing ?? {
          date,
          filledFrom: 'live',
          flow: 'none',
          symptoms: [],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: nowIso,
        }),
        pain: { level: shortSleepPrev ? 4 : 1, sites: ['lower-middle'] },
        symptoms: shortSleepPrev ? ['cramps'] : [],
      });
      await store.storage.saveBodyLog({
        date,
        sleep: { hours: shortSleepToday ? 5 : 8, quality: shortSleepToday ? 1 : 3 },
        water: { ml: 2000 },
        updatedAt: nowIso,
      });
    }
    await store.init();

    const { container } = render(<App initialStore={store} />);

    // Cycle tab shows Ovulation card, fixed banner, Confirmed ovulation, learned luteal length, and Ways to find out
    fireEvent.click(await screen.findByRole('button', { name: 'Cycle' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('This app is not a contraception method.');
      expect(document.body.textContent).toContain('Confirmed ovulation estimate');
      expect(document.body.textContent).toContain('Learned luteal length (2 confirmed cycles)');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ways to find out' }));
    const waysDialog = await screen.findByRole('dialog', { name: 'Ways to find out' });
    expect(waysDialog.textContent).toContain('Cervical mucus (free)');
    expect(waysDialog.textContent).toContain('LH urine strips (costs money)');
    await runAxe(container);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Body tab shows unlocked lifestyle pattern with "not proof of cause" wording
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('On days after under 6 hours of sleep');
      expect(document.body.textContent).toContain('This is a pattern, not proof of cause.');
    });

    // Record -> Doctor File shows Part 6 lifestyle, Part 8 body averages, and Part 9 ovulation signals
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create doctor file' }));
    const docDialog = await screen.findByRole('dialog', { name: 'Create doctor file' });
    expect(docDialog.textContent).toContain('## 8. Body and lifestyle');
    expect(docDialog.textContent).toContain('## 9. Ovulation signals');
    expect(docDialog.textContent).toContain('On days after under 6 hours of sleep');

    // Toggling off Body log removes Part 8 from preview
    fireEvent.click(screen.getByRole('button', { name: 'Body log' }));
    await waitFor(() => {
      expect(docDialog.textContent).not.toContain('## 8. Body and lifestyle');
    });
  });
});
