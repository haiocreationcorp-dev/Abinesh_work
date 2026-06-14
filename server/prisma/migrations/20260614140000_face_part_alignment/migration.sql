-- DropTable
DROP TABLE "FaceHairstyleAlignment";

-- CreateTable
CREATE TABLE "FacePartAlignment" (
    "id" TEXT NOT NULL,
    "faceAssetId" TEXT NOT NULL,
    "partAssetId" TEXT NOT NULL,
    "partType" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flipX" BOOLEAN NOT NULL DEFAULT false,
    "flipY" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacePartAlignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacePartAlignment_faceAssetId_partAssetId_partType_key" ON "FacePartAlignment"("faceAssetId", "partAssetId", "partType");
