-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'REMINDER');

-- AlterTable
ALTER TABLE "Invoice"
  ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "reminderLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "relatedInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_relatedInvoiceId_idx" ON "Invoice"("relatedInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
