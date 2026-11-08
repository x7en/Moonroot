// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MoonrootStore } from '../../app/store';
import { createBackupFile } from '../../data/backup';
import { getLocalDateKey, getLocalStamp } from '../../platform/web';
import { App } from '../../ui/App';

async function clearMoonrootDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('moonroot-db');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function runAxe(container: Element): Promise<void> {
  // jsdom does not compute color-contrast accurately via canvas; check structural & ARIA rules
  const results = await axe.run(container as axe.ElementContext, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
}

describe('Step 1 UI and gate verification', () => {
  beforeEach(async () => {
    await clearMoonrootDb();
  });

  afterEach(() => {
    cleanup();
  });

  it('completes onboarding with under-18 safety, persists logs across reload, handles danger signs, medicines, Get help, and Doctor file', async () => {
    const { container, unmount } = render(<App />);

    // Step 1: disclaimer required
    const continueBtn = await screen.findByRole('button', { name: 'Continue' });
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('records your log only');

    await runAxe(container);

    fireEvent.click(screen.getByLabelText(/This app tracks and sorts urgency/i));
    expect((continueBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(continueBtn);

    // Step 2: birth year 2012 -> under 18
    fireEvent.input(screen.getByLabelText(/Birth year/i), { target: { value: '2012' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3 -> Step 4
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.body.textContent).toContain('only a neutral pregnancy question can appear');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 5 -> Step 6
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.body.textContent).toContain('10%');
    fireEvent.click(screen.getByRole('button', { name: 'Start journaling' }));

    // Today screen loaded
    const heavyBtn = await screen.findByRole('button', { name: /Heavy flow/i });
    expect(document.body.textContent).toContain('Records only');
    // Step 1 must NEVER display verdict level Green / Nothing flagged
    expect(document.body.textContent).not.toContain('Nothing flagged');

    await runAxe(container);

    // Log flow in 1 tap -> Undo toast appears
    fireEvent.click(heavyBtn);
    await waitFor(() => {
      expect(heavyBtn.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    });

    // Open warning signs sheet -> tick Fainted -> verify Open Get help appears
    fireEvent.click(screen.getByRole('button', { name: 'Any of these right now?' }));
    const faintedChip = await screen.findByRole('button', { name: 'Fainted' });
    fireEvent.click(faintedChip);

    const openHelpInDanger = await screen.findByRole('button', { name: 'Open Get help' });
    fireEvent.click(openHelpInDanger);

    // Get help sheet opens with PK defaults (1122 / 115) & under-18 safety line
    const helpDialog = await screen.findByRole('dialog', { name: 'Get help' });
    expect(helpDialog.textContent).toContain('1122');
    expect(helpDialog.textContent).toContain('115');
    expect(helpDialog.textContent).toContain('a parent, relative or school nurse');
    await runAxe(container);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Add medicine + repeat with Same as last time
    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ponstan Forte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save medicine' }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('1 dose');
      expect(document.body.textContent).toContain('Check the pack for the daily limit.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }));
    const repeatBtn = await screen.findByRole('button', { name: /Same as last time/i });
    fireEvent.click(repeatBtn);

    await waitFor(() => {
      expect(document.body.textContent).toContain('2 doses');
    });

    // Reload simulation: unmount completely and mount fresh <App />
    unmount();
    cleanup();

    const reloaded = render(<App />);
    const reloadedHeavy = await screen.findByRole('button', { name: /Heavy flow/i });
    expect(reloadedHeavy.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('2 doses');
    expect(document.body.textContent).toContain('Fainted');

    // Open Record tab & Doctor file
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await runAxe(reloaded.container);

    fireEvent.click(screen.getByRole('button', { name: 'Create doctor file' }));
    const docPreview = await screen.findByRole('dialog', { name: 'Create doctor file' });
    expect(docPreview.textContent).toContain('Not yet clinician reviewed');
    expect(docPreview.textContent).toContain('Ponstan Forte');
    expect(docPreview.textContent).toContain('Moonroot is a private journal that records symptoms and sorts urgency. It does not diagnose any condition.');
    expect(docPreview.textContent).not.toContain('Intimacy entries');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Edit logged day by tapping its row in Record timeline
    const timelineRow = await screen.findByRole('button', { name: /^2026-11-08/i });
    fireEvent.click(timelineRow);
    const dangerCheckBtn = await screen.findByRole('button', { name: 'Any of these right now?' });
    fireEvent.click(dangerCheckBtn);
    fireEvent.click(await screen.findByRole('button', { name: 'None of these' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Answered: None of these');
      expect(document.body.textContent).not.toContain('Nothing flagged');
    });
  });

  it('supports PIN lock without health words, encrypted backup inspection, wrong-passphrase refusal, tampered-file refusal, and two-step delete', async () => {
    const store = new MoonrootStore();
    await store.init();
    const today = getLocalDateKey();
    const nowIso = getLocalStamp();
    await store.saveProfile({
      schemaVersion: 1,
      createdAt: nowIso,
      birthYear: 1998,
      menarcheAge: 13,
      selfRegularity: 'regular',
      lastPeriodApprox: null,
      onHormones: false,
      contraception: 'none',
      sexualHealthQuestions: 'when-relevant',
      intimacy: 'active',
      conditionsNote: '',
      medicationsNote: '',
      sproutName: 'Pip',
      theme: 'dusk',
      units: { temperature: 'C', water: 'ml' },
      reminders: { daily: { on: false, time: '20:00' }, watchlist: true, quietFrom: '22:00', quietTo: '08:00' },
      discreetMode: true,
      lock: { type: 'none' },
      locale: 'en',
      region: 'PK',
      disclaimerAcceptedAt: nowIso,
    });
    await store.saveDayLog({
      date: today,
      filledFrom: 'live',
      flow: 'light',
      symptoms: ['tiredness'],
      danger: [],
      dangerAnswered: true,
      note: 'Existing log kept safe',
      updatedAt: nowIso,
    });

    const { container } = render(<App initialStore={store} />);
    await screen.findByRole('button', { name: /Light flow/i });

    // Open Settings and set a PIN
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await runAxe(container);

    fireEvent.input(screen.getByLabelText(/Set or change PIN/i), { target: { value: '2468' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('PIN lock saved.');
    });

    // Lock screen
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    const unlockBtn = await screen.findByRole('button', { name: 'Unlock' });
    const pinScreenText = document.body.textContent ?? '';
    for (const forbidden of ['period', 'bleeding', 'pain', 'pregnancy', 'cycle']) {
      expect(pinScreenText.toLowerCase()).not.toContain(forbidden);
    }

    // Wrong PIN fails
    fireEvent.input(screen.getByPlaceholderText('PIN'), { target: { value: '0000' } });
    fireEvent.click(unlockBtn);
    await waitFor(() => {
      expect(document.body.textContent).toContain('PIN did not match');
    });

    // Right PIN unlocks
    fireEvent.input(screen.getByPlaceholderText('PIN'), { target: { value: '2468' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('button', { name: /Light flow/i });

    // Build an encrypted backup of different data & test wrong passphrase + tampered file in Settings
    const backupSnapshot = await store.storage.exportAll();
    backupSnapshot.dayLogs = [
      ...backupSnapshot.dayLogs,
      {
        date: '2026-10-01',
        filledFrom: 'backfill',
        flow: 'medium',
        symptoms: [],
        danger: [],
        dangerAnswered: true,
        note: 'From backup',
        updatedAt: nowIso,
      },
    ];
    const lockedBackupJson = await createBackupFile(backupSnapshot, {
      appVersion: '0.1.0',
      exportedAt: nowIso,
      passphrase: 'correct-horse-battery',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const fileInput = screen.getByLabelText(/Restore from backup file/i) as HTMLInputElement;

    // 1. Tampered plain JSON backup check
    const plainJson = await createBackupFile(backupSnapshot, {
      appVersion: '0.1.0',
      exportedAt: nowIso,
    });
    const tampered = plainJson.replace('From backup', 'Tampered backup');
    const tamperedFile = new File([tampered], 'tampered.json', { type: 'application/json' });
    Object.defineProperty(tamperedFile, 'text', { value: async () => tampered });
    fireEvent.change(fileInput, { target: { files: [tamperedFile] } });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Backup checksum failed');
    });

    // 2. Wrong passphrase on encrypted backup refuses restore & preserves existing store
    const lockedFile = new File([lockedBackupJson], 'locked.json', { type: 'application/json' });
    Object.defineProperty(lockedFile, 'text', { value: async () => lockedBackupJson });
    fireEvent.change(fileInput, { target: { files: [lockedFile] } });
    const passInput = await screen.findByLabelText(/Enter backup passphrase/i);
    fireEvent.input(passInput, { target: { value: 'wrong-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace data with this backup' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Wrong passphrase');
    });
    expect(store.snapshot.dayLogs.length).toBe(1);

    // 3. Correct passphrase restores cleanly
    fireEvent.input(passInput, { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace data with this backup' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Backup restored on this device.');
    });
    expect(store.snapshot.dayLogs.length).toBe(2);

    // 4. Two-step Delete all data
    fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    const confirmDelete = screen.getByRole('button', { name: 'Confirm delete everything' });
    expect((confirmDelete as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(screen.getByLabelText('Type DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(confirmDelete);
    await screen.findByRole('button', { name: 'Continue' });
  });
});
