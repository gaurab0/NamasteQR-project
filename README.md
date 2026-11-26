# NamasteQR — Restaurant & Hotel Order Management Portal (Phase 1)

NamasteQR is a modern, hospitality-focused order management portal designed for restaurants, cafes, hotels, destination resorts, and bars.

**Phase 1 Focus:** Production-ready authentication, multi-venue business onboarding, international WhatsApp OTP verification, secure HTTP-only sessions, password hashing, and role-ready relational architecture.

---

## 1. Project Folder Structure

```text
├── client/ (integrated in /src)
│   ├── api/
│   │   └── authApi.ts             # Axios API client with HTTP credentials & error formatting
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AuthLayout.tsx     # Responsive split-screen auth showcase & form container
│   │   │   └── Navbar.tsx         # Header with logo, navigation links, and session actions
│   │   └── ui/
│   │       ├── Alert.tsx          # Accessible alert & notification banner
│   │       ├── Button.tsx         # Modern button with loading states & 44px touch targets
│   │       ├── DevOtpBanner.tsx   # Development-only OTP preview & 1-click test helper
│   │       ├── Input.tsx          # Form text input with focus rings & validation
│   │       ├── Logo.tsx           # NamasteQR brand identity & vector iconography
│   │       ├── OTPInput.tsx       # 6-box OTP component with auto-focus, paste & keypad support
│   │       ├── PasswordInput.tsx  # Password field with toggle & live strength meter
│   │       ├── PhoneNumberInput.tsx # International phone selector with flags & country codes
│   │       └── Select.tsx         # Custom business type dropdown (Restaurant, Hotel, etc.)
│   ├── context/
│   │   └── AuthContext.tsx        # Global auth state, session persistence & auth methods
│   ├── pages/
│   │   ├── DashboardPage.tsx      # Authenticated portal with verified badges & Phase 2 roadmap
│   │   ├── ForgotPasswordPage.tsx # Email reset request screen with generic security response
│   │   ├── LandingPage.tsx        # Hospitality SaaS showcase & CTA
│   │   ├── LoginPage.tsx          # Login with demo quick-fill & unverified number handler
│   │   ├── ResetPasswordPage.tsx  # Password reset with token validation & strength meter
│   │   ├── SignupPage.tsx         # Registration with company info, phone & password
│   │   └── VerifyWhatsAppPage.tsx # WhatsApp OTP verification screen with countdown & resend
│   ├── types/
│   │   └── auth.ts                # TypeScript interfaces for auth, users, and businesses
│   ├── utils/
│   │   └── countryCodes.ts        # Country code list, dial codes, flags (Nepal, US, UK, etc.)
│   ├── App.tsx                    # Client-side router, popstate synchronization & auth guards
│   ├── main.tsx                   # React 19 root bootstrap
│   └── index.css                  # Tailwind styles & typography
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts             # Typed environment variable loader & defaults
│   │   ├── controllers/
│   │   │   └── auth.controller.ts # Signup, Verify OTP, Resend, Login, Logout, Me, Forgot/Reset
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts # JWT verification, HTTP-only cookie handlers, role guards
│   │   │   ├── errorHandler.ts    # Centralized JSON error sanitization
│   │   │   └── rateLimit.middleware.ts # Sliding-window rate limiters per route & IP
│   │   ├── routes/
│   │   │   └── auth.routes.ts     # Express router endpoints
│   │   ├── services/
│   │   │   ├── audit.service.ts   # Security & audit activity event logger
│   │   │   ├── db.service.ts      # Relational data layer & database operations
│   │   │   ├── email.service.ts   # Password reset token generation, hashing & dispatch
│   │   │   ├── otp.service.ts     # Cryptographic 6-digit OTP generation, hashing & verification
│   │   │   └── whatsapp.service.ts# WhatsAppService abstraction (Meta Cloud API, Twilio, Mock)
│   │   ├── types/
│   │   │   └── index.ts           # Server-side TypeScript models & enums
│   │   ├── validators/
│   │   │   └── auth.validator.ts  # Zod schemas for all request payloads
│   │   └── app.ts                 # Express application with Helmet, CORS & middleware
│   └── test/
│       └── auth.test.ts           # Automated test suite for authentication lifecycle
│
├── prisma/
│   ├── schema.prisma              # Complete Prisma MySQL schema definition
│   ├── migrations/
│   │   └── 20260822_init/
│   │       └── migration.sql      # Raw MySQL DDL schema migration
│   └── seed.ts                    # Development database seeder
│
├── server.ts                      # Express + Vite integration server
├── .env.example                   # Full environment variable configuration template
├── package.json
└── README.md
```

---

## 2. Relational Database Schema (Prisma + MySQL)

### `businesses`
* `id`: UUID (Primary Key)
* `name`: VARCHAR(191)
* `business_type`: ENUM (`RESTAURANT`, `HOTEL`, `CAFE`, `RESORT`, `BAR`, `OTHER`)
* `status`: ENUM (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`)
* `created_at`, `updated_at`: DATETIME

### `users`
* `id`: UUID (Primary Key)
* `business_id`: UUID (Foreign Key -> `businesses.id`, ON DELETE CASCADE)
* `email`: VARCHAR(191) (Unique)
* `password_hash`: VARCHAR(255) (Argon2 / bcrypt hash)
* `role`: ENUM (`RESTAURANT_OWNER`, `HOTEL_OWNER`, `ADMIN`, `STAFF`)
* `status`: ENUM (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`)
* `last_login_at`: DATETIME (Nullable)
* `created_at`, `updated_at`: DATETIME

### `phone_verifications`
* `id`: UUID (Primary Key)
* `user_id`: UUID (Foreign Key -> `users.id`, Unique)
* `phone_country_code`: VARCHAR(10) (e.g. `+977`, `+1`)
* `phone_number`: VARCHAR(30) (National number)
* `phone_e164`: VARCHAR(30) (Unique, normalized e.g. `+9779851170688`)
* `is_verified`: BOOLEAN (Default: `false`)
* `verified_at`: DATETIME (Nullable)
* `created_at`, `updated_at`: DATETIME

### `otp_verifications`
* `id`: UUID (Primary Key)
* `user_id`: UUID (Foreign Key -> `users.id`)
* `phone_e164`: VARCHAR(30)
* `otp_hash`: VARCHAR(255) (Bcrypt hashed - raw OTP is never stored)
* `purpose`: VARCHAR(50) (e.g. `SIGNUP_VERIFICATION`)
* `expires_at`: DATETIME (5-minute expiry)
* `attempt_count`: INT (Default: 0, Max 5 attempts)
* `verified_at`: DATETIME (Nullable, invalidated upon successful verification)
* `created_at`: DATETIME

### `password_reset_tokens`
* `id`: UUID (Primary Key)
* `user_id`: UUID (Foreign Key -> `users.id`)
* `token_hash`: VARCHAR(255) (Cryptographically random 32-byte hex hashed with bcrypt)
* `expires_at`: DATETIME (1-hour expiry)
* `used_at`: DATETIME (Nullable, single-use)
* `created_at`: DATETIME

### `audit_logs`
* `id`: UUID (Primary Key)
* `user_id`: UUID (Nullable)
* `business_id`: UUID (Nullable)
* `event_type`: VARCHAR(100) (`ACCOUNT_CREATED`, `OTP_SENT`, `OTP_VERIFIED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `LOGOUT`)
* `ip_address`: VARCHAR(45)
* `user_agent`: VARCHAR(255)
* `created_at`: DATETIME

---

## 3. API Endpoints Reference

| Method | Endpoint | Description | Rate Limit | Auth |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Registers a new business and dispatches WhatsApp OTP | 15 / hour | Public |
| `POST` | `/api/auth/verify-whatsapp` | Validates 6-digit OTP and activates account | 20 / 15m | Public |
| `POST` | `/api/auth/resend-otp` | Re-sends a fresh OTP code subject to cooldown | 6 / hour | Public |
| `POST` | `/api/auth/login` | Authenticates email & password, checks verification status | 10 / 15m | Public |
| `GET` | `/api/auth/me` | Returns current authenticated user and business profile | Standard | Required (Cookie) |
| `POST` | `/api/auth/logout` | Clears HTTP-only session cookie and logs audit event | Standard | Required (Cookie) |
| `POST` | `/api/auth/forgot-password` | Dispatches password reset instructions (generic response) | 5 / hour | Public |
| `POST` | `/api/auth/reset-password` | Resets account password using single-use hashed token | Standard | Public |
| `GET` | `/api/auth/dev-info` | Helper to view active test OTP in development mode | Dev only | Disabled in prod |

---

## 4. Setup Instructions

### Prerequisites
* Node.js v18+ or v20+
* A Supabase project with PostgreSQL enabled

### Installation Steps

1. **Clone repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` and `DIRECT_URL` in `.env` to the connection strings from your Supabase project. Keep credentials out of source control.

3. **Prepare the Supabase schema with Prisma:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. **Run Authentication Tests:**
   ```bash
   npm test
   ```

---

## 5. Environment Variables Documentation

### Render printing over Tailscale

The Docker service starts Tailscale in userspace networking mode and exposes its SOCKS5 proxy only to the printer module. Configure these variables in Render and store the auth key as a secret:

| Variable | Render value or purpose |
| :--- | :--- |
| `PRINTER_RELAY_HOST` | Restaurant PC's Tailscale `100.x.y.z` address; used when the business has no `printer_relay_host` value. |
| `PRINTER_RELAY_PORT` | `9100` |
| `PRINTER_PROXY` | `127.0.0.1:1055` |
| `TAILSCALE_AUTHKEY` | Tailscale auth key stored as a Render secret. |
| `PRINTER_TIMEOUT_MS` | Connection timeout in milliseconds; defaults to `5000`. |
| `PRINTER_LINGER_MS` | Post-send dropped-connection check in milliseconds; defaults to `500`. |
| `PRINTER_ATTEMPTS` | Retry count; defaults to `3`. |

For local development, leave `PRINTER_PROXY` empty or unset to connect directly. Set `PRINTER_RELAY_HOST` to a reachable printer relay (or configure the restaurant-specific `businesses.printer_relay_host`) and keep port `9100`. `TAILSCALE_AUTHKEY` is only needed by the container startup script. Never commit its value.

`POST /api/print/test-print` requires the existing `ADMIN` role. `GET /health/printer` reports relay connectivity and does not print. Set a restaurant relay with `UPDATE businesses SET printer_relay_host = '100.x.y.z' WHERE id = '<business-id>';`.

The `prisma/migrations/20261125000000_add_printer_relay_host/migration.sql` migration adds the nullable restaurant relay field.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development` or `production`) | `development` |
| `PORT` | Web server port | `3000` |
| `DATABASE_URL` | Supabase PostgreSQL connection string used by the app | Set in `.env` |
| `DIRECT_URL` | Supabase PostgreSQL connection string used by Prisma schema commands | Set in `.env` |
| `JWT_SECRET` | Secret key for signing session tokens | Secure random string |
| `OTP_EXPIRY_MINUTES` | Lifetime of OTP verification codes | `5` |
| `OTP_LENGTH` | Number of digits for OTP | `6` |
| `OTP_MAX_ATTEMPTS` | Maximum failed attempts allowed per OTP | `5` |
| `OTP_RESEND_COOLDOWN_SECONDS` | Cooldown period between resend requests | `60` |
| `DEV_OTP_MODE` | Logs OTP to console & displays dev auto-fill helper (only when `NODE_ENV !== "production"`) | `true` |
| `WHATSAPP_PROVIDER` | Service provider (`meta`, `twilio`, or `mock`) | `meta` |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API System User Access Token | `""` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API Phone Number ID | `""` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`| Meta WhatsApp Business Account ID | `""` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (if using Twilio) | `""` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (if using Twilio) | `""` |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp Sender Number | `whatsapp:+14155238886` |

---

## 6. WhatsApp Business API Configuration Guide

### Meta WhatsApp Cloud API Setup
1. Register a Meta Developer Account at [developers.facebook.com](https://developers.facebook.com).
2. Create an App with the **Business** type.
3. Add **WhatsApp** product to your application.
4. Obtain your **Phone Number ID**, **WhatsApp Business Account ID**, and generate a **System User Permanent Access Token**.
5. Add these credentials to your `.env` file:
   ```env
   WHATSAPP_PROVIDER=meta
   WHATSAPP_ACCESS_TOKEN="EAA..."
   WHATSAPP_PHONE_NUMBER_ID="106..."
   WHATSAPP_BUSINESS_ACCOUNT_ID="101..."
   ```

### Twilio WhatsApp Setup (Alternative)
1. Sign in to Twilio Console.
2. Activate Twilio Sandbox for WhatsApp.
3. Configure `.env`:
   ```env
   WHATSAPP_PROVIDER=twilio
   TWILIO_ACCOUNT_SID="AC..."
   TWILIO_AUTH_TOKEN="your_auth_token"
   TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
   ```

---

## 7. Testing Instructions

NamasteQR includes an automated integration test suite covering all critical security and verification scenarios:

```bash
npm test
```

### Verified Test Cases:
1. **Signup Validation:** Validates schema bounds, business types, and reject weak passwords lacking required character classes.
2. **Password Mismatch:** Guarantees password & confirm password equality.
3. **WhatsApp OTP Lifecycle:** Generates cryptographically random 6-digit OTP, stores bcrypt hash, rejects incorrect attempts, and activates account on valid match.
4. **JWT Session Token:** Tests token creation, payload signing, and verification.
5. **Password Reset Token:** Validates 32-byte cryptographic random generation, single-use token invalidation, and hash matching.

---

## 8. Phase 2 Roadmap & Future Modules

The database and backend architecture have been structured to seamlessly incorporate the following modules in Phase 2 without modifying the authentication system:

1. **Digital Menu Builder:** Categories (Starters, Mains, Desserts, Beverages), item catalog, dietary tags (Vegan, Gluten-Free, Halal), and customizable modifier groups.
2. **Table QR Code Generator & Mobile Dining:** Unique QR codes per table allowing contactless digital ordering directly to the venue.
3. **Kitchen Display System (KDS):** Live order ticket routing, prep timers, and table status management for kitchen and bar staff.
4. **Multi-User Staff Seats & RBAC:** Invite managers, chefs, and waitstaff with granular permissions attached to the `business_id`.
5. **Sales & Business Analytics:** Real-time revenue dashboards, average order value, peak dining hours, and inventory alerts.
