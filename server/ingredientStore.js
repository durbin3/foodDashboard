// The ingredient registry (data/ingredients.json) and linking recipe
// ingredients to it. Recipes reference ingredients by id; the registry holds
// each ingredient's display name, staple flag, "buy as" unit and conversions:
//   { conversions: [...shared], ingredients: { "<id>": { name, staple?, buyUnit?, conversions? } } }
// Shared by the dev-server API and the import skill's link script.
import fs from 'node:fs/promises'
import path from 'node:path'

export const ROOT = process.cwd()
export const RECIPES_DIR = path.join(ROOT, 'recipes')
export const REGISTRY_FILE = path.join(ROOT, 'data', 'ingredients.json')

export const nameKey = (name) => String(name ?? '').trim().toLowerCase()

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback
    throw err
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n')
}

export const readRegistry = () => readJson(REGISTRY_FILE, { conversions: [], ingredients: {} })
export const writeRegistry = (registry) => writeJson(REGISTRY_FILE, sortRegistry(registry))

function sortRegistry(registry) {
  const ingredients = Object.fromEntries(Object.entries(registry.ingredients).sort(([a], [b]) => a.localeCompare(b)))
  return { ...registry, ingredients }
}

/**
 * Replace ingredient names with registry ids, in place. Any version with an
 * `item` name is (re)linked by that name, creating a registry entry when the
 * name is new; versions that already carry only an `ingredientId` are left alone.
 */
export function linkRecipe(recipe, registry) {
  const byName = new Map(Object.entries(registry.ingredients).map(([id, ing]) => [nameKey(ing.name), id]))
  const created = []
  const matched = new Set()

  const link = (version) => {
    if (!version || typeof version.item !== 'string') return version
    const name = nameKey(version.item)
    let id = name ? byName.get(name) : null
    if (name && !id) {
      const base = slugify(name) || 'ingredient'
      id = base
      for (let n = 2; registry.ingredients[id]; n++) id = `${base}-${n}`
      registry.ingredients[id] = { name }
      byName.set(name, id)
      created.push({ id, name })
    } else if (id) {
      matched.add(id)
    }
    return { quantity: version.quantity ?? '', unit: version.unit ?? '', ingredientId: id ?? null, note: version.note ?? '' }
  }

  for (const ing of recipe.ingredients) {
    ing.original = link(ing.original)
    ing.modified = link(ing.modified)
  }
  return { created, matched: [...matched] }
}
