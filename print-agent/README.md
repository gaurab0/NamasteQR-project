# NamasteQR local print agent

The agent runs on a Windows PC inside the restaurant LAN. It polls the deployed NamasteQR API over HTTPS, then writes ESC/POS to the configured private printer IPs on TCP/9100. Printer addresses and paper settings stay in this machine's local config.

## Configure

1. Apply the Prisma schema to the hosted PostgreSQL database with `npx prisma db push`.
2. In NamasteQR's printer settings, set the restaurant's KDS print mode to `PRINT_ONLY` or `BOTH`; the schema default is `DISPLAY_ONLY`, which intentionally does not create kitchen print jobs.
3. From the app repository root, create a token for the restaurant business ID:

   ```powershell
   npm run print-agent:token -- <business-id> "Front POS"
   ```

   Run this where `.env` points to the same hosted PostgreSQL database as Vercel. The token is printed once; copy it immediately into the agent config. Revoke it with `npm run print-agent:token -- --revoke <agent-id> <business-id>`.

4. Copy the sample config and edit its Vercel URL, token, and LAN printer IPs:

   ```powershell
   Copy-Item print-agent/config.example.json print-agent/agent.config.json
   notepad print-agent/agent.config.json
   ```

   Map `KOT`, `BOT`, and `BILL` to printer IPs. Wired Ethernet and Wi-Fi printers both work if they accept raw ESC/POS on TCP/9100. The agent intentionally rejects non-private IPv4 addresses and other ports.

5. Install dependencies and run the agent:

   ```powershell
   npm ci
   npm run print-agent
   ```

Keep this PC powered on and connected to the restaurant network. For automatic startup, register `npm run print-agent` in Windows Task Scheduler with “Run whether user is logged on or not.” Restrict access to `agent.config.json`; it contains the agent credential.

## Delivery behavior

The agent processes one job at a time, reports printed/failed status, and retries failed jobs with backoff. Cloud jobs remain queued while the agent is offline. A lost acknowledgement after a printer has accepted data can still cause a duplicate on retry; physical printers do not provide an exactly-once receipt guarantee.
