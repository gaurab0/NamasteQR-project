import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { determineItemStation } from '../../../src/utils/menuUtils';

type PrismaWriter = any;

export type AgentJobPayload = {
  order?: Record<string, unknown>;
  base64?: string;
};

export interface ClaimedPrintJob {
  id: string;
  printer_role: string;
  payload_type: string;
  payload: AgentJobPayload;
  attempt_count: number;
  created_at: Date;
}

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAgentToken(): string {
  return `nqr_pa_${randomBytes(32).toString('base64url')}`;
}

export function secureHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Creates kitchen/bar outbox jobs in the same transaction as the order write.
 * The on-site agent renders the JSON order with its local paper/cut settings.
 */
export async function enqueueOrderPrintJobs(
  tx: PrismaWriter,
  order: Record<string, any>,
): Promise<{ agentManaged: boolean; created: number }> {
  const businessId = String(order.business_id || '');
  if (!businessId) return { agentManaged: false, created: 0 };

  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: { kds_print_mode: true },
  });
  const mode = String(business?.kds_print_mode || 'DISPLAY_ONLY').toUpperCase();
  if (mode === 'DISPLAY_ONLY') return { agentManaged: false, created: 0 };

  const agent = await tx.printerAgent.findFirst({
    where: { business_id: businessId, revoked_at: null },
    select: { id: true },
  });
  if (!agent) return { agentManaged: false, created: 0 };

  const items = Array.isArray(order.items) ? order.items : [];
  const byRole: Record<'KOT' | 'BOT', any[]> = { KOT: [], BOT: [] };
  for (const item of items) {
    if (!item || typeof item !== 'object' || String(item.status || '').toUpperCase() === 'CANCELLED') continue;
    const rawStation = String(item.station || '').toUpperCase();
    const station = rawStation === 'KITCHEN' || rawStation === 'BAR' || rawStation === 'BOTH'
      ? rawStation
      : determineItemStation(item);
    if (station === 'KITCHEN' || station === 'BOTH') byRole.KOT.push(item);
    if (station === 'BAR' || station === 'BOTH') byRole.BOT.push(item);
  }

  // Pay-first QR tickets are queued after payment confirmation, not before.
  if (String(order.status || '').toUpperCase() !== 'RECEIVED') {
    return { agentManaged: true, created: 0 };
  }

  const round = Number(order.round_number) || 1;
  const rows = (Object.entries(byRole) as Array<['KOT' | 'BOT', any[]]>)
    .filter(([, roleItems]) => roleItems.length > 0)
    .map(([role, roleItems]) => ({
      business_id: businessId,
      order_id: String(order.id),
      printer_role: role,
      payload_type: 'ORDER',
      payload: JSON.parse(JSON.stringify({
        order: {
          ...order,
          items: roleItems,
        },
      })) as Prisma.InputJsonValue,
      status: 'PENDING',
      dedupe_key: `${businessId}:${order.id}:${round}:${role}`,
    }));

  if (!rows.length) return { agentManaged: true, created: 0 };
  const result = await tx.printJob.createMany({ data: rows, skipDuplicates: true });
  return { agentManaged: true, created: result.count };
}

export async function enqueueRawPrintJob(args: {
  businessId: string;
  role: string;
  base64: string;
  idempotencyKey: string;
}): Promise<{ id: string } | null> {
  const agent = await prisma.printerAgent.findFirst({
    where: { business_id: args.businessId, revoked_at: null },
    select: { id: true },
  });
  if (!agent) return null;
  const idempotencyKey = args.idempotencyKey.slice(0, 160);
  const dedupeKey = `${args.businessId}:manual:${idempotencyKey}`;

  const job = await prisma.printJob.upsert({
    where: { dedupe_key: dedupeKey },
    create: {
      business_id: args.businessId,
      printer_role: args.role,
      payload_type: 'RAW_ESCPOS',
      payload: { base64: args.base64 },
      dedupe_key: dedupeKey,
    },
    update: {},
    select: { id: true },
  });
  return job;
}

export async function claimNextPrintJob(agent: { id: string; business_id: string }): Promise<ClaimedPrintJob | null> {
  return prisma.$transaction(async (tx) => {
    await tx.printJob.updateMany({
      where: {
        business_id: agent.business_id,
        status: 'CLAIMED',
        lease_expires_at: { lt: new Date() },
        attempt_count: { gte: 5 },
      },
      data: {
        status: 'FAILED',
        last_error: 'Agent lease expired after the maximum number of delivery attempts.',
        claimed_by_agent_id: null,
        lease_expires_at: null,
        updated_at: new Date(),
      },
    });

    const rows = await tx.$queryRaw<ClaimedPrintJob[]>`
      WITH candidate AS (
        SELECT id
        FROM print_jobs
        WHERE business_id = ${agent.business_id}
          AND attempt_count < max_attempts
          AND (
            (status = 'PENDING' AND available_at <= NOW())
            OR (status = 'CLAIMED' AND lease_expires_at <= NOW())
          )
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE print_jobs AS job
      SET status = 'CLAIMED',
          claimed_by_agent_id = ${agent.id},
          claimed_at = NOW(),
          lease_expires_at = NOW() + INTERVAL '90 seconds',
          attempt_count = job.attempt_count + 1,
          updated_at = NOW()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.printer_role, job.payload_type, job.payload, job.attempt_count, job.created_at
    `;

    await tx.printerAgent.update({
      where: { id: agent.id },
      data: { last_seen_at: new Date() },
    });
    return rows[0] || null;
  });
}

export async function acknowledgePrintJob(args: {
  agentId: string;
  businessId: string;
  jobId: string;
  success: boolean;
  error?: string;
}): Promise<'PRINTED' | 'PENDING' | 'FAILED' | null> {
  const job = await prisma.printJob.findFirst({
    where: {
      id: args.jobId,
      business_id: args.businessId,
      claimed_by_agent_id: args.agentId,
      status: 'CLAIMED',
    },
  });
  if (!job) return null;

  const ownership = {
    id: job.id,
    business_id: args.businessId,
    claimed_by_agent_id: args.agentId,
    status: 'CLAIMED',
  };

  if (args.success) {
    const result = await prisma.printJob.updateMany({
      where: ownership,
      data: {
        status: 'PRINTED',
        printed_at: new Date(),
        claimed_by_agent_id: null,
        lease_expires_at: null,
        last_error: null,
      },
    });
    if (result.count !== 1) return null;
    return 'PRINTED';
  }

  const terminal = job.attempt_count >= job.max_attempts;
  const delaySeconds = Math.min(60, Math.max(2, 2 ** job.attempt_count));
  const result = await prisma.printJob.updateMany({
    where: ownership,
    data: {
      status: terminal ? 'FAILED' : 'PENDING',
      available_at: terminal ? job.available_at : new Date(Date.now() + delaySeconds * 1000),
      claimed_by_agent_id: null,
      lease_expires_at: null,
      last_error: (args.error || 'The local print agent reported a printer error.').slice(0, 2000),
    },
  });
  if (result.count !== 1) return null;
  return terminal ? 'FAILED' : 'PENDING';
}

