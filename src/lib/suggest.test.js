import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fillCycle, suggestMeals } from './suggest.js'

const registry = {
  ingredients: {
    chicken: { name: 'chicken', purchase: { qty: '2', unit: 'lb' } },
    rice: { name: 'rice' },
    tortilla: { name: 'tortilla' },
    beef: { name: 'beef' },
    salt: { name: 'salt', staple: true },
    lemon: { name: 'lemon' },
  },
}
const ing = (id, quantity, unit = '') => ({ id, original: { quantity, unit, ingredientId: id, item: registry.ingredients[id].name, note: '' }, modified: null })
const recipe = (id, tags, ingredients, category = 'main') => ({ id, name: id, category, tags, ingredients, steps: [] })
const recipes = [
  recipe('chicken-rice', ['chicken'], [ing('chicken', '1', 'lb'), ing('rice', '1', 'cup'), ing('salt', '1', 'tsp')]),
  recipe('chicken-wraps', ['chicken'], [ing('chicken', '1', 'lb'), ing('tortilla', '4')]),
  recipe('beef-tacos', ['beef'], [ing('beef', '1', 'lb'), ing('tortilla', '4'), ing('lemon', '1')]),
  recipe('lemon-cake', [], [ing('lemon', '2')], 'dessert'),
]
const recipesById = Object.fromEntries(recipes.map((r) => [r.id, r]))
const base = { recipes, recipesById, registry, inventory: { items: [] }, now: '2026-10-26', weights: { cost: 1, variety: 1, recency: 1 } }
const noPlan = { meals: [] }
const names = (ranked) => ranked.map((s) => s.recipe.id)

test('only mains not already picked are suggested', () => {
  assert.ok(!names(suggestMeals({ ...base, picked: [], plan: noPlan })).includes('lemon-cake'))
  assert.ok(!names(suggestMeals({ ...base, picked: [{ id: 'm1', recipeId: 'chicken-rice', scale: 1 }], plan: noPlan })).includes('chicken-rice'))
})

test('a protein already picked counts against a meal', () => {
  const picked = [{ id: 'm1', recipeId: 'beef-tacos', scale: 1 }]
  const ranked = suggestMeals({ ...base, picked, plan: noPlan, weights: { cost: 0, variety: 1, recency: 0 } })
  assert.equal(ranked.find((s) => s.recipe.id === 'chicken-wraps').sameProtein, 0)
  const withChicken = suggestMeals({ ...base, picked: [{ id: 'm1', recipeId: 'chicken-rice', scale: 1 }], plan: noPlan, weights: { cost: 0, variety: 1, recency: 0 } })
  assert.equal(withChicken.find((s) => s.recipe.id === 'chicken-wraps').score, 3 - 0.5)
})

test('leftover chicken from a 2 lb pack makes the other chicken meal nearly free', () => {
  const picked = [{ id: 'm1', recipeId: 'chicken-rice', scale: 1 }]
  const ranked = suggestMeals({ ...base, picked, plan: noPlan })
  const wraps = ranked.find((s) => s.recipe.id === 'chicken-wraps')
  const tacos = ranked.find((s) => s.recipe.id === 'beef-tacos')
  assert.equal(wraps.extra, 1) // just tortillas: the second pound of chicken is already in the pack
  assert.deepEqual(wraps.shared, ['chicken'])
  assert.equal(tacos.extra, 3)
})

test('ratings lift a recipe and recent cooking holds it back', () => {
  const plan = {
    meals: [
      { id: 'r1', recipeId: 'beef-tacos', date: '2026-10-01', ratings: { Eric: 5, Sarah: 5 } },
      { id: 'r2', recipeId: 'chicken-rice', date: '2026-10-24', ratings: { Eric: 5, Sarah: 5 } },
    ],
  }
  const score = (weights, id) => suggestMeals({ ...base, weights, picked: [], plan }).find((s) => s.recipe.id === id)
  const tacos = score(base.weights, 'beef-tacos')
  assert.equal(tacos.rating, 5)
  // Tacos were made 25 days ago: barely held back. Chicken and rice two days ago: the full penalty of 2.
  assert.ok(score({ ...base.weights, recency: 0 }, 'beef-tacos').score - tacos.score < 0.5)
  assert.equal(score({ ...base.weights, recency: 0 }, 'chicken-rice').score - score(base.weights, 'chicken-rice').score, 2)
})

test('fill picks one at a time and avoids repeating a meal', () => {
  const chosen = fillCycle({ ...base, picked: [], count: 3, plan: noPlan })
  assert.equal(chosen.length, 3)
  assert.equal(new Set(chosen).size, 3)
})
