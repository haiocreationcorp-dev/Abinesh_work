-- AlterTable
ALTER TABLE "BackgroundSubcategory" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundSubcategory_code_key" ON "BackgroundSubcategory"("code");
