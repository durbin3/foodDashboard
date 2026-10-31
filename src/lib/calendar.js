// What the shared Google Calendar should show for the plan: one all-day event
// per dinner on a day, per leftover night, and per thaw reminder. Each event
// carries a `key` naming where it came from, saved on the Google event (as a
// private extended property), so a re-sync updates or removes the same event
// instead of adding another.

import { cycleDays, cycleWarnings } from './schedule.js'
import { addDays } from './plan.js'
import { formatMinutes } from './recipe.js'

/** The tag every event this app writes carries, so it never touches anything else on the calendar. */
export const APP_TAG = 'food-dashboard'

/**
 * Events for dates on or after `from`: [{ key, date, summary, description }],
 * sorted by date.
 */
export function calendarEvents({ plan, recipesById, registry, settings, from }) {
  const name = (id) => recipesById[id]?.name ?? id
  const events = []
  for (const m of plan.meals) {
    if (!m.date) continue
    const recipe = recipesById[m.recipeId]
    const sides = (m.sides ?? []).map((s) => name(s.recipeId))
    if (m.date >= from) {
      const lines = []
      const times = [
        recipe?.prepMinutes != null && `Prep ${formatMinutes(recipe.prepMinutes)}`,
        recipe?.cookMinutes != null && `Cook ${formatMinutes(recipe.cookMinutes)}`,
      ].filter(Boolean)
      if (times.length) lines.push(times.join(' · '))
      if (m.scale !== 1) lines.push(`${m.scale}× batch`)
      events.push({
        key: `meal:${m.id}`,
        date: m.date,
        summary: [name(m.recipeId), ...sides].join(' + '),
        description: lines.join('\n'),
      })
    }
    ;(m.leftovers ?? []).forEach((date, i) => {
      if (date >= from) events.push({ key: `leftovers:${m.id}:${i}`, date, summary: `Leftovers: ${name(m.recipeId)}`, description: '' })
    })
  }

  const cycles = [...new Set(plan.meals.filter((m) => m.date).map((m) => m.cycle))]
  for (const cycle of cycles) {
    const meals = plan.meals.filter((m) => m.cycle === cycle)
    const days = cycleDays(cycle, settings, plan.days)
    const { thaw } = cycleWarnings({ meals, days, recipesById, registry, settings })
    for (const [date, notes] of Object.entries(thaw)) {
      if (date >= from) events.push({ key: `thaw:${date}`, date, summary: notes.join('; '), description: '' })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
}

/** The Google Calendar event body for one of ours: all day, so no time zones. */
export const googleEvent = (e) => ({
  summary: e.summary,
  description: e.description,
  start: { date: e.date },
  end: { date: addDays(e.date, 1) },
  transparency: 'transparent',
  extendedProperties: { private: { app: APP_TAG, key: e.key } },
})

/**
 * What to change on the calendar, given the events we want and the ones of
 * ours already there (Google events, in the same date range):
 * { insert: [event], update: [{ id, event }], remove: [id] }.
 * A duplicate key on the calendar (left by an interrupted sync) is removed.
 */
export function diffEvents(wanted, existing) {
  const byKey = new Map()
  const remove = []
  for (const g of existing) {
    const key = g.extendedProperties?.private?.key
    if (!key || byKey.has(key)) remove.push(g.id)
    else byKey.set(key, g)
  }
  const insert = []
  const update = []
  for (const e of wanted) {
    const g = byKey.get(e.key)
    byKey.delete(e.key)
    if (!g) insert.push(e)
    else if (g.summary !== e.summary || (g.description ?? '') !== e.description || g.start?.date !== e.date) update.push({ id: g.id, event: e })
  }
  remove.push(...[...byKey.values()].map((g) => g.id))
  return { insert, update, remove }
}
