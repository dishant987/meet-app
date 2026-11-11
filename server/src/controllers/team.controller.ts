import type { Request, Response } from "express";
import * as teams from "../services/team.service.js";

type P = Request<{ teamId: string; userId: string; inviteId: string }>;
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export const create = async (req: Request, res: Response) => ok(res, await teams.createTeam(req.user!.id, req.body.name), 201);
export const mine = async (req: Request, res: Response) => ok(res, await teams.myTeams(req.user!.id));
export const get = async (req: P, res: Response) => ok(res, await teams.getTeam(req.params.teamId, req.user!.id));
export const update = async (req: P, res: Response) => ok(res, await teams.updateTeam(req.params.teamId, req.user!.id, req.body));
export const remove = async (req: P, res: Response) => ok(res, await teams.deleteTeam(req.params.teamId, req.user!.id));
export const invite = async (req: P, res: Response) =>
  ok(res, await teams.inviteMembers(req.params.teamId, req.user!.id, req.body.emails, req.body.role), 201);
export const cancelInvite = async (req: P, res: Response) => ok(res, await teams.cancelTeamInvite(req.params.teamId, req.user!.id, req.params.inviteId));
export const answer = async (req: P, res: Response) => ok(res, await teams.answerTeamInvite(req.params.inviteId, req.user!.id, req.body.accept));
export const role = async (req: P, res: Response) => ok(res, await teams.changeRole(req.params.teamId, req.user!.id, req.params.userId, req.body.role));
export const removeMember = async (req: P, res: Response) =>
  ok(res, await teams.removeMember(req.params.teamId, req.user!.id, req.params.userId));
