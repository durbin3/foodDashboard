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
- [x] Import skill handles WPRM print pages, PDFs, and images; 14 recipes imported
- [x] Create recipes by hand; edit name, source, servings, groups, and steps; delete recipes
- [x] Ingredients tab: rename/merge ingredients across all recipes, manage pantry staples, set a "buy as" unit
- [x] Unit conversions: built-in (tsp/tbsp/cup, oz/lb, metric) plus custom shared and per-ingredient conversions, used by the grocery list

## Next

- [ ] Move an ingredient between groups in the recipe editor
- [ ] Warn before leaving a recipe page with unsaved changes (currently only on tab close/refresh)

## Later / maybe

- [ ] Grocery list grouped by store section (produce, meat, dairy)
- [ ] Phone access (serve on the LAN)
- [ ] Meal history and ratings
- [ ] Leftovers / batch-cook awareness
- [ ] Shared-ingredient hints when planning
