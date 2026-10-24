# Food Dashboard — TODO

## Done

- [x] Recipe storage: one JSON file per recipe in `recipes/`
- [x] Recipe library view with search (name or ingredient) and tag filters
- [x] Recipe edit view: the original ingredient sits alongside your modified version, plus text notes, tags, and saving to file
- [x] Meal plan: a single `data/plan.json` with day and scale factor per meal (the scale multiplies recipe amounts, not servings)
- [x] Grocery list: same-unit amounts combine and other units are listed alongside; pantry staples go in a separate section
- [x] "Copy as text" button on the grocery list (for sending to Discord)
- [x] `import-recipe` skill (URL or image → recipe file)
- [x] Imported Honey Garlic Chicken with notes and sauce modifications

## Next

- [ ] Unit conversions (tsp ↔ tbsp ↔ cup, etc.) so mixed units combine
- [ ] Create a recipe by hand in the UI (currently only through the skill)
- [ ] Edit recipe name, servings, and steps in the UI
- [ ] Manage the pantry staples list directly (currently toggled from grocery list rows)

## Later / maybe

- [ ] Grocery list grouped by store section (produce, meat, dairy)
- [ ] Phone access (serve on the LAN)
- [ ] Meal history and ratings
- [ ] Leftovers / batch-cook awareness
- [ ] Shared-ingredient hints when planning
