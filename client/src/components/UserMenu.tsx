import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useNavigate } from "react-router";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { LayoutDashboardIcon, type LayoutDashboardIconHandle } from "@animateicons/react/lucide/layout-dashboard-icon";
import { CalendarClockIcon } from "@animateicons/react/lucide/calendar-clock-icon";
import { UserRoundIcon } from "@animateicons/react/lucide/user-round-icon";
import { LogOutIcon, type LogOutIconHandle } from "@animateicons/react/lucide/log-out-icon";
import { useIconHover } from "@/lib/useIconHover";
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

/** Header corner: theme switch, then "Sign in" for guests or Dashboard + the avatar menu for signed-in people. */
export function UserMenu() {
  const { user } = useAuth();
  const dash = useIconHover<LayoutDashboardIconHandle>();
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      {user && (
        <Link
          to="/dashboard"
          {...dash.hover}
          className="hidden h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none sm:flex"
        >
          <LayoutDashboardIcon ref={dash.ref} size={16} className="flex" /> Dashboard
        </Link>
      )}
      <AccountMenu />
    </div>
  );
}

/** Account menu. "avatar": just the photo (page headers). "sidebar": photo, name and email in a full-width row. */
export function AccountMenu({ variant = "avatar" }: { variant?: "avatar" | "sidebar" }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  if (loading) return variant === "sidebar" ? <Skeleton className="h-14 w-full rounded-xl" /> : <Skeleton className="size-9 rounded-xl" />;

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
        {variant === "sidebar" ? (
          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <Avatar name={user.name} size="sm" src={assetUrl(user.avatarUrl)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <Avatar name={user.name} size="sm" src={assetUrl(user.avatarUrl)} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        className="w-64 gap-0.5 rounded-2xl p-2"
      >
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        {/* the sidebar already lists these pages; the header menu needs them */}
        {variant !== "sidebar" && MENU.map((item) => <MenuLink key={item.to} {...item} onClick={() => setOpen(false)} />)}
        <SignOutItem
          onClick={() => {
            setOpen(false);
            setConfirmOut(true); // ask first
          }}
        />
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

const MENU = [
  { to: "/dashboard", Icon: LayoutDashboardIcon, label: "Dashboard" },
  { to: "/meetings", Icon: CalendarClockIcon, label: "My meetings" },
  { to: "/profile", Icon: UserRoundIcon, label: "Profile" },
];
const menuRow =
  "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

function MenuLink({ to, Icon, label, onClick }: (typeof MENU)[number] & { onClick: () => void }) {
  const { ref, hover } = useIconHover<LayoutDashboardIconHandle>();
  return (
    <Link to={to} onClick={onClick} {...hover} className={menuRow}>
      <Icon ref={ref} size={16} className="flex" /> {label}
    </Link>
  );
}

function SignOutItem({ onClick }: { onClick: () => void }) {
  const { ref, hover } = useIconHover<LogOutIconHandle>();
  return (
    <button type="button" onClick={onClick} {...hover} className={menuRow}>
      <LogOutIcon ref={ref} size={16} className="flex" /> Sign out
    </button>
  );
}
