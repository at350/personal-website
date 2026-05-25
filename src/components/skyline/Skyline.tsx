import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import TowerField, { type HoverInfo } from './TowerField'
import type { ContributionData } from '../../lib/contributions'

interface Props {
  data: ContributionData
  reduced: boolean
}

// Default export so it can be lazy-imported.
export default function Skyline({ data, reduced }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null)

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [14, 11, 18], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 16, 10]} intensity={1.1} />
        <directionalLight position={[-10, 6, -8]} intensity={0.3} color="#63d4c2" />
        <fog attach="fog" args={['#13181d', 28, 60]} />
        <group position={[0, -0.5, 0]}>
          <TowerField data={data} animate={!reduced} onHover={setHover} />
        </group>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={!reduced}
          autoRotateSpeed={0.45}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* hover readout (DOM, not in the 3D scene) */}
      <div
        className="pointer-events-none absolute left-4 top-4 font-mono text-xs text-muted transition-opacity"
        style={{ opacity: hover ? 1 : 0 }}
      >
        {hover && (
          <span className="rounded-md border border-stroke bg-surface/80 px-2 py-1 backdrop-blur">
            <span className="text-text-primary">{hover.count}</span> contribution
            {hover.count === 1 ? '' : 's'} · {hover.date}
          </span>
        )}
      </div>
    </div>
  )
}
