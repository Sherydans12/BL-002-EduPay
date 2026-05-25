-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE';
