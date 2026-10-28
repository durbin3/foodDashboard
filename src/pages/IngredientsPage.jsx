import { useEffect, useMemo, useState } from 'react'
import { normalizeUnit, parseQuantity } from '../lib/quantity.js'
import { aliasProblem, likelyDuplicates } from '../lib/match.js'
import { activeIngredients } from '../lib/recipe.js'
import { KNOWN_UNITS, unitGroupCount } from '../lib/units.js'

const unitLabel = (u) => (u === '' ? 'each' : u)
const formatConversion = (c) => `${c.qty} ${unitLabel(c.unit)} = ${c.equals} ${unitLabel(c.toUnit)}`
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

const LIST_AS = [
  ['grocery', 'Groceries'],
  ['pantry', 'Pantry staple'],
  ['none', "Don't list"],
]
const listAsOf = (info) => (info.notListed ? 'none' : info.staple ? 'pantry' : 'grocery')
const listAsPatch = {
  grocery: { staple: undefined, notListed: undefined },
  pantry: { staple: true, notListed: undefined },
  none: { staple: undefined, notListed: true },
}

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
  const [expanded, setExpanded] = useState(focus || null)
  const [dismissed, dismissPair] = useDismissedPairs()
  useEffect(() => {
    if (focus) {
      setExpanded(focus)
      setFilter('all')
      setQuery('')
      requestAnimationFrame(() => document.getElementById(`ing-${focus}`)?.scrollIntoView({ block: 'center' }))
    }
  }, [focus])

  // Registry entries plus where each is used.
  const index = useMemo(() => {
    const usage = new Map()
    for (const r of recipes) {
      for (const ing of activeIngredients(r)) {
        if (!ing.ingredientId) continue
        if (!usage.has(ing.ingredientId)) usage.set(ing.ingredientId, { recipes: new Map(), units: new Set() })
        const u = usage.get(ing.ingredientId)
        u.recipes.set(r.id, r.name)
        if (parseQuantity(ing.quantity) != null) u.units.add(normalizeUnit(ing.unit))
      }
    }
    // Ids recipes point at that aren't in the registry (e.g. a half-finished
    // import) are listed too, so they can be found and merged.
    const unregistered = [...usage.keys()].filter((id) => !registry.ingredients[id]).map((id) => [id, { name: id, unregistered: true }])
    return [...Object.entries(registry.ingredients), ...unregistered]
      .map(([id, info]) => {
        const use = usage.get(id) ?? { recipes: new Map(), units: new Set() }
        const units = [...use.units].sort()
        return { id, info, ...use, units, needsConversion: unitGroupCount(units, info.conversions ?? []) > 1 }
      })
      .sort((a, b) => a.info.name.localeCompare(b.info.name))
  }, [recipes, registry])

  const duplicates = useMemo(
    () => likelyDuplicates(index).filter(([a, b]) => !dismissed.has(`${a.id}|${b.id}`)),
    [index, dismissed],
  )
  const inDuplicates = new Set(duplicates.flat().map((e) => e.id))

  const allUnits = useMemo(() => [...new Set([...KNOWN_UNITS, ...index.flatMap((e) => e.units)])].filter(Boolean).sort(), [index])

  const FILTERS = [
    ['all', 'All', () => true],
    ['grocery', 'Groceries', (e) => listAsOf(e.info) === 'grocery'],
    ['pantry', 'Pantry', (e) => listAsOf(e.info) === 'pantry'],
    ['none', 'Not listed', (e) => listAsOf(e.info) === 'none'],
    ['perishable', 'Perishable', (e) => e.info.shelfLifeDays != null],
    ['thaw', 'Thaw first', (e) => e.info.thaw],
    ['convert', 'Needs conversion', (e) => e.needsConversion],
    ['duplicates', 'Possible duplicates', (e) => inDuplicates.has(e.id)],
    ['unused', 'Unused', (e) => e.recipes.size === 0],
    ['unregistered', 'Not registered', (e) => e.info.unregistered],
  ]
  const q = query.trim().toLowerCase()
  const visible = index
    .filter(FILTERS.find(([k]) => k === filter)[2])
    .filter((e) => !q || e.info.name.toLowerCase().includes(q) || e.id.includes(q) || (e.info.aliases ?? []).some((a) => a.toLowerCase().includes(q)))

  return (
    <section>
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

      <div className="toolbar">
        <input type="search" placeholder="Filter ingredients…" aria-label="Filter ingredients" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted small">{index.length} ingredients</span>
      </div>
      <div className="tags" role="group" aria-label="Show">
        {FILTERS.map(([key, label, test]) => {
          const n = key === 'all' ? index.length : index.filter(test).length
          if (key !== 'all' && !n) return null
          return (
            <button key={key} className={`tag ${filter === key ? 'on' : ''} ${['convert', 'duplicates', 'unregistered'].includes(key) ? 'attention' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} ({n})
            </button>
          )
        })}
      </div>

      {duplicates.length > 0 && filter === 'duplicates' && (
        <div className="notice">
          <p className="small">These look like the same ingredient. Merging points every recipe at one of them.</p>
          <ul className="dup-list">
            {duplicates.map(([a, b]) => (
              <li key={`${a.id}|${b.id}`}>
                <strong>{a.info.name}</strong> ({a.recipes.size}) and <strong>{b.info.name}</strong> ({b.recipes.size})
                <button className="small" onClick={() => confirmMerge(b, a, actions)}>
                  Merge into “{a.info.name}”
                </button>
                <button className="small" onClick={() => confirmMerge(a, b, actions)}>
                  Merge into “{b.info.name}”
                </button>
                <button className="link small" onClick={() => dismissPair(`${a.id}|${b.id}`)}>
                  Not duplicates
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted small">No ingredients match.</p>
      ) : (
        <table className="ing-index">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Used in</th>
              <th>Units seen</th>
              <th title="Where it goes on the grocery list">List as</th>
              <th title="The unit the grocery list totals it in">Buy as</th>
              <th title="Days it keeps after shopping. Blank = doesn't go off">Keeps</th>
              <th title="Kept frozen unless used within its shelf life, so it needs a day to thaw">Thaw</th>
              <th title="How its units relate, e.g. 1 each = 1/2 lb">Conversions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const open = expanded === e.id
              return (
                <IngredientRow
                  key={e.id}
                  entry={e}
                  open={open}
                  index={index}
                  registry={registry}
                  allUnits={allUnits}
                  onToggleOpen={() => setExpanded(open ? null : e.id)}
                  onUpdate={(patch) => actions.updateIngredient(e.id, patch)}
                  onMerge={(target) => confirmMerge(e, target, actions, () => setExpanded(target.id))}
                  onDelete={() => actions.deleteIngredient(e.id)}
                />
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

function confirmMerge(from, into, actions, then) {
  const n = from.recipes.size
  if (!confirm(`Merge "${from.info.name}" into "${into.info.name}"? ${n} recipe${n === 1 ? '' : 's'} will switch to "${into.info.name}" and "${from.info.name}" goes away. You can undo right after.`))
    return
  actions.mergeIngredient(from.id, into.id).then(then, () => {})
}

const RecipeLinks = ({ recipes, limit = Infinity }) => {
  const list = [...recipes].sort((a, b) => a[1].localeCompare(b[1]))
  if (!list.length) return <span className="muted">none</span>
  const shown = list.slice(0, limit)
  return (
    <>
      {shown.map(([id, name], i) => (
        <span key={id}>
          {i > 0 && ', '}
          <a href={`#/recipe/${id}`}>{name}</a>
        </span>
      ))}
      {list.length > shown.length && <span className="muted"> +{list.length - shown.length} more</span>}
    </>
  )
}

function IngredientRow({ entry, open, index, registry, allUnits, onToggleOpen, onUpdate, onMerge, onDelete }) {
  const { id, info, units } = entry
  const conversions = info.conversions ?? []
  const [newName, setNewName] = useState(info.name)
  const [mergeName, setMergeName] = useState('')
  useEffect(() => setNewName(info.name), [info.name])
  const buyOptions = [...new Set(['', ...units, ...conversions.flatMap((c) => [normalizeUnit(c.unit), normalizeUnit(c.toUnit)]), 'lb', 'oz', 'cup'])]

  const clash = newName.trim() && !sameName(newName, info.name) ? index.find((x) => x.id !== id && sameName(x.info.name, newName)) : null
  const mergeTarget = index.find((x) => x.id !== id && mergeName.trim() && sameName(x.info.name, mergeName))

  function rename(e) {
    e.preventDefault()
    const to = newName.trim()
    if (!to || to === info.name || clash) return
    // The old name stays findable: imports using it still link here.
    const aliases = [...(info.aliases ?? []).filter((a) => !sameName(a, to)), info.name]
    onUpdate({ name: to, aliases })
  }

  return (
    <>
      <tr id={`ing-${id}`} className={open ? 'open' : ''}>
        <td>
          <button className="link" onClick={onToggleOpen} aria-expanded={open}>
            {open ? '▾' : '▸'} {info.name}
          </button>
          {info.unregistered && (
            <span className="pill" title="A recipe uses this id but it isn't in data/ingredients.json. Merge it into the right ingredient, or rename it to register it.">
              not registered
            </span>
          )}
        </td>
        <td className="small">
          <RecipeLinks recipes={entry.recipes} limit={2} />
        </td>
        <td className="small">{units.map(unitLabel).join(', ')}</td>
        <td>
          <select aria-label={`List ${info.name} as`} value={listAsOf(info)} onChange={(e) => onUpdate(listAsPatch[e.target.value])}>
            {LIST_AS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            aria-label={`Buy ${info.name} as`}
            value={info.buyUnit ?? '__auto'}
            onChange={(e) => onUpdate({ buyUnit: e.target.value === '__auto' ? undefined : e.target.value })}
          >
            <option value="__auto">auto</option>
            {buyOptions.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </td>
        <td>
          <ShelfLifeInput name={info.name} value={info.shelfLifeDays} onChange={(shelfLifeDays) => onUpdate({ shelfLifeDays })} />
        </td>
        <td>
          <input type="checkbox" aria-label={`${info.name} needs thawing`} checked={!!info.thaw} onChange={(e) => onUpdate({ thaw: e.target.checked || undefined })} />
        </td>
        <td className="small">
          {conversions.length ? conversions.map(formatConversion).join('; ') : <span className="muted">—</span>}
          {entry.needsConversion && (
            <button className="link small warn" onClick={onToggleOpen} title={`Used as ${units.map(unitLabel).join(' and ')}, which don't combine yet`}>
              ⚠ needs conversion
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={8}>
            <div className="detail-panel">
              <div>
                <h4>Used in</h4>
                <p className="small">
                  <RecipeLinks recipes={entry.recipes} />
                </p>
                <p className="muted small">id: {id}</p>
              </div>
              <form className="inline-form" onSubmit={rename}>
                <h4>Name</h4>
                <input aria-label={`Rename ${info.name}`} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <button disabled={!newName.trim() || newName.trim() === info.name || !!clash} title="Renames it in every recipe">
                  Rename
                </button>
                {clash && <span className="field-warning">Already exists: use Merge</span>}
              </form>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (mergeTarget) onMerge(mergeTarget)
                }}
              >
                <h4>Merge</h4>
                <input
                  list="known-ingredient-names"
                  aria-label={`Merge ${info.name} into`}
                  placeholder="Into ingredient…"
                  value={mergeName}
                  onChange={(e) => setMergeName(e.target.value)}
                />
                <button disabled={!mergeTarget} title={`Recipes using “${info.name}” switch to the other ingredient, and this one is removed`}>
                  Merge
                </button>
              </form>
              <div>
                <h4>Storage</h4>
                <div className="storage-fields small">
                  <label title="Blank: doesn't go off">
                    Keeps <ShelfLifeInput name={info.name} value={info.shelfLifeDays} onChange={(shelfLifeDays) => onUpdate({ shelfLifeDays })} /> days
                  </label>
                  <label title="Frozen unless used within its shelf life, so it needs a day to thaw">
                    <input type="checkbox" checked={!!info.thaw} onChange={(e) => onUpdate({ thaw: e.target.checked || undefined })} /> Needs thawing
                  </label>
                  <PurchaseInput purchase={info.purchase} onChange={(purchase) => onUpdate({ purchase })} />
                </div>
              </div>
              <div>
                <h4>Also called</h4>
                <AliasEditor id={id} info={info} registry={registry} onChange={(aliases) => onUpdate({ aliases: aliases.length ? aliases : undefined })} />
              </div>
              <div>
                <h4 title="For units that don't combine, e.g. 1 each = 1/2 lb">Conversions</h4>
                <ConversionEditor
                  conversions={conversions}
                  allUnits={allUnits}
                  onSave={(next) => onUpdate({ conversions: next.length ? next : undefined })}
                />
              </div>
              {entry.recipes.size === 0 && (
                <div>
                  <button className="danger" onClick={() => confirm(`Delete "${info.name}"?`) && onDelete()}>
                    Delete unused ingredient
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/** Days as a whole number, saved on blur; blank clears it (non-perishable). */
function ShelfLifeInput({ name, value, onChange }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const n = text.trim() === '' ? undefined : Math.round(Number(text))
    if (n !== undefined && !(n > 0)) return setText(value == null ? '' : String(value))
    if (n !== value) onChange(n)
  }
  return (
    <input
      className="days-input"
      type="number"
      min="1"
      aria-label={`Days ${name} keeps`}
      placeholder="—"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** The smallest amount you can buy, e.g. 2 lb. Saved once the amount is a number. */
function PurchaseInput({ purchase, onChange }) {
  const [qty, setQty] = useState(purchase?.qty ?? '')
  const [unit, setUnit] = useState(purchase?.unit ?? '')
  useEffect(() => {
    setQty(purchase?.qty ?? '')
    setUnit(purchase?.unit ?? '')
  }, [purchase?.qty, purchase?.unit])
  const commit = () => {
    if (!String(qty).trim()) return purchase && onChange(undefined)
    if (!(parseQuantity(qty) > 0)) return
    if (qty !== purchase?.qty || unit !== (purchase?.unit ?? '')) onChange({ qty: String(qty).trim(), unit: unit.trim() })
  }
  const bad = String(qty).trim() && !(parseQuantity(qty) > 0)
  return (
    <label onBlur={commit} title="Blank: buy exactly what recipes use">
      Packs of{' '}
      <input className={`num ${bad ? 'invalid' : ''}`} aria-label="Pack amount" placeholder="any" value={qty} onChange={(e) => setQty(e.target.value)} />{' '}
      <input className="unit" list="unit-options" aria-label="Pack unit" placeholder="each" value={unit} onChange={(e) => setUnit(e.target.value)} />
      {bad && <span className="field-warning">Not a number</span>}
    </label>
  )
}

/** Other names an ingredient goes by. Imports and recipes using any of them link to it. */
function AliasEditor({ id, info, registry, onChange }) {
  const [text, setText] = useState('')
  const aliases = info.aliases ?? []
  const problem = text.trim() ? aliasProblem(text, id, registry) : null
  return (
    <div>
      <div className="tags compact">
        {aliases.length === 0 && <span className="muted small">None</span>}
        {aliases.map((a) => (
          <span key={a} className="tag static">
            {a}
            <button className="link" aria-label={`Remove name ${a}`} onClick={() => onChange(aliases.filter((x) => x !== a))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim() || problem) return
          onChange([...aliases, text.trim().toLowerCase()])
          setText('')
        }}
      >
        <input aria-label={`Another name for ${info.name}`} placeholder="Another name" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={!text.trim() || !!problem} title="Recipes and imports using this name will link here">
          Add
        </button>
        {problem && <span className="field-warning">{problem}</span>}
      </form>
    </div>
  )
}

const conversionProblem = (c) => {
  if (!(parseQuantity(c.qty) > 0) || !(parseQuantity(c.equals) > 0)) return 'Amounts must be numbers, e.g. 1 or 1/2'
  if (normalizeUnit(c.unit) === normalizeUnit(c.toUnit)) return 'The two units must differ'
  return null
}

/** Edits a draft; nothing is saved until every row is valid and Save is pressed. */
function ConversionEditor({ conversions, onSave }) {
  const [draft, setDraft] = useState(conversions)
  useEffect(() => setDraft(conversions), [JSON.stringify(conversions)])
  const set = (i, patch) => setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const problems = draft.map(conversionProblem)
  const changed = JSON.stringify(draft) !== JSON.stringify(conversions)
  return (
    <div className="conversions">
      {draft.length === 0 && <p className="muted small">None</p>}
      {draft.map((c, i) => (
        <div key={i} className="conversion-row">
          <input className={`num ${problems[i] && !(parseQuantity(c.qty) > 0) ? 'invalid' : ''}`} aria-label="Amount" value={c.qty} onChange={(e) => set(i, { qty: e.target.value })} />
          <input className="unit" list="unit-options" aria-label="Unit" placeholder="each" value={c.unit} onChange={(e) => set(i, { unit: e.target.value })} />
          <span>=</span>
          <input className={`num ${problems[i] && !(parseQuantity(c.equals) > 0) ? 'invalid' : ''}`} aria-label="Equals amount" value={c.equals} onChange={(e) => set(i, { equals: e.target.value })} />
          <input className="unit" list="unit-options" aria-label="Equals unit" placeholder="each" value={c.toUnit} onChange={(e) => set(i, { toUnit: e.target.value })} />
          <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>Remove</button>
          {problems[i] && <span className="field-warning">{problems[i]}</span>}
        </div>
      ))}
      <div className="inline-form">
        <button className="link" onClick={() => setDraft((d) => [...d, { qty: '1', unit: '', equals: '', toUnit: '' }])}>
          + Add conversion
        </button>
        {changed && (
          <>
            <button className="primary" disabled={problems.some(Boolean)} onClick={() => onSave(draft)}>
              Save conversions
            </button>
            <button onClick={() => setDraft(conversions)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
