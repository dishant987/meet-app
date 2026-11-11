// Search across everything you can see: meeting titles, AI notes, what was said (transcript) and the chat.
// Postgres full-text search ("simple" = any language, no stemming); every word matches as a prefix.
import { prisma } from "../config/db.js";
import { whereMine } from "./meeting.service.js";

export type Hit = { kind: "title" | "notes" | "transcript" | "chat"; id?: string; who?: string; at?: Date; snippet: string };

/** "budg q4" -> "budg:* & q4:*" (letters and digits only, so the query can't break the search syntax). */
export function toPrefixQuery(q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.slice(0, 8).map((w) => `${w}:*`).join(" & ");
}

const HIGHLIGHT = "StartSel=<<,StopSel=>>,MaxWords=24,MinWords=8,MaxFragments=1";
const MAX_MEETINGS = 20;
const HITS_PER_MEETING = 5;

type Row = { id: string; meetingId: string; who: string; at: Date; snippet: string; rank: number };

export async function search(userId: string, q: string) {
  const query = toPrefixQuery(q);
  if (!query) return { meetings: [] };
  const mine = await prisma.meeting.findMany({ where: await whereMine(userId), select: { id: true }, take: 5000 });
  const ids = mine.map((m) => m.id);
  if (!ids.length) return { meetings: [] };

  const [lines, chat, notes] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT t.id, t."meetingId", t."speakerName" AS who, t."spokenAt" AS at,
             ts_headline('simple', t.text, q, ${HIGHLIGHT}) AS snippet, ts_rank(to_tsvector('simple', t.text), q) AS rank
      FROM "Transcript" t, to_tsquery('simple', ${query}) q
      WHERE t."meetingId" = ANY(${ids}) AND to_tsvector('simple', t.text) @@ q
      ORDER BY rank DESC, t."spokenAt" DESC LIMIT 300`,
    prisma.$queryRaw<Row[]>`
      SELECT c.id, c."meetingId", c."senderName" AS who, c."sentAt" AS at,
             ts_headline('simple', c.text, q, ${HIGHLIGHT}) AS snippet, ts_rank(to_tsvector('simple', c.text), q) AS rank
      FROM "ChatMessage" c, to_tsquery('simple', ${query}) q
      WHERE c."meetingId" = ANY(${ids}) AND to_tsvector('simple', c.text) @@ q
      ORDER BY rank DESC, c."sentAt" DESC LIMIT 300`,
    prisma.$queryRaw<Row[]>`
      WITH doc AS (
        SELECT n.id, n."meetingId", n."updatedAt" AS at,
               concat_ws(' ', n.title || '.', n.summary,
                 (SELECT string_agg(x, '. ') FROM jsonb_array_elements_text(n."keyPoints" || n.decisions || n."openQuestions") x),
                 (SELECT string_agg(a->>'task', '. ') FROM jsonb_array_elements(n."actionItems") a)) AS body
        FROM "Notes" n WHERE n."meetingId" = ANY(${ids}) AND n.status = 'READY'
      )
      SELECT d.id, d."meetingId", '' AS who, d.at, ts_headline('simple', d.body, q, ${HIGHLIGHT}) AS snippet,
             ts_rank(to_tsvector('simple', d.body), q) AS rank
      FROM doc d, to_tsquery('simple', ${query}) q
      WHERE to_tsvector('simple', d.body) @@ q
      ORDER BY rank DESC LIMIT 100`,
  ]);
  const titled = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m.id FROM "Meeting" m, to_tsquery('simple', ${query}) q
    WHERE m.id = ANY(${ids}) AND to_tsvector('simple', m.title) @@ q LIMIT 100`;

  // group by meeting: title + notes first, then the best transcript and chat matches
  const byMeeting = new Map<string, { score: number; hits: Hit[] }>();
  const add = (meetingId: string, score: number, hit: Hit) => {
    const g = byMeeting.get(meetingId) ?? { score: 0, hits: [] };
    g.score += score;
    if (g.hits.length < HITS_PER_MEETING) g.hits.push(hit);
    byMeeting.set(meetingId, g);
  };
  for (const t of titled) add(t.id, 1, { kind: "title", snippet: "" });
  for (const n of notes) add(n.meetingId, 0.8 + Number(n.rank), { kind: "notes", snippet: n.snippet });
  for (const l of lines) add(l.meetingId, Number(l.rank), { kind: "transcript", id: l.id, who: l.who, at: l.at, snippet: l.snippet });
  for (const c of chat) add(c.meetingId, Number(c.rank), { kind: "chat", id: c.id, who: c.who, at: c.at, snippet: c.snippet });

  const top = [...byMeeting.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, MAX_MEETINGS);
  const info = await prisma.meeting.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, title: true, roomCode: true, status: true, startedAt: true, scheduledFor: true, createdAt: true, team: { select: { name: true } } },
  });
  const byId = new Map(info.map((m) => [m.id, m]));
  return {
    meetings: top.flatMap(([id, g]) => {
      const m = byId.get(id);
      if (!m) return [];
      const { id: _id, team, ...rest } = m;
      return [{ ...rest, teamName: team?.name ?? null, hits: g.hits.filter((h) => h.kind !== "title" || g.hits.length === 1) }];
    }),
  };
}
