// Matching ingredient names, as written in recipes or on recipe sites, to the
// ingredient registry, so the same purchase isn't registered twice.
//
// A name matches an ingredient when it equals its name or one of its
// `aliases` (ignoring case), or when both read the same once normalized:
// plurals made singular, punctuation and parentheses dropped, and prep or
// size words removed ("2 Large Eggs, beaten" ~ "egg"). Words that change what
// you'd buy (fresh, dried, ground, shredded, canned) are kept. Anything else
// gets ranked suggestions for a person to confirm.

// Words that describe preparation or size, not what you buy.
const PREP_WORDS = new Set([
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'peeled', 'trimmed', 'cubed', 'halved', 'quartered', 'julienned',
  'boneless', 'skinless', 'finely', 'roughly', 'coarsely', 'thinly', 'freshly', 'lightly', 'packed',
  'large', 'small', 'medium', 'softened', 'melted', 'divided', 'optional', 'rinsed', 'drained', 'beaten', 'room', 'temperature',
])

function singular(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 4 && /(oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** A name's words, lowercased and singular, without prep or size words. */
export function nameTokens(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !PREP_WORDS.has(w))
    .map(singular)
}

export const normalizeName = (name) => nameTokens(name).join(' ')
const plain = (name) => String(name ?? '').trim().toLowerCase()

/** Every name an ingredient goes by: its name, then its aliases. */
export const namesOf = (info) => [info.name, ...(info.aliases ?? [])].filter(Boolean)

/**
 * The registry ingredient a name refers to, as { id, how } with how one of
 * 'name', 'alias' or 'normalized'; null when there's no single clear match.
 */
export function matchIngredient(name, registry) {
  const wanted = plain(name)
  if (!wanted) return null
  const entries = Object.entries(registry.ingredients ?? {})
  for (const [id, info] of entries) if (plain(info.name) === wanted) return { id, how: 'name' }
  for (const [id, info] of entries) if ((info.aliases ?? []).some((a) => plain(a) === wanted)) return { id, how: 'alias' }
  const key = normalizeName(name)
  if (!key) return null
  const hits = entries.filter(([, info]) => namesOf(info).some((n) => normalizeName(n) === key))
  // Two ingredients that normalize alike (e.g. "large tortilla" and "tortilla") is a question for a person.
  return hits.length === 1 ? { id: hits[0][0], how: 'normalized' } : null
}

export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** How alike two names are, 0 to 1. */
export function nameSimilarity(a, b) {
  const [ta, tb] = [nameTokens(a), nameTokens(b)]
  if (!ta.length || !tb.length) return 0
  const [ja, jb] = [ta.join(' '), tb.join(' ')]
  if (ja === jb) return 1
  // Words in common, allowing a one-letter slip in longer words ("jalepeno" ~ "jalapeno").
  const same = (x, y) => x === y || (x.length >= 5 && y.length >= 5 && editDistance(x, y) <= 1)
  const shared = ta.filter((w) => tb.some((v) => same(w, v))).length
  const overlap = shared / new Set([...ta, ...tb]).size
  // One name inside the other ("chicken breast" in "chicken breast tenderloin").
  const contained = shared ? (0.8 * shared) / Math.min(ta.length, tb.length) : 0
  // Spelling slips ("jalepeno").
  const spelling = 1 - editDistance(ja, jb) / Math.max(ja.length, jb.length)
  return Math.max(overlap, contained, spelling >= 0.8 ? spelling : 0)
}

/** Registry ingredients a name might mean, best first: [{ id, name, score }]. */
export function suggestIngredients(name, registry, { limit = 3, min = 0.5, exclude = [] } = {}) {
  return Object.entries(registry.ingredients ?? {})
    .filter(([id]) => !exclude.includes(id))
    .map(([id, info]) => ({ id, name: info.name, score: Math.max(...namesOf(info).map((n) => nameSimilarity(name, n))) }))
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

// Words that make a variant of the same thing you'd buy ("double pie crust" vs "pie crust").
const QUALIFIERS = new Set(['double', 'single', 'large', 'small', 'medium', 'fresh', 'whole', 'extra', 'big'])

/** Pairs of entries ({ id, info }) whose names suggest they're the same ingredient. */
export function likelyDuplicates(entries) {
  const pairs = []
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      // Raw words, so a size word ("large tortilla") still counts as a qualifier.
      const raw = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(singular)
      const [a, b] = [raw(entries[i].info.name), raw(entries[j].info.name)]
      const [short, long] = a.length <= b.length ? [a, b] : [b, a]
      const extra = long.filter((w) => !short.includes(w))
      const same =
        a.join('') === b.join('') ||
        normalizeName(entries[i].info.name) === normalizeName(entries[j].info.name) ||
        (short.every((w) => long.includes(w)) && extra.length === 1 && QUALIFIERS.has(extra[0])) ||
        (a.join('').length >= 6 && editDistance(a.join(' '), b.join(' ')) <= 1)
      if (same) pairs.push([entries[i], entries[j]])
    }
  return pairs
}

/**
 * Why an alias can't be added to ingredient `id`, or null if it can: it must
 * be new, and not another ingredient's name or alias.
 */
export function aliasProblem(alias, id, registry) {
  const wanted = plain(alias)
  if (!wanted) return 'Type a name'
  for (const [other, info] of Object.entries(registry.ingredients ?? {})) {
    if (!namesOf(info).some((n) => plain(n) === wanted)) continue
    return other === id ? 'Already a name for this ingredient' : `Already used by "${info.name}"`
  }
  return null
}
