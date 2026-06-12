-- CreateTable
CREATE TABLE "Pose" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rotations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pose_pkey" PRIMARY KEY ("id")
);
