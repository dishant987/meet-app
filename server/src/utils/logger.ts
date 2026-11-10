import pino from "pino";
import { isProd } from "../config/env.js";

export const logger = pino(
  isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } } },
);
