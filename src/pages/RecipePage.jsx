import { useEffect, useState } from 'react'
import { formatIngredient } from '../lib/quantity.js'
import { effectiveIngredient, newRecipe, sameIngredient } from '../lib/recipe.js'
import { KNOWN_UNITS } from '../lib/units.js'

const FIELDS = [
  ['quantity', 'Qty', 'qty'],
  ['unit', 'Unit', 'unit'],
  ['item', 'Item', 'item'],
  ['note', 'Note', 'note'],
]

/**
 * Edits a saved recipe, or, with `isNew`, a blank unsaved one that's created
 * (and given an id from its name) on the first save.
 */
export default function RecipePage({ recipe, isNew = false, takenIds, knownItems, actions }) {
  const [draft, setDraft] = useState(recipe)
  const [tagText, setTagText] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setDraft(recipe)
    setTagText((recipe?.tags ?? []).join(', '))
  }, [recipe])

  const dirty = recipe && JSON.stringify(draft) !== JSON.stringify(recipe)
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!recipe || !draft) return <p className="muted">Recipe not found.</p>

  const groups = [...new Set(draft.ingredients.map((i) => i.group ?? ''))]
  if (!groups.length) groups.push('')
  // Hand-made recipes have no imported originals, so there's nothing to compare against.
  const hasOriginals = draft.ingredients.some((i) => i.original)

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const updateIngredient = (id, fn) =>
    update({ ingredients: draft.ingredients.map((i) => (i.id === id ? fn(i) : i)) })

  function setField(ing, field, value) {
    updateIngredient(ing.id, (i) => {
      const next = { ...effectiveIngredient(i), [field]: value }
      const unchanged = i.original && sameIngredient(next, i.original)
      return { ...i, modified: unchanged ? null : next }
    })
  }

  function addIngredient(group) {
    const blank = { quantity: '', unit: '', item: '', note: '' }
    const ing = { id: `custom-${Date.now().toString(36)}`, group, original: null, modified: blank }
    update({ ingredients: [...draft.ingredients, ing] })
  }

  function renameGroup(from, to) {
    update({ ingredients: draft.ingredients.map((i) => ((i.group ?? '') === from ? { ...i, group: to } : i)) })
  }

  const setSteps = (steps) => update({ steps })
  function moveStep(index, delta) {
    const steps = [...draft.steps]
    const [step] = steps.splice(index, 1)
    steps.splice(index + delta, 0, step)
    setSteps(steps)
  }

  async function save() {
    setStatus('Saving…')
    try {
      if (isNew) {
        const created = await actions.createRecipe({ ...draft, id: newRecipe(draft.name, takenIds).id })
        window.location.hash = `#/recipe/${created.id}`
        return
      }
      await actions.saveRecipe(draft)
      setStatus('Saved')
    } catch {
      setStatus('')
    }
  }

  async function remove() {
    if (!confirm(`Delete "${recipe.name}"? This removes recipes/${recipe.id}.json and takes it out of the meal plan.`)) return
    await actions.deleteRecipe(recipe.id)
    window.location.hash = '#/'
  }

  return (
    <section className="recipe">
      <datalist id="known-items">
        {knownItems.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="known-units">
        {KNOWN_UNITS.filter(Boolean).map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="recipe-head">
        <input
          className="title-input"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Recipe name"
          placeholder={isNew ? 'New recipe name' : 'Recipe name'}
          autoFocus={isNew}
        />
        <div className="save-bar">
          {status && !dirty && <span className="muted small">{status}</span>}
          {isNew ? (
            <a href="#/">Cancel</a>
          ) : (
            dirty && <button onClick={() => setDraft(recipe)}>Discard</button>
          )}
          <button
            className="primary"
            disabled={!draft.name.trim() || (!isNew && !dirty)}
            title={!draft.name.trim() ? 'Give the recipe a name first' : undefined}
            onClick={save}
          >
            {isNew ? 'Create recipe' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <label className="field">
          Source link
          <span className="with-action">
            <input value={draft.source ?? ''} placeholder="https://…" onChange={(e) => update({ source: e.target.value })} />
            {draft.source && (
              <a href={draft.source} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </span>
        </label>
        <label className="field">
          Servings <span className="muted small">(as the recipe states)</span>
          <input
            type="number"
            min="1"
            value={draft.servings ?? ''}
            onChange={(e) => update({ servings: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Tags <span className="muted small">(comma separated)</span>
          <input
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value)
              update({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })
            }}
          />
        </label>
        {!isNew && (
          <div className="field">
            <span>&nbsp;</span>
            <button onClick={() => actions.addToPlan(draft.id)}>+ Add to plan</button>
          </div>
        )}
      </div>

      <h2>Ingredients</h2>
      {hasOriginals && (
        <p className="muted small">
          Edit the right-hand fields to make your version. The imported original stays on the left.
        </p>
      )}
      {groups.map((group) => {
        const rows = draft.ingredients.filter((i) => (i.group ?? '') === group)
        return (
          <div key={group} className="ing-group">
            {(group || groups.length > 1) && <GroupName name={group} onRename={(to) => renameGroup(group, to)} />}
            {rows.length > 0 && (
              <table className="ing-table">
                <thead>
                  <tr>
                    {hasOriginals && <th className="original">Original</th>}
                    {FIELDS.map(([, label, cls]) => (
                      <th key={label} className={cls}>
                        {label}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ing) => {
                    const eff = effectiveIngredient(ing)
                    const changed = !!ing.modified && !!ing.original
                    const rowClass = ing.removed ? 'removed' : changed ? 'changed' : !ing.original && hasOriginals ? 'added' : ''
                    return (
                      <tr key={ing.id} className={rowClass}>
                        {hasOriginals && (
                          <td className="original">
                            {ing.original ? (
                              <span className={changed || ing.removed ? 'struck' : ''}>{formatIngredient(ing.original)}</span>
                            ) : (
                              <em className="muted">added by you</em>
                            )}
                          </td>
                        )}
                        {FIELDS.map(([field, , cls]) => (
                          <td key={field} className={cls}>
                            <input
                              value={eff[field] ?? ''}
                              disabled={ing.removed}
                              list={field === 'item' ? 'known-items' : field === 'unit' ? 'known-units' : undefined}
                              placeholder={field === 'unit' ? 'each' : undefined}
                              onChange={(e) => setField(ing, field, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="row-actions">
                          {changed && (
                            <button title="Revert to original" onClick={() => updateIngredient(ing.id, (i) => ({ ...i, modified: null }))}>
                              Reset
                            </button>
                          )}
                          {!ing.original ? (
                            <button onClick={() => update({ ingredients: draft.ingredients.filter((i) => i.id !== ing.id) })}>
                              Delete
                            </button>
                          ) : ing.removed ? (
                            <button onClick={() => updateIngredient(ing.id, ({ removed, ...i }) => i)}>Restore</button>
                          ) : (
                            <button title="Leave out of your version" onClick={() => updateIngredient(ing.id, (i) => ({ ...i, removed: true }))}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <button className="link" onClick={() => addIngredient(group)}>
              + Add ingredient{group && ` to ${group}`}
            </button>
          </div>
        )
      })}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!newGroup.trim() || groups.includes(newGroup.trim())) return
          addIngredient(newGroup.trim())
          setNewGroup('')
        }}
      >
        <input placeholder="New group, e.g. Sauce" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
        <button disabled={!newGroup.trim()}>+ Add group</button>
      </form>

      <h2>Notes</h2>
      <textarea
        rows={6}
        value={draft.notes ?? ''}
        placeholder="Your notes on this recipe…"
        onChange={(e) => update({ notes: e.target.value })}
      />

      <h2>Steps</h2>
      <ol className="steps">
        {draft.steps.map((step, i) => (
          <li key={i}>
            <div className="step-row">
              <textarea rows={3} value={step} onChange={(e) => setSteps(draft.steps.map((s, j) => (j === i ? e.target.value : s)))} />
              <div className="step-actions">
                <button title="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  ↑
                </button>
                <button title="Move down" disabled={i === draft.steps.length - 1} onClick={() => moveStep(i, 1)}>
                  ↓
                </button>
                <button title="Delete step" onClick={() => setSteps(draft.steps.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button className="link" onClick={() => setSteps([...draft.steps, ''])}>
        + Add step
      </button>

      {!isNew && (
        <div className="danger-zone">
          <button className="danger" onClick={remove}>
            Delete recipe
          </button>
        </div>
      )}
    </section>
  )
}

/** Group heading that renames on blur/Enter, so typing doesn't regroup rows mid-edit. */
function GroupName({ name, onRename }) {
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  const commit = () => value.trim() !== name && onRename(value.trim())
  return (
    <input
      className="group-input"
      value={value}
      placeholder="Ungrouped"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
