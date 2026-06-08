-- Verantwortlicher für ein Projekt (separat vom Ersteller)
ALTER TABLE "Project" ADD COLUMN "maintainerId" TEXT;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_maintainerId_fkey"
  FOREIGN KEY ("maintainerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
