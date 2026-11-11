import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MailWarning } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Shown in the signed-in area until the account's email is confirmed. */
export function ConfirmEmailBanner() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified) return null;

  async function resend() {
    setBusy(true);
    try {
      const { data } = await api.post<{ data: { alreadyVerified: boolean } }>("/auth/resend-verification");
      if (data.data.alreadyVerified) {
        setUser({ ...user!, emailVerified: true });
        toast.success("Your email is already confirmed.");
      } else toast.success(`New link sent to ${user!.email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-10">
      <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <MailWarning className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-medium">Confirm your email.</span>{" "}
          <span className="text-muted-foreground">
            We sent a link to <span className="font-medium break-all text-foreground">{user.email}</span>. You need it to send invites and get notes by email.
          </span>
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Resend link
        </button>
      </div>
    </div>
  );
}
