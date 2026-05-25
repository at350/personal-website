// Four L-shaped marks pinned to the viewport corners.
const tick = 'pointer-events-none fixed z-40 h-4 w-4 border-stroke'
export default function CornerTicks() {
  return (
    <div aria-hidden className="animate-grid-fade-in">
      <span className={`${tick} left-4 top-4 border-l border-t`} />
      <span className={`${tick} right-4 top-4 border-r border-t`} />
      <span className={`${tick} bottom-4 left-4 border-b border-l`} />
      <span className={`${tick} bottom-4 right-4 border-b border-r`} />
    </div>
  )
}
