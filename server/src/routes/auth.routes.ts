import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { forgotLimiters, limit, loginLimiters, registerLimiter } from "../middlewares/rateLimit.js";
import { forgotBody, googleBody, loginBody, registerBody, resetBody } from "../validators/auth.validator.js";

export const authRoutes = Router();

authRoutes.post("/register", registerLimiter, validate({ body: registerBody }), auth.register);
authRoutes.post("/login", ...loginLimiters, validate({ body: loginBody }), auth.login);
authRoutes.post("/logout", auth.logout);
authRoutes.get("/me", auth.me);
authRoutes.post("/google", limit(20, 15 * 60_000), validate({ body: googleBody }), auth.google);
authRoutes.post("/forgot-password", ...forgotLimiters, validate({ body: forgotBody }), auth.forgotPassword);
authRoutes.post("/reset-password", limit(10, 15 * 60_000), validate({ body: resetBody }), auth.resetPassword);
