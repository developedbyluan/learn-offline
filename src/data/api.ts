// The flucom-api-bun server (Cloudflare Workers). Set EXPO_PUBLIC_API_BASE_URL in .env and
// in the EAS environments; the fallback keeps the app working if it's missing.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://flucom-api-bun.developedbyluan.workers.dev";

// HTTP Basic auth for endpoints that need it (e.g. POST /sessions).
// Note: EXPO_PUBLIC_ variables are embedded in the app bundle, so these credentials can be
// extracted from the app. Fine for internal testing; see docs/play-time-tracking.md.
export function basicAuthHeader(): string {
  const user = process.env.EXPO_PUBLIC_API_USER;
  const pass = process.env.EXPO_PUBLIC_API_PASS;
  if (!user || !pass) {
    throw new Error("Missing EXPO_PUBLIC_API_USER or EXPO_PUBLIC_API_PASS");
  }
  return `Basic ${base64(`${user}:${pass}`)}`;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Uses btoa when the JS engine has it (Hermes does); otherwise a small ASCII encoder.
function base64(text: string): string {
  if (typeof globalThis.btoa === "function") return globalThis.btoa(text);
  let output = "";
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i);
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN;
    const triple = (a << 16) | ((b || 0) << 8) | (c || 0);
    output += BASE64_CHARS[(triple >> 18) & 63] + BASE64_CHARS[(triple >> 12) & 63];
    output += Number.isNaN(b) ? "=" : BASE64_CHARS[(triple >> 6) & 63];
    output += Number.isNaN(c) ? "=" : BASE64_CHARS[triple & 63];
  }
  return output;
}
