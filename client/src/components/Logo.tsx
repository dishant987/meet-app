/** Brand mark: a lime "signal" square with sound waves. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-[0.65rem] bg-brand text-ink-950" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 10v4M10 7v10M14 9v6M18 11v2" />
        </svg>
      </span>
      {!compact && <span className="text-lg font-semibold tracking-tight">MeetApp</span>}
    </span>
  );
}
