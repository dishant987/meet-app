import { useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { errorMessage, type ActionItem, type NotesContent } from "@/lib/api";

const field =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-[15px] focus-visible:border-brand focus-visible:outline-none";
const label = "mb-1.5 block text-sm font-semibold";
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** Host-only editor. Lists are edited as one item per line; action items as rows. */
export function NotesEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: NotesContent;
  onSave: (n: NotesContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [keyPoints, setKeyPoints] = useState(initial.keyPoints.join("\n"));
  const [decisions, setDecisions] = useState(initial.decisions.join("\n"));
  const [questions, setQuestions] = useState(initial.openQuestions.join("\n"));
  const [items, setItems] = useState<ActionItem[]>(initial.actionItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setItem = (i: number, patch: Partial<ActionItem>) => setItems((all) => all.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        summary: summary.trim(),
        keyPoints: lines(keyPoints),
        decisions: lines(decisions),
        openQuestions: lines(questions),
        actionItems: items
          .map((a) => ({ task: a.task.trim(), owner: a.owner?.trim() || null, dueDate: a.dueDate?.trim() || null }))
          .filter((a) => a.task),
      });
    } catch (err) {
      setError(errorMessage(err)); // keep everything typed; nothing is lost
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div>
        <label htmlFor="n-title" className={label}>Title</label>
        <input id="n-title" className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="n-summary" className={label}>Summary</label>
        <textarea id="n-summary" rows={4} className={field} value={summary} maxLength={5000} onChange={(e) => setSummary(e.target.value)} />
      </div>

      <fieldset>
        <legend className={label}>Action items</legend>
        <div className="space-y-2">
          {items.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]">
              <input aria-label={`Task ${i + 1}`} placeholder="Task" className={field} value={a.task} onChange={(e) => setItem(i, { task: e.target.value })} />
              <input aria-label={`Owner of task ${i + 1}`} placeholder="Owner" className={field} value={a.owner ?? ""} onChange={(e) => setItem(i, { owner: e.target.value })} />
              <input aria-label={`Due date of task ${i + 1}`} placeholder="Due" className={field} value={a.dueDate ?? ""} onChange={(e) => setItem(i, { dueDate: e.target.value })} />
              <button
                type="button"
                aria-label={`Remove task ${i + 1}`}
                onClick={() => setItems((all) => all.filter((_, j) => j !== i))}
                className="flex size-10 items-center justify-center justify-self-end rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((all) => [...all, { task: "", owner: null, dueDate: null }])}
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <Plus className="size-4" /> Add action item
          </button>
        </div>
      </fieldset>

      {(
        [
          ["n-decisions", "Decisions", decisions, setDecisions],
          ["n-points", "Key points", keyPoints, setKeyPoints],
          ["n-questions", "Open questions", questions, setQuestions],
        ] as const
      ).map(([id, name, value, set]) => (
        <div key={id}>
          <label htmlFor={id} className={label}>
            {name} <span className="font-normal text-muted-foreground">· one per line</span>
          </label>
          <textarea id={id} rows={4} className={field} value={value} onChange={(e) => set(e.target.value)} />
        </div>
      ))}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-ink-950 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {saving && <Loader2 className="size-4 animate-spin" />} Save notes
        </button>
      </div>
    </form>
  );
}
