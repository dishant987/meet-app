// Calendar invites (.ics, RFC 5545). Sent as a "REQUEST", Gmail / Outlook / Apple Calendar show
// "Add to calendar" with Yes / No / Maybe, in each guest's own time zone (times are stored in UTC).

/** 2026-11-11T05:30:00.000Z -> 20261111T053000Z */
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Text values: escape \ ; , and new lines. */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes are folded: CRLF + one space, as the standard asks. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--; // don't split multi-byte characters
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export type CalendarEvent = {
  uid: string; // same uid for every guest of one meeting
  start: Date;
  minutes: number;
  title: string;
  description: string;
  url: string;
  organizer: { name: string; email: string };
  attendee: string;
  /** 0 for the first invite; bigger on every change so calendars update the same event. */
  sequence?: number;
  /** REQUEST = invite or update; CANCEL = remove it from the guest's calendar. */
  method?: "REQUEST" | "CANCEL";
  /** Recurring series: how it repeats, and occurrences that were cancelled. */
  repeat?: { freq: "DAILY" | "WEEKLY"; count: number; skip?: Date[] };
  /** Cancel just one occurrence of a series (its start time). */
  occurrence?: Date;
};

export function inviteIcs(e: CalendarEvent, now = new Date()) {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const cancel = e.method === "CANCEL";
  return (
    [
      "BEGIN:VCALENDAR",
      "PRODID:-//MeetApp//Meeting invite//EN",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      `METHOD:${cancel ? "CANCEL" : "REQUEST"}`,
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsTime(now)}`,
      ...(e.occurrence ? [`RECURRENCE-ID:${icsTime(e.occurrence)}`] : []),
      `DTSTART:${icsTime(e.occurrence ?? e.start)}`,
      `DTEND:${icsTime(e.occurrence ? new Date(e.occurrence.getTime() + e.minutes * 60_000) : end)}`,
      ...(e.repeat && !e.occurrence ? [`RRULE:FREQ=${e.repeat.freq};COUNT=${e.repeat.count}`] : []),
      ...(e.repeat?.skip?.length && !e.occurrence ? [`EXDATE:${e.repeat.skip.map(icsTime).join(",")}`] : []),
      `SUMMARY:${icsText(e.title)}`,
      `DESCRIPTION:${icsText(e.description)}`,
      `LOCATION:${icsText(e.url)}`,
      `URL:${e.url}`,
      `ORGANIZER;CN=${icsText(e.organizer.name)}:mailto:${e.organizer.email}`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e.attendee}`,
      `SEQUENCE:${e.sequence ?? 0}`,
      `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
      ...(cancel ? [] : ["BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Meeting starts in 10 minutes", "END:VALARM"]),
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}

/** "Tuesday 12 November, 15:30 GMT+5:30" in the host's time zone (falls back to UTC for unknown zones). */
export function formatWhen(start: Date, timeZone?: string) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timeZone || "UTC" }).format(start);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(start);
  }
}
