import type { Flow } from '../../core/model/types';

export interface FlowOption {
  value: Flow;
  label: string;
  ariaBase: string;
}

export const FLOW_OPTIONS: readonly FlowOption[] = [
  { value: 'none', label: 'None', ariaBase: 'No flow, 0 of 3 drops' },
  { value: 'spotting', label: 'Spotting', ariaBase: 'Spotting, tiny drop' },
  { value: 'light', label: 'Light', ariaBase: 'Light flow, 1 of 3 drops' },
  { value: 'medium', label: 'Medium', ariaBase: 'Medium flow, 2 of 3 drops' },
  { value: 'heavy', label: 'Heavy', ariaBase: 'Heavy flow, 3 of 3 drops' },
  { value: 'unsure', label: 'Not sure', ariaBase: 'Flow not sure' },
] as const;

export function FlowGlyph({ flow, selected }: { flow: Flow; selected: boolean }) {
  const stroke = 'currentColor';
  const fill = selected ? 'var(--flow)' : 'none';

  if (flow === 'none') {
    return (
      <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
        <circle cx="14" cy="10" r="6" fill="none" stroke={stroke} strokeWidth={selected ? 2.5 : 1.75} />
      </svg>
    );
  }

  if (flow === 'unsure') {
    return (
      <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
        <circle
          cx="14"
          cy="10"
          r="6"
          fill="none"
          stroke={stroke}
          strokeWidth={selected ? 2.5 : 1.75}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  if (flow === 'spotting') {
    return (
      <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
        <path
          d="M14 5c-2.2 3.2-3 5-3 6.5a3 3 0 1 0 6 0c0-1.5-.8-3.3-3-6.5Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      </svg>
    );
  }

  const count = flow === 'light' ? 1 : flow === 'medium' ? 2 : 3;
  const xs = count === 1 ? [14] : count === 2 ? [9.5, 18.5] : [6.5, 14, 21.5];

  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
      {xs.map((cx) => (
        <path
          key={cx}
          d={`M${cx} 3.5c-2.3 3.7-3.3 5.8-3.3 7.6a3.3 3.3 0 1 0 6.6 0c0-1.8-1-3.9-3.3-7.6Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      ))}
    </svg>
  );
}
