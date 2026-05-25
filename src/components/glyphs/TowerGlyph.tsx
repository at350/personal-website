export default function TowerGlyph({ className = '' }: { className?: string }) {
  const plates = [[32, 50, 24, 10], [32, 38, 19, 8], [32, 27, 14, 6], [32, 17, 9, 4]] as const
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      {plates.map(([cx, cy, rx, ry], i) => (
        <path key={i} d={`M${cx},${cy - ry} L${cx - rx},${cy} L${cx},${cy + ry} L${cx + rx},${cy} Z`}
          stroke="hsl(var(--accent))" strokeWidth="1" />
      ))}
      {plates.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
