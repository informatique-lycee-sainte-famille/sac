import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
// import "./env";
const DATABASE_URL = "postgresql://sac_user:sac_password@172.16.108.110:5432/sac_db";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
export const prisma = new PrismaClient({ adapter });