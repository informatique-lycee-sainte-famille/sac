/*
  Warnings:

  - You are about to drop the column `attendanceViaSchedule` on the `InstitutionSettings` table. All the data in the column will be lost.
  - You are about to drop the column `attendanceViaTimegrid` on the `InstitutionSettings` table. All the data in the column will be lost.
  - You are about to drop the column `badgeUid` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_classId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_groupId_fkey";

-- DropIndex
DROP INDEX "Student_badgeUid_key";

-- AlterTable
ALTER TABLE "InstitutionSettings" DROP COLUMN "attendanceViaSchedule",
DROP COLUMN "attendanceViaTimegrid";

-- AlterTable
ALTER TABLE "NfcScan" ADD COLUMN     "DeviceId" TEXT,
ADD COLUMN     "UserAgent" TEXT;

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "badgeUid",
DROP COLUMN "groupId";

-- DropTable
DROP TABLE "Group";
