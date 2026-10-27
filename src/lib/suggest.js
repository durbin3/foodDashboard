// Ranks recipes to add to a cycle, given the meals already picked:
//
//   score = rating − cost × things to buy that aren't already being bought
//                  − variety × likeness to meals already picked
//                  − recency × made recently
//
// "Things to buy" counts each new ingredient (or, for ingredients sold in
// packs, each extra pack). Pantry staples, ingredients left off the list,
// and anything already covered by storage or by leftovers from packs being
// bought anyway cost nothing, which is what favours meals sharing ingredients.

import { computeNeeds } from './needs.js'
import { daysBetween } from './plan.js'
import { recipeRatings } from './ratings.js'
import { activeIngredients, categoryOf } from './recipe.js'

const PROTEINS = new Set(['chicken', 'beef', 'pork', 'turkey', 'fish', 'seafood', 'shrimp', 'salmon', 'lamb', 'vegetarian'])
// An unrated recipe counts as middling, so new recipes still get suggested.
const UNRATED = 3

/** What buying for `meals` costs: { [ingredientId]: units } where a unit is one ingredient, or one pack. */
function purchases(meals, recipesById, registry, inventory) {
  const out = {}
  for (const n of computeNeeds(meals, recipesById, registry, inventory)) {
    if (n.staple || n.notListed) continue
    if (n.math) {
      if (n.math.buyQty > 0) out[n.id] = n.math.packs ?? 1
    } else out[n.id] = 1
  }
  return out
}

/** Days since a recipe was last made (as a main), or null if never. */
function daysSinceMade(plan, recipeId, now) {
  const last = plan.meals
    .filter((m) => m.recipeId === recipeId && m.date && m.date < now)
    .map((m) => m.date)
    .sort()
    .at(-1)
  return last ? daysBetween(last, now) : null
}

const proteinsOf = (recipe) => new Set((recipe?.tags ?? []).filter((t) => PROTEINS.has(t)))

/**
 * Mains not yet picked, ranked best first for adding to `picked` (the cycle's
 * meals so far): [{ recipe, score, rating, extra, shared: [ingredient names], sameProtein, lastMade }].
 * A recipe already in the cycle would cost nothing extra to make twice, so
 * it's left out rather than suggested again; it can still be added by hand.
 */
export function suggestMeals({ picked, recipes, recipesById, registry, inventory, plan, now, weights }) {
  const w = { cost: 1, variety: 1, recency: 1, ...weights }
  const base = purchases(picked, recipesById, registry, inventory)
  const pickedRecipes = picked.map((m) => recipesById[m.recipeId]).filter(Boolean)
  const pickedIds = new Set(picked.map((m) => m.recipeId))

  return recipes
    .filter((r) => categoryOf(r) === 'main' && !pickedIds.has(r.id))
    .map((recipe) => {
      const trial = purchases([...picked, { id: 'trial', recipeId: recipe.id, scale: 1 }], recipesById, registry, inventory)
      let extra = 0
      for (const [id, units] of Object.entries(trial)) extra += Math.max(0, units - (base[id] ?? 0))
      // Ingredients this recipe uses that are being bought anyway.
      const uses = new Set(activeIngredients(recipe).map((i) => i.ingredientId))
      const shared = [...uses].filter((id) => base[id] > 0).map((id) => registry.ingredients?.[id]?.name ?? id)
      const rating = recipeRatings(plan, recipe.id).average
      const proteins = proteinsOf(recipe)
      const sameProtein = pickedRecipes.filter((r) => [...proteinsOf(r)].some((p) => proteins.has(p))).length
      const since = daysSinceMade(plan, recipe.id, now)
      // Made within the last two weeks counts fully, fading out over the two weeks after.
      const recent = since == null ? 0 : Math.max(0, Math.min(1, (28 - since) / 14))
      const score = (rating ?? UNRATED) - w.cost * extra - w.variety * 0.5 * sameProtein - w.recency * 2 * recent
      return { recipe, score, rating, extra, shared, sameProtein, lastMade: since }
    })
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name))
}

/**
 * Pick meals one at a time, each the best given those before it, until they
 * cover `count` dinners. `nights(recipeId)` is how many dinners one batch
 * covers, leftovers included (default 1). Returns recipe ids in order.
 */
export function fillCycle({ picked, count, nights = () => 1, ...rest }) {
  const chosen = []
  let meals = picked
  for (let i = 0, covered = 0; covered < count; i++) {
    const [best] = suggestMeals({ picked: meals, ...rest })
    if (!best) break
    chosen.push(best.recipe.id)
    covered += nights(best.recipe.id)
    meals = [...meals, { id: `fill-${i}`, recipeId: best.recipe.id, scale: 1 }]
  }
  return chosen
}
