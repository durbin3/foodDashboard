import { useEffect, useRef, useState } from 'react'
import { formatIngredient, normalizeUnit, parseQuantity } from '../lib/quantity.js'
import { matchIngredient, suggestIngredients } from '../lib/match.js'
import { activeIngredients, CATEGORIES, categoryOf, effectiveIngredient, newRecipe, sameIngredient, unparsedQuantity } from '../lib/recipe.js'
import { stepIngredientsOf } from '../lib/steps.js'
import { EFFORT_LABELS } from '../lib/settings.js'
import { KNOWN_UNITS } from '../lib/units.js'

const FIELDS = [
  ['quantity', 'Qty', 'qty'],
  ['unit', 'Unit', 'unit'],
  ['item', 'Item', 'item'],
  ['note', 'Note', 'note'],
]

const isBlankIngredient = (i) => !i.original && !['quantity', 'unit', 'item', 'note'].some((k) => String(i.modified?.[k] ?? '').trim())

// Each step's ingredient list (stepIngredients) lines up with its step, so it moves with it.
const hasStepUses = (d) => Array.isArray(d.stepIngredients) && d.stepIngredients.length === d.steps.length

/** What gets saved: no blank steps or never-filled-in ingredient rows, and no step uses of deleted ingredients. */
const cleaned = (draft) => {
  const ingredients = draft.ingredients.filter((i) => !isBlankIngredient(i))
  const kept = draft.steps.map((s) => !!s.trim())
  const ids = new Set(ingredients.map((i) => i.id))
  return {
    ...draft,
    steps: draft.steps.filter((_, i) => kept[i]),
    ...(hasStepUses(draft) && { stepIngredients: draft.stepIngredients.filter((_, i) => kept[i]).map((uses) => uses.filter((u) => ids.has(u.id))) }),
    ingredients,
  }
}

/**
 * Edits a saved recipe, or, with `isNew`, a blank unsaved one that's created
 * (and given an id from its name) on the first save.
 */
export default function RecipePage({ recipe, isNew = false, takenIds, knownItems, registry, allTags, sides, actions }) {
  const [draft, setDraft] = useState(recipe)
  const [newGroup, setNewGroup] = useState('')
  const [status, setStatus] = useState('')
  // Id of a just-added ingredient whose first input should take focus once it mounts.
  const focusOnMount = useRef(null)

  useEffect(() => {
    setDraft(recipe)
  }, [recipe])

  const dirty = recipe && JSON.stringify(draft) !== JSON.stringify(recipe)
  // Warn on tab close/refresh, and (via the app's router) on in-app navigation.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    actions.setLeaveGuard(() => dirtyRef.current)
    const warn = (e) => dirtyRef.current && e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      actions.setLeaveGuard(null)
      window.removeEventListener('beforeunload', warn)
    }
  }, [])

  const saveRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!recipe || !draft)
    return (
      <p className="muted">
        Recipe not found. <a href="#/">Back to recipes</a>
      </p>
    )

  const groups = [...new Set(draft.ingredients.map((i) => i.group ?? ''))]
  if (!groups.length) groups.push('')
  // Hand-made recipes have no imported originals, so there's nothing to compare against.
  const hasOriginals = draft.ingredients.some((i) => i.original)

  const update = (patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }))
  const updateIngredient = (id, fn) => update((d) => ({ ingredients: d.ingredients.map((i) => (i.id === id ? fn(i) : i)) }))

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
    focusOnMount.current = ing.id
    update((d) => ({ ingredients: [...d.ingredients, ing] }))
  }

  function renameGroup(from, to) {
    if (to === from) return true
    if (to && groups.includes(to) && !confirm(`There's already a "${to}" group. Merge "${from || 'Ungrouped'}" into it?`)) return false
    if (!to && groups.length > 1 && !confirm(`Clear the name? Its ingredients will move to Ungrouped.`)) return false
    update((d) => ({ ingredients: d.ingredients.map((i) => ((i.group ?? '') === from ? { ...i, group: to } : i)) }))
    return true
  }

  // Steps change along with their ingredient lists, when the recipe has them.
  const setSteps = (fn) =>
    update((d) => {
      const pairs = fn(d.steps.map((text, i) => ({ text, uses: hasStepUses(d) ? d.stepIngredients[i] : null })))
      return { steps: pairs.map((p) => p.text), ...(hasStepUses(d) && { stepIngredients: pairs.map((p) => p.uses ?? []) }) }
    })
  function moveStep(index, delta) {
    setSteps((steps) => {
      const next = [...steps]
      const [step] = next.splice(index, 1)
      next.splice(index + delta, 0, step)
      return next
    })
  }
  function deleteStep(index) {
    const text = draft.steps[index]
    const uses = hasStepUses(draft) ? draft.stepIngredients[index] : null
    setSteps((steps) => steps.filter((_, j) => j !== index))
    if (text.trim())
      actions.notify(`Deleted step ${index + 1}.`, {
        undo: () => setSteps((steps) => [...steps.slice(0, index), { text, uses }, ...steps.slice(index)]),
      })
  }
  // Until a step's ingredients are edited, they're a guess from the step text; editing one saves them all.
  const draftIngredients = activeIngredients(draft)
  const stepUses = stepIngredientsOf(draft, draftIngredients, registry)
  const setStepUses = (index, uses) =>
    update((d) => ({ stepIngredients: stepIngredientsOf(d, activeIngredients(d), registry).map((u, j) => (j === index ? uses : u)) }))

  async function save() {
    if (!draft.name.trim() || (!isNew && !dirty)) return
    setStatus('Saving…')
    try {
      if (isNew) {
        const id = newRecipe(draft.name, takenIds).id
        await actions.createRecipe(cleaned({ ...draft, id }))
        actions.setLeaveGuard(null)
        actions.notify(`Created ${draft.name.trim()}.`)
        const cat = categoryOf(draft)
        window.location.hash = cat === 'main' ? `#/?new=${id}` : `#/?cat=${cat}&new=${id}`
        return
      }
      await actions.saveRecipe(cleaned(draft))
      setStatus('Saved')
    } catch {
      setStatus('')
    }
  }
  saveRef.current = save

  async function remove() {
    if (!confirm(`Delete "${recipe.name}"? This removes recipes/${recipe.id}.json and takes it out of the meal plan.`)) return
    await actions.deleteRecipe(recipe.id)
    actions.setLeaveGuard(null)
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

      <div className="editor-head">
        <a href={isNew ? '#/' : `#/recipe/${recipe.id}`} className="small back-link">
          ← {isNew ? 'Recipes' : 'Back to recipe'}
        </a>
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
            <span className="muted small" aria-live="polite">
              {dirty ? 'Unsaved changes' : status}
            </span>
            {isNew ? (
              <a href="#/">Cancel</a>
            ) : (
              dirty && <button onClick={() => setDraft(recipe)}>Discard changes</button>
            )}
            <button
              className="primary"
              disabled={!draft.name.trim() || (!isNew && !dirty)}
              title={!draft.name.trim() ? 'Give the recipe a name first' : 'Ctrl+S'}
              onClick={save}
            >
              {isNew ? 'Create recipe' : 'Save changes'}
            </button>
          </div>
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
          Really makes <span className="muted small">(servings as you eat them; a dinner is 2)</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            placeholder={draft.servings ? String(draft.servings) : ''}
            value={draft.trueServings ?? ''}
            onChange={(e) => update({ trueServings: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <div className="field">
          <span id="tags-label">Tags</span>
          <TagInput tags={draft.tags ?? []} allTags={allTags} onChange={(tags) => update({ tags })} />
        </div>
        <label className="field">
          Kind
          <select value={categoryOf(draft)} onChange={(e) => update({ category: e.target.value })}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label.replace(/s$/, '')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Effort
          <select value={draft.effort ?? ''} onChange={(e) => update({ effort: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Not set</option>
            {Object.entries(EFFORT_LABELS).map(([n, label]) => (
              <option key={n} value={n}>
                {n}: {label}
              </option>
            ))}
          </select>
        </label>
        <div className="field minutes-fields">
          <MinutesInput label="Prep" value={draft.prepMinutes} onChange={(prepMinutes) => update({ prepMinutes })} />
          <MinutesInput label="Cook" value={draft.cookMinutes} onChange={(cookMinutes) => update({ cookMinutes })} />
        </div>
      </div>
      {categoryOf(draft) !== 'side' && (
        <div className="field">
          <span id="pairs-label">Goes with</span>
          <SidePicker picked={draft.pairsWith ?? []} sides={sides.filter((s) => s.id !== draft.id)} onChange={(pairsWith) => update({ pairsWith })} />
        </div>
      )}

      <h2>Ingredients</h2>
      <p className="muted small">
        {hasOriginals && 'Edit the right-hand fields to make your version; the imported original stays on the left. '}
        Item picks an ingredient by name: a name that isn't known yet becomes a new ingredient when you save.
      </p>
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
                    const added = !ing.original && hasOriginals
                    const rowClass = changed ? 'changed' : added ? 'added' : ''
                    const name = eff.item?.trim() || 'new ingredient'
                    // A name links to an existing ingredient by its name, an alias, or the same words in another form.
                    const match = eff.item?.trim() ? matchIngredient(eff.item, registry) : null
                    const isNewItem = eff.item?.trim() && !match
                    const linksTo = match && match.how !== 'name' ? registry.ingredients[match.id]?.name : null
                    const maybe = isNewItem ? suggestIngredients(eff.item, registry, { limit: 2 }) : []
                    const badQty = unparsedQuantity(eff.quantity)
                    return (
                      <tr key={ing.id} className={rowClass}>
                        {hasOriginals && (
                          <td className="original">
                            {ing.original ? (
                              <>
                                <span className={changed ? 'struck' : ''}>{formatIngredient(ing.original)}</span>
                                {changed && <span className="pill">changed</span>}
                              </>
                            ) : (
                              <span className="pill">added by you</span>
                            )}
                          </td>
                        )}
                        {FIELDS.map(([field, label, cls]) => (
                          <td key={field} className={cls} data-label={label}>
                            <span className="input-wrap">
                              <input
                                ref={(el) => {
                                  if (el && field === FIELDS[0][0] && focusOnMount.current === ing.id) {
                                    focusOnMount.current = null
                                    el.focus()
                                  }
                                }}
                                aria-label={`${label} for ${name}`}
                                value={eff[field] ?? ''}
                                className={field === 'quantity' && badQty ? 'invalid' : undefined}
                                title={
                                  field === 'quantity' && badQty
                                    ? 'Not a number, so the grocery list can’t add it up. Use e.g. 1/2, 1 1/2 or 0.25.'
                                    : undefined
                                }
                                list={field === 'item' ? 'known-items' : field === 'unit' ? 'known-units' : undefined}
                                placeholder={field === 'unit' ? 'each' : undefined}
                                onChange={(e) => setField(ing, field, e.target.value)}
                              />
                              {field === 'item' && isNewItem && (
                                <span className="pill new" title="Not a known ingredient yet; saving creates it">
                                  new
                                </span>
                              )}
                            </span>
                            {field === 'item' && linksTo && (
                              <span className="field-note" title="Saved as this ingredient">
                                = {linksTo}
                              </span>
                            )}
                            {field === 'item' && maybe.length > 0 && (
                              <span className="field-note">
                                Did you mean{' '}
                                {maybe.map((m, i) => (
                                  <span key={m.id}>
                                    {i > 0 && ' or '}
                                    <button className="link small" onClick={() => setField(ing, 'item', m.name)}>
                                      {m.name}
                                    </button>
                                  </span>
                                ))}
                                ?
                              </span>
                            )}
                            {field === 'quantity' && badQty && <span className="field-warning">not a number</span>}
                          </td>
                        ))}
                        <td className="row-actions">
                          {groups.length > 1 && (
                            <select
                              aria-label={`Move ${name} to group`}
                              value={ing.group ?? ''}
                              onChange={(e) => updateIngredient(ing.id, (i) => ({ ...i, group: e.target.value }))}
                            >
                              {groups.map((g) => (
                                <option key={g} value={g}>
                                  {g || 'Ungrouped'}
                                </option>
                              ))}
                            </select>
                          )}
                          {changed && (
                            <button title="Go back to the original line" onClick={() => updateIngredient(ing.id, (i) => ({ ...i, modified: null }))}>
                              Undo edit
                            </button>
                          )}
                          <button onClick={() => update((d) => ({ ingredients: d.ingredients.filter((i) => i.id !== ing.id) }))}>Delete</button>
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
        <input placeholder="New group, e.g. Sauce" aria-label="New group name" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
        <button disabled={!newGroup.trim()}>+ Add group</button>
      </form>

      <h2>Notes</h2>
      <AutoTextarea
        minRows={4}
        aria-label="Notes"
        value={draft.notes ?? ''}
        placeholder="Your notes on this recipe…"
        onChange={(e) => update({ notes: e.target.value })}
      />

      <h2>Steps</h2>
      <ol className="steps">
        {draft.steps.map((step, i) => (
          <li key={i}>
            <div className="step-row">
              <AutoTextarea aria-label={`Step ${i + 1}`} value={step} onChange={(e) => setSteps((steps) => steps.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)))} />
              <div className="step-actions">
                <button title="Move up" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  ↑
                </button>
                <button title="Move down" aria-label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => moveStep(i, 1)}>
                  ↓
                </button>
                <button title="Delete step" aria-label={`Delete step ${i + 1}`} onClick={() => deleteStep(i)}>
                  ×
                </button>
              </div>
            </div>
            <StepUsesEditor step={i + 1} uses={stepUses[i] ?? []} ingredients={draftIngredients} guessed={!hasStepUses(draft)} onChange={(uses) => setStepUses(i, uses)} />
          </li>
        ))}
      </ol>
      <button className="link" onClick={() => setSteps((steps) => [...steps, { text: '', uses: [] }])}>
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

/** "1 tbsp" as { quantity, unit }; anything else ("zest", "only if needed") is a note. Blank means all that's left. */
function parseUse(text) {
  const t = text.trim()
  const m = t.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/)
  if (m && parseQuantity(m[1]) != null && (!m[2] || KNOWN_UNITS.includes(normalizeUnit(m[2])))) return { quantity: m[1], unit: normalizeUnit(m[2]) }
  return t ? { note: text } : {}
}
const useText = (u) => (u.quantity ? [u.quantity, u.unit].filter(Boolean).join(' ') : (u.note ?? ''))

/**
 * The ingredients a step uses, as chips with how much (blank for "all that's
 * left"), plus a menu to add another.
 */
function StepUsesEditor({ step, uses, ingredients, guessed, onChange }) {
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]))
  const shown = uses.filter((u) => byId[u.id])
  const rest = ingredients.filter((i) => i.item?.trim() && !uses.some((u) => u.id === i.id))
  const label = (i) => [i.item, i.group && `(${i.group})`].filter(Boolean).join(' ')
  return (
    <div className="step-uses-edit" role="group" aria-label={`Ingredients for step ${step}`}>
      <span className="muted small">Uses{guessed && shown.length > 0 ? ' (guessed from the text)' : ''}:</span>
      {shown.map((u) => (
        <span key={u.id} className="tag static">
          {label(byId[u.id])}
          <input
            className="use-amount"
            aria-label={`How much ${byId[u.id].item} step ${step} uses`}
            placeholder="all"
            title="How much this step uses, e.g. 1 tbsp. Leave blank for all that's left, or write a note like zest."
            value={useText(u)}
            onChange={(e) => onChange(uses.map((x) => (x.id === u.id ? { id: u.id, ...parseUse(e.target.value) } : x)))}
          />
          <button className="link" aria-label={`Remove ${byId[u.id].item} from step ${step}`} onClick={() => onChange(uses.filter((x) => x.id !== u.id))}>
            ×
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <select className="side-add" aria-label={`Add an ingredient to step ${step}`} value="" onChange={(e) => e.target.value && onChange([...uses, { id: e.target.value }])}>
          <option value="">+ ingredient…</option>
          {rest.map((i) => (
            <option key={i.id} value={i.id}>
              {label(i)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Chips for the sides a main goes with, plus a menu of the rest. */
function SidePicker({ picked, sides, onChange }) {
  const byId = Object.fromEntries(sides.map((s) => [s.id, s]))
  const shown = picked.filter((id) => byId[id])
  const rest = sides.filter((s) => !picked.includes(s.id))
  if (!sides.length) return <p className="muted small">No sides yet. Set a recipe's Kind to Side to pair it with mains.</p>
  return (
    <div className="tag-input" role="group" aria-labelledby="pairs-label">
      {shown.map((id) => (
        <span key={id} className="tag static">
          {byId[id].name}
          <button className="link" aria-label={`Remove ${byId[id].name}`} onClick={() => onChange(picked.filter((x) => x !== id))}>
            ×
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <select className="side-add" aria-label="Add a side" value="" onChange={(e) => e.target.value && onChange([...picked, e.target.value])}>
          <option value="">{shown.length ? 'Add another side…' : 'Add a side…'}</option>
          {rest.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Whole minutes, or null when cleared. */
function MinutesInput({ label, value, onChange }) {
  return (
    <label>
      {label} <span className="muted small">(min)</span>
      <input
        type="number"
        min="0"
        step="5"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
      />
    </label>
  )
}

/** A textarea that grows with its content, so long steps aren't clipped. */
function AutoTextarea({ minRows = 2, ...props }) {
  const ref = useRef(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }
  useEffect(fit)
  // Text rewraps when the window narrows (e.g. a phone rotating), so refit then too.
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return <textarea ref={ref} rows={minRows} {...props} />
}

/** Tags as removable chips, with existing tags suggested so they don't drift. */
function TagInput({ tags, allTags, onChange }) {
  const [text, setText] = useState('')
  const add = (raw) => {
    const next = raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t && !tags.includes(t))
    if (next.length) onChange([...tags, ...next])
    setText('')
  }
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="tag static">
          {t}
          <button className="link" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        list="tag-options"
        aria-labelledby="tags-label"
        placeholder={tags.length ? 'Add tag…' : 'e.g. chicken, quick'}
        value={text}
        onChange={(e) => {
          // Picking a suggestion replaces the whole value (no inputType, or
          // insertReplacementText); a comma finishes a tag while typing.
          const v = e.target.value
          const picked = !e.nativeEvent.inputType || e.nativeEvent.inputType === 'insertReplacementText'
          if (v.includes(',') || (picked && allTags.includes(v.trim().toLowerCase()))) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id="tag-options">
        {allTags
          .filter((t) => !tags.includes(t))
          .map((t) => (
            <option key={t} value={t} />
          ))}
      </datalist>
    </div>
  )
}

/** Group heading that renames on blur/Enter, so typing doesn't regroup rows mid-edit. */
function GroupName({ name, onRename }) {
  const [value, setValue] = useState(name)
  useEffect(() => setValue(name), [name])
  const commit = () => {
    if (value.trim() !== name && !onRename(value.trim())) setValue(name)
  }
  return (
    <input
      className="group-input"
      aria-label={`Group name${name ? `: ${name}` : ''}`}
      value={value}
      placeholder="Ungrouped"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
