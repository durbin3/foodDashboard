import { addDays } from './plan.js'

// Ratings live on plan meals (each time a recipe was cooked), one 1-5 score
// per person. A recipe's rating is the plain average of every score it got.

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** { average, byPerson: { name: average }, times, history: [{ date, ratings, note }] } for one recipe. */
export function recipeRatings(plan, recipeId) {
  const history = plan.meals
    .filter((m) => m.recipeId === recipeId && m.ratings && Object.keys(m.ratings).length)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .map((m) => ({ id: m.id, date: m.date, ratings: m.ratings, note: m.ratingNote ?? '' }))
  const scores = history.flatMap((h) => Object.values(h.ratings))
  const people = [...new Set(history.flatMap((h) => Object.keys(h.ratings)))]
  const byPerson = Object.fromEntries(people.map((p) => [p, mean(history.map((h) => h.ratings[p]).filter((x) => x != null))]))
  return { average: mean(scores), byPerson, times: history.length, history }
}

export const formatRating = (n) => (n == null ? '' : (Math.round(n * 10) / 10).toFixed(1))

/**
 * The meal a rating given on the recipe page belongs to: the latest time it
 * was on the plan in the last week (up to today), or null, in which case the
 * rating means it was made today.
 */
export function recentMeal(plan, recipeId, now) {
  const weekAgo = addDays(now, -6)
  return (
    plan.meals
      .filter((m) => m.recipeId === recipeId && m.date && m.date >= weekAgo && m.date <= now)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  )
}
