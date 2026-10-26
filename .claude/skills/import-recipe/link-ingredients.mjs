// Usage (from the project root): node .claude/skills/import-recipe/link-ingredients.mjs recipes/<id>.json
// Replaces each ingredient's `item` name with an `ingredientId` from
// data/ingredients.json: by name, by alias, or by the same words once plurals
// and prep words are set aside (src/lib/match.js). Names that match nothing
// become new registry entries; for each, existing ingredients it might really
// be are listed, to merge with merge-ingredient.mjs. Also adds standard
// conversions (e.g. 1 cup = 16 tbsp) for ingredients now used in more than one unit.
import path from 'node:path'
import { fillKnownConversions, linkRecipe, listRecipes, readJson, readRegistry, writeJson, writeRegistry } from '../../../server/ingredientStore.js'
import { suggestIngredients } from '../../../src/lib/match.js'

const file = path.resolve(process.argv[2] ?? '')
const recipe = await readJson(file)
const registry = await readRegistry()
const { created, matched } = linkRecipe(recipe, registry)

await writeJson(file, recipe)
const added = fillKnownConversions(registry, await listRecipes())
if (created.length || added) await writeRegistry(registry)

console.log(`Matched existing (${matched.length}): ${matched.join(', ') || '-'}`)
console.log(`Created new (${created.length}): ${created.map((c) => `${c.id} ("${c.name}")`).join(', ') || '-'}`)
const newIds = created.map((c) => c.id)
for (const c of created) {
  const maybe = suggestIngredients(c.name, registry, { exclude: newIds })
  if (maybe.length) console.log(`  "${c.name}" might be: ${maybe.map((m) => `${m.id} ("${m.name}", ${Math.round(m.score * 100)}%)`).join(', ')}`)
}
console.log(`Standard conversions added: ${added}`)
