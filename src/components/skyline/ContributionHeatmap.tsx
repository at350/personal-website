import { gridLayout, colorForCount, type ContributionData } from '../../lib/contributions'

const CELL = 11
const GAP = 3

export default function ContributionHeatmap({ data }: { data: ContributionData }) {
  const laid = gridLayout(data.days)
  const maxCount = laid.reduce((m, d) => Math.max(m, d.count), 0)
  const cols = laid.reduce((m, d) => Math.max(m, d.col), 0) + 1
  const width = cols * (CELL + GAP)
  const height = 7 * (CELL + GAP)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label={`GitHub contribution graph: ${data.totalContributions} contributions in the last year`}
    >
      {laid.map((d) => (
        <rect
          key={d.date}
          x={d.col * (CELL + GAP)}
          y={d.row * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx={2}
          fill={d.count === 0 ? 'hsl(var(--surface))' : colorForCount(d.count, maxCount)}
        >
          <title>{`${d.date}: ${d.count} contribution${d.count === 1 ? '' : 's'}`}</title>
        </rect>
      ))}
    </svg>
  )
}
