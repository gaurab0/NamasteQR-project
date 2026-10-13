# ServeFlow — Working Reference

> **Purpose**: This file is a permanent quick-reference for Antigravity AI. Updated when architecture changes. Prevents re-scanning the whole codebase on every task.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Folder Structure](#3-folder-structure)
4. [Routing & Navigation](#4-routing--navigation)
5. [Authentication & Session Model](#5-authentication--session-model)
6. [Firestore Schema](#6-firestore-schema)
7. [API Reference (Server Routes)](#7-api-reference-server-routes)
8. [Key Component File Map](#8-key-component-file-map)
9. [Customer Dining Flow (End-to-End)](#9-customer-dining-flow-end-to-end)
10. [Staff Flows](#10-staff-flows)
11. [Tax & Billing Architecture](#11-tax--billing-architecture)
12. [Date Formatting System](#12-date-formatting-system)
13. [State Management & Contexts](#13-state-management--contexts)
14. [Key Types Reference](#14-key-types-reference)
15. [Known Patterns & Gotchas](#15-known-patterns--gotchas)
16. [Active Business Config (Dev)](#16-active-business-config-dev)
17. [Environment Variables](#17-environment-variables)
18. [Recent Changes Log](#18-recent-changes-log)
19. [Tab-Based Access Control (RBAC rewrite spec)](#19-tab-based-access-control-rbac-rewrite--spec-source-of-truth)

---

## 1. Project Overview

**ServeFlow** is a full-stack restaurant & hotel management SaaS portal.

- **Frontend**: React 19 + Vite 6 + TailwindCSS 4 (single-page app, no React Router)
- **Backend**: Node.js + Express 4, running via `tsx watch server.ts` in dev
- **Database**: PostgreSQL (hosted on Supabase) via Prisma ORM; legacy Firestore maintained as dual-write mirror
- **Real-Time Engine**: Socket.io server with room-based broadcast (`business:${id}`, `table:${id}`)
- **Auth**: Custom JWT (HTTP-only cookies) + PostgreSQL via Prisma for all user and business records

**Architecture & Persistence**: The application uses PostgreSQL via Prisma ORM as primary source of truth for all business operations (Auth, Users, Menus, Tables, Table Orders, Sales, GL Accounts, Taxes). Real-time updates are driven by Socket.io with graceful Firestore real-time listener fallback. Writes are mirrored to Firestore for seamless zero-downtime transition and legacy test compatibility.

---

## 2. Tech Stack & Dependencies

| Category | Package | Version |
|---|---|---|
| Frontend framework | react, react-dom | ^19.0.1 |
| Build tool | vite | ^6.2.3 |
| Styling | tailwindcss | ^4.1.14 |
| Database | PostgreSQL (Supabase pooler) | 15+ |
| ORM | @prisma/client, prisma | ^6.4.1 |
| Real-Time WebSockets | socket.io, socket.io-client | ^4.8.1 |
| Icons | lucide-react | ^0.546.0 |
| Animation | motion | ^12.23.24 |
| Firebase client | firebase | ^12.18.0 |
| Firebase admin | firebase-admin | ^14.3.0 |
| Server framework | express | ^4.21.2 |
| Auth tokens | jsonwebtoken, bcryptjs | ^9.0.3, ^3.0.3 |
| Email | nodemailer | ^9.1.0 |
| WhatsApp OTP | meta API / twilio / mock | — |
| QR codes | qrcode | ^1.5.4 |
| Excel export | xlsx | ^0.18.5 |
| Validation | zod | ^4.4.3 |
| Nepali dates | nepali-datetime | ^2.0.0 |
| AI features | @google/genai | ^2.4.0 |
| TypeScript runner | tsx | ^4.21.0 |

**Scripts**:
- `npm run dev` — starts Express + Vite with HMR via `tsx watch server.ts`
- `npm run build` — `vite build && esbuild server.ts --bundle ...`
- `npm run start` — `node dist/server.cjs` (production)
- `npm run test` — `tsx server/test/auth.test.ts`
- `npm run lint` — `tsc --noEmit`

**Firebase config**: Loaded from `firebase-applet-config.json` at project root (not `.env`). Uses named Firestore database if `firestoreDatabaseId` is set in that JSON.

---

## 3. Folder Structure

```
ServeFlow/
├── server.ts                      # Express server entry point (tsx watch server.ts)
├── firebase-applet-config.json    # Firebase client config (PUBLIC, safe for client)
├── .env                           # Server secrets (JWT, email, WhatsApp, etc.)
├── .env.example                   # Template for env vars
├── working.md                     # THIS FILE
├── vite.config.ts                 # Vite config (@/ alias → project root)
├── package.json
│
├── src/                           # React frontend
│   ├── App.tsx                    # Root: router, providers, guest lock
│   ├── api/
│   │   └── authApi.ts             # Client API calls for auth endpoints
│   ├── components/
│   │   ├── billing/
│   │   │   ├── BillingPOS.tsx         # Full POS cashier panel (staff)
│   │   │   ├── FinalTableBillPage.tsx # Customer-facing final bill
│   │   │   ├── TaxConfigurationPanel.tsx # Tax settings UI (in config center)
│   │   │   ├── GLAccountsTable.tsx    # GL accounts UI
│   │   │   └── ExcelSheetPreviewModal.tsx
│   │   ├── cart/
│   │   │   ├── CustomerCartModal.tsx  # Cart review before placing order
│   │   │   └── OrderSuccessModal.tsx  # Post-order live tracker + inline bill
│   │   ├── checkin/
│   │   │   └── CheckInsModule.tsx     # Hotel check-in management
│   │   ├── common/
│   │   │   └── DateTimeDisplay.tsx    # Live clock with dual date format
│   │   ├── config/
│   │   │   ├── BusinessConfigurationCenter.tsx  # All settings (tax, tables, menu, staff, GL, etc.)
│   │   │   └── PrinterConfiguration.tsx
│   │   ├── dashboard/
│   │   │   └── OperationsOverviewDashboard.tsx  # Overview/analytics tab
│   │   ├── franchise/
│   │   │   ├── AddBranchModal.tsx
│   │   │   └── FranchiseBranchList.tsx
│   │   ├── kds/
│   │   │   └── KitchenDisplaySystem.tsx  # KDS: KITCHEN | BAR | WAITER views
│   │   ├── layout/
│   │   │   ├── AuthLayout.tsx
│   │   │   ├── BranchSwitcher.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Navbar.tsx             # Public/auth navbar (NOT shown on /menu or /dashboard)
│   │   │   └── Sidebar.tsx            # Dashboard sidebar with DashboardTab type
│   │   ├── menu/
│   │   │   ├── AvailabilityStatusBadge.tsx
│   │   │   ├── CategoryManager.tsx
│   │   │   ├── DeleteConfirmationModal.tsx
│   │   │   ├── MenuItemCard.tsx
│   │   │   ├── MenuItemDetailModal.tsx
│   │   │   ├── MenuItemFormModal.tsx
│   │   │   ├── MenuItemPreviewModal.tsx
│   │   │   ├── MenuModule.tsx
│   │   │   └── MenuThemeCustomizerModal.tsx
│   │   ├── tables/
│   │   │   ├── TableFormModal.tsx
│   │   │   ├── TableManagementGrid.tsx
│   │   │   └── TableQrCardModal.tsx
│   │   ├── team/
│   │   │   ├── StaffRoleLoginModal.tsx   # PIN/password login for staff roles
│   │   │   └── TeamStaffManagement.tsx
│   │   ├── ui/                          # Primitive UI components
│   │   │   ├── Alert.tsx, Button.tsx, ErrorBoundary.tsx, Input.tsx
│   │   │   ├── Logo.tsx, OTPInput.tsx, PasswordInput.tsx
│   │   │   ├── PhoneNumberInput.tsx, Select.tsx
│   │   └── waiter/
│   │       └── WaiterStationDashboard.tsx  # Waiter view: service requests queue
│   ├── context/
│   │   └── AuthContext.tsx        # Global auth: user, business, branches, login/logout
│   ├── contexts/
│   │   └── PrinterContext.tsx     # Printer config context
│   ├── lib/
│   │   └── firebase.ts            # Firestore client init (exports `db`)
│   ├── pages/
│   │   ├── CustomerMenuPreviewPage.tsx   # *** Customer dining page (QR scan) ***
│   │   ├── DashboardPage.tsx             # *** Admin/staff dashboard ***
│   │   ├── MenuManagementPage.tsx        # Legacy menu management page
│   │   ├── LandingPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── SignupPage.tsx
│   │   ├── VerifyEmailPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   └── ResetPasswordPage.tsx
│   ├── services/
│   │   ├── rbac.service.ts        # ClientRBACService class — all API calls + some Firestore
│   │   └── print.service.ts       # Print/receipt service
│   ├── types/
│   │   ├── auth.ts                # User, Business, BusinessType interfaces
│   │   ├── rbac.ts                # All domain types: MenuItem, TableOrder, SaleRecord, etc.
│   │   └── printer.types.ts       # Printer-related types
│   └── utils/
│       ├── dateFormatter.ts       # formatDualDate(), renderFormattedDate(), DateFormatMode
│       ├── firestoreUtils.ts      # sanitizeFirestorePayload() — ALWAYS use before Firestore writes
│       ├── excelExport.ts         # buildSalesWorkbookData()
│       ├── menuUtils.ts           # Menu helper functions
│       ├── themeEngine.ts         # Menu theme logic
│       └── countryCodes.ts        # Phone country code list
│
└── server/
    └── src/
        ├── app.ts                 # Express app factory (routes, middleware)
        ├── config/
        │   ├── env.ts             # Typed env config (reads .env)
        │   └── firebase.ts        # Firebase Admin init (exports firestoreDb, etc.)
        ├── controllers/
        │   └── auth.controller.ts # Auth handlers: signup, login, OTP, reset
        ├── middleware/
        │   ├── auth.middleware.ts          # authenticate, optionalAuthenticate
        │   ├── errorHandler.ts             # Centralized error response
        │   └── rateLimit.middleware.ts     # Per-route rate limiters
        ├── routes/
        │   ├── auth.routes.ts     # /api/auth/*
        │   ├── rbac.routes.ts     # /api/rbac/* (= /api/business/*)
        │   ├── menu.routes.ts     # /api/menus/*
        │   └── image.routes.ts    # /api/images/*
        ├── services/
        │   ├── rbac.service.ts    # *** ALL business logic: orders, tables, sales, tax ***
        │   ├── db.service.ts      # Firestore CRUD for users, businesses, OTPs
        │   ├── audit.service.ts   # Audit log writes
        │   ├── email.service.ts   # Email via nodemailer
        │   ├── otp.service.ts     # OTP generation & verification
        │   ├── migration.service.ts  # Data migration utilities
        │   └── whatsapp.service.ts   # WhatsApp OTP via Meta/Twilio
        ├── types/
        │   ├── index.ts           # Generic server types
        │   └── rbac.types.ts      # Server-side mirror of domain types
        ├── utils/
        │   ├── id.utils.ts        # ID generation helpers
        │   └── sequence.util.ts   # Sequential number generation (order/invoice)
        └── validators/
            └── auth.validator.ts  # Zod validators for auth inputs
```

---

## 4. Routing & Navigation

**No React Router** — custom SPA routing via `window.history.pushState` + `useState<currentPath>` in `App.tsx`.

### Routes

| Path | Component | Auth Required |
|---|---|---|
| `/` | `LandingPage` | No |
| `/signup` | `SignupPage` | No (redirects to /dashboard if logged in) |
| `/verify-email` | `VerifyEmailPage` | No |
| `/login` | `LoginPage` | No (redirects to /dashboard if logged in) |
| `/forgot-password` | `ForgotPasswordPage` | No |
| `/reset-password/:token?email=...` | `ResetPasswordPage` | No |
| `/menu` or `/menu-preview` | `CustomerMenuPreviewPage` | No (guest dining) |
| `/menu-management` | `MenuManagementPage` | Yes (staff) |
| `/dashboard` | `DashboardPage` | Yes (staff) |

### Navigation function

```ts
// In App.tsx
const navigate = (path: string) => {
  window.history.pushState({}, '', path);
  setCurrentPath(path);
};
```

The `navigate` function is passed as `onNavigate` prop to every page.

### Guest Lock

If a customer has a dining session active (sessionStorage has `serveflow_customer_table_session` or `serveflow_customer_active`), they are locked to `/menu` and cannot access admin or auth routes, even via browser back button.

### Navbar visibility

The public `<Navbar>` is only shown on non-customer, non-dashboard routes:
```ts
const isCustomerMenuRoute = currentPath.startsWith('/menu') || currentPath.startsWith('/menu-preview');
const isDashboardRoute = currentPath.startsWith('/dashboard');
// Navbar hidden if isCustomerMenuRoute || isDashboardRoute
```

---

## 5. Authentication & Session Model

### Owner/Admin login

1. `POST /api/auth/login` → returns JWT + user object
2. JWT stored in `localStorage['serveflow_auth_token']`
3. User cached in `localStorage['serveflow_cached_user']`
4. Session restored via `GET /api/auth/me` on app load
5. `AuthContext` provides `{ user, isAuthenticated, activeBusiness, branches, ... }`

### Staff role session (secondary)

Staff members (WAITER, KITCHEN_STAFF, CASHIER, etc.) log in via a PIN/password in `StaffRoleLoginModal`. The role is a label; **what they can open is decided by `allowed_tabs`** (§19).

- Session stored in `sessionStorage['serveflow_staff_role_session']`
- Type: `StaffAccountSession { role, email, name, authenticatedAt, businessId, allowed_tabs }` (`custom_permissions` deprecated/ignored)
- Accessible via `rbacService.getCurrentStaffSession()`
- Dispatches `CustomEvent('serveflow:staff-session-changed')` on change

### Customer (guest) session

1. Customer scans table QR → `POST /api/rbac/tables/scan-checkin` (public, no auth)
2. Server validates session token in QR, returns `{ businessId, tableId, tableNumber, sessionId, hostToken }`
3. Client stores in `sessionStorage['serveflow_customer_table_session']`
4. Type: `CustomerTableSession { businessId, tableId, tableNumber, sessionId, isHost, hostToken }`
5. Customer flag: `sessionStorage['serveflow_customer_active'] = 'true'`
6. Table doc: `businesses/{bizId}/tables/{tableId}` has `host_token`, `current_session_id`

### Multi-branch (franchise)

- `Business.parent_business_id` links branches to a parent
- `AuthContext.branches[]` lists all branches
- `AuthContext.switchBranch(branchId)` changes active branch — updates `localStorage['serveflow_active_branch_id']`
- Active business: `user.business` (synced to selected branch)

---

## 6. Firestore Schema

### Top-level collections (root)

| Collection | Purpose |
|---|---|
| `businesses` | Business/branch documents |
| `users` | Registered user accounts |
| `phone_verifications` | Phone OTP state |
| `otp_verifications` | General OTP state |
| `password_reset_tokens` | Password reset tokens |
| `audit_logs` | Login/action audit log |

> **Legacy note**: Client `rbac.service.ts` still has some reads to top-level `menus`, `check_ins`, `tables` — these are old paths from before the business-scoped sub-collection migration. Do NOT add new code using these legacy paths.

### `businesses/{businessId}` — root document

| Field | Type | Description |
|---|---|---|
| `id` | string | Business ID (slug-style, e.g. `seoul-jib-restaurant-pvt-ltd`) |
| `name` | string | Display name |
| `type` | BusinessType | RESTAURANT \| HOTEL \| CAFE \| RESORT \| BAR \| OTHER |
| `status` | BusinessStatus | PENDING_VERIFICATION \| ACTIVE \| SUSPENDED \| DEACTIVATED |
| `tagline` | string? | — |
| `location` | string? | — |
| `currency` | string? | e.g. `NPR` |
| `tax_rate` | number? | Legacy flat tax rate (superseded by `tax_settings/default`) |
| `date_format_nav` | `'ENGLISH' \| 'NEPALI' \| 'BOTH'` | Date format for dashboard navbar |
| `date_format_billing` | `'ENGLISH' \| 'NEPALI' \| 'BOTH'` | Date format for KOT/Bill prints |
| `parent_business_id` | string? | Set on branch documents |
| `menu_theme_config` | MenuThemeConfig? | Customer menu visual theming |

### `businesses/{businessId}/menus/{itemId}` — menu items

Fields: `id, business_id, name, category, category_id, price, currency, description, image_url, food_type (veg|non-veg|none), status (available|unavailable|out_of_stock), is_available, has_variants, variants[], variant_group_name, display_style, show_image, promo_badge, order_index, preparation_time_mins, created_by, created_at, updated_at`

### `businesses/{businessId}/menu_categories/{categoryId}` — categories

Fields: `id, business_id, name, created_at, updated_at`

### `businesses/{businessId}/tables/{tableId}` — restaurant tables

| Field | Type | Description |
|---|---|---|
| `id` | string | — |
| `table_number` | string | Display number (e.g. "T1", "12") |
| `floor` | string? | Floor label |
| `building` | string? | Building label |
| `capacity` | number | Seat count |
| `status` | TableStatus | ACTIVE \| INACTIVE \| OCCUPIED \| RESERVED |
| `qr_code_url` | string? | Encoded QR data URL |
| `current_session_id` | string? | Active dining session ID |
| `host_token` | string? | Security token verified on QR scan |
| `last_scanned_at` | Date? | Last QR scan timestamp |
| `assigned_waiter_ids` | string[]? | Waiter assignments |
| `waiter_ping` | `{ active: bool, timestamp }?` | Active waiter call |
| `order_number` | string? | Current active order number |
| `invoice_number` | string? | Invoice number after settlement |

### `businesses/{businessId}/table_orders/{orderId}` — orders

| Field | Type | Description |
|---|---|---|
| `id` | string | — |
| `business_id` | string | — |
| `table_id` | string | — |
| `table_number` | string | — |
| `order_number` | string? | Sequential order number |
| `invoice_number` | string? | Invoice number (set on settlement) |
| `items` | TableOrderItem[] | Array of ordered items |
| `subtotal` | number | Pre-tax total |
| `tax_amount` | number? | Computed tax amount (in currency units) |
| `taxes` | SaleTaxBreakdown[]? | Per-rate tax breakdown |
| `total_amount` | number | Grand total (subtotal + tax) |
| `currency` | string | — |
| `status` | OrderStatus | PENDING \| RECEIVED \| PREPARING \| READY \| SERVED \| COMPLETED \| CANCELLED |
| `bill_requested` | boolean? | Customer clicked "Request Bill" |
| `bill_requested_at` | Date? | Timestamp of bill request |
| `payment_method` | string? | CASH \| UPI_QR \| CARD \| etc. |
| `payment_status` | string? | PAID \| REFUNDED \| CANCELLED |
| `session_id` | string? | Customer session ID |
| `promo_code` | string? | Applied promo code |
| `promo_discount` | number? | Discount amount |

**Per-item `TableOrderItem`**:
`item_id, item_key, name, price, currency, quantity, special_instructions?, variant_id?, variant_name?, food_type?, category?, station (KITCHEN|BAR), status (per-item: PENDING|RECEIVED|PREPARING|READY|SERVED|CANCELLED), ready_at?, served_at?, cancelled_at?, ordered_at?`

### `businesses/{businessId}/service_requests/{pingId}` — service pings

| Field | Type | Description |
|---|---|---|
| `id` | string | — |
| `type` | string | BILL_REQUEST \| WAITER_CALL \| WATER \| CLEANING |
| `business_id` | string | — |
| `order_id` | string? | — |
| `table_id` | string | — |
| `table_number` | string | — |
| `order_number` | string? | — |
| `customer_name` | string? | — |
| `payment_method` | string? | For BILL_REQUEST |
| `total_amount` | number? | For BILL_REQUEST |
| `status` | string | PENDING \| ATTENDED \| RESOLVED |
| `created_at` | string | — |

**ID patterns**:
- Bill requests: `bill-{orderId}`
- Table calls: `waiter-{tableId}-{Date.now()}`
- Water/cleaning: similar timestamp-based IDs

### `businesses/{businessId}/tax_settings/default` — tax config

Single document, always at ID `default`.

| Field | Type | Description |
|---|---|---|
| `business_id` | string | — |
| `tax_enabled` | boolean | Master on/off |
| `currency` | string | e.g. `NPR` |
| `currency_symbol` | string | e.g. `रु` |
| `rates` | TaxRateItem[] | Array of tax rates |
| `invoice_prefix` | string? | e.g. `INV` |
| `receipt_footer_note` | string? | Footer text for receipts |
| `pan_vat_number` | string? | Business PAN/VAT number |
| `active_promo_code` | string? | Current promo code |
| `active_promo_percent` | number? | Promo discount % |
| `active_promo_enabled` | boolean? | Toggle promo on/off |
| `order_reset_interval` | string? | MANUAL \| DAILY \| WEEKLY \| MONTHLY \| YEARLY |
| `last_order_reset_date` | string? | ISO date |

**`TaxRateItem`**: `{ id, name, rate_percent, enabled, is_inclusive?, description? }`
- Active business (`seoul-jib-restaurant-pvt-ltd`): 13% VAT, `is_inclusive: false`, `tax_enabled: true`

### `businesses/{businessId}/sales/{saleId}` — settled sale records

| Field | Type | Description |
|---|---|---|
| `invoice_number` | string | — |
| `order_number` | string? | — |
| `sale_type` | SaleType | DINE_IN \| TAKEAWAY \| DELIVERY \| ROOM_SERVICE \| QUICK_POS |
| `items` | SaleItem[] | Sold items snapshot |
| `subtotal` | number | — |
| `taxes` | SaleTaxBreakdown[] | — |
| `total_tax` | number | — |
| `total_amount` | number | — |
| `payment_method` | SalePaymentMethod | CASH \| UPI_QR \| CARD \| ONLINE \| ROOM_BILL \| SPLIT \| QR_CODE |
| `payment_status` | SalePaymentStatus | PAID \| REFUNDED \| CANCELLED |
| `cashier_name` | string? | — |
| `date_string` | string | YYYY-MM-DD |

### `businesses/{businessId}/gl_accounts/{accountId}` — GL accounts

`{ id, account_number, account_name, category (REVENUE|TAX_LIABILITY|ASSET|EXPENSE|LIABILITY|EQUITY), mapping_key?, is_active }`

### `businesses/{businessId}/check_ins/{checkInId}` — hotel check-ins

`{ id, guest_name, guest_phone?, room_or_table_number, check_in_date, check_out_date?, status (CHECKED_IN|CHECKED_OUT|RESERVED|CANCELLED), total_amount?, deposit_paid?, handled_by_user_id }`

### `businesses/{businessId}/counters/{type}` — sequential counters

Used by `sequence.util.ts` for incrementing order/invoice numbers. `type` is e.g. `order` or `invoice`.

---

## 7. API Reference (Server Routes)

### Route resolution — `businessId`

All `/api/rbac` routes resolve businessId in this priority:
1. `req.query.businessId`
2. `req.headers['x-business-id']`
3. `req.body.business_id` or `req.body.businessId`
4. `req.user.business.id` (from JWT)
5. Fallback: `'maya-forest-resort'`

### `/api/auth` (auth.routes.ts)

| Method | Path | Rate Limited | Description |
|---|---|---|---|
| POST | `/signup` | Yes | Register user + business. Sends OTP. |
| POST | `/verify-email` | Yes | Verify OTP to activate account |
| POST | `/verify-whatsapp` | Yes | Alias for verify-email |
| POST | `/resend-otp` | Yes | Resend OTP (cooldown enforced) |
| POST | `/login` | Yes | Login → returns JWT + user |
| POST | `/forgot-password` | Yes | Send password reset link |
| POST | `/reset-password` | No | Apply reset token + new password |
| GET | `/me` | No | Restore session (optional auth) |
| POST | `/logout` | No | Invalidate session (optional auth) |
| GET | `/audit-logs` | No | Fetch auth audit logs |
| GET | `/dev-info` | No | Dev helper (DEV mode only) |

### `/api/rbac` (= `/api/business`) (rbac.routes.ts)

**Business management**:
| POST | `/businesses` | Required | Create new business |
| GET | `/businesses` | Optional | List businesses |
| GET | `/branches` | Required | List branches of current business |
| POST | `/branches` | Required | Create a new branch |
| GET | `/business-profile` | Optional | Get business profile |
| PUT | `/business-profile` | Required | Update business profile |

**Menu**:
| GET | `/categories` | Optional | List menu categories |
| POST | `/categories` | Required | Create category |
| PUT | `/categories/:id` | Required | Update category |
| DELETE | `/categories/:id` | Required | Delete category |
| GET | `/menus` | Optional | List menu items |
| POST | `/menus` | Required | Create menu item |
| PUT | `/menus/:id` | Required | Update menu item |
| PATCH | `/menus/:id/status` | Required | Toggle availability |
| DELETE | `/menus/:id` | Required | Delete menu item |

**Staff / Check-ins**:
| GET | `/staff` | Required | List staff (each member includes effective `allowed_tabs`) |
| POST | `/staff` | Required | Add staff — body takes `allowed_tabs` (≥1 required) |
| PATCH | `/staff/:id/role` | Required | Change role label and/or `allowed_tabs` (body `custom_permissions` ignored). Anti-escalation rules in §19.7 |
| DELETE | `/staff/:id` | Required | Remove staff |
| GET | `/check-ins` | Required | List hotel check-ins |
| POST | `/check-ins` | Required | Create check-in |
| PUT | `/check-ins/:id` | Required | Update check-in |
| DELETE | `/check-ins/:id` | Required | Delete check-in |

**Tables**:
| GET | `/tables` | Optional | List tables |
| POST | `/tables` | Required | Create table |
| PUT | `/tables/:id` | Required | Update table |
| PATCH | `/tables/:id/status` | Required | Update table status |
| DELETE | `/tables/:id` | Required | Delete table |
| POST | `/tables/seed-defaults` | Required | Seed default tables |
| POST | `/tables/scan-checkin` | **None** | QR scan (public — creates guest session) |
| POST | `/tables/:id/reset-session` | Required | Reset table session (after settlement) |
| POST | `/tables/reset-status` | **None** | Bulk reset table status (public) |

**Orders** (all public — no auth required):
| POST | `/table-orders` | None | Create/append table order. Computes tax server-side. |
| POST | `/orders` | None | Alias for `/table-orders` |
| GET | `/orders` | None | List orders for a business |
| PUT | `/orders/:orderId/status` | None | Update whole order status |
| PUT | `/orders/:orderId/items/:itemIndex/status` | None | Update single item status by index |
| PATCH | `/orders/:orderId/items/status` | None | Bulk item status update |
| POST | `/orders/cleanup` | None | Delete old completed orders |
| DELETE | `/orders/completed` | None | Delete all completed orders |

**Tax & Billing**:
| GET | `/tax-config` | Optional | Get tax settings |
| PUT | `/tax-config` | Optional | Update tax settings |
| GET | `/gl-accounts` | Optional | List GL accounts |
| POST | `/gl-accounts` | Optional | Create GL account |
| PUT | `/gl-accounts/:id` | Optional | Update GL account |
| DELETE | `/gl-accounts/:id` | Optional | Delete GL account |
| POST | `/gl-accounts/reset-default` | Optional | Reset to default GL chart of accounts |
| GET | `/sales` | Optional | List sale records |
| POST | `/sales` | Optional | Create sale record (settlement) |
| DELETE | `/sales/:saleId` | Optional | Delete sale record |
| DELETE | `/sales` | Optional | Bulk delete sales |

**Permissions**:
| GET | `/permissions` | Required | Current user's effective access: `{ allowed_tabs, is_business_owner }` (replaces the old per-action `canManageMenus` / `canReadCheckIns` … flags) |

### `/api/menus` (menu.routes.ts)

Mirrors a subset of rbac menu/category routes. Mounted separately at `/api/menus`. CRUD for menu items and categories with `optionalAuthenticate`.

### `/api/images` (image.routes.ts)

Image search via Google Images scraping with 1-hour in-memory cache. No authentication.

---

## 8. Key Component File Map

### Customer-facing components

| File | Responsibility |
|---|---|
| `src/pages/CustomerMenuPreviewPage.tsx` | **Main orchestrator** for customer dining. QR session parse, menu load, cart, order, bill. ~2521 lines. |
| `src/components/cart/CustomerCartModal.tsx` | Cart review UI before placing order. POSTs to `/api/rbac/table-orders`. |
| `src/components/cart/OrderSuccessModal.tsx` | Post-order live tracker. `onSnapshot` on `table_orders/{orderId}`. Shows order status, VAT breakdown, inline bill request. ~1461 lines. |
| `src/components/billing/FinalTableBillPage.tsx` | Full-screen final bill page. Shown when `bill_requested = true` or customer requests bill. Handles payment method selection, promo codes. ~970 lines. |

### Staff-facing components

| File | Responsibility |
|---|---|
| `src/pages/DashboardPage.tsx` | Admin/staff dashboard container. Manages tab switching, staff session, branch switching. ~1034 lines. |
| `src/components/layout/Sidebar.tsx` | Left sidebar navigation. `DashboardTab` type. |
| `src/components/kds/KitchenDisplaySystem.tsx` | KDS — KITCHEN \| BAR \| WAITER views. Real-time order management. Bill settlement. ~2998 lines. |
| `src/components/waiter/WaiterStationDashboard.tsx` | Waiter view: service request queue (table calls, bill requests). |
| `src/components/billing/BillingPOS.tsx` | Cashier POS: active orders, create sale records, daybook, history. ~3129 lines. |
| `src/components/config/BusinessConfigurationCenter.tsx` | All business settings: tax, GL accounts, tables, menu, staff, theme, date format. ~1655 lines. |
| `src/components/dashboard/OperationsOverviewDashboard.tsx` | Overview tab with metrics, sales analytics. |

### Utility files

| File | Key exports |
|---|---|
| `src/lib/firebase.ts` | `db` (Firestore client instance) |
| `src/utils/firestoreUtils.ts` | `sanitizeFirestorePayload<T>(obj)` — REQUIRED before any Firestore write with nested objects |
| `src/utils/dateFormatter.ts` | `formatDualDate(date, mode)`, `renderFormattedDate(date, mode, separator)`, `DateFormatMode` |
| `src/services/rbac.service.ts` | `rbacService` (singleton `ClientRBACService`) — all API calls, staff session mgmt |
| `src/context/AuthContext.tsx` | `useAuth()`, `AuthProvider` — user, business, branches, login/logout |

---

## 9. Customer Dining Flow (End-to-End)

```
Customer scans QR code on table
         ↓
POST /api/rbac/tables/scan-checkin
  - Validates host_token in QR
  - Returns: { businessId, tableId, tableNumber, sessionId, hostToken }
  - Updates tables/{tableId}: status=OCCUPIED, current_session_id, last_scanned_at
         ↓
SessionStorage: 'serveflow_customer_table_session' = CustomerTableSession JSON
SessionStorage: 'serveflow_customer_active' = 'true'
App.tsx guest lock activates → customer locked to /menu
         ↓
CustomerMenuPreviewPage loads
  - Reads business doc (businesses/{bizId})
  - Reads menu items (businesses/{bizId}/menus)
  - Reads categories (businesses/{bizId}/menu_categories)
  - Subscribes to tables/{tableId} via onSnapshot (for session validity)
  - Displays: table number in header, Live Menu title
         ↓
Customer browses menu, adds items to cart
  - MenuItemDetailModal: tap +/- to modify qty, cart count shown inside modal
         ↓
CustomerCartModal: review cart items
POST /api/rbac/table-orders
  Body: { businessId, tableId, tableNumber, items[], sessionId, hostToken, ... }
  Server (rbac.service.ts):
    - Checks for existing active order on this table
    - If exists: APPENDS items to existing order
    - If new: creates new TableOrder doc
    - Computes tax from businesses/{bizId}/tax_settings/default
    - Stores: taxes[], tax_amount, total_amount, subtotal
    - Updates tables/{tableId}: status=OCCUPIED, order_number
  Returns: { order: TableOrder }
         ↓
OrderSuccessModal opens
  - onSnapshot(businesses/{bizId}/table_orders/{orderId})
  - Live status: PENDING → RECEIVED → PREPARING → READY → SERVED
  - Shows: item statuses, VAT breakdown (subtotal + tax + total)
  - Can: call waiter (writes to service_requests/waiter-{tableId}-{ts})
         ↓
Customer clicks "Request Bill" (inside OrderSuccessModal or FinalTableBillPage)
  - Updates table_orders/{orderId}: bill_requested=true, bill_requested_at
  - Writes service_requests/bill-{orderId}: type=BILL_REQUEST, payment_method, total_amount
  - Tables/{tableId}: status=OCCUPIED (stays until settled)
         ↓
FinalTableBillPage
  - onSnapshot on table_orders/{orderId} for live updates
  - Shows: subtotal, VAT, total, payment method
  - Customer cannot navigate back (hardware back trapped)
  - Customer cannot return to menu
         ↓
Staff settles bill (via BillingPOS)
  - Creates sale record (businesses/{bizId}/sales/{saleId})
  - Resets table: status=ACTIVE, clears session, order_number, host_token
  - Marks order: status=COMPLETED, payment_status=PAID
  - Resolves service_requests document
         ↓
Customer sees "Thank you for dining" card (FinalTableBillPage thank-you state)
```

---

## 10. Staff Flows

### Kitchen Display System (KDS)

- **Accessed from**: Dashboard → Orders tab (`kds`)
- **Modes**: `KITCHEN` (food items), `BAR` (drinks), `WAITER` (service requests + delivery)
- **Real-time**: `onSnapshot` on `tables`, `table_orders`, `service_requests`
- **Order flow**: PENDING → RECEIVED → PREPARING → READY → SERVED → COMPLETED
- **Per-item status**: Each `TableOrderItem` has its own `status` field
- **Kitchen/Bar**: cooks mark items/all items READY (pings waiter). There is **no "Mark Delivered"** here any more — delivery is the waiter's action.
- **Settlement**: **removed from KDS** (2026-10-11). Bills are settled only in Finance & POS (`BillingPOS`) → writes to `sales`, resets table + order.

### Waiter Station Dashboard

- **Accessed from**: Dashboard → Waiter Station tab (`waiter`) — `WaiterStationDashboard` renders `KitchenDisplaySystem` with `defaultStation="WAITER"`
- **Shows**: Service request queue (WAITER_CALL, BILL_REQUEST, WATER, CLEANING)
- **Real-time**: `onSnapshot` on `businesses/{bizId}/tables`
- Table calls appear in queue (NOT overlaid on table grid)
- Actions: Mark attended, mark resolved, "Folio Delivered" (acknowledge bill), "Deliver All to Table #", per-item serve. **No "Settle & Free Table"** (removed 2026-10-11).

### BillingPOS

- **Accessed from**: Dashboard → Billing tab
- **Features**: Active order list, quick POS sale, sales history, daybook, Excel export, promo codes, GL accounts
- **Real-time**: `onSnapshot` on `table_orders` and `service_requests`
- **Settlement**: Updates order status, creates `SaleRecord`, resets table

### BusinessConfigurationCenter

- **Accessed from**: Dashboard → Configurations tab
- **Sections**:
  - Business profile (name, type, phone, location)
  - Menu management (items, categories, themes)
  - Table management (create, edit, QR)
  - Tax configuration → `tax_settings/default`
  - GL accounts → `gl_accounts/{id}`
  - Staff management
  - Date format (nav + billing KOT/bill)
  - Printer configuration

---

## 11. Tax & Billing Architecture

### Tax Configuration Storage

Stored at: `businesses/{businessId}/tax_settings/default` (Firestore)

**Active config for `seoul-jib-restaurant-pvt-ltd`**:
- `tax_enabled: true`
- `rates: [{ id: 'vat', name: 'VAT', rate_percent: 13, enabled: true, is_inclusive: false }]`
- `currency: 'NPR'`, `currency_symbol: 'रु'`

### Tax Computation (Server-side)

**Where**: `server/src/services/rbac.service.ts` → `createTableOrder()` function (~line 1657)

**Flow**:
1. `createTableOrder()` is called when customer POSTs to `/api/rbac/table-orders`
2. Fetches `getTaxConfig(businessId)` from Firestore
3. Computes `subtotal` from item prices × quantities
4. For each enabled tax rate: `taxAmount = (subtotal × rate_percent) / 100`
5. Stores in Firestore: `{ subtotal, tax_amount: totalTax, taxes: [{ name, rate_percent, amount }], total_amount: subtotal + totalTax }`
6. On item append (existing order): recalculates and updates all three fields

### Tax Display (Client-side)

**`OrderSuccessModal.tsx`** — Live Tracker VAT display:
- Reads `taxes[]` and `tax_amount` from `onSnapshot` Firestore data
- Fallback: if `taxConfig` not loaded yet, uses 13% VAT standard
- Display condition: `taxesList.length > 0` (NOT gated on `taxConfig?.tax_enabled`)

**`FinalTableBillPage.tsx`** — Final Bill VAT display:
- `useMemo` for `taxesList/totalTax` with robust fallback chain:
  1. `liveOrder.taxes[]` (from Firestore snapshot)
  2. `liveOrder.tax_amount` (from Firestore)
  3. `total_amount - subtotal` difference
  4. Default 13% VAT calculation
- Fetches `taxConfig` via both `rbacService.getTaxConfigApi()` (immediate) AND `onSnapshot` on `tax_settings/default`

### `sanitizeFirestorePayload` — CRITICAL RULE

Before ANY Firestore `setDoc` or `updateDoc` with nested objects or arrays, you MUST call `sanitizeFirestorePayload()`:

```ts
import { sanitizeFirestorePayload } from '../../utils/firestoreUtils';

await setDoc(docRef, sanitizeFirestorePayload({ ...payload }));
```

Firestore rejects any field with `undefined` value. This function recursively strips undefined fields.

---

## 12. Date Formatting System

### Config storage

`Business.date_format_nav` and `Business.date_format_billing` — stored in the `businesses/{bizId}` Firestore doc.

- `date_format_nav`: Controls date display in dashboard navbar
- `date_format_billing`: Controls date on KOT slips and bill prints
- Values: `'ENGLISH' | 'NEPALI' | 'BOTH'`

### `src/utils/dateFormatter.ts`

```ts
type DateFormatMode = 'ENGLISH' | 'NEPALI' | 'BOTH';

formatDualDate(date: Date, mode: DateFormatMode): DualDateParts
// Returns: { time12, englishDate, nepaliDate, englishFull, nepaliFull }

renderFormattedDate(date, mode, separator?): string
// ENGLISH → "Oct 1, 2026, 04:23 PM"
// NEPALI  → "2083 Aswin 15, 04:23 PM (BS)"
// BOTH    → "04:23 PM | Oct 1, 2026 | 2083 Aswin 15 (BS)"
```

**Rules**:
- Never use 24-hour format — always `hour12: true`
- When NEPALI: time comes before date, 12hr AM/PM
- When BOTH: time12 appears ONCE before both dates
- In navbar: both dates bold, same style

### Nepali date library

`nepali-datetime` v2. The constructor is accessed as `(NepaliDate as any)?.default || NepaliDate` due to ESM/CJS interop. Format string: `'YYYY MMMM DD'`.

---

## 13. State Management & Contexts

### Contexts

| Context | Provider | Hook | Provides |
|---|---|---|---|
| `AuthContext` | `AuthProvider` | `useAuth()` | `user, activeBusiness, branches, isAuthenticated, login, logout, switchBranch, createBranch, refreshUser, updateBusiness` |
| `PrinterContext` | `PrinterProvider` | `usePrinter()` (assumed) | Printer config for receipt printing |

### Key localStorage keys

| Key | Type | Purpose |
|---|---|---|
| `serveflow_auth_token` | string | JWT for owner/admin |
| `serveflow_cached_user` | JSON | Cached user object (restored on reload) |
| `serveflow_active_branch_id` | string | Currently selected branch |

### Key sessionStorage keys

| Key | Type | Purpose |
|---|---|---|
| `serveflow_customer_table_session` | JSON `CustomerTableSession` | Active dining session |
| `serveflow_customer_active` | `'true'` | Guest lock flag |
| `serveflow_staff_role_session` | JSON `StaffAccountSession` | Staff pin login session |
| `serveflow_pending_verify` | JSON | Pending OTP verification |

---

## 14. Key Types Reference

### `AppRole` (client: `src/types/rbac.ts`)
`OWNER | MANAGER | ADMIN | RESTAURANT_OWNER | HOTEL_OWNER | RESTAURANT_MANAGER | HOTEL_MANAGER | FRONT_DESK | KITCHEN_STAFF | HOUSEKEEPING | CASHIER | WAITER | BAR_STAFF | STAFF` — **display label / login designation only; carries no permissions** (§19). Only OWNER/ADMIN/RESTAURANT_OWNER/HOTEL_OWNER bypass the tab list.

### `TabPermissionId` (`src/types/rbac.ts`, mirrored in `server/src/types/rbac.types.ts`) — NEW
`overview | operations | kds | waiter | checkins | menus | billing | team | configurations | account | franchise` — stored per account as `allowed_tabs` (§19).

### `OrderStatus`
`PENDING | RECEIVED | PREPARING | READY | SERVED | COMPLETED | CANCELLED`

### `TableStatus`
`ACTIVE | INACTIVE | OCCUPIED | RESERVED`

### `KitchenStation`
`KITCHEN | BAR`

### `SaleType`
`DINE_IN | TAKEAWAY | DELIVERY | ROOM_SERVICE | QUICK_POS`

### `SalePaymentMethod` (client includes QR_CODE, server does not)
`CASH | UPI_QR | CARD | ONLINE | ROOM_BILL | SPLIT | QR_CODE`

### `DashboardTab` (`src/components/layout/Sidebar.tsx`)
`overview | operations | kds | waiter | menus | checkins | team | billing | account | audit | configurations` (`audit` has no sidebar entry; sidebar labels: Dashboard, Business Operation, Orders, Waiter Station, Table & Space, Menu, Finance & POS, Staff, Settings, Business Details)

### `DateFormatMode`
`BOTH | ENGLISH | NEPALI`

### `BusinessType`
`RESTAURANT | HOTEL | CAFE | RESORT | BAR | OTHER`

### `MenuThemeConfig` presets
`minimal | bistro | midnight | emerald | vibrant | rustic | paper`

---

## 15. Known Patterns & Gotchas

### 1. `server/src/services/rbac.service.ts` has CRLF line endings

This file uses `\r\n` (Windows CRLF). The `replace_file_content` tool can fail on this file because it normalizes to LF when matching. **Fix**: Use a Node.js scratch script to edit this file:

```js
// Example scratch script pattern
const fs = require('fs');
let content = fs.readFileSync('server/src/services/rbac.service.ts', 'utf8');
content = content.replace(/TARGET_PATTERN/, 'REPLACEMENT');
fs.writeFileSync('server/src/services/rbac.service.ts', content, 'utf8');
```

### 2. Always use `sanitizeFirestorePayload` before Firestore writes

Firestore throws `"Unsupported field value: undefined"` for any `undefined` value in nested objects/arrays. Always wrap payloads:
```ts
await setDoc(docRef, sanitizeFirestorePayload({ ...data }));
```

### 3. No React Router — custom navigation

Navigating programmatically: call the `onNavigate(path)` prop (received from App.tsx). Never use `window.location.href =` or `window.location.assign()` as these cause full page reloads.

### 4. Hardware back button trap (customer)

After requesting the final bill (`bill_requested = true`), `FinalTableBillPage` listens to `popstate` and pushes state back:
```ts
window.history.pushState({ billLocked: true }, '');
window.addEventListener('popstate', () => window.history.pushState({}, ''));
```
Do NOT remove this — it's intentional.

### 5. Dual Firestore access pattern

- **Client writes directly to Firestore** for real-time features: order status, table state, service requests
- **Server uses firebase-admin** for all user/auth data and for mutations that need server-side computation (tax calc)
- This means two separate Firebase init paths: `src/lib/firebase.ts` (client SDK) and `server/src/config/firebase.ts` (admin SDK)

### 6. `businessId` fallback in server routes

The server defaults to `'maya-forest-resort'` if no `businessId` is provided. Active test business is `seoul-jib-restaurant-pvt-ltd`. Always pass `?businessId=...` or `x-business-id` header in API calls.

### 7. Tax display condition — do NOT gate on `taxConfig`

Tax rows must display even when `taxConfig` hasn't loaded. Use:
```ts
// CORRECT
{taxesList.length > 0 && <TaxRow />}

// WRONG — causes race condition where tax disappears
{taxConfig?.tax_enabled && taxesList.length > 0 && <TaxRow />}
```

### 8. Legacy top-level Firestore collections (client `rbac.service.ts`)

Some methods in `src/services/rbac.service.ts` use old paths like `collection(db, 'menus')`, `collection(db, 'check_ins')`, `collection(db, 'tables')`. These are legacy and NOT the correct business-scoped paths. New code should always use `businesses/{bizId}/menus`, etc.

### 9. `@` alias in Vite

`vite.config.ts` sets `@` → project root. So `@/src/...` works in imports.

### 10. TypeScript check

Run `npx tsc --noEmit` to validate types without building. All changes should pass this with zero errors before finalizing.

### 11. Staff session events

When staff role changes, a `CustomEvent('serveflow:staff-session-changed')` is dispatched on `window`. Components that need to react to this should listen for it.

### 12. Item pop-up (MenuItemDetailModal) behavior

- `+`/`-` buttons directly update the cart (no "Add to Order" button)
- Shows "X in cart" count inside the modal
- After removing all of an item from cart, modal can close

---

## 16. Active Business Config (Dev)

| Property | Value |
|---|---|
| Business ID | `seoul-jib-restaurant-pvt-ltd` |
| Tax enabled | `true` |
| Tax rate | 13% VAT (`is_inclusive: false`) |
| Currency | `NPR` (`रु`) |
| Invoice prefix | (configured in `tax_settings/default`) |
| Firestore path | `businesses/seoul-jib-restaurant-pvt-ltd` |

---

## 17. Environment Variables

From `.env.example`:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default 3000) |
| `FRONTEND_URL` | CORS origin |
| `JWT_SECRET` | JWT signing key |
| `SESSION_EXPIRY_DAYS` | JWT expiry |
| `BCRYPT_SALT_ROUNDS` | Password hashing |
| `OTP_EXPIRY_MINUTES` | OTP validity window |
| `OTP_LENGTH` | OTP digit count |
| `OTP_MAX_ATTEMPTS` | Max OTP tries |
| `OTP_RESEND_COOLDOWN_SECONDS` | Resend rate limit |
| `OTP_MAX_REQUESTS_PER_HOUR` | Hourly OTP limit |
| `DEV_OTP_MODE` | `true` → OTP returned in API response for dev |
| `WHATSAPP_PROVIDER` | `meta` \| `twilio` \| `mock` |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp API token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta business account ID |
| `TWILIO_ACCOUNT_SID` | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | — |
| `TWILIO_WHATSAPP_FROM` | — |
| `TWILIO_CONTENT_SID` | — |
| `EMAIL_PROVIDER` | `mock` \| `smtp` |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP user |
| `EMAIL_PASSWORD` | SMTP password |
| `EMAIL_FROM` | From address |
| `APP_URL` | Public app URL |
| `GEMINI_API_KEY` | Google Gemini API key |

**Firebase config** is NOT in `.env` — it's in `firebase-applet-config.json` at project root.

---

## 18. Recent Changes Log

> Update this section whenever significant changes are made to the codebase.

### 2026-10-13 — Order Number Persistence Fix on Page Reload (Sales Register & Excel Export)

**Problem**: After reloading the page, the Order Number column in the Sales Register / Excel Preview table rendered `-` instead of the actual order number (e.g., `ORD-01`, `ORD-03`, `ORD-04`, `ORD-05`).

**Root Cause**:
- When POS generated a sale, the newly created record in client memory had `order_number`, so it showed up immediately.
- However, in `server/src/services/rbac.service.ts` inside `public async getSales(...)`, the Firestore document deserialization loop mapped fields into `SaleRecord` but completely omitted `order_number`, `promo_code`, and `promo_discount`.
- On page refresh, `BillingPOS.tsx` invoked `rbacService.getSalesApi({}, business.id)` (`GET /api/rbac/sales`), fetching sales without `order_number` (`undefined`), which caused `src/utils/excelExport.ts` lines 231 & 368 (`sale.order_number || '-'`) to display `-`.

**Fix applied**:
- In `server/src/services/rbac.service.ts`:
  - `getSales()`: Added `order_number: d.order_number || (d.order_id ? d.order_id.slice(0, 8).toUpperCase() : undefined)`, `promo_code: d.promo_code || undefined`, and `promo_discount: Number(d.promo_discount) || 0`.
  - `createSale()`: Persisted `promo_code: saleData.promo_code || null` and `promo_discount: Number(saleData.promo_discount) || 0` in `newSale` alongside `order_number`.
  - `acceptTableOrderPayment()`: Explicitly included `order_number: order.order_number || undefined` in `salePayload`.
- Verified live Firestore response for `7-spices`: All sales now return their real `order_number` (`INV-1` -> `ORD-01`, `INV-2` -> `ORD-03`, `INV-3` -> `ORD-04`, `INV-4` -> `ORD-05`).
- Verified full test suite passes (`vat_inclusive_exclusive.test.ts` 12/12) and both `ServeFlow-test` and `Serveflow` workspaces build cleanly (exit code 0).

### 2026-10-13 — Customer View Live Tracker & Cart Card Spacing Reduction

**Goal**: Reduce the vertical spacing inside and between cards in the Customer View Live Tracker modal (`OrderSuccessModal.tsx`) and Customer Cart drawer (`CustomerCartModal.tsx`) so customers can see more dishes/items fitted in their viewport without excessive scrolling.

**Changes applied**:
1. **Live Tracker Modal (`OrderSuccessModal.tsx`)**:
   - Header & Timeline: Reduced header vertical padding (`px-4 py-3 sm:px-5 sm:py-3.5` -> `px-3.5 py-2 sm:px-4 sm:py-2.5`), icon sizes, and timeline padding (`px-4 py-2.5 sm:px-5 sm:py-3` -> `px-3.5 py-1.5 sm:px-4 sm:py-2`).
   - Scrollable Body: Tightened modal inner padding from `p-6 space-y-5` to `p-3 sm:p-3.5 space-y-2.5`.
   - Table & Status Info Card: Reduced card padding (`p-3.5` -> `px-3 py-2`) and gap (`gap-3` -> `gap-2`).
   - Readiness Alert Banner: Reduced padding from `p-3` to `px-2.5 py-1.5`, reduced icon box from `w-8 h-8` to `w-6 h-6`.
   - Ordered Items List Card: Reduced item row vertical padding from `py-3` to `py-1.5`, inner element gap from `space-y-1` to `space-y-0.5`, and container padding from `p-3` to `px-3 py-2`.
   - Quick Bill Callout Card: Reduced padding from `p-4` to `px-3 py-2 sm:px-3.5 sm:py-2.5`, inner stack spacing from `space-y-1.5` to `space-y-0.5`, and total row padding to `pt-1.5`.
   - Footer & Notices: Reduced footer padding from `p-4` to `px-3.5 py-2.5`, notice banner from `p-2.5` to `px-2.5 py-1.5`, and button stack gap to `gap-2`.
2. **Customer Order Cart Drawer (`CustomerCartModal.tsx`)**:
   - Cart Header: Reduced header padding from `p-5 sm:p-6` to `px-4 py-2.5 sm:px-5 sm:py-3` and icon box from `w-10 h-10` to `w-8 h-8`.
   - Table Reference Strip: Reduced padding from `px-6 py-2.5` to `px-4 py-1.5 sm:px-5 sm:py-1.5`.
   - Scrollable Cart Content: Tightened drawer body from `p-5 sm:p-6 space-y-5` to `p-3 sm:p-4 space-y-2.5`.
   - Cart Item Rows: Reduced item row padding from `py-4` to `py-2`, item inner gap from `space-y-2.5` to `space-y-1.5`, stepper buttons from `w-7 h-7` to `w-6 h-6`, and special instructions note input padding to `py-0.5 px-2`.
   - General Notes & Guest Details: Reduced container margin/padding from `pt-4 space-y-3.5` to `pt-2.5 space-y-2`, textarea rows to 1, and input padding to `py-1`.
   - Cart Footer: Tightened footer padding from `p-5 sm:p-6 space-y-3.5` to `px-4 py-2.5 sm:px-5 sm:py-3 space-y-2`, breakdown lines to `space-y-0.5`, and checkout button padding to `py-2.5`.

### 2026-10-13 — Full Production Migration to PostgreSQL (Supabase) + Prisma ORM + Socket.io Real-Time Engine

**Goal**: Complete end-to-end production migration of all core database storage and real-time event mechanisms from Firebase Firestore to PostgreSQL (hosted on Supabase via AWS ap-south-1 pooler), using Prisma ORM as primary data layer and Socket.io for bidirectional real-time event distribution. Maintain 100% UI layout fidelity, zero downtime dual-write backward compatibility, and 100% test parity.

**Architecture & Implementation Details**:
1. **Schema & Database Sync (`prisma/schema.prisma`)**:
   - Designed normalized relational schema with PostgreSQL models: `Business`, `User`, `MenuCategory`, `MenuItem`, `RestaurantTable`, `TableOrder`, `Sale`, `TaxConfig`, `GLAccount`, `ServiceRequest`, `Counter`, `AuditLog`, `PhoneVerification`, `OtpVerification`, and `PasswordResetToken`.
   - Pushed directly to Supabase PostgreSQL pooler (`aws-0-ap-south-1.pooler.supabase.com:5432/postgres`) via `prisma db push`.
2. **Data ETL Script (`server/src/scripts/seed_from_firestore_to_postgres.ts`)**:
   - Seeded all production and test business profiles, users, menu categories, menu items, dining tables, sales records, GL accounts, and tax configurations from Firestore into PostgreSQL.
3. **Real-Time Engine (`server/src/lib/socket.ts` & `src/services/socket.service.ts`)**:
   - Initialized Socket.io server engine in `server.ts` alongside Express.
   - Room architecture: `business:${businessId}` for staff broadcasts and `table:${businessId}:${tableId}` for table-specific dining sessions.
   - `realtimeEmitter` utility broadcasts: `orderCreated`, `orderUpdated`, `tableUpdated`, `menuUpdated`, `taxConfigUpdated`.
   - Client singleton `socketService` / `realtimeSocket` provides subscriptions with graceful fallback to Firestore listeners.
4. **Backend Services & Routes Porting**:
   - `server/src/services/db.service.ts`: Migrated Auth, Users, Businesses, AuditLogs, OTPs, and password reset tokens to Prisma PostgreSQL.
   - `server/src/services/rbac.service.ts`: Ported Menu Categories & Items, Tables & Sessions, Table Orders (KDS, Waiter, Customer), Taxes & VAT (inclusive/exclusive), GL Accounts, and Sales & Sequences to Prisma PostgreSQL with Firestore dual-write mirror and Socket.io emission. Added automatic table and business provisioning (`db.ensureBusiness`) to eliminate foreign-key constraint failures during out-of-band test executions.
   - `server/src/routes/menu.routes.ts`: Fully migrated to Prisma PostgreSQL with category relation joins.
   - `server/src/routes/rbac.routes.ts`: Migrated guest payment method update to Prisma PostgreSQL + Socket.io.
5. **Frontend Real-Time Integration**:
   - `KitchenDisplaySystem.tsx`: Attached `socketService.subscribeToOrders` and `socketService.subscribeToTables` for instant order and table state updates.
   - `WaiterStationDashboard.tsx`: Attached `socketService.subscribeToTables` for immediate table status synchronization.
   - `CustomerMenuPreviewPage.tsx`: Attached `socketService.joinTable`, `socketService.subscribeToOrders`, and `socketService.subscribeToTables` to sync customer cart orders and table settlement state instantly.
6. **Verification & Test Suite**:
   - Clean production build (`npm run build`: Vite frontend + esbuild server bundle).
   - 136/136 tests passing across all 7 test suites (auth, rbac security audit, custom permissions, vat inclusive/exclusive, credit GL, pay-first, and pay-first tracking).

### 2026-10-13 — Exclusive vs. Inclusive of VAT% Pricing Configuration & Calculation

**Goal**: Provide a master configuration toggle in **Taxes, Currency & Invoicing** (`TaxConfigurationPanel.tsx`) to switch between **Exclusive of VAT%** (`tax_inclusive = false`) and **Inclusive of VAT%** (`tax_inclusive = true`), and unify all order/bill/POS/receipt/Excel calculations so that:
- In **Exclusive of VAT%** mode, menu item prices represent the **Subtotal**, and VAT is calculated on top (`grossTotal = subtotal + totalTax`).
- In **Inclusive of VAT%** mode, menu item prices represent the pre-discount **Grand Total**, and **Subtotal** and **VAT** are reverse-calculated (`subtotal = round2(grossTotal / (1 + totalRatePercent / 100))`, `totalTax = round2(grossTotal - subtotal)` with 1-paisa residual reconciliation so `subtotal + sum(taxes) === grossTotal`; e.g., `Rs. 400` @ 13% VAT -> `Subtotal = Rs. 353.98`, `VAT = Rs. 46.02`).
- **Discounts (manual flat, manual %, promo code %) are never combined with VAT** in either mode: VAT is always calculated on the full undiscounted Subtotal, and discounts are deducted directly from the pre-discount Grand Total (`grossTotal`).
- **Excel Export & Sheet Preview**: Preserved all columns, headers, and layout unchanged while fixing `t.rate_percent ?? t.rate` in the `Taxes Breakdown` column and scaling beverage revenue split proportionally to net `subtotal` so the GL Journal Summary remains balanced (`Debits = Credits`) in both Exclusive and Inclusive modes.

**Files changed**:
- `src/types/rbac.ts` & `server/src/types/rbac.types.ts`: Added `tax_inclusive?: boolean` to `BusinessTaxConfig` and `tax_id?: string` to `SaleTaxBreakdown`.
- `src/utils/taxCalculations.ts` (new): Shared calculation engine (`round2`, `isTaxInclusiveMode`, `calculateBillTotals`).
- `src/components/billing/TaxConfigurationPanel.tsx`: Added master **VAT Pricing Calculation Mode** toggle card (`Exclusive of VAT%` vs `Inclusive of VAT%`), synced local state with `taxConfig` prop via `useEffect`, and persisted mode toggles immediately via `rbacService.updateTaxConfigApi`.
- `server/src/services/rbac.service.ts`: Added `calculateOrderTaxBreakdown(itemsMenuTotal, taxConfig)` and `resolveOrderPromoDiscount(preDiscountTotal, orderData, taxConfig)`, and updated `createTableOrder`, `updateTableOrderItemStatus`, `getTaxConfig`, `updateTaxConfig`, and `confirmTableOrderPayment` (including live recalculation of unsettled `table_orders` and percentage promo discounts when tax settings change).
- `src/components/billing/BillingPOS.tsx`: Added real-time `onSnapshot` listener for `tax_settings/default`; unified active order settlement cards, `payFirstOrders` queue, `NewSaleModal`, `ReceiptSlipModal`, and `TableBillCheckSlipModal` to use `calculateBillTotals`; updated `handleSelectPendingOrder` to filter out cancelled items, preserve beverage/bar categories (`station === 'BAR'`), and restore customer-applied promo codes/discounts.
- `src/components/billing/FinalTableBillPage.tsx` & `src/components/cart/OrderSuccessModal.tsx`: Unified customer tracker and final bill views to use `calculateBillTotals`, restore saved `promo_code`/`promo_discount` on mount/refresh, and deduct promo discounts strictly from Grand Total without altering Subtotal or VAT.
- `src/utils/excelExport.ts` & `src/services/print.service.ts`: Fixed `rate_percent` in Excel `Taxes Breakdown`, scaled beverage revenue split (including `station === 'BAR'`) to net `subtotal` in inclusive mode, separated pure VAT from `service_charge` when `total_tax` includes `service_charge` so Sheet 3 (`GL Journal Summary`) never double-counts service charge, and added `total_tax`/`discount` support in thermal print receipts.
- `server/test/vat_inclusive_exclusive.test.ts` (new): Automated verification test suite for Exclusive/Inclusive VAT calculations, Grand-Total-only discount deduction, Excel GL Journal Summary balance, and Firestore order recalculation.

### 2026-10-12 — Customer View UI Spacing Reduction (CustomerMenuPreviewPage)

**Goal**: Tighten vertical layout spacing on customer menu browsing screens (CustomerMenuPreviewPage.tsx) for a cleaner, higher-density mobile and desktop presentation without altering headers, branding, logos, or functionality.

**Changes applied**:
1. **Hero Banner Section**:
   - Reduced container banner height: min-h-[90px] sm:min-h-[105px] -> min-h-[64px] sm:min-h-[72px].
   - Reduced content vertical padding: py-2.5 sm:py-3 -> py-1.5 sm:py-2.
   - Retained all internal descriptions, restaurant logo, typography, badges ("Live Menu", "Table #X"), and order action buttons.
2. **Main Layout & Card Spacing**:
   - Main content container outer spacing reduced: pt-1.5 sm:pt-2 space-y-2 -> pt-1 sm:pt-1.5 space-y-1.5.
3. **Search Bar Card & Dietary Controls**:
   - Card vertical padding reduced: py-2 sm:py-2.5 -> py-1.5 sm:py-1.5.
   - Search input vertical padding reduced: py-1.5 -> py-1 (icon aligned to top-2).
   - Dietary filter buttons vertical padding reduced: py-1.5 -> py-1.
4. **Subcategory / Category Tabs**:
   - Minimalist scroll container indicator padding reduced: pt-1 pb-0.5 -> pt-0.5 pb-0.
   - Category pill buttons vertical padding reduced: py-1.5 -> py-1.
5. **Item Cards Grid & Style D Interactive Card**:
   - Grid gap reduced: grid gap-4 -> grid gap-2.5 sm:gap-3.
   - Card inner padding: p-3 sm:p-4 -> p-2.5 sm:p-3.
   - Card stack gap: gap-2.5 sm:gap-3 -> gap-1.5 sm:gap-2.
   - Dish image dimensions: 4.75rem (76px) -> 4.25rem (68px).
   - Beside-image row gap and margin: mt-1 sm:mt-1.5 -> mt-0.5 sm:mt-1.
   - Thin description box height: h-10 (40px) -> h-8 sm:h-9 (32-36px) with py-0.5.
   - Variant & single-item action buttons vertical padding reduced: py-1.5 -> py-1.
   - Quantity selector controls vertical padding reduced: py-1 -> py-0.5.
   - Cart pill badge padding & positioning adjusted: top-2.5 right-2.5 -> top-2 right-2.

### 2026-10-11 — Tab-Based RBAC Rewrite (COMPLETED — spec in §19)

**Goal**: replace action-level, role-driven permissions with a single per-account list of permitted dashboard tabs (+ franchise switcher). Remove "Mark Delivered" (Kitchen/Bar) and "Settle & Free Table" (Waiter station). Implementation is split into Parts 1-6 (Claude: 1, 6 / Gemini: 2-5). Tick each part here as it lands:

- [x] Part 1 — Server core: `allowed_tabs` type + migration + tab-based `hasPermission` + anti-escalation + tests
- [x] Part 2 — Remove "Mark Delivered" and Waiter "Settle & Free Table" (UI + handlers)
- [x] Part 3 — Client foundation: `tabAccess.ts`, `Sidebar`, `DashboardPage`, `BranchSwitcher`, session types
- [x] Part 4 — Staff tab UI: tab-checklist modal + create-staff form + API client
- [x] Part 5 — Strip action-level gating inside tabs
- [x] Part 6 — Audit, security review, tests, build, final docs

### 2026-10-02 — Order Number Sequence Normalization & Clean Display (Task 1)

**Problem**: Order references across the app showed random alphanumeric Firestore document IDs (e.g. `ref: ORD-1A2B3C...`) in customer tracker, bill cards, and KOT/BOT thermal slips. Furthermore, order numbering was defaulting to single letter prefixes (`A1`, `A2`) instead of `ORD-01`.

**Root causes**:
- `server/src/services/rbac.service.ts`: `getNextSequenceNumber()` was called with default prefix `'A'`
- `OrderSuccessModal.tsx`: displayed `liveOrder.id.slice(0, 12)` instead of `liveOrder.order_number`
- `OrderSuccessModal.tsx`: Firestore `onSnapshot` was missing mapping for `order_number`
- `print.service.ts`: fell back to `data.id` (random doc ID) if `order_number` wasn't resolved
- `BillingPOS.tsx`: placeholder suggested `e.g. A12` instead of `e.g. ORD-01`

**Changes applied**:
- `server/src/services/rbac.service.ts`: Updated `getNextSequenceNumber()` default order prefix to `'ORD-0'`, producing default starting order `ORD-01`. If a custom starting order is set in POS, subsequent orders follow that sequence.
- `src/components/cart/OrderSuccessModal.tsx`: Added `order_number` to real-time snapshot sync; updated live tracker card to render `Ref: {liveOrder.order_number}`; updated bill modal header to show `Order #{liveOrder.order_number}` before settlement.
- `src/components/billing/FinalTableBillPage.tsx`: Attached `order_number` to service requests.
- `src/components/kds/KitchenDisplaySystem.tsx`: Updated service request reference display to check `req.order_number`.
- `src/services/print.service.ts`: Sanitized KOT/BOT fallback to avoid printing random alphanumeric doc IDs.
- `src/components/billing/BillingPOS.tsx`: Updated placeholder to `e.g. ORD-01`.
- Database: Reset `counters/order` for `seoul-jib-restaurant-pvt-ltd` so next orders cleanly start at `ORD-01`.

### 2026-10-02 — VAT Display Fix (Session with Antigravity)

**Problem**: VAT amount was computed and stored correctly in Firestore but NOT displayed in:
1. Customer Live Tracker (`OrderSuccessModal.tsx`)
2. Customer Final Bill (`FinalTableBillPage.tsx`)

**Root causes**:
- `server/src/services/rbac.service.ts` `createTableOrder()` was hardcoding `taxAmount = 0`
- `FinalTableBillPage.tsx` `taxesList` useMemo returned empty when `taxConfig` not yet loaded
- Both components gated tax display on `taxConfig?.tax_enabled &&` which failed when `taxConfig` was null

**Files changed**:
- `server/src/services/rbac.service.ts` (~lines 1807–1915): Real tax computation using `getTaxConfig()`, stored in `taxes[]` and `tax_amount`
- `src/components/cart/OrderSuccessModal.tsx` (~lines 115, 268, 887, 1222): Added `taxes`/`tax_amount` to snapshot mapping, removed `taxConfig?.tax_enabled` gates, added 13% fallback
- `src/components/billing/FinalTableBillPage.tsx` (~lines 23, 104, 202, 740, 909): Added `rbacService` import, immediate tax API fetch, robust fallback useMemo, unconditional VAT display

### 2026-10-01 — Multiple Customer View Fixes

- **Waiter table call**: Moved from table-selection overlay to WaiterStationDashboard queue
- **Table number in customer header**: Displayed beside "Live Menu" heading after QR scan
- **Tax exemption bug**: Removed incorrect per-table tax exemption logic
- **Final bill lock**: After requesting bill, hardware back button trapped, no return to menu
- **"Done & Return to Menu" button removed** from final bill page
- **"Scan Table QR" removed** from Thank You card
- **Item pop-up behavior**: `+`/`-` direct cart update, "Add to Order" button removed, "X in cart" shown
- **Nepali date format**: 12hr only (no 24hr), time before date, bold in navbar

### 2026-09-30 — KOT/Bill Date Config

- Bill and KOT now read date format from `Business.date_format_billing` (Firestore)
- Fixed date resetting to default on page reload by reading from saved configuration

---

## 19. Tab-Based Access Control (RBAC rewrite — SPEC, source of truth)

> **Status**: Being implemented (see change log 2026-10-11). The old action-level permission system (`custom_permissions`, `AppAction`, per-role defaults) is **removed**. Everything below is the target design every prompt/part must follow.

### 19.1 Core rule
Access is decided **only** by which dashboard tabs a staff account may open (plus one extra switch: the franchise/branch switcher in the navbar). If a tab is permitted, **every** function inside it works with no further checks. If a tab is not permitted it is locked (hidden in `Sidebar`, not reachable by `activeTab`, and the matching server data is denied).

### 19.2 The 11 grantable permissions (`TabPermissionId`)
| Id | UI label | Notes |
|---|---|---|
| `overview` | Dashboard | |
| `operations` | Business Operation | |
| `kds` | Orders | KDS: Kitchen / Bar / Waiter views |
| `waiter` | Waiter Station | |
| `checkins` | Table & Space | |
| `menus` | Menu | |
| `billing` | Finance & POS | |
| `team` | Staff | |
| `configurations` | Settings | |
| `account` | Business Details | |
| `franchise` | Franchise / Branch Switcher | Navbar `BranchSwitcher` (not a tab; same list) |

`audit` exists in `DashboardTab` but has no sidebar entry — not grantable.

### 19.3 Data model
- New field **`allowed_tabs?: TabPermissionId[]`** on: server `User` (`server/src/types/index.ts`, Firestore `users` doc via `db.service.ts`), client `TeamMember`, `StaffAccountSession`, `AuthUser` (`src/types/auth.ts`).
- `TAB_PERMISSION_IDS` const + `TabPermissionId` type live in `src/types/rbac.ts` and are mirrored in `server/src/types/rbac.types.ts`.
- `custom_permissions` is **deprecated and ignored** everywhere. The Firestore field is left in place (no destructive delete); never read it for access decisions.
- `AppAction`, `AppResource`-per-action checks, `ROLE_POLICIES` action matrices and the "Role Defaults" blocks in `Sidebar.tsx`/`DashboardPage.tsx` are removed.

### 19.4 Who bypasses the list
Only **business owners/admins** (`OWNER`, `ADMIN`, `RESTAURANT_OWNER`, `HOTEL_OWNER`) always have all 11. Everyone else — **including `MANAGER` roles** — is governed strictly by `allowed_tabs`. Roles (`WAITER`, `CASHIER`, …) remain **display labels / login designations only**; they carry no permissions.

### 19.5 Migration (lazy, non-destructive)
When a user has no `allowed_tabs`, derive once on read (server `db.ensureAllowedTabsPersisted`) and persist on next save:
1. `MANAGER`/`RESTAURANT_MANAGER`/`HOTEL_MANAGER` → all 11 (keeps today's behaviour).
2. Otherwise resource-level merge: for resources present in `custom_permissions`, grants (`read` or `manage`) unlock their matching tab(s): `orders`→`kds`,`waiter`; `check_ins`→`checkins`,`waiter`; `menus`→`menus`; `billing`→`billing`; `staff`→`team`; `settings`→`configurations`; `business_details`→`account`; `franchise: manage`→`franchise`. For resources absent from `custom_permissions`, fall back to legacy role defaults: WAITER/HOUSEKEEPING→`kds`,`waiter`,`checkins`; KITCHEN_STAFF/CHEF→`kds`,`waiter`,`menus`; FRONT_DESK→`checkins`,`billing`,`kds`,`waiter`; CASHIER→`billing`; anything else → `[]`.

### 19.6 Client enforcement (`src/utils/tabAccess.ts`, new)
`isBusinessOwner(role)`, `canAccessTab(subject, tab)`, `getFirstPermittedTab(subject)`, `TAB_LABELS`. Used by `Sidebar`, `DashboardPage` (active-tab guard + redirect), `BranchSwitcher`. If a staff account has zero tabs, `DashboardPage` renders a "No tabs assigned — contact the owner" screen with Switch Role / Sign out. **No other component may do role- or permission-based hiding** (only `isViewOnly` = not signed in remains).

### 19.7 Server enforcement
- `rbacService.hasPermission/evaluateAccess` are rewritten to be **tab-based and action-agnostic** via `RESOURCE_TAB_MAP` (resource → owning tab ids).
- Menus and tables have public read access (`menus: publicRead`, `tables: publicRead`), allowing QR menu browsing and table scanning without credentials. Category and menu item writes (`POST/PUT/PATCH/DELETE`) on both `/api/menus` and `/api/rbac/menus` are authenticated and guarded by `requireResourceAccess('menus', 'write')`.
- PIN staff session (`x-staff-session`) overlays on owner JWTs are resolved via `acting_as` on the server, safely scoping permissions to the staff member's DB-verified tabs without trusting client-sent roles.
- **Scope limit (known gap, do not "fix" in this task)**: `/orders*`, `/table-orders`, `/tables/scan-checkin`, `/tables/reset-status` are public (customers use them) and `/sales`, `/tax-config`, `/gl-accounts` are *optional-auth*. Server tab enforcement applies only to routes that use `authenticate` (menus writes, staff, check-ins, tables CRUD, business config). The public/optional routes keep today's behaviour; flag them in the final report as a pre-existing hardening item.
- Synthetic callers (`public-guest`, `{ id: 'staff' }`, customer flows) must keep working — they get an explicit `system`/`guest` context instead of relying on a fake `KITCHEN_STAFF` role.
- `PATCH /staff/:id/role` and `POST /staff` accept `allowed_tabs`; `custom_permissions` in the body is ignored. Anti-escalation: a caller may only grant tabs they hold themselves, and only owners/admins may change another `OWNER`/`ADMIN`/`MANAGER` account or grant `franchise`/`team`.
- `/api/auth/login`, `/api/auth/me` and the 4 `auth.middleware.ts` user builders return/attach `allowed_tabs` (effective, post-migration).

### 19.8 Removed UI/functions (2026-10-11)
- Kitchen/Bar station: **"Mark Delivered"** button (`KitchenDisplaySystem.tsx`, the "All Dishes/Drinks Prepared & Waiter Notified" strip keeps its text, button removed).
- Waiter station: **"Settle & Free Table"** buttons (bill-request card `btn-settle-table-*` and order card `btn-waiter-settle-*`) and handlers `handleSettleOrderFromWaiter`, `handleSettleBillRequestWithoutOrder`. Settlement remains **only** in Finance & POS (`BillingPOS.tsx`) and the customer final-bill flow.
- Waiter-view "Deliver All to Table #" and per-item serve toggle in KDS are **kept** (they are the waiter's delivery action, not "Mark Delivered").

---

*Last updated: 2026-10-12 by Antigravity (tab-based RBAC rewrite completed and audited across all 6 parts)*
