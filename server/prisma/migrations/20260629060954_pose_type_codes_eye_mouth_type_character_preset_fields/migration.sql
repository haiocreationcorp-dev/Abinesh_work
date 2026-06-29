-- AlterEnum
BEGIN;
CREATE TYPE "PoseType_new" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20', 'P21', 'P22', 'P23', 'P24');
ALTER TABLE "Asset" ALTER COLUMN "poseType" TYPE "PoseType_new" USING ("poseType"::text::"PoseType_new");
ALTER TYPE "PoseType" RENAME TO "PoseType_old";
ALTER TYPE "PoseType_new" RENAME TO "PoseType";
DROP TYPE "PoseType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "eyeType" TEXT,
ADD COLUMN     "mouthType" TEXT;

-- AlterTable
ALTER TABLE "CharacterPreset" ADD COLUMN     "defaultBodyPoseId" TEXT,
ADD COLUMN     "defaultFaceView" TEXT,
ALTER COLUMN "frontFaceId" DROP NOT NULL;
