import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarClock, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/call/Avatar";
import { useAuth } from "@/lib/auth";

/** Header corner: "Sign in" for guests; avatar menu (My meetings, Sign out) for signed-in people. */
export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Avatar name={user.name} size="sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl p-2">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Link
          to="/meetings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <CalendarClock className="size-4" /> My meetings
        </Link>
        <button
          type="button"
          onClick={async () => {
            setOpen(false);
            await logout();
            navigate("/");
          }}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}
