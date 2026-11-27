const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'ttclid', 'igshid', 'mc_cid', 'mc_eid']);

/** Filter raw components so legitimate values keep their encoding, order and duplicates. */
export function cleanTrackingSearch(search: string): string {
  const parts = search.replace(/^\?/, '').split('&');
  const kept = parts.filter(part => {
    const key = new URLSearchParams(part).keys().next().value?.toLowerCase();
    return !key || (!key.startsWith('utm_') && !TRACKING_KEYS.has(key));
  });
  if (kept.length === parts.length) return search;
  return kept.some(Boolean) ? '?' + kept.join('&') : '';
}

export function sanitizeTrackingUrl(browser: Pick<Window, 'location' | 'history'> = window): void {
  const { location, history } = browser;
  const search = cleanTrackingSearch(location.search);
  if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash);
}
