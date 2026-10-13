import { firestoreDb } from './server/src/config/firebase.ts';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';

async function seedCreditGLAccount() {
  console.log('Seeding Credit GL Account (1120) to existing businesses...');
  
  try {
    const businessesSnap = await getDocs(collection(firestoreDb, 'businesses'));
    
    for (const d of businessesSnap.docs) {
      const businessId = d.id;
      const glRef = doc(firestoreDb, 'businesses', businessId, 'gl_accounts', 'gl-1120');
      
      const glDoc = await getDoc(glRef);
      if (!glDoc.exists()) {
        console.log(`Adding gl-1120 to business ${businessId}...`);
        await setDoc(glRef, {
          business_id: businessId,
          account_number: '1120',
          account_name: 'Accounts Receivable (Credit Sales)',
          category: 'ASSET',
          mapping_key: 'CREDIT_SETTLEMENT',
          description: 'Credit sales pending collection from guests or corporate accounts',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        console.log(`gl-1120 already exists for business ${businessId}.`);
      }
    }
    
    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed:', error);
    process.exit(1);
  }
}

seedCreditGLAccount();
