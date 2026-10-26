// The ingredient registry (data/ingredients.json) and linking recipe
// ingredients to it. Recipes reference ingredients by id; the registry holds
// each ingredient's display name, other names it goes by (aliases), staple and
// not-listed flags, "buy as" unit, conversions, and storage (days it keeps,
// whether it's frozen and thawed, pack size):
//   { ingredients: { "<id>": { name, aliases?, staple?, notListed?, buyUnit?, conversions?, shelfLifeDays?, thaw?, purchase? } } }
// Shared by the dev-server API and the import skill's link script.
import fs from 'node:fs/promises'
import path from 'node:path'
import { matchIngredient } from '../src/lib/match.js'
import { parseQuantity } from '../src/lib/quantity.js'
import { knownConversionsFor } from '../src/lib/units.js'

export const ROOT = process.cwd()
export const RECIPES_DIR = path.join(ROOT, 'recipes')
export const REGISTRY_FILE = path.join(ROOT, 'data', 'ingredients.json')
export const INVENTORY_FILE = path.join(ROOT, 'data', 'inventory.json')

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

export const readRegistry = () => readJson(REGISTRY_FILE, { ingredients: {} })
export const writeRegistry = (registry) => writeJson(REGISTRY_FILE, sortRegistry(registry))

function sortRegistry(registry) {
  const ingredients = Object.fromEntries(Object.entries(registry.ingredients).sort(([a], [b]) => a.localeCompare(b)))
  return { ...registry, ingredients }
}

/**
 * Replace ingredient names with registry ids, in place. Any version with an
 * `item` name is (re)linked by that name (see match.js: its name, an alias, or
 * the same words once plurals and prep words are set aside), creating a
 * registry entry when nothing matches; versions that already carry only an
 * `ingredientId` are left alone.
 */
export function linkRecipe(recipe, registry) {
  const created = []
  const matched = new Set()

  const link = (version) => {
    if (!version || typeof version.item !== 'string') return version
    const name = nameKey(version.item)
    let id = name ? matchIngredient(version.item, registry)?.id : null
    if (name && !id) {
      const base = slugify(name) || 'ingredient'
      id = base
      for (let n = 2; registry.ingredients[id]; n++) id = `${base}-${n}`
      // Matching ignores case, but the name keeps the capitals it was typed with.
      registry.ingredients[id] = { name: version.item.trim() }
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

/**
 * Give each ingredient the standard conversions it needs for the units recipes
 * use it in (e.g. 1 cup = 16 tbsp when one recipe says cups and another tbsp).
 * Mutates the registry; returns how many conversions were added.
 */
export function fillKnownConversions(registry, recipes) {
  const unitsById = new Map()
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const version = ing.removed ? null : (ing.modified ?? ing.original)
      if (!version?.ingredientId || parseQuantity(version.quantity) == null) continue
      if (!unitsById.has(version.ingredientId)) unitsById.set(version.ingredientId, new Set())
      unitsById.get(version.ingredientId).add(version.unit ?? '')
    }
  }
  let added = 0
  for (const [id, units] of unitsById) {
    const entry = registry.ingredients[id]
    if (!entry) continue
    const extra = knownConversionsFor([...units], entry.conversions ?? [])
    if (extra.length) {
      entry.conversions = [...(entry.conversions ?? []), ...extra]
      added += extra.length
    }
  }
  return added
}

export async function listRecipes() {
  await fs.mkdir(RECIPES_DIR, { recursive: true })
  const files = (await fs.readdir(RECIPES_DIR)).filter((f) => f.endsWith('.json'))
  const recipes = await Promise.all(files.map((f) => readJson(path.join(RECIPES_DIR, f))))
  return recipes.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Merge one ingredient into another: repoint every recipe and on-hand item,
 * combine registry settings, keep the old name (and its aliases) as aliases so
 * imports using that wording find the merged ingredient, and drop the old entry.
 */
export async function mergeIngredient(from, into) {
  const registry = await readRegistry()
  const source = registry.ingredients[from]
  const target = registry.ingredients[into]
  if (!source || !target) throw Object.assign(new Error('Unknown ingredient id'), { status: 400 })

  let recipesChanged = 0
  for (const recipe of await listRecipes()) {
    let changed = false
    for (const ing of recipe.ingredients) {
      for (const version of [ing.original, ing.modified]) {
        if (version?.ingredientId === from) {
          version.ingredientId = into
          changed = true
        }
      }
    }
    if (changed) {
      await writeJson(path.join(RECIPES_DIR, `${recipe.id}.json`), recipe)
      recipesChanged++
    }
  }

  const inventory = await readJson(INVENTORY_FILE, null)
  if (inventory?.items?.some((s) => s.ingredientId === from)) {
    inventory.items = inventory.items.map((s) => (s.ingredientId === from ? { ...s, ingredientId: into } : s))
    await writeJson(INVENTORY_FILE, inventory)
  }

  const aliases = [...new Set([...(target.aliases ?? []), source.name, ...(source.aliases ?? [])])].filter((a) => nameKey(a) !== nameKey(target.name))
  registry.ingredients[into] = {
    ...source,
    ...target,
    aliases: aliases.length ? aliases : undefined,
    staple: !!(source.staple || target.staple) || undefined,
    buyUnit: target.buyUnit ?? source.buyUnit,
    shelfLifeDays: target.shelfLifeDays ?? source.shelfLifeDays,
    thaw: !!(source.thaw || target.thaw) || undefined,
    purchase: target.purchase ?? source.purchase,
    conversions: [...(target.conversions ?? []), ...(source.conversions ?? [])],
  }
  delete registry.ingredients[from]
  fillKnownConversions(registry, await listRecipes())
  await writeRegistry(registry)
  return { recipesChanged, ingredients: registry }
}
