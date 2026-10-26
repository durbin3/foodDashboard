import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGroceryList } from './grocery.js'
import { computeNeeds, inventoryAfterShopping } from './needs.js'

const ing = (id, quantity, unit) => ({ id, original: { quantity, unit, ingredientId: id, note: '' }, modified: null })
const withNames = (r, registry) => ({
  ...r,
  ingredients: r.ingredients.map((i) => ({ ...i, original: { ...i.original, item: registry.ingredients[i.original.ingredientId]?.name ?? i.original.ingredientId } })),
})
const registry = {
  ingredients: {
    'chicken-breast': { name: 'chicken breast', purchase: { qty: '2', unit: 'lb' }, conversions: [{ qty: '1', unit: '', equals: '1/2', toUnit: 'lb' }] },
    egg: { name: 'egg' },
    milk: { name: 'milk', staple: true },
    rice: { name: 'rice' },
  },
}
const recipesById = Object.fromEntries(
  [
    { id: 'a', name: 'A', ingredients: [ing('chicken-breast', '3', ''), ing('egg', '2', ''), ing('rice', '1', 'cup')] },
    { id: 'b', name: 'B', ingredients: [ing('chicken-breast', '1', 'lb'), ing('egg', '1', '')] },
  ].map((r) => [r.id, withNames(r, registry)]),
)
const meals = [
  { id: 'm1', recipeId: 'a', scale: 1 },
  { id: 'm2', recipeId: 'b', scale: 1 },
]
const byId = (needs) => Object.fromEntries(needs.map((n) => [n.id, n]))

test('pack sizes round up and leave leftovers', () => {
  const n = byId(computeNeeds(meals, recipesById, registry, { items: [] }))['chicken-breast']
  // 3 each × 1/2 lb + 1 lb = 2.5 lb, sold in 2 lb packs: buy 4 lb, 1.5 lb left over.
  assert.equal(n.math.base, 'lb')
  assert.equal(n.math.usedQty, 2.5)
  assert.equal(n.math.packs, 2)
  assert.equal(n.math.buyQty, 4)
  assert.equal(n.math.leftoverQty, 1.5)
})

test('storage is used first; amounts without a quantity count as none', () => {
  const inventory = { items: [{ ingredientId: 'chicken-breast', qty: '1', unit: 'lb' }, { ingredientId: 'egg', qty: '', unit: '' }, { ingredientId: 'egg', qty: '12', unit: '' }] }
  const n = byId(computeNeeds(meals, recipesById, registry, inventory))
  assert.equal(n['chicken-breast'].math.buyQty, 2) // need 1.5 more: one 2 lb pack
  assert.equal(n['chicken-breast'].math.leftoverQty, 0.5)
  assert.equal(n.egg.math.buyQty, 0)
  assert.equal(n.egg.math.leftoverQty, 9)
  assert.equal(n.rice.math, null) // no pack size, nothing stored: as the recipes add up
})

test('grocery list shows buy vs use, and lists stored items separately', () => {
  const list = buildGroceryList(meals, recipesById, registry, { items: [{ ingredientId: 'egg', qty: '12', unit: '' }] })
  const chicken = list.groceries.find((l) => l.id === 'chicken-breast')
  assert.equal(chicken.amount, '4 lb (2 packs)')
  assert.equal(chicken.detail, 'use 2 1/2 lb, 1 1/2 lb left over')
  assert.deepEqual(list.stored.map((l) => l.id), ['egg'])
  assert.equal(list.stored[0].detail, 'use 3, have 12 in storage, 9 left over')
  assert.equal(list.groceries.find((l) => l.id === 'rice').amount, '1 cup')
})

test('done shopping replaces counted storage with the leftovers and keeps the rest', () => {
  const inventory = {
    items: [
      { ingredientId: 'egg', qty: '12', unit: '', location: 'fridge', added: '2026-10-11' },
      { ingredientId: 'egg', qty: '', unit: '', location: 'fridge' },
      { ingredientId: 'rice', qty: '5', unit: 'lb', location: 'pantry' },
    ],
  }
  const needs = computeNeeds(meals, recipesById, registry, inventory)
  const after = inventoryAfterShopping(needs, inventory, '2026-10-25')
  const items = after.items.map((s) => `${s.ingredientId}:${s.qty} ${s.unit}:${s.location}:${s.added ?? ''}`).sort()
  assert.deepEqual(items, [
    'chicken-breast:1 1/2 lb::2026-10-25',
    'egg: :fridge:', // note with no amount stays
    'egg:9 :fridge:2026-10-11', // nothing bought: keeps its old date
    'rice:5 lb:pantry:', // lb doesn't convert to the recipe's cups: left alone
  ])
})
