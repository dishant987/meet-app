import express, { Router } from "express";
import * as profile from "../controllers/profile.controller.js";
import { requireConfirmed } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";
import { nameBody, passwordBody, userIdParams } from "../validators/profile.validator.js";

// /api/me — the signed-in person's own profile
export const meRoutes = Router();
meRoutes.use(requireConfirmed);
meRoutes.patch("/", limit(20), validate({ body: nameBody }), profile.updateName);
// raw image body, max 200 KB (the app resizes photos to 256×256 before uploading)
meRoutes.put(
  "/avatar",
  limit(10),
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "200kb" }),
  profile.uploadAvatar,
);
meRoutes.delete("/avatar", limit(10), profile.removeAvatar);
meRoutes.post("/password", limit(5, 15 * 60_000), validate({ body: passwordBody }), profile.changePassword);

// /api/users/:id/avatar — public photos (shown to other people in meetings)
export const userRoutes = Router();
userRoutes.get("/:id/avatar", validate({ params: userIdParams }), profile.avatar);
