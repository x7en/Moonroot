// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function makeAdultProfile(nowIso: string, theme = 'dusk'): Profile {
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
    theme,
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

describe('Step 3 Cycle tab, forecasts, lead-in UI, CSV exports, and accessibility', () => {
  beforeEach(async () => {
    await clearMoonrootDb();
  });

  afterEach(async () => {
    cleanup();
    await clearMoonrootDb();
  });

  it('starts at 10% empty state, supports Add earlier periods, month calendar navigation, baseline marker, and renders zero SVG charts', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    await store.init();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.saveProfile(makeAdultProfile(nowIso));

    const { container } = render(<App initialStore={store} />);

    // Open Cycle tab in empty state -> must show 10% and Log your first period to start, and ZERO charts
    fireEvent.click(await screen.findByRole('button', { name: 'Cycle' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('10%');
      expect(document.body.textContent).toContain('Log your first period to start.');
    });
    expect(container.querySelectorAll('svg').length).toBe(0);
    await runAxe(container);

    // Add 3 earlier approximate periods using the Add earlier periods form (starting -95, -65, -35)
    const addPeriodBtns = screen.getAllByRole('button', { name: 'Add earlier periods' });
    fireEvent.click(addPeriodBtns[0] as HTMLElement);
    const dateInput = await screen.findByLabelText('Period start date');

    const starts = [addDays(today, -95), addDays(today, -65), addDays(today, -35), addDays(today, -5)];
    for (const s of starts) {
      fireEvent.input(dateInput, { target: { value: s } });
      fireEvent.click(screen.getByRole('button', { name: 'Save approximate period' }));
      await waitFor(() => {
        expect(document.body.textContent).toContain(`Saved approximate period starting ${s}`);
      });
    }

    // Now cycles & frozen forecasts exist; confidence rises above 10% and window text renders
    await waitFor(() => {
      expect(store.snapshot.forecasts.length).toBeGreaterThanOrEqual(4);
      expect(document.body.textContent).toContain('Your next period is likely between');
      expect(document.body.textContent).toContain('Likely window');
      expect(document.body.textContent).not.toMatch(/\b(late|missed|overdue|abnormal)\b/i);
    });
    expect(container.querySelectorAll('svg').length).toBe(0);

    // Month calendar browsing: move to previous month, select a day, and jump back to Today
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const todayBtn = screen.getByRole('button', { name: new RegExp(`^${today}`) });
    fireEvent.click(todayBtn);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Open ${today} on Today`) }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Forecast (');
    });

    // Return to Cycle tab and test manual "Start predictions fresh" marker
    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    const baselineInput = await screen.findByLabelText('Start-fresh date');
    const cutoff = addDays(today, -20);
    fireEvent.input(baselineInput, { target: { value: cutoff } });
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh from date' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain(`Active baseline: ${cutoff}`);
      expect(document.body.textContent).toContain('before the change');
    });
    await runAxe(container);

    // Clear marker cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Clear marker' }));
    await waitFor(() => {
      expect(document.body.textContent).not.toContain(`Active baseline: ${cutoff}`);
    });
  });

  it('displays learned lead-in pattern, long-gap fallback without likely window, Doctor File Part 6, and Day/Cycle CSV downloads across themes', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    await store.init();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.saveProfile(makeAdultProfile(nowIso, 'dawn'));

    // Log 5 irregular cycles with consistent 7-day spotting/cramp lead-in signals before flow
    // Anchor most recent period 45 days ago -> triggers lead-in OR with signal 3 days ago switches to lead-in
    const starts = [
      addDays(today, -220),
      addDays(today, -180),
      addDays(today, -145),
      addDays(today, -100),
      addDays(today, -65),
      addDays(today, -35),
    ];
    for (let i = 0; i < starts.length; i += 1) {
      const s = starts[i] ?? today;
      await store.saveDayLog({
        date: s,
        filledFrom: 'live',
        flow: 'heavy',
        protection: 'pad',
        symptoms: ['cramps'],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
      await store.saveDayLog({
        date: addDays(s, 1),
        filledFrom: 'live',
        flow: 'medium',
        protection: 'pad',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
      if (i > 0) {
        const sigDate = addDays(s, -7);
        await store.saveDayLog({
          date: sigDate,
          filledFrom: 'live',
          flow: 'spotting',
          pain: { level: 3, sites: ['lower-middle'] },
          symptoms: ['cramps'],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: nowIso,
        });
      }
    }
    // Add an active signal 2 days ago for the next upcoming period
    await store.saveDayLog({
      date: addDays(today, -2),
      filledFrom: 'live',
      flow: 'spotting',
      pain: { level: 3, sites: ['lower-middle'] },
      symptoms: ['cramps'],
      danger: [],
      dangerAnswered: true,
      note: '',
      updatedAt: nowIso,
    });

    const downloadSpy = vi.spyOn(store, 'downloadFile').mockImplementation(() => {});

    const { container } = render(<App initialStore={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cycle' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Spotting or cramps (3+) appeared');
      expect(document.body.textContent).toContain('Signal logged on');
      expect(document.body.textContent).toContain('Past possible windows held the real start in');
    });
    await runAxe(container);

    // Open Record -> Create doctor file -> verify Part 6 and Day/Cycle CSV downloads
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create doctor file' }));

    const preview = await screen.findByText(/6\. Patterns the app found/i);
    expect(preview.textContent).toContain('Lead-in pattern');

    fireEvent.click(screen.getByRole('button', { name: 'Download Day table (.csv)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Cycle table (.csv)' }));

    expect(downloadSpy).toHaveBeenCalledWith(
      `moonroot-days-${today}.csv`,
      expect.stringContaining('date,flow,products,clots,pain,symptoms,mood,sleep_hours,water_ml,stool_type,bbt_c,lh,mucus,medicines,note'),
      'text/csv;charset=utf-8',
    );
    expect(downloadSpy).toHaveBeenCalledWith(
      `moonroot-cycles-${today}.csv`,
      expect.stringContaining('cycle_number,start_date,end_date,next_start_date,length_days'),
      'text/csv;charset=utf-8',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Switch theme to High contrast and verify CycleScreen accessibility
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'High contrast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    await runAxe(container);

    // Conditional gap UI check: when open period elapsed days exceed most history, drops likely window cleanly without saying late
    await store.saveProfile({ ...makeAdultProfile(nowIso), birthYear: 1995 });
    const gapStore = new MoonrootStore();
    await gapStore.init();
    await gapStore.deleteAllData();
    await gapStore.saveProfile(makeAdultProfile(nowIso));
    const gapStarts = [addDays(today, -150), addDays(today, -120), addDays(today, -90), addDays(today, -55)];
    for (const s of gapStarts) {
      await gapStore.saveDayLog({
        date: s,
        filledFrom: 'live',
        flow: 'medium',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
      await gapStore.saveDayLog({
        date: addDays(s, 1),
        filledFrom: 'live',
        flow: 'medium',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: '',
        updatedAt: nowIso,
      });
    }
    cleanup();
    render(<App initialStore={gapStore} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Day 55.');
      expect(document.body.textContent).toContain('Longest gap logged is 35 days.');
      expect(document.body.textContent).not.toMatch(/\b(late|missed|overdue)\b/i);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('The longest gap you logged is 35 days.');
      expect(document.body.textContent).not.toContain('Your next period is likely between');
    });
    await gapStore.storage.close();
  });
});
