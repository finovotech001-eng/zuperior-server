-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetTokenExpires" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_user_reset_token" ON "User"("resetToken");

