export interface ContributionDay {
  date: string // YYYY-MM-DD
  count: number
}

export interface ContributionData {
  generatedAt: string
  login: string
  totalContributions: number
  days: ContributionDay[] // chronological
}

export interface LaidOutDay extends ContributionDay {
  col: number // week index (x)
  row: number // weekday 0=Sun..6=Sat (z)
}

export interface Stats {
  total: number
  maxCount: number
  currentStreak: number
  busiestDay: ContributionDay
}

const MIN_H = 0.15
const MAX_H = 6

/** Assign each chronological day a (col=week, row=weekday) cell, GitHub-style. */
export function gridLayout(days: ContributionDay[]): LaidOutDay[] {
  if (days.length === 0) return []
  const firstWeekday = new Date(days[0].date + 'T00:00:00Z').getUTCDay()
  return days.map((d, i) => {
    const idx = i + firstWeekday
    return { ...d, col: Math.floor(idx / 7), row: idx % 7 }
  })
}

/** Compressed (sqrt) height in world units; 0 → MIN_H, maxCount → MAX_H. */
export function towerHeight(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return MIN_H
  const t = Math.sqrt(count / maxCount)
  return MIN_H + t * (MAX_H - MIN_H)
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}
function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Dim teal → bright accent (#63d4c2). Empty days stay near the floor color.
const LOW: [number, number, number] = [27, 59, 56]
const HIGH: [number, number, number] = [99, 212, 194]

/** Interpolate the teal ramp by perceptual sqrt of intensity. */
export function colorForCount(count: number, maxCount: number): string {
  const t = maxCount > 0 ? Math.sqrt(Math.min(count, maxCount) / maxCount) : 0
  return hex(lerp(LOW[0], HIGH[0], t), lerp(LOW[1], HIGH[1], t), lerp(LOW[2], HIGH[2], t))
}

/** Headline stats. `total` defaults to the API total when provided, else the sum. */
export function computeStats(days: ContributionDay[], total?: number): Stats {
  if (days.length === 0) {
    return { total: total ?? 0, maxCount: 0, currentStreak: 0, busiestDay: { date: '', count: 0 } }
  }
  let maxCount = 0
  let busiestDay = days[0]
  let sum = 0
  for (const d of days) {
    sum += d.count
    if (d.count > maxCount) {
      maxCount = d.count
      busiestDay = d
    }
  }
  // Current streak: count consecutive >0 from the end, allowing today (last) to be empty.
  let streak = 0
  let i = days.length - 1
  if (days[i].count === 0) i--
  for (; i >= 0 && days[i].count > 0; i--) streak++

  return { total: total ?? sum, maxCount, currentStreak: streak, busiestDay }
}
