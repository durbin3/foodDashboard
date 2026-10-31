// Vite plugin that serves a small JSON file API so edits in the UI are written
// straight into the repo (recipes/*.json, data/*.json) and can be committed.
import fs from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS } from '../src/lib/settings.js'
import { calendarStatus, requestSync } from './calendarSync.js'
import {
  RECIPES_DIR,
  ROOT,
  fillKnownConversions,
  linkRecipe,
  listRecipes,
  mergeIngredient,
  readJson,
  readRegistry,
  writeJson,
  writeRegistry,
} from './ingredientStore.js'

const DATA_DIR = path.join(ROOT, 'data')
const ID_RE = /^[a-z0-9-]+$/

const DATA_FILES = {
  plan: { file: 'plan.json', fallback: { meals: [] } },
  settings: { file: 'settings.json', fallback: DEFAULT_SETTINGS },
  inventory: { file: 'inventory.json', fallback: { items: [] } },
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

/**
 * Link ingredient names in a recipe to registry ids, and add any standard
 * conversions its ingredients now need. Saves the registry if either changed.
 */
async function linkAndPersistRegistry(recipe) {
  const registry = await readRegistry()
  const { created } = linkRecipe(recipe, registry)
  const others = (await listRecipes()).filter((r) => r.id !== recipe.id)
  const added = fillKnownConversions(registry, [...others, recipe])
  if (created.length || added) await writeRegistry(registry)
  return registry
}

async function handle(req, res) {
  const [resource, id, ...rest] = req.url.split('?')[0].split('/').filter(Boolean)
  if (rest.length) return send(res, 404, { error: 'Not found' })

  if (resource === 'calendar' && !id && req.method === 'GET') return send(res, 200, calendarStatus())

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
      // Catch the shared calendar up with anything changed while the server was off.
      requestSync()
      server.middlewares.use('/api', (req, res) => {
        // Any successful write may change what the shared calendar shows.
        if (req.method !== 'GET') res.on('finish', () => res.statusCode < 400 && requestSync())
        handle(req, res).catch((err) => {
          const status = err.status ?? (err.code === 'ENOENT' ? 404 : 500)
          send(res, status, { error: err.message })
        })
      })
    },
  }
}
