// ./prisma.config.js
require("./API_SAC/commons/env.common");
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: env('DATABASE_URL')
  },
});
