"use client";

import { useEffect, useState } from 'react';

// Phone breakpoint. Keep in sync with the `max-width: 640px` block in
// app/globals.css — CSS handles most of the reflow; this is only for the few
// places where phones need different markup (e.g. the payouts table).
export const PHONE_QUERY = '(max-width: 640px)';

// True while the viewport matches `query`. The app only ever renders in the
// browser (see app/page.js), but guard anyway so an SSR import can't crash.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
