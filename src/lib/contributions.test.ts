import { describe, it, expect } from 'vitest'
import {
  gridLayout,
  towerHeight,
  colorForCount,
  computeStats,
  type ContributionDay,
} from './contributions'

// Helper: build N chronological days starting on a known Sunday (2024-01-07 is a Sunday).
function days(counts: number[]): ContributionDay[] {
  const start = new Date('2024-01-07T00:00:00Z') // Sunday
  return counts.map((count, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), count }
  })
}

describe('gridLayout', () => {
  it('places the first day at its UTC weekday row, column 0', () => {
    const out = gridLayout(days([1])) // 2024-01-07 = Sunday = row 0
    expect(out[0]).toMatchObject({ row: 0, col: 0 })
  })

  it('wraps to the next column after 7 days', () => {
    const out = gridLayout(days([1, 1, 1, 1, 1, 1, 1, 1])) // 8 days
    expect(out[6]).toMatchObject({ row: 6, col: 0 }) // Saturday
    expect(out[7]).toMatchObject({ row: 0, col: 1 }) // next Sunday
  })

  it('offsets a mid-week start into the correct row', () => {
    // 2024-01-10 is a Wednesday (weekday 3)
    const mid = [{ date: '2024-01-10', count: 2 }]
    expect(gridLayout(mid)[0]).toMatchObject({ row: 3, col: 0 })
  })
})

describe('towerHeight', () => {
  it('returns the minimum for zero contributions', () => {
    expect(towerHeight(0, 10)).toBeCloseTo(0.15)
  })
  it('returns the max for the busiest day', () => {
    expect(towerHeight(10, 10)).toBeCloseTo(6)
  })
  it('is monotonic in count', () => {
    expect(towerHeight(2, 10)).toBeLessThan(towerHeight(8, 10))
  })
  it('handles maxCount of 0 without NaN', () => {
    expect(Number.isFinite(towerHeight(0, 0))).toBe(true)
  })
})

describe('colorForCount', () => {
  it('returns a hex string', () => {
    expect(colorForCount(5, 10)).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('brightens with count', () => {
    expect(colorForCount(0, 10)).not.toBe(colorForCount(10, 10))
  })
})

describe('computeStats', () => {
  it('sums total, finds busiest day, and max count', () => {
    const s = computeStats(days([1, 0, 5, 2]), 8)
    expect(s.total).toBe(8)
    expect(s.maxCount).toBe(5)
    expect(s.busiestDay.count).toBe(5)
  })
  it('counts the current streak from the end, tolerating an empty final day', () => {
    // ...,3,4,0  → today (0) skipped, streak = 2 (the 3 and 4)
    expect(computeStats(days([0, 3, 4, 0]), 7).currentStreak).toBe(2)
  })
  it('counts a streak that includes a non-empty final day', () => {
    expect(computeStats(days([0, 3, 4, 5]), 12).currentStreak).toBe(3)
  })
  it('returns zeroed stats for an empty calendar', () => {
    const s = computeStats([], 0)
    expect(s).toMatchObject({ total: 0, maxCount: 0, currentStreak: 0 })
    expect(s.busiestDay.count).toBe(0)
  })
})
