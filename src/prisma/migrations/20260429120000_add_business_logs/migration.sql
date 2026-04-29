-- ./prisma/migrations/20260429120000_add_business_logs/migration.sql
CREATE TABLE "BusinessLog" (
  "id" SERIAL NOT NULL,
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "userId" INTEGER,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessLog_createdAt_idx" ON "BusinessLog"("createdAt");
CREATE INDEX "BusinessLog_event_idx" ON "BusinessLog"("event");
CREATE INDEX "BusinessLog_userId_createdAt_idx" ON "BusinessLog"("userId", "createdAt");

ALTER TABLE "BusinessLog"
ADD CONSTRAINT "BusinessLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
