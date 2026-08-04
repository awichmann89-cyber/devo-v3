-- Personalplanung: Personalstamm (Person), Einsätze an Preispositionen
-- (PersonAssignment, Cascade an ProjectService) und Ist-Arbeitszeiten
-- (TimeEntry — Lohn-Belege, hängen an Person+Projekt mit Restrict und nur
-- optional am Einsatz, damit das Löschen einer Position keine erfassten
-- Zeiten vernichtet). Zeiten als Wanduhr-Minuten (DST-immun).

CREATE TYPE "EmploymentType" AS ENUM ('GESELLSCHAFTER', 'MITARBEITER', 'FREELANCER', 'MINIJOBBER');

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FREELANCER',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hourlyWage" DECIMAL(10,2),
    "defaultDayRate" DECIMAL(10,2),
    "personalToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");
CREATE UNIQUE INDEX "Person_personalToken_key" ON "Person"("personalToken");
CREATE INDEX "Person_active_idx" ON "Person"("active");
CREATE INDEX "Person_employmentType_idx" ON "Person"("employmentType");

CREATE TABLE "PersonAssignment" (
    "id" TEXT NOT NULL,
    "projectServiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "agreedRate" DECIMAL(10,2),
    "invoiceReceived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonAssignment_projectServiceId_idx" ON "PersonAssignment"("projectServiceId");
CREATE INDEX "PersonAssignment_projectId_idx" ON "PersonAssignment"("projectId");
CREATE INDEX "PersonAssignment_personId_idx" ON "PersonAssignment"("personId");

ALTER TABLE "PersonAssignment"
  ADD CONSTRAINT "PersonAssignment_projectServiceId_fkey"
  FOREIGN KEY ("projectServiceId") REFERENCES "ProjectService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonAssignment"
  ADD CONSTRAINT "PersonAssignment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonAssignment"
  ADD CONSTRAINT "PersonAssignment_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "hourlyWageSnapshot" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimeEntry_personId_workDate_idx" ON "TimeEntry"("personId", "workDate");
CREATE INDEX "TimeEntry_projectId_idx" ON "TimeEntry"("projectId");
CREATE INDEX "TimeEntry_assignmentId_idx" ON "TimeEntry"("assignmentId");

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "PersonAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
