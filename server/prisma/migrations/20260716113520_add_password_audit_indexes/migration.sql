-- CreateIndex
CREATE INDEX "PasswordResetAudit_performedBy_idx" ON "PasswordResetAudit"("performedBy");

-- CreateIndex
CREATE INDEX "PasswordResetAudit_createdAt_idx" ON "PasswordResetAudit"("createdAt");
