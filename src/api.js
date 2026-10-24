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
  saveRecipe: (recipe) => request('PUT', `/api/recipes/${recipe.id}`, recipe),
  getPlan: () => request('GET', '/api/plan'),
  savePlan: (plan) => request('PUT', '/api/plan', plan),
  getPantry: () => request('GET', '/api/pantry'),
  savePantry: (pantry) => request('PUT', '/api/pantry', pantry),
}
