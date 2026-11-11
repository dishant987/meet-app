// Form rules for the browser. They match the server's (server/src/validators/*, notes.service notesContent):
// same limits, so anything that passes here also passes there. Change both together.
import { z } from "zod";

// ---------- building blocks ----------
const name = (empty: string) => z.string().trim().min(1, empty).max(50, "Keep your name under 50 characters");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .pipe(z.email("That doesn't look like an email address"))
  .pipe(z.string().max(200, "That email is too long"));
const newPassword = z
  .string()
  .min(1, "Enter a password")
  .min(8, "Use at least 8 characters")
  .max(128, "Keep your password under 128 characters");
const samePassword = (d: { confirm: string } & Record<string, unknown>, key: string) => d[key] === d.confirm;

/** Accepts a code ("abc-defg-hij") or a full meeting link and returns the code, or null. */
export function parseRoomCode(input: string): string | null {
  const match = input.trim().toLowerCase().match(/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/);
  return match ? match[1]! : null;
}

// ---------- forms ----------
export const signInForm = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128, "Keep your password under 128 characters"),
});

export const signUpForm = z.object({ name: name("Enter your name"), email, password: newPassword });

export const forgotForm = z.object({ email });

export const resetForm = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((d) => samePassword(d, "password"), { path: ["confirm"], message: "The two passwords don't match" });

export const profileNameForm = z.object({ name: name("Enter your name") });

/** People who signed up with Google have no current password to give. */
export const changePasswordForm = (hasPassword: boolean) =>
  z
    .object({
      currentPassword: hasPassword ? z.string().min(1, "Enter your current password").max(128) : z.string().max(128).optional(),
      newPassword,
      confirm: z.string(),
    })
    .refine((d) => samePassword(d, "newPassword"), { path: ["confirm"], message: "The two new passwords don't match" });

/** Join box: turns a code or a pasted link into the room code. */
export const joinCodeForm = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a meeting code or link")
    .transform((value, ctx) => {
      const code = parseRoomCode(value);
      if (!code) {
        ctx.addIssue({ code: "custom", message: "Enter a code like abc-defg-hij or paste the meeting link" });
        return z.NEVER;
      }
      return code;
    }),
});

/** Name shown to others in a call. */
export const displayNameForm = z.object({ name: name("Add your name so others know who joined") });

export const chatMessageForm = z.object({
  message: z.string().trim().min(1, "Write a message first").max(1000, "Messages can be up to 1000 characters"),
});

const lines = (label: string) =>
  z
    .array(z.string().trim().max(1000, `${label}: each line can be up to 1000 characters`))
    .max(50, `${label}: up to 50 lines`);

/** Notes editor (what the host can save). */
export const notesForm = z.object({
  title: z.string().trim().max(200, "Keep the title under 200 characters"),
  summary: z.string().trim().max(5000, "Keep the summary under 5000 characters"),
  keyPoints: lines("Key points"),
  decisions: lines("Decisions"),
  openQuestions: lines("Open questions"),
  actionItems: z
    .array(
      z.object({
        task: z.string().trim().min(1, "Every to-do needs a task").max(1000, "To-dos can be up to 1000 characters"),
        owner: z.string().trim().max(100, "Owner names can be up to 100 characters").nullable(),
        dueDate: z.string().trim().max(100, "Due dates can be up to 100 characters").nullable(),
      }),
    )
    .max(50, "Up to 50 to-dos"),
});

/** Schedule a meeting: local date + time, length, and guests' emails (comma, space or new line between). */
export const scheduleForm = z
  .object({
    title: z.string().trim().max(100, "Keep the title under 100 characters"),
    date: z.string().min(1, "Pick a date"),
    time: z.string().min(1, "Pick a time"),
    durationMin: z.coerce.number().int().min(5).max(480),
    guests: z
      .string()
      .transform((s) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))])
      .pipe(z.array(z.email("One of the guest emails isn't valid")).max(20, "Invite up to 20 people")),
  })
  .transform((v, ctx) => {
    const start = new Date(`${v.date}T${v.time}`); // browser's local time
    const ms = start.getTime();
    if (Number.isNaN(ms)) ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a date and time" });
    else if (ms < Date.now() - 60_000) ctx.addIssue({ code: "custom", path: ["time"], message: "Pick a time in the future" });
    else if (ms > Date.now() + 365 * 86_400_000) ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a date within the next year" });
    return { title: v.title, scheduledFor: start.toISOString(), durationMin: v.durationMin, invitees: v.guests };
  });

// ---------- helper ----------
export type FormErrors = Record<string, string>;

/** Checks form values. Returns clean data (trimmed, lower-cased email, …) or one message per field. */
export function check<S extends z.ZodType>(schema: S, values: unknown): { data: z.output<S>; errors: null } | { data: null; errors: FormErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FormErrors = {};
  for (const issue of result.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { data: null, errors };
}
