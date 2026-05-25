export default function TreeGlyph({ className = '' }: { className?: string }) {
  const edges = [['12,32', '32,16'], ['12,32', '32,32'], ['12,32', '32,48'], ['32,16', '52,10'], ['32,48', '52,54']]
  const nodes = [[12, 32], [32, 16], [32, 32], [32, 48], [52, 10], [52, 54]]
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line key={i} x1={a.split(',')[0]} y1={a.split(',')[1]} x2={b.split(',')[0]} y2={b.split(',')[1]}
          stroke="hsl(var(--accent)/0.6)" strokeWidth="1" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="hsl(var(--accent))"
          className="opacity-35 transition-opacity duration-300 group-hover:opacity-100"
          style={{ filter: 'drop-shadow(0 0 3px hsl(var(--accent)))' }} />
      ))}
    </svg>
  )
}
