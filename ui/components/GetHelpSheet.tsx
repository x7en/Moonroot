import type { RegionEmergencyInfo } from '../../app/store';

interface GetHelpSheetProps {
  open: boolean;
  under18: boolean;
  regionInfo: RegionEmergencyInfo;
  onClose: () => void;
}

export function GetHelpSheet({ open, under18, regionInfo, onClose }: GetHelpSheetProps) {
  if (!open) return null;

  return (
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="get-help-title">
      <div class="sheet">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h2 id="get-help-title" class="card-title" style={{ margin: 0 }}>
            Get help
          </h2>
          <button type="button" class="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <p class="notice-banner">
          Moonroot is a journal and is not for emergencies. If you need urgent care now, call local
          emergency services.
        </p>

        <div class="card">
          <h3 class="card-title">Emergency numbers ({regionInfo.name})</h3>
          {regionInfo.emergency.length === 0 ? (
            <p class="muted">
              No preset emergency number is stored for your region. Call your local emergency
              service or go to the nearest hospital.
            </p>
          ) : (
            <div class="btn-row">
              {regionInfo.emergency.map((item) => (
                <a
                  key={item.number}
                  href={`tel:${item.number}`}
                  class="btn btn-danger-solid"
                  aria-label={`Call ${item.label} at ${item.number}`}
                >
                  Call {item.number} · {item.label}
                </a>
              ))}
            </div>
          )}

          {regionInfo.mentalHealthLine.trim() !== '' && (
            <p style={{ marginTop: '12px' }}>
              Local support line:{' '}
              <a href={`tel:${regionInfo.mentalHealthLine}`} class="btn btn-small">
                Call {regionInfo.mentalHealthLine}
              </a>
            </p>
          )}
        </div>

        <div class="card">
          <p style={{ marginTop: 0 }}>
            If you feel unsafe, or you are thinking of hurting yourself, tell someone you trust now,
            or call the emergency number above.
          </p>
          <p style={{ marginBottom: 0 }}>
            {under18
              ? 'If someone is hurting you, or made you do something you did not want, you can tell a parent, relative or school nurse.'
              : 'If someone is hurting you, or made you do something you did not want, you can tell a doctor, a nurse or an adult you trust.'}
          </p>
        </div>
      </div>
    </div>
  );
}
