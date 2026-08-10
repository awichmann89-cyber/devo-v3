-- Add CABLE value to ProjectGroupKind enum.
-- Postgres requires ALTER TYPE ... ADD VALUE outside a transaction block,
-- which Prisma migrate handles by running each statement separately.
ALTER TYPE "ProjectGroupKind" ADD VALUE IF NOT EXISTS 'CABLE';
