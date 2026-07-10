-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");
