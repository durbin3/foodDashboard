// Usage (from the project root): node .claude/skills/import-recipe/link-ingredients.mjs recipes/<id>.json
// Replaces each ingredient's `item` name with an `ingredientId` from
// data/ingredients.json, adding registry entries for names it hasn't seen and
// standard conversions (e.g. 1 cup = 16 tbsp) for ingredients now used in more
// than one unit. Prints what matched, what was created, and conversions added.
import path from 'node:path'
import { fillKnownConversions, linkRecipe, listRecipes, readJson, readRegistry, writeJson, writeRegistry } from '../../../server/ingredientStore.js'

const file = path.resolve(process.argv[2] ?? '')
const recipe = await readJson(file)
const registry = await readRegistry()
const { created, matched } = linkRecipe(recipe, registry)

await writeJson(file, recipe)
const added = fillKnownConversions(registry, await listRecipes())
if (created.length || added) await writeRegistry(registry)

console.log(`Matched existing (${matched.length}): ${matched.join(', ') || '-'}`)
console.log(`Created new (${created.length}): ${created.map((c) => `${c.id} ("${c.name}")`).join(', ') || '-'}`)
console.log(`Standard conversions added: ${added}`)
