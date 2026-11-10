import type { Request, Response } from "express";
import { prisma } from "../config/db.js";

export async function health(_req: Request, res: Response) {
  let database = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }
  res.status(database === "up" ? 200 : 503).json({
    success: database === "up",
    data: { status: database === "up" ? "ok" : "degraded", database, uptime: Math.round(process.uptime()) },
  });
}
