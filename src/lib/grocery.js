import { mealParts } from './meals.js'
import { formatQuantity, normalizeUnit, parseQuantity } from './quantity.js'
import { activeIngredients, capitalize } from './recipe.js'
import { BUILTIN_CONVERSIONS, combineAmounts, unitGraph } from './units.js'

export const itemKey = (item) => String(item ?? '').trim().toLowerCase()

/**
 * Combine ingredients across planned meals and their sides. Amounts are converted and summed
 * using each ingredient's own conversion list (standard ones are filled in
 * automatically when recipes are saved); anything left unconvertible is listed
 * side by side ("1 + 1 cup"). Ingredients marked "not listed" (e.g. "taco
 * toppings") are returned separately so the list can mention them.
 */
export function buildGroceryList(meals, recipesById, registry) {
  const items = new Map()

  for (const entry of meals.flatMap(mealParts)) {
    const recipe = recipesById[entry.recipeId]
    if (!recipe) continue
    const scale = Number(entry.scale) || 1

    for (const ing of activeIngredients(recipe)) {
      const key = ing.ingredientId ?? itemKey(ing.item)
      if (!key) continue
      if (!items.has(key)) items.set(key, { id: key, name: capitalize(ing.item.trim()), amounts: new Map(), other: new Set(), sources: new Set() })
      const agg = items.get(key)

      const qty = parseQuantity(ing.quantity)
      const unit = normalizeUnit(ing.unit)
      if (qty != null) {
        agg.amounts.set(unit, (agg.amounts.get(unit) ?? 0) + qty * scale)
      } else {
        const raw = [ing.quantity, ing.unit].filter((s) => s && s.trim()).join(' ')
        if (raw) agg.other.add(raw)
      }
      agg.sources.add(scale === 1 ? recipe.name : `${recipe.name} ×${scale}`)
    }
  }

  const lines = [...items.values()]
    .map((agg) => {
      const info = registry?.ingredients?.[agg.id] ?? {}
      // Standard conversions always apply, so 3 tsp can read as 1 tbsp even
      // for an ingredient only ever used in teaspoons.
      const edges = unitGraph([...BUILTIN_CONVERSIONS, ...(info.conversions ?? [])])
      const preferred = info.buyUnit == null ? null : normalizeUnit(info.buyUnit)
      const amounts = combineAmounts(agg.amounts, edges, preferred)
      return {
        id: agg.id,
        name: agg.name,
        amount: formatAmounts(amounts, agg.other),
        unconverted: amounts.length > 1,
        sources: [...agg.sources],
        staple: !!info.staple,
        notListed: !!info.notListed,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const listed = lines.filter((l) => !l.notListed)
  return {
    groceries: listed.filter((l) => !l.staple),
    pantry: listed.filter((l) => l.staple),
    notListed: lines.filter((l) => l.notListed),
  }
}

function formatAmounts(amounts, other) {
  // Unitless counts first ("2"), then units alphabetically.
  const sorted = [...amounts].sort((a, b) => (a[0].unit === '' ? -1 : b[0].unit === '' ? 1 : a[0].unit.localeCompare(b[0].unit)))
  const parts = sorted.flatMap((group) => group.map((p) => `${formatQuantity(p.qty)} ${p.unit}`.trim()))
  return [...parts, ...other].join(' + ')
}

export function groceryListText({ groceries, pantry }, checked = () => false) {
  const line = (l) => `- ${l.name}${l.amount ? `: ${l.amount}` : ''}`
  const sections = []
  const toBuy = groceries.filter((l) => !checked(l))
  const toCheck = pantry.filter((l) => !checked(l))
  if (toBuy.length) sections.push(['Groceries', ...toBuy.map(line)].join('\n'))
  if (toCheck.length) sections.push(['Pantry (check before buying)', ...toCheck.map(line)].join('\n'))
  return sections.join('\n\n')
}
