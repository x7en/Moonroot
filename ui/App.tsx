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
  playGentleChime,
  prefersLightTheme,
  prefersReducedMotion,
  triggerHaptic,
} from '../platform/web';
import { registerCheckInDeepLink } from '../platform/native';
import { DoctorFileSheet } from './components/DoctorFileSheet';
import { GetHelpSheet } from './components/GetHelpSheet';
import { AskScreen } from './screens/AskScreen';
import { BodyScreen } from './screens/BodyScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PinLockScreen } from './screens/PinLockScreen';
import { CycleScreen } from './screens/CycleScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

type GraphsScreenComponent = typeof import('./screens/GraphsScreen').GraphsScreen;

function isKnownAppPath(): boolean {
  if (typeof window === 'undefined') return true;
  const proto = window.location.protocol;
  if (proto === 'file:' || proto === 'capacitor:') return true;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const normalizedBase = base === '' ? '/' : base;
  return (
    path === normalizedBase ||
    path === '/' ||
    path === `${base}/index.html` ||
    path === '/index.html'
  );
}

function BrandMarkIcon() {
  const iconSrc = `${import.meta.env.BASE_URL}icons/moonroot-icon.svg`;
  return (
    <img
      src={iconSrc}
      alt=""
      width={24}
      height={24}
      class="brand-mark-img"
      aria-hidden="true"
    />
  );
}

type Tab = 'today' | 'cycle' | 'record' | 'body' | 'settings';
type SubView =
  | { kind: 'graphs'; returnTab: 'cycle' | 'body' | 'record' }
  | { kind: 'ask' }
  | null;

interface UndoState {
  date: DateKey;
  previous: DayLog | null;
}

export function App({ initialStore }: { initialStore?: MoonrootStore } = {}) {
  const [store] = useState(() => initialStore ?? new MoonrootStore());
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('today');
  const [subView, setSubView] = useState<SubView>(null);
  const [notFound, setNotFound] = useState(() => !isKnownAppPath());
  const [selectedDate, setSelectedDate] = useState<DateKey>(() => getLocalDateKey());
  const [getHelpOpen, setGetHelpOpen] = useState(false);
  const [doctorFileOpen, setDoctorFileOpen] = useState(false);
  const [GraphsScreenComp, setGraphsScreenComp] = useState<GraphsScreenComponent | null>(null);
  const [saveError, setSaveError] = useState('');
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
    if (subView?.kind === 'graphs' && !GraphsScreenComp) {
      void import('./screens/GraphsScreen').then((mod) => {
        if (active) setGraphsScreenComp(() => mod.GraphsScreen);
      });
    }
    return () => {
      active = false;
    };
  }, [subView, GraphsScreenComp]);

  useEffect(() => {
    let active = true;
    let cleanupDeepLink: () => void = () => {};
    void store.init().then(async () => {
      if (store.snapshot.profile && !store.locked) {
        await store.syncTriageState();
      }
      if (active) {
        setReady(true);
        refresh();
      }
    });
    void registerCheckInDeepLink(() => {
      if (!active) return;
      setNotFound(false);
      setSubView(null);
      setTab('today');
      setSelectedDate(getLocalDateKey());
      refresh();
    }).then((unsub) => {
      if (active) {
        cleanupDeepLink = unsub;
      } else {
        unsub();
      }
    });
    return () => {
      active = false;
      cleanupDeepLink();
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
      if (petalTimerRef.current !== null) window.clearTimeout(petalTimerRef.current);
      if (stageUpTimerRef.current !== null) window.clearTimeout(stageUpTimerRef.current);
    };
  }, [store]);

  const profile = store.snapshot.profile;
  const reducedMotion = Boolean(profile?.reducedMotion) || prefersReducedMotion();
  const hapticsEnabled = profile?.haptics !== false;
  const soundEnabled = Boolean(profile?.sound);
  const rawTheme = profile?.theme ?? 'dawn';
  const resolvedTheme =
    rawTheme === 'auto'
      ? prefersLightTheme()
        ? 'dawn'
        : 'dusk'
      : canUseTheme(rawTheme, store.snapshot.companion)
        ? rawTheme
        : 'dawn';
  const nightGarden = store.snapshot.companion.stage >= 6;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
    document.documentElement.setAttribute('data-night-garden', nightGarden ? 'true' : 'false');
  }, [resolvedTheme, reducedMotion, nightGarden]);

  function goToday(): void {
    if (notFound && typeof window !== 'undefined') {
      const base = import.meta.env.BASE_URL || '/';
      try {
        window.history.replaceState(null, '', base);
      } catch {
        // Ignore history restriction in non-HTTP contexts
      }
    }
    setNotFound(false);
    setSubView(null);
    setTab('today');
  }

  async function runSave<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setSaveError('');
    try {
      return await fn();
    } catch {
      setSaveError("Couldn't save. Your entry is still here. Try again.");
      return undefined;
    }
  }

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
      playGentleChime('stage-up', soundEnabled);
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

  if (notFound) {
    return (
      <div class="app-shell">
        <header class="top-bar">
          <button type="button" class="brand-wordmark" onClick={goToday}>
            <BrandMarkIcon />
            <span>Moonroot</span>
          </button>
          <button type="button" class="btn btn-help" onClick={() => setGetHelpOpen(true)}>
            Get help
          </button>
        </header>
        <main>
          <section class="card" aria-label="Page not found">
            <h1 class="screen-title">Page not found</h1>
            <p>This page is not in Moonroot.</p>
            <button type="button" class="btn btn-primary" onClick={goToday}>
              Today
            </button>
          </section>
        </main>
        <GetHelpSheet
          open={getHelpOpen}
          under18={Boolean(profile && isUnder18(profile, today))}
          regionInfo={getRegionEmergencyInfo(profile?.region ?? 'PK')}
          onClose={() => setGetHelpOpen(false)}
        />
      </div>
    );
  }

  if (!profile || !profile.disclaimerAcceptedAt) {
    return (
      <div class="app-shell">
        <header class="top-bar">
          <button type="button" class="brand-wordmark" onClick={goToday}>
            <BrandMarkIcon />
            <span>Moonroot</span>
          </button>
          <button type="button" class="btn btn-help" onClick={() => setGetHelpOpen(true)}>
            Get help
          </button>
        </header>
        <OnboardingScreen
          today={today}
          nowIso={nowIso}
          onComplete={async (nextProfile) => {
            await runSave(async () => {
              await store.saveProfile(nextProfile);
              await store.syncTriageState();
              refresh();
            });
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
    const prev = await runSave(() => store.saveDayLog(log));
    if (prev === undefined) return;
    triggerHaptic('light', hapticsEnabled, reducedMotion);
    playGentleChime('checkin', soundEnabled);
    const currentStage = store.lastCompanionEvent?.newStage ?? store.snapshot.companion.stage;
    if (currentStage >= 1) {
      fireReaction('other');
    }
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
    const snap = undoState;
    const ok = await runSave(() => store.restorePreviousDayLog(snap.date, snap.previous));
    if (ok === undefined && saveError) return;
    setUndoState(null);
    refresh();
  }

  async function handleSaveProfile(next: Profile): Promise<void> {
    await runSave(async () => {
      await store.saveProfile(next);
      await store.syncTriageState();
      refresh();
    });
  }

  async function handleSaveBodyLog(log: BodyLog): Promise<void> {
    const prev = await runSave(() => store.saveBodyLog(log));
    if (prev === undefined) return;
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
    const currentStage = store.lastCompanionEvent?.newStage ?? store.snapshot.companion.stage;
    if (currentStage >= 1) {
      fireReaction(reaction);
    }
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
    await runSave(async () => {
      await store.saveDayLog(nextLog);
      refresh();
    });
  }

  return (
    <div class="app-shell" data-tick={tick}>
      <header class="top-bar">
        <button type="button" class="brand-wordmark" onClick={goToday}>
          <BrandMarkIcon />
          <span>Moonroot</span>
        </button>
        <div class="top-actions">
          <button type="button" class="btn btn-help" onClick={() => setGetHelpOpen(true)}>
            Get help
          </button>
          <button
            type="button"
            class="btn btn-small"
            aria-current={tab === 'settings' && subView === null ? 'page' : undefined}
            onClick={() => {
              setSubView(null);
              setTab('settings');
            }}
          >
            Settings
          </button>
          {profile.lock.type === 'pin' && (
            <button
              type="button"
              class="btn btn-small"
              onClick={() => {
                setSubView(null);
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
        {saveError && (
          <div class="notice-banner row-stack" role="alert">
            <span>{saveError}</span>
            <button type="button" class="btn btn-small" onClick={() => setSaveError('')}>
              Dismiss
            </button>
          </div>
        )}

        {subView?.kind === 'graphs' &&
          (GraphsScreenComp ? (
            <GraphsScreenComp
              today={today}
              nowIso={nowIso}
              profile={profile}
              dayLogs={store.snapshot.dayLogs}
              bodyLogs={store.snapshot.bodyLogs}
              decisions={store.snapshot.decisions}
              forecasts={store.snapshot.forecasts}
              medicines={store.snapshot.medicines}
              verdicts={store.snapshot.verdicts}
              watchItems={store.snapshot.watchItems}
              visits={store.snapshot.visits}
              meta={store.snapshot.meta}
              returnLabel={
                subView.returnTab === 'cycle'
                  ? 'Cycle'
                  : subView.returnTab === 'body'
                    ? 'Body'
                    : 'Record'
              }
              onBack={() => {
                const target = subView.returnTab;
                setSubView(null);
                setTab(target);
              }}
            />
          ) : (
            <section class="card" aria-label="Loading graphs">
              <p style={{ margin: 0 }}>Loading graphs...</p>
            </section>
          ))}

        {subView?.kind === 'ask' && (
          <AskScreen
            today={today}
            nowIso={nowIso}
            profile={profile}
            dayLogs={store.snapshot.dayLogs}
            bodyLogs={store.snapshot.bodyLogs}
            decisions={store.snapshot.decisions}
            forecasts={store.snapshot.forecasts}
            medicines={store.snapshot.medicines}
            verdicts={store.snapshot.verdicts}
            meta={store.snapshot.meta}
            onBack={() => {
              setSubView(null);
              setTab('record');
            }}
          />
        )}

        {subView === null && tab === 'today' && (
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
              await runSave(async () => {
                await store.saveDecision(dec);
                applyCompanionOutcome(store.lastCompanionEvent);
                refresh();
              });
            }}
            onDismissEvent={async (verdictId) => {
              await runSave(async () => {
                await store.dismissEventCard(verdictId);
                refresh();
              });
            }}
            onDismissStandingPrompt={async (
              ruleId: StandingFlagId,
              title: string,
              reason: string,
            ) => {
              await runSave(async () => {
                await store.dismissStandingPrompt(ruleId, title, reason);
                refresh();
              });
            }}
            onAnswerWatchItem={async (watchId, answers) => {
              await runSave(async () => {
                await store.answerWatchCheck(watchId, answers);
                applyCompanionOutcome(store.lastCompanionEvent);
                refresh();
              });
            }}
            onSaveMedicine={async (entry: MedicineEntry) => {
              await runSave(async () => {
                await store.saveMedicine(entry);
                refresh();
              });
            }}
            onSaveVisit={async (visit: DoctorVisit) => {
              await runSave(async () => {
                await store.saveVisit(visit);
                refresh();
              });
            }}
            onOpenWeeklyReview={async () => {
              const out = await store.openWeeklyReview(today, nowIso);
              applyCompanionOutcome(out);
              refresh();
            }}
            onOpenGetHelp={() => setGetHelpOpen(true)}
          />
        )}

        {subView === null && tab === 'cycle' && (
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
              setSubView(null);
              setTab('today');
            }}
            onSaveApproximatePeriod={async (startDate, durationDays) => {
              await runSave(async () => {
                await store.saveApproximatePeriod(startDate, durationDays, nowIso);
                refresh();
              });
            }}
            onSaveDecision={async (dec: Decision) => {
              await runSave(async () => {
                await store.saveDecision(dec);
                refresh();
              });
            }}
            onDeleteDecision={async (id) => {
              await runSave(async () => {
                await store.deleteDecision(id);
                refresh();
              });
            }}
            onOpenGraphs={() => setSubView({ kind: 'graphs', returnTab: 'cycle' })}
          />
        )}

        {subView === null && tab === 'record' && (
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
              setSubView(null);
              setTab('today');
            }}
            onSaveDecision={async (dec: Decision) => {
              await runSave(async () => {
                await store.saveDecision(dec);
                applyCompanionOutcome(store.lastCompanionEvent);
                refresh();
              });
            }}
            onDeleteDecision={async (id) => {
              await runSave(async () => {
                await store.deleteDecision(id);
                refresh();
              });
            }}
            onDeleteMedicine={async (id) => {
              await runSave(async () => {
                await store.deleteMedicine(id);
                refresh();
              });
            }}
            onSaveVisit={async (visit: DoctorVisit) => {
              await runSave(async () => {
                await store.saveVisit(visit);
                refresh();
              });
            }}
            onDismissEvent={async (verdictId) => {
              await runSave(async () => {
                await store.dismissEventCard(verdictId);
                refresh();
              });
            }}
            onOpenDoctorFile={() => {
              void store.markDoctorFileCreated(today).then((out) => {
                applyCompanionOutcome(out);
                refresh();
              });
              setDoctorFileOpen(true);
            }}
            onQuickExportBackup={() => {
              setSubView(null);
              setTab('settings');
            }}
            onSnoozeBackup={async () => {
              await store.snoozeBackupNudge();
              refresh();
            }}
            onOpenGraphs={() => setSubView({ kind: 'graphs', returnTab: 'record' })}
            onOpenAsk={() => setSubView({ kind: 'ask' })}
          />
        )}

        {subView === null && tab === 'body' && (
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
            onOpenGraphs={() => setSubView({ kind: 'graphs', returnTab: 'body' })}
            onTapSprout={goToday}
          />
        )}

        {subView === null && tab === 'settings' && (
          <SettingsScreen
            today={today}
            profile={profile}
            companion={store.snapshot.companion}
            reminderPlan={store.getReminderPlan(today)}
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
            aria-current={subView === null && tab === 'today' ? 'page' : undefined}
            onClick={() => {
              setSubView(null);
              setTab('today');
            }}
          >
            Today
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={subView === null && tab === 'cycle' ? 'page' : undefined}
            onClick={() => {
              setSubView(null);
              setTab('cycle');
            }}
          >
            Cycle
          </button>
          <button
            type="button"
            class="nav-log-fab"
            aria-label="Log today"
            onClick={() => {
              setSelectedDate(today);
              setSubView(null);
              setTab('today');
            }}
          >
            Log
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={subView === null && tab === 'record' ? 'page' : undefined}
            onClick={() => {
              setSubView(null);
              setTab('record');
            }}
          >
            Record
          </button>
          <button
            type="button"
            class="nav-tab"
            aria-current={subView === null && tab === 'body' ? 'page' : undefined}
            onClick={() => {
              setSubView(null);
              setTab('body');
            }}
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
