import type { NotesContent } from "@/lib/api";

export type NotesDoc = NotesContent & { meetingTitle: string; dateLine: string; attendees: string[] };

const itemLine = (a: NotesContent["actionItems"][number]) =>
  [a.task, a.owner && `owner: ${a.owner}`, a.dueDate && `due: ${a.dueDate}`].filter(Boolean).join(" — ");

/** Plain Markdown, for pasting into Slack, email, Notion, etc. */
export function toMarkdown(n: NotesDoc) {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  const out = [`# ${n.title || n.meetingTitle}`, `${n.dateLine}  `, `Attendees: ${n.attendees.join(", ")}`, "", "## Summary", n.summary];
  if (n.actionItems.length) out.push("", "## Action items", n.actionItems.map((a) => `- [ ] ${itemLine(a)}`).join("\n"));
  if (n.decisions.length) out.push("", "## Decisions", list(n.decisions));
  if (n.keyPoints.length) out.push("", "## Key points", list(n.keyPoints));
  if (n.openQuestions.length) out.push("", "## Open questions", list(n.openQuestions));
  return out.join("\n");
}

/** A formatted .docx, built in the browser. The library is loaded only when someone clicks Download. */
export async function downloadWord(n: NotesDoc) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } = await import("docx");
  const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } });
  const bullets = (items: string[]) => items.map((text) => new Paragraph({ text, bullet: { level: 0 } }));
  const cell = (text: string, bold = false) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({ text: n.title || n.meetingTitle, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: n.dateLine, color: "666666" })] }),
    new Paragraph({ children: [new TextRun({ text: `Attendees: ${n.attendees.join(", ")}`, color: "666666" })] }),
    heading("Summary"),
    new Paragraph({ text: n.summary }),
  ];
  if (n.actionItems.length) {
    children.push(heading("Action items"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [cell("Task", true), cell("Owner", true), cell("Due", true)] }),
          ...n.actionItems.map((a) => new TableRow({ children: [cell(a.task), cell(a.owner ?? "—"), cell(a.dueDate ?? "—")] })),
        ],
      }),
    );
  }
  if (n.decisions.length) children.push(heading("Decisions"), ...bullets(n.decisions));
  if (n.keyPoints.length) children.push(heading("Key points"), ...bullets(n.keyPoints));
  if (n.openQuestions.length) children.push(heading("Open questions"), ...bullets(n.openQuestions));

  saveFile(await Packer.toBlob(new Document({ sections: [{ children }] })), `${fileName(n.title || n.meetingTitle, "meeting-notes")}.docx`);
}

const fileName = (title: string, fallback: string) => title.replace(/[^\w\- ]+/g, "").trim() || fallback;

/** Saves a file made in the browser (no server round trip). */
function saveFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type TranscriptLineForExport = { speakerName: string; text: string; spokenAt: string };
export type TranscriptMeta = { meetingTitle: string; dateLine: string; attendees: string[] };

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Whole transcript as plain text: "10:01:05 AM  Ravi: …", one line per sentence. */
export function transcriptText(meta: TranscriptMeta, rows: TranscriptLineForExport[]) {
  return [
    `${meta.meetingTitle} — transcript`,
    meta.dateLine,
    `Attendees: ${meta.attendees.join(", ")}`,
    "",
    ...rows.map((r) => `[${clock(r.spokenAt)}] ${r.speakerName}: ${r.text}`),
    "",
  ].join("\n");
}

export function downloadTranscriptText(meta: TranscriptMeta, rows: TranscriptLineForExport[]) {
  saveFile(new Blob([transcriptText(meta, rows)], { type: "text/plain;charset=utf-8" }), `${fileName(meta.meetingTitle, "meeting")} transcript.txt`);
}

export async function downloadTranscriptWord(meta: TranscriptMeta, rows: TranscriptLineForExport[]) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const children = [
    new Paragraph({ text: `${meta.meetingTitle} — transcript`, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: meta.dateLine, color: "666666" })] }),
    new Paragraph({ children: [new TextRun({ text: `Attendees: ${meta.attendees.join(", ")}`, color: "666666" })], spacing: { after: 240 } }),
    ...rows.map(
      (r, i) =>
        new Paragraph({
          spacing: { before: rows[i - 1]?.speakerName === r.speakerName ? 0 : 160 },
          children: [
            ...(rows[i - 1]?.speakerName === r.speakerName
              ? []
              : [new TextRun({ text: `${r.speakerName}  `, bold: true }), new TextRun({ text: clock(r.spokenAt), color: "888888", break: 0 }), new TextRun({ text: "", break: 1 })]),
            new TextRun(r.text),
          ],
        }),
    ),
  ];
  saveFile(await Packer.toBlob(new Document({ sections: [{ children }] })), `${fileName(meta.meetingTitle, "meeting")} transcript.docx`);
}
