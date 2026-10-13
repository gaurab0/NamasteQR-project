const fs = require('fs');
let code = fs.readFileSync('server/src/services/rbac.service.ts', 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// Find the logic
const oldLogic = `      if (isSessionLive && hasActiveOrders) {
        // Active table session with food order underway!
        sessionId = existingSessionId;`;

const newLogic = `      const isSessionRecent = (Date.now() - lastScannedMs) < (15 * 60 * 1000); // 15 mins
      if (isSessionLive && (hasActiveOrders || isSessionRecent)) {
        // Active table session with food order underway or recently created!
        sessionId = existingSessionId;`;

code = code.replace(oldLogic, newLogic);

code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('server/src/services/rbac.service.ts', code);
console.log('Successfully patched backend session logic');
