import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarEvents, diffEvents, googleEvent } from './calendar.js'

const settings = { dayEffort: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 3, sun: 3 }, noCookDays: [], weights: {} }
const cycle = '2026-10-26'
const ing = (id) => ({ id, original: { quantity: '1', unit: '', ingredientId: id, note: '' }, modified: null })
const recipesById = {
  chops: { id: 'chops', name: 'Pork Chops', prepMinutes: 10, cookMinutes: 90, ingredients: [ing('pork-chop')] },
  mash: { id: 'mash', name: 'Mashed Potatoes', ingredients: [] },
  soup: { id: 'soup', name: 'Soup', ingredients: [] },
}
const registry = { ingredients: { 'pork-chop': { name: 'pork chop', shelfLifeDays: 2, thaw: true } } }
const plan = {
  meals: [
    { id: 'a', recipeId: 'chops', cycle, date: '2026-11-04', scale: 1.5, sides: [{ recipeId: 'mash', scale: 1 }], leftovers: ['2026-11-05'] },
    { id: 'b', recipeId: 'soup', cycle, date: '2026-10-20', scale: 1 },
    { id: 'c', recipeId: 'soup', cycle, date: null, scale: 1 },
  ],
  days: {},
}

test('builds meal, leftover and thaw events from the given date on', () => {
  const events = calendarEvents({ plan, recipesById, registry, settings, from: '2026-10-26' })
  assert.deepEqual(events, [
    { key: 'thaw:2026-11-03', date: '2026-11-03', summary: 'Thaw pork chop for Pork Chops', description: '' },
    { key: 'meal:a', date: '2026-11-04', summary: 'Pork Chops + Mashed Potatoes', description: 'Prep 10 min · Cook 1 hr 30 min\n1.5× batch' },
    { key: 'leftovers:a:0', date: '2026-11-05', summary: 'Leftovers: Pork Chops', description: '' },
  ])
})

test('google events are all day and tagged', () => {
  const g = googleEvent({ key: 'meal:a', date: '2026-11-30', summary: 'x', description: '' })
  assert.deepEqual(g.start, { date: '2026-11-30' })
  assert.deepEqual(g.end, { date: '2026-12-01' })
  assert.deepEqual(g.extendedProperties.private, { app: 'food-dashboard', key: 'meal:a' })
})

test('diff inserts new, updates changed, removes gone and duplicate events', () => {
  const wanted = [
    { key: 'meal:a', date: '2026-11-04', summary: 'A', description: '' },
    { key: 'meal:b', date: '2026-11-05', summary: 'B', description: '' },
    { key: 'meal:c', date: '2026-11-06', summary: 'C', description: '' },
  ]
  const g = (id, key, date, summary) => ({ id, summary, start: { date }, extendedProperties: { private: { key } } })
  const existing = [
    g('1', 'meal:a', '2026-11-04', 'A'),
    g('2', 'meal:b', '2026-11-04', 'B'),
    g('3', 'meal:b', '2026-11-05', 'B'),
    g('4', 'meal:z', '2026-11-07', 'Z'),
  ]
  const { insert, update, remove } = diffEvents(wanted, existing)
  assert.deepEqual(insert.map((e) => e.key), ['meal:c'])
  assert.deepEqual(update, [{ id: '2', event: wanted[1] }])
  assert.deepEqual(remove.sort(), ['3', '4'])
})
