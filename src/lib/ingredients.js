// Ingredient registry entries (data/ingredients.json), as the app works with them.
//   { name, aliases?, section?, staple?, notListed?, purchase?: { qty?, unit },
//     conversions?, showAs?, shelfLifeDays?, thaw?, separateFrom? }
// `purchase` is how it's sold: { qty: '2', unit: 'lb' } for 2 lb packs, or
// { unit: 'lb' } for any amount, totalled in pounds. Missing = the recipes' units.
// `showAs` is the units its amounts read in, e.g. sticks from 1/2 cup and tbsp
// below: [{ unit: 'stick', from: { qty: '1/2', unit: 'cup' } }, { unit: 'tbsp' }]
// (see showUnitFor in units.js). `separateFrom` lists ingredient ids confirmed
// to be different things, so they aren't flagged as possible duplicates.

/** Where things are in the store, in the order the grocery list shows them. */
export const STORE_SECTIONS = [
  ['produce', 'Produce'],
  ['meat', 'Meat & seafood'],
  ['dairy', 'Dairy & eggs'],
  ['bakery', 'Bakery'],
  ['frozen', 'Frozen'],
  ['canned', 'Canned & jarred'],
  ['dry', 'Pasta, rice & grains'],
  ['baking', 'Baking'],
  ['spices', 'Spices'],
  ['condiments', 'Oils, sauces & condiments'],
  ['snacks', 'Snacks'],
  ['drinks', 'Drinks'],
  ['other', 'Other'],
]
const SECTION_LABELS = Object.fromEntries(STORE_SECTIONS)
export const sectionLabel = (key) => SECTION_LABELS[key] ?? null
const SECTION_ORDER = Object.fromEntries(STORE_SECTIONS.map(([k], i) => [k, i]))

/**
 * Lines grouped by store section, in store order: [{ key, label, lines }].
 * Lines without a section (or an unknown one) go with Other, at the end.
 */
export function bySection(lines) {
  const groups = new Map()
  for (const l of lines) {
    const key = SECTION_LABELS[l.section] ? l.section : 'other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(l)
  }
  return [...groups]
    .sort(([a], [b]) => SECTION_ORDER[a] - SECTION_ORDER[b])
    .map(([key, lines]) => ({ key, label: SECTION_LABELS[key], lines }))
}

/** An entry in its current shape: the old "buy as" unit becomes `purchase` without an amount. */
export function normalizeIngredient(info) {
  const { buyUnit, ...rest } = info
  if (buyUnit == null || rest.purchase) return rest
  return { ...rest, purchase: { unit: buyUnit } }
}

export const normalizeRegistry = (registry) => ({
  ...registry,
  ingredients: Object.fromEntries(Object.entries(registry?.ingredients ?? {}).map(([id, info]) => [id, normalizeIngredient(info)])),
})
