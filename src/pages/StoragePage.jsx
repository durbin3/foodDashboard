import { useEffect, useState } from 'react'
import { daysBetween, formatDay, isISODate, today } from '../lib/plan.js'
import { parseQuantity } from '../lib/quantity.js'
import { capitalize } from '../lib/recipe.js'
import { KNOWN_UNITS } from '../lib/units.js'

const LOCATIONS = [
  ['fridge', 'Fridge'],
  ['freezer', 'Freezer'],
  ['pantry', 'Pantry'],
  ['', 'Other'],
]
const LOCATION_ORDER = Object.fromEntries(LOCATIONS.map(([v], i) => [v, i]))

/**
 * What's already in the house (data/inventory.json). The grocery list uses
 * it before buying more; an item without an amount is just a reminder and
 * counts as none.
 */
export default function StoragePage({ inventory, registry, actions }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [location, setLocation] = useState('fridge')
  const now = today()
  const byName = new Map(Object.entries(registry.ingredients).map(([id, info]) => [info.name.toLowerCase(), id]))
  const pickedId = byName.get(name.trim().toLowerCase())
  const items = inventory.items
    .map((item, index) => ({ item, index, info: registry.ingredients[item.ingredientId] ?? { name: item.ingredientId } }))
    .sort((a, b) => (LOCATION_ORDER[a.item.location ?? ''] ?? 9) - (LOCATION_ORDER[b.item.location ?? ''] ?? 9) || a.info.name.localeCompare(b.info.name))

  const setItems = (fn) => actions.updateInventory((inv) => ({ ...inv, items: fn(inv.items) }))
  const update = (index, patch) => setItems((all) => all.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  const remove = (index) => {
    const removed = inventory.items[index]
    setItems((all) => all.filter((_, i) => i !== index))
    actions.notify(`Removed ${registry.ingredients[removed.ingredientId]?.name ?? removed.ingredientId}.`, {
      undo: () => setItems((all) => [...all.slice(0, index), removed, ...all.slice(index)]),
    })
  }

  function add(e) {
    e.preventDefault()
    if (!pickedId) return
    setItems((all) => [...all, { ingredientId: pickedId, qty: qty.trim(), unit: unit.trim(), location, added: now }])
    setName('')
    setQty('')
    setUnit('')
  }

  return (
    <section className="storage">
      <datalist id="storage-ingredients">
        {Object.values(registry.ingredients)
          .map((i) => i.name)
          .sort()
          .map((n) => (
            <option key={n} value={n} />
          ))}
      </datalist>
      <datalist id="storage-units">
        {KNOWN_UNITS.filter(Boolean).map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <form className="toolbar storage-add" onSubmit={add}>
        <input list="storage-ingredients" placeholder="Ingredient…" aria-label="Ingredient" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="num" placeholder="Amount" aria-label="Amount" title="Blank counts as none" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="unit" list="storage-units" placeholder="each" aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <select aria-label="Where" value={location} onChange={(e) => setLocation(e.target.value)}>
          {LOCATIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!pickedId}>
          Add
        </button>
        {name.trim() && !pickedId && <span className="field-warning">Pick an ingredient from the list (add new ones through a recipe).</span>}
      </form>

      {items.length === 0 ? (
        <p className="muted">Nothing on hand.</p>
      ) : (
        <table className="storage-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Amount</th>
              <th>Where</th>
              <th>Added</th>
              <th>Keeps</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, index, info }) => (
              <tr key={`${item.ingredientId}-${index}`}>
                <td>
                  <a href={`/ingredients/${encodeURIComponent(item.ingredientId)}`}>{capitalize(info.name)}</a>
                </td>
                <td>
                  <AmountInput item={item} onChange={(patch) => update(index, patch)} />
                </td>
                <td>
                  <select aria-label={`Where ${info.name} is`} value={item.location ?? ''} onChange={(e) => update(index, { location: e.target.value })}>
                    {LOCATIONS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="date"
                    aria-label={`When ${info.name} was added`}
                    value={item.added ?? ''}
                    onChange={(e) => update(index, { added: isISODate(e.target.value) ? e.target.value : undefined })}
                  />
                </td>
                <td className="small">
                  <Freshness item={item} info={info} now={now} />
                </td>
                <td>
                  <button onClick={() => remove(index)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Amount and unit, saved on blur so typing "1 1/2" doesn't save "1 1". */
function AmountInput({ item, onChange }) {
  const [qty, setQty] = useState(item.qty ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  useEffect(() => {
    setQty(item.qty ?? '')
    setUnit(item.unit ?? '')
  }, [item.qty, item.unit])
  const bad = String(qty).trim() && parseQuantity(qty) == null
  const commit = () => {
    if (bad) return
    if (qty.trim() !== (item.qty ?? '') || unit.trim() !== (item.unit ?? '')) onChange({ qty: qty.trim(), unit: unit.trim() })
  }
  return (
    <span className="amount-input" onBlur={commit}>
      <input className={`num ${bad ? 'invalid' : ''}`} aria-label="Amount" placeholder="?" value={qty} onChange={(e) => setQty(e.target.value)} />
      <input className="unit" list="storage-units" aria-label="Unit" placeholder="each" value={unit} onChange={(e) => setUnit(e.target.value)} />
      {!String(qty).trim() && <span className="muted small"> counts as none</span>}
    </span>
  )
}

function Freshness({ item, info, now }) {
  if (!info.shelfLifeDays) return <span className="muted">—</span>
  if (item.location === 'freezer') return <span className="muted">frozen</span>
  if (!item.added) return <span className="muted">{info.shelfLifeDays} days</span>
  const left = info.shelfLifeDays - daysBetween(item.added, now)
  if (left < 0)
    return (
      <span className="warn" title={`Added ${formatDay(item.added)}, keeps ${info.shelfLifeDays} days`}>
        ⚠ {-left} day{left === -1 ? '' : 's'} past
      </span>
    )
  return <span title={`Added ${formatDay(item.added)}, keeps ${info.shelfLifeDays} days`}>{left === 0 ? 'use today' : `${left} day${left === 1 ? '' : 's'} left`}</span>
}
