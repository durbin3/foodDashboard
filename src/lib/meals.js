// A planned meal is a main recipe plus any sides attached to it:
//   meal.sides = [{ recipeId, scale }]

/** The main and its sides as { recipeId, scale } parts, for anything that counts ingredients. */
export const mealParts = (meal) => [{ recipeId: meal.recipeId, scale: meal.scale }, ...(meal.sides ?? [])]

/**
 * How much work the whole meal is: the main's effort, plus 1 when a side is
 * real work in its own right (effort 3 or more), capped at 5. Null when the
 * main's effort isn't set.
 */
export function mealEffort(meal, recipesById) {
  const main = recipesById[meal.recipeId]?.effort
  if (!main) return null
  const hardSide = (meal.sides ?? []).some((s) => recipesById[s.recipeId]?.effort >= 3)
  return Math.min(5, main + (hardSide ? 1 : 0))
}

/** Side recipes that go with a main, as listed on the main, skipping any that no longer exist. */
export const pairedSides = (recipe, recipesById) => (recipe?.pairsWith ?? []).map((id) => recipesById[id]).filter(Boolean)

/** Mains that list `sideId` among their pairings. */
export const mainsFor = (sideId, recipes) => recipes.filter((r) => (r.pairsWith ?? []).includes(sideId))
