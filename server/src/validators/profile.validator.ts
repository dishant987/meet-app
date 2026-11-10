import { z } from "zod";

export const nameBody = z.object({ name: z.string().trim().min(1, "Name is required").max(50) });
export const passwordBody = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8, "Use at least 8 characters").max(128),
});
export const userIdParams = z.object({ id: z.string().min(1).max(40) });
