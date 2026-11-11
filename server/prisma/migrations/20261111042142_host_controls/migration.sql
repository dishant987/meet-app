-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ADMITTED', 'WAITING', 'DENIED', 'REMOVED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitingRoom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "isHost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seenAt" TIMESTAMP(3),
ADD COLUMN     "status" "ParticipantStatus" NOT NULL DEFAULT 'ADMITTED',
ADD COLUMN     "ticket" TEXT;
