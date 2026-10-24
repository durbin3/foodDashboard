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

/**
 * Combine per-unit totals into as few amounts as the conversions allow.
 * `preferredUnit` (an ingredient's "buy as" unit, null for automatic) is used
 * whenever it's reachable; otherwise the largest unit present that gives a
 * whole number or common fraction is chosen.
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
    const unit = pickUnit(total, members, size, preferredUnit)
    result.push({ qty: total / size.get(unit), unit })
  }
  return result
}

function pickUnit(total, members, size, preferredUnit) {
  if (preferredUnit != null && size.has(preferredUnit)) return preferredUnit
  const largestFirst = [...members].sort((a, b) => size.get(b) - size.get(a))
  // Allow down to 1/4 of a unit, so 12 tbsp reads as 3/4 cup.
  const atLeastOne = largestFirst.filter((u) => total / size.get(u) >= 0.249)
  // A nice fraction in a small unit beats a decimal, but not when it's a big
  // count of a small unit (49 tsp reads worse than 1.02 cup).
  const nice = atLeastOne.find((u) => isNiceQuantity(total / size.get(u)))
  if (nice && total / size.get(nice) <= 12) return nice
  return atLeastOne[0] ?? largestFirst[largestFirst.length - 1]
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
