// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
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

function makeAdultProfile(nowIso: string, theme = 'dusk'): Profile {
  return {
    schemaVersion: 1,
    createdAt: nowIso,
    birthYear: 2000,
    menarcheAge: 13,
    selfRegularity: 'irregular',
    lastPeriodApprox: null,
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'active',
    conditionsNote: '',
    medicationsNote: '',
    sproutName: 'Pip',
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

describe('Step 2 UI check-in intelligence end-to-end verification', () => {
  beforeEach(async () => {
    await clearMoonrootDb();
  });

  afterEach(async () => {
    cleanup();
    await clearMoonrootDb();
  });

  it('evaluates Law 4 incomplete vs Green, RED-06 tampon removal prepend, and under-18 parent/nurse note across themes with zero axe issues', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    await store.init();
    const nowIso = getLocalStamp();
    await store.saveProfile({
      ...makeAdultProfile(nowIso, 'dawn'),
      birthYear: 2010, // under 18
      intimacy: 'prefer-not-to-say',
    });

    const { container } = render(<App initialStore={store} />);
    const heavyBtn = await screen.findByRole('button', { name: /Heavy flow/i });
    fireEvent.click(heavyBtn);

    // Law 4: danger screen unanswered -> NEVER shows Nothing flagged
    await waitFor(() => {
      expect(document.body.textContent).toContain('More answers needed');
      expect(document.body.textContent).not.toContain('Nothing flagged');
    });

    // Answer tampon + pad frequency + clots + danger None of these -> still incomplete until pain is answered
    fireEvent.click(screen.getByRole('button', { name: 'tampon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Less often' }));
    fireEvent.click(screen.getByRole('button', { name: 'No clots' }));
    fireEvent.click(screen.getByRole('button', { name: 'Any of these right now?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'None of these' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('More answers needed');
      expect(document.body.textContent).not.toContain('Nothing flagged');
    });

    // Answer Pain 2 and pregnancyChance ("Prefer not to say") -> becomes Green ("Nothing flagged")
    fireEvent.click(screen.getByRole('button', { name: 'Mild (2)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prefer not to say' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Nothing flagged');
    });
    await runAxe(container);

    // Add fever 39.2 C with tampon -> RED-06 fires with Remove tampon actionPrepend + under-18 note
    fireEvent.click(screen.getByRole('button', { name: 'Any of these right now?' }));
    const tempInput = await screen.findByLabelText(/Measured temperature/i);
    fireEvent.input(tempInput, { target: { value: '39.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save warning signs' }));

    await waitFor(() => {
      const saved = store.getDayLog(getLocalDateKey());
      expect(saved?.protection).toBe('tampon');
      expect(saved?.fever?.c).toBe(39.2);
      expect(document.body.textContent).toContain('Get care today');
      expect(document.body.textContent).toContain('Remove the tampon or cup now.');
      expect(document.body.textContent).toContain('Tell a parent, relative or school nurse if you can.');
    });

    // Under-18 must NEVER show adult intimacy log section
    expect(document.body.textContent).not.toContain('Intimacy today');

    // Switch to High contrast and verify zero axe violations
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'High contrast' }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
    });
    await runAxe(container);
  });

  it('runs open event card -> open-event-notice -> doctor visit close, watch list flow, catch-up banner, hormone start-fresh, and Step 2 doctor file', async () => {
    const store = new MoonrootStore();
    activeStore = store;
    await store.init();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.saveProfile(makeAdultProfile(nowIso));

    // Seed two previous periods & an open ORG-02 event within the last 14 days so derived cycles (28 days), catch-up, and open event appear
    const p1 = addDays(today, -58);
    const p2 = addDays(today, -30);
    const p3 = addDays(today, -3);
    await store.saveDayLog({
      date: p1,
      filledFrom: 'live',
      flow: 'medium',
      pain: { level: 3, sites: ['lower-middle'] },
      symptoms: [],
      danger: [],
      dangerAnswered: true,
      note: '',
      updatedAt: nowIso,
    });
    await store.saveDayLog({
      date: p2,
      filledFrom: 'live',
      flow: 'medium',
      pain: { level: 3, sites: ['lower-middle'] },
      symptoms: [],
      danger: [],
      dangerAnswered: true,
      note: '',
      updatedAt: nowIso,
    });
    await store.saveDayLog({
      date: p3,
      filledFrom: 'live',
      flow: 'heavy',
      clots: 'large',
      pain: { level: 7, sites: ['lower-middle'], stoppedActivities: true },
      symptoms: ['cramps'],
      danger: [],
      dangerAnswered: true,
      note: '',
      updatedAt: nowIso,
    });

    const { container } = render(<App initialStore={store} />);
    await screen.findByText(/Welcome back\. Want a 20-second catch-up\?/i);

    // Log a quiet day today while earlier ORG-02 event is open -> open-event-notice replaces Green
    fireEvent.click(screen.getByRole('button', { name: /No flow/i }));
    fireEvent.click(screen.getByRole('button', { name: 'None (0)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Any of these right now?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'None of these' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'Nothing new today. An earlier flag is still open.',
      );
      expect(document.body.textContent).not.toContain('Nothing flagged');
      expect(document.body.textContent).toContain('ORG-02');
    });

    // Also log yellow-green discharge -> triggers YEL-08 & Watch list check
    fireEvent.click(screen.getByRole('button', { name: 'yellow-green' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Keep watching');
      expect(document.body.textContent).toContain('Watch list check');
      expect(document.body.textContent).toContain('Is the discharge still there?');
    });

    // Close open event via "Log doctor visit today"
    fireEvent.click(screen.getByRole('button', { name: 'Log doctor visit today' }));
    await waitFor(() => {
      expect(store.snapshot.visits.length).toBe(1);
    });

    // Clear discharge and log a hormone course -> Start predictions fresh prompt appears
    fireEvent.click(screen.getByRole('button', { name: 'yellow-green' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Combined pill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save medicine' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Start predictions fresh from this date?');
    });
    const hormoneCard = screen.getByText('Start predictions fresh from this date?').closest('section');
    expect(hormoneCard).not.toBeNull();
    if (hormoneCard) {
      fireEvent.click(within(hormoneCard).getByRole('button', { name: 'Yes' }));
    }
    await waitFor(() => {
      expect(store.snapshot.decisions.some((d) => d.kind === 'new-baseline')).toBe(true);
    });

    // Record tab shows Derived cycles & Step 2 Doctor File parts 1, 3, 4, 7, 11
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await screen.findByText('Derived cycles');
    expect(document.body.textContent).toContain('28 days');
    expect(document.body.textContent).toContain('before the change');
    await runAxe(container);

    fireEvent.click(screen.getByRole('button', { name: 'Create doctor file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create doctor file' });
    expect(dialog.textContent).toContain('## 1. At a glance');
    expect(dialog.textContent).toContain('## 3. Cycle history');
    expect(dialog.textContent).toContain('## 4. Bleeding detail');
    expect(dialog.textContent).toContain('## 7. Flags raised');
    expect(dialog.textContent).toContain('## 11. Questions to ask');
  });
});
