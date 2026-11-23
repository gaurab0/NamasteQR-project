import { Router, Response } from 'express';
import {
  authenticatePrintAgent,
  printAgentLimiter,
  PrintAgentRequest,
} from '../middleware/print-agent-auth.middleware';
import { acknowledgePrintJob, claimNextPrintJob } from '../services/print-job.service';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(authenticatePrintAgent, printAgentLimiter);

router.post('/jobs/claim', async (req: PrintAgentRequest, res: Response) => {
  try {
    const agent = req.printAgent!;
    const job = await claimNextPrintJob(agent);
    return res.json({ success: true, job });
  } catch (error) {
    console.error('[PrintAgent] Job claim failed:', error);
    return res.status(503).json({ success: false, error: 'Could not claim a print job. Retry shortly.' });
  }
});

router.post('/jobs/:jobId/ack', async (req: PrintAgentRequest, res: Response) => {
  const { success, error } = req.body || {};
  if (typeof success !== 'boolean') {
    return res.status(400).json({ success: false, error: 'A boolean "success" result is required.' });
  }

  try {
    const status = await acknowledgePrintJob({
      agentId: req.printAgent!.id,
      businessId: req.printAgent!.business_id,
      jobId: req.params.jobId,
      success,
      error: typeof error === 'string' ? error : undefined,
    });
    if (!status) return res.status(404).json({ success: false, error: 'Claimed job not found for this agent.' });
    return res.json({ success: true, status });
  } catch (ackError) {
    console.error('[PrintAgent] Job acknowledgement failed:', ackError);
    return res.status(503).json({ success: false, error: 'Could not acknowledge the print job. Retry shortly.' });
  }
});

router.get('/status', async (req: PrintAgentRequest, res: Response) => {
  try {
    const [agent, pendingJobs, failedJobs] = await Promise.all([
      prisma.printerAgent.findUnique({
        where: { id: req.printAgent!.id },
        select: { id: true, name: true, business_id: true, last_seen_at: true, revoked_at: true },
      }),
      prisma.printJob.count({ where: { business_id: req.printAgent!.business_id, status: 'PENDING' } }),
      prisma.printJob.count({ where: { business_id: req.printAgent!.business_id, status: 'FAILED' } }),
    ]);
    if (!agent || agent.revoked_at) return res.status(401).json({ success: false, error: 'Agent was revoked.' });
    return res.json({ success: true, agent, pendingJobs, failedJobs });
  } catch (error) {
    console.error('[PrintAgent] Status query failed:', error);
    return res.status(503).json({ success: false, error: 'Agent status is temporarily unavailable.' });
  }
});

export default router;
