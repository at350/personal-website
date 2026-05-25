// Fetches the GitHub contribution calendar via GraphQL and writes src/data/contributions.json.
// - With GH_READ_TOKEN: fetch real data; on failure, leave any existing file untouched.
// - Without a token: keep an existing file, or generate a synthetic year so dev/build works.
import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LOGIN = 'at350'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'contributions.json')
const token = process.env.GH_READ_TOKEN

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount } }
      }
    }
  }
}`

async function fetchReal() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  })
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
  const cal = json.data.user.contributionsCollection.contributionCalendar
  const daysList = cal.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  )
  return { totalContributions: cal.totalContributions, days: daysList }
}

function synthetic() {
  const days = []
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 370)
  let total = 0
  for (let i = 0; i < 371; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const wd = d.getUTCDay()
    // weekdays busier than weekends; frequent zeros
    const base = wd === 0 || wd === 6 ? 0.5 : 1.6
    const count = Math.random() < 0.32 ? 0 : Math.max(0, Math.round((Math.random() ** 1.7) * 12 * base))
    total += count
    days.push({ date: d.toISOString().slice(0, 10), count })
  }
  return { totalContributions: total, days }
}

async function fileExists(p) {
  try {
    await readFile(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  let payload
  if (token) {
    try {
      payload = await fetchReal()
      console.log(
        `[fetch-github] fetched ${payload.days.length} days (${payload.totalContributions} contributions)`,
      )
    } catch (err) {
      console.warn(`[fetch-github] fetch failed, keeping existing file: ${err.message}`)
      if (await fileExists(OUT)) return
      payload = synthetic()
      console.warn('[fetch-github] no existing file; wrote synthetic seed')
    }
  } else if (await fileExists(OUT)) {
    console.log('[fetch-github] no token; keeping existing contributions.json')
    return
  } else {
    payload = synthetic()
    console.log('[fetch-github] no token; wrote synthetic seed')
  }

  const out = { generatedAt: new Date().toISOString(), login: LOGIN, ...payload }
  await writeFile(OUT, JSON.stringify(out) + '\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
