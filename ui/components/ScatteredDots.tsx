const DOT_POSITIONS = [
  { left: '4%', top: '4%', size: 8 },
  { left: '92%', top: '6%', size: 9 },
  { left: '95%', top: '18%', size: 5 },
  { left: '3%', top: '92%', size: 7 },
  { left: '90%', top: '91%', size: 9 },
  { left: '83%', top: '95%', size: 5 },
] as const;

export function ScatteredDots({ tone = 'surface' }: { tone?: 'surface' | 'bg' }) {
  const dotFill = tone === 'surface' ? 'var(--bg)' : 'var(--surface)';
  return (
    <span class="dots-deco" aria-hidden="true">
      {DOT_POSITIONS.map((dot, idx) => (
        <span
          key={idx}
          style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: `${dot.size}px`,
            height: `${dot.size}px`,
            borderRadius: '50%',
            backgroundColor: dotFill,
          }}
        />
      ))}
    </span>
  );
}
