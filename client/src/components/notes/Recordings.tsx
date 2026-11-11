import { useEffect, useState, type SyntheticEvent } from "react";
import { Download, Film, VideoOff } from "lucide-react";
import { meetingsApi, type RecordingInfo } from "@/lib/api";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const size = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

/**
 * Recordings made in the browser (WebM) don't store their length, so the player shows no time bar.
 * Jumping to the very end once makes the browser work it out; then we go back to the start.
 */
function fixLength(e: SyntheticEvent<HTMLVideoElement>) {
  const v = e.currentTarget;
  if (Number.isFinite(v.duration)) return;
  const back = () => {
    if (!Number.isFinite(v.duration)) return;
    v.removeEventListener("durationchange", back);
    v.currentTime = 0;
  };
  v.addEventListener("durationchange", back);
  v.currentTime = 1e101;
}

/** Meeting recordings: watch right here, or download. Says so when the meeting wasn't recorded. */
export function Recordings({ roomCode, headers, isHost }: { roomCode: string; headers: Record<string, string>; isHost: boolean }) {
  const [recs, setRecs] = useState<RecordingInfo[] | null>(null);
  useEffect(() => {
    meetingsApi
      .recordings(roomCode, headers)
      .then(setRecs)
      .catch(() => setRecs([])); // recordings are optional; the notes still show
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers come from localStorage; load once
  }, [roomCode]);
  if (!recs) return null; // still loading: no flash of the empty message
  if (recs.length === 0)
    return (
      <section className="mb-4 flex items-center gap-3 rounded-3xl border border-dashed border-border p-4 text-sm text-muted-foreground print:hidden">
        <VideoOff className="size-5 shrink-0" aria-hidden />
        <p>
          This meeting wasn't recorded.
          {isHost && " Next time, press Record in the call and the video shows up here to watch or download."}
        </p>
      </section>
    );

  return (
    <section className="mb-4 rounded-3xl border border-border bg-card p-5 sm:p-6 print:hidden">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <Film className="size-4" /> Recording{recs.length > 1 && "s"}
      </h2>
      <div className="space-y-4">
        {recs.map((r, i) => (
          <div key={r.id} className="space-y-2">
            {/* links expire after 1 hour; reloading the page makes new ones */}
            <video controls preload="metadata" src={r.playUrl} onLoadedMetadata={fixLength} className="aspect-video w-full rounded-2xl bg-black" />
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {recs.length > 1 && `Part ${i + 1} · `}
                {mmss(r.durationSec)} · {size(r.sizeBytes)}
              </span>
              <a
                href={r.downloadUrl}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 font-medium text-foreground hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <Download className="size-4" /> Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
