import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

// Reuse the client across HMR reloads in dev instead of exhausting
// connections — standard Remix + Prisma pattern.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const db: PrismaClient = global.prismaGlobal ?? new PrismaClient();

export default db;
