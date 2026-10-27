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

// Servings. A recipe's stated `servings` is often far off, so it can also
// record `trueServings` (what a batch really makes, as we eat it) and
// `servingsPerMeal` (how many of those we eat at one dinner; default: one per
// person). A meal that makes more than one dinner's worth has leftover
// nights, which go on later days: meal.leftovers = ['YYYY-MM-DD', …].

// How long cooked leftovers keep in the fridge.
export const LEFTOVER_DAYS = 4

/** What a batch really makes: the true count if set, else the recipe's stated one. Null when neither is known. */
export const realServings = (recipe) => recipe?.trueServings ?? recipe?.servings ?? null

/** Servings eaten at one dinner of this recipe. */
export const servingsPerMeal = (recipe, people) => recipe?.servingsPerMeal ?? Math.max(1, people?.length ?? 2)

/**
 * How far one planned meal goes: { servings, perMeal, nights, leftovers, spare, guessed }.
 * `nights` counts the cooking night too, so `leftovers` (nights − 1) is how
 * many later dinners it covers; `spare` is servings beyond whole dinners (a
 * lunch). `guessed` is true when it's working from the recipe's stated
 * servings. Null when the recipe's servings aren't known.
 */
export function mealServings(meal, recipe, people) {
  const per = servingsPerMeal(recipe, people)
  const batch = realServings(recipe)
  if (!batch) return null
  const servings = batch * (meal.scale ?? 1)
  const nights = Math.max(1, Math.floor(servings / per + 1e-9))
  return { servings, perMeal: per, nights, leftovers: nights - 1, spare: Math.max(0, servings - nights * per), guessed: recipe.trueServings == null }
}

/** Leftover nights a meal makes that aren't on a day yet. */
export const leftoversToPlace = (meal, recipe, people) => Math.max(0, (mealServings(meal, recipe, people)?.leftovers ?? 0) - (meal.leftovers?.length ?? 0))
