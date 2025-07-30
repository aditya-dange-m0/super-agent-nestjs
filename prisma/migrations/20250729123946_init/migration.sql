-- CreateIndex
CREATE INDEX "app_connections_userId_status_idx" ON "app_connections"("userId", "status");

-- CreateIndex
CREATE INDEX "app_connections_status_idx" ON "app_connections"("status");

-- CreateIndex
CREATE INDEX "messages_conversationId_timestamp_idx" ON "messages"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "messages_timestamp_idx" ON "messages"("timestamp");

-- CreateIndex
CREATE INDEX "sessions_userId_lastActivity_idx" ON "sessions"("userId", "lastActivity");

-- CreateIndex
CREATE INDEX "sessions_userId_isActive_idx" ON "sessions"("userId", "isActive");
