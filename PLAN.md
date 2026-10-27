# Food Dashboard — Plan of Work

The plan for the "Next - High Priority" items in `TODO.md`, from the usability test review. The new meal planner **replaces** the current plan page. Nothing about the old "unscheduled meals count toward every week" behaviour needs to survive.

Design assumptions that run through everything below:

- **Shopping happens once every two weeks, on Sunday.** The unit of planning is a 14-day **cycle** that runs Monday to Sunday two weeks later; the shopping trip is the Sunday before the cycle's first Monday. So the first Monday is 1 day after shopping and the last Sunday is 14 days after. Grocery lists, freshness and recommendations are all per cycle. There are no mid-cycle shopping trips.
- **Two people rate meals:** Eric and Sarah. Where one number is needed, the two ratings are averaged.
- **Perishable means "has a shelf life".** An ingredient with no `shelfLifeDays` is non-perishable.
- **Inventory without a quantity counts as owning none** when working out what to buy.

---

## Phase 0: Data foundations (done)

These are the fields everything else depends on. Each is useful on its own, so this phase can ship before the planner work.

### 0.1 Settings file

New `data/settings.json`, served through `DATA_FILES` in `server/api.js`, with a Settings page (or a section on the Plan page) to edit it:

```json
{
  "people": ["Eric", "Sarah"],
  "cycleStart": "2026-10-26",
  "dayEffort": { "mon": 4, "tue": 2, "wed": 3, "thu": 3, "fri": 2, "sat": 5, "sun": 4 },
  "noCookDays": [],
  "weights": { "effort": 1, "freshness": 1, "variety": 1 }
}
```

- `cycleStart` is any Monday that begins a cycle, chosen so we can line it up with the actual shopping Sunday. Every cycle is 14 days, Monday to Sunday, and the shopping trip is the Sunday before. The day and cycle length are fixed in code, not settings.
- `dayEffort` is the most effort (1–5) we're up for on each weekday. It's set per weekday and repeats across both weeks of a cycle. A per-date override can come later if needed.
- `noCookDays` lists weekdays we never cook (eating out, leftovers night). The scheduler leaves them empty.

### 0.2 Recipe fields

Add these to `recipes/*.json`, the recipe editor and the read-only view:

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `"main" \| "side" \| "breakfast" \| "dessert" \| "drink" \| …` | One per recipe. It drives the Recipes subtabs (0.4). |
| `effort` | 1–5 | 1 = dump and go, 5 = project. |
| `prepMinutes` | number | Hands-on time. |
| `cookMinutes` | number | Hands-off or cooking time. |
| `pairsWith` | recipe ids | Mains only: the sides that go with it (Phase 2). |

- Migration script: set `category` from the existing tags (`breakfast`, `dessert`, `drink` → that category, everything else → `main`). Leave `effort`/minutes empty and flag them as "needs effort" on the Library, the same way unconvertible ingredients are flagged.
- Update the `import-recipe` skill to fill `category` and the minutes (most schema.org recipe data includes `prepTime`/`cookTime`) and to suggest an `effort`.

### 0.3 Ingredient fields

Add these to `data/ingredients.json` and the Ingredients page:

| Field | Type | Notes |
| --- | --- | --- |
| `shelfLifeDays` | number | Days it keeps after shopping: any whole number (3 for fresh fish, 5 for cilantro, 10 for carrots, 21 for eggs), not multiples of a week. Missing = non-perishable. |
| `thaw` | boolean | Bought fresh but frozen if it isn't used within `shelfLifeDays` (meat), so a meal after that needs a day to thaw. Things bought frozen and cooked from frozen (mixed vegetables) just have no shelf life. |
| `purchase` | `{ qty, unit }` | Smallest amount you can buy, e.g. `{ "qty": 2, "unit": "lb" }`. Missing = buy exactly what's used (current behaviour). Used in Phase 4. |

Only fresh produce, dairy and meat need values, so I'll make a first pass over the 103 ingredients for you to review.

### 0.4 Recipes page subtabs

Split the Library into subtabs by `category`: **Mains · Sides · Breakfast · Desserts · Drinks** (only the categories that have recipes). Each keeps today's search, tag filter and sort, scoped to that tab, with the subtab in the URL state. Add Effort, Time and Rating columns.

---

## Phase 1: New plan data model and plan page (done, except recommendations, which come with Phase 3)

### 1.1 Data model

**Done.** `data/plan.json` is a flat list of meals, each tagged with the cycle it was picked for. That keeps history lookups ("last made", ratings) simple:

```json
{
  "meals": [
    {
      "id": "uuid",
      "recipeId": "honey-garlic-chicken",
      "cycle": "2026-10-26",
      "date": "2026-10-28",
      "scale": 1,
      "ratings": { "Eric": 4, "Sarah": 5 },
      "ratingNote": "",
      "sides": [{ "recipeId": "rice", "scale": 1 }],
      "pinned": true
    }
  ],
  "recommendations": { "2026-10-26": { "uuid": "2026-10-28" } }
}
```

- `cycle` is the cycle's first Monday. `date: null` means picked for that cycle but not on a day yet; an undated meal belongs **only** to its own cycle.
- A dated meal's cycle is always worked out from its date, and an undated one's is snapped to a cycle start, so changing `cycleStart` in Settings keeps everything consistent.
- `sides` arrive in Phase 2. `pinned` and `recommendations` (the saved meal → day assignment per cycle, so it stays put between visits and is only recomputed when something changes) arrive in Phase 3.
- Migration (`normalizePlan` in `lib/plan.js`): old dated entries go to the cycle their date falls in, as history. Old undated entries join the current cycle.

### 1.2 Plan page layout (done)

As built: the Meals section holds the meals that aren't on a day yet. A meal moves out of it when it's dragged onto a day, and back when it's dragged back. The section heading counts all the cycle's meals and how many still need a day. Clicking any meal opens a panel at the bottom of the screen with its day, scale, Remove, and ratings once its day has passed.

The page shows one cycle at a time, with ‹ › navigation between cycles.

1. **Meals section:** the meals added to this cycle. Each card shows the recipe, effort, time, sides, scale and a perishability marker. Add meals with search, as today. Meals not yet on a day are highlighted.
2. **Day slots:** 14 day slots in two rows (week 1 / week 2). Each slot shows:
   - the meal placed there, or a faded **recommended meal** with an "Accept" button when it's empty (Phase 3),
   - the day's effort budget (e.g. "effort ≤ 2"),
   - the thaw reminder and freshness warnings (Phase 3.4).
   - No-cook days are shown as such.

**Drag and drop:** Meal cards drag from the Meals section onto a day, between days and back to the Meals section. Use native HTML5 drag and drop (no new dependency). It doesn't work on touch screens, so every card also gets a "Move to…" day menu. That covers phones and keyboard users.

**"Accept all recommendations"** places every unplaced meal on its recommended day in one step.

### 1.3 Ratings (done)

Once a meal's date has passed, its card shows a "How was it?" prompt with a 1–5 rating for Eric and for Sarah, plus a short note. On a recipe:

- the read-only view shows a rating history (date, both scores, note),
- the Library shows each person's average and the combined rating: the average of everyone's ratings, which is also what the suggestions use,
- "Last made" keeps working from dated past meals.

### 1.4 Grocery page per cycle (done)

`#/grocery/<cycleStart>` lists all of a cycle's meals and their sides. Ticks are stored per cycle. The underlying calculation is replaced in Phase 4.

---

## Phase 2: Sides (done)

As built: a main's editor has a "Goes with" picker of side recipes. On the plan, adding a main that has pairings opens its panel with those sides as one-click suggestions, plus a menu of every other side. An attached side starts at the meal's scale. Sides have no "+ Add" of their own; the Recipes list and recipe page show which meals they're planned with. Shared logic is in `src/lib/meals.js` (`mealParts`, `mealEffort`, `pairedSides`, `mainsFor`).

- Sides are recipes with `category: "side"`. They're listed on their own subtab (0.4).
- Mains list their good sides in `pairsWith` (picked from side recipes in the editor). The side's view shows the reverse ("Goes with: Pork chops, Steak") by searching the mains, so the link is only stored once.
- When you add a main to a cycle, its paired sides are suggested. Click one to attach it to the meal (`meal.sides`). A side can also be attached to any meal by search.
- The grocery list, freshness checks and the ingredient-cost calculations all count sides.
- A meal's effort is the main's effort, plus 1 if any side has effort ≥ 3 (capped at 5). It's a simple rule we can tune once we've used it.
- Simple sides with no real recipe (bagged salad, frozen fries) are short "recipes" with one ingredient and no steps. No separate data type needed.

---

## Phase 3: Scheduler (day slot recommendations) (done)

As built, in `src/lib/schedule.js` with tests in `schedule.test.js` (`npm test`):

- **No `pinned` flag.** Any meal on a day counts as placed by you and stays put. Suggestions go only to *free* days: cookable, today or later, with nothing on them. If there are more meals than free days, the extra ones show "no free day".
- **Saved suggestion.** It's stored in `plan.recommendations[cycle]` along with what it was based on: the settings, each meal's recipe, sides and effort, and where the already-placed meals were. It's reused until something besides following it changes. Accepting a suggestion (click the dashed card, or "Place all as suggested") keeps the rest. Dropping a meal anywhere else, taking a placed meal back off its day, adding or removing a meal, or changing settings re-solves.
- **Costs.** Effort over the day's budget costs (over)², and 0.25 per point under. Perishables cost 20 + 3 per day past their shelf life, and a little in their last two good days. Meals sharing a recipe or main-protein tag cost extra on the same or neighbouring days. There's a tiny preference for earlier days to break ties. Recipes with no effort set have no effort cost.
- **Warnings.** These cover placed meals: a ❄ thaw reminder on the day before, a ⚠ freshness warning on the meal, and "no-cook day" if a meal is on one. All of them are listed under "This cycle" on the grocery page.

All of this is plain functions in `src/lib/schedule.js`, tested with `node --test` (no new dependencies).

### 3.1 Cost of putting meal *m* on day *d*

- **Effort:** `max(0, effort(m) − dayEffort(d))²`. Going over budget costs a lot; going under costs a little (`0.25 × (dayEffort − effort)`), so hard meals don't all end up on easy days.
- **Freshness:** for every perishable ingredient of *m* and its sides, `daysSinceShopping(d) − shelfLifeDays`. Days since shopping run from 1 (first Monday) to 14 (last Sunday). Shelf lives are individual day counts, so a 3-day ingredient has to be eaten by Wednesday of week 1, and a 10-day one by Wednesday of week 2. Anything above 0 is a heavy penalty. A smaller penalty applies as the day gets close to the limit, so perishable meals drift toward the start of the cycle.
- **Variety:** this cost depends on pairs of meals. There's a penalty when meals on the same or neighbouring days share a main protein or category tag.
- Each part is multiplied by the weights in `settings.weights`.

### 3.2 Solver

At most 14 days, and usually 8–12 meals. Effort and freshness depend only on (meal, day), so the **Hungarian algorithm** finds the best assignment for those exactly. Empty days are handled by adding "no meal" placeholders that cost nothing. Pairs of meals are then swapped while the total cost (now including variety) keeps going down. That's milliseconds at this size. Pinned meals and no-cook days are fixed before solving.

### 3.3 Recommendations and hand-placed meals

1. Adding or removing a meal, or changing settings, recomputes the full recommendation, which is saved in `cycle.recommendation`.
2. Each empty day shows its recommended meal.
3. Dropping a meal on a day that **isn't its recommended day** pins it. The scheduler then re-solves the **remaining** meals and days around everything pinned and saves that as the new recommendation. Empty slots update to show it.
4. Accepting a recommendation, or dropping a meal on its recommended day, matches the saved recommendation and doesn't trigger a re-solve.
5. Moving a pinned meal back to the Meals section unpins it and re-solves.

Keeping the saved recommendation means the suggestions don't change every time you look at the page, only when a decision changes what's best.

### 3.4 Thawing and freshness warnings

- **Thaw:** if a meal on day *d* uses a `thaw` ingredient and *d* is past its shelf life (so it went in the freezer), day *d − 1* shows "Thaw: chicken breast (for Honey Garlic Chicken)". Within its shelf life it's still in the fridge and needs nothing. A frozen ingredient is never flagged as going off.
- **Freshness:** a meal placed after an ingredient's shelf life gets a warning: "Cilantro bought Oct 25 is 9 days old by Nov 3 (keeps 7)". This applies to hand-placed meals too. The scheduler only avoids the problem; it doesn't stop you.
- Both also appear on the grocery page as a short "This cycle" summary.

---

## Phase 4: What to buy (storage, pack sizes, leftovers) (done)

As built (`src/lib/needs.js`, tested in `needs.test.js`):

- **Base unit.** The arithmetic runs in one base unit per ingredient: the pack unit, else the "buy as" unit, else the recipes' unit. It applies only when there's a pack size or a stored amount, and every amount converts to that unit. Otherwise the line reads as before. A stored amount in a unit that doesn't convert is noted on the line as not counted.
- **Grocery lines.** They show what to buy ("2 lb (2 packs)") with "use …, have … in storage, … left over" underneath when that differs. Lines fully covered by storage move to an "In storage" section.
- **On hand tab.** It edits `data/inventory.json`: ingredient, amount, where, date added, and how many days it has left (for perishables outside the freezer).
- **"Done shopping."** It sets each counted ingredient's storage to what's left once the cycle's meals are made. That's projected at shopping time; the meals haven't been cooked yet. Leftover meat that gets thawed defaults to the freezer. It runs once per trip (`inventory.shopped`) and has an Undo.
- **Not done yet.** Stored perishables aren't yet part of the scheduler's freshness checks; they're flagged on the On hand tab only.

### 4.1 One function for what each cycle needs to buy

New `src/lib/needs.js`: `computeNeeds(meals, recipesById, registry, inventory)`. For each ingredient it:

1. adds up the amounts across meals and sides (moved out of `buildGroceryList`),
2. subtracts what's in storage (converted with the existing unit graph; storage with no quantity counts as 0),
3. rounds up to whole `purchase` packs,
4. returns `{ used, have, buy, leftover }`.

The grocery list, the meal suggestions (Phase 5) and the inventory update (4.3) all use it.

### 4.2 Storage list

New `data/inventory.json` and an **On hand** page (or a section on the Ingredients page):

```json
{ "items": [{ "ingredientId": "chicken-breast", "qty": "2", "unit": "", "location": "freezer", "added": "2026-10-20" }] }
```

`location` is only a label to help find things. Perishable items with an `added` date are checked for freshness the same way as bought ones.

### 4.3 Grocery list display

- Lines read "Chicken breast: **buy 2 lb** (use 1.5 lb, 0.5 lb left over)". When nothing is left over and nothing is in storage, they read as today.
- "Have 2 in storage" lines are listed separately, so you can check them, but aren't bought.
- After shopping, a **"Done shopping"** button adds leftovers to the storage list, so the next cycle knows about them.

---

## Phase 5: Meal suggestions in the Meals section (done)

As built (`src/lib/suggest.js`, tested in `suggest.test.js`):

- **What costs something.** "Things to buy" counts each ingredient not already being bought, or each extra pack for ingredients sold in packs. Staples, unlisted ingredients, and anything covered by storage or by leftovers from packs already being bought cost nothing.
- **Unrated recipes** count as 3 stars. "Made recently" costs 2 if made within the last 14 days, fading to 0 at 28 days. Variety costs 0.5 for each picked meal that shares a main-protein tag.
- **Repeats.** Recipes already in the cycle aren't suggested again: a repeat would cost nothing and crowd out everything else. You can still add one by hand.
- **Fill button.** "Fill the N open days" adds one meal per free day not already covered by a picked meal, choosing each given the ones before it, with one Undo.
- **Tune sliders.** Five weights live under "Tune" next to the suggestions: shared ingredients, variety, not made lately, effort fit, freshness. They're saved in `settings.weights`. Only effort fit, freshness and variety affect which day a meal is suggested for.

While choosing meals for a cycle, show ranked **suggested additions** that re-rank after every pick:

```
score = rating − w_cost × extra packs to buy (from computeNeeds)
        − w_variety × overlap with meals already picked
        − w_recency × made recently
```

- Using what's already in storage, or leftovers from packs already being bought, costs nothing extra. That's what makes the suggestions favour meals that share ingredients.
- The weights live in `settings.weights` and appear as sliders next to the suggestions.
- Only mains are suggested; sides come from `pairsWith` (Phase 2).
- An optional **"Fill the cycle"** button adds the top N in one go, choosing each one given the ones before it. With ~25 recipes we could compare every combination, but one at a time matches how we actually choose.

---

## Phase 6: Finding new recipes online

The goal is to **find recipes we don't have yet** and add them without creating duplicate ingredients.

### 6.1 Finding candidates

- Start with a few sites that publish schema.org recipe data and have searchable sitemaps or listing pages: Budget Bytes, Allrecipes, Serious Eats, RecipeTin Eats. A server script crawls their recipe sitemaps (politely: cached, rate-limited) and saves the extracted recipe data to `data/candidates/`, using the existing `extract-recipe.mjs`.
- **Fetch test (2026-10-26),** plain HTTPS with a browser user agent:
  - **Allrecipes:** sitemap index and recipe pages both fine. The extractor read the name, ingredients, steps, and prep and cook times from schema.org data.
  - **RecipeTin Eats:** sitemap index and recipe pages both fine, same result.
  - **Budget Bytes:** sitemaps fine, but recipe pages return 403 (a Cloudflare challenge). They'd need the Wayback Machine fallback.
  - **The Kitchn:** 403 on the sitemap.
  - **NYT Cooking:** no public sitemap (and it's paywalled).
  - **Serious Eats, Simply Recipes:** the sitemap URLs return almost nothing. They need a different discovery route (category pages or site search).
- **Risk:** some sites block automated requests (we've already seen 403s in the import skill). Expect to keep a list of which sites work, using the Wayback Machine as a fallback. Test this before building any UI.
- Alternative or addition: a `find-recipes` Claude skill that uses web search for requests like "easy chicken dinners under 30 minutes" and saves its finds into the same candidates folder.

### 6.2 Discover tab

A Discover subtab lists candidates and ranks them with the Phase 5 scoring: rating isn't known, so it uses ingredient overlap with what we usually buy, effort and time (from schema.org data), and category. Each candidate has **Import** (the review flow in 6.3) and **Dismiss** (remembered, so it's not shown again).

### 6.3 Matching website ingredients to our ingredient list (done, except the review screen)

As built (`src/lib/match.js`, tested in `match.test.js`):

- **Automatic links.** A name links to an ingredient when it's the ingredient's name or one of its `aliases` (ignoring case), or when both read the same once normalized. Normalizing makes plurals singular, drops punctuation and parentheses, and removes prep and size words (chopped, boneless, large…). Words that change the purchase (fresh, dried, ground, shredded) are kept. If two ingredients normalize alike ("tortilla" and "large tortilla"), nothing is linked automatically.
- **Suggestions.** Anything else gets ranked suggestions based on shared words (allowing a one-letter typo), one name containing the other, and spelling.
- **Server and import skill.** The server's linking and the import skill's `link-ingredients.mjs` both use this matcher. The link script lists possible existing matches for every ingredient it creates. The new `merge-ingredient.mjs` folds a mistaken new ingredient into the right one.
- **Merging and renaming.** Merging (in the app or by script) keeps the old name and its aliases as aliases of the target, and repoints On hand items. Renaming keeps the old name as an alias.
- **Ingredients tab.** It has an "Also called" editor (an alias can't be another ingredient's name or alias), and search covers aliases. Duplicate detection uses the shared normalizing.
- **Recipe editor.** It shows "= pepper" when a typed name will link to an ingredient through an alias or other wording, and "Did you mean …?" for new names.
- **Still to build.** The in-app import review screen (Accept / Choose another / New ingredient per line) comes with the Discover tab (6.2), on top of this matcher.

- Add `aliases: []` to registry ingredients. A website's ingredient line is matched by:
  1. normalizing it (lowercase, plural → singular, drop words like "boneless skinless", "fresh", "chopped", "large"),
  2. checking for an exact name or alias match,
  3. otherwise offering close matches (token overlap / edit distance).
- The import review screen shows each line with its proposed match: **Accept**, **Choose another**, or **New ingredient**. An accepted match saves the website's wording as an alias, so the same wording matches automatically next time.
- `import-recipe` and the existing `link-ingredients.mjs` move to the same matcher, so imports from Claude and from the app agree.
- The Ingredients page shows aliases and lets you remove them. Merging two ingredients combines their aliases.

---

## Phase 7: Day settings on the plan, real servings and leftovers (done)

As built:

- **Per-day settings.** Each day square has a "cook" checkbox and an effort menu, saved for that date only in `plan.days` (`{ "2026-10-28": { "effort": 5, "cook": false } }`). Days start from the usual weekday values in Settings; ↺ on a changed day puts it back. The saved day suggestion is re-solved when a day's effort or cooking changes.
- **Real servings.** Recipes can record `trueServings` (what a batch really makes, at our portions). Every dinner eats 2 servings (`SERVINGS_PER_DINNER` in `meals.js`), since the two of us always eat. Without `trueServings`, the stated `servings` is used and the card shows "~3 dinners". It's edited inline on the plan's meal panel and the recipe page (saved straight to the recipe), and in the editor. Once a meal's day has passed and it still uses the stated count, the panel asks how many it really made.
- **Leftovers.** A meal makes `floor(servings × scale / 2)` dinners; the extra ones are leftover nights, stored as `meal.leftovers: [dates]` after the cooking day. They show as dotted ↺ cards that drag between days (and back to the Meals section to unplace), or are picked from the meal panel. Unplaced ones wait in the Meals section, with "Place as suggested".
- **Scheduling.** Days with leftovers aren't free for meal suggestions. Leftover nights are suggested for the earliest empty day within 4 days of cooking, no-cook days first, after the meal suggestions. Moving a meal moves its leftovers by the same number of days; taking it off its day drops them. Warnings flag more leftover nights than a batch makes, and leftovers more than 4 days old.
- **Counting dinners.** The Meals heading shows how many dinners the picks cover with leftovers, and "Fill the open days" counts each pick's leftover nights.
- **Layout.** The plan page is two columns: the Meals list on the left, and a calendar on the right with one row per weekday (named once) holding that day in week 1 and week 2, rows separated by a bar. On narrow screens the list sits above the calendar. Meal suggestions show only the top 3, without the count of things to buy.
- **Not done.** Meal suggestions for days don't reserve room for the leftovers of meals not yet on a day; with leftovers, picking fewer meals is up to us (the dinner count in the heading helps).

---

## Order and dependencies

| Phase | Depends on | Delivers |
| --- | --- | --- |
| 0 Foundations | — | Settings, effort/time/category, shelf life/thaw/pack size, Recipes subtabs |
| 1 Plan page | 0 | Cycles, Meals + Day slots, drag and drop, ratings |
| 2 Sides | 0, 1 | Pairing, sides on meals and grocery list |
| 3 Scheduler | 0, 1 (2 for effort with sides) | Recommendations, re-solving around hand-placed meals, thaw/freshness warnings |
| 4 What to buy | 0, 1 | Storage list, buy vs use, leftovers |
| 5 Suggestions | 4 | Ingredient-aware meal suggestions |
| 6 Discover | 5 (for ranking) | Finding new recipes, ingredient matching |

Phase 6.3 (ingredient matching) doesn't depend on anything else and can be done early to clean up the current imports. Testing whether sites can be fetched (6.1) is also worth doing early, because it decides whether the crawler approach works at all.

## Decisions

- **Shopping day:** fixed on Sunday, every other week. Cycles run Monday to Sunday (14 days).
- **Mid-cycle trips:** none for now. Late in a cycle, the scheduler leans on non-perishable and frozen ingredients.
- **Shelf life:** stored per ingredient in days, not in weeks.
- **Combining ratings:** average of Eric's and Sarah's.

## Open questions

- ~~**No-cook days:** are leftovers nights common enough to need their own slot type?~~ Answered by Phase 7: leftover nights are their own cards on a day.
