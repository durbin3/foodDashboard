/** The app's address: path plus query, e.g. "/recipe/x/edit" or "/?cat=side". */
export const currentUrl = () => window.location.pathname + window.location.search

/** Go to an app address without reloading the page. */
export function navigate(to, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Old "#/recipe/x" links (bookmarks, open tabs) become "/recipe/x". */
export function upgradeHashUrl() {
  if (window.location.hash.startsWith('#/')) history.replaceState(null, '', window.location.hash.slice(1))
}

/**
 * Plain left clicks on links within the app navigate in place; anything else
 * (new tab, other sites, the API) is left to the browser.
 */
export function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = e.target.closest?.('a[href]')
  if (!a || a.target || a.hasAttribute('download') || a.origin !== window.location.origin || a.pathname.startsWith('/api')) return
  e.preventDefault()
  navigate(a.pathname + a.search)
}
