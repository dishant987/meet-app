// Teams: people who share meetings and notes. Roles: OWNER (everything, one per team), ADMIN (members,
// invites, settings), MEMBER. Invites wait for someone with that email to accept on their Teams page.
import { waitUntil } from "@vercel/functions";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { avatarUrl } from "./auth.service.js";
import { sendEmails, teamInviteEmail } from "./email.service.js";
import { assertCanOwnTeam, assertTeamHasRoom, limitsOf } from "./plan.service.js";

export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type TeamSettings = { name?: string; askToJoin?: boolean; allowedDomains?: string[]; recording?: "HOST" | "OFF" };

/** The caller's role in the team, or 404 when they aren't in it (no hint that the team exists). */
async function roleIn(teamId: string, userId: string) {
  const m = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, select: { role: true } });
  if (!m) throw new AppError(404, "TEAM_NOT_FOUND", "This team doesn't exist or you're not in it.");
  return m.role as Role;
}
const needAdmin = (role: Role) => {
  if (role === "MEMBER") throw new AppError(403, "TEAM_ADMIN_ONLY", "Only team owners and admins can do this.");
};

export async function isTeamMember(teamId: string, userId: string) {
  return !!(await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, select: { role: true } }));
}

export async function createTeam(userId: string, name: string) {
  await assertCanOwnTeam(userId);
  const team = await prisma.team.create({
    data: { name, members: { create: { userId, role: "OWNER" } } },
    select: { id: true, name: true },
  });
  return team;
}

/** My teams and the invites waiting for my email. */
export async function myTeams(userId: string) {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const [memberships, invites] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: { role: true, team: { select: { id: true, name: true, _count: { select: { members: true, meetings: true } } } } },
    }),
    prisma.teamInvite.findMany({
      where: { email: me.email },
      orderBy: { createdAt: "desc" },
      select: { id: true, role: true, team: { select: { id: true, name: true, _count: { select: { members: true } } } } },
    }),
  ]);
  return {
    teams: memberships.map((m) => ({ id: m.team.id, name: m.team.name, role: m.role, members: m.team._count.members, meetings: m.team._count.meetings })),
    invites: invites.map((i) => ({ id: i.id, role: i.role, teamId: i.team.id, teamName: i.team.name, members: i.team._count.members })),
  };
}

export async function getTeam(teamId: string, userId: string) {
  const role = await roleIn(teamId, userId);
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      askToJoin: true,
      allowedDomains: true,
      recording: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true, avatarType: true, avatarVersion: true, pictureUrl: true, plan: true } },
        },
      },
      invites: { orderBy: { createdAt: "asc" }, select: { id: true, email: true, role: true, createdAt: true } },
    },
  });
  const owner = team.members.find((m) => m.role === "OWNER");
  return {
    id: team.id,
    name: team.name,
    myRole: role,
    settings: { askToJoin: team.askToJoin, allowedDomains: team.allowedDomains, recording: team.recording },
    maxPeople: limitsOf(owner?.user.plan).teamMembers,
    members: team.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: avatarUrl(m.user),
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    // only admins see (and manage) who is invited
    invites: role === "MEMBER" ? [] : team.invites,
  };
}

/** Admins invite by email; people already in the team are skipped. Each gets an email pointing to their Teams page. */
export async function inviteMembers(teamId: string, actorId: string, emails: string[], role: "ADMIN" | "MEMBER") {
  const actorRole = await roleIn(teamId, actorId);
  needAdmin(actorRole);
  if (role === "ADMIN" && actorRole !== "OWNER") throw new AppError(403, "OWNER_ONLY", "Only the team owner can add admins.");
  const unique = [...new Set(emails)];
  const [members, invited] = await Promise.all([
    prisma.teamMember.findMany({ where: { teamId, user: { email: { in: unique } } }, select: { user: { select: { email: true } } } }),
    prisma.teamInvite.findMany({ where: { teamId, email: { in: unique } }, select: { email: true } }),
  ]);
  const skip = new Set([...members.map((m) => m.user.email), ...invited.map((i) => i.email)]);
  const fresh = unique.filter((e) => !skip.has(e));
  if (!fresh.length) return { invited: 0, skipped: unique.length };
  await assertTeamHasRoom(teamId, fresh.length);
  await prisma.teamInvite.createMany({ data: fresh.map((email) => ({ teamId, email, role })), skipDuplicates: true });

  const [team, actor] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true, email: true } }),
  ]);
  const mail = teamInviteEmail(actor.name, team.name, `${env.CLIENT_URL}/teams`);
  waitUntil(
    sendEmails(fresh.map((to) => ({ to, replyTo: actor.email, ...mail }))).catch((err) => logger.error({ err }, "Team invite emails failed")),
  );
  return { invited: fresh.length, skipped: unique.length - fresh.length };
}

/** Accept or decline an invite sent to my (confirmed) email. */
export async function answerTeamInvite(inviteId: string, userId: string, accept: boolean) {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.email !== me.email) throw new AppError(404, "INVITE_NOT_FOUND", "This invite is no longer open.");
  await prisma.$transaction([
    prisma.teamInvite.delete({ where: { id: invite.id } }),
    ...(accept
      ? [
          prisma.teamMember.upsert({
            where: { teamId_userId: { teamId: invite.teamId, userId } },
            create: { teamId: invite.teamId, userId, role: invite.role },
            update: {},
          }),
        ]
      : []),
  ]);
  return { joined: accept, teamId: invite.teamId };
}

export async function cancelTeamInvite(teamId: string, actorId: string, inviteId: string) {
  needAdmin(await roleIn(teamId, actorId));
  await prisma.teamInvite.deleteMany({ where: { id: inviteId, teamId } });
  return { cancelled: true };
}

/** Owner makes someone admin or member (one owner per team; the owner's role doesn't change here). */
export async function changeRole(teamId: string, actorId: string, userId: string, role: "ADMIN" | "MEMBER") {
  if ((await roleIn(teamId, actorId)) !== "OWNER") throw new AppError(403, "OWNER_ONLY", "Only the team owner can change roles.");
  const target = await roleIn(teamId, userId);
  if (target === "OWNER") throw new AppError(400, "OWNER_ROLE", "The owner stays the owner.");
  await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role } });
  return { role };
}

/** Remove someone (admins remove members; the owner removes anyone) or leave (anyone but the owner). */
export async function removeMember(teamId: string, actorId: string, userId: string) {
  const actorRole = await roleIn(teamId, actorId);
  const targetRole = await roleIn(teamId, userId);
  if (targetRole === "OWNER") throw new AppError(400, "OWNER_CANT_LEAVE", "The owner can't leave. Delete the team instead.");
  const self = actorId === userId;
  if (!self && !(actorRole === "OWNER" || (actorRole === "ADMIN" && targetRole === "MEMBER")))
    throw new AppError(403, "TEAM_ADMIN_ONLY", "You can't remove this person.");
  await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
  return { removed: true };
}

export async function updateTeam(teamId: string, actorId: string, s: TeamSettings) {
  needAdmin(await roleIn(teamId, actorId));
  const t = await prisma.team.update({
    where: { id: teamId },
    data: {
      name: s.name,
      askToJoin: s.askToJoin,
      allowedDomains: s.allowedDomains ? [...new Set(s.allowedDomains)] : undefined,
      recording: s.recording,
    },
    select: { name: true, askToJoin: true, allowedDomains: true, recording: true },
  });
  return t;
}

/** Owner deletes the team. Its meetings and notes stay with their hosts. */
export async function deleteTeam(teamId: string, actorId: string) {
  if ((await roleIn(teamId, actorId)) !== "OWNER") throw new AppError(403, "OWNER_ONLY", "Only the team owner can delete the team.");
  await prisma.team.delete({ where: { id: teamId } });
  return { deleted: true };
}
