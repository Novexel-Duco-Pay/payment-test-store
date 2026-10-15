import { useEffect, useState } from 'react';

const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * The most an order may be, in minor units, or null when there is no limit (or it could not be read: the server
 * checks it anyway, so failing to ask only means no early warning). With a Duco test key the limit is GHS 10.00.
 */
export function useOrderLimit() {
  const [limit, setLimit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/api/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const value = data && Number.isInteger(data.maxOrderMinor) ? data.maxOrderMinor : null;
        if (!cancelled) setLimit(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return limit;
}
