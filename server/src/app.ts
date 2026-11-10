import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { health } from "./controllers/health.controller.js";
import { meetingRoutes } from "./routes/meeting.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { meRoutes, userRoutes } from "./routes/profile.routes.js";
import { loadUser } from "./middlewares/auth.js";
import { apiLimiter } from "./middlewares/rateLimit.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

export const app = express();

app.set("trust proxy", 1); // Render/Vercel sit behind a proxy; needed for correct IPs in rate limiting
// Logger first, so every request (even ones with broken JSON) gets req.log and a request ID.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers["x-request-id"] as string) || randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
  }),
);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(loadUser);
app.use("/api", apiLimiter);

app.get("/api/health", health);
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/me", meRoutes);
app.use("/api/users", userRoutes);

app.use(notFound);
app.use(errorHandler);
