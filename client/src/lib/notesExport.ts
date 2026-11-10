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

  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(n.title || n.meetingTitle).replace(/[^\w\- ]+/g, "").trim() || "meeting-notes"}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
