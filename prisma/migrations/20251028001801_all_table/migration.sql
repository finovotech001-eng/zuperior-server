-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYC" (
    "id" TEXT NOT NULL,
    "isDocumentVerified" BOOLEAN NOT NULL DEFAULT false,
    "isAddressVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'Pending',
    "documentReference" TEXT,
    "addressReference" TEXT,
    "amlReference" TEXT,
    "documentSubmittedAt" TIMESTAMP(3),
    "addressSubmittedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "KYC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MT5Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "password" TEXT,
    "leverage" INTEGER,

    CONSTRAINT "MT5Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MT5Transaction" (
    "id" VARCHAR NOT NULL,
    "type" VARCHAR NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" VARCHAR,
    "paymentMethod" VARCHAR,
    "transactionId" VARCHAR,
    "comment" VARCHAR,
    "mt5AccountId" VARCHAR NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "currency" VARCHAR,
    "depositId" VARCHAR,
    "withdrawalId" VARCHAR,
    "userId" VARCHAR,
    "processedBy" VARCHAR,
    "processedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MT5Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "depositId" TEXT,
    "withdrawalId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mt5AccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "transactionHash" TEXT,
    "proofFileUrl" TEXT,
    "bankDetails" TEXT,
    "cryptoAddress" TEXT,
    "depositAddress" TEXT,
    "externalTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mt5AccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "bankDetails" TEXT,
    "cryptoAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "externalTransactionId" TEXT,
    "paymentMethod" TEXT,
    "processedAt" TIMESTAMP(3),
    "walletAddress" TEXT,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "network" TEXT NOT NULL DEFAULT 'TRC20',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultMT5Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mt5AccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultMT5Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "group" TEXT,
    "digits" INTEGER NOT NULL DEFAULT 5,
    "contractSize" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "minVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "maxVolume" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "volumeStep" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "spread" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tradingHours" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" VARCHAR NOT NULL,
    "userId" VARCHAR NOT NULL,
    "token" VARCHAR NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "admin_role" VARCHAR(50) DEFAULT 'admin',
    "is_active" BOOLEAN DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "login_attempts" INTEGER DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_login_log" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "location" VARCHAR(255),
    "device" VARCHAR(255),
    "browser" VARCHAR(255),
    "os" VARCHAR(255),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "failure_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_operation_history" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "mt5_login" VARCHAR(50) NOT NULL,
    "operation_type" VARCHAR(50) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "error_message" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_operation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "user_name" VARCHAR(255) NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "admin_id" VARCHAR(255),
    "status" VARCHAR(20) DEFAULT 'open',
    "priority" VARCHAR(20) DEFAULT 'normal',
    "subject" VARCHAR(500),
    "last_message_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" VARCHAR(255),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unread_count_admin" INTEGER DEFAULT 0,
    "unread_count_user" INTEGER DEFAULT 0,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER,
    "sender_id" VARCHAR(255) NOT NULL,
    "sender_name" VARCHAR(255) NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "message_type" VARCHAR(20) DEFAULT 'text',
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "is_read" BOOLEAN DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_participants" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER,
    "user_id" VARCHAR(255) NOT NULL,
    "user_name" VARCHAR(255) NOT NULL,
    "user_type" VARCHAR(20) NOT NULL,
    "role" VARCHAR(20) DEFAULT 'participant',
    "joined_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_commission_structures" (
    "id" SERIAL NOT NULL,
    "group_id" VARCHAR(255) NOT NULL,
    "structure_name" VARCHAR(100) NOT NULL,
    "usd_per_lot" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "spread_share_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_commission_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_admin" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) DEFAULT 'admin',
    "is_active" BOOLEAN DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "login_attempts" INTEGER DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ib_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_requests" (
    "id" SERIAL NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "ib_type" VARCHAR(50) NOT NULL DEFAULT 'common',
    "submitted_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "usd_per_lot" DECIMAL(10,2),
    "spread_percentage_per_lot" DECIMAL(5,2),
    "admin_comments" TEXT,
    "group_id" VARCHAR(255),
    "structure_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ib_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_gateway" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "details" TEXT NOT NULL,
    "icon_url" VARCHAR(500),
    "qr_code_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mt5_groups" (
    "id" SERIAL NOT NULL,
    "group_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "synced_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mt5_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway" (
    "id" SERIAL NOT NULL,
    "wallet_name" VARCHAR(255) NOT NULL,
    "deposit_wallet_address" VARCHAR(255) NOT NULL,
    "api_key" TEXT NOT NULL,
    "secret_key" TEXT NOT NULL,
    "gateway_type" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbols" (
    "id" SERIAL NOT NULL,
    "symbol_name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "symbol_type" VARCHAR(20),
    "group_name" VARCHAR(100),
    "digits" INTEGER DEFAULT 5,
    "spread" DOUBLE PRECISION DEFAULT 0,
    "contract_size" INTEGER DEFAULT 100000,
    "profit_mode" VARCHAR(20) DEFAULT 'forex',
    "enable" BOOLEAN DEFAULT true,
    "swap_mode" VARCHAR(20) DEFAULT 'disabled',
    "swap_long" DOUBLE PRECISION DEFAULT 0,
    "swap_short" DOUBLE PRECISION DEFAULT 0,
    "swap3_day" VARCHAR(10) DEFAULT 'wednesday',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_group_assignments" (
    "id" SERIAL NOT NULL,
    "ib_request_id" INTEGER,
    "group_id" VARCHAR(255) NOT NULL,
    "group_name" VARCHAR(255),
    "structure_id" INTEGER,
    "structure_name" VARCHAR(255),
    "usd_per_lot" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "spread_share_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ib_group_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ib_trade_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT,
    "ib_request_id" INTEGER,
    "symbol" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "volume_lots" DECIMAL NOT NULL,
    "open_price" DECIMAL,
    "close_price" DECIMAL,
    "profit" DECIMAL,
    "ib_commission" DECIMAL DEFAULT 0,
    "take_profit" DECIMAL,
    "stop_loss" DECIMAL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "group_id" TEXT,

    CONSTRAINT "ib_trade_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "ticket_no" VARCHAR(50) NOT NULL,
    "parent_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "ticket_type" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'New',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "assigned_to" VARCHAR(255),
    "account_number" VARCHAR(50),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_reply_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by" VARCHAR(255),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_replies" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "reply_id" INTEGER,
    "sender_id" VARCHAR(255) NOT NULL,
    "sender_name" VARCHAR(255) NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "support_ticket_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_articles" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(1000),
    "category" VARCHAR(100) NOT NULL,
    "tags" TEXT[],
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "author_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "support_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_faq" (
    "id" SERIAL NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "tags" TEXT[],
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(100),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_replies" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "sender_id" VARCHAR(255) NOT NULL,
    "sender_name" VARCHAR(255) NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clientId_key" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "KYC_userId_key" ON "KYC"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MT5Account_accountId_key" ON "MT5Account"("accountId");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_depositId" ON "MT5Transaction"("depositId");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_mt5AccountId" ON "MT5Transaction"("mt5AccountId");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_status" ON "MT5Transaction"("status");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_type" ON "MT5Transaction"("type");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_userId" ON "MT5Transaction"("userId");

-- CreateIndex
CREATE INDEX "ix_MT5Transaction_withdrawalId" ON "MT5Transaction"("withdrawalId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_depositId_idx" ON "Transaction"("depositId");

-- CreateIndex
CREATE INDEX "Transaction_withdrawalId_idx" ON "Transaction"("withdrawalId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_mt5AccountId_idx" ON "Deposit"("mt5AccountId");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_createdAt_idx" ON "Deposit"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_mt5AccountId_idx" ON "Withdrawal"("mt5AccountId");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "Withdrawal_createdAt_idx" ON "Withdrawal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "PaymentMethod_status_idx" ON "PaymentMethod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultMT5Account_userId_key" ON "DefaultMT5Account"("userId");

-- CreateIndex
CREATE INDEX "DefaultMT5Account_mt5AccountId_idx" ON "DefaultMT5Account"("mt5AccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ix_RefreshToken_token" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "ix_RefreshToken_expiresAt" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ix_RefreshToken_userId" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "UserFavorite_instrumentId_idx" ON "UserFavorite"("instrumentId");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_idx" ON "UserFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_instrumentId_key" ON "UserFavorite"("userId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_username_key" ON "admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE INDEX "admin_login_log_admin_id_idx" ON "admin_login_log"("admin_id");

-- CreateIndex
CREATE INDEX "admin_login_log_created_at_idx" ON "admin_login_log"("created_at");

-- CreateIndex
CREATE INDEX "balance_operation_history_admin_id_idx" ON "balance_operation_history"("admin_id");

-- CreateIndex
CREATE INDEX "balance_operation_history_created_at_idx" ON "balance_operation_history"("created_at");

-- CreateIndex
CREATE INDEX "balance_operation_history_mt5_login_idx" ON "balance_operation_history"("mt5_login");

-- CreateIndex
CREATE INDEX "balance_operation_history_operation_type_idx" ON "balance_operation_history"("operation_type");

-- CreateIndex
CREATE UNIQUE INDEX "chat_participants_conversation_id_user_id_key" ON "chat_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_commission_structures_group_id_structure_name_key" ON "group_commission_structures"("group_id", "structure_name");

-- CreateIndex
CREATE UNIQUE INDEX "ib_admin_email_key" ON "ib_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ib_requests_email_key" ON "ib_requests"("email");

-- CreateIndex
CREATE INDEX "manual_gateway_is_active_idx" ON "manual_gateway"("is_active");

-- CreateIndex
CREATE INDEX "manual_gateway_type_idx" ON "manual_gateway"("type");

-- CreateIndex
CREATE UNIQUE INDEX "mt5_groups_group_id_key" ON "mt5_groups"("group_id");

-- CreateIndex
CREATE INDEX "payment_gateway_gateway_type_idx" ON "payment_gateway"("gateway_type");

-- CreateIndex
CREATE INDEX "payment_gateway_is_active_idx" ON "payment_gateway"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "symbols_symbol_name_key" ON "symbols"("symbol_name");

-- CreateIndex
CREATE UNIQUE INDEX "ib_trade_history_order_id_key" ON "ib_trade_history"("order_id");

-- CreateIndex
CREATE INDEX "idx_ib_trade_account" ON "ib_trade_history"("account_id");

-- CreateIndex
CREATE INDEX "idx_ib_trade_group" ON "ib_trade_history"("group_id");

-- CreateIndex
CREATE INDEX "idx_ib_trade_ib" ON "ib_trade_history"("ib_request_id");

-- CreateIndex
CREATE INDEX "idx_ib_trade_symbol" ON "ib_trade_history"("symbol");

-- CreateIndex
CREATE INDEX "idx_ib_trade_user" ON "ib_trade_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticket_no_key" ON "support_tickets"("ticket_no");

-- CreateIndex
CREATE INDEX "support_tickets_parent_id_idx" ON "support_tickets"("parent_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_ticket_no_idx" ON "support_tickets"("ticket_no");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

-- CreateIndex
CREATE INDEX "support_ticket_replies_ticket_id_idx" ON "support_ticket_replies"("ticket_id");

-- CreateIndex
CREATE INDEX "support_ticket_replies_reply_id_idx" ON "support_ticket_replies"("reply_id");

-- CreateIndex
CREATE INDEX "support_ticket_replies_created_at_idx" ON "support_ticket_replies"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_articles_slug_key" ON "support_articles"("slug");

-- CreateIndex
CREATE INDEX "support_articles_slug_idx" ON "support_articles"("slug");

-- CreateIndex
CREATE INDEX "support_articles_category_idx" ON "support_articles"("category");

-- CreateIndex
CREATE INDEX "support_articles_is_published_idx" ON "support_articles"("is_published");

-- CreateIndex
CREATE INDEX "support_articles_created_at_idx" ON "support_articles"("created_at");

-- CreateIndex
CREATE INDEX "support_faq_category_idx" ON "support_faq"("category");

-- CreateIndex
CREATE INDEX "support_faq_is_active_idx" ON "support_faq"("is_active");

-- CreateIndex
CREATE INDEX "support_faq_display_order_idx" ON "support_faq"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "support_categories_name_key" ON "support_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "support_categories_slug_key" ON "support_categories"("slug");

-- CreateIndex
CREATE INDEX "support_categories_slug_idx" ON "support_categories"("slug");

-- CreateIndex
CREATE INDEX "support_categories_is_active_idx" ON "support_categories"("is_active");

-- CreateIndex
CREATE INDEX "support_replies_ticket_id_idx" ON "support_replies"("ticket_id");

-- AddForeignKey
ALTER TABLE "KYC" ADD CONSTRAINT "KYC_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MT5Account" ADD CONSTRAINT "MT5Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MT5Transaction" ADD CONSTRAINT "MT5Transaction_mt5AccountId_fkey" FOREIGN KEY ("mt5AccountId") REFERENCES "MT5Account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_mt5AccountId_fkey" FOREIGN KEY ("mt5AccountId") REFERENCES "MT5Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_mt5AccountId_fkey" FOREIGN KEY ("mt5AccountId") REFERENCES "MT5Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultMT5Account" ADD CONSTRAINT "DefaultMT5Account_mt5AccountId_fkey" FOREIGN KEY ("mt5AccountId") REFERENCES "MT5Account"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultMT5Account" ADD CONSTRAINT "DefaultMT5Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_login_log" ADD CONSTRAINT "admin_login_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_operation_history" ADD CONSTRAINT "balance_operation_history_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ib_group_assignments" ADD CONSTRAINT "ib_group_assignments_ib_request_id_fkey" FOREIGN KEY ("ib_request_id") REFERENCES "ib_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
