import { formatQuantity, normalizeUnit, parseQuantity } from './quantity.js'
import { activeIngredients } from './recipe.js'

const itemKey = (item) => String(item ?? '').trim().toLowerCase()

/**
 * Combine ingredients across planned meals. Amounts with the same unit are
 * summed; different units are listed side by side ("1 + 1 cup").
 */
export function buildGroceryList(plan, recipesById, staples) {
  const items = new Map()

  for (const entry of plan.entries) {
    const recipe = recipesById[entry.recipeId]
    if (!recipe) continue
    const scale = Number(entry.scale) || 1

    for (const ing of activeIngredients(recipe)) {
      const name = itemKey(ing.item)
      if (!name) continue
      if (!items.has(name)) items.set(name, { name, amounts: new Map(), other: new Set(), sources: new Set() })
      const agg = items.get(name)

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

  const stapleSet = new Set(staples.map(itemKey))
  const lines = [...items.values()]
    .map((agg) => ({
      name: agg.name,
      amount: formatAmounts(agg),
      sources: [...agg.sources],
      staple: stapleSet.has(agg.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    groceries: lines.filter((l) => !l.staple),
    pantry: lines.filter((l) => l.staple),
  }
}

function formatAmounts(agg) {
  // Unitless counts first ("2"), then units alphabetically.
  const units = [...agg.amounts.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  const parts = units.map((u) => `${formatQuantity(agg.amounts.get(u))} ${u}`.trim())
  return [...parts, ...agg.other].join(' + ')
}

export function groceryListText({ groceries, pantry }) {
  const line = (l) => `- ${l.name}${l.amount ? `: ${l.amount}` : ''}`
  const sections = []
  if (groceries.length) sections.push(['Groceries', ...groceries.map(line)].join('\n'))
  if (pantry.length) sections.push(['Pantry (check before buying)', ...pantry.map(line)].join('\n'))
  return sections.join('\n\n')
}
