export default function GridGlyph({ className = '' }: { className?: string }) {
  const cells: [number, number][] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([12 + c * 13, 12 + r * 13])
  const clustered = new Set([5, 6, 9, 10]) // center cells glow as a cluster
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      {cells.map(([x, y], i) => (
        <rect key={i} x={x - 4} y={y - 4} width="8" height="8" rx="1" stroke="hsl(var(--line)/0.5)" strokeWidth="0.75" />
      ))}
      {cells.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="hsl(var(--accent))"
          className={`transition-opacity duration-300 group-hover:opacity-100 ${clustered.has(i) ? 'opacity-70' : 'opacity-35'}`}
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
