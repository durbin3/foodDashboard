// Vite plugin that serves a small JSON file API so edits in the UI are written
// straight into the repo (recipes/*.json, data/*.json) and can be committed.
import fs from 'node:fs/promises'
import path from 'node:path'
import { RECIPES_DIR, ROOT, linkRecipe, readJson, readRegistry, writeJson, writeRegistry } from './ingredientStore.js'

const DATA_DIR = path.join(ROOT, 'data')
const ID_RE = /^[a-z0-9-]+$/

const DATA_FILES = {
  plan: { file: 'plan.json', fallback: { entries: [] } },
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function listRecipes() {
  await fs.mkdir(RECIPES_DIR, { recursive: true })
  const files = (await fs.readdir(RECIPES_DIR)).filter((f) => f.endsWith('.json'))
  const recipes = await Promise.all(files.map((f) => readJson(path.join(RECIPES_DIR, f))))
  return recipes.sort((a, b) => a.name.localeCompare(b.name))
}

/** Link ingredient names in a recipe to registry ids, saving the registry if new ingredients were added. */
async function linkAndPersistRegistry(recipe) {
  const registry = await readRegistry()
  const { created } = linkRecipe(recipe, registry)
  if (created.length) await writeRegistry(registry)
  return registry
}

/** Merge one ingredient into another: repoint every recipe, combine registry settings, drop the old entry. */
async function mergeIngredient(from, into) {
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

  registry.ingredients[into] = {
    ...source,
    ...target,
    staple: !!(source.staple || target.staple) || undefined,
    buyUnit: target.buyUnit ?? source.buyUnit,
    conversions: [...(target.conversions ?? []), ...(source.conversions ?? [])],
  }
  delete registry.ingredients[from]
  await writeRegistry(registry)
  return { recipesChanged, ingredients: registry }
}

async function handle(req, res) {
  const [resource, id, ...rest] = req.url.split('?')[0].split('/').filter(Boolean)
  if (rest.length) return send(res, 404, { error: 'Not found' })

  if (resource === 'recipes' && !id) {
    if (req.method === 'GET') return send(res, 200, await listRecipes())
    if (req.method === 'POST') {
      const recipe = await readBody(req)
      if (!ID_RE.test(recipe.id ?? '')) return send(res, 400, { error: 'Invalid recipe id' })
      const file = path.join(RECIPES_DIR, `${recipe.id}.json`)
      const registry = await linkAndPersistRegistry(recipe)
      try {
        await fs.writeFile(file, JSON.stringify(recipe, null, 2) + '\n', { flag: 'wx' })
      } catch (err) {
        if (err.code === 'EEXIST') return send(res, 409, { error: `A recipe with id "${recipe.id}" already exists` })
        throw err
      }
      return send(res, 201, { recipe, ingredients: registry })
    }
  }

  if (resource === 'recipes' && id) {
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Invalid recipe id' })
    const file = path.join(RECIPES_DIR, `${id}.json`)
    if (req.method === 'GET') return send(res, 200, await readJson(file))
    if (req.method === 'PUT') {
      const recipe = await readBody(req)
      if (recipe.id !== id) return send(res, 400, { error: 'Recipe id does not match URL' })
      const registry = await linkAndPersistRegistry(recipe)
      await writeJson(file, recipe)
      return send(res, 200, { recipe, ingredients: registry })
    }
    if (req.method === 'DELETE') {
      await fs.unlink(file)
      return send(res, 200, { deleted: id })
    }
  }

  if (resource === 'ingredients' && !id) {
    if (req.method === 'GET') return send(res, 200, await readRegistry())
    if (req.method === 'PUT') {
      const registry = await readBody(req)
      await writeRegistry(registry)
      return send(res, 200, registry)
    }
  }

  if (resource === 'ingredients' && id === 'merge' && req.method === 'POST') {
    const { from, into } = await readBody(req)
    if (!from || !into || from === into) return send(res, 400, { error: '"from" and "into" must be two different ids' })
    return send(res, 200, await mergeIngredient(from, into))
  }

  const dataFile = DATA_FILES[resource]
  if (dataFile && !id) {
    const file = path.join(DATA_DIR, dataFile.file)
    if (req.method === 'GET') return send(res, 200, await readJson(file, dataFile.fallback))
    if (req.method === 'PUT') {
      const value = await readBody(req)
      await writeJson(file, value)
      return send(res, 200, value)
    }
  }

  send(res, 404, { error: 'Not found' })
}

export default function apiPlugin() {
  return {
    name: 'food-dashboard-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        handle(req, res).catch((err) => {
          const status = err.status ?? (err.code === 'ENOENT' ? 404 : 500)
          send(res, status, { error: err.message })
        })
      })
    },
  }
}
