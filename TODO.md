# Food Dashboard — TODO

## Next - High Priority
- Add meal effort rating to recipes
- Add Rating system / tracking for recipes so we can keep track of what meals we liked
- Improve Meal Planning:
    - make the meal planning start with choosing a number of meals that sound good to eat
    - then move to slotting the meals on a specific day on a new tab
    - When choosing meals we need to recommend meals based off the minimizing the spanning set of ingredients that cover all chosen recipes 
    - When slotting meals we need to account for intentional ingredient management
        - fresh food doesn't last more than a week
		- meat needs a day to thaw
    - optional accounting for effort asymmetry on certain days (for example, tuesdays we may want something easy, and on mondays we may be okay with higher effort meals)
    - optional weighting for variety and effort heuristic; allows fine tuning of how varied the meal plan can be

- Add Recipe scraping workflow
    - figure out set of recipe websites we can scrape from (budgetbytes, allrecipes, etc.) 
    - 
- Add meal sides categories and pairing for recipes
    - when making burgers, for example, we wouldn't just want the burger. We'd also want french fries or grilled asparagus
    - sides can be used in multiple recipes: mashed potatos go well with pork chops and steak, for example.
    - sides should be accounted for when meal planning / recommending

- Add ability to list some ingredients we already have in storage so we can utilize those first when planning
    - for example, if we have 2 chicken breasts in the freezer, suggesting a chicken meal wouldn't "cost" those chicken breasts because we already have them

- Add minimum purchase quantity for ingredients and account for residual ingredients
    - example: you can only buy chicken in packs of 2 lbs, so if we have a recipe that calls for chicken we'd need to buy at least 2lbs of it
    - need to display both the purchase amount and how much we'd actually use so that we don't get confused
    - also need to account for this when computing minimum set of ingredients we'd need

## Next - Low Priority

- [ ] Data: Basic Easy Quiche uses `pie-crust`, which isn't in `data/ingredients.json` (shown as "not registered"); merge it into "double pie crust" and check why the import didn't register it
- [ ] Data: "large tortilla" and "tortilla" are flagged as possible duplicates; merge them or mark them "Not duplicates"
- [ ] Decide whether salt and pepper should drop amounts entirely (pantry amounts are muted for now)
- [ ] Phone editor is still long (~4,400px for Honey Garlic Chicken, now with every field labelled and steps unclipped); fine while the read-only view is the phone default, but could collapse the Original column

## Later / maybe

- [ ] Grocery list grouped by store section (produce, meat, dairy)
- [ ] Phone access (serve on the LAN)
- [ ] Meal history and ratings (plan entries are now dated, and "Last made" uses past ones)
- [ ] Meal slots (breakfast / lunch / dinner) on plan days
- [ ] Leftovers / batch-cook awareness
- [ ] Shared-ingredient hints when planning
