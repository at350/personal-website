import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  gridLayout,
  towerHeight,
  colorForCount,
  type ContributionData,
  type LaidOutDay,
} from '../../lib/contributions'

const SPACING = 1.15
const RISE_PER_COL = 0.012 // stagger: later weeks rise slightly later

export interface HoverInfo {
  date: string
  count: number
}

interface Props {
  data: ContributionData
  animate: boolean
  onHover: (info: HoverInfo | null) => void
}

export default function TowerField({ data, animate, onHover }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const [hovered, setHovered] = useState<number | null>(null)

  const laid: LaidOutDay[] = useMemo(() => gridLayout(data.days), [data.days])
  const maxCount = useMemo(() => laid.reduce((m, d) => Math.max(m, d.count), 0), [laid])
  const cols = useMemo(() => laid.reduce((m, d) => Math.max(m, d.col), 0) + 1, [laid])

  const targets = useMemo(() => laid.map((d) => towerHeight(d.count, maxCount)), [laid, maxCount])
  const colors = useMemo(
    () => laid.map((d) => new THREE.Color(d.count === 0 ? '#21303a' : colorForCount(d.count, maxCount))),
    [laid, maxCount],
  )

  // progress 0→1 drives the assemble sweep; jump to 1 when not animating
  const progress = useRef(animate ? 0 : 1)
  useEffect(() => {
    progress.current = animate ? 0 : 1
  }, [animate])

  // set instance colors once
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    colors.forEach((c, i) => mesh.setColorAt(i, c))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [colors])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (progress.current < 1) progress.current = Math.min(1, progress.current + delta * 0.6)
    const p = progress.current
    const offsetX = (cols * SPACING) / 2
    for (let i = 0; i < laid.length; i++) {
      const d = laid[i]
      const local = Math.min(1, Math.max(0, (p - d.col * RISE_PER_COL) / (1 - d.col * RISE_PER_COL || 1)))
      const eased = 1 - Math.pow(1 - local, 3)
      const h = Math.max(0.001, targets[i] * eased) + (hovered === i ? 0.6 : 0)
      dummy.position.set(d.col * SPACING - offsetX, h / 2, (d.row - 3) * SPACING)
      dummy.scale.set(0.85, h, 0.85)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, laid.length]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        const id = e.instanceId ?? null
        if (id !== hovered) {
          setHovered(id)
          onHover(id === null ? null : { date: laid[id].date, count: laid[id].count })
        }
      }}
      onPointerOut={() => {
        setHovered(null)
        onHover(null)
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.45} metalness={0.1} />
    </instancedMesh>
  )
}
