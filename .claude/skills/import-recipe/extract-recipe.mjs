// Usage: node extract-recipe.mjs <saved-page.html>
// Prints the recipe from a saved recipe page (gzip OK). Reads schema.org Recipe
// JSON-LD when present, otherwise falls back to WP Recipe Maker HTML (which is
// what WPRM print pages like /wprm_print/<slug> contain). Also reports WPRM
// ingredient groups, footnotes, and the page's link back to the full recipe.
import fs from 'node:fs'
import zlib from 'node:zlib'

const buf = fs.readFileSync(process.argv[2])
const html = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8')

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
const decode = (s) =>
  String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m)
const text = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Inner HTML of the first element matching openRe, honoring nested tags of the same name. */
function innerElement(source, openRe, tag = 'div', from = 0) {
  const open = source.slice(from).match(openRe)
  if (!open) return null
  const start = from + open.index + open[0].length
  const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  tagRe.lastIndex = start
  for (let depth = 1, m; (m = tagRe.exec(source)); ) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return { html: source.slice(start, m.index), end: tagRe.lastIndex }
  }
  return null
}

/** Inner HTML of every element matching openRe. */
function allElements(source, openRe, tag) {
  const found = []
  for (let from = 0, el; (el = innerElement(source, openRe, tag, from)); from = el.end) found.push(el.html)
  return found
}

const spanText = (li, cls) => text(innerElement(li, new RegExp(`<span[^>]*class="${cls}[\\s"][^>]*>`), 'span')?.html)

// --- schema.org JSON-LD ---
let jsonLd = null
for (const [, block] of html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
  let json
  try {
    json = JSON.parse(block)
  } catch {
    continue
  }
  const nodes = [json, ...(json['@graph'] ?? [])].flat()
  jsonLd ??= nodes.find((n) => [].concat(n?.['@type']).includes('Recipe'))
}

const flattenSteps = (steps = []) =>
  [].concat(steps).flatMap((s) => (typeof s === 'string' ? [s] : s.itemListElement ? flattenSteps(s.itemListElement) : [s.text]))

// --- WP Recipe Maker HTML ---
// Each group is <div class="wprm-recipe-ingredient-group"> with an optional <h4> name.
const groupHtml = allElements(html, /<div class="wprm-recipe-ingredient-group"[^>]*>/, 'div')
const wprmIngredients = groupHtml.flatMap((g) => {
  const group = text(g.match(/wprm-recipe-ingredient-group-name[^>]*>([\s\S]*?)<\/h\d>/)?.[1])
  return allElements(g, /<li class="wprm-recipe-ingredient"[^>]*>/, 'li').map((li) => ({
    group,
    amount: spanText(li, 'wprm-recipe-ingredient-amount'),
    unit: spanText(li, 'wprm-recipe-ingredient-unit'),
    name: spanText(li, 'wprm-recipe-ingredient-name'),
    notes: spanText(li, 'wprm-recipe-ingredient-notes'),
    line: text(li),
  }))
})
const groups = groupHtml.map((g) => ({
  name: text(g.match(/wprm-recipe-ingredient-group-name[^>]*>([\s\S]*?)<\/h\d>/)?.[1]),
  count: allElements(g, /<li class="wprm-recipe-ingredient"[^>]*>/, 'li').length,
}))
const wprmSteps = allElements(html, /<div class="wprm-recipe-instruction-text"[^>]*>/, 'div').map(text).filter(Boolean)
const wprmName = text(html.match(/<h\d[^>]*class="wprm-recipe-name[^"]*"[^>]*>([\s\S]*?)<\/h\d>/)?.[1])
const wprmServings = [
  text(html.match(/class="wprm-recipe-servings wprm-recipe-details[^"]*"[^>]*>([^<]*)/)?.[1]),
  text(html.match(/class="wprm-recipe-servings-unit[^"]*"[^>]*>([^<]*)/)?.[1]),
].filter(Boolean).join(' ')

// Footnotes (e.g. what "*" on an ingredient means).
const recipeNotes = text(innerElement(html, /<div class="wprm-recipe-notes[^"]*"[^>]*>/)?.html)

// Print pages link back to the full recipe; use that as the recipe's source URL.
const recipePageUrl =
  html.match(/<a href="([^"]+)"[^>]*id="wprm-print-button-back"/)?.[1] ??
  html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ??
  null

if (!jsonLd && !wprmIngredients.length) {
  console.error('No Recipe JSON-LD or WP Recipe Maker markup found on this page.')
  process.exit(1)
}

const result = jsonLd
  ? {
      from: 'json-ld',
      name: decode(jsonLd.name),
      yield: jsonLd.recipeYield,
      ingredients: (jsonLd.recipeIngredient ?? []).map(decode),
      steps: flattenSteps(jsonLd.recipeInstructions).map(decode),
    }
  : {
      from: 'wprm-html',
      name: wprmName,
      yield: wprmServings || null,
      ingredients: wprmIngredients.map((i) => i.line),
      steps: wprmSteps,
    }

console.log(
  JSON.stringify(
    {
      ...result,
      recipePageUrl,
      ingredientGroups: groups,
      // Already split into amount / unit / name / notes by WPRM; handy for normalizing.
      ingredientParts: wprmIngredients,
      recipeNotes,
    },
    null,
    2,
  ),
)
