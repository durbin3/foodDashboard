// Usage (from the project root): node .claude/skills/import-recipe/merge-ingredient.mjs <from-id> <into-id>
// Folds one registry ingredient into another: every recipe and on-hand item
// using <from-id> switches to <into-id>, and <from-id>'s name is kept as an
// alias of <into-id> so the next import using that wording links straight to it.
import { mergeIngredient } from '../../../server/ingredientStore.js'

const [from, into] = process.argv.slice(2)
if (!from || !into || from === into) {
  console.error('Usage: merge-ingredient.mjs <from-id> <into-id> (two different ids)')
  process.exit(1)
}
const { recipesChanged, ingredients } = await mergeIngredient(from, into)
const target = ingredients.ingredients[into]
console.log(`Merged ${from} into ${into} ("${target.name}"): ${recipesChanged} recipe(s) updated. Aliases now: ${(target.aliases ?? []).join(', ') || '-'}`)
