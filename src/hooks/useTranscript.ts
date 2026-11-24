import { useEffect, useState } from "react";
import type { TranscriptLine } from "@/data/media";
import { getTranscript } from "@/data/mediaDownloads";

export type TranscriptResult =
  | { lines: TranscriptLine[]; error: null }
  | { lines: null; error: string };

type StoredResult = TranscriptResult & { mediaId: number };

// The lesson's transcript: the saved copy when downloaded, otherwise fetched.
// null while loading.
export function useTranscript(mediaId: number, fileJsonId: number): TranscriptResult | null {
  const [result, setResult] = useState<StoredResult | null>(null);

  useEffect(() => {
    if (!Number.isFinite(mediaId) || !Number.isFinite(fileJsonId)) return;
    let cancelled = false;
    getTranscript(mediaId, fileJsonId).then(
      (data) => {
        if (!cancelled) setResult({ mediaId, lines: data.json, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : "Couldn't load the transcript.";
        setResult({ mediaId, lines: null, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mediaId, fileJsonId]);

  // Ignore a result left over from a different lesson.
  return result?.mediaId === mediaId ? result : null;
}
