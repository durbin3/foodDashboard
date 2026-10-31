import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGroceryList, groceryListText } from './grocery.js'
import { bySection, normalizeIngredient } from './ingredients.js'

test('the old buy-as unit becomes sold-as without an amount', () => {
  assert.deepEqual(normalizeIngredient({ name: 'butter', buyUnit: 'stick' }), { name: 'butter', purchase: { unit: 'stick' } })
  // A pack size already set wins.
  assert.deepEqual(normalizeIngredient({ name: 'x', buyUnit: 'lb', purchase: { qty: '2', unit: 'oz' } }), { name: 'x', purchase: { qty: '2', unit: 'oz' } })
  assert.deepEqual(normalizeIngredient({ name: 'y' }), { name: 'y' })
})

test('lines group by store section in store order, unknown and missing last as Other', () => {
  const groups = bySection([
    { name: 'salt', section: 'spices' },
    { name: 'mystery' },
    { name: 'carrot', section: 'produce' },
    { name: 'odd', section: 'nope' },
  ])
  assert.deepEqual(
    groups.map((g) => [g.label, g.lines.map((l) => l.name)]),
    [
      ['Produce', ['carrot']],
      ['Spices', ['salt']],
      ['Other', ['mystery', 'odd']],
    ],
  )
})

const ing = (id, quantity, unit) => ({ id, original: { quantity, unit, item: id, ingredientId: id, note: '' }, modified: null })
const recipesById = { cake: { id: 'cake', name: 'Cake', ingredients: [ing('butter', '16', 'tbsp'), ing('carrot', '2', ''), ing('flour', '1', 'cup')] } }
const registry = {
  ingredients: {
    butter: { name: 'butter', section: 'dairy', purchase: { unit: 'stick' }, conversions: [{ qty: '8', unit: 'tbsp', equals: '1', toUnit: 'stick' }] },
    carrot: { name: 'carrot', section: 'produce' },
    flour: { name: 'flour', section: 'baking', staple: true },
  },
}
const meals = [{ id: 'm', recipeId: 'cake', scale: 1 }]

test('a sold-as unit without an amount totals in that unit', () => {
  const list = buildGroceryList(meals, recipesById, registry, { items: [] })
  assert.equal(list.groceries.find((l) => l.id === 'butter').amount, '2 stick')
})

test('copied text lists groceries under their sections, then pantry', () => {
  const text = groceryListText(buildGroceryList(meals, recipesById, registry, { items: [] }))
  assert.equal(text, 'Produce\n- Carrot: 2\n\nDairy & eggs\n- Butter: 2 stick\n\nPantry (check before buying)\n- Flour: 1 cup')
})
