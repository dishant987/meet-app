import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { Loader2, Menu, X } from "lucide-react";
import { HouseIcon, type HouseIconHandle } from "@animateicons/react/lucide/house-icon";
import { CalendarClockIcon } from "@animateicons/react/lucide/calendar-clock-icon";
import { UserRoundIcon } from "@animateicons/react/lucide/user-round-icon";
import { PlusIcon, type PlusIconHandle } from "@animateicons/react/lucide/plus-icon";
import { cn } from "cn";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "@/components/UserMenu";
import { useAuth } from "@/lib/auth";
import { useStartMeeting } from "@/lib/useStartMeeting";
import { useIconHover } from "@/lib/useIconHover";

const NAV = [
  { to: "/dashboard", label: "Home", Icon: HouseIcon },
  { to: "/meetings", label: "Meetings", Icon: CalendarClockIcon },
  { to: "/profile", label: "Profile", Icon: UserRoundIcon },
];

/** One sidebar link; hovering anywhere on the row plays its icon. */
function NavItem({ to, label, Icon, onNavigate }: (typeof NAV)[number] & { onNavigate?: () => void }) {
  const { ref, hover } = useIconHover<HouseIconHandle>();
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      {...hover}
      className={({ isActive }) =>
        cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
          isActive
            ? "relative bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2.5 before:-left-3 before:w-1 before:rounded-r-full before:bg-brand"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )
      }
    >
      <Icon ref={ref} size={18} className="flex shrink-0" />
      {label}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { busy, start } = useStartMeeting();
  const plus = useIconHover<PlusIconHandle>();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link
        to="/dashboard"
        onClick={onNavigate}
        aria-label="MeetApp dashboard"
        className="self-start rounded-xl px-1.5 py-1 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <Logo />
      </Link>

      <button
        type="button"
        onClick={start}
        disabled={!!busy}
        {...plus.hover}
        className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
      >
        {busy === "start" ? <Loader2 className="size-4 animate-spin" /> : <PlusIcon ref={plus.ref} size={16} className="flex" />} New meeting
      </button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-sidebar-border pt-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <AccountMenu variant="sidebar" />
      </div>
    </div>
  );
}

/** Signed-in area: sidebar on desktop, a slide-out menu on phones. Sends signed-out visitors to Sign in. */
export function AppShell() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!loading && !user) return <Navigate to={`/signin?next=${encodeURIComponent(pathname)}`} replace />;

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
        <Sidebar />
      </aside>

      {/* phones */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <aside className="animate-in slide-in-from-left duration-200 absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex size-10 items-center justify-center rounded-xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/dashboard" aria-label="MeetApp dashboard">
            <Logo />
          </Link>
          <AccountMenu />
        </header>
        <main className="flex-1">{user ? <Outlet /> : <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" />}</main>
      </div>
    </div>
  );
}
