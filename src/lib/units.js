// Unit conversions for grocery aggregation. A conversion reads
// "<qty> <unit> = <equals> <toUnit>", e.g. 1 cup = 16 tbsp, or for one
// ingredient, 1 (each) chicken breast = 1/2 lb. Conversions chain, so
// 1 tsp + 1 cup combine even though no single rule links them.
import { isNiceQuantity, normalizeUnit, parseQuantity } from './quantity.js'

export const BUILTIN_CONVERSIONS = [
  { qty: '1', unit: 'tbsp', equals: '3', toUnit: 'tsp' },
  { qty: '1', unit: 'cup', equals: '16', toUnit: 'tbsp' },
  { qty: '1', unit: 'fl oz', equals: '2', toUnit: 'tbsp' },
  { qty: '1', unit: 'pint', equals: '2', toUnit: 'cup' },
  { qty: '1', unit: 'quart', equals: '2', toUnit: 'pint' },
  { qty: '1', unit: 'gallon', equals: '4', toUnit: 'quart' },
  { qty: '1', unit: 'cup', equals: '236.6', toUnit: 'ml' },
  { qty: '1', unit: 'l', equals: '1000', toUnit: 'ml' },
  { qty: '1', unit: 'lb', equals: '16', toUnit: 'oz' },
  { qty: '1', unit: 'oz', equals: '28.35', toUnit: 'g' },
  { qty: '1', unit: 'kg', equals: '1000', toUnit: 'g' },
  { qty: '1', unit: 'tsp', equals: '16', toUnit: 'pinch' },
]

export const KNOWN_UNITS = ['', ...new Set(BUILTIN_CONVERSIONS.flatMap((c) => [c.unit, c.toUnit])), 'clove', 'can']

/** Adjacency map: unit -> [[otherUnit, k]] meaning 1 unit = k otherUnit. */
export function unitGraph(conversions) {
  const edges = new Map()
  const add = (a, b, k) => {
    if (!edges.has(a)) edges.set(a, [])
    edges.get(a).push([b, k])
  }
  for (const c of conversions) {
    const qty = parseQuantity(c.qty)
    const equals = parseQuantity(c.equals)
    const a = normalizeUnit(c.unit)
    const b = normalizeUnit(c.toUnit)
    if (!(qty > 0 && equals > 0) || a === b) continue
    add(a, b, equals / qty)
    add(b, a, qty / equals)
  }
  return edges
}

/** Every unit reachable from `root`, with its size in roots (1 unit = size root). */
export function reachable(edges, root) {
  const size = new Map([[root, 1]])
  const queue = [root]
  while (queue.length) {
    const x = queue.shift()
    for (const [y, k] of edges.get(x) ?? []) {
      if (!size.has(y)) {
        size.set(y, size.get(x) / k)
        queue.push(y)
      }
    }
  }
  return size
}

// Spoon and cup units a total may be re-expressed in, even if no recipe used
// them (3 tsp reads better as 1 tbsp), as long as the conversions reach them.
const MEASURE_UNITS = ['tsp', 'tbsp', 'cup']

// How much of a unit reads naturally: below `min` or at/above `max`, a
// neighbouring unit is better (1/2 tbsp → 1 1/2 tsp, 3 tsp → 1 tbsp).
const UNIT_RANGE = { tsp: [0.125, 3], tbsp: [1, 4] }
const DEFAULT_RANGE = [0.249, 12.001]
const inRange = (u, q) => {
  const [min, max] = UNIT_RANGE[u] ?? DEFAULT_RANGE
  return q >= min - 1e-9 && q < max
}
// Cups read best in quarters and thirds; 3/8 cup is technically right but awkward.
const isWhole = (n) => Math.abs(n - Math.round(n)) < 0.02
const isNiceIn = (u, q) => (u === 'cup' ? isWhole(q * 4) || isWhole(q * 3) : isNiceQuantity(q))

/**
 * Combine per-unit totals into as few amounts as the conversions allow. Each
 * result is a list of parts that add up to one amount, e.g. [1/2 cup, 1 tbsp].
 * `preferredUnit` (an ingredient's "buy as" unit, null for automatic) is used
 * whenever it's reachable.
 */
export function combineAmounts(amounts, edges, preferredUnit = null) {
  const left = new Map(amounts)
  const result = []
  while (left.size) {
    const [root] = left.keys()
    const size = reachable(edges, root)
    const members = [...left.keys()].filter((u) => size.has(u))
    const total = members.reduce((sum, u) => sum + left.get(u) * size.get(u), 0)
    members.forEach((u) => left.delete(u))
    result.push(expressAmount(total, members, size, preferredUnit))
  }
  return result
}

const roundUpTo8ths = (q) => Math.ceil(q * 8 - 1e-6) / 8

/** `total` (in root units) as one or two kitchen-friendly parts. */
function expressAmount(total, members, size, preferredUnit) {
  const qtyIn = (u) => total / size.get(u)
  if (preferredUnit != null && size.has(preferredUnit)) return [{ qty: roundUpTo8ths(qtyIn(preferredUnit)), unit: preferredUnit }]

  const largestFirst = (us) => [...us].sort((a, b) => size.get(b) - size.get(a))
  const extra = members.some((u) => MEASURE_UNITS.includes(u)) ? MEASURE_UNITS.filter((u) => size.has(u) && !members.includes(u)) : []
  // Units the recipes used come first, so butter stays in sticks rather than turning into cups.
  const candidates = [...largestFirst(members), ...largestFirst(extra)]

  // Counts ("2 eggs") can't be bought in halves.
  if (candidates.length === 1 && candidates[0] === '') return [{ qty: Math.ceil(qtyIn('') - 1e-6), unit: '' }]

  // One unit, if some unit gives a whole number or common fraction in its natural range.
  const single = candidates.find((u) => inRange(u, qtyIn(u)) && isNiceIn(u, qtyIn(u)))
  if (single != null) return [{ qty: qtyIn(single), unit: single }]

  // Two parts: a whole/quarter amount of one unit plus a nice remainder in a smaller one (1/2 cup + 1 tbsp).
  for (const u of candidates) {
    const q = qtyIn(u)
    const first = Math.floor(q * 4 + 1e-9) / 4
    if (first <= 0 || !inRange(u, first) || !isNiceIn(u, first)) continue
    const rest = total - first * size.get(u)
    if (rest <= total * 1e-6) continue
    const v = largestFirst(candidates).find((x) => size.get(x) < size.get(u) && inRange(x, rest / size.get(x)) && isNiceIn(x, rest / size.get(x)))
    if (v != null) return [{ qty: first, unit: u }, { qty: rest / size.get(v), unit: v }]
  }

  // Otherwise round up (you can't buy a little less) in the first unit that reads naturally.
  const unit = candidates.find((u) => inRange(u, qtyIn(u))) ?? candidates[candidates.length - 1]
  return [{ qty: roundUpTo8ths(qtyIn(unit)), unit }]
}

/** How many groups `units` fall into under `conversions` (1 means they all combine). */
export function unitGroupCount(units, conversions) {
  const edges = unitGraph(conversions)
  const left = new Set(units.map(normalizeUnit))
  let groups = 0
  for (const u of [...left]) {
    if (!left.has(u)) continue
    groups++
    for (const reached of reachable(edges, u).keys()) left.delete(reached)
  }
  return groups
}

const roundFactor = (n) => String(Math.round(n * 1000) / 1000)

/**
 * Conversions from the standard table that an ingredient needs but doesn't have:
 * for units it's used in that the table can relate (and its own list can't yet),
 * add "1 <largest unit> = n <unit>". Returns only the new conversions.
 */
export function knownConversionsFor(units, existing = []) {
  const standard = unitGraph(BUILTIN_CONVERSIONS)
  const added = []
  const pending = [...new Set(units.map(normalizeUnit))]
  while (pending.length) {
    const size = reachable(standard, pending[0])
    const related = pending.filter((u) => size.has(u)).sort((a, b) => size.get(b) - size.get(a))
    pending.splice(0, pending.length, ...pending.filter((u) => !size.has(u)))
    const [largest, ...rest] = related
    for (const u of rest) {
      if (reachable(unitGraph([...existing, ...added]), largest).has(u)) continue
      added.push({ qty: '1', unit: largest, equals: roundFactor(size.get(largest) / size.get(u)), toUnit: u })
    }
  }
  return added
}
