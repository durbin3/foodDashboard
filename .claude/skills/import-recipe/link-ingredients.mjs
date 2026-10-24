// Usage (from the project root): node .claude/skills/import-recipe/link-ingredients.mjs recipes/<id>.json
// Replaces each ingredient's `item` name with an `ingredientId` from
// data/ingredients.json, adding registry entries for names it hasn't seen.
// Prints which ingredients matched existing ones and which were created.
import path from 'node:path'
import { linkRecipe, readJson, readRegistry, writeJson, writeRegistry } from '../../../server/ingredientStore.js'

const file = path.resolve(process.argv[2] ?? '')
const recipe = await readJson(file)
const registry = await readRegistry()
const { created, matched } = linkRecipe(recipe, registry)

await writeJson(file, recipe)
if (created.length) await writeRegistry(registry)

console.log(`Matched existing (${matched.length}): ${matched.join(', ') || '-'}`)
console.log(`Created new (${created.length}): ${created.map((c) => `${c.id} ("${c.name}")`).join(', ') || '-'}`)
