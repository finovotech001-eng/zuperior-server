-- Add new columns to group_management table
ALTER TABLE "group_management" 
ADD COLUMN IF NOT EXISTS "account_type" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "leverage" INTEGER,
ADD COLUMN IF NOT EXISTS "min_deposit" DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS "spread" DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS "commission" DECIMAL(5, 2);

-- Create index on account_type for faster filtering
CREATE INDEX IF NOT EXISTS "group_management_account_type_idx" ON "group_management"("account_type");

-- Populate account_type from group column
-- Extract "Live" or "Demo" based on group path
UPDATE "group_management"
SET "account_type" = CASE
  WHEN "group" ILIKE '%demo%' THEN 'Demo'
  WHEN "group" ILIKE '%real%' THEN 'Live'
  ELSE NULL
END
WHERE "account_type" IS NULL;

