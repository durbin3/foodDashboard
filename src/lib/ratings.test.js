import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recentMeal } from './ratings.js'

test('a recipe-page rating goes on the meal from the last week, else none', () => {
  const plan = {
    meals: [
      { id: 'old', recipeId: 'x', date: '2026-10-18' },
      { id: 'week', recipeId: 'x', date: '2026-10-22' },
      { id: 'later', recipeId: 'x', date: '2026-10-30' },
      { id: 'other', recipeId: 'y', date: '2026-10-26' },
    ],
  }
  assert.equal(recentMeal(plan, 'x', '2026-10-27').id, 'week')
  assert.equal(recentMeal(plan, 'x', '2026-10-29'), null)
})
