import { Suspense, useEffect, useState } from "react";
import { PageLoading } from "@/components/PageLoading";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { Loader2, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
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

const COLLAPSED_KEY = "meetapp-sidebar-collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** One sidebar link; hovering anywhere on the row plays its icon. Collapsed: icon only, name on hover. */
function NavItem({ to, label, Icon, onNavigate, collapsed }: (typeof NAV)[number] & { onNavigate?: () => void; collapsed?: boolean }) {
  const { ref, hover } = useIconHover<HouseIconHandle>();
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      {...hover}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
          collapsed && "justify-center px-0",
          isActive
            ? "relative bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2.5 before:-left-3 before:w-1 before:rounded-r-full before:bg-brand"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )
      }
    >
      <Icon ref={ref} size={18} className="flex shrink-0" />
      {!collapsed && label}
    </NavLink>
  );
}

const iconBtn =
  "flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

function Sidebar({ onNavigate, collapsed = false, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const { busy, start } = useStartMeeting();
  const plus = useIconHover<PlusIconHandle>();
  const toggle = onToggle && (
    <button type="button" onClick={onToggle} className={iconBtn} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
    </button>
  );
  return (
    <div className={cn("flex h-full flex-col gap-4 p-3", collapsed && "items-stretch px-2")}>
      <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-between")}>
        <Link
          to="/dashboard"
          onClick={onNavigate}
          aria-label="MeetApp dashboard"
          className="rounded-xl px-1.5 py-1 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Logo compact={collapsed} />
        </Link>
        {toggle}
      </div>

      <button
        type="button"
        onClick={start}
        disabled={!!busy}
        {...plus.hover}
        aria-label={collapsed ? "New meeting" : undefined}
        title={collapsed ? "New meeting" : undefined}
        className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-ink-950 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
      >
        {busy === "start" ? <Loader2 className="size-4 animate-spin" /> : <PlusIcon ref={plus.ref} size={16} className="flex" />}
        {!collapsed && "New meeting"}
      </button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} collapsed={collapsed} />
        ))}
      </nav>

      <div className={cn("mt-auto space-y-2 border-t border-sidebar-border pt-3", collapsed && "flex flex-col items-center")}>
        <div className={cn("flex items-center justify-between px-1", collapsed && "px-0")}>
          {!collapsed && <span className="text-xs text-muted-foreground">Theme</span>}
          <ThemeToggle />
        </div>
        <AccountMenu variant={collapsed ? "avatar" : "sidebar"} />
      </div>
    </div>
  );
}

/** Signed-in area: sidebar on desktop, a slide-out menu on phones. Sends signed-out visitors to Sign in. */
export function AppShell() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !c;
    });

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!loading && !user) return <Navigate to={`/signin?next=${encodeURIComponent(pathname)}`} replace />;

  return (
    <div className="flex min-h-dvh bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:block",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
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
        <main className="flex-1">
          {/* the page area loads on its own, so the sidebar stays put while switching pages */}
          {user ? (
            <Suspense fallback={<PageLoading inline />}>
              <Outlet />
            </Suspense>
          ) : (
            <PageLoading inline />
          )}
        </main>
      </div>
    </div>
  );
}
