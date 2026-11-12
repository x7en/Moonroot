// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDefaultProfile, MoonrootStore } from '../../app/store';
import { IndexedDBStorage } from '../../data/idb';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';

function expectSingleH1WithoutTrailingPeriod(container: Element): void {
  const h1s = container.querySelectorAll('h1');
  expect(h1s.length).toBe(1);
  for (const h of container.querySelectorAll('h1, h2, h3')) {
    const txt = (h.textContent ?? '').trim();
    if (txt.length > 0) {
      expect(txt.endsWith('.')).toBe(false);
    }
  }
}

describe('UI refresh navigation, Butter/Night defaults, single-h1, error recovery, and not-found checks', () => {
  let dbNames: string[] = [];

  async function makeFreshStore(): Promise<MoonrootStore> {
    const dbName = `moonroot-refresh-${Math.random().toString(36).slice(2)}`;
    dbNames.push(dbName);
    return new MoonrootStore(new IndexedDBStorage(dbName));
  }

  beforeEach(() => {
    dbNames = [];
    window.history.replaceState(null, '', '/');
  });

  afterEach(async () => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    cleanup();
    for (const dbName of dbNames) {
      await new Promise<void>((resolveDb) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolveDb();
        req.onerror = () => resolveDb();
        req.onblocked = () => resolveDb();
      });
    }
  });

  it('defaults new profile to Butter (dawn), enforces single-h1 across screens, jumps Home via Moonroot wordmark, and handles not-found routes', async () => {
    const store = await makeFreshStore();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    const profile = {
      ...makeDefaultProfile(nowIso),
      birthYear: 1995,
      menarcheAge: 13,
      disclaimerAcceptedAt: nowIso,
    };
    expect(profile.theme).toBe('dawn');
    await store.storage.saveProfile(profile);

    const consoleErrors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args);
    });

    const { container, unmount } = render(<App initialStore={store} />);
    await screen.findByRole('heading', { level: 1 });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dawn');
    expectSingleH1WithoutTrailingPeriod(container);

    for (const navName of ['Cycle', 'Record', 'Body', 'Settings'] as const) {
      fireEvent.click(screen.getByRole('button', { name: navName }));
      await screen.findByRole('heading', { level: 1, name: navName });
      expectSingleH1WithoutTrailingPeriod(container);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Moonroot' }));
    await screen.findByRole('button', { name: /No flow/i });
    expectSingleH1WithoutTrailingPeriod(container);

    fireEvent.click(screen.getByRole('button', { name: 'Cycle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Graphs' }));
    await screen.findByRole('heading', { level: 1, name: 'Graphs' });
    expectSingleH1WithoutTrailingPeriod(container);

    fireEvent.click(screen.getByRole('button', { name: 'Moonroot' }));
    await screen.findByRole('button', { name: /No flow/i });

    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask your record' }));
    await screen.findByRole('heading', { level: 1, name: 'Ask your record' });
    expectSingleH1WithoutTrailingPeriod(container);
    unmount();

    // Unknown sub-route renders friendly Page not found + returns Today cleanly
    window.history.replaceState(null, '', '/unknown-page');
    const store2 = await makeFreshStore();
    await store2.storage.saveProfile(profile);
    render(<App initialStore={store2} />);
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await screen.findByRole('button', { name: /No flow/i });
    expect(window.location.pathname).toBe('/');

    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(consoleErrors).toEqual([]);
  });

  it('prioritizes the PIN lock over unknown-route UI', async () => {
    window.history.replaceState(null, '', '/unknown-page');
    const store = await makeFreshStore();
    const nowIso = getLocalStamp();
    await store.storage.saveProfile({
      ...makeDefaultProfile(nowIso),
      birthYear: 1995,
      menarcheAge: 13,
      disclaimerAcceptedAt: nowIso,
      lock: { type: 'pin', hash: 'test-hash', salt: 'test-salt' },
    });

    render(<App initialStore={store} />);
    await screen.findByText('Enter your PIN to open.');
    expect(screen.queryByRole('heading', { level: 1, name: 'Page not found' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  });

  it('isolates verdict cards from Citron .card and displays dismissible alert banner on save errors', async () => {
    const store = await makeFreshStore();
    const nowIso = getLocalStamp();
    await store.storage.saveProfile({
      ...makeDefaultProfile(nowIso),
      birthYear: 1995,
      menarcheAge: 13,
      disclaimerAcceptedAt: nowIso,
    });

    const { container } = render(<App initialStore={store} />);
    const verdictRegion = await screen.findByRole('region', { name: 'Today check-in summary' });
    expect(verdictRegion.classList.contains('verdict-card')).toBe(true);
    expect(verdictRegion.classList.contains('card')).toBe(false);
    expect(container.querySelector('h1.screen-title')).toBeTruthy();

    vi.spyOn(store, 'saveDayLog').mockRejectedValueOnce(new Error('Disk full on test device'));
    fireEvent.click(screen.getByRole('button', { name: /No flow/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save. Your entry is still here. Try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
