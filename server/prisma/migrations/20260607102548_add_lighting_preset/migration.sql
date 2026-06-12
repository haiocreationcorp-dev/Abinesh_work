-- CreateTable
CREATE TABLE "LightingPreset" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✨',
    "temperature" INTEGER NOT NULL DEFAULT 0,
    "tint" INTEGER NOT NULL DEFAULT 0,
    "brightness" INTEGER NOT NULL DEFAULT 0,
    "contrast" INTEGER NOT NULL DEFAULT 0,
    "highlights" INTEGER NOT NULL DEFAULT 0,
    "shadows" INTEGER NOT NULL DEFAULT 0,
    "saturation" INTEGER NOT NULL DEFAULT 0,
    "vibrance" INTEGER NOT NULL DEFAULT 0,
    "bloom" INTEGER NOT NULL DEFAULT 0,
    "glow" INTEGER NOT NULL DEFAULT 0,
    "blur" INTEGER NOT NULL DEFAULT 0,
    "rays" BOOLEAN NOT NULL DEFAULT false,
    "flash" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LightingPreset_pkey" PRIMARY KEY ("id")
);
