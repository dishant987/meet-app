-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" BYTEA,
ADD COLUMN     "avatarType" TEXT,
ADD COLUMN     "avatarVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pictureUrl" TEXT;
