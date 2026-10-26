// Plan entries are dated: { id, recipeId, date: 'YYYY-MM-DD' | null, scale }.
// A null date means "unscheduled": planned, but not on a day yet. Unscheduled
// meals show in every week and count toward every week's grocery list. Past
// entries stay in the file and double as meal history ("last made").

const pad = (n) => String(n).padStart(2, '0')

/** A Date as 'YYYY-MM-DD' in local time. */
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 'YYYY-MM-DD' to a local Date at midnight. */
export const fromISODate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const today = () => toISODate(new Date())

export function addDays(iso, n) {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** The Monday on or before `iso`. */
export function weekStart(iso = today()) {
  const d = fromISODate(iso)
  return addDays(iso, -((d.getDay() + 6) % 7))
}

export const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

/** 'Mon, Oct 27' */
export const formatDay = (iso) =>
  fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** 'Oct 27 – Nov 2' */
export function formatWeek(start) {
  const opts = { month: 'short', day: 'numeric' }
  return `${fromISODate(start).toLocaleDateString(undefined, opts)} – ${fromISODate(addDays(start, 6)).toLocaleDateString(undefined, opts)}`
}

const LEGACY_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Bring an older plan file (weekday names, "" scales) up to the dated format. */
export function normalizePlan(plan) {
  const start = weekStart()
  const entries = (plan?.entries ?? []).map(({ day, ...e }) => {
    const i = LEGACY_DAYS.indexOf(day)
    const date = 'date' in e ? e.date : i >= 0 ? addDays(start, i) : null
    const scale = Number(e.scale) > 0 ? Number(e.scale) : 1
    return { ...e, date: isISODate(date) ? date : null, scale }
  })
  return { ...plan, entries }
}

/** Entries for the week starting `start`, plus unscheduled ones. */
export const entriesForWeek = (plan, start) => {
  const end = addDays(start, 6)
  return plan.entries.filter((e) => !e.date || (e.date >= start && e.date <= end))
}
