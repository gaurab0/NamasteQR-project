import 'dotenv/config';
import { prisma } from '../server/src/lib/prisma';
import { createAgentToken, hashAgentToken } from '../server/src/services/print-job.service';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--revoke') {
    const [agentId, businessId] = args.slice(1);
    if (!agentId || !businessId) throw new Error('Usage: npm run print-agent:token -- --revoke <agent-id> <business-id>');
    const result = await prisma.printerAgent.updateMany({
      where: { id: agentId, business_id: businessId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (!result.count) throw new Error('No active agent with that ID exists for the supplied business.');
    console.log(`Revoked print agent ${agentId}.`);
    return;
  }

  const [businessId, ...nameParts] = args;
  const name = nameParts.join(' ').trim() || 'Restaurant Print Agent';
  if (!businessId) throw new Error('Usage: npm run print-agent:token -- <business-id> [agent-name]');
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
  if (!business) throw new Error(`Business '${businessId}' was not found.`);

  const token = createAgentToken();
  const agent = await prisma.printerAgent.create({
    data: { business_id: business.id, name, token_hash: hashAgentToken(token) },
    select: { id: true, name: true },
  });

  console.log(`Created print agent '${agent.name}' (${agent.id}) for ${business.name} (${business.id}).`);
  console.log('Copy this token into the on-site agent config now. It is shown only once:');
  console.log(token);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
