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

  return client;
}

export const prisma = global.prismaGlobal || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export default prisma;

