/** Reset odd paths like /N/A (from relative links with placeholder values) back to app root. */
export function normalizeBrowserPath() {
  if (typeof window === 'undefined') return
  const { pathname, search, hash } = window.location
  if (pathname === '/' || pathname === '') return
  window.history.replaceState(null, '', `/${search}${hash}`)
}
