const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// Find where to insert the useRef if it doesn't exist.
// We can just add it near the top of the component state declarations.
const searchTarget = `  const [isFinalBillPageOpen, setIsFinalBillPageOpen] = useState<boolean>(false);`;
if (!code.includes('const kickOutTimeoutRef = useRef')) {
  code = code.replace(searchTarget, `${searchTarget}\n  const kickOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);`);
}

// Now replace the snapshot logic
const oldSnapshotLogic = `        if (tableParams.sessionId && (!data.current_session_id || data.current_session_id !== tableParams.sessionId)) {
          sessionStorage.removeItem(TABLE_SESSION_STORAGE_KEY);
          setSessionExpired(true);
          setIsTableBillConcluded(true);
          setSessionExpiredReason(
            'Your table order and billing process has been concluded. To place a new order or join the table again, simply scan the table QR code.'
          );
          setIsFinalBillPageOpen(false);
          try {
            localStorage.setItem('serveflow_table_bill_concluded', 'true');
          } catch {}
          handleOrderSettled(undefined, tableParams.tableNumber);
        }`;

const newSnapshotLogic = `        if (tableParams.sessionId && (!data.current_session_id || data.current_session_id !== tableParams.sessionId)) {
          if (!kickOutTimeoutRef.current) {
            kickOutTimeoutRef.current = setTimeout(() => {
              sessionStorage.removeItem(TABLE_SESSION_STORAGE_KEY);
              setSessionExpired(true);
              setIsTableBillConcluded(true);
              setSessionExpiredReason(
                'Your table order and billing process has been concluded. To place a new order or join the table again, simply scan the table QR code.'
              );
              setIsFinalBillPageOpen(false);
              try {
                localStorage.setItem('serveflow_table_bill_concluded', 'true');
              } catch {}
              handleOrderSettled(undefined, tableParams.tableNumber);
            }, 3000);
          }
        } else {
          if (kickOutTimeoutRef.current) {
            clearTimeout(kickOutTimeoutRef.current);
            kickOutTimeoutRef.current = null;
          }
        }`;

if (!code.includes(newSnapshotLogic)) {
  code = code.replace(oldSnapshotLogic, newSnapshotLogic);
}

// Ensure cleanup on unmount
const useEffectStart = `const tableRef = doc(db, 'businesses', targetBizId, 'tables', tableId);`;
const useEffectEnd = `return () => unsub();`;

if (code.includes(useEffectEnd)) {
  // Only replace the first occurrence that belongs to the tableRef listener
  // Wait, I can just replace `return () => unsub();` in that exact block.
  // I will just replace the exact line 718.
  code = code.replace(
    `    return () => unsub();\n  }, [tableParams.businessId, user?.business?.id, tableParams.tableId, tableParams.sessionId, tableParams.tableNumber]);`,
    `    return () => {\n      unsub();\n      if (kickOutTimeoutRef.current) clearTimeout(kickOutTimeoutRef.current);\n    };\n  }, [tableParams.businessId, user?.business?.id, tableParams.tableId, tableParams.sessionId, tableParams.tableNumber]);`
  );
}

code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Successfully patched session conclusion race condition');
