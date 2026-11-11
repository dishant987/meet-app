-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "inviteSequence" INTEGER NOT NULL DEFAULT 0;
