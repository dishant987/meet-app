// Demo account with realistic data, for trying the app LOCALLY.
// Usage (server folder):  npm run seed:demo
// Running it again resets the demo account's meetings. Refuses any database that isn't on this computer.
import { randomBytes, randomInt } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to seed: DATABASE_URL points at "${host || "nothing"}", not this computer. Demo data is for local use only.`);
  process.exit(1);
}

const { prisma } = await import("../src/config/db.js");
const { hashPassword } = await import("../src/services/auth.service.js");

const EMAIL = "worldhello2982@gmail.com";
const PASSWORD = "MeetApp@2026";
const NAME = "World Hello";

const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + randomInt(26))).join("");
const code = () => `${letters(3)}-${letters(4)}-${letters(3)}`;
const key = () => randomBytes(24).toString("base64url");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (daysFromNow: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function upsertUser(email: string, name: string, password?: string) {
  const passwordHash = password ? await hashPassword(password) : null;
  return prisma.user.upsert({
    where: { email },
    update: { name, ...(passwordHash && { passwordHash, sessionVersion: { increment: 1 } }) },
    create: { email, name, passwordHash },
  });
}

const me = await upsertUser(EMAIL, NAME, PASSWORD);
const ravi = await upsertUser("ravi.demo@example.com", "Ravi Kumar");
const sara = await upsertUser("sara.demo@example.com", "Sara Lee");

// a real recording made earlier with this account (video file in B2) is kept and re-attached below
const keptRecording = await prisma.recording.findFirst({
  where: { status: "READY", meeting: { hostId: me.id } },
  orderBy: { createdAt: "desc" },
  select: { storageKey: true, mimeType: true, sizeBytes: true, durationSec: true },
});

// start clean: the demo users' own meetings (and everything under them) go
await prisma.meeting.deleteMany({ where: { hostId: { in: [me.id, ravi.id, sara.id] } } });

type Line = [speaker: string, text: string];
type Past = {
  title: string;
  daysAgo: number;
  hour: number;
  minutes: number;
  people: string[];
  lines: Line[];
  notes?: { title: string; summary: string; keyPoints: string[]; decisions: string[]; actionItems: { task: string; owner: string | null; dueDate: string | null }[]; openQuestions: string[] };
  notesStatus?: "READY" | "FAILED" | "EMPTY";
};

const past: Past[] = [
  {
    title: "Sprint 24 planning",
    daysAgo: 1,
    hour: 10,
    minutes: 42,
    people: ["Ravi Kumar", "Sara Lee", "Aman Shah"],
    lines: [
      ["World Hello", "Let's lock the scope for sprint 24. The big item is the new onboarding flow."],
      ["Ravi Kumar", "Design is ready. I can start on the welcome screens on Monday."],
      ["Sara Lee", "Backend needs two days for the invite API before Ravi can wire it up."],
      ["Aman Shah", "QA wants the release on Thursday so we have Friday for fixes."],
      ["World Hello", "Agreed. Thursday release, onboarding first, then the settings page if time allows."],
    ],
    notes: {
      title: "Sprint 24 planning",
      summary: "The team agreed the scope for sprint 24: the new onboarding flow first, the settings page only if time allows. Release is set for Thursday so Friday stays free for fixes.",
      keyPoints: ["Onboarding designs are finished and ready to build", "Invite API needs about two days of backend work", "QA asked for a Thursday release"],
      decisions: ["Release on Thursday", "Onboarding comes before the settings page"],
      actionItems: [
        { task: "Build the welcome screens", owner: "Ravi Kumar", dueDate: "Monday" },
        { task: "Finish the invite API", owner: "Sara Lee", dueDate: "Wednesday" },
        { task: "Prepare the Thursday test plan", owner: "Aman Shah", dueDate: "Wednesday" },
      ],
      openQuestions: ["Does the settings page fit in this sprint?"],
    },
  },
  {
    title: "Customer call: Acme Corp",
    daysAgo: 2,
    hour: 15,
    minutes: 28,
    people: ["Priya (Acme)", "Sara Lee"],
    lines: [
      ["Priya (Acme)", "Our team loves the live captions, but we need notes in Hindi too."],
      ["World Hello", "Captions already work in Hindi. We can look at Hindi notes next month."],
      ["Sara Lee", "We'll also send a short guide for setting up recordings."],
    ],
    notes: {
      title: "Acme Corp check-in",
      summary: "Acme is happy with live captions and asked for meeting notes in Hindi. We will look at Hindi notes next month and send them a recordings setup guide.",
      keyPoints: ["Acme uses live captions every day", "They need notes in Hindi"],
      decisions: ["Look into Hindi notes next month"],
      actionItems: [{ task: "Send the recordings setup guide", owner: "Sara Lee", dueDate: "Friday" }],
      openQuestions: [],
    },
  },
  {
    title: "Design review: dashboard",
    daysAgo: 4,
    hour: 11,
    minutes: 55,
    people: ["Ravi Kumar", "Neha Gupta"],
    lines: [
      ["Neha Gupta", "The new dashboard shows the next meeting right at the top."],
      ["Ravi Kumar", "On phones the stats should stack in two columns."],
      ["World Hello", "Looks great. Let's ship it after the accessibility check."],
    ],
    notes: {
      title: "Dashboard design review",
      summary: "The new dashboard was approved. On phones the stats stack in two columns. It ships after an accessibility check.",
      keyPoints: ["Next meeting shown at the top", "Two-column stats on phones"],
      decisions: ["Ship after the accessibility check"],
      actionItems: [{ task: "Run the accessibility check", owner: "Neha Gupta", dueDate: null }],
      openQuestions: ["Should the dashboard remember the last filter?"],
    },
  },
  {
    title: "Weekly 1:1 with Ravi",
    daysAgo: 6,
    hour: 9,
    minutes: 24,
    people: ["Ravi Kumar"],
    lines: [
      ["Ravi Kumar", "I'd like to lead the mobile app work next quarter."],
      ["World Hello", "Good idea. Write a short plan and we'll review it together."],
    ],
    notes: {
      title: "1:1 with Ravi",
      summary: "Ravi wants to lead the mobile app work next quarter and will write a short plan to review together.",
      keyPoints: ["Ravi is interested in leading mobile"],
      decisions: [],
      actionItems: [{ task: "Write a one-page mobile plan", owner: "Ravi Kumar", dueDate: "Next 1:1" }],
      openQuestions: [],
    },
  },
  {
    title: "Hiring sync",
    daysAgo: 8,
    hour: 16,
    minutes: 31,
    people: ["Sara Lee", "Aman Shah"],
    lines: [
      ["Sara Lee", "We have three strong frontend candidates this week."],
      ["Aman Shah", "I can run the take-home review on Tuesday."],
    ],
    notes: {
      title: "Hiring sync",
      summary: "Three frontend candidates are in the pipeline. Aman reviews take-home tasks on Tuesday.",
      keyPoints: ["Three strong frontend candidates"],
      decisions: ["Aman owns the take-home reviews"],
      actionItems: [{ task: "Review take-home tasks", owner: "Aman Shah", dueDate: "Tuesday" }],
      openQuestions: ["Do we hire one or two people?"],
    },
  },
  { title: "Quick catch-up", daysAgo: 10, hour: 13, minutes: 6, people: ["Neha Gupta"], lines: [], notesStatus: "EMPTY" },
  {
    title: "Marketing launch plan",
    daysAgo: 13,
    hour: 14,
    minutes: 47,
    people: ["Sara Lee", "Neha Gupta", "Aman Shah"],
    lines: [
      ["Neha Gupta", "Launch post goes out on the 20th with a short demo video."],
      ["World Hello", "Let's also email our waitlist the same morning."],
    ],
    notes: {
      title: "Launch plan",
      summary: "The launch post goes out on the 20th with a demo video, and the waitlist gets an email the same morning.",
      keyPoints: ["Launch on the 20th", "Demo video ready by the 18th"],
      decisions: ["Email the waitlist on launch morning"],
      actionItems: [
        { task: "Record the demo video", owner: "Neha Gupta", dueDate: "18th" },
        { task: "Write the waitlist email", owner: "World Hello", dueDate: "19th" },
      ],
      openQuestions: [],
    },
  },
  { title: "Vendor demo", daysAgo: 17, hour: 12, minutes: 19, people: ["Aman Shah"], lines: [["Aman Shah", "Their pricing starts at ten dollars per seat."]], notesStatus: "FAILED" },
  {
    title: "Quarterly review Q3",
    daysAgo: 24,
    hour: 10,
    minutes: 64,
    people: ["Ravi Kumar", "Sara Lee", "Aman Shah", "Neha Gupta"],
    lines: [
      ["World Hello", "Q3 revenue grew 18 percent and churn went down."],
      ["Sara Lee", "Support tickets dropped after the captions update."],
    ],
    notes: {
      title: "Q3 review",
      summary: "Q3 revenue grew 18% with lower churn. Support tickets dropped after the captions update.",
      keyPoints: ["Revenue up 18%", "Churn went down", "Fewer support tickets"],
      decisions: ["Keep investing in captions"],
      actionItems: [{ task: "Share the Q3 report with the board", owner: "World Hello", dueDate: "End of month" }],
      openQuestions: ["What's the Q4 hiring budget?"],
    },
  },
];

let count = 0;
for (const p of past) {
  const startedAt = at(-p.daysAgo, p.hour);
  const endedAt = new Date(startedAt.getTime() + p.minutes * 60_000);
  const m = await prisma.meeting.create({
    data: { title: p.title, roomCode: code(), hostKey: key(), hostId: me.id, status: "ENDED", createdAt: startedAt, startedAt, endedAt },
  });
  const participants = new Map<string, string>();
  for (const name of [NAME, ...p.people]) {
    const user = name === NAME ? me : name === "Ravi Kumar" ? ravi : name === "Sara Lee" ? sara : null;
    const row = await prisma.participant.create({ data: { meetingId: m.id, name, userId: user?.id, isHost: name === NAME, joinedAt: startedAt } });
    participants.set(name, row.id);
  }
  await prisma.transcript.createMany({
    data: p.lines.map(([speaker, text], i) => ({
      meetingId: m.id,
      participantId: participants.get(speaker)!,
      speakerName: speaker,
      text,
      spokenAt: new Date(startedAt.getTime() + (i + 1) * 60_000),
    })),
  });
  await prisma.notes.create({
    data: p.notes
      ? { meetingId: m.id, status: "READY", provider: "demo", ...p.notes, createdAt: endedAt }
      : { meetingId: m.id, status: p.notesStatus ?? "EMPTY", error: p.notesStatus === "FAILED" ? "Demo: the AI service was busy" : null },
  });
  if (keptRecording && p.title === "Sprint 24 planning") await prisma.recording.create({ data: { ...keptRecording, meetingId: m.id, status: "READY" } });
  count++;
}

// (no fake "live" meeting: an empty room is closed automatically when the list loads)

// scheduled by me, with invites
const upcoming: [string, Date, number, string[]][] = [
  ["Product demo for Acme", at(1, 11), 45, ["priya@acme.example", "sara.demo@example.com"]],
  ["Sprint 25 planning", at(3, 10), 60, ["ravi.demo@example.com", "sara.demo@example.com", "aman@example.com"]],
  ["Team retro", at(7, 16, 30), 30, ["ravi.demo@example.com", "neha@example.com"]],
];
for (const [title, when, mins, emails] of upcoming) {
  await prisma.meeting.create({
    data: { title, roomCode: code(), hostKey: key(), hostId: me.id, scheduledFor: when, durationMin: mins, invites: { create: emails.map((email) => ({ email })) } },
  });
  count++;
}

// others invited me
await prisma.meeting.create({
  data: { title: "Mobile app kickoff", roomCode: code(), hostKey: key(), hostId: ravi.id, scheduledFor: at(2, 14), durationMin: 30, invites: { create: [{ email: EMAIL }] } },
});
await prisma.meeting.create({
  data: { title: "Budget review", roomCode: code(), hostKey: key(), hostId: sara.id, scheduledFor: at(5, 12), durationMin: 45, invites: { create: [{ email: EMAIL }] } },
});
count += 2;

// links made for later, not started yet
for (const title of ["Interview room", "Office hours"]) {
  await prisma.meeting.create({ data: { title, roomCode: code(), hostKey: key(), hostId: me.id, createdAt: new Date(Date.now() - 3 * HOUR) } });
  count++;
}

console.log(`Demo account ready: ${EMAIL} / ${PASSWORD} (${count} meetings${keptRecording ? ", Sprint 24 planning has a recording" : ""})`);
await prisma.$disconnect();
