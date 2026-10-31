// What a set of planned meals needs you to buy. For each ingredient: how much
// the meals use, how much is already in storage (data/inventory.json), how
// much to buy once rounded up to the pack size it's sold in, and how much will
// be left over.
//
// The arithmetic happens in one base unit per ingredient (the unit it's sold
// in, else the unit the recipes use), so it only applies when
// every amount converts to that unit. When an ingredient has no pack size and
// nothing in storage, there's nothing to subtract or round, and it's listed
// exactly as the recipes add up.

import { mealParts } from './meals.js'
import { formatQuantity, normalizeUnit, parseQuantity } from './quantity.js'
import { activeIngredients, capitalize } from './recipe.js'
import { BUILTIN_CONVERSIONS, combineAmounts, reachable, unitGraph } from './units.js'

export const itemKey = (item) => String(item ?? '').trim().toLowerCase()

/** Per-unit totals of every ingredient the meals (and their sides) use. */
function usage(meals, recipesById) {
  const items = new Map()
  for (const part of meals.flatMap(mealParts)) {
    const recipe = recipesById[part.recipeId]
    if (!recipe) continue
    const scale = Number(part.scale) || 1
    for (const ing of activeIngredients(recipe)) {
      const key = ing.ingredientId ?? itemKey(ing.item)
      if (!key) continue
      if (!items.has(key)) items.set(key, { id: key, name: capitalize(ing.item.trim()), amounts: new Map(), other: new Set(), sources: new Set() })
      const agg = items.get(key)
      const qty = parseQuantity(ing.quantity)
      const unit = normalizeUnit(ing.unit)
      if (qty != null) agg.amounts.set(unit, (agg.amounts.get(unit) ?? 0) + qty * scale)
      else {
        const raw = [ing.quantity, ing.unit].filter((s) => s && s.trim()).join(' ')
        if (raw) agg.other.add(raw)
      }
      agg.sources.add(scale === 1 ? recipe.name : `${recipe.name} ×${formatQuantity(scale)}`)
    }
  }
  return items
}

/** Amounts as text: unitless counts first ("2"), then units alphabetically, then anything unparsed. */
export function formatAmounts(amounts, other = []) {
  const sorted = [...amounts].sort((a, b) => (a[0].unit === '' ? -1 : b[0].unit === '' ? 1 : a[0].unit.localeCompare(b[0].unit)))
  const parts = sorted.flatMap((group) => group.map((p) => `${formatQuantity(p.qty)} ${p.unit}`.trim()))
  return [...parts, ...other].join(' + ')
}

const EPS = 1e-9

/**
 * One entry per ingredient the meals use:
 *   { id, name, sources, section, staple, notListed, used, unconverted, storedOther,
 *     math: null | { base, usedQty, haveQty, buyQty, leftoverQty, packs, pack } }
 * `used` is the recipes' total as text. `math` is set when there's a pack size
 * or storage to account for and everything converts to one unit.
 */
export function computeNeeds(meals, recipesById, registry, inventory) {
  const stored = inventory?.items ?? []
  return [...usage(meals, recipesById).values()].map((agg) => {
    const info = registry?.ingredients?.[agg.id] ?? {}
    // Standard conversions always apply, so 3 tsp can read as 1 tbsp even for an ingredient only ever used in teaspoons.
    const edges = unitGraph([...BUILTIN_CONVERSIONS, ...(info.conversions ?? [])])
    const preferred = info.purchase?.unit == null ? null : normalizeUnit(info.purchase.unit)
    const usedAmounts = combineAmounts(agg.amounts, edges, preferred)
    const entry = {
      id: agg.id,
      name: agg.name,
      sources: [...agg.sources],
      section: info.section ?? null,
      staple: !!info.staple,
      notListed: !!info.notListed,
      thaw: !!info.thaw,
      used: formatAmounts(usedAmounts, agg.other),
      unconverted: usedAmounts.length > 1,
      math: null,
      storedOther: [],
      edges,
      preferred,
    }

    const packQty = parseQuantity(info.purchase?.qty)
    const pack = packQty > 0 ? { qty: packQty, unit: normalizeUnit(info.purchase.unit) } : null
    // Storage without an amount is a note to self, not something to count.
    const have = stored.filter((s) => s.ingredientId === agg.id && parseQuantity(s.qty) > 0)
    const units = [...agg.amounts.keys()]
    if ((!pack && !have.length) || agg.other.size || !units.length) return entry

    const base = pack?.unit ?? (preferred != null && reachable(edges, preferred).has(units[0]) ? preferred : units[0])
    const size = reachable(edges, base)
    if (!units.every((u) => size.has(u))) return entry
    const usedQty = units.reduce((sum, u) => sum + agg.amounts.get(u) * size.get(u), 0)
    // Stored amounts in a unit that doesn't convert can't be counted.
    const haveQty = have.reduce((sum, s) => sum + (size.has(normalizeUnit(s.unit)) ? parseQuantity(s.qty) * size.get(normalizeUnit(s.unit)) : 0), 0)
    entry.storedOther = have.filter((s) => !size.has(normalizeUnit(s.unit))).map((s) => `${s.qty} ${s.unit}`.trim())
    const short = Math.max(0, usedQty - haveQty)
    const packs = pack ? Math.ceil(short / pack.qty - EPS) : null
    const buyQty = pack ? packs * pack.qty : short
    entry.math = { base, usedQty, haveQty, buyQty, leftoverQty: Math.max(0, buyQty + haveQty - usedQty), packs, pack }
    return entry
  })
}

/** An amount in an entry's base unit as kitchen-friendly text. */
export const amountText = (entry, qty) =>
  qty <= EPS ? '0' : formatAmounts(combineAmounts(new Map([[entry.math.base, qty]]), entry.edges, entry.math.pack ? entry.math.base : entry.preferred))

/**
 * Storage after a shopping trip for these needs: each ingredient that had
 * storage or a pack size is set to what will be left once the meals are made.
 * Other items (no amount, units that don't convert, ingredients not used) are kept.
 */
export function inventoryAfterShopping(needs, inventory, shoppingDate) {
  const items = inventory?.items ?? []
  const counted = new Map(needs.filter((n) => n.math).map((n) => [n.id, n]))
  const kept = items.filter((s) => {
    const n = counted.get(s.ingredientId)
    if (!n || !(parseQuantity(s.qty) > 0)) return true
    return !reachable(n.edges, n.math.base).has(normalizeUnit(s.unit))
  })
  const added = [...counted.values()]
    .filter((n) => n.math.leftoverQty > EPS)
    .map((n) => {
      const before = items.find((s) => s.ingredientId === n.id)
      return {
        id: globalThis.crypto?.randomUUID?.(),
        ingredientId: n.id,
        qty: formatQuantity(n.math.leftoverQty),
        unit: n.math.base,
        // Meat that gets thawed lives in the freezer until it's needed.
        location: before?.location ?? (n.thaw ? 'freezer' : ''),
        // Bought this trip if anything was bought; otherwise it's the old stock.
        added: n.math.buyQty > EPS ? shoppingDate : (before?.added ?? shoppingDate),
      }
    })
  return { ...inventory, items: [...kept, ...added] }
}
