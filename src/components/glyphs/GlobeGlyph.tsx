export default function GlobeGlyph({ className = '' }: { className?: string }) {
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2
    return { x: 32 + Math.cos(a) * 20, y: 32 + Math.sin(a) * 20 }
  })
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none">
      <circle cx="32" cy="32" r="20" stroke="hsl(var(--line)/0.5)" strokeWidth="1" />
      <ellipse cx="32" cy="32" rx="20" ry="8" stroke="hsl(var(--line)/0.5)" strokeWidth="1" />
      {nodes.map((n, i) => (
        <line key={i} x1="32" y1="32" x2={n.x} y2={n.y} stroke="hsl(var(--accent)/0.6)" strokeWidth="0.75" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
