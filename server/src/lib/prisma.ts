import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances of Prisma Client in development with hot reload
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  (client as any).$on('warn', (e: any) => {
    console.warn('Prisma Warning:', e.message);
  });

  (client as any).$on('error', (e: any) => {
    const msg = e.message || '';
    // Filter out benign TCP connection resets (code 10054 on Windows / ECONNRESET on Linux)
    // Cloud database poolers (Supabase / PgBouncer) intentionally close idle sockets.
    // Prisma automatically re-establishes a fresh connection on the next query.
    if (
      msg.includes('10054') ||
      msg.includes('ConnectionReset') ||
      msg.includes('forcibly closed by the remote host') ||
      msg.includes('ECONNRESET') ||
      msg.includes('broken pipe')
    ) {
      return;
    }
    console.error('Prisma Error:', msg);
  });

  return client;
}

export const prisma = global.prismaGlobal || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;

