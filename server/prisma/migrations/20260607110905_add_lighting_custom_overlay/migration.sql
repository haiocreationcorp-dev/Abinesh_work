-- AlterTable
ALTER TABLE "LightingPreset" ADD COLUMN     "overlayBlendMode" TEXT NOT NULL DEFAULT 'multiply',
ADD COLUMN     "overlayColor" TEXT,
ADD COLUMN     "overlayOpacity" INTEGER NOT NULL DEFAULT 0;
