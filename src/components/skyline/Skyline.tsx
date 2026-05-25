import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import TowerField, { type HoverInfo } from './TowerField'
import type { ContributionData } from '../../lib/contributions'

interface Props {
  data: ContributionData
  reduced: boolean
}

// Reframe the camera by viewport aspect so the long contribution strip composes
// well from phone (portrait, higher/closer) to desktop (wide, low hero angle).
function Rig() {
  const { camera, size } = useThree()
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    let pos: [number, number, number]
    if (aspect < 1.0) pos = [6, 25, 13]
    else if (aspect < 1.5) pos = [10, 17, 16]
    else pos = [13, 11, 18]
    camera.position.set(...pos)
    camera.lookAt(0, 0, 0)
  }, [camera, size.width, size.height])
  return null
}

// Default export so it can be lazy-imported.
export default function Skyline({ data, reduced }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null)

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [13, 11, 18], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        aria-hidden="true"
      >
        <Rig />
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 16, 10]} intensity={1.1} />
        <directionalLight position={[-10, 6, -8]} intensity={0.3} color="#63d4c2" />
        <fog attach="fog" args={['#13181d', 30, 70]} />
        <group position={[0, -0.5, 0]} rotation={[0, -Math.PI / 8, 0]}>
          <TowerField data={data} animate={!reduced} onHover={setHover} />
        </group>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={!reduced}
          autoRotateSpeed={0.45}
          minPolarAngle={Math.PI / 7}
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
          <span className="rounded-md border border-stroke bg-surface px-2 py-1">
            <span className="text-text-primary">{hover.count}</span> contribution
            {hover.count === 1 ? '' : 's'} · {hover.date}
          </span>
        )}
      </div>
    </div>
  )
}
