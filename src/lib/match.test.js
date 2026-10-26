import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aliasProblem, likelyDuplicates, matchIngredient, normalizeName, suggestIngredients } from './match.js'

const registry = {
  ingredients: {
    'chicken-breast': { name: 'chicken breast' },
    'black-pepper': { name: 'pepper', aliases: ['black pepper'] },
    tortilla: { name: 'tortilla' },
    'large-tortilla': { name: 'large tortilla' },
    tomato: { name: 'tomato' },
    berry: { name: 'raspberry' },
    'fresh-parsley': { name: 'fresh parsley' },
    'dried-basil': { name: 'dried basil' },
    jalapeno: { name: 'jalapeno' },
    'ground-beef': { name: 'ground beef' },
  },
}

test('normalizing drops prep words and plurals, keeps words that change the purchase', () => {
  assert.equal(normalizeName('Boneless, Skinless Chicken Breasts (about 2 lbs)'), 'chicken breast')
  assert.equal(normalizeName('Tomatoes, diced'), 'tomato')
  assert.equal(normalizeName('raspberries'), 'raspberry')
  assert.equal(normalizeName('fresh parsley, finely chopped'), 'fresh parsley')
  assert.equal(normalizeName('Ground Beef'), 'ground beef')
})

test('matches by name, alias, or normalized wording', () => {
  assert.deepEqual(matchIngredient('Chicken Breast', registry), { id: 'chicken-breast', how: 'name' })
  assert.deepEqual(matchIngredient('black pepper', registry), { id: 'black-pepper', how: 'alias' })
  assert.deepEqual(matchIngredient('boneless skinless chicken breasts', registry), { id: 'chicken-breast', how: 'normalized' })
  assert.deepEqual(matchIngredient('raspberries', registry), { id: 'berry', how: 'normalized' })
})

test('ambiguous or different purchases are not matched automatically', () => {
  // "large tortillas" normalizes to "tortilla", which is also what "large tortilla" normalizes to.
  assert.equal(matchIngredient('large tortillas', registry), null)
  assert.equal(matchIngredient('parsley', registry), null)
  assert.equal(matchIngredient('fresh basil', registry), null)
})

test('suggestions rank close names first', () => {
  assert.ok(suggestIngredients('jalepeno peppers', registry).some((s) => s.id === 'jalapeno'))
  assert.equal(suggestIngredients('parsley', registry)[0]?.id, 'fresh-parsley')
  assert.deepEqual(
    suggestIngredients('large tortillas', registry).map((s) => s.id).sort(),
    ['large-tortilla', 'tortilla'],
  )
  assert.deepEqual(suggestIngredients('maple syrup', registry), [])
})

test('likely duplicates and alias checks', () => {
  const entries = Object.entries(registry.ingredients).map(([id, info]) => ({ id, info }))
  assert.deepEqual(
    likelyDuplicates(entries).map(([a, b]) => [a.id, b.id]),
    [['tortilla', 'large-tortilla']],
  )
  assert.equal(aliasProblem('Black Pepper', 'black-pepper', registry), 'Already a name for this ingredient')
  assert.equal(aliasProblem('tortilla', 'large-tortilla', registry), 'Already used by "tortilla"')
  assert.equal(aliasProblem('flour tortilla', 'tortilla', registry), null)
})
