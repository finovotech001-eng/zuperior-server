# Database Migration Guide

This guide will help you update your database schema to support the new email functionality.

## Prerequisites

- PostgreSQL database connection configured
- Prisma CLI installed (`npm install -g prisma` or use `npx prisma`)
- Access to the database with migration permissions

## Migration Steps

### Option 1: Using Prisma Migrate (Recommended)

This is the safest and most straightforward method:

```bash
# Navigate to the server directory
cd zuperior-server

# Create and apply the migration
npx prisma migrate dev --name add_password_reset_token

# Generate Prisma Client
npx prisma generate
```

This will:
1. Create a new migration file in `prisma/migrations/`
2. Apply the migration to your database
3. Update the Prisma Client

### Option 2: Manual SQL Migration

If you prefer to apply the migration manually, use the following SQL:

```sql
-- Create PasswordResetToken table
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- Add foreign key constraint
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

After running the SQL manually, you must regenerate the Prisma Client:

```bash
npx prisma generate
```

## Verification

After migration, verify the table was created successfully:

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'PasswordResetToken';

-- Check table structure
\d "PasswordResetToken"
```

## Rollback (If Needed)

If you need to rollback the migration:

### Using Prisma Migrate

```bash
# Rollback to previous migration
npx prisma migrate reset

# Note: This will reset your entire database!
# Use with caution in production
```

### Manual Rollback

```sql
-- Drop the table
DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;
```

## Cleanup Old Reset Tokens

You may want to periodically clean up expired reset tokens:

```sql
-- Delete expired and used tokens older than 7 days
DELETE FROM "PasswordResetToken" 
WHERE (used = true OR "expiresAt" < CURRENT_TIMESTAMP) 
AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '7 days';
```

Consider setting up a cron job or scheduled task to run this cleanup regularly.

## Production Migration

For production environments:

1. **Backup your database first!**
   ```bash
   pg_dump -U username -h hostname dbname > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Test the migration on a staging environment**

3. **Schedule maintenance window** if possible

4. **Apply migration during low-traffic period**

5. **Monitor for errors** after migration

6. **Keep backup for at least 30 days**

## Database Schema Changes Summary

The migration adds the following:

### New Table: PasswordResetToken

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | Foreign key to User table |
| token | String | Hashed reset token (unique) |
| used | Boolean | Whether token has been used |
| expiresAt | DateTime | Token expiration time |
| createdAt | DateTime | Token creation time |

### Indexes Added

- Unique index on `token` for fast lookups
- Index on `userId` for user-specific queries
- Index on `expiresAt` for cleanup operations

### Relations Added

- One-to-Many relationship: User → PasswordResetToken
- Cascade delete: When user is deleted, all their reset tokens are deleted

## Testing the Migration

After migration, test the password reset flow:

1. Request password reset:
   ```bash
   curl -X POST http://localhost:5000/api/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```

2. Check database:
   ```sql
   SELECT * FROM "PasswordResetToken" ORDER BY "createdAt" DESC LIMIT 1;
   ```

3. Reset password using token from email

4. Verify token is marked as used:
   ```sql
   SELECT used, "expiresAt" FROM "PasswordResetToken" WHERE token = 'your-token-hash';
   ```

## Troubleshooting

### "Table already exists"
The table may have been created already. Run:
```bash
npx prisma db pull
npx prisma generate
```

### "Migration failed"
Check database connection and user permissions:
```bash
psql -U username -h hostname -d dbname -c "\dt"
```

### "Prisma Client error"
Regenerate the Prisma Client:
```bash
npx prisma generate
```

Then restart your application.

## Support

If you encounter issues during migration:
1. Check database logs
2. Verify database user permissions
3. Ensure database is accessible
4. Check Prisma schema syntax

---

Last Updated: October 2024

