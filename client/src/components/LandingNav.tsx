import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { cn } from "cn";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "@/components/UserMenu";
import { useAuth } from "@/lib/auth";

const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

/** Which section is in the middle of the screen right now. */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    const top = () => scrollY < 200 && setActive(null);
    addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener("scroll", top);
    };
  }, []);
  return active;
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return scrolled;
}

/**
 * The section links, with one soft highlight that slides to the link under the mouse
 * (or rests on the section you're reading).
 */
function SectionLinks({ active }: { active: string | null }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const target = hovered ?? active;

  useEffect(() => {
    const el = target ? refs.current[target] : null;
    setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [target]);

  return (
    <nav
      aria-label="Sections"
      onMouseLeave={() => setHovered(null)}
      className="relative hidden items-center rounded-full border border-border/70 bg-foreground/[0.04] p-1 text-sm shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-md md:flex"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 rounded-full transition-all duration-300 ease-out",
          hovered && hovered !== active ? "bg-foreground/[0.08]" : "bg-foreground/[0.1] shadow-sm ring-1 ring-foreground/10",
          box ? "opacity-100" : "opacity-0",
        )}
        style={box ? { left: box.left, width: box.width } : undefined}
      />
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          ref={(el) => {
            refs.current[s.id] = el;
          }}
          href={`#${s.id}`}
          onMouseEnter={() => setHovered(s.id)}
          onFocus={() => setHovered(s.id)}
          onBlur={() => setHovered(null)}
          aria-current={active === s.id ? "true" : undefined}
          className={cn(
            "relative rounded-full px-4 py-1.5 font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
            target === s.id ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

const ghost =
  "inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";
const cta =
  "group inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-ink-950 shadow-sm shadow-brand/30 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/** Landing page navigation: a floating bar that firms up once you scroll, with a full menu on phones. */
export function LandingNav() {
  const { user, loading } = useAuth();
  const active = useActiveSection();
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const account = loading ? (
    <Skeleton className="h-10 w-28 rounded-xl" />
  ) : user ? (
    <>
      <Link to="/dashboard" className={cn(ghost, "hidden border border-border bg-card sm:inline-flex")}>
        <LayoutDashboard className="size-4" aria-hidden /> Dashboard
      </Link>
      <AccountMenu />
    </>
  ) : (
    <>
      <Link to="/signin" className={cn(ghost, "hidden sm:inline-flex")}>
        Sign in
      </Link>
      <Link to="/signup" className={cn(cta, "hidden sm:inline-flex")}>
        Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border px-3 py-2 transition-all duration-300 sm:px-4",
          scrolled || open
            ? "border-border bg-background/80 shadow-lg shadow-black/5 backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Link to="/" aria-label="MeetApp home" onClick={() => scrollTo({ top: 0 })} className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <Logo />
        </Link>

        <SectionLinks active={active} />

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {account}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-card focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* phones: sections + account in a panel under the bar */}
      {open && (
        <div id="landing-menu" className="animate-in fade-in slide-in-from-top-2 mx-auto mt-2 max-w-6xl rounded-2xl border border-border bg-background/95 p-2 shadow-xl backdrop-blur-xl duration-200 md:hidden">
          <nav aria-label="Sections" className="flex flex-col">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-medium hover:bg-muted">
                {s.label}
              </a>
            ))}
          </nav>
          <div className="mt-2 grid gap-2 border-t border-border pt-3 sm:hidden">
            {user ? (
              <Link to="/dashboard" className={cn(cta, "h-11 justify-center")}>
                Open dashboard <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link to="/signup" className={cn(cta, "h-11 justify-center")}>
                  Get started <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link to="/signin" className={cn(ghost, "h-11 justify-center border border-border")}>
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
