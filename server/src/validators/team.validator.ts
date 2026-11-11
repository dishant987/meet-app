import { z } from "zod";

const teamName = z.string().trim().min(1, "Give the team a name").max(60, "Keep the name under 60 characters");
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter domains like acme.com"));

export const teamIdParams = z.object({ teamId: z.string().min(1).max(40) });
export const memberParams = teamIdParams.extend({ userId: z.string().min(1).max(40) });
export const inviteParams = teamIdParams.extend({ inviteId: z.string().min(1).max(40) });
export const answerParams = z.object({ inviteId: z.string().min(1).max(40) });

export const createTeamBody = z.object({ name: teamName });
export const inviteBody = z.object({
  emails: z.array(z.string().trim().toLowerCase().pipe(z.email("Enter valid email addresses"))).min(1, "Add at least one email").max(20, "Invite up to 20 at a time"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});
export const answerBody = z.object({ accept: z.boolean() });
export const roleBody = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });
export const settingsBody = z
  .object({
    name: teamName.optional(),
    askToJoin: z.boolean().optional(),
    allowedDomains: z.array(domain).max(10, "Up to 10 domains").optional(),
    recording: z.enum(["HOST", "OFF"]).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to change");
