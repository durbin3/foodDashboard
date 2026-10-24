// Each ingredient keeps the imported `original` and an optional `modified`
// override, so personal changes sit alongside the source recipe.
//   { id, group, original: {quantity, unit, item, note} | null, modified: {...} | null, removed?: true }
// Ingredients added by hand have `original: null`.

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

export function modificationCount(recipe) {
  return recipe.ingredients.filter((ing) => ing.removed || ing.modified || !ing.original).length
}
