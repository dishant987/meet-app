import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { limit } from "../middlewares/rateLimit.js";
import { googleBody, loginBody, registerBody } from "../validators/auth.validator.js";

export const authRoutes = Router();

authRoutes.post("/register", limit(5), validate({ body: registerBody }), auth.register);
authRoutes.post("/login", limit(5), validate({ body: loginBody }), auth.login);
authRoutes.post("/logout", auth.logout);
authRoutes.get("/me", auth.me);
authRoutes.post("/google", limit(10), validate({ body: googleBody }), auth.google);
