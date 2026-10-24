import { useEffect, useMemo, useState } from 'react'
import { itemKey } from '../lib/grocery.js'
import { normalizeUnit } from '../lib/quantity.js'
import { activeIngredients } from '../lib/recipe.js'
import { BUILTIN_CONVERSIONS, KNOWN_UNITS } from '../lib/units.js'

const unitLabel = (u) => (u === '' ? 'each' : u)
const formatConversion = (c) => `${c.qty} ${unitLabel(c.unit)} = ${c.equals} ${unitLabel(c.toUnit)}`

export default function IngredientsPage({ recipes, registry, focus, actions }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(focus || null)
  useEffect(() => {
    if (focus) {
      setExpanded(focus)
      document.getElementById(`ing-${focus}`)?.scrollIntoView({ block: 'center' })
    }
  }, [focus])

  // Registry entries plus where each is used.
  const index = useMemo(() => {
    const usage = new Map()
    for (const r of recipes) {
      for (const ing of activeIngredients(r)) {
        if (!ing.ingredientId) continue
        if (!usage.has(ing.ingredientId)) usage.set(ing.ingredientId, { recipes: new Set(), units: new Set() })
        const u = usage.get(ing.ingredientId)
        u.recipes.add(r.name)
        u.units.add(normalizeUnit(ing.unit))
      }
    }
    return Object.entries(registry.ingredients)
      .map(([id, info]) => ({ id, info, ...(usage.get(id) ?? { recipes: new Set(), units: new Set() }) }))
      .sort((a, b) => a.info.name.localeCompare(b.info.name))
  }, [recipes, registry])

  const allUnits = useMemo(
    () => [...new Set([...KNOWN_UNITS, ...index.flatMap((e) => [...e.units])])].filter(Boolean).sort(),
    [index],
  )

  const q = query.trim().toLowerCase()
  const visible = index.filter((e) => !q || e.info.name.includes(q) || e.id.includes(q))

  return (
    <section>
      <datalist id="unit-options">
        {allUnits.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <h2>Unit conversions for all ingredients</h2>
      <p className="muted small">Built in: {BUILTIN_CONVERSIONS.map(formatConversion).join(' · ')}</p>
      <ConversionEditor
        conversions={registry.conversions ?? []}
        onChange={(conversions) => actions.saveRegistry({ ...registry, conversions })}
        emptyText="No custom shared conversions yet."
      />

      <h2>Ingredients</h2>
      <p className="muted small">
        Recipes refer to ingredients by id, so renaming here changes the name everywhere at once. Renaming to a name
        that already exists merges the two. Conversions here apply to one ingredient only (e.g. 1 each chicken breast =
        1/2 lb).
      </p>
      <div className="toolbar">
        <input type="search" placeholder="Filter ingredients…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted small">{index.length} ingredients</span>
      </div>

      <table className="ing-index">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Used in</th>
            <th>Units seen</th>
            <th>Staple</th>
            <th>Buy as</th>
            <th>Conversions</th>
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
                onToggleOpen={() => setExpanded(open ? null : e.id)}
                onUpdate={(patch) => actions.updateIngredient(e.id, patch)}
                onMerge={(into) => actions.mergeIngredient(e.id, into).then(() => setExpanded(into))}
                onDelete={() => actions.deleteIngredient(e.id)}
              />
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function IngredientRow({ entry, open, index, onToggleOpen, onUpdate, onMerge, onDelete }) {
  const { id, info } = entry
  const [newName, setNewName] = useState(info.name)
  useEffect(() => setNewName(info.name), [info.name])
  const conversions = info.conversions ?? []
  const units = [...entry.units].sort()
  const buyOptions = [...new Set(['', ...units, ...conversions.flatMap((c) => [normalizeUnit(c.unit), normalizeUnit(c.toUnit)]), 'lb', 'oz', 'cup'])]

  function rename(e) {
    e.preventDefault()
    const to = itemKey(newName)
    if (!to || to === info.name) return
    const existing = index.find((x) => x.info.name === to && x.id !== id)
    if (!existing) return onUpdate({ name: to })
    if (confirm(`"${to}" already exists. Merge "${info.name}" into it? Recipes using "${info.name}" will switch to "${to}".`))
      onMerge(existing.id)
  }

  return (
    <>
      <tr id={`ing-${id}`} className={open ? 'open' : ''}>
        <td>
          <button className="link" onClick={onToggleOpen}>
            {open ? '▾' : '▸'} {info.name}
          </button>
        </td>
        <td className="small" title={[...entry.recipes].join('\n')}>
          {entry.recipes.size || <span className="muted">none</span>}
        </td>
        <td className="small">{units.map(unitLabel).join(', ')}</td>
        <td>
          <input type="checkbox" checked={!!info.staple} onChange={(e) => onUpdate({ staple: e.target.checked || undefined })} />
        </td>
        <td>
          <select value={info.buyUnit ?? '__auto'} onChange={(e) => onUpdate({ buyUnit: e.target.value === '__auto' ? undefined : e.target.value })}>
            <option value="__auto">auto</option>
            {buyOptions.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </td>
        <td className="small">
          {conversions.length ? conversions.map(formatConversion).join('; ') : <span className="muted">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={6}>
            <div className="detail-panel">
              <div>
                <h4>Used in</h4>
                <p className="small">{[...entry.recipes].join(', ') || 'No recipes'}</p>
                <p className="muted small">id: {id}</p>
              </div>
              <form className="inline-form" onSubmit={rename}>
                <h4>Name</h4>
                <input list="known-ingredient-names" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <datalist id="known-ingredient-names">
                  {index.map((x) => (
                    <option key={x.id} value={x.info.name} />
                  ))}
                </datalist>
                <button disabled={!newName.trim() || itemKey(newName) === info.name}>Rename</button>
              </form>
              <div>
                <h4>Conversions for {info.name}</h4>
                <ConversionEditor
                  conversions={conversions}
                  onChange={(next) => onUpdate({ conversions: next.length ? next : undefined })}
                  emptyText="None yet."
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

function ConversionEditor({ conversions, onChange, emptyText }) {
  const set = (i, patch) => onChange(conversions.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="conversions">
      {conversions.length === 0 && <p className="muted small">{emptyText}</p>}
      {conversions.map((c, i) => (
        <div key={i} className="conversion-row">
          <input className="num" value={c.qty} onChange={(e) => set(i, { qty: e.target.value })} />
          <input className="unit" list="unit-options" placeholder="each" value={c.unit} onChange={(e) => set(i, { unit: e.target.value })} />
          <span>=</span>
          <input className="num" value={c.equals} onChange={(e) => set(i, { equals: e.target.value })} />
          <input className="unit" list="unit-options" placeholder="each" value={c.toUnit} onChange={(e) => set(i, { toUnit: e.target.value })} />
          <button onClick={() => onChange(conversions.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="link" onClick={() => onChange([...conversions, { qty: '1', unit: '', equals: '', toUnit: '' }])}>
        + Add conversion
      </button>
    </div>
  )
}
