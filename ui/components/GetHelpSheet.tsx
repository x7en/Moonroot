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
              No preset number is saved for this region. Call local emergency care or visit a
              hospital.
            </p>
          ) : (
            <div class="btn-row">
              {regionInfo.emergency.map((item) => (
                <a
                  key={item.number}
                  href={`tel:${item.number}`}
                  class="btn btn-primary"
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
            If you feel unsafe or may hurt yourself, tell someone you trust now. You can also call
            an emergency number above.
          </p>
          <p style={{ marginBottom: 0 }}>
            {under18
              ? 'If someone is hurting you, tell a parent, relative or school nurse.'
              : 'If someone is hurting you, tell a doctor, nurse or trusted adult.'}
          </p>
        </div>
      </div>
    </div>
  );
}
