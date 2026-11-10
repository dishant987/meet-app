import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { USER_FIELDS, hashPassword, publicUser, verifyPassword } from "./auth.service.js";

export async function updateName(userId: string, name: string) {
  return publicUser(await prisma.user.update({ where: { id: userId }, data: { name }, select: USER_FIELDS }));
}

/** What the file really is, judged by its first bytes (not by what the browser claims). */
function sniffImage(b: Buffer): string | null {
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export async function setAvatar(userId: string, body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError(400, "NO_IMAGE", "Choose a photo to upload");
  const type = sniffImage(body);
  if (!type) throw new AppError(415, "UNSUPPORTED_IMAGE", "Use a JPG, PNG or WebP photo");
  return publicUser(
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: new Uint8Array(body), avatarType: type, avatarVersion: { increment: 1 } },
      select: USER_FIELDS,
    }),
  );
}

export async function removeAvatar(userId: string) {
  return publicUser(
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatarType: null, avatarVersion: { increment: 1 } },
      select: USER_FIELDS,
    }),
  );
}

export async function getAvatar(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true, avatarType: true } });
  if (!u?.avatar || !u.avatarType) throw new AppError(404, "NO_AVATAR", "No photo");
  return { bytes: Buffer.from(u.avatar), type: u.avatarType };
}

/** Change the password (current one required), or set a first one for a Google-only account. */
export async function changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (u.passwordHash) {
    if (!currentPassword || !(await verifyPassword(currentPassword, u.passwordHash)))
      throw new AppError(400, "WRONG_PASSWORD", "Your current password is wrong", { currentPassword: ["Your current password is wrong"] });
  }
  return publicUser(
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) }, select: USER_FIELDS }),
  );
}
