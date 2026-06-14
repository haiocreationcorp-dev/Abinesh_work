-- CreateTable
CREATE TABLE "FaceHairstyleAlignment" (
    "id" TEXT NOT NULL,
    "faceAssetId" TEXT NOT NULL,
    "hairstyleAssetId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flipX" BOOLEAN NOT NULL DEFAULT false,
    "flipY" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceHairstyleAlignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FaceHairstyleAlignment_faceAssetId_hairstyleAssetId_key" ON "FaceHairstyleAlignment"("faceAssetId", "hairstyleAssetId");
