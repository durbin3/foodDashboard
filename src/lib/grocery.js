import { bySection } from './ingredients.js'
import { amountText, computeNeeds } from './needs.js'

/**
 * The grocery list for a set of planned meals and their sides. Amounts come
 * from computeNeeds: totals converted with each ingredient's own conversion
 * list, less what's in storage, rounded up to pack sizes. Lines fully covered
 * by storage are listed separately so they can be checked rather than bought.
 * Ingredients marked "not listed" (e.g. "taco toppings") are returned
 * separately so the list can mention them. Lines carry their store section,
 * so the list can be grouped by it (see bySection in ingredients.js).
 */
export function buildGroceryList(meals, recipesById, registry, inventory) {
  const lines = computeNeeds(meals, recipesById, registry, inventory)
    .map((n) => ({
      id: n.id,
      name: n.name,
      amount: n.math ? buyText(n) : n.used,
      detail: [n.math && detailText(n), n.storedOther.length && `${n.storedOther.join(' + ')} in storage doesn't convert, so isn't counted`].filter(Boolean).join('; '),
      covered: !!n.math && n.math.buyQty <= 0,
      unconverted: n.unconverted,
      sources: n.sources,
      section: n.section,
      staple: n.staple,
      notListed: n.notListed,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const listed = lines.filter((l) => !l.notListed)
  return {
    groceries: listed.filter((l) => !l.staple && !l.covered),
    pantry: listed.filter((l) => l.staple && !l.covered),
    stored: listed.filter((l) => l.covered),
    notListed: lines.filter((l) => l.notListed),
  }
}

/** "2 lb" or, for packs that aren't a single unit, "4 lb (2 packs)". */
function buyText(n) {
  const { buyQty, packs, pack } = n.math
  const text = amountText(n, buyQty)
  return packs > 1 || (pack && pack.qty !== 1 && packs) ? `${text} (${packs} pack${packs === 1 ? '' : 's'})` : text
}

/** What the amount is made of: what the meals use, what's in storage, what's left over. */
function detailText(n) {
  const { usedQty, haveQty, buyQty, leftoverQty } = n.math
  const parts = [`use ${amountText(n, usedQty)}`]
  if (haveQty > 0) parts.push(`have ${amountText(n, haveQty)} in storage`)
  if (leftoverQty > 1e-9) parts.push(`${amountText(n, leftoverQty)} left over`)
  // Bought exactly what's used: nothing worth explaining.
  return haveQty <= 0 && leftoverQty <= 1e-9 && buyQty > 0 ? '' : parts.join(', ')
}

export function groceryListText({ groceries, pantry }, checked = () => false) {
  const line = (l) => `- ${l.name}${l.amount ? `: ${l.amount}` : ''}`
  const sections = []
  const toBuy = groceries.filter((l) => !checked(l))
  const toCheck = pantry.filter((l) => !checked(l))
  for (const group of bySection(toBuy)) sections.push([group.label, ...group.lines.map(line)].join('\n'))
  if (toCheck.length) sections.push(['Pantry (check before buying)', ...toCheck.map(line)].join('\n'))
  return sections.join('\n\n')
}
