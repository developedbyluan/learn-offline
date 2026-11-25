import { COMMONVOCAB_BASE_URL, commonvocabAuthHeader } from "@/data/api";

// Pinned messages for the Pinned tab, from the commonvocab server. Online only: nothing is
// cached on the phone. See docs/pinned-messages.md.

export type MessageLink = {
  id: number;
  text: string;
  url: string;
  note: string | null;
};

// Unix seconds.
export type PinnedRange = { start: number; end: number };

// Only the fields the app uses. Replies are requested (include=replies) but not shown.
export type PinnedMessage = {
  id: number;
  displayName: string;
  body: string;
  // Not shown yet: they'll appear under conditions still to be decided.
  links: MessageLink[];
  pinRank: number | null;
  pinnedRange: PinnedRange | null;
  createdAt: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function parseLink(value: unknown): MessageLink | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  if (id === null || typeof value.url !== "string") return null;
  return {
    id,
    text: typeof value.text === "string" ? value.text : value.url,
    url: value.url,
    note: typeof value.note === "string" && value.note.trim() ? value.note : null,
  };
}

function parseRange(value: unknown): PinnedRange | null {
  if (!isRecord(value)) return null;
  const start = num(value.start);
  const end = num(value.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

// Loose checks: a message without an id or body is skipped instead of failing the list.
function parseMessage(value: unknown): PinnedMessage | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  if (id === null || typeof value.body !== "string" || !value.body.trim()) return null;
  return {
    id,
    displayName: typeof value.display_name === "string" ? value.display_name : "",
    body: value.body,
    links: Array.isArray(value.links)
      ? value.links.map(parseLink).filter((link): link is MessageLink => link !== null)
      : [],
    pinRank: num(value.pin_rank),
    pinnedRange: parseRange(value.pinned_range),
    createdAt: num(value.created_at) ?? 0,
  };
}

export async function fetchPinnedMessages(
  userId: string,
  signal?: AbortSignal,
): Promise<PinnedMessage[]> {
  const query = new URLSearchParams({ user_id: userId, pinned: "true", include: "replies" });
  const res = await fetch(`${COMMONVOCAB_BASE_URL}/messages?${query.toString()}`, {
    headers: { Authorization: commonvocabAuthHeader(), Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Pinned messages request failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Pinned messages response isn't a list");
  return data.map(parseMessage).filter((message): message is PinnedMessage => message !== null);
}

// Drops messages whose time window has ended, then sorts by pin rank (unranked last),
// then newest first.
export function visiblePinned(messages: PinnedMessage[], nowMs: number): PinnedMessage[] {
  const nowSeconds = nowMs / 1000;
  return messages
    .filter((message) => !message.pinnedRange || message.pinnedRange.end > nowSeconds)
    .sort(
      (a, b) =>
        (a.pinRank ?? Infinity) - (b.pinRank ?? Infinity) || b.createdAt - a.createdAt,
    );
}

export function isHappeningNow(range: PinnedRange, nowMs: number) {
  const nowSeconds = nowMs / 1000;
  return range.start <= nowSeconds && nowSeconds < range.end;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(date: Date, now: Date) {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const time = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// e.g. "Today, 8:30 PM – 9:30 PM", in the phone's time zone and locale. A window that
// spans days names both days.
export function formatPinnedRange(range: PinnedRange, nowMs: number): string {
  const now = new Date(nowMs);
  const start = new Date(range.start * 1000);
  const end = new Date(range.end * 1000);
  if (startOfDay(start) === startOfDay(end)) {
    return `${dayLabel(start, now)}, ${time(start)} – ${time(end)}`;
  }
  return `${dayLabel(start, now)}, ${time(start)} – ${dayLabel(end, now)}, ${time(end)}`;
}
