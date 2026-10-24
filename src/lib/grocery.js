import { formatQuantity, normalizeUnit, parseQuantity } from './quantity.js'
import { activeIngredients } from './recipe.js'
import { combineAmounts, unitGraph } from './units.js'

export const itemKey = (item) => String(item ?? '').trim().toLowerCase()

/**
 * Combine ingredients across planned meals. Amounts are converted and summed
 * using each ingredient's own conversion list (standard ones are filled in
 * automatically when recipes are saved); anything left unconvertible is listed
 * side by side ("1 + 1 cup").
 */
export function buildGroceryList(plan, recipesById, registry) {
  const items = new Map()

  for (const entry of plan.entries) {
    const recipe = recipesById[entry.recipeId]
    if (!recipe) continue
    const scale = Number(entry.scale) || 1

    for (const ing of activeIngredients(recipe)) {
      const key = ing.ingredientId ?? itemKey(ing.item)
      if (!key) continue
      if (!items.has(key)) items.set(key, { id: key, name: itemKey(ing.item), amounts: new Map(), other: new Set(), sources: new Set() })
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
      const edges = unitGraph(info.conversions ?? [])
      const preferred = info.buyUnit == null ? null : normalizeUnit(info.buyUnit)
      const amounts = combineAmounts(agg.amounts, edges, preferred)
      return {
        id: agg.id,
        name: agg.name,
        amount: formatAmounts(amounts, agg.other),
        unconverted: amounts.length > 1,
        sources: [...agg.sources],
        staple: !!info.staple,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    groceries: lines.filter((l) => !l.staple),
    pantry: lines.filter((l) => l.staple),
  }
}

function formatAmounts(amounts, other) {
  // Unitless counts first ("2"), then units alphabetically.
  const sorted = [...amounts].sort((a, b) => (a.unit === '' ? -1 : b.unit === '' ? 1 : a.unit.localeCompare(b.unit)))
  const parts = sorted.map((a) => `${formatQuantity(a.qty)} ${a.unit}`.trim())
  return [...parts, ...other].join(' + ')
}

export function groceryListText({ groceries, pantry }) {
  const line = (l) => `- ${l.name}${l.amount ? `: ${l.amount}` : ''}`
  const sections = []
  if (groceries.length) sections.push(['Groceries', ...groceries.map(line)].join('\n'))
  if (pantry.length) sections.push(['Pantry (check before buying)', ...pantry.map(line)].join('\n'))
  return sections.join('\n\n')
}
