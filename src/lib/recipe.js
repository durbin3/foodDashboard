import { formatQuantity, parseQuantity } from './quantity.js'

// What kind of recipe it is. Each has its own subtab on the Recipes page, and
// only mains are planned as meals (sides attach to them).
export const CATEGORIES = [
  ['main', 'Mains'],
  ['side', 'Sides'],
  ['breakfast', 'Breakfast'],
  ['dessert', 'Desserts'],
  ['drink', 'Drinks'],
]
export const categoryOf = (recipe) => (CATEGORIES.some(([c]) => c === recipe.category) ? recipe.category : 'main')

// Each ingredient keeps the imported `original` and an optional `modified`
// override, so personal changes sit alongside the source recipe.
//   { id, group, original: {quantity, unit, ingredientId, note} | null, modified: {...} | null }
// Ingredients added by hand have `original: null`. `ingredientId` points into
// the registry (data/ingredients.json), which holds the display name.

/**
 * The recipe as the UI works with it: each version also carries `item`, the
 * ingredient's current name. When saved, the server links `item` back to an id
 * (creating a registry entry for a new name), so editing a row's name picks a
 * different ingredient rather than renaming one.
 */
export function withNames(recipe, registry) {
  const name = (id) => registry.ingredients?.[id]?.name ?? id ?? ''
  const resolve = (v) => v && { quantity: v.quantity, unit: v.unit, item: name(v.ingredientId), note: v.note, ingredientId: v.ingredientId }
  return { ...recipe, ingredients: recipe.ingredients.map((i) => ({ ...i, original: resolve(i.original), modified: resolve(i.modified) })) }
}

export function effectiveIngredient(ing) {
  return ing.modified ?? ing.original
}

export function activeIngredients(recipe) {
  return recipe.ingredients.map((ing) => ({ ...effectiveIngredient(ing), id: ing.id, group: ing.group }))
}

export function sameIngredient(a, b) {
  const keys = ['quantity', 'unit', 'item', 'note']
  return keys.every((k) => String(a?.[k] ?? '').trim() === String(b?.[k] ?? '').trim())
}

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A blank hand-made recipe. Its ingredients have no imported `original`. */
export function newRecipe(name, takenIds) {
  const base = slugify(name) || 'recipe'
  let id = base
  for (let n = 2; takenIds.has(id); n++) id = `${base}-${n}`
  return {
    id,
    name: name.trim(),
    source: '',
    servings: null,
    category: 'main',
    effort: null,
    prepMinutes: null,
    cookMinutes: null,
    tags: [],
    ingredients: [],
    steps: [],
    notes: '',
  }
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** True for recipes typed in by hand: no ingredient has an imported original. */
export const isHandMade = (recipe) => !recipe.ingredients.some((ing) => ing.original)

/** Changes made to an imported recipe. Hand-made recipes have nothing to compare against, so 0. */
export function modificationCount(recipe) {
  if (isHandMade(recipe)) return 0
  return recipe.ingredients.filter((ing) => ing.modified || !ing.original).length
}

/** Quantities that aren't numbers ("lil bit"), which the grocery list can't add up. */
export const unparsedQuantity = (q) => !!String(q ?? '').trim() && parseQuantity(q) == null

/** Prep plus cook time in minutes, or null when neither is set. */
export const totalMinutes = (recipe) => (recipe.prepMinutes == null && recipe.cookMinutes == null ? null : (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0))

/** 95 → '1 hr 35 min'. */
export function formatMinutes(min) {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h && `${h} hr`, (m || !h) && `${m} min`].filter(Boolean).join(' ')
}

/** Gaps worth fixing, as short labels: no steps, no servings, no effort, unreadable quantities. */
export function recipeIssues(recipe) {
  const issues = []
  if (!recipe.steps?.some((s) => s.trim())) issues.push('no steps')
  if (!recipe.servings && !recipe.trueServings) issues.push('no servings')
  if (!recipe.effort) issues.push('no effort')
  if (activeIngredients(recipe).some((i) => unparsedQuantity(i.quantity))) issues.push('unclear amounts')
  return issues
}

/** A quantity string multiplied by `scale`, kept as written when it isn't a number. */
export function scaleQuantity(quantity, scale) {
  if (scale === 1) return quantity
  const n = parseQuantity(quantity)
  return n == null ? quantity : formatQuantity(n * scale)
}
