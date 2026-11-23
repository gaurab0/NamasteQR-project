import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { createRateLimiter } from './rateLimit.middleware';
import { hashAgentToken, secureHashEquals } from '../services/print-job.service';

export interface PrintAgentRequest extends Request {
  printAgent?: { id: string; business_id: string; name: string };
}

export async function authenticatePrintAgent(req: PrintAgentRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length > 256) {
    return res.status(401).json({ success: false, error: 'Invalid print-agent credentials.' });
  }

  try {
    const tokenHash = hashAgentToken(token);
    const agent = await prisma.printerAgent.findUnique({ where: { token_hash: tokenHash } });
    if (!agent || agent.revoked_at || !secureHashEquals(agent.token_hash, tokenHash)) {
      return res.status(401).json({ success: false, error: 'Invalid print-agent credentials.' });
    }
    req.printAgent = { id: agent.id, business_id: agent.business_id, name: agent.name };
    return next();
  } catch (error) {
    console.error('[PrintAgentAuth] Authentication lookup failed:', error);
    return res.status(503).json({ success: false, error: 'Print-agent authentication is temporarily unavailable.' });
  }
}

// Polling is limited per agent, rather than per restaurant IP (which may host several agents).
export const printAgentLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  limit: 90,
  keyGenerator: (req) => {
    const agentId = (req as PrintAgentRequest).printAgent?.id;
    return agentId || (req.ip ? ipKeyGenerator(req.ip) : 'unknown-agent');
  },
  message: 'Print-agent poll limit reached. Back off briefly and retry.',
  code: 'PRINT_AGENT_RATE_LIMITED',
});

