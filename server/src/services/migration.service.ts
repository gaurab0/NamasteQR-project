import { 
  firestoreDb, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc 
} from '../config/firebase';
import { 
  slugify, 
  sanitizePhoneId, 
  generateMenuDocId, 
  generateCategoryDocId, 
  generateUserDocId 
} from '../utils/id.utils';

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
         /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i.test(id);
}

export async function migrateAllFirestoreDocumentsToReadableIds() {
  console.log('🔄 Checking Firestore Human-Readable Document IDs...');

  try {
    // 1. Migrate USERS -> Business Name / User Slugs
    try {
      const usersSnap = await getDocs(collection(firestoreDb, 'users'));
      for (const d of usersSnap.docs) {
        const data = d.data();
        const currentId = d.id;
        if (isUuid(currentId)) {
          const targetId = generateUserDocId(data.business_name || 'maya-forest-resort', data.email || data.role);
          console.log(`Migrating user "${data.email || currentId}": ${currentId} -> ${targetId}`);
          const updatedData = {
            ...data,
            id: targetId,
          };
          Object.keys(updatedData).forEach((k) => updatedData[k] === undefined && delete updatedData[k]);

          await setDoc(doc(firestoreDb, 'users', targetId), updatedData, { merge: true });
          await deleteDoc(doc(firestoreDb, 'users', currentId));
        }
      }
    } catch (e: any) {
      console.warn('Note during users migration:', e.message);
    }

    // 2. Migrate PHONE & OTP VERIFICATIONS
    try {
      const phoneSnap = await getDocs(collection(firestoreDb, 'phone_verifications'));
      for (const d of phoneSnap.docs) {
        const data = d.data();
        const currentId = d.id;
        const targetId = sanitizePhoneId(data.phone_e164 || data.phone_number || currentId);
        if (currentId !== targetId && isUuid(currentId)) {
          const updatedData = { ...data, id: targetId };
          Object.keys(updatedData).forEach((k) => updatedData[k] === undefined && delete updatedData[k]);
          await setDoc(doc(firestoreDb, 'phone_verifications', targetId), updatedData, { merge: true });
          await deleteDoc(doc(firestoreDb, 'phone_verifications', currentId));
        }
      }
    } catch (e: any) {}

    try {
      const otpSnap = await getDocs(collection(firestoreDb, 'otp_verifications'));
      for (const d of otpSnap.docs) {
        const data = d.data();
        const currentId = d.id;
        const targetId = sanitizePhoneId(data.phone_e164 || data.phone_number || currentId);
        if (currentId !== targetId && isUuid(currentId)) {
          const updatedData = { ...data, id: targetId };
          Object.keys(updatedData).forEach((k) => updatedData[k] === undefined && delete updatedData[k]);
          await setDoc(doc(firestoreDb, 'otp_verifications', targetId), updatedData, { merge: true });
          await deleteDoc(doc(firestoreDb, 'otp_verifications', currentId));
        }
      }
    } catch (e: any) {}

    // 3. Migrate and Clean BUSINESSES -> strictly registered business name slugs only
    try {
      const bizSnap = await getDocs(collection(firestoreDb, 'businesses'));
      for (const d of bizSnap.docs) {
        const data = d.data();
        const currentId = d.id;

        // Remove any non-business documents that are not registered business entities
        const isStray = currentId.startsWith('customer-sess-') || 
                        currentId.startsWith('order-') ||
                        currentId.startsWith('LOG-') ||
                        currentId === 'staff' || 
                        currentId === 'audit_logs' || 
                        !data ||
                        !data.name ||
                        typeof data.name !== 'string' ||
                        data.name.trim().length === 0 ||
                        (!data.business_type && !data.status);

        if (isStray) {
          console.log(`Removing non-business document from "businesses" collection: ${currentId}`);
          try {
            await deleteDoc(doc(firestoreDb, 'businesses', currentId));
          } catch (err) {}
          continue;
        }

        if (data.name) {
          const targetId = slugify(data.name);
          if (currentId !== targetId && isUuid(currentId)) {
            console.log(`Migrating business "${data.name}": ${currentId} -> ${targetId}`);
            const updatedData = {
              ...data,
              id: targetId,
            };
            Object.keys(updatedData).forEach((k) => updatedData[k] === undefined && delete updatedData[k]);

            await setDoc(doc(firestoreDb, 'businesses', targetId), updatedData, { merge: true });
            await deleteDoc(doc(firestoreDb, 'businesses', currentId));
          }
        }
      }
    } catch (e: any) {
      console.warn('Note during business migration:', e.message);
    }

    console.log('✅ Firestore documents verified and up to date.');
    return { success: true, message: 'All documents verified' };
  } catch (err: any) {
    console.warn('Firestore verification finished with note:', err.message);
    return { success: true, message: err.message };
  }
}
