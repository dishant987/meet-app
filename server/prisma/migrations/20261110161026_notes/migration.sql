-- CreateEnum
CREATE TYPE "NotesStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'EMPTY');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "hostKey" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Notes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "status" "NotesStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "keyPoints" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "openQuestions" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT,
    "error" TEXT,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notes_meetingId_key" ON "Notes"("meetingId");

-- AddForeignKey
ALTER TABLE "Notes" ADD CONSTRAINT "Notes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
