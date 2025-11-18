-- Add mt5AccountId column to Withdrawal table
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "mt5AccountId" TEXT;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Withdrawal_mt5AccountId_fkey'
    ) THEN
        ALTER TABLE "Withdrawal" 
        ADD CONSTRAINT "Withdrawal_mt5AccountId_fkey" 
        FOREIGN KEY ("mt5AccountId") 
        REFERENCES "MT5Account"("id") 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
    END IF;
END $$;

-- Add index on mt5AccountId
CREATE INDEX IF NOT EXISTS "Withdrawal_mt5AccountId_idx" ON "Withdrawal"("mt5AccountId");

-- Update existing internal transfer withdrawals to set mt5AccountId
-- Link withdrawals to accounts via MT5Transaction.externalTransactionId
UPDATE "Withdrawal" w
SET "mt5AccountId" = mt."mt5AccountId"
FROM "MT5Transaction" mt
WHERE w."externalTransactionId" = mt."id"
  AND w."paymentMethod" = 'internal_transfer'
  AND w."mt5AccountId" IS NULL;
