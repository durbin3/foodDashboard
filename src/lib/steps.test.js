import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessStepIngredients, splitAmounts, stepLines, unitChoices } from './steps.js'
import { BUILTIN_CONVERSIONS, unitGraph } from './units.js'

const edges = unitGraph(BUILTIN_CONVERSIONS)
const edgesOf = () => edges
const ing = (id, quantity, unit, item, extra = {}) => ({ id, quantity, unit, item, note: '', group: '', ...extra })

test('a partial use says how much is left; a later use with no amount takes the rest', () => {
  const ings = [ing('olive-oil', '3', 'tbsp', 'olive oil')]
  const [first, second] = stepLines([[{ id: 'olive-oil', quantity: '1', unit: 'tbsp' }], [{ id: 'olive-oil' }]], ings, { edgesOf })
  assert.deepEqual([first[0].qty, first[0].unit, first[0].rest], [1, 'tbsp', { qty: 2, unit: 'tbsp' }])
  assert.deepEqual([second[0].qty, second[0].rest], [2, null])
})

test('uses in another unit count against the ingredient, and scale with the recipe', () => {
  const ings = [ing('butter', '1/2', 'cup', 'butter')]
  const [[line]] = stepLines([[{ id: 'butter', quantity: '2', unit: 'tbsp' }]], ings, { edgesOf, scale: 2 })
  assert.equal(line.qty, 4)
  assert.equal(line.rest.qty, 3 / 4)
})

test('an ingredient already used up is listed without an amount', () => {
  const ings = [ing('lemon', '1', '', 'lemon')]
  const [a, b] = stepLines([[{ id: 'lemon', note: 'zest' }], [{ id: 'lemon', note: 'juice' }]], ings, { edgesOf })
  assert.equal(a[0].qty, 1)
  assert.equal(b[0].qty, null)
  assert.equal(b[0].note, 'juice')
})

test('amounts that are not numbers are shown as written', () => {
  const ings = [ing('salt', '', '', 'salt', { note: 'to taste' })]
  const [[line]] = stepLines([[{ id: 'salt' }]], ings, { edgesOf })
  assert.deepEqual([line.qty, line.text, line.note], [null, '', 'to taste'])
})

test('unit choices offer readable amounts only', () => {
  const units = unitChoices(1, 'tbsp', edges).map((c) => c.unit)
  assert.ok(units.includes('tsp'))
  assert.ok(units.includes('ml'))
  assert.ok(!units.includes('cup'), '1/16 cup is not a measure anyone has')
})

test('guesses match names, prefer the longer name, and read amounts written before them', () => {
  const recipe = { steps: ['Season the salmon with seasoning salt.', 'Heat 1 tablespoon of olive oil, then add the chopped parsley.'] }
  const ings = [
    ing('salmon', '4', '', 'salmon fillet'),
    ing('seasoning-salt', '1', 'tsp', 'seasoning salt'),
    ing('salt', '', '', 'salt'),
    ing('olive-oil', '3', 'tbsp', 'olive oil'),
    ing('parsley', '1', 'tbsp', 'fresh parsley'),
  ]
  const [one, two] = guessStepIngredients(recipe, ings, { ingredients: {} })
  assert.deepEqual(one.map((u) => u.id), ['seasoning-salt'], 'salt inside "seasoning salt" is not salt; "salmon" alone is not "salmon fillet"')
  assert.deepEqual(two, [{ id: 'olive-oil', quantity: '1', unit: 'tbsp' }, { id: 'parsley' }])
})

test('the same name on several ingredients goes to the first one not mentioned yet', () => {
  const recipe = { steps: ['Add the butter.', 'Mix butter and sugar.'] }
  const ings = [ing('dough-butter', '1/3', 'cup', 'butter'), ing('filling-butter', '1/2', 'cup', 'butter'), ing('sugar', '1', 'cup', 'sugar')]
  const [one, two] = guessStepIngredients(recipe, ings, { ingredients: {} })
  assert.deepEqual(one.map((u) => u.id), ['dough-butter'])
  assert.deepEqual(two.map((u) => u.id), ['filling-butter', 'sugar'])
})

test('amounts in step text are split out so they can be converted', () => {
  const parts = splitAmounts('Heat 1 tablespoon of oil and 1 1/2 cups broth for 2-3 minutes.')
  assert.deepEqual(
    parts.filter((p) => typeof p !== 'string'),
    [
      { qty: 1, unit: 'tbsp', text: '1 tablespoon' },
      { qty: 1.5, unit: 'cup', text: '1 1/2 cups' },
    ],
  )
  assert.equal(parts.map((p) => (typeof p === 'string' ? p : p.text)).join(''), 'Heat 1 tablespoon of oil and 1 1/2 cups broth for 2-3 minutes.')
})
