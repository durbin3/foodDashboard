// Which ingredients each step uses, and how much of each is left after it.
//
// `recipe.stepIngredients`, when present, lines up with `recipe.steps`:
//   [[{ id, quantity?, unit?, note? }, …], …]
// where `id` is the recipe ingredient's id (not the registry id). A use with
// no quantity takes whatever is left of the ingredient, so "the remaining
// olive oil" needs no amount. Recipes without it get a guess from the wording
// of each step.
import { formatQuantity, normalizeUnit, parseQuantity } from './quantity.js'
import { scaleQuantity } from './recipe.js'
import { BUILTIN_CONVERSIONS, reachable, unitGraph } from './units.js'

/** The unit graph for one recipe ingredient: standard conversions plus its own. */
export function edgesFor(ing, registry) {
  return unitGraph([...BUILTIN_CONVERSIONS, ...(registry?.ingredients?.[ing.ingredientId]?.conversions ?? [])])
}

/** `qty` of `from` expressed in `to`, or null when the conversions don't connect them. */
export function convertQty(qty, from, to, edges) {
  const [a, b] = [normalizeUnit(from), normalizeUnit(to)]
  if (a === b) return qty
  const size = reachable(edges, b).get(a)
  return size == null ? null : qty * size
}

const METRIC = new Set(['g', 'kg', 'ml', 'l'])

/** "1 1/2 tbsp", "236 ml": fractions for kitchen units, rounded numbers for metric. */
export function formatAmount(qty, unit) {
  if (qty == null) return ''
  const text = METRIC.has(unit) ? String(qty >= 10 ? Math.round(qty) : Math.round(qty * 10) / 10) : formatQuantity(qty)
  return [text, unit].filter(Boolean).join(' ')
}

/**
 * Other units an amount reads sensibly in, largest first: [{ unit, qty }].
 * Kitchen units need a common fraction (1/16 cup isn't offered for 1 tbsp);
 * metric amounts are rounded, so they're always offered.
 */
export function unitChoices(qty, unit, edges) {
  if (qty == null || qty <= 0) return []
  const from = normalizeUnit(unit)
  const size = reachable(edges, from)
  return [...size.entries()]
    .filter(([u]) => u !== from)
    .map(([u, s]) => ({ unit: u, qty: qty / s, size: s }))
    .filter(({ unit: u, qty: q }) => {
      if (METRIC.has(u)) return q >= (u === 'kg' || u === 'l' ? 0.25 : 1)
      if (u === 'pinch') return q <= 8
      if (q < 1 / 8 - 1e-9 || q > 100) return false
      return formatQuantity(q).match(/^[\d /]+$/) != null
    })
    .sort((a, b) => b.size - a.size)
    .map(({ unit: u, qty: q }) => ({ unit: u, qty: q }))
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Words too general to stand for an ingredient on their own.
const GENERIC = new Set(['oil', 'sauce', 'powder', 'cheese', 'water', 'pepper', 'salt', 'sugar', 'seasoning', 'mix', 'stock', 'juice'])
const UNIT_WORDS = 'tablespoons?|tbsps?|tbs|teaspoons?|tsps?|cups?|pounds?|lbs?|ounces?|oz|grams?|g|ml|cloves?|cans?|pinch(?:es)?'
const AMOUNT = '(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.?\\d+|[½¼¾⅓⅔])'
const UNICODE_FRACTIONS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' }

// A name as a pattern that allows plurals and any spacing: "olive oil" ~ "Olive  oils".
const namePattern = (name) =>
  String(name)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((w) => `${escape(w.replace(/(es|s)$/, ''))}(?:e?s)?`)
    .join('\\s+')

/**
 * A best guess at each step's ingredients, from the names (and registry
 * aliases) the step mentions. A longer name wins over one inside it, so
 * "seasoning salt" isn't also salt. An amount written just before the name
 * ("1 tablespoon of olive oil") becomes the use's quantity.
 */
export function guessStepIngredients(recipe, ingredients, registry) {
  const heads = {}
  for (const ing of ingredients) {
    const head = String(ing.item ?? '').toLowerCase().trim().split(/\s+/).pop()
    if (head) heads[head] = (heads[head] ?? 0) + 1
  }
  const patterns = ingredients.map((ing) => {
    const info = registry?.ingredients?.[ing.ingredientId]
    const names = [ing.item, info?.name, ...(info?.aliases ?? [])].filter((n) => n && n.trim())
    const words = String(ing.item ?? '').toLowerCase().trim().split(/\s+/)
    const head = words[words.length - 1]
    // "fresh parsley" is still parsley in "sprinkle chopped parsley", when nothing else in the recipe is.
    if (words.length > 1 && head.length >= 4 && heads[head] === 1 && !GENERIC.has(head)) names.push(head)
    return { ing, re: new RegExp(`\\b(?:${[...new Set(names)].map(namePattern).join('|')})\\b`, 'g') }
  })

  const mentioned = new Set()
  return recipe.steps.map((step) => {
    const text = String(step).toLowerCase()
    const hits = []
    for (const { ing, re } of patterns)
      for (const m of text.matchAll(re)) hits.push({ ing, start: m.index, end: m.index + m[0].length })
    const kept = hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
    const uses = []
    const named = new Set()
    for (const h of kept.sort((a, b) => a.start - b.start)) {
      if (uses.some((u) => u.id === h.ing.id)) continue
      // Several ingredients with one name (butter for the dough, the filling and the frosting):
      // a mention is the first one not used yet.
      const name = String(h.ing.item).toLowerCase()
      if (named.has(name)) continue
      const same = ingredients.filter((i) => String(i.item).toLowerCase() === name)
      if (same.length > 1 && h.ing !== (same.find((i) => !mentioned.has(i.id)) ?? same[same.length - 1])) {
        continue
      }
      named.add(name)
      mentioned.add(h.ing.id)
      const before = text.slice(Math.max(0, h.start - 50), h.start)
      const m = before.match(new RegExp(`${AMOUNT}\\s*(${UNIT_WORDS})\\s+(?:of\\s+)?(?:the\\s+)?(?:[a-z-]+\\s+)?$`))
      if (m && !/remaining|rest/.test(m[0])) uses.push({ id: h.ing.id, quantity: UNICODE_FRACTIONS[m[1]] ?? m[1].trim(), unit: normalizeUnit(m[2]) })
      else uses.push({ id: h.ing.id })
    }
    return uses
  })
}

/** The step uses to show: the recipe's own when it has them for every step, otherwise a guess. */
export function stepIngredientsOf(recipe, ingredients, registry) {
  const stored = recipe.stepIngredients
  if (Array.isArray(stored) && stored.length === recipe.steps.length) return stored
  return guessStepIngredients(recipe, ingredients, registry)
}

/**
 * What each step needs, in order: per step, a list of
 *   { id, item, note, qty, unit, text, rest }
 * `qty`/`unit` is the amount the step uses (scaled), or null with `text` for
 * an amount that isn't a number ("to taste"). `rest` ({ qty, unit }, in the
 * ingredient's unit) is set when a step uses part of an ingredient and some
 * is left for later steps.
 */
export function stepLines(uses, ingredients, { scale = 1, edgesOf }) {
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]))
  const left = {}
  for (const ing of ingredients) left[ing.id] = parseQuantity(scaleQuantity(ing.quantity, scale))

  return uses.map((step) =>
    step
      .filter((u) => byId[u.id])
      .map((u) => {
        const ing = byId[u.id]
        const unit = normalizeUnit(u.unit ?? ing.unit)
        const line = { id: ing.id, item: ing.item, note: u.note ?? '', qty: null, unit, text: '', rest: null }
        const have = left[ing.id]
        if (have == null) {
          // "to taste" or an amount the grocery list can't read either: show it as written.
          line.text = u.quantity ? [u.quantity, u.unit].filter(Boolean).join(' ') : [ing.quantity, ing.unit].filter((s) => String(s ?? '').trim()).join(' ')
          if (!line.text && !line.note) line.note = ing.note ?? ''
          return line
        }
        const useQty = parseQuantity(u.quantity)
        if (useQty == null) {
          // No amount: whatever hasn't been used yet.
          if (have > 1e-9) Object.assign(line, { qty: have, unit: normalizeUnit(ing.unit) })
          left[ing.id] = 0
          return line
        }
        line.qty = useQty * scale
        const used = convertQty(line.qty, unit, ing.unit, edgesOf(ing))
        if (used == null) return line
        left[ing.id] = Math.max(0, have - used)
        if (left[ing.id] > 1e-6) line.rest = { qty: left[ing.id], unit: normalizeUnit(ing.unit) }
        return line
      }),
  )
}

/**
 * A step's text split around the amounts written in it ("heat 1 tablespoon of
 * oil"), so each can be shown in another unit: strings and { qty, unit, text }.
 */
export function splitAmounts(text) {
  const re = new RegExp(`(^|[^\\w/.])${AMOUNT}\\s*(${UNIT_WORDS})\\b`, 'gi')
  const parts = []
  let at = 0
  for (const m of String(text).matchAll(re)) {
    const start = m.index + m[1].length
    const qty = parseQuantity(UNICODE_FRACTIONS[m[2]] ?? m[2].trim())
    if (qty == null) continue
    parts.push(text.slice(at, start), { qty, unit: normalizeUnit(m[3]), text: m[0].slice(m[1].length) })
    at = m.index + m[0].length
  }
  parts.push(text.slice(at))
  return parts.filter((p) => p !== '')
}
