import { PrismaClient } from '@prisma/client';



function createPrismaClient() {
  const baseClient = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  baseClient.$on('warn', (e: any) => {
    console.warn('Prisma Warning:', e.message);
  });

  baseClient.$on('error', (e: any) => {
    const msg = e.message || '';
    // Filter out benign TCP connection resets & idle socket aborts
    // Windows WSAECONNABORTED (10053), WSAECONNRESET (10054), WSAETIMEDOUT (10060), and POSIX equivalents.
    // Cloud database poolers (Supabase / PgBouncer in transaction mode) intentionally close idle sockets.
    // Prisma automatically re-establishes a fresh connection on the next query.
    const isBenignDisconnect =
      msg.includes('10053') ||
      msg.includes('10054') ||
      msg.includes('10060') ||
      msg.includes('ConnectionAborted') ||
      msg.includes('ConnectionReset') ||
      msg.includes('TimedOut') ||
      msg.includes('aborted by the software in your host machine') ||
      msg.includes('forcibly closed by the remote host') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ECONNABORTED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('broken pipe') ||
      msg.includes('server closed the connection unexpectedly') ||
      msg.includes('connection to server was lost') ||
      (msg.includes("Can't reach database server") && msg.includes('pooler.supabase.com')) ||
      (msg.includes('Error in PostgreSQL connection') && (msg.includes('ConnectionAborted') || msg.includes('ConnectionReset')));

    if (isBenignDisconnect) {
      return;
    }
    console.error('Prisma Error:', msg);
  });

  // Resilient query layer: automatically retries transient network/pooler drops
  const extendedClient = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const MAX_RETRIES = 2;
          let attempt = 0;
          while (true) {
            try {
              return await query(args);
            } catch (error: any) {
              attempt++;
              const msg = error?.message || '';
              const isTransientConnError =
                msg.includes("Can't reach database server") ||
                msg.includes('ConnectionAborted') ||
                msg.includes('ConnectionReset') ||
                msg.includes('TimedOut') ||
                msg.includes('10053') ||
                msg.includes('10054') ||
                msg.includes('10060') ||
                msg.includes('ECONNRESET') ||
                msg.includes('ECONNABORTED') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('server closed the connection unexpectedly') ||
                msg.includes('connection to server was lost') ||
                msg.includes('broken pipe');

              if (isTransientConnError && attempt <= MAX_RETRIES) {
                // Short exponential backoff (200ms, 400ms) to allow pooler socket to re-establish
                const backoffMs = attempt * 200;
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                continue;
              }
              throw error;
            }
          }
        },
      },
    },
  });

  return extendedClient;
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  // Prevent multiple instances of Prisma Client in development with hot reload
  var prismaGlobal: ExtendedPrismaClient | undefined;
}

export const prisma = global.prismaGlobal || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;

