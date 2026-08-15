-- AlterTable
ALTER TABLE "ReportInvite" ADD COLUMN     "personId" TEXT;

-- AddForeignKey
ALTER TABLE "ReportInvite" ADD CONSTRAINT "ReportInvite_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
