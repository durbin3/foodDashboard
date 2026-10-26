async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`)
  return data
}

export const api = {
  listRecipes: () => request('GET', '/api/recipes'),
  createRecipe: (recipe) => request('POST', '/api/recipes', recipe),
  saveRecipe: (recipe) => request('PUT', `/api/recipes/${recipe.id}`, recipe),
  deleteRecipe: (id) => request('DELETE', `/api/recipes/${id}`),
  getPlan: () => request('GET', '/api/plan'),
  savePlan: (plan) => request('PUT', '/api/plan', plan),
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: (settings) => request('PUT', '/api/settings', settings),
  getIngredients: () => request('GET', '/api/ingredients'),
  saveIngredients: (data) => request('PUT', '/api/ingredients', data),
  mergeIngredient: (from, into) => request('POST', '/api/ingredients/merge', { from, into }),
}
