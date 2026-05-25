import type { FC } from 'react'
import TowerGlyph from './TowerGlyph'
import GlobeGlyph from './GlobeGlyph'
import TreeGlyph from './TreeGlyph'
import GridGlyph from './GridGlyph'
import type { GlyphKind } from '../../data/content'

export const GLYPHS: Record<GlyphKind, FC<{ className?: string }>> = {
  tower: TowerGlyph,
  globe: GlobeGlyph,
  tree: TreeGlyph,
  grid: GridGlyph,
}
