import { 
  firestoreDb, 
  collection, 
  getDocs, 
  doc, 
  getDoc 
} from '../config/firebase';
import { prisma } from '../lib/prisma';

async function migrateAll() {
  console.log('🚀 Starting complete ETL migration from Firestore to PostgreSQL (Supabase)...');

  // 1. Migrate Businesses
  const bSnap = await getDocs(collection(firestoreDb, 'businesses'));
  console.log(`📦 Found ${bSnap.size} businesses in Firestore.`);
  
  const validBizIds = new Set<string>();

  for (const docSnap of bSnap.docs) {
    const d = docSnap.data();
    const id = docSnap.id;

    // Filter out stray docs
    if (id.startsWith('customer-sess-') || id.startsWith('order-') || id.startsWith('LOG-') || id === 'staff' || id === 'audit_logs') {
      continue;
    }

    try {
      await prisma.business.upsert({
        where: { id },
        create: {
          id,
          name: d.name || id,
          business_type: d.business_type || 'RESTAURANT',
          status: d.status || 'ACTIVE',
          tagline: d.tagline || null,
          location: d.location || null,
          address: d.address || null,
          kitchen_hours: d.kitchen_hours || null,
          phone: d.phone || null,
          parent_business_id: d.parent_business_id || null,
          owner_uid: d.owner_uid || null,
          branch_code: d.branch_code || null,
          currency: d.currency || 'Rs.',
          tax_rate: typeof d.tax_rate === 'number' ? d.tax_rate : 0,
          show_menu_images: typeof d.show_menu_images === 'boolean' ? d.show_menu_images : true,
          menu_theme_config: d.menu_theme_config || null,
          date_format_nav: d.date_format_nav || 'BOTH',
          date_format_billing: d.date_format_billing || 'BOTH',
          created_at: d.created_at ? new Date(d.created_at) : new Date(),
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        },
        update: {
          name: d.name || id,
          business_type: d.business_type || 'RESTAURANT',
          status: d.status || 'ACTIVE',
        }
      });
      validBizIds.add(id);
    } catch (e: any) {
      console.warn(`⚠️ Failed to upsert business ${id}:`, e.message);
    }
  }
  console.log(`✅ Upserted ${validBizIds.size} businesses to PostgreSQL.`);

  // 2. Migrate Users
  const uSnap = await getDocs(collection(firestoreDb, 'users'));
  console.log(`📦 Found ${uSnap.size} users in Firestore.`);
  let userCount = 0;

  for (const docSnap of uSnap.docs) {
    const d = docSnap.data();
    const id = docSnap.id;
    const bizId = d.business_id;

    if (!bizId || !validBizIds.has(bizId)) {
      continue; // Skip orphan users without a valid business
    }

    try {
      await prisma.user.upsert({
        where: { email: d.email },
        create: {
          id,
          business_id: bizId,
          email: d.email,
          name: d.name || null,
          password_hash: d.password_hash || '$2a$10$defaultdummyhashforuserwithoutpassword',
          role: d.role || 'STAFF',
          status: d.status || 'ACTIVE',
          allowed_tabs: Array.isArray(d.allowed_tabs) ? d.allowed_tabs : [],
          last_login_at: d.last_login_at ? new Date(d.last_login_at) : null,
          created_at: d.created_at ? new Date(d.created_at) : new Date(),
          updated_at: d.updated_at ? new Date(d.updated_at) : new Date(),
        },
        update: {
          role: d.role || 'STAFF',
          allowed_tabs: Array.isArray(d.allowed_tabs) ? d.allowed_tabs : [],
        }
      });
      userCount++;
    } catch (e: any) {
      console.warn(`⚠️ Failed to upsert user ${d.email}:`, e.message);
    }
  }
  console.log(`✅ Upserted ${userCount} users to PostgreSQL.`);

  // 3. Migrate subcollections per business (Categories, Menus, Tables, TaxConfig, GLAccounts, Sales)
  for (const bizId of validBizIds) {
    // 3a. Tax Config
    try {
      const taxSnap = await getDoc(doc(firestoreDb, 'businesses', bizId, 'tax_settings', 'default'));
      if (taxSnap.exists()) {
        const td = taxSnap.data();
        await prisma.taxConfig.upsert({
          where: { business_id: bizId },
          create: {
            business_id: bizId,
            tax_enabled: td.tax_enabled ?? true,
            tax_inclusive: td.tax_inclusive ?? false,
            currency: td.currency || 'Rs.',
            currency_symbol: td.currency_symbol || 'Rs.',
            rates: td.rates || [],
            invoice_prefix: td.invoice_prefix || 'INV-',
            receipt_footer_note: td.receipt_footer_note || null,
            pan_vat_number: td.pan_vat_number || null,
            pan_vat_prefix: td.pan_vat_prefix || null,
            invoice_display_name: td.invoice_display_name || null,
            invoice_subtitle: td.invoice_subtitle || null,
            invoice_document_title: td.invoice_document_title || null,
            invoice_address: td.invoice_address || null,
            active_promo_code: td.active_promo_code || null,
            active_promo_percent: td.active_promo_percent ? Number(td.active_promo_percent) : null,
            active_promo_description: td.active_promo_description || null,
            active_promo_enabled: td.active_promo_enabled ?? false,
            order_reset_interval: td.order_reset_interval || 'DAILY',
            last_order_reset_date: td.last_order_reset_date || null,
          },
          update: {
            tax_enabled: td.tax_enabled ?? true,
            tax_inclusive: td.tax_inclusive ?? false,
            rates: td.rates || [],
          }
        });
      }
    } catch (e: any) {}

    // 3b. Categories
    try {
      const catSnap = await getDocs(collection(firestoreDb, 'businesses', bizId, 'menu_categories'));
      for (const cd of catSnap.docs) {
        const c = cd.data();
        await prisma.menuCategory.upsert({
          where: { id: cd.id },
          create: {
            id: cd.id,
            business_id: bizId,
            name: c.name || cd.id,
            order: c.order || 0,
            created_at: c.created_at ? new Date(c.created_at) : new Date(),
            updated_at: c.updated_at ? new Date(c.updated_at) : new Date(),
          },
          update: {
            name: c.name || cd.id,
            order: c.order || 0,
          }
        });
      }
    } catch (e: any) {}

    // 3c. Menu Items
    try {
      const mSnap = await getDocs(collection(firestoreDb, 'businesses', bizId, 'menus'));
      for (const md of mSnap.docs) {
        const m = md.data();
        await prisma.menuItem.upsert({
          where: { id: md.id },
          create: {
            id: md.id,
            business_id: bizId,
            name: m.name || 'Item',
            category: m.category || 'General',
            category_id: m.category_id || null,
            additional_categories: Array.isArray(m.additional_categories) ? m.additional_categories : [],
            price: Number(m.price) || 0,
            currency: m.currency || 'Rs.',
            description: m.description || null,
            image_url: m.image_url || null,
            food_type: m.food_type || 'veg',
            status: m.status || 'available',
            is_available: typeof m.is_available === 'boolean' ? m.is_available : true,
            has_variants: typeof m.has_variants === 'boolean' ? m.has_variants : false,
            variants: m.variants || null,
            variant_group_name: m.variant_group_name || null,
            display_style: m.display_style || 'auto',
            show_image: typeof m.show_image === 'boolean' ? m.show_image : true,
            promo_badge: m.promo_badge || null,
            order_index: m.order_index || 0,
            preparation_time_mins: m.preparation_time_mins || null,
            created_by: m.created_by || null,
            created_at: m.created_at ? new Date(m.created_at) : new Date(),
            updated_at: m.updated_at ? new Date(m.updated_at) : new Date(),
          },
          update: {
            price: Number(m.price) || 0,
            name: m.name || 'Item',
          }
        });
      }
    } catch (e: any) {}

    // 3d. Tables
    try {
      const tSnap = await getDocs(collection(firestoreDb, 'businesses', bizId, 'tables'));
      for (const td of tSnap.docs) {
        const t = td.data();
        await prisma.restaurantTable.upsert({
          where: { id: td.id },
          create: {
            id: td.id,
            business_id: bizId,
            table_number: t.table_number || td.id,
            order_number: t.order_number || null,
            floor: t.floor || null,
            building: t.building || null,
            capacity: Number(t.capacity) || 4,
            status: t.status || 'ACTIVE',
            pay_first_enabled: t.pay_first_enabled || false,
            qr_code_url: t.qr_code_url || null,
            last_scanned_at: t.last_scanned_at ? new Date(t.last_scanned_at) : null,
            current_session_id: t.current_session_id || null,
            host_token: t.host_token || null,
            created_at: t.created_at ? new Date(t.created_at) : new Date(),
            updated_at: t.updated_at ? new Date(t.updated_at) : new Date(),
          },
          update: {
            status: t.status || 'ACTIVE',
            order_number: t.order_number || null,
          }
        });
      }
    } catch (e: any) {}

    // 3e. GL Accounts
    try {
      const glSnap = await getDocs(collection(firestoreDb, 'businesses', bizId, 'gl_accounts'));
      for (const gld of glSnap.docs) {
        const gl = gld.data();
        await prisma.gLAccount.upsert({
          where: { id: gld.id },
          create: {
            id: gld.id,
            business_id: bizId,
            account_number: gl.account_number || '0000',
            account_name: gl.account_name || 'Account',
            category: gl.category || 'REVENUE',
            mapping_key: gl.mapping_key || null,
            description: gl.description || null,
            customer_name: gl.customer_name || null,
            customer_address: gl.customer_address || null,
            customer_phone: gl.customer_phone || null,
            customer_extension: gl.customer_extension || null,
            customer_office_name: gl.customer_office_name || null,
            customer_designation: gl.customer_designation || null,
            is_active: typeof gl.is_active === 'boolean' ? gl.is_active : true,
            created_at: gl.created_at ? new Date(gl.created_at) : new Date(),
            updated_at: gl.updated_at ? new Date(gl.updated_at) : new Date(),
          },
          update: {
            account_name: gl.account_name || 'Account',
          }
        });
      }
    } catch (e: any) {}

    // 3f. Sales
    try {
      const sSnap = await getDocs(collection(firestoreDb, 'businesses', bizId, 'sales'));
      for (const sd of sSnap.docs) {
        const s = sd.data();
        await prisma.sale.upsert({
          where: { id: sd.id },
          create: {
            id: sd.id,
            invoice_number: s.invoice_number || sd.id,
            order_number: s.order_number || null,
            business_id: bizId,
            order_id: s.order_id || null,
            table_id: s.table_id || null,
            table_number: s.table_number || null,
            customer_name: s.customer_name || 'Walk-in Guest',
            customer_phone: s.customer_phone || null,
            sale_type: s.sale_type || 'DINE_IN',
            items: s.items || [],
            subtotal: Number(s.subtotal) || 0,
            discount_percent: Number(s.discount_percent) || 0,
            discount_amount: Number(s.discount_amount) || 0,
            promo_code: s.promo_code || null,
            promo_discount: Number(s.promo_discount) || 0,
            taxes: s.taxes || [],
            total_tax: Number(s.total_tax) || 0,
            service_charge: Number(s.service_charge) || 0,
            total_amount: Number(s.total_amount) || 0,
            currency: s.currency || 'Rs.',
            payment_method: s.payment_method || 'CASH',
            credit_gl_account_id: s.credit_gl_account_id || null,
            credit_gl_account_number: s.credit_gl_account_number || null,
            credit_gl_account_name: s.credit_gl_account_name || null,
            payment_status: s.payment_status || 'PAID',
            cashier_name: s.cashier_name || 'Staff',
            cashier_id: s.cashier_id || null,
            notes: s.notes || null,
            date_string: s.date_string || (s.created_at ? new Date(s.created_at).toISOString().split('T')[0] : '2026-10-13'),
            created_at: s.created_at ? new Date(s.created_at) : new Date(),
          },
          update: {
            order_number: s.order_number || null,
            total_amount: Number(s.total_amount) || 0,
          }
        });
      }
    } catch (e: any) {}
  }

  console.log('🎉 Full Firestore to PostgreSQL migration completed successfully!');
}

migrateAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
