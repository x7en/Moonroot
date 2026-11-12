// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDefaultProfile, MoonrootStore } from '../../app/store';
import { STAGE_DEFINITIONS } from '../../core/companion/companion';
import { addDays } from '../../core/model/dates';
import type { CompanionStage, DayLog, SproutMood } from '../../core/model/types';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';
import { Sprout } from '../../ui/companion/Sprout';

async function runAxeClean(container: Element): Promise<void> {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  expect(result.violations).toEqual([]);
}

function makeAdultDay(date: string, flow: DayLog['flow'] = 'none'): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow,
    pain: { level: 0, sites: [] },
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T10:00:00+00:00`,
  };
}

describe('Step 5 Companion sprout, ring economy, stages, badges, weekly review, and reduced motion', () => {
  let dbName: string;
  let store: MoonrootStore;

  beforeEach(async () => {
    vi.useRealTimers();
    dbName = `moonroot-step5-${Math.random().toString(36).slice(2)}`;
    const { IndexedDBStorage } = await import('../../data/idb');
    store = new MoonrootStore(new IndexedDBStorage(dbName));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    await store.storage.close();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it('renders Sprout across all 7 stages and 4 moods with no face, no wilting, and obeys reduced motion', () => {
    const stages: CompanionStage[] = [0, 1, 2, 3, 4, 5, 6];
    const moods: SproutMood[] = ['bright', 'calm', 'sleepy', 'welcome'];

    for (const stage of stages) {
      const def = STAGE_DEFINITIONS[stage];
      const { container, unmount } = render(
        <Sprout stage={stage} mood="calm" rings={def?.minRings ?? 0} name="Pip" />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-stage')).toBe(String(stage));
      expect(svg?.getAttribute('aria-label')).toContain(def?.name ?? '');

      if (stage === 0) {
        expect(container.querySelector('#seed')).not.toBeNull();
        expect(container.querySelector('#plant-body')).toBeNull();
      } else {
        expect(container.querySelector('#plant-body')).not.toBeNull();
        expect(container.querySelector('#stem')).not.toBeNull();
        expect(container.querySelector('#leaves')).not.toBeNull();
      }
      if (stage >= 3) {
        expect(container.querySelector('#tendril')).not.toBeNull();
      }
      if (stage === 4) {
        expect(container.querySelector('#bud')).not.toBeNull();
      }
      if (stage >= 5) {
        expect(container.querySelector('#flower')).not.toBeNull();
      }
      unmount();
    }

    for (const mood of moods) {
      const { container, unmount } = render(
        <Sprout stage={3} mood={mood} rings={30} name="Pip" />,
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-mood')).toBe(mood);
      if (mood === 'sleepy') {
        expect(container.querySelector('#sleep-zzz')).not.toBeNull();
      } else {
        expect(container.querySelector('#sleep-zzz')).toBeNull();
      }
      // Never brown/wilted
      expect(container.innerHTML).not.toMatch(/wilt|brown|dead|sad/i);
      unmount();
    }

    // Stage 0 Seed NEVER shows raindrops, moonbeams, sunbeams, or sparkles
    for (const r of ['water', 'sleep', 'meal', 'other'] as const) {
      const seedReaction = render(<Sprout stage={0} mood="bright" rings={1} reaction={r} />);
      expect(seedReaction.container.querySelector('#particles')?.children.length).toBe(0);
      expect(seedReaction.container.querySelector('svg')?.getAttribute('data-reaction')).toBe('none');
      seedReaction.unmount();
    }

    // From Stage 1 onward, Body-log reactions are allowed (and still obey reduced motion)
    for (const [r, cls] of [
      ['water', '.reaction-raindrops'],
      ['sleep', '.reaction-moonbeam'],
      ['meal', '.reaction-sunbeam'],
      ['other', '.reaction-sparkle'],
    ] as const) {
      const s1 = render(<Sprout stage={1} mood="bright" rings={3} reaction={r} />);
      expect(s1.container.querySelector(cls)).not.toBeNull();
      s1.unmount();
    }

    // With reducedMotion=false at stage 3, water reaction shows raindrops particles
    const animated = render(
      <Sprout stage={3} mood="bright" rings={30} reaction="water" reducedMotion={false} />,
    );
    expect(animated.container.querySelector('.reaction-raindrops')).not.toBeNull();
    animated.unmount();

    // With reducedMotion=true, sways and particle animations are skipped; static glow is shown instead
    const reduced = render(
      <Sprout stage={3} mood="bright" rings={30} reaction="water" reducedMotion={true} />,
    );
    const rSvg = reduced.container.querySelector('svg');
    expect(rSvg?.classList.contains('sprout-reduced-motion')).toBe(true);
    expect(rSvg?.classList.contains('sprout-sway')).toBe(false);
    expect(reduced.container.querySelector('.reaction-raindrops')).toBeNull();
    expect(reduced.container.querySelector('#glow')?.getAttribute('data-static-glow')).toBe('true');
  });

  it('honors browser/OS prefers-reduced-motion media query automatically', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const nowIso = getLocalStamp();
      const profile = makeDefaultProfile(nowIso);
      profile.birthYear = 1998;
      profile.menarcheAge = 13;
      profile.reducedMotion = false;
      profile.disclaimerAcceptedAt = nowIso;
      await store.storage.saveProfile(profile);

      const { container } = render(<App initialStore={store} />);
      await screen.findByText(/Ready for today's check-in/i);

      await waitFor(() =>
        expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true'),
      );
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-reduced-motion')).toBe('true');
      expect(svg?.classList.contains('sprout-reduced-motion')).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('completes a normal check-in in <= 4 taps, awards 1 ring cleanly, never decreases on Undo, and passes axe', async () => {
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    const profile = makeDefaultProfile(nowIso);
    profile.birthYear = 1998;
    profile.menarcheAge = 13;
    profile.sproutName = 'Fern';
    profile.disclaimerAcceptedAt = nowIso;
    await store.storage.saveProfile(profile);

    const { container } = render(<App initialStore={store} />);
    await screen.findByText(/Ready for today's check-in/i);

    // 2 taps total (well below 4): Tap 1 Flow=None, Tap 2 Pain=None (0)
    fireEvent.click(screen.getByRole('button', { name: /No flow, 0 of 3 drops/i }));
    fireEvent.click(screen.getByRole('button', { name: 'None (0)' }));

    await screen.findByText('Nothing flagged');
    expect(store.snapshot.companion.rings).toBe(1);
    expect(store.snapshot.companion.badges).toContain('first-light');
    expect(screen.getByText(/1 rings/i)).toBeTruthy();

    // Tap sprout -> gentle message with zero health words
    fireEvent.click(screen.getByRole('button', { name: /Talk to Fern/i }));
    const msg = await screen.findByText(/Slow growth is still growth/i);
    expect(msg.textContent).not.toMatch(/\b(period|flow|pain|cramp|cycle|doctor)\b/i);

    // Undo reverts the last change while rings & badges NEVER decrease (Law of the Sprout)
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undoBtn);
    await waitFor(() =>
      expect(store.snapshot.dayLogs.find((d) => d.date === today)?.pain).toBeUndefined(),
    );
    expect(store.snapshot.companion.rings).toBe(1);
    expect(store.snapshot.companion.badges).toContain('first-light');

    // Deleting the DayLog completely still leaves rings and earned badges untouched
    await store.deleteDayLog(today);
    expect(store.snapshot.dayLogs.find((d) => d.date === today)).toBeUndefined();
    expect(store.snapshot.companion.rings).toBe(1);
    expect(store.snapshot.companion.badges).toContain('first-light');

    await runAxeClean(container);
  });

  it('handles sleepy->welcome transition, daily 2-ring cap, Body reactions, Sunday weekly review, themes, 8 badges, reduced motion setting, and PIN sprout lock', async () => {
    // Pin wall-clock to Sunday evening 2026-11-08 19:00 so Weekly Review appears
    vi.setSystemTime(new Date(2026, 10, 8, 19, 0, 0));
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    expect(today).toBe('2026-11-08');

    const profile = makeDefaultProfile(nowIso);
    profile.birthYear = 1996;
    profile.menarcheAge = 13;
    profile.sproutName = 'Luna';
    profile.disclaimerAcceptedAt = nowIso;
    await store.storage.saveProfile(profile);

    // Seed 4 days ago as last check-in so sprout starts Sleepy; stage 3 (25 rings -> Meadow unlocked)
    await store.storage.saveDayLog(makeAdultDay(addDays(today, -4), 'light'));
    await store.storage.saveCompanion({
      rings: 25,
      stage: 3,
      unlocked: ['dusk', 'dawn', 'high-contrast', 'meadow'],
      badges: ['first-light'],
      lastRingDate: addDays(today, -4),
      lastCheckInDate: addDays(today, -4),
    });

    const { container } = render(<App initialStore={store} />);
    await screen.findByText(/Resting quietly/i);
    expect(container.querySelector('[data-mood="sleepy"]')).not.toBeNull();

    // First check-in back -> Welcome mood + +1 ring (25 -> 26)
    fireEvent.click(screen.getByRole('button', { name: /No flow, 0 of 3 drops/i }));
    fireEvent.click(screen.getByRole('button', { name: 'None (0)' }));
    await waitFor(() => expect(store.snapshot.companion.rings).toBe(26));
    expect(container.querySelector('[data-mood="welcome"]')).not.toBeNull();
    expect(screen.getByText(/Welcome back · 26 rings/i)).toBeTruthy();

    // Verify Stage 3 has night-garden OFF, then promote to Stage 6 Moonflower -> night-garden ON
    expect(document.documentElement.getAttribute('data-night-garden')).toBe('false');

    // Switch to Body -> log Sleep -> triggers moonbeam reaction & +1 ring (26 -> 27, daily cap 2)
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    fireEvent.click(await screen.findByRole('button', { name: '7h' }));
    await waitFor(() => expect(store.snapshot.companion.rings).toBe(27));
    expect(container.querySelector('[data-reaction="sleep"]')).not.toBeNull();

    // Log Water same day -> triggers raindrops reaction, rings STILL capped at 27!
    fireEvent.click(screen.getByRole('button', { name: '1500 ml' }));
    await waitFor(() => expect(container.querySelector('[data-reaction="water"]')).not.toBeNull());
    expect(store.snapshot.companion.rings).toBe(27);

    // Return to Today -> Sunday weekly review card opens without exceeding 2 rings today
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const openReviewBtn = await screen.findByRole('button', { name: 'Open weekly review' });
    fireEvent.click(openReviewBtn);
    await screen.findByText(/Days checked in this week:/i);
    expect(store.snapshot.companion.rings).toBe(27);

    // Check Record -> Badges section + Doctor file marks Record keeper
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    const badgesSection = await screen.findByRole('region', { name: 'Badges' });
    expect(within(badgesSection).getByText(/Steady roots/i)).toBeTruthy();
    expect(within(badgesSection).getByText(/★ First light/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create doctor file' }));
    await waitFor(() => expect(store.snapshot.companion.badges).toContain('record-keeper'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Check Settings -> Meadow unlocked, Ocean/Rose/Midnight locked, Reduce motion + High contrast work
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const meadowBtn = await screen.findByRole('button', { name: 'Meadow' });
    expect((meadowBtn as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Ocean \(Stage 4\)/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Midnight \(Stage 6\)/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'High contrast' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(meadowBtn);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('meadow'));

    const reduceMotionCheck = screen.getByLabelText('Reduce motion') as HTMLInputElement;
    fireEvent.click(reduceMotionCheck);
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true'),
    );

    await runAxeClean(container);

    // Verify PIN lock shows the live Sprout with zero health words
    fireEvent.input(screen.getByLabelText(/Set or change PIN/i), { target: { value: '4829' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    await screen.findByText('PIN lock saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    const lockSvg = await waitFor(() => {
      const svg = container.querySelector('svg[data-stage="3"]');
      expect(svg).not.toBeNull();
      return svg;
    });
    expect(lockSvg?.getAttribute('data-mood')).toBe('calm');
    expect(lockSvg?.getAttribute('data-reduced-motion')).toBe('true');

    // Stage 6 Moonflower unlocks Midnight theme + night-garden backdrop (not shown at Stages 0-5)
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '4829' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('button', { name: 'Settings' });
    store.snapshot.companion = {
      rings: 150,
      stage: 6,
      unlocked: ['dusk', 'dawn', 'high-contrast', 'meadow', 'ocean', 'rose', 'midnight'],
      badges: ['first-light'],
      lastRingDate: today,
      lastCheckInDate: today,
    };
    await store.storage.saveCompanion(store.snapshot.companion);
    await store.syncCompanionState(today);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-night-garden')).toBe('true'),
    );
    const midnightBtn = await screen.findByRole('button', { name: 'Midnight' });
    expect((midnightBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(midnightBtn);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('midnight'));
  });
});
