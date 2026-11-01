import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_CONVERSIONS, combineAmounts, showUnitFor, unitGraph } from './units.js'

const butterEdges = unitGraph([...BUILTIN_CONVERSIONS, { qty: '1/2', unit: 'cup', equals: '1', toUnit: 'stick' }])
const sticksThenTbsp = [{ unit: 'stick', from: { qty: '1/2', unit: 'cup' } }, { unit: 'tbsp' }]

test('show-in rules: sticks from 1/2 cup, tbsp below', () => {
  assert.equal(showUnitFor(1, 'cup', sticksThenTbsp, butterEdges), 'stick')
  assert.equal(showUnitFor(8, 'tbsp', sticksThenTbsp, butterEdges), 'stick')
  assert.equal(showUnitFor(1 / 4, 'cup', sticksThenTbsp, butterEdges), 'tbsp')
  assert.equal(showUnitFor(2, 'tsp', sticksThenTbsp, butterEdges), 'tbsp')
  // Order doesn't matter: the largest threshold reached wins.
  assert.equal(showUnitFor(1, 'cup', [...sticksThenTbsp].reverse(), butterEdges), 'stick')
  // No rules, or units that don't convert: as written.
  assert.equal(showUnitFor(1, 'cup', [], butterEdges), null)
  assert.equal(showUnitFor(2, '', sticksThenTbsp, butterEdges), null)
  // A threshold in the rule's own unit.
  assert.equal(showUnitFor(1, 'tbsp', [{ unit: 'cup', from: { qty: '1/4' } }], butterEdges), null)
})

test('grocery totals read in the show-in unit, unless a sold-as unit applies', () => {
  const amounts = new Map([
    ['cup', 3 / 4],
    ['tbsp', 2],
  ])
  assert.deepEqual(combineAmounts(amounts, butterEdges, null, sticksThenTbsp), [[{ qty: 1.75, unit: 'stick' }]])
  assert.deepEqual(combineAmounts(new Map([['tbsp', 3]]), butterEdges, null, sticksThenTbsp), [[{ qty: 3, unit: 'tbsp' }]])
  assert.deepEqual(combineAmounts(amounts, butterEdges, 'lb', sticksThenTbsp), combineAmounts(amounts, butterEdges, 'lb'))
})
