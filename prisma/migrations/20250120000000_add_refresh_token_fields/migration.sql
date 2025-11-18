-- Add new fields to RefreshToken table
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "deviceName" VARCHAR(255);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(255);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(255);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "lastActivity" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP;

-- Create index on lastActivity
CREATE INDEX IF NOT EXISTS "ix_RefreshToken_lastActivity" ON "RefreshToken"("lastActivity");

