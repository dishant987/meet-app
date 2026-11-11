import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  CalendarPlus,
  Captions,
  Check,
  ChevronDown,
  DoorOpen,
  Film,
  Laptop,
  Loader2,
  Lock,
  Mic,
  NotebookPen,
  Plus,
  ShieldCheck,
  Smartphone,
  Tablet,
  Video,
} from "lucide-react";
import { cn } from "cn";
import { Logo } from "@/components/Logo";
import { LandingNav } from "@/components/LandingNav";
import { useAuth } from "@/lib/auth";
import { check, joinCodeForm } from "@/lib/validation";
import { useStartMeeting } from "@/lib/useStartMeeting";
import { PeriodSwitch, PlanCards, planButton, yearlySaving, type Period } from "@/components/PlanCards";
import { Skeleton } from "@/components/ui/skeleton";
import { billingApi, type PublicPlan } from "@/lib/api";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const delay = (ms: number) => ({ ["--reveal-delay" as string]: `${ms}ms` });

/** Fades `.reveal` elements in as they scroll into view (once). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pending = () => el.querySelectorAll<HTMLElement>(".reveal:not([data-shown])");
    if (!("IntersectionObserver" in window)) return pending().forEach((x) => x.setAttribute("data-shown", ""));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    pending().forEach((x) => io.observe(x));
    // sections that load data later (pricing) add .reveal elements after the first paint: watch those too
    const mo = new MutationObserver(() => pending().forEach((x) => io.observe(x)));
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return root;
}

// ---------- hero: a small, animated picture of the product ----------

const PEOPLE = [
  { initials: "AS", name: "Asha", grad: "from-violet-400 to-fuchsia-500" },
  { initials: "RK", name: "Ravi", grad: "from-amber-300 to-orange-500" },
  { initials: "SL", name: "Sara", grad: "from-cyan-300 to-sky-500" },
  { initials: "AM", name: "Aman", grad: "from-emerald-300 to-teal-500" },
];
const LINES = [
  { who: 0, text: "Let's ship the new onboarding on Thursday." },
  { who: 1, text: "Designs are ready, I'll start on Monday." },
  { who: 2, text: "I'll finish the invite API by Wednesday." },
  { who: 3, text: "QA can test on Thursday morning." },
];

/** Captions that type themselves, one speaker after another. Reduced motion: whole lines, no typing. */
function useTypedCaptions() {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(() => (reducedMotion() ? LINES[0]!.text.length : 0));
  useEffect(() => {
    const full = LINES[line]!.text.length;
    if (reducedMotion()) {
      const t = setTimeout(() => {
        const next = (line + 1) % LINES.length;
        setLine(next);
        setChars(LINES[next]!.text.length);
      }, 3500);
      return () => clearTimeout(t);
    }
    const t =
      chars < full
        ? setTimeout(() => setChars((c) => c + 1), 38)
        : setTimeout(() => {
            setLine((l) => (l + 1) % LINES.length);
            setChars(0);
          }, 1700);
    return () => clearTimeout(t);
  }, [line, chars]);
  const current = LINES[line]!;
  return { speaker: current.who, text: current.text.slice(0, chars), typing: chars < current.text.length };
}

function ProductPreview() {
  const { speaker, text, typing } = useTypedCaptions();
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none" aria-hidden>
      {/* the call */}
      <div className="dark rounded-[1.75rem] border border-white/10 bg-ink-950 p-3 text-white shadow-2xl ring-1 shadow-brand/10 ring-white/5">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-medium">Sprint planning</span>
            <span className="text-ink-500">· 12:48</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-ink-300">
            <Captions className="size-3.5 text-brand" /> Captions on
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PEOPLE.map((p, i) => (
            <div key={p.name} className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-ink-900">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgb(255_255_255/0.06),transparent_60%)]" />
              <span
                className={cn(
                  "relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-ink-950 sm:size-14 sm:text-base",
                  p.grad,
                  speaker === i && "animate-speak",
                )}
              >
                {p.initials}
              </span>
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[10px]">
                <Mic className={cn("size-2.5", speaker === i ? "text-brand" : "text-ink-500")} /> {p.name}
              </span>
            </div>
          ))}
        </div>
        {/* live caption */}
        <div className="mt-3 min-h-[3.25rem] rounded-2xl bg-white/[0.06] px-3 py-2 text-sm leading-snug">
          <span className="mr-1.5 font-semibold text-brand">{PEOPLE[speaker]!.name}</span>
          <span className={cn(typing && "caret")}>{text}</span>
        </div>
        {/* buttons sit left so the floating notes card (bottom right) never covers them */}
        <div className="mt-3 flex items-center justify-center gap-1.5 sm:justify-start sm:pl-1">
          {[Mic, Video, Captions, NotebookPen].map((I, i) => (
            <span key={i} className="flex size-8 items-center justify-center rounded-xl bg-white/[0.07]">
              <I className="size-4" />
            </span>
          ))}
          <span className="ml-1 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold">Leave</span>
        </div>
      </div>

      {/* the notes that come out of it */}
      <div className="bob absolute -right-3 -bottom-24 hidden w-64 rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-2xl backdrop-blur sm:block lg:-right-10 xl:-right-14">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <NotebookPen className="size-3.5 text-brand-ink" /> AI notes
        </p>
        {["Ship onboarding on Thursday", "Ravi: welcome screens · Mon", "Sara: invite API · Wed"].map((t, i) => (
          <p key={t} className="tick-in flex items-center gap-2 py-1 text-sm" style={{ ["--tick-delay" as string]: `${900 + i * 450}ms` }}>
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand text-ink-950">
              <Check className="size-3" strokeWidth={3} />
            </span>
            {t}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------- sections ----------

const FEATURES = [
  { Icon: Video, title: "One-click calls", text: "Start a meeting and share the link. Guests join from the browser, no app or account." },
  { Icon: Captions, title: "Live captions", text: "Read along as people talk, in English, Hindi, Gujarati, Tamil, Spanish and more." },
  { Icon: NotebookPen, title: "AI meeting notes", text: "Summary, decisions and to-dos with owners, written for you and emailed after the call." },
  { Icon: Film, title: "Recordings", text: "Record the call, then watch it right on the notes page or download it." },
  { Icon: DoorOpen, title: "Host controls", text: "Ask-to-join waiting room, lock the meeting, mute or remove people." },
  { Icon: CalendarPlus, title: "Schedule & invite", text: "Pick a time and guests get a calendar invite with the link." },
];

const STEPS = [
  { title: "Start or schedule", text: "Open a meeting in one click, or schedule it and send invites." },
  { title: "Talk, with captions", text: "Everyone sees live captions. Record if you need to." },
  { title: "Get the notes", text: "Notes, to-dos and the recording are ready when the call ends." },
];

const FAQ = [
  {
    q: "Do my guests need an account or an app?",
    a: "No. Anyone with the link joins from their browser on a laptop, tablet or phone. An account is only needed to keep your meetings, notes and recordings in one place.",
  },
  {
    q: "Is it free?",
    a: "Yes. The Free plan is free forever: meetings, live captions and AI notes included. Pro and Business add bigger calls, unlimited recordings and more AI. Cancel any time.",
  },
  {
    q: "How does paying work?",
    a: "Pick monthly or yearly (about 2 months free) and pay securely by card through Stripe. Prices are in Indian rupees. You can switch plans or cancel from the Billing page.",
  },
  { q: "Who can see the notes and recording?", a: "Only people who were in the meeting. The host can edit the notes and email them again." },
  {
    q: "Which languages do captions support?",
    a: "English (US, UK, India), Hindi, Gujarati, Marathi, Tamil, Telugu, Spanish, French and German. Each person picks their own.",
  },
  { q: "Can I blur my background?", a: "Yes. Pick a slight or strong blur before joining or during the call. It runs on your own device." },
];

function Section({ id, eyebrow, title, intro, children, className }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24 lg:px-10", className)}>
      <div className="mx-auto max-w-6xl">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-brand-ink uppercase">{eyebrow}</p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
          {intro && <p className="mt-3 text-muted-foreground sm:text-lg">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Pricing on the landing page: the same three plan cards as the Billing page, with a monthly / yearly switch. */
function Pricing({ signedIn }: { signedIn: boolean }) {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [period, setPeriod] = useState<Period>("year");
  useEffect(() => {
    billingApi.plans().then(setPlans, () => setPlans([]));
  }, []);

  // paid plan: straight to checkout when signed in, else sign up first and continue to checkout after
  const upgradeLink = (id: string) => {
    const billing = `/billing?upgrade=${id}&period=${period}`;
    return signedIn ? billing : `/signup?next=${encodeURIComponent(billing)}`;
  };

  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple plans that grow with you"
      intro="Start free. Upgrade when your meetings get bigger. Prices in Indian rupees."
    >
      <div className="reveal mb-10 flex justify-center">
        {plans && plans.length > 0 && <PeriodSwitch value={period} onChange={setPeriod} saving={yearlySaving(plans)} />}
      </div>
      {!plans ? (
        <div role="status" aria-label="Loading plans" className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[30rem] rounded-3xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <p className="text-center text-muted-foreground">Plans couldn't load right now. Start free and see them on the Billing page.</p>
      ) : (
        <PlanCards
          className="reveal"
          plans={plans}
          period={period}
          action={(p, featured) =>
            p.id === "FREE" ? (
              <Link to={signedIn ? "/dashboard" : "/signup"} className={planButton(featured)}>
                {signedIn ? "Go to dashboard" : "Start free"}
              </Link>
            ) : p.prices ? (
              <Link to={upgradeLink(p.id)} className={planButton(featured)}>
                Get {p.name}
              </Link>
            ) : (
              <button type="button" disabled className={planButton(false)}>
                Coming soon
              </button>
            )
          }
        />
      )}
      <p className="reveal mt-8 text-center text-sm text-muted-foreground">
        Secure card payments by Stripe · Cancel any time from Billing · Guests never pay to join
      </p>
    </Section>
  );
}

function FooterColumn({ title, links }: { title: string; links: ({ href: string; label: string } | { to: string; label: string })[] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {links.map((l) => (
          <li key={l.label}>
            {"href" in l ? (
              <a href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link to={l.to} className="transition-colors hover:text-foreground">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const primaryBtn =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-ink-950 shadow-lg shadow-brand/20 transition hover:-translate-y-0.5 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:translate-y-0 disabled:opacity-60";

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { busy, start } = useStartMeeting();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const root = useReveal();

  function joinMeeting(e: FormEvent) {
    e.preventDefault();
    const result = check(joinCodeForm, { code });
    if (result.errors) return setCodeError(result.errors.code!);
    navigate(`/m/${result.data.code}`);
  }

  return (
    <div ref={root} className="min-h-dvh overflow-x-clip bg-background">
      <LandingNav />

      <main>
        {/* hero */}
        <section className="relative px-4 pt-8 pb-24 sm:px-6 sm:pt-14 sm:pb-36 lg:px-10 lg:pt-16 lg:pb-40">
          {/* starts above the section (-top-24) so it also runs behind the navbar: no seam under the bar */}
          <div className="pointer-events-none absolute inset-x-0 -top-24 bottom-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]" aria-hidden>
            <div className="drift absolute -top-32 right-[-10%] size-[38rem] rounded-full bg-brand/15 blur-3xl" />
            <div className="drift absolute top-1/2 left-[-15%] size-[28rem] rounded-full bg-sky-400/10 blur-3xl [animation-delay:-7s]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] bg-[size:48px_48px] opacity-40" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
            <div className="text-center lg:text-left">
              <p className="reveal mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <span className="size-1.5 rounded-full bg-brand" /> Free · No downloads · Works on any device
              </p>
              <h1 className="reveal text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]" style={delay(60)}>
                Meetings that{" "}
                <span className="relative whitespace-nowrap">
                  <span className="marker-draw absolute inset-x-[-0.08em] bottom-[0.06em] h-[0.38em] rounded-md bg-brand/55" aria-hidden />
                  <span className="relative">take notes</span>
                </span>{" "}
                for you.
              </h1>
              <p className="reveal mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0" style={delay(120)}>
                Start a call in one click. Live captions while you talk, clear notes with decisions and to-dos the moment you're done.
              </p>

              <div className="reveal mt-8 space-y-2" style={delay(180)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  <button type="button" onClick={start} disabled={!!busy} className={primaryBtn}>
                    {busy === "start" ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5 transition-transform group-hover:rotate-90" />}
                    New meeting
                  </button>
                  <form onSubmit={joinMeeting} className="flex flex-1 gap-2 sm:max-w-sm" noValidate>
                    <input
                      aria-label="Meeting code or link"
                      aria-invalid={!!codeError}
                      aria-describedby={codeError ? "code-error" : undefined}
                      placeholder="Enter a code or link"
                      className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-card px-4 placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none aria-invalid:border-destructive"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setCodeError("");
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!code.trim()}
                      aria-label="Join meeting"
                      className="flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40"
                    >
                      Join <ArrowRight className="size-4" />
                    </button>
                  </form>
                </div>
                {codeError && (
                  <p id="code-error" role="alert" className="text-sm text-destructive">
                    {codeError}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {user ? (
                    <>
                      Welcome back.{" "}
                      <Link to="/dashboard" className="font-medium text-foreground underline underline-offset-4">
                        Open your dashboard
                      </Link>
                    </>
                  ) : (
                    <>
                      No account needed to start.{" "}
                      <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
                        Create one
                      </Link>{" "}
                      to keep your notes.
                    </>
                  )}
                </p>
              </div>

              <ul className="reveal mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground lg:justify-start" style={delay(240)}>
                {(
                  [
                    [Laptop, "Laptop"],
                    [Tablet, "Tablet"],
                    [Smartphone, "Phone"],
                    [ShieldCheck, "In your browser"],
                  ] as const
                ).map(([Icon, label]) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <Icon className="size-4" aria-hidden /> {label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="reveal" style={delay(200)}>
              <p className="sr-only">Picture of a MeetApp call with four people, live captions, and AI notes listing decisions and to-dos.</p>
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* features */}
        <Section
          id="features"
          eyebrow="Features"
          title="Everything a meeting needs, nothing it doesn't"
          intro="Simple enough for a quick call, complete enough for your team's weekly meetings."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }, i) => (
              <li
                key={title}
                className="reveal group rounded-3xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-brand/60 hover:shadow-xl hover:shadow-brand/5"
                style={delay((i % 3) * 80)}
              >
                <span className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-brand/15 text-brand-ink transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* how it works */}
        <Section id="how" eyebrow="How it works" title="Three steps, no setup" className="bg-muted/40">
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6">
            <span className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" aria-hidden />
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal relative text-center" style={delay(i * 120)}>
                <span className="relative mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-foreground text-lg font-semibold text-background shadow-lg">
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* notes example */}
        <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="reveal">
              <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-brand-ink uppercase">After the call</p>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">From conversation to clear next steps</h2>
              <p className="mt-4 text-muted-foreground sm:text-lg">
                MeetApp turns the captions into a short summary, the decisions you made and who's doing what by when. Edit anything, copy it, or download it as
                Word or PDF.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {(
                  [
                    [NotebookPen, "Written by AI from what was actually said"],
                    [Lock, "Only people in the meeting can open it"],
                    [Film, "The recording and full transcript sit right next to it"],
                  ] as const
                ).map(([Icon, t]) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-ink">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="reveal rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-7" style={delay(120)}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Example notes</p>
                <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Notes ready</span>
              </div>
              <h3 className="text-xl font-semibold">Sprint planning</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The team agreed to ship the new onboarding on Thursday. Designs are done; the invite API needs two more days.
              </p>
              <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">To-dos</p>
              <ul className="divide-y divide-border">
                {[
                  ["Build the welcome screens", "Ravi", "Mon"],
                  ["Finish the invite API", "Sara", "Wed"],
                  ["Test the release", "Aman", "Thu"],
                ].map(([task, owner, due]) => (
                  <li key={task} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="size-4 rounded-md border border-border" aria-hidden />
                    <span className="min-w-0 flex-1">{task}</span>
                    <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-xs font-medium">{owner}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{due}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Pricing signedIn={!!user} />

        {/* FAQ */}
        <Section id="faq" eyebrow="FAQ" title="Questions people ask" className="bg-muted/40">
          <div className="mx-auto max-w-3xl space-y-3">
            {FAQ.map((f, i) => (
              <details key={f.q} className="reveal group rounded-2xl border border-border bg-card px-5 open:shadow-sm" style={delay(i * 60)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl py-4 font-medium focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* final call to action */}
        <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
          <div className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-6 py-14 text-center text-white shadow-2xl ring-1 ring-brand/10 sm:px-12 sm:py-20">
            <div className="drift pointer-events-none absolute -top-24 left-1/3 size-[30rem] rounded-full bg-brand/25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] bg-[size:40px_40px]"
              aria-hidden
            />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Your next meeting can write its own notes</h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-300 sm:text-lg">Start one now. It takes a single click and works on any device.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={start} disabled={!!busy} className={cn(primaryBtn, "focus-visible:ring-offset-ink-950")}>
                  {busy === "start" ? <Loader2 className="size-5 animate-spin" /> : <Video className="size-5" />} Start a meeting
                </button>
                {!user && (
                  <Link
                    to="/signup"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-5 font-semibold text-white transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                  >
                    Create a free account <ArrowRight className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 pt-14 pb-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div className="space-y-3">
              <Logo />
              <p className="max-w-xs text-sm text-muted-foreground">Video meetings with live captions, AI notes and recordings. Free, in your browser, on any device.</p>
            </div>
            <FooterColumn
              title="Product"
              links={[
                { href: "#features", label: "Features" },
                { href: "#how", label: "How it works" },
                { href: "#pricing", label: "Pricing" },
                { href: "#faq", label: "FAQ" },
              ]}
            />
            <FooterColumn
              title="Account"
              links={
                user
                  ? [
                      { to: "/dashboard", label: "Dashboard" },
                      { to: "/meetings", label: "My meetings" },
                      { to: "/profile", label: "Profile" },
                    ]
                  : [
                      { to: "/signup", label: "Create account" },
                      { to: "/signin", label: "Sign in" },
                      { to: "/forgot-password", label: "Forgot password" },
                    ]
              }
            />
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} MeetApp. All rights reserved.</p>
            <a href="#top" onClick={(e) => (e.preventDefault(), scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }))} className="hover:text-foreground">
              Back to top ↑
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
