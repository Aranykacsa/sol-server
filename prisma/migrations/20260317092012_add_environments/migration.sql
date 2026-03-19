-- AlterTable
ALTER TABLE "TestServer" ADD COLUMN     "environmentId" TEXT;

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Environment_name_key" ON "Environment"("name");

-- AddForeignKey
ALTER TABLE "TestServer" ADD CONSTRAINT "TestServer_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
