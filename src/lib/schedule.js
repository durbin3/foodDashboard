// Recommends which day each meal of a shopping cycle should go on, and flags
// thawing and freshness problems with meals already placed.
//
// Cost of a meal on a day = effort over (or well under) what the day allows
// + perishable ingredients near or past their shelf life, weighted by
// settings.weights, + a variety penalty for meals sharing a main protein on
// the same or neighbouring days. Meals already on a day stay put; the rest
// are assigned to the free days (cookable, not past, no meal or leftovers on
// them) with the Hungarian algorithm, then improved by swapping pairs to
// account for variety. Leftover nights of placed meals are then suggested for
// the days still empty soon after.

import { LEFTOVER_DAYS, leftoversToPlace, mealEffort, mealParts, mealServings } from './meals.js'
import { addDays, cycleDates, daysBetween, formatDay, weekdayKey } from './plan.js'
import { activeIngredients, capitalize } from './recipe.js'

const PROTEINS = new Set(['chicken', 'beef', 'pork', 'turkey', 'fish', 'seafood', 'shrimp', 'salmon', 'lamb', 'vegetarian'])
// Cost of leaving a meal with no day, when there are more meals than free days.
const NO_DAY = 1000

/**
 * The cycle's 14 days: { date, age: days since the shopping trip (1-14), effort, cook,
 * budget: effort allowed (null on no-cook days), custom: changed from the usual for its weekday }.
 * Each day takes its weekday's settings unless `overrides` (plan.days) changes that date.
 */
export function cycleDays(cycle, settings, overrides = {}) {
  const shopping = addDays(cycle, -1)
  return cycleDates(cycle).map((date) => {
    const key = weekdayKey(date)
    const o = overrides[date] ?? {}
    const effort = o.effort ?? settings.dayEffort[key]
    const cook = o.cook ?? !settings.noCookDays.includes(key)
    const custom = (o.effort != null && o.effort !== settings.dayEffort[key]) || (o.cook != null && o.cook === settings.noCookDays.includes(key))
    return { date, age: daysBetween(shopping, date), effort, cook, budget: cook ? effort : null, custom }
  })
}

/** Dates with a meal or leftovers on them. */
export const takenDates = (meals) => new Set(meals.flatMap((m) => (m.date ? [m.date, ...(m.leftovers ?? [])] : [])))

/** What the scheduler needs to know about a meal: effort, main proteins, and ingredients that go off or need thawing. */
export function mealFacts(meal, recipesById, registry) {
  const perishables = new Map()
  const thaws = new Map()
  const proteins = new Set()
  for (const part of mealParts(meal)) {
    const recipe = recipesById[part.recipeId]
    if (!recipe) continue
    if (part.recipeId === meal.recipeId) for (const t of recipe.tags ?? []) if (PROTEINS.has(t)) proteins.add(t)
    for (const ing of activeIngredients(recipe)) {
      const info = registry.ingredients?.[ing.ingredientId]
      if (!info?.shelfLifeDays) continue
      const entry = { id: ing.ingredientId, name: info.name, shelf: info.shelfLifeDays }
      ;(info.thaw ? thaws : perishables).set(ing.ingredientId, entry)
    }
  }
  return {
    id: meal.id,
    recipeId: meal.recipeId,
    name: recipesById[meal.recipeId]?.name ?? meal.recipeId,
    effort: mealEffort(meal, recipesById),
    proteins,
    perishables: [...perishables.values()],
    thaws: [...thaws.values()],
  }
}

/** Cost of one meal on one day, ignoring other meals. */
export function placementCost(facts, day, weights) {
  let effort = 0
  if (facts.effort != null && day.budget != null) {
    const over = facts.effort - day.budget
    effort = over > 0 ? over * over : 0.25 * -over
  }
  let freshness = 0
  for (const p of facts.perishables) {
    const past = day.age - p.shelf
    // Past its shelf life is close to ruled out; the last couple of good days cost a little, so perishable meals drift earlier.
    if (past > 0) freshness += 20 + 3 * past
    else if (past > -2) freshness += 0.5 * (past + 2)
  }
  // A whisker of preference for earlier days, so ties fill the cycle from the front.
  return weights.effort * effort + weights.freshness * freshness + 0.001 * day.age
}

/** Penalty for two meals close together that are too alike. */
export function varietyCost(a, dayA, b, dayB, weights) {
  const gap = Math.abs(daysBetween(dayA, dayB))
  if (gap > 1) return 0
  let cost = 0
  if (a.recipeId === b.recipeId) cost += 2
  if ([...a.proteins].some((p) => b.proteins.has(p))) cost += 1
  return weights.variety * cost * (gap === 0 ? 2 : 1)
}

/**
 * Minimum-cost assignment of rows to columns (rows <= columns), O(n²m).
 * Returns the column for each row.
 */
export function hungarian(cost) {
  const n = cost.length
  const m = cost[0]?.length ?? 0
  const u = new Array(n + 1).fill(0)
  const v = new Array(m + 1).fill(0)
  const p = new Array(m + 1).fill(0)
  const way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(Infinity)
    const used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const result = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1
  return result
}

/** Days a meal could be recommended for: cookable, today or later, with no meal or leftovers on them yet. */
export function freeDays(days, meals, now) {
  const taken = takenDates(meals)
  return days.filter((d) => d.budget != null && d.date >= now && !taken.has(d.date))
}

/**
 * Best days for the cycle's meals that aren't on a day yet, given the ones
 * that are. Returns { [mealId]: date | null } (null: no free day left for it).
 */
export function recommend({ meals, days, now, recipesById, registry, weights }) {
  const facts = new Map(meals.map((m) => [m.id, mealFacts(m, recipesById, registry)]))
  const placed = meals.filter((m) => m.date)
  // Stable order, so the same inputs always give the same answer.
  const open = meals.filter((m) => !m.date).sort((a, b) => facts.get(a.id).name.localeCompare(facts.get(b.id).name) || a.id.localeCompare(b.id))
  if (!open.length) return {}
  const free = freeDays(days, meals, now)
  const byDate = new Map(days.map((d) => [d.date, d]))

  // Each free day, then one "no day" column per meal.
  const matrix = open.map((m) => [...free.map((d) => placementCost(facts.get(m.id), d, weights)), ...open.map(() => NO_DAY)])
  const assigned = hungarian(matrix).map((col) => (col < free.length ? free[col].date : null))

  // Variety depends on pairs of meals, so improve the assignment by swapping.
  const cost = (dates) => {
    let total = 0
    const all = [...placed.map((m) => [m, m.date]), ...open.map((m, i) => [m, dates[i]])]
    open.forEach((m, i) => (total += dates[i] ? placementCost(facts.get(m.id), byDate.get(dates[i]), weights) : NO_DAY))
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const [a, da] = all[i]
        const [b, db] = all[j]
        if (da && db && (open.includes(a) || open.includes(b))) total += varietyCost(facts.get(a.id), da, facts.get(b.id), db, weights)
      }
    return total
  }
  let best = assigned
  let bestCost = cost(best)
  for (let round = 0; round < 50; round++) {
    let improved = false
    const unused = free.map((d) => d.date).filter((d) => !best.includes(d))
    for (let i = 0; i < open.length; i++) {
      // Swap with another meal, or move to an unused free day.
      const options = [...open.map((_, j) => ['swap', j]).filter(([, j]) => j > i), ...unused.map((d) => ['move', d])]
      for (const [kind, x] of options) {
        const next = [...best]
        if (kind === 'swap') [next[i], next[x]] = [next[x], next[i]]
        else next[i] = x
        const c = cost(next)
        if (c < bestCost - 1e-9) {
          best = next
          bestCost = c
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return Object.fromEntries(open.map((m, i) => [m.id, best[i]]))
}

// A saved recommendation records what it was based on, so it's reused until
// something other than following it changes: settings, a meal's recipe, sides
// or effort, meals added or removed, or a meal placed somewhere else.
// Only the weights that affect which day a meal goes on (cost and recency rank
// meal suggestions instead), and each day's effort allowed (null: no cooking).
const settingsKey = (days, { weights: { effort, freshness, variety } }) => JSON.stringify([days.map((d) => d.budget), effort, freshness, variety])
const mealKey = (m, recipesById) => JSON.stringify([m.recipeId, (m.sides ?? []).map((s) => s.recipeId), mealEffort(m, recipesById)])

export function buildRecommendation({ meals, days, now, recipesById, registry, settings }) {
  return {
    settings: settingsKey(days, settings),
    meals: Object.fromEntries(meals.map((m) => [m.id, mealKey(m, recipesById)])),
    placed: Object.fromEntries(meals.filter((m) => m.date).map((m) => [m.id, m.date])),
    days: recommend({ meals, days, now, recipesById, registry, weights: settings.weights }),
  }
}

export function recommendationStillFits(rec, { meals, days, now, recipesById, settings }) {
  if (!rec || rec.settings !== settingsKey(days, settings)) return false
  const ids = new Set(meals.map((m) => m.id))
  if (Object.keys(rec.meals).length !== ids.size || ![...ids].every((id) => rec.meals[id] === mealKey(meals.find((m) => m.id === id), recipesById)))
    return false
  const free = new Set(freeDays(days, meals, now).map((d) => d.date))
  const used = new Set(Object.values(rec.days).filter(Boolean))
  for (const m of meals) {
    if (m.id in rec.placed) {
      // Already on a day when this was worked out: must still be there.
      if (m.date !== rec.placed[m.id]) return false
    } else if (!(m.id in rec.days)) return false
    else if (m.date) {
      // Placed since: fine only if it went where recommended.
      if (m.date !== rec.days[m.id]) return false
    } else if (rec.days[m.id] ? !free.has(rec.days[m.id]) : [...free].some((d) => !used.has(d))) return false
  }
  return true
}

/**
 * Problems with meals already on a day: { byMeal: { mealId: [text] }, thaw: { date: [text] } }.
 * Freshness and leftover warnings go on the meal; thaw reminders go on the day before it.
 */
export function cycleWarnings({ meals, days, recipesById, registry, settings }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const shopping = days.length ? addDays(days[0].date, -1) : null
  const byMeal = {}
  const thaw = {}
  for (const m of meals) {
    const day = m.date && byDate.get(m.date)
    if (!day) continue
    const facts = mealFacts(m, recipesById, registry)
    const stale = facts.perishables.filter((p) => day.age > p.shelf)
    const notes = stale.map((p) => `${capitalize(p.name)} bought ${formatDay(shopping)} is ${day.age} days old by ${formatDay(m.date)} (keeps ${p.shelf}).`)
    const leftovers = m.leftovers ?? []
    if (leftovers.length) {
      const made = mealServings(m, recipesById[m.recipeId])?.leftovers ?? 0
      if (leftovers.length > made)
        notes.push(`Leftovers are planned for ${leftovers.length} night${leftovers.length === 1 ? '' : 's'}, but it only makes enough for ${made}.`)
      const old = leftovers.filter((d) => daysBetween(m.date, d) > LEFTOVER_DAYS)
      if (old.length) notes.push(`Leftovers on ${old.map(formatDay).join(', ')} are more than ${LEFTOVER_DAYS} days old.`)
    }
    if (notes.length) byMeal[m.id] = notes
    const frozen = facts.thaws.filter((t) => day.age > t.shelf)
    if (frozen.length) {
      const before = addDays(m.date, -1)
      ;(thaw[before] ??= []).push(`Thaw ${frozen.map((t) => t.name).join(', ')} for ${facts.name}`)
    }
  }
  return { byMeal, thaw }
}

/**
 * Days for the leftover nights not on a day yet: { [mealId]: [date] }. Each
 * goes on the earliest day within LEFTOVER_DAYS after cooking that's today or
 * later and has nothing on it and no meal suggested (`suggested`: dates the
 * scheduler picked for meals), no-cook days first, since those are what
 * leftovers are for.
 */
export function suggestLeftovers({ meals, days, now, recipesById, settings, suggested = [] }) {
  const taken = new Set([...takenDates(meals), ...suggested])
  const out = {}
  const placed = meals.filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date))
  for (const m of placed) {
    let left = leftoversToPlace(m, recipesById[m.recipeId])
    const options = days
      .filter((d) => d.date > m.date && d.date >= now && daysBetween(m.date, d.date) <= LEFTOVER_DAYS && !taken.has(d.date))
      .sort((a, b) => a.cook - b.cook || a.date.localeCompare(b.date))
    for (const d of options) {
      if (left <= 0) break
      ;(out[m.id] ??= []).push(d.date)
      taken.add(d.date)
      left--
    }
  }
  return out
}
