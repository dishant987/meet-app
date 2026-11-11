// Plans and their limits. Paid plans come from Stripe (services/billing.service.ts).
// The meeting HOST's plan sets the people and recording limits; the asker's plan sets the AI limit;
// the team OWNER's plan sets the team size.
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";

export const PLANS = {
  FREE: { name: "Free", people: 10, recordingsPerMonth: 5, aiPerDay: 20, teamsOwned: 1, teamMembers: 5 },
  PRO: { name: "Pro", people: 50, recordingsPerMonth: null, aiPerDay: 200, teamsOwned: 10, teamMembers: 50 },
  BUSINESS: { name: "Business", people: 100, recordingsPerMonth: null, aiPerDay: 1000, teamsOwned: 25, teamMembers: 200 },
} as const; // null = no limit
export type PlanId = keyof typeof PLANS;
export const planOf = (plan: string | null | undefined): PlanId => (plan === "PRO" || plan === "BUSINESS" ? plan : "FREE");
export const limitsOf = (plan: string | null | undefined) => PLANS[planOf(plan)];

const limitReached = (what: string) =>
  new AppError(403, "PLAN_LIMIT", `${what} Upgrade on the Billing page for more.`);

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};
const dayStart = () => new Date(Date.now() - 24 * 3600_000); // rolling 24 h

export async function usage(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
  const [recordings, aiQuestions, teamsOwned] = await Promise.all([
    prisma.recording.count({ where: { meeting: { hostId: userId }, createdAt: { gte: monthStart() } } }),
    prisma.aiQuestion.count({ where: { userId, createdAt: { gte: dayStart() } } }),
    prisma.teamMember.count({ where: { userId, role: "OWNER" } }),
  ]);
  const plan = planOf(user.plan);
  return { plan, limits: PLANS[plan], used: { recordingsThisMonth: recordings, aiQuestionsToday: aiQuestions, teamsOwned } };
}

/** Host's monthly recordings. Meetings without a signed-in host (guest-made) use the Free limits per meeting. */
export async function assertCanRecord(hostId: string | null) {
  if (!hostId) return;
  const { limits, used } = await usage(hostId);
  if (limits.recordingsPerMonth !== null && used.recordingsThisMonth >= limits.recordingsPerMonth)
    throw limitReached(`The host has used all ${limits.recordingsPerMonth} recordings for this month on the Free plan.`);
}

export async function assertCanAsk(userId: string) {
  const { limits, used } = await usage(userId);
  if (used.aiQuestionsToday >= limits.aiPerDay) throw limitReached(`You've asked ${limits.aiPerDay} questions in the last 24 hours.`);
}

/** People in a call: the host's plan (guest-made meetings: Free). */
export async function peopleLimit(hostId: string | null) {
  if (!hostId) return PLANS.FREE.people;
  const host = await prisma.user.findUnique({ where: { id: hostId }, select: { plan: true } });
  return limitsOf(host?.plan).people;
}

export async function assertCanOwnTeam(userId: string) {
  const { limits, used } = await usage(userId);
  if (used.teamsOwned >= limits.teamsOwned)
    throw limitReached(`On the ${limits.name} plan you can own ${limits.teamsOwned} team${limits.teamsOwned === 1 ? "" : "s"}.`);
}

/** Members + pending invites may not go past the owner's plan. */
export async function assertTeamHasRoom(teamId: string, adding = 1) {
  const owner = await prisma.teamMember.findFirst({ where: { teamId, role: "OWNER" }, select: { user: { select: { plan: true } } } });
  const max = limitsOf(owner?.user.plan).teamMembers;
  const [members, invites] = await Promise.all([prisma.teamMember.count({ where: { teamId } }), prisma.teamInvite.count({ where: { teamId } })]);
  if (members + invites + adding > max) throw limitReached(`This team can have up to ${max} people (members and invites) on its plan.`);
}
