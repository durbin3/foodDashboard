// Each ingredient keeps the imported `original` and an optional `modified`
// override, so personal changes sit alongside the source recipe.
//   { id, group, original: {quantity, unit, ingredientId, note} | null, modified: {...} | null, removed?: true }
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
  return recipe.ingredients
    .filter((ing) => !ing.removed)
    .map((ing) => ({ ...effectiveIngredient(ing), id: ing.id, group: ing.group }))
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
  return { id, name: name.trim(), source: '', servings: null, tags: [], ingredients: [], steps: [], notes: '' }
}

export function modificationCount(recipe) {
  return recipe.ingredients.filter((ing) => ing.removed || ing.modified || !ing.original).length
}
