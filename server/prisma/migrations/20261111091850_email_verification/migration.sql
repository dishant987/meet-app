-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Accounts that existed before this change keep working as before: count them as confirmed.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";
