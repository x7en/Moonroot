import { useEffect, useRef, useState } from 'preact/hooks';
import {
  getRegionEmergencyInfo,
  makeDefaultProfile,
  makeEmptyDayLog,
  MoonrootStore,
  type CompanionUpdateOutcome,
} from '../app/store';
import { canUseTheme, deriveSproutMood } from '../core/companion/companion';
import { isUnder18 } from '../core/model/dates';
import type {
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  DoctorVisit,
  MedicineEntry,
  Profile,
  SproutReaction,
  StandingFlagId,
} from '../core/model/types';
import {
  getLocalDateKey,
  getLocalStamp,
  prefersLightTheme,
  prefersReducedMotion,
  triggerHaptic,
} from '../platform/web';
import { DoctorFileSheet } from './components/DoctorFileSheet';
import { GetHelpSheet } from './components/GetHelpSheet';
import { BodyScreen } from './screens/BodyScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PinLockScreen } from './screens/PinLockScreen';
import { CycleScreen } from './screens/CycleScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

type Tab = 'today' | 'cycle' | 'record' | 'body' | 'settings';

interface UndoState {
  date: DateKey;
  previous: DayLog | null;
}

export function App({ initialStore }: { initialStore?: MoonrootStore } = {}) {
  const [store] = useState(() => initialStore ?? new MoonrootStore());
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('today');
  const [selectedDate, setSelectedDate] = useState<DateKey>(() => getLocalDateKey());
  const [getHelpOpen, setGetHelpOpen] = useState(false);
  const [doctorFileOpen, setDoctorFileOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [activeReaction, setActiveReaction] = useState<SproutReaction | null>(null);
  const [activePetalBurst, setActivePetalBurst] = useState(false);
  const [activeStageUp, setActiveStageUp] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const petalTimerRef = useRef<number | null>(null);
  const stageUpTimerRef = useRef<number | null>(null);

  const today = getLocalDateKey();
  const nowIso = getLocalStamp();
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;
    void store.init().then(async () => {
      if (store.snapshot.profile && !store.locked) {
        await store.syncTriageState();
      }
      if (active) {
        setReady(true);
        refresh();
      }
    });
    return () => {
      active = false;
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
      if (petalTimerRef.current !== null) window.clearTimeout(petalTimerRef.current);
      if (stageUpTimerRef.current !== null) window.clearTimeout(stageUpTimerRef.current);
    };
  }, [store]);

  const profile = store.snapshot.profile;
  const reducedMotion = Boolean(profile?.reducedMotion) || prefersReducedMotion();
  const hapticsEnabled = profile?.haptics !== false;
  const rawTheme = profile?.theme ?? 'dusk';
  const resolvedTheme =
    rawTheme === 'auto'
      ? prefersLightTheme()
        ? 'dawn'
        : 'dusk'
      : canUseTheme(rawTheme, store.snapshot.companion)
        ? rawTheme
        : 'dusk';
  const nightGarden = store.snapshot.companion.stage >= 6;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
    document.documentElement.setAttribute('data-night-garden', nightGarden ? 'true' : 'false');
  }, [resolvedTheme, reducedMotion, nightGarden]);

  function fireReaction(reaction: SproutReaction): void {
    setActiveReaction(reaction);
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = window.setTimeout(() => {
      setActiveReaction(null);
    }, 850);
  }

  function applyCompanionOutcome(outcome: CompanionUpdateOutcome | null): void {
    if (!outcome) return;
    if (outcome.stageChanged) {
      setActiveStageUp(true);
      if (stageUpTimerRef.current !== null) window.clearTimeout(stageUpTimerRef.current);
      stageUpTimerRef.current = window.setTimeout(() => {
        setActiveStageUp(false);
      }, 1200);
      triggerHaptic('medium', hapticsEnabled, reducedMotion);
    }
    if (outcome.newlyEarnedBadges.length > 0 && outcome.newStage >= 2) {
      setActivePetalBurst(true);
      if (petalTimerRef.current !== null) window.clearTimeout(petalTimerRef.current);
      petalTimerRef.current = window.setTimeout(() => {
        setActivePetalBurst(false);
      }, 850);
    }
  }

  if (!ready) {
    return (
      <main class="app-shell">
        <div class="card">
          <p style={{ margin: 0 }}>Loading Moonroot...</p>
        </div>
      </main>
    );
  }

  if (store.locked) {
    return (
      <PinLockScreen
        stage={store.snapshot.companion.stage}
        rings={store.snapshot.companion.rings}
        sproutName={profile?.sproutName ?? null}
        reducedMotion={reducedMotion}
        onUnlock={async (pin) => {
          const ok = await store.unlockWithPin(pin);
          if (ok) {
            await store.syncTriageState();
          }
          refresh();
          return ok;
        }}
      />
    );
  }

  if (!profile || !profile.disclaimerAcceptedAt) {
    return (
      <div class="app-shell">
        <header class="top-bar">
          <h1 class="brand-title">Moonroot</h1>
          <button type="button" class="btn btn-help" onClick={() => setGetHelpOpen(true)}>
            Get help
          </button>
        </header>
        <OnboardingScreen
          today={today}
          nowIso={nowIso}
          onComplete={async (nextProfile) => {
            await store.saveProfile(nextProfile);
            await store.syncTriageState();
            refresh();
          }}
        />
        <GetHelpSheet
          open={getHelpOpen}
          under18={true}
          regionInfo={getRegionEmergencyInfo('PK')}
          onClose={() => setGetHelpOpen(false)}
        />
      </div>
    );
  }

  const under18 = isUnder18(profile, today);
  const regionInfo = getRegionEmergencyInfo(profile.region);

  async function handleSaveDayLog(log: DayLog): Promise<void> {
    const prev = await store.saveDayLog(log);
    triggerHaptic('light', hapticsEnabled, reducedMotion);
    fireReaction('other');
    applyCompanionOutcome(store.lastCompanionEvent);
    refresh();
    setUndoState({ date: log.date, previous: prev });
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoState(null);
    }, 5000);
  }

  async function handleUndo(): Promise<void> {
    if (!undoState) return;
    await store.restorePreviousDayLog(undoState.date, undoState.previous);
    setUndoState(null);
    refresh();
  }

  async function handleSaveProfile(next: Profile): Promise<void> {
    await store.saveProfile(next);
    await store.syncTriageState();
    refresh();
  }

  async function handleSaveBodyLog(log: BodyLog): Promise<void> {
    const prev = await store.saveBodyLog(log);
    const waterChanged = JSON.stringify(prev?.water) !== JSON.stringify(log.water) && log.water;
    const sleepChanged = JSON.stringify(prev?.sleep) !== JSON.stringify(log.sleep) && log.sleep;
    const mealsChanged = JSON.stringify(prev?.meals) !== JSON.stringify(log.meals) && log.meals;
    const reaction: SproutReaction = waterChanged
      ? 'water'
      : sleepChanged
        ? 'sleep'
        : mealsChanged
          ? 'meal'
          : 'other';
    fireReaction(reaction);
    applyCompanionOutcome(store.lastCompanionEvent);
    refresh();
  }

  async function handleSaveStress(
    date: DateKey,
    stress: 1 | 2 | 3 | 4 | 5 | undefined,
  ): Promise<void> {
    const existing = store.getDayLog(date) ?? makeEmptyDayLog(date, nowIso);
    const nextContext = { ...existing.context };
    if (stress === undefined) {
      delete nextContext.stress;
    } else {
      nextContext.stress = stress;
    }
    const nextLog: DayLog = {
      ...existing,
      context: Object.keys(nextContext).length > 0 ? nextContext : undefined,
      updatedAt: nowIso,
    };
    await store.saveDayLog(nextLog);
    refresh();
  }

  return (
    <div class="app-shell" data-tick={tick}>
      <header class="top-bar">
        <h1 class="brand-title">Moonroot</h1>
        <div class="top-actions">
          <button type="button" class="btn btn-help" onClick={() => setGetHelpOpen(true)}>
            Get help
          </button>
          <button
            type="button"
            class="btn btn-small"
            aria-current={tab === 'settings' ? 'page' : undefined}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
          {profile.lock.type === 'pin' && (
            <button
              type="button"
              class="btn btn-small"
              onClick={() => {
                setTab('today');
                store.locked = true;
                refresh();
              }}
            >
              Lock
            </button>
          )}
        </div>
      </header>

      <main>
        {tab === 'today' && (
          <TodayScreen
            today={today}
            selectedDate={selectedDate}
            nowIso={nowIso}
            profile={profile}
            dayLog={store.getDayLog(selectedDate)}
            dayLogs={store.snapshot.dayLogs}
            bodyLogs={store.snapshot.bodyLogs}
            decisions={store.snapshot.decisions}
            forecasts={store.snapshot.forecasts}
            medicines={store.snapshot.medicines}
            verdicts={store.snapshot.verdicts}
            watchItems={store.snapshot.watchItems}
            visits={store.snapshot.visits}
            companion={store.snapshot.companion}
            activeReaction={activeReaction}
            activePetalBurst={activePetalBurst}
            activeStageUp={activeStageUp}
            reducedMotion={reducedMotion}
            onChangeDate={(date) => setSelectedDate(date)}
            onSaveDayLog={handleSaveDayLog}
            onSaveDecision={async (dec: Decision) => {
              await store.saveDecision(dec);
              applyCompanionOutcome(store.lastCompanionEvent);
              refresh();
            }}
            onDismissEvent={async (verdictId) => {
              await store.dismissEventCard(verdictId);
              refresh();
            }}
            onDismissStandingPrompt={async (
              ruleId: StandingFlagId,
              title: string,
              reason: string,
            ) => {
              await store.dismissStandingPrompt(ruleId, title, reason);
              refresh();
            }}
            onAnswerWatchItem={async (watchId, answers) => {
              await store.answerWatchCheck(watchId, answers);
              applyCompanionOutcome(store.lastCompanionEvent);
              refresh();
            }}
            onSaveMedicine={async (entry: MedicineEntry) => {
              await store.saveMedicine(entry);
              refresh();
            }}
            onSaveVisit={async (visit: DoctorVisit) => {
              await store.saveVisit(visit);
              refresh();
            }}
            onOpenWeeklyReview={async () => {
              const out = await store.openWeeklyReview(today, nowIso);
              applyCompanionOutcome(out);
              refresh();
            }}
            onOpenGetHelp={() => setGetHelpOpen(true)}
          />
        )}

        {tab === 'cycle' && (
          <CycleScreen
            today={today}
            nowIso={nowIso}
            profile={profile}
            dayLogs={store.snapshot.dayLogs}
            decisions={store.snapshot.decisions}
            forecasts={store.snapshot.forecasts}
            medicines={store.snapshot.medicines}
            verdicts={store.snapshot.verdicts}
            watchItems={store.snapshot.watchItems}
            visits={store.snapshot.visits}
            meta={store.snapshot.meta}
            onEditDay={(date) => {
              setSelectedDate(date);
              setTab('today');
            }}
            onSaveApproximatePeriod={async (startDate, durationDays) => {
              await store.saveApproximatePeriod(startDate, durationDays, nowIso);
              refresh();
            }}
            onSaveDecision={async (dec: Decision) => {
              await store.saveDecision(dec);
              refresh();
            }}
            onDeleteDecision={async (id) => {
              await store.deleteDecision(id);
              refresh();
            }}
          />
        )}

        {tab === 'record' && (
          <RecordScreen
            today={today}
            nowIso={nowIso}
            profile={profile}
            dayLogs={store.snapshot.dayLogs}
            decisions={store.snapshot.decisions}
            medicines={store.snapshot.medicines}
            verdicts={store.snapshot.verdicts}
            watchItems={store.snapshot.watchItems}
            visits={store.snapshot.visits}
            meta={store.snapshot.meta}
            companion={store.snapshot.companion}
            onEditDay={(date) => {
              setSelectedDate(date);
              setTab('today');
            }}
            onSaveDecision={async (dec: Decision) => {
              await store.saveDecision(dec);
              applyCompanionOutcome(store.lastCompanionEvent);
              refresh();
            }}
            onDeleteDecision={async (id) => {
              await store.deleteDecision(id);
              refresh();
            }}
            onDeleteMedicine={async (id) => {
              await store.deleteMedicine(id);
              refresh();
            }}
            onSaveVisit={async (visit: DoctorVisit) => {
              await store.saveVisit(visit);
              refresh();
            }}
            onDismissEvent={async (verdictId) => {
              await store.dismissEventCard(verdictId);
              refresh();
            }}
            onOpenDoctorFile={() => {
              void store.markDoctorFileCreated(today).then((out) => {
                applyCompanionOutcome(out);
                refresh();
              });
              setDoctorFileOpen(true);
            }}
            onQuickExportBackup={() => setTab('settings')}
            onSnoozeBackup={async () => {
              await store.snoozeBackupNudge();
              refresh();
            }}
          />
        )}

        {tab === 'body' && (
          <BodyScreen
            today={today}
            selectedDate={selectedDate}
            nowIso={nowIso}
            profile={profile}
            dayLogs={store.snapshot.dayLogs}
            bodyLogs={store.snapshot.bodyLogs}
            companion={store.snapshot.companion}
            mood={deriveSproutMood({
              today,
              dayLogs: store.snapshot.dayLogs,
              companion: store.snapshot.companion,
            })}
            activeReaction={activeReaction}
            reducedMotion={reducedMotion}
            onChangeDate={(date) => setSelectedDate(date)}
            onSaveBodyLog={handleSaveBodyLog}
            onSaveStress={handleSaveStress}
          />
        )}

        {tab === 'settings' && (
          <SettingsScreen
            today={today}
            profile={profile}
            companion={store.snapshot.companion}
            onSaveProfile={handleSaveProfile}
            onSetPin={async (pin) => {
              await store.setPin(pin);
              refresh();
            }}
            onExportBackup={(passphrase) => store.exportBackup(passphrase).then((res) => {
              applyCompanionOutcome(store.lastCompanionEvent);
              refresh();
              return res;
            })}
            onInspectBackup={(raw) => store.inspectBackup(raw)}
            onRestoreBackup={async (raw, passphrase) => {
              await store.restoreBackup(raw, passphrase);
              refresh();
            }}
            onDownloadFile={(filename, content, mime) =>
              store.downloadFile(filename, content, mime)
            }
            onDeleteAll={async () => {
              await store.deleteAllData();
              setSelectedDate(today);
              setTab('today');
              refresh();
            }}
          />
        )}
      </main>

      {undoState && (
        <div class="toast" role="status" aria-live="polite">
          <span>Saved {undoState.date}.</span>
          <button type="button" class="btn btn-small" onClick={() => void handleUndo()}>
            Undo
          </button>
        </div>
      )}

      <nav class="bottom-nav" aria-label="Main navigation">
        <div class="bottom-nav-inner">
          <button
            type="button"
            class="nav-tab"
            aria-current={tab === 'today' ? 'page' : undefined}
            onClick={() => setTab('today')}
          >
            Today
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={tab === 'cycle' ? 'page' : undefined}
            onClick={() => setTab('cycle')}
          >
            Cycle
          </button>
          <button
            type="button"
            class="nav-log-fab"
            aria-label="Log today"
            onClick={() => {
              setSelectedDate(today);
              setTab('today');
            }}
          >
            Log
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={tab === 'record' ? 'page' : undefined}
            onClick={() => setTab('record')}
          >
            Record
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={tab === 'body' ? 'page' : undefined}
            onClick={() => setTab('body')}
          >
            Body
          </button>
        </div>
      </nav>

      <GetHelpSheet
        open={getHelpOpen}
        under18={under18}
        regionInfo={regionInfo}
        onClose={() => setGetHelpOpen(false)}
      />

      <DoctorFileSheet
        open={doctorFileOpen}
        today={today}
        under18={under18}
        profile={profile ?? makeDefaultProfile(nowIso)}
        dayLogs={store.snapshot.dayLogs}
        bodyLogs={store.snapshot.bodyLogs}
        medicines={store.snapshot.medicines}
        visits={store.snapshot.visits}
        decisions={store.snapshot.decisions}
        verdicts={store.snapshot.verdicts}
        watchItems={store.snapshot.watchItems}
        forecasts={store.snapshot.forecasts}
        onDownload={(filename, content, mime) => store.downloadFile(filename, content, mime)}
        onDoctorFileCreated={() => {
          void store.markDoctorFileCreated(today).then((out) => {
            applyCompanionOutcome(out);
            refresh();
          });
        }}
        onClose={() => setDoctorFileOpen(false)}
      />
    </div>
  );
}
