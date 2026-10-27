// The plan is a list of meals, each picked for one two-week shopping cycle:
//   { id, recipeId, cycle: 'YYYY-MM-DD' (the cycle's first Monday), date: 'YYYY-MM-DD' | null,
//     scale, sides?, leftovers?: ['YYYY-MM-DD'], ratings?: { [person]: 1-5 }, ratingNote? }
// plus `recommendations`: the scheduler's saved suggestion per cycle (see schedule.js),
// and `days`: changes to single dates from the usual weekday settings,
//   { 'YYYY-MM-DD': { effort?: 1-5, cook?: false } }.
// `leftovers` are the later dates a meal's extra servings are eaten on (see meals.js).
// A null date means picked for the cycle but not on a day yet. Past meals stay
// in the file as history: "last made" and ratings come from them.

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

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86400000)
const ymd = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m - 1, d]
}

export const CYCLE_DAYS = 14

/** The Monday starting the 14-day shopping cycle that contains `iso`, given any cycle's first Monday. */
export function cycleStart(anchor, iso = today()) {
  const start = weekStart(anchor)
  return addDays(start, Math.floor(daysBetween(start, iso) / CYCLE_DAYS) * CYCLE_DAYS)
}

/** 'Mon, Oct 27' */
export const formatDay = (iso) =>
  fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** 'Mon 26' */
export const formatShortDay = (iso) => fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })

/** 'Oct 26 – Nov 8' */
export function formatCycle(start) {
  const opts = { month: 'short', day: 'numeric' }
  return `${fromISODate(start).toLocaleDateString(undefined, opts)} – ${fromISODate(addDays(start, CYCLE_DAYS - 1)).toLocaleDateString(undefined, opts)}`
}

export const cycleDates = (start) => Array.from({ length: CYCLE_DAYS }, (_, i) => addDays(start, i))

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
/** 'mon'…'sun', as used for the per-weekday settings. */
export const weekdayKey = (iso) => WEEKDAY_KEYS[fromISODate(iso).getDay()]

const LEGACY_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The plan as the app works with it, from the file in any of its past shapes
 * ({ entries } with weekday names or dates, where undated meals belonged to
 * every week). Undated old entries join the current cycle. Each meal's cycle
 * is re-derived from its date (or snapped to a cycle start), so changing the
 * cycle's start day in Settings moves meals along with it.
 */
export function normalizePlan(plan, anchor) {
  const current = cycleStart(anchor)
  const meals = (plan?.meals ?? plan?.entries ?? []).map(({ day, ...m }) => {
    const i = LEGACY_DAYS.indexOf(day)
    const rawDate = 'date' in m ? m.date : i >= 0 ? addDays(weekStart(), i) : null
    const date = isISODate(rawDate) ? rawDate : null
    const cycle = date ? cycleStart(anchor, date) : isISODate(m.cycle) ? cycleStart(anchor, m.cycle) : current
    const leftovers = date && Array.isArray(m.leftovers) ? m.leftovers.filter((d) => isISODate(d) && d > date).sort() : []
    const { leftovers: _, ...rest } = m
    return { ...rest, cycle, date, scale: Number(m.scale) > 0 ? Number(m.scale) : 1, ...(leftovers.length ? { leftovers } : {}) }
  })
  return { meals, recommendations: plan?.recommendations ?? {}, days: plan?.days ?? {} }
}

/**
 * The meal moved to `date` (null: off its day). Its leftover nights move the
 * same number of days with it, keeping only those that land inside `cycle`
 * (the first Monday of the cycle it ends up in); taking it off its day drops them.
 */
export function moveMeal(meal, date, cycle) {
  const { leftovers, ...rest } = meal
  if (!date || !meal.date || !leftovers?.length) return { ...rest, date }
  const shift = daysBetween(meal.date, date)
  const end = addDays(cycle, CYCLE_DAYS - 1)
  const moved = leftovers.map((d) => addDays(d, shift)).filter((d) => d > date && d <= end)
  return { ...rest, date, ...(moved.length ? { leftovers: moved } : {}) }
}

export const mealsForCycle = (plan, start) => plan.meals.filter((m) => m.cycle === start)
