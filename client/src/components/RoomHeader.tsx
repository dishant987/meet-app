import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Check, Link2 } from "lucide-react";
import type { Meeting } from "@/lib/api";
import { Logo } from "@/components/Logo";

export function RoomHeader({ meeting }: { meeting: Meeting }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Copy the link from the address bar instead.");
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link to="/" aria-label="MeetApp home" className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
        <Logo />
      </Link>
      <button
        type="button"
        onClick={copyLink}
        aria-label={copied ? "Link copied" : `Copy link for ${meeting.title}`}
        className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-ink-300 hover:border-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        {copied ? <Check className="size-4 text-brand" /> : <Link2 className="size-4" />}
        <span className="hidden font-mono sm:inline">{copied ? "Copied!" : meeting.roomCode}</span>
      </button>
    </header>
  );
}
