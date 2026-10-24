// Quantities are stored as human-friendly strings ("1/3", "1 1/2", "2") and
// parsed to numbers only for scaling and aggregation.

const FRACTIONS = [
  [0, ''],
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
  [1, ''],
]

/** Parse "2", "1/3", "1 1/2", "0.75" to a number; null if not a plain amount (e.g. "to taste"). */
export function parseQuantity(text) {
  const s = String(text ?? '').trim()
  if (!s) return null
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  if (/^\d*\.?\d+$/.test(s)) return Number(s)
  return null
}

function nearestFraction(n) {
  const rest = n - Math.floor(n)
  const best = FRACTIONS.reduce((b, f) => (Math.abs(f[0] - rest) < Math.abs(b[0] - rest) ? f : b))
  return { best, exact: Math.abs(best[0] - rest) <= 0.02 }
}

/** True if n formats as a whole number or common fraction (not a decimal). */
export function isNiceQuantity(n) {
  return nearestFraction(n).exact
}

/** Format a number as a kitchen-friendly string, preferring common fractions. */
export function formatQuantity(n) {
  if (n == null || Number.isNaN(n)) return ''
  let whole = Math.floor(n)
  const { best: [value, label], exact } = nearestFraction(n)
  if (!exact) return String(Math.round(n * 100) / 100)
  if (value === 1) whole += 1
  if (!label) return String(whole)
  return whole ? `${whole} ${label}` : label
}

const UNIT_ALIASES = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl oz': 'fl oz', 'fl. oz': 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', l: 'l',
  each: '', ea: '',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can',
  pinch: 'pinch', pinches: 'pinch',
}

/** Normalize unit spelling so "Tbsp" and "tablespoons" combine. Unknown units pass through lowercased. */
export function normalizeUnit(unit) {
  const u = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  return UNIT_ALIASES[u] ?? u
}

export function formatIngredient({ quantity, unit, item, note }) {
  return [quantity, unit, item].filter((s) => s && String(s).trim()).join(' ') + (note ? `, ${note}` : '')
}
