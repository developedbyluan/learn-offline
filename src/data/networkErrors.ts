// Network failures look like these in the error text. `fetch` throws
// "Network request failed"; file downloads say e.g. "Unable to resolve host".
// There's no network-status module (expo-network would need a native build), so the
// error text is the signal. Add new wording here if an offline error isn't caught.
const OFFLINE_PATTERN =
  /unable to resolve host|network|offline|internet|timed? ?out|failed to connect|connection/i;

// True when the error looks like the phone has no internet connection.
export function isOfflineError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return OFFLINE_PATTERN.test(text);
}
