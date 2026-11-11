import nodemailer, { type Transporter } from "nodemailer";
import { env, isProd } from "../config/env.js";
import { logger } from "../utils/logger.js";

export type Email = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Calendar invite (.ics). Email apps show "Add to calendar" / Yes-No-Maybe. */
  icalEvent?: { method: "REQUEST" | "CANCEL"; content: string };
};

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
  await t.sendMail({
    from: env.EMAIL_FROM || env.SMTP_USER,
    to: email.to,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    icalEvent: email.icalEvent && { ...email.icalEvent, filename: "invite.ics" },
  });
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

function layout(title: string, body: string, footer = "You got this email because of your MeetApp account.") {
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#15161c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px"><span style="display:inline-block;background:#c8f25c;border-radius:8px;padding:2px 8px;margin-right:6px">&#9646;</span>MeetApp</td></tr>
<tr><td><h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}</td></tr>
</table><p style="font-size:12px;color:#8a8c96;margin-top:16px">${esc(footer)}</p>
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

export function verifyEmailEmail(name: string, link: string, hours: number): Omit<Email, "to"> {
  return {
    subject: "Confirm your email for MeetApp",
    html: layout(
      "Confirm your email",
      `<p>Hi ${esc(name)},</p><p>Welcome to MeetApp! Please confirm this is your email so we can send you meeting notes and invites. The link works for ${hours} hours.</p>${button(link, "Confirm my email")}<p style="color:#5b5d68;font-size:14px">If you didn't create a MeetApp account, ignore this email.</p>`,
    ),
    text: `Hi ${name},

Confirm your email for MeetApp (link works for ${hours} hours):
${link}

If you didn't create a MeetApp account, ignore this email.`,
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

/** Someone added this email to a team; they accept on their Teams page (after signing up if needed). */
export function teamInviteEmail(inviter: string, team: string, link: string): Omit<Email, "to"> {
  return {
    subject: `${inviter} invited you to the ${team} team on MeetApp`,
    html: layout(
      `Join ${team} on MeetApp`,
      `<p><b>${esc(inviter)}</b> invited you to the <b>${esc(team)}</b> team. Team members see the team's meetings, notes and recordings.</p>${button(link, "See the invite")}<p style="color:#5b5d68;font-size:14px">No account yet? Sign up with this email address and the invite will be waiting.</p>`,
      `${inviter} sent this through MeetApp.`,
    ),
    text: `${inviter} invited you to the ${team} team on MeetApp.\n\nSee the invite: ${link}\n\nNo account yet? Sign up with this email address and the invite will be waiting.`,
  };
}

/** "Starts in 10 minutes" reminder, with the join button. */
export function reminderEmail(title: string, minutes: number, link: string): Omit<Email, "to"> {
  const soon = minutes <= 1 ? "now" : `in ${minutes} minutes`;
  return {
    subject: `Starting ${soon}: ${title}`,
    html: layout(
      `${title} starts ${soon}`,
      `<p>Your MeetApp meeting <b>${esc(title)}</b> starts ${soon}.</p>${button(link, "Join now")}<p style="color:#5b5d68;font-size:14px">Or open this link: ${esc(link)}</p>`,
      "You got this email because you were invited to this meeting.",
    ),
    text: `${title} starts ${soon}.

Join: ${link}`,
  };
}

/** Invite to a scheduled meeting (the .ics calendar part is added by the caller). */
const replyButton = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;border:1px solid #d6d8de;border-radius:10px;padding:8px 14px;margin:0 6px 6px 0;color:#15161c;text-decoration:none;font-weight:bold;font-size:14px">${esc(label)}</a>`;

export function inviteEmail(
  hostName: string,
  title: string,
  when: string,
  minutes: number,
  link: string,
  updated = false,
  reply?: { yes: string; maybe: string; no: string },
): Omit<Email, "to"> {
  const going = reply
    ? `<p style="margin:20px 0 6px;font-weight:bold">Going?</p><p style="margin:0">${replyButton(reply.yes, "Yes")}${replyButton(reply.maybe, "Maybe")}${replyButton(reply.no, "No")}</p>`
    : "";
  const goingText = reply ? `\n\nGoing? Yes: ${reply.yes}\nMaybe: ${reply.maybe}\nNo: ${reply.no}` : "";
  return {
    subject: `${updated ? "Updated invitation" : "Invitation"}: ${title} · ${when}`,
    html: layout(
      title,
      `<p>${updated ? `<b>${esc(hostName)}</b> changed this meeting. Here are the new details.` : `<b>${esc(hostName)}</b> invited you to a video meeting on MeetApp.`}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;margin:8px 0">
<tr><td style="color:#5b5d68;padding:4px 16px 4px 0">When</td><td>${esc(when)}</td></tr>
<tr><td style="color:#5b5d68;padding:4px 16px 4px 0">Length</td><td>${minutes} minutes</td></tr>
<tr><td style="color:#5b5d68;padding:4px 16px 4px 0">Link</td><td><a href="${esc(link)}" style="color:#15161c">${esc(link)}</a></td></tr>
</table>${button(link, "Join meeting")}${going}<p style="color:#5b5d68;font-size:14px">Use the invite to add it to your calendar. No account or app needed to join.</p>`,
      `${hostName} invited you through MeetApp.`,
    ),
    text: `${updated ? `${hostName} changed "${title}". New details:` : `${hostName} invited you to "${title}" on MeetApp.`}\n\nWhen: ${when}\nLength: ${minutes} minutes\nJoin: ${link}${goingText}\n\nNo account or app needed to join.`,
  };
}

/** The meeting is off (cancelled, or this guest was removed). The .ics part removes it from their calendar. */
export function cancelEmail(hostName: string, title: string, when: string, removed = false, oneOfSeries = false): Omit<Email, "to"> {
  const what = removed
    ? `${esc(hostName)} removed you from this meeting.`
    : oneOfSeries
      ? `${esc(hostName)} cancelled this one meeting. The other meetings in the series stay as planned.`
      : `${esc(hostName)} cancelled this meeting.`;
  return {
    subject: `${removed ? "Removed" : "Cancelled"}: ${title} · ${when}`,
    html: layout(
      `Cancelled: ${title}`,
      `<p>${what}</p><p style="color:#5b5d68">It was planned for ${esc(when)}. Your calendar will remove it when you open the attached update.</p>`,
      `${hostName} sent this through MeetApp.`,
    ),
    text: `${removed ? `${hostName} removed you from "${title}".` : `${hostName} cancelled "${title}".`}\nIt was planned for ${when}.`,
  };
}

// ---------- billing ----------

export type Receipt = {
  plan: string; // "Pro" / "Business"
  amount: string; // "₹499.00"
  period: string; // "11 Nov 2026 – 11 Dec 2026"
  number: string | null;
  date: string;
  invoiceUrl: string | null;
  pdfUrl: string | null;
};
const row = (k: string, v: string) =>
  `<tr><td style="color:#5b5d68;padding:6px 16px 6px 0">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`;

/** Payment receipt; the first payment of a plan doubles as the welcome email. */
export function receiptEmail(name: string, r: Receipt, billingLink: string, welcome: boolean): Omit<Email, "to"> {
  const intro = welcome
    ? `<p>Hi ${esc(name)}, welcome to <b>MeetApp ${esc(r.plan)}</b>! Your payment went through and everything in ${esc(r.plan)} is unlocked right now.</p>`
    : `<p>Hi ${esc(name)}, thanks for your payment. Here is your receipt for <b>MeetApp ${esc(r.plan)}</b>.</p>`;
  const links = [r.invoiceUrl && button(r.invoiceUrl, "View invoice"), r.pdfUrl && `<p style="margin:0 0 16px"><a href="${esc(r.pdfUrl)}" style="color:#15161c">Download PDF</a></p>`]
    .filter(Boolean)
    .join("");
  return {
    subject: welcome ? `Welcome to MeetApp ${r.plan}: your receipt` : `Your MeetApp receipt${r.number ? ` ${r.number}` : ""}`,
    html: layout(
      welcome ? `You're on ${r.plan}` : "Payment received",
      `${intro}<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;margin:12px 0">${row("Amount paid", r.amount)}${row("Plan", `MeetApp ${r.plan}`)}${row("Period", r.period)}${row("Date", r.date)}${r.number ? row("Invoice", r.number) : ""}</table>${links}<p style="color:#5b5d68;font-size:14px">Manage your plan, card and invoices any time on the <a href="${esc(billingLink)}" style="color:#15161c">Billing page</a>.</p>`,
      "You got this email because you have a paid MeetApp plan.",
    ),
    text: `${welcome ? `Welcome to MeetApp ${r.plan}!` : "Payment received."}\n\nAmount paid: ${r.amount}\nPlan: MeetApp ${r.plan}\nPeriod: ${r.period}\nDate: ${r.date}${r.number ? `\nInvoice: ${r.number}` : ""}${r.invoiceUrl ? `\nView invoice: ${r.invoiceUrl}` : ""}${r.pdfUrl ? `\nPDF: ${r.pdfUrl}` : ""}\n\nBilling page: ${billingLink}`,
  };
}

/** Cancelled in the portal: the plan keeps working until the end date. */
export function cancelScheduledEmail(name: string, plan: string, endsOn: string, billingLink: string): Omit<Email, "to"> {
  return {
    subject: `Your MeetApp ${plan} plan is cancelled`,
    html: layout(
      "Cancellation confirmed",
      `<p>Hi ${esc(name)}, we've cancelled your <b>MeetApp ${esc(plan)}</b> subscription. You won't be charged again.</p><p>You keep everything in ${esc(plan)} until <b>${esc(endsOn)}</b>, then your account moves to the Free plan. Your meetings, notes and recordings stay.</p>${button(billingLink, "Changed your mind? Renew")}`,
      "You got this email because you have a paid MeetApp plan.",
    ),
    text: `Your MeetApp ${plan} subscription is cancelled. You won't be charged again.\nYou keep ${plan} until ${endsOn}, then move to Free.\n\nRenew: ${billingLink}`,
  };
}

/** A renewal payment failed; Stripe retries for a while. */
export function paymentFailedEmail(name: string, plan: string, amount: string, billingLink: string): Omit<Email, "to"> {
  return {
    subject: `Action needed: your MeetApp payment didn't go through`,
    html: layout(
      "Your payment didn't go through",
      `<p>Hi ${esc(name)}, we couldn't charge <b>${esc(amount)}</b> for your <b>MeetApp ${esc(plan)}</b> plan. Your card may have expired or been declined.</p><p>We'll try again over the next few days. To keep ${esc(plan)} without a break, please update your card.</p>${button(billingLink, "Update card")}`,
      "You got this email because you have a paid MeetApp plan.",
    ),
    text: `We couldn't charge ${amount} for MeetApp ${plan}. Please update your card to keep your plan: ${billingLink}`,
  };
}

/** The subscription has ended; the account is on Free now. */
export function planEndedEmail(name: string, plan: string, billingLink: string): Omit<Email, "to"> {
  return {
    subject: `Your MeetApp ${plan} plan has ended`,
    html: layout(
      "You're on the Free plan now",
      `<p>Hi ${esc(name)}, your <b>MeetApp ${esc(plan)}</b> plan has ended and your account is now on Free. All your meetings, notes and recordings are still here.</p><p>Free includes up to 10 people per call, 5 recordings a month and 20 AI questions a day.</p>${button(billingLink, `Get ${plan} again`)}`,
      "You got this email because you had a paid MeetApp plan.",
    ),
    text: `Your MeetApp ${plan} plan has ended; you're on Free now. Your meetings and notes are still here.\n\nUpgrade again: ${billingLink}`,
  };
}
