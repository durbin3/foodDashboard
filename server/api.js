// Vite plugin that serves a small JSON file API so edits in the UI are written
// straight into the repo (recipes/*.json, data/*.json) and can be committed.
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const RECIPES_DIR = path.join(ROOT, 'recipes')
const DATA_DIR = path.join(ROOT, 'data')
const ID_RE = /^[a-z0-9-]+$/

const DATA_FILES = {
  plan: { file: 'plan.json', fallback: { entries: [] } },
  pantry: { file: 'pantry.json', fallback: { staples: [] } },
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback
    throw err
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n')
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

async function handle(req, res) {
  const [resource, id, ...rest] = req.url.split('?')[0].split('/').filter(Boolean)
  if (rest.length) return send(res, 404, { error: 'Not found' })

  if (resource === 'recipes' && !id) {
    if (req.method === 'GET') return send(res, 200, await listRecipes())
  }

  if (resource === 'recipes' && id) {
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Invalid recipe id' })
    const file = path.join(RECIPES_DIR, `${id}.json`)
    if (req.method === 'GET') return send(res, 200, await readJson(file))
    if (req.method === 'PUT') {
      const recipe = await readBody(req)
      if (recipe.id !== id) return send(res, 400, { error: 'Recipe id does not match URL' })
      await writeJson(file, recipe)
      return send(res, 200, recipe)
    }
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
          const status = err.code === 'ENOENT' ? 404 : 500
          send(res, status, { error: err.message })
        })
      })
    },
  }
}
