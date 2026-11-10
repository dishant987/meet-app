import { useEffect, useState } from "react";
import { Download, Film } from "lucide-react";
import { meetingsApi, type RecordingInfo } from "@/lib/api";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const size = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

/** Meeting recordings with a player and a download link. Shows nothing if there are none. */
export function Recordings({ roomCode, headers }: { roomCode: string; headers: Record<string, string> }) {
  const [recs, setRecs] = useState<RecordingInfo[]>([]);
  useEffect(() => {
    meetingsApi
      .recordings(roomCode, headers)
      .then(setRecs)
      .catch(() => setRecs([])); // recordings are optional; the notes still show
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers come from localStorage; load once
  }, [roomCode]);
  if (recs.length === 0) return null;

  return (
    <section className="mb-4 rounded-3xl border border-border bg-card p-5 sm:p-6 print:hidden">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <Film className="size-4" /> Recording{recs.length > 1 && "s"}
      </h2>
      <div className="space-y-4">
        {recs.map((r, i) => (
          <div key={r.id} className="space-y-2">
            {/* links expire after 1 hour; reloading the page makes new ones */}
            <video controls preload="metadata" src={r.playUrl} className="aspect-video w-full rounded-2xl bg-black" />
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
