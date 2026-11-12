// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDefaultProfile, MoonrootStore } from '../../app/store';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';

describe('Step 7 Android settings and discreet mode UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('toggles daily reminder, shifts quiet hours cleanly, saves discreet preferences, and passes axe', async () => {
    const store = new MoonrootStore();
    await store.init();
    const profile = makeDefaultProfile(getLocalStamp());
    profile.disclaimerAcceptedAt = getLocalStamp();
    await store.saveProfile(profile);

    const { container } = render(<App initialStore={store} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByText('Reminders and discreet mode')).toBeTruthy());

    const dailyCheckbox = screen.getByLabelText('Daily check-in reminder') as HTMLInputElement;
    expect(dailyCheckbox.checked).toBe(false);
    fireEvent.click(dailyCheckbox);

    await waitFor(() => {
      expect(store.snapshot.profile?.reminders.daily.on).toBe(true);
      expect(screen.getByLabelText('Preferred reminder time')).toBeTruthy();
      expect(screen.getByText(/Scheduled as daily at 20:00/)).toBeTruthy();
    });

    const timeInput = screen.getByLabelText('Preferred reminder time') as HTMLInputElement;
    fireEvent.input(timeInput, { target: { value: '23:30' } });

    await waitFor(() => {
      expect(store.snapshot.profile?.reminders.daily.time).toBe('23:30');
      expect(
        screen.getByText(/Scheduled as daily at 08:00 \(shifted outside quiet hours\)/),
      ).toBeTruthy();
    });

    const widgetDiscreet = screen.getByLabelText(
      'Discreet mode (widget shows leaf only)',
    ) as HTMLInputElement;
    expect(widgetDiscreet.checked).toBe(true);
    fireEvent.click(widgetDiscreet);

    await waitFor(() => {
      expect(store.snapshot.profile?.discreetMode).toBe(false);
    });

    const launcherToggle = screen.getByLabelText(
      /Discreet launcher icon/i,
    ) as HTMLInputElement;
    fireEvent.click(launcherToggle);
    expect(launcherToggle.checked).toBe(true);

    // Confirm today's date reminder tracker stays reset when logging check-in
    await store.saveDayLog({
      date: getLocalDateKey(),
      filledFrom: 'live',
      flow: 'none',
      symptoms: [],
      danger: [],
      dangerAnswered: true,
      note: '',
      updatedAt: getLocalStamp(),
    });
    expect(store.reminderTracker.ignoredStreak).toBe(0);

    const axeRes = await axe.run(container as axe.ElementContext, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(axeRes.violations).toEqual([]);
  });
});
