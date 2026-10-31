import { useEffect, useMemo, useRef, useState } from 'react'
import { STORE_SECTIONS } from '../lib/ingredients.js'
import { aliasProblem, likelyDuplicates } from '../lib/match.js'
import { normalizeUnit, parseQuantity } from '../lib/quantity.js'
import { activeIngredients } from '../lib/recipe.js'
import { navigate } from '../lib/route.js'
import { KNOWN_UNITS, unitGroupCount } from '../lib/units.js'

// Every ingredient we've seen, and the one place to configure each: a list of
// names on the left, the selected ingredient's settings on the right (its own
// screen on phones). The selection is the URL: /ingredients/<id>.

const unitLabel = (u) => (u === '' ? 'each' : u)
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

function useDismissedPairs() {
  const key = 'ingredients:not-duplicates'
  const [dismissed, setDismissed] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key)) ?? [])
    } catch {
      return new Set()
    }
  })
  const dismiss = (pairKey) => {
    const next = new Set(dismissed).add(pairKey)
    setDismissed(next)
    try {
      localStorage.setItem(key, JSON.stringify([...next]))
    } catch {
      // Not remembered across reloads without storage; harmless.
    }
  }
  return [dismissed, dismiss]
}

export default function IngredientsPage({ recipes, registry, focus, actions }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [dismissed, dismissPair] = useDismissedPairs()
  const listRef = useRef(null)

  // Registry entries, plus how many recipes use each and the units they use it in.
  const index = useMemo(() => {
    const usage = new Map()
    for (const r of recipes) {
      for (const ing of activeIngredients(r)) {
        if (!ing.ingredientId) continue
        if (!usage.has(ing.ingredientId)) usage.set(ing.ingredientId, { recipes: new Set(), units: new Set() })
        const u = usage.get(ing.ingredientId)
        u.recipes.add(r.id)
        if (parseQuantity(ing.quantity) != null) u.units.add(normalizeUnit(ing.unit))
      }
    }
    // Ids recipes point at that aren't in the registry (e.g. a half-finished
    // import) are listed too, so they can be found and merged.
    const unregistered = [...usage.keys()].filter((id) => !registry.ingredients[id]).map((id) => [id, { name: id, unregistered: true }])
    return [...Object.entries(registry.ingredients), ...unregistered]
      .map(([id, info]) => {
        const use = usage.get(id) ?? { recipes: new Set(), units: new Set() }
        const units = [...use.units].sort()
        return { id, info, uses: use.recipes.size, units, needsConversion: unitGroupCount(units, info.conversions ?? []) > 1 }
      })
      .sort((a, b) => a.info.name.localeCompare(b.info.name))
  }, [recipes, registry])

  const duplicates = useMemo(() => likelyDuplicates(index).filter(([a, b]) => !dismissed.has(`${a.id}|${b.id}`)), [index, dismissed])
  const inDuplicates = new Set(duplicates.flat().map((e) => e.id))
  const needsAttention = (e) => e.needsConversion || inDuplicates.has(e.id) || e.info.unregistered

  const allUnits = useMemo(() => [...new Set([...KNOWN_UNITS, ...index.flatMap((e) => e.units)])].filter(Boolean).sort(), [index])

  const FILTERS = [
    ['all', 'All', () => true],
    ['nosection', 'No section', (e) => !e.info.section],
    ['staple', 'Staples', (e) => e.info.staple && !e.info.notListed],
    ['hidden', 'Hidden', (e) => e.info.notListed],
    ['convert', 'Needs conversion', (e) => e.needsConversion],
    ['duplicates', 'Possible duplicates', (e) => inDuplicates.has(e.id)],
    ['unregistered', 'Not registered', (e) => e.info.unregistered],
    ['unused', 'Unused', (e) => e.uses === 0],
  ]
  const ATTENTION = ['convert', 'duplicates', 'unregistered']
  const q = query.trim().toLowerCase()
  const visible = index
    .filter(FILTERS.find(([k]) => k === filter)[2])
    .filter((e) => !q || e.info.name.toLowerCase().includes(q) || e.id.includes(q) || (e.info.aliases ?? []).some((a) => a.toLowerCase().includes(q)))

  const selected = focus ? index.find((e) => e.id === focus) : null
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  const open = (id) => navigate(id ? `/ingredients/${encodeURIComponent(id)}` : '/ingredients')

  return (
    <section className={`ing-browser ${selected ? 'has-selection' : ''}`}>
      <datalist id="unit-options">
        {allUnits.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="known-ingredient-names">
        {index.map((x) => (
          <option key={x.id} value={x.info.name} />
        ))}
      </datalist>

      <div className="ing-list-pane">
        <input type="search" placeholder={`Filter ${index.length} ingredients…`} aria-label="Filter ingredients" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="tags compact" role="group" aria-label="Show">
          {FILTERS.map(([key, label, test]) => {
            const n = key === 'all' ? index.length : index.filter(test).length
            if (key !== 'all' && !n && filter !== key) return null
            return (
              <button key={key} className={`tag ${filter === key ? 'on' : ''} ${ATTENTION.includes(key) ? 'attention' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label} {key !== 'all' && n}
              </button>
            )
          })}
        </div>

        {filter === 'duplicates' && duplicates.length > 0 && (
          <ul className="dup-list notice small">
            {duplicates.map(([a, b]) => (
              <li key={`${a.id}|${b.id}`}>
                <strong>{a.info.name}</strong> / <strong>{b.info.name}</strong>
                <span className="dup-actions">
                  <button className="link small" onClick={() => confirmMerge(b, a, actions, () => open(a.id))}>
                    Keep “{a.info.name}”
                  </button>
                  <button className="link small" onClick={() => confirmMerge(a, b, actions, () => open(b.id))}>
                    Keep “{b.info.name}”
                  </button>
                  <button className="link small muted" onClick={() => dismissPair(`${a.id}|${b.id}`)}>
                    Not the same
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <ul className="ing-names" ref={listRef}>
          {visible.map((e) => (
            <li key={e.id}>
              <a
                href={`/ingredients/${encodeURIComponent(e.id)}`}
                aria-current={e.id === focus ? 'true' : undefined}
                className={[e.info.notListed && 'hidden-item', needsAttention(e) && 'warn'].filter(Boolean).join(' ')}
                title={e.info.notListed ? 'Hidden from the grocery list' : undefined}
              >
                {e.info.name}
              </a>
            </li>
          ))}
          {visible.length === 0 && <li className="muted small">No matches</li>}
        </ul>
      </div>

      <div className="ing-detail-pane">
        {selected && (
          <>
            <a className="back-link small" href="/ingredients">
              ‹ Ingredients
            </a>
            <IngredientDetail
              key={selected.id}
              entry={selected}
              index={index}
              registry={registry}
              inDuplicates={inDuplicates.has(selected.id)}
              onUpdate={(patch) => actions.updateIngredient(selected.id, patch)}
              onMerge={(target) => confirmMerge(selected, target, actions, () => open(target.id))}
              onDelete={() => {
                if (!confirm(`Delete "${selected.info.name}"?`)) return
                actions.deleteIngredient(selected.id)
                open(null)
              }}
            />
          </>
        )}
      </div>
    </section>
  )
}

function confirmMerge(from, into, actions, then) {
  const n = from.uses
  if (!confirm(`Merge "${from.info.name}" into "${into.info.name}"? ${n} recipe${n === 1 ? '' : 's'} will switch to "${into.info.name}" and "${from.info.name}" goes away. You can undo right after.`))
    return
  actions.mergeIngredient(from.id, into.id).then(then, () => {})
}

function IngredientDetail({ entry, index, registry, inDuplicates, onUpdate, onMerge, onDelete }) {
  const { id, info, units } = entry
  const [mergeName, setMergeName] = useState('')
  const mergeTarget = index.find((x) => x.id !== id && mergeName.trim() && sameName(x.info.name, mergeName))

  return (
    <div className="ing-detail">
      <header className="ing-detail-head">
        <NameInput entry={entry} index={index} onRename={onUpdate} />
        <span className="muted small" title="Recipes refer to it by this; it doesn't change on rename">
          {id}
        </span>
        {info.unregistered && (
          <span className="pill warn" title="A recipe uses this id but it isn't in data/ingredients.json. Merge it into the right ingredient, or change any setting to register it.">
            not registered
          </span>
        )}
        {inDuplicates && (
          <span className="pill warn" title="Looks like another ingredient; see the Possible duplicates filter">
            possible duplicate
          </span>
        )}
      </header>

      <div className="ing-groups">
        <fieldset className="ing-group">
          <legend>Grocery list</legend>
          <div className="field-grid">
            <span>Section</span>
            <select aria-label="Store section" value={info.section ?? ''} onChange={(e) => onUpdate({ section: e.target.value || undefined })}>
              <option value="">—</option>
              {STORE_SECTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <span title="How the store sells it. An amount means whole packs of that size; a unit alone totals it in that unit. Blank: as the recipes add up.">Sold as</span>
            <SoldAsInput purchase={info.purchase} onChange={(purchase) => onUpdate({ purchase })} />
            <span />
            <span className="toggles">
              <label title="Usually on hand: listed under Pantry, to check before buying">
                <input type="checkbox" checked={!!info.staple && !info.notListed} disabled={!!info.notListed} onChange={(e) => onUpdate({ staple: e.target.checked || undefined })} /> Staple
              </label>
              <label title="Left off the grocery list (e.g. water, taco toppings)">
                <input type="checkbox" checked={!!info.notListed} onChange={(e) => onUpdate({ notListed: e.target.checked || undefined })} /> Hide
              </label>
            </span>
          </div>
        </fieldset>

        <fieldset className="ing-group">
          <legend>Storage</legend>
          <div className="field-grid">
            <span>Keeps</span>
            <span>
              <ShelfLifeInput value={info.shelfLifeDays} onChange={(shelfLifeDays) => onUpdate({ shelfLifeDays })} /> days
            </span>
            <span />
            <label className={info.shelfLifeDays ? '' : 'muted'} title="Bought fresh, frozen if not used within its shelf life, so a later meal needs it thawed the day before">
              <input type="checkbox" checked={!!info.thaw} disabled={!info.shelfLifeDays && !info.thaw} onChange={(e) => onUpdate({ thaw: e.target.checked || undefined })} /> Freezes after that
            </label>
          </div>
        </fieldset>

        <fieldset className={`ing-group ${entry.needsConversion ? 'needs-attention' : ''}`}>
          <legend title={entry.needsConversion ? `Recipes use it as ${units.map(unitLabel).join(' and ')}, which don't combine yet` : 'For units that don\'t combine on their own, e.g. 1 each = 1/2 lb'}>
            Units
          </legend>
          <ConversionEditor conversions={info.conversions ?? []} units={units} onSave={(next) => onUpdate({ conversions: next.length ? next : undefined })} />
        </fieldset>

        <fieldset className="ing-group">
          <legend title="Recipes and imports using any of these names link here">Other names</legend>
          <AliasEditor id={id} info={info} registry={registry} onChange={(aliases) => onUpdate({ aliases: aliases.length ? aliases : undefined })} />
        </fieldset>
      </div>

      <footer className="ing-detail-foot">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (mergeTarget) onMerge(mergeTarget)
          }}
        >
          <input list="known-ingredient-names" aria-label={`Merge ${info.name} into`} placeholder="Merge into…" value={mergeName} onChange={(e) => setMergeName(e.target.value)} />
          <button disabled={!mergeTarget} title={`Recipes using “${info.name}” switch to the other ingredient, and this one is removed`}>
            Merge
          </button>
        </form>
        {entry.uses === 0 && (
          <button className="danger" onClick={onDelete} title="No recipe uses it">
            Delete
          </button>
        )}
      </footer>
    </div>
  )
}

/** The name, edited in place; saved on Enter or leaving the field. The old name stays as another name, so imports using it still link here. */
function NameInput({ entry, index, onRename }) {
  const { id, info } = entry
  const [text, setText] = useState(info.name)
  useEffect(() => setText(info.name), [info.name])
  const to = text.trim()
  const clash = to && !sameName(to, info.name) ? index.find((x) => x.id !== id && sameName(x.info.name, to)) : null
  const commit = () => {
    if (!to) return setText(info.name)
    if (to === info.name || clash) return
    const aliases = [...(info.aliases ?? []).filter((a) => !sameName(a, to)), info.name]
    onRename({ name: to, aliases })
  }
  return (
    <span className="name-edit">
      <input
        className={`name-input ${clash ? 'invalid' : ''}`}
        aria-label="Name"
        size={Math.max(4, text.length)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setText(info.name)
        }}
      />
      {clash && <span className="field-warning">“{clash.info.name}” exists: merge instead</span>}
    </span>
  )
}

/** Days as a whole number, saved on blur; blank clears it (doesn't go off). */
function ShelfLifeInput({ value, onChange }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const n = text.trim() === '' ? undefined : Math.round(Number(text))
    if (n !== undefined && !(n > 0)) return setText(value == null ? '' : String(value))
    if (n !== value) onChange(n)
  }
  return (
    <input
      className="num"
      type="number"
      min="1"
      aria-label="Days it keeps"
      placeholder="—"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/**
 * How it's sold: an optional pack amount and a unit. "2" "lb" is 2 lb packs,
 * "" "lb" is any amount in pounds, "6" "" is packs of 6. Both blank: as the
 * recipes add up. Saved when focus leaves the pair.
 */
function SoldAsInput({ purchase, onChange }) {
  const [qty, setQty] = useState(purchase?.qty ?? '')
  const [unit, setUnit] = useState(purchase?.unit ?? '')
  useEffect(() => {
    setQty(purchase?.qty ?? '')
    setUnit(purchase?.unit ?? '')
  }, [purchase?.qty, purchase?.unit])
  const q = String(qty).trim()
  const u = unit.trim()
  const bad = q && !(parseQuantity(q) > 0)
  const commit = (e) => {
    if (e.currentTarget.contains(e.relatedTarget) || bad) return
    const next = !q && !u ? undefined : { ...(q ? { qty: q } : {}), unit: u }
    if (JSON.stringify(next) !== JSON.stringify(purchase)) onChange(next)
  }
  return (
    <span className="sold-as" onBlur={commit}>
      <input className={`num ${bad ? 'invalid' : ''}`} aria-label="Pack amount" placeholder="any" value={qty} onChange={(e) => setQty(e.target.value)} />
      <input className="unit" list="unit-options" aria-label="Unit sold in" placeholder={q ? 'each' : 'unit'} value={unit} onChange={(e) => setUnit(e.target.value)} />
    </span>
  )
}

/** Other names an ingredient goes by. Imports and recipes using any of them link to it. */
function AliasEditor({ id, info, registry, onChange }) {
  const [text, setText] = useState('')
  const aliases = info.aliases ?? []
  const problem = text.trim() ? aliasProblem(text, id, registry) : null
  const add = () => {
    if (!text.trim() || problem) return
    onChange([...aliases, text.trim().toLowerCase()])
    setText('')
  }
  return (
    <div className="tag-input">
      {aliases.map((a) => (
        <span key={a} className="tag static">
          {a}
          <button className="link" aria-label={`Remove name ${a}`} onClick={() => onChange(aliases.filter((x) => x !== a))}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-label={`Another name for ${info.name}`}
        className={problem ? 'invalid' : ''}
        title={problem ?? undefined}
        placeholder="Add a name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
      />
      {problem && <span className="field-warning">{problem}</span>}
    </div>
  )
}

const conversionProblem = (c) => {
  if (!(parseQuantity(c.qty) > 0) || !(parseQuantity(c.equals) > 0)) return 'Amounts must be numbers, e.g. 1 or 1/2'
  if (normalizeUnit(c.unit) === normalizeUnit(c.toUnit)) return 'The two units must differ'
  return null
}

/**
 * Conversions as "1 each = 1/2 lb" rows. Saved when focus leaves the editor
 * and every row is complete; a removed row is saved at once.
 */
function ConversionEditor({ conversions, units, onSave }) {
  const [draft, setDraft] = useState(conversions)
  const [showProblems, setShowProblems] = useState(false)
  useEffect(() => setDraft(conversions), [JSON.stringify(conversions)])
  const set = (i, patch) => setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const problems = draft.map(conversionProblem)
  const save = (next) => {
    if (next.some(conversionProblem)) return setShowProblems(true)
    setShowProblems(false)
    if (JSON.stringify(next) !== JSON.stringify(conversions)) onSave(next)
  }
  // Start a new row from the units recipes use, so the common case needs only the amounts.
  const blank = { qty: '1', unit: units[0] ?? '', equals: '', toUnit: units[1] ?? '' }
  return (
    <div className="conversions" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save(draft)}>
      {draft.map((c, i) => (
        <div key={i} className="conversion-row">
          <input className={`num ${showProblems && !(parseQuantity(c.qty) > 0) ? 'invalid' : ''}`} aria-label="Amount" value={c.qty} onChange={(e) => set(i, { qty: e.target.value })} />
          <input className="unit" list="unit-options" aria-label="Unit" placeholder="each" value={c.unit} onChange={(e) => set(i, { unit: e.target.value })} />
          <span>=</span>
          <input className={`num ${showProblems && !(parseQuantity(c.equals) > 0) ? 'invalid' : ''}`} aria-label="Equals amount" value={c.equals} onChange={(e) => set(i, { equals: e.target.value })} />
          <input className="unit" list="unit-options" aria-label="Equals unit" placeholder="each" value={c.toUnit} onChange={(e) => set(i, { toUnit: e.target.value })} />
          <button
            className="link muted"
            aria-label="Remove conversion"
            onClick={() => {
              const next = draft.filter((_, j) => j !== i)
              setDraft(next)
              save(next)
            }}
          >
            ×
          </button>
          {showProblems && problems[i] && <span className="field-warning">{problems[i]}</span>}
        </div>
      ))}
      <button className="link" onClick={() => setDraft((d) => [...d, blank])}>
        + Add
      </button>
    </div>
  )
}
