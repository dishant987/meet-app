import { Router } from "express";
import * as team from "../controllers/team.controller.js";
import { requireConfirmed } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";
import {
  answerBody,
  answerParams,
  createTeamBody,
  inviteBody,
  inviteParams,
  memberParams,
  roleBody,
  settingsBody,
  teamIdParams,
} from "../validators/team.validator.js";

// /api/teams — signed in with a confirmed email
export const teamRoutes = Router();
teamRoutes.use(requireConfirmed);
teamRoutes.get("/", limit(60), team.mine);
teamRoutes.post("/", limit(10), validate({ body: createTeamBody }), team.create);
teamRoutes.post("/invites/:inviteId", limit(30), validate({ params: answerParams, body: answerBody }), team.answer);
teamRoutes.get("/:teamId", limit(60), validate({ params: teamIdParams }), team.get);
teamRoutes.patch("/:teamId", limit(30), validate({ params: teamIdParams, body: settingsBody }), team.update);
teamRoutes.delete("/:teamId", limit(10), validate({ params: teamIdParams }), team.remove);
teamRoutes.post("/:teamId/invites", limit(20), validate({ params: teamIdParams, body: inviteBody }), team.invite);
teamRoutes.delete("/:teamId/invites/:inviteId", limit(30), validate({ params: inviteParams }), team.cancelInvite);
teamRoutes.patch("/:teamId/members/:userId", limit(30), validate({ params: memberParams, body: roleBody }), team.role);
teamRoutes.delete("/:teamId/members/:userId", limit(30), validate({ params: memberParams }), team.removeMember);
