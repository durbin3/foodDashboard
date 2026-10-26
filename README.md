# foodDashboard

A local dashboard for the meals I know how to make: a recipe library, a weekly meal plan, and a combined grocery list.

## Running

```sh
npm install
npm run dev
```

It opens at http://127.0.0.1:5173 (use that address rather than localhost; see the note in `vite.config.js`). Every edit in the UI is written straight to JSON files in the repo, so changes survive a refresh and can be committed.

## Data

| Path | What it holds |
| --- | --- |
| `recipes/<id>.json` | One file per recipe: its `category` (main, side, breakfast, dessert or drink, one Recipes subtab each), `effort` (1–5) and `prepMinutes`/`cookMinutes`. Each ingredient keeps the imported `original` next to your `modified` version, plus free-text `notes`. Ingredients are referenced by `ingredientId`. |
| `data/ingredients.json` | The ingredient registry: every known ingredient by id, with its display name, `staple` flag (pantry section on the grocery list), `notListed` flag (left off the grocery list, e.g. "taco toppings"), "buy as" unit, its unit conversions, and for planning: `shelfLifeDays` (days it keeps after shopping; none = doesn't go off), `thaw` (frozen unless used within that time, so it needs a day to thaw) and `purchase` (the pack size it's sold in). |
| `data/settings.json` | Household settings: the people who rate meals, `cycleStart` (a Monday that starts a two-week shopping cycle; shopping is the Sunday before), the effort allowed on each weekday, and days you don't cook. Edited on the Settings tab. |
| `data/plan.json` | The meal plan: each meal's recipe, `cycle` (the first Monday of the two-week shopping cycle it was picked for), `date` (`YYYY-MM-DD`, or `null` if it isn't on a day yet), scale factor, and once it's been made, each person's 1–5 `ratings` and a `ratingNote`. Past meals stay as history and feed "Last made" and the ratings. Older files (a flat `entries` list) are converted when loaded. |

Renaming an ingredient only changes its `name` in the registry; recipes keep pointing at the same id. Merging two ingredients is the one operation that rewrites recipe files.

**Scaling** multiplies a recipe's ingredient amounts (1.5 = 1.5× everything); it ignores the recipe's stated servings.

**Meal plan** shows one two-week shopping cycle at a time (Monday to Sunday two weeks later; shopping is the Sunday before). Add the meals you want for the cycle, then drag each onto a day, or click a meal to pick its day, change its scale, or remove it. Each day shows the most effort you're up for (set on the Settings tab), and a meal that's harder than that is marked "over". Once a meal's day has passed, click it to rate it: everyone rates 1–5, and a recipe's rating is the average of all of them.

**Grocery list** is built per shopping trip, from all of that cycle's meals. Ticks are kept in your browser only, per cycle, and a tick clears itself if the amount changes. It groups items by ingredient and converts units using each ingredient's own conversion list. Standard conversions (tsp/tbsp/cup, oz/lb, metric, pinch) are added to an ingredient automatically once recipes use it in more than one unit; anything else (e.g. 1 each chicken breast = 1/2 lb) you add on the Ingredients tab, where unconvertible ingredients are flagged "needs conversion". Amounts that still can't be converted are listed side by side (`garlic: 1 + 8 clove`).

## Adding recipes

Ask Claude to import a recipe from a link or an image. The `import-recipe` skill (`.claude/skills/import-recipe/`) writes a new `recipes/<id>.json` and applies any notes you give it.
