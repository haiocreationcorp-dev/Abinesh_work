-- CreateEnum
CREATE TYPE "AssetView" AS ENUM ('FRONT', 'THREE_QUARTER');

-- CreateEnum
CREATE TYPE "FacePartType" AS ENUM ('FACE_SHAPE', 'HAIR', 'EYES', 'MOUTH');

-- CreateEnum
CREATE TYPE "PoseType" AS ENUM ('STANDING', 'WALKING', 'RUNNING', 'SITTING', 'POINTING', 'TALKING', 'READING', 'ARMS_CROSSED');

-- AlterEnum
BEGIN;
CREATE TYPE "AssetCategory_new" AS ENUM ('FACE_PART', 'FACE_TEMPLATE', 'BODY_POSE', 'BACKGROUND', 'PROP', 'EFFECT', 'BUBBLE', 'SOUND');
ALTER TABLE "Asset" ALTER COLUMN "category" TYPE "AssetCategory_new" USING ("category"::text::"AssetCategory_new");
ALTER TYPE "AssetCategory" RENAME TO "AssetCategory_old";
ALTER TYPE "AssetCategory_new" RENAME TO "AssetCategory";
DROP TYPE "AssetCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "costume" TEXT,
ADD COLUMN     "faceFamily" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "partType" "FacePartType",
ADD COLUMN     "poseType" "PoseType",
ADD COLUMN     "view" "AssetView";

-- CreateTable
CREATE TABLE "Expression" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eyeAssetId" TEXT NOT NULL,
    "mouthAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frontFaceId" TEXT NOT NULL,
    "threeQuarterFaceId" TEXT,
    "skinTone" TEXT NOT NULL,
    "hairColor" TEXT NOT NULL,
    "irisColor" TEXT,
    "defaultExpressionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterPreset_pkey" PRIMARY KEY ("id")
);

