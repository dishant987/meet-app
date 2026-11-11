import nodemailer, { type Transporter } from "nodemailer";
import { env, isProd } from "../config/env.js";
import { logger } from "../utils/logger.js";

export type Email = { to: string | string[]; subject: string; html: string; text: string };

/**
 * Without SMTP settings (local development and tests) emails aren't sent: they're kept here and logged,
 * so links (like password resets) can still be opened. Never used in production.
 */
export const devOutbox: Email[] = [];

// One reusable SMTP connection setup (Gmail, Outlook, Zoho, your host's mail server…).
let transport: Transporter | null = null;
function smtp() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // 465 = TLS from the start; 587 = upgrades with STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Sends one email over SMTP. Throws if sending fails, so callers decide whether that matters. */
export async function sendEmail(email: Email) {
  const t = smtp();
  if (!t) {
    if (isProd) throw new Error("Email isn't set up (SMTP_HOST / SMTP_USER / SMTP_PASS missing)");
    devOutbox.push(email);
    if (devOutbox.length > 50) devOutbox.shift();
    logger.info({ to: email.to, subject: email.subject }, `[dev email, not sent]
${email.text}`);
    return;
  }
  await t.sendMail({ from: env.EMAIL_FROM || env.SMTP_USER, to: email.to, subject: email.subject, html: email.html, text: email.text });
}

/** Sends several emails, one per recipient, so nobody sees the others' addresses. */
export async function sendEmails(emails: Email[]) {
  const failed: string[] = [];
  for (const e of emails) {
    // one failed address shouldn't stop the rest
    await sendEmail(e).catch((err) => {
      failed.push(String(e.to));
      logger.warn({ to: e.to, err: (err as Error).message }, "Email failed");
    });
  }
  if (failed.length && failed.length === emails.length) throw new Error(`All ${failed.length} emails failed`);
}

// ---------- templates (simple, inline-styled HTML that works in email apps) ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#15161c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px"><span style="display:inline-block;background:#c8f25c;border-radius:8px;padding:2px 8px;margin-right:6px">&#9646;</span>MeetApp</td></tr>
<tr><td><h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}</td></tr>
</table><p style="font-size:12px;color:#8a8c96;margin-top:16px">You got this email because of your MeetApp account.</p>
</td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#c8f25c;color:#15161c;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px;display:inline-block">${esc(label)}</a></p>`;

export function resetPasswordEmail(name: string, link: string, minutes: number): Omit<Email, "to"> {
  return {
    subject: "Reset your MeetApp password",
    html: layout(
      "Reset your password",
      `<p>Hi ${esc(name)},</p><p>Someone (hopefully you) asked to reset your MeetApp password. This link works once and expires in ${minutes} minutes.</p>${button(link, "Choose a new password")}<p style="color:#5b5d68;font-size:14px">If you didn't ask for this, ignore this email. Your password stays the same.</p>`,
    ),
    text: `Hi ${name},\n\nReset your MeetApp password (works once, expires in ${minutes} minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

type NotesForEmail = {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: { task: string; owner: string | null; dueDate: string | null }[];
};

export function notesEmail(meetingTitle: string, dateLine: string, n: NotesForEmail, link: string): Omit<Email, "to"> {
  const title = n.title || meetingTitle;
  const items = n.actionItems
    .map((a) => `<li style="margin-bottom:6px">${esc(a.task)}${a.owner ? ` &mdash; <b>${esc(a.owner)}</b>` : ""}${a.dueDate ? ` <span style="color:#5b5d68">(${esc(a.dueDate)})</span>` : ""}</li>`)
    .join("");
  const decisions = n.decisions.map((d) => `<li style="margin-bottom:6px">${esc(d)}</li>`).join("");
  const section = (h: string, inner: string) => (inner ? `<h2 style="font-size:15px;margin:20px 0 8px">${h}</h2><ul style="padding-left:20px;margin:0">${inner}</ul>` : "");
  return {
    subject: `Notes: ${title}`,
    html: layout(
      title,
      `<p style="color:#5b5d68;margin-top:0">${esc(dateLine)}</p><p style="font-size:16px;line-height:1.5">${esc(n.summary)}</p>${section("Action items", items)}${section("Decisions", decisions)}${button(link, "Open full notes & recording")}`,
    ),
    text: [
      title,
      dateLine,
      "",
      n.summary,
      n.actionItems.length ? "\nAction items:\n" + n.actionItems.map((a) => `- ${a.task}${a.owner ? ` (${a.owner})` : ""}${a.dueDate ? ` - ${a.dueDate}` : ""}`).join("\n") : "",
      n.decisions.length ? "\nDecisions:\n" + n.decisions.map((d) => `- ${d}`).join("\n") : "",
      `\nFull notes: ${link}`,
    ].join("\n"),
  };
}
