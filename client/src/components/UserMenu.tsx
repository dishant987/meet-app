import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarClock, Loader2, LogOut, UserRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/call/Avatar";
import { useAuth } from "@/lib/auth";
import { assetUrl } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Header corner: theme switch, then "Sign in" for guests or the avatar menu for signed-in people. */
export function UserMenu() {
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <AccountMenu />
    </div>
  );
}

function AccountMenu() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  if (loading) return <span className="size-10" aria-hidden />;

  if (!user)
    return (
      <Link
        to="/signin"
        className="flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        Sign in
      </Link>
    );

  async function signOut() {
    setSigningOut(true);
    // Go home first: pages that need an account (My meetings, Profile) would otherwise redirect to Sign in
    // the moment the user disappears.
    navigate("/", { flushSync: true }); // apply now, not as a low-priority update
    await logout();
    setSigningOut(false);
    setConfirmOut(false);
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Avatar name={user.name} size="sm" src={assetUrl(user.avatarUrl)} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl p-2">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Link
          to="/profile"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <UserRound className="size-4" /> Profile
        </Link>
        <Link
          to="/meetings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <CalendarClock className="size-4" /> My meetings
        </Link>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmOut(true); // ask first
          }}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </PopoverContent>
    </Popover>

    <AlertDialog open={confirmOut} onOpenChange={(o) => !signingOut && setConfirmOut(o)}>
      <AlertDialogContent className="rounded-3xl sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll need to sign in again to see your meetings, notes and recordings on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={signingOut} className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={signingOut}
            onClick={(e) => {
              e.preventDefault(); // keep the dialog open until sign-out finishes
              void signOut();
            }}
            className="rounded-xl bg-red-500 text-white hover:bg-red-600"
          >
            {signingOut && <Loader2 className="size-4 animate-spin" />} Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
