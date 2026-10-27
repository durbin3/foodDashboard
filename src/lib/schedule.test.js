import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRecommendation, cycleDays, cycleWarnings, freeDays, hungarian, recommend, recommendationStillFits, suggestLeftovers } from './schedule.js'

const settings = {
  people: ['Eric', 'Sarah'],
  dayEffort: { mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 5, sun: 5 },
  noCookDays: ['fri'],
  weights: { effort: 1, freshness: 1, variety: 1 },
}
const cycle = '2026-10-26'
const days = cycleDays(cycle, settings)
const now = '2026-10-26'

const ing = (id) => ({ id, original: { quantity: '1', unit: '', ingredientId: id, note: '' }, modified: null })
const recipe = (id, effort, tags, ingredients = []) => ({ id, name: id, effort, tags, ingredients: ingredients.map(ing), steps: [] })
const recipesById = {
  lasagna: recipe('lasagna', 5, ['pasta']),
  tacos: recipe('tacos', 2, ['beef'], ['cilantro']),
  stirfry: recipe('stirfry', 2, ['chicken'], ['chicken-breast']),
  soup: recipe('soup', 1, ['chicken']),
}
const registry = {
  ingredients: {
    cilantro: { name: 'cilantro', shelfLifeDays: 5 },
    'chicken-breast': { name: 'chicken breast', shelfLifeDays: 2, thaw: true },
  },
}
const meal = (id, recipeId, date = null) => ({ id, recipeId, cycle, date, scale: 1 })
const ctx = (meals) => ({ meals, days, now, recipesById, registry, settings })

test('cycle days count from the Sunday shopping trip', () => {
  assert.equal(days.length, 14)
  assert.deepEqual([days[0].date, days[0].age, days[0].budget], ['2026-10-26', 1, 2])
  assert.equal(days[4].budget, null) // Friday: no cooking
  assert.deepEqual([days[13].date, days[13].age], ['2026-11-08', 14])
})

test('hungarian finds the cheapest assignment', () => {
  assert.deepEqual(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2])
  assert.deepEqual(hungarian([[1, 9, 9, 9]]), [0])
})

test('hard meals go on days that allow them, perishables early', () => {
  const rec = recommend({ meals: [meal('a', 'lasagna'), meal('b', 'tacos')], days, now, recipesById, registry, weights: settings.weights })
  assert.ok(['2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08'].includes(rec.a), `lasagna on ${rec.a}`)
  // Cilantro keeps 5 days: tacos by Friday Oct 30 at the latest (and Friday is a no-cook day).
  assert.ok(rec.b <= '2026-10-29', `tacos on ${rec.b}`)
})

test('meals sharing a protein are not put on neighbouring days', () => {
  const rec = recommend({ meals: [meal('a', 'stirfry', '2026-10-27'), meal('b', 'soup')], days, now, recipesById, registry, weights: settings.weights })
  assert.ok(!['2026-10-26', '2026-10-27', '2026-10-28'].includes(rec.b), `soup on ${rec.b}`)
})

test('more meals than free days leaves the extra without a day', () => {
  const few = { ...settings, noCookDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }
  const d = cycleDays(cycle, few)
  const rec = recommend({ meals: ['a', 'b', 'c'].map((id) => meal(id, 'soup')), days: d, now, recipesById, registry, weights: few.weights })
  assert.equal(Object.values(rec).filter(Boolean).length, 2)
  assert.equal(Object.values(rec).filter((x) => x === null).length, 1)
})

test('a saved recommendation survives following it but not deviating from it', () => {
  const meals = [meal('a', 'lasagna'), meal('b', 'tacos'), meal('c', 'soup')]
  const rec = buildRecommendation(ctx(meals))
  assert.ok(recommendationStillFits(rec, ctx(meals)))

  const followed = meals.map((m) => (m.id === 'a' ? { ...m, date: rec.days.a } : m))
  assert.ok(recommendationStillFits(rec, ctx(followed)), 'placing a meal on its recommended day keeps the recommendation')

  const elsewhere = rec.days.b === '2026-11-03' ? '2026-11-04' : '2026-11-03'
  const deviated = meals.map((m) => (m.id === 'b' ? { ...m, date: elsewhere } : m))
  assert.ok(!recommendationStillFits(rec, ctx(deviated)), 'placing a meal elsewhere re-solves')

  assert.ok(!recommendationStillFits(rec, ctx([...meals, meal('d', 'soup')])), 'a new meal re-solves')
  assert.ok(!recommendationStillFits(rec, ctx(meals.slice(1))), 'a removed meal re-solves')
  const busierMonday = cycleDays(cycle, settings, { '2026-10-26': { effort: 5 } })
  assert.ok(!recommendationStillFits(rec, { ...ctx(meals), days: busierMonday }), 'a day with new effort re-solves')
  assert.ok(!recommendationStillFits(rec, { ...ctx(meals), settings: { ...settings, weights: { ...settings.weights, effort: 2 } } }), 'new weights re-solve')
})

test('a placed meal taken back off its day re-solves', () => {
  const meals = [meal('a', 'lasagna', '2026-10-31'), meal('b', 'tacos')]
  const rec = buildRecommendation(ctx(meals))
  assert.ok(recommendationStillFits(rec, ctx(meals)))
  assert.ok(!recommendationStillFits(rec, ctx(meals.map((m) => ({ ...m, date: null })))))
})

test('warnings: stale perishables on the meal, thawing the day before', () => {
  const meals = [meal('a', 'tacos', '2026-11-03'), meal('b', 'stirfry', '2026-10-31'), meal('c', 'stirfry', '2026-10-27')]
  const { byMeal, thaw } = cycleWarnings(ctx(meals))
  assert.equal(byMeal.a.length, 1)
  assert.match(byMeal.a[0], /Cilantro bought .* is 9 days old .* \(keeps 5\)/)
  assert.deepEqual(thaw['2026-10-30'], ['Thaw chicken breast for stirfry'])
  // Day 2 is within the chicken's 2-day shelf life: still in the fridge.
  assert.equal(thaw['2026-10-26'], undefined)
  assert.equal(byMeal.b, undefined)
})

test('a single date can change its effort or whether we cook', () => {
  const custom = cycleDays(cycle, settings, { '2026-10-27': { effort: 4 }, '2026-10-30': { cook: true }, '2026-10-31': { cook: false } })
  assert.deepEqual([custom[1].budget, custom[1].custom], [4, true])
  assert.deepEqual([custom[4].budget, custom[4].custom], [2, true]) // Friday, normally no cooking
  assert.deepEqual([custom[5].budget, custom[5].custom], [null, true])
  assert.equal(custom[8].budget, 2) // the next Tuesday keeps the usual
  // An override that matches the usual isn't a change.
  assert.equal(cycleDays(cycle, settings, { '2026-10-27': { effort: 2 } })[1].custom, false)
})

test('leftover nights take their day and are suggested soon after cooking', () => {
  const big = { ...recipe('chili', 2, ['beef']), servings: 8, trueServings: 6 }
  const byId = { ...recipesById, chili: big }
  const cooked = { ...meal('a', 'chili', '2026-10-27'), leftovers: ['2026-10-28'] }
  // 6 servings, 2 per dinner: cooking night plus 2 leftover nights, one placed.
  assert.ok(!freeDays(days, [cooked], now).some((d) => d.date === '2026-10-28'))
  // Friday is a no-cook day within 4 days, so the other leftover night goes there first.
  assert.deepEqual(suggestLeftovers({ meals: [cooked], days, now, recipesById: byId, settings }), { a: ['2026-10-30'] })
  assert.deepEqual(suggestLeftovers({ meals: [cooked], days, now, recipesById: byId, settings, suggested: ['2026-10-30'] }), { a: ['2026-10-29'] })

  const tooMany = { ...cooked, leftovers: ['2026-10-28', '2026-10-29', '2026-11-02'] }
  const { byMeal } = cycleWarnings({ ...ctx([tooMany]), recipesById: byId })
  assert.match(byMeal.a[0], /3 nights, but it only makes enough for 2/)
  assert.match(byMeal.a[1], /more than 4 days old/)
})
