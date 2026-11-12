import { useState } from 'preact/hooks';
import { ASK_QUESTIONS, answerAskQuestion, type AskQuestionId } from '../../core/ask/ask';
import type {
  BackupMeta,
  BodyLog,
  DateKey,
  DayLog,
  Decision,
  Forecast,
  MedicineEntry,
  Profile,
  Stamp,
  Verdict,
} from '../../core/model/types';

interface AskScreenProps {
  today: DateKey;
  nowIso: Stamp;
  profile: Profile;
  dayLogs: readonly DayLog[];
  bodyLogs: readonly BodyLog[];
  decisions: readonly Decision[];
  forecasts: readonly Forecast[];
  medicines: readonly MedicineEntry[];
  verdicts: readonly Verdict[];
  meta: BackupMeta;
  onBack: () => void;
}

export function AskScreen({
  today,
  nowIso,
  profile,
  dayLogs,
  bodyLogs,
  decisions,
  forecasts,
  medicines,
  verdicts,
  meta,
  onBack,
}: AskScreenProps) {
  const [selectedId, setSelectedId] = useState<AskQuestionId>('medicines-this-week');

  const answer = answerAskQuestion(selectedId, {
    today,
    nowIso,
    profile,
    dayLogs,
    bodyLogs,
    decisions,
    forecasts,
    medicines,
    verdicts,
    meta,
  });

  return (
    <div>
      <section aria-label="Ask your record header" style={{ marginBottom: '18px' }}>
        <div class="btn-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 class="screen-title" style={{ marginBottom: '4px' }}>
              Ask your record
            </h1>
            <p class="muted" style={{ margin: 0 }}>
              Tap one of the ten questions below. Answers use only your saved entries on this
              device.
            </p>
          </div>
          <button type="button" class="btn btn-small" onClick={onBack}>
            Back to Record
          </button>
        </div>
      </section>

      <section class="card" aria-label="Questions list">
        <h2 class="card-title">Questions</h2>
        <div class="ask-list">
          {ASK_QUESTIONS.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              class="ask-question-btn"
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <span class="tabular" style={{ marginRight: '6px' }}>
                {idx + 1}.
              </span>
              {item.question}
            </button>
          ))}
        </div>
      </section>

      <section class="card ask-answer-card" aria-label="Answer" aria-live="polite">
        <h2 class="card-title">{answer.question}</h2>
        <span class="ask-date-range tabular">Date range: {answer.dateRange}</span>
        <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>{answer.summary}</p>
        {answer.details.length > 0 && (
          <ul style={{ margin: '0 0 8px 0', paddingLeft: '18px' }}>
            {answer.details.map((line, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>
                {line}
              </li>
            ))}
          </ul>
        )}
        {answer.missingReason && (
          <p class="muted" style={{ margin: 0 }}>
            Missing data: {answer.missingReason}
          </p>
        )}
      </section>
    </div>
  );
}
