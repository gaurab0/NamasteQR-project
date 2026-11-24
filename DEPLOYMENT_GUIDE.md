# NamasteQR — Production Deployment Guide

Complete step-by-step instructions for deploying the **NamasteQR** portal to **Render** ($7/mo Starter plan) and linking your custom domain (**namasteqr.com**) managed via **Cloudflare DNS**.

---

## Part 1: Deploying the Web Service on Render

### Step 1: Account & Repository Connection
1. Navigate to **[dashboard.render.com](https://dashboard.render.com)** and log in.
2. Confirm you are in your personal workspace (**Hobby $0/month**).
3. Click the **"New +"** button in the top-right corner and select **"Web Service"**.
4. Choose **"Build and deploy from a Git repository"** and click **Next**.
5. Connect your GitHub account (if not already connected) and select the repository:
   * **`Sanslesh51/NamasteQr`**

---

### Step 2: Service Configuration

Fill in the configuration fields exactly as follows:

| Field | Value | Notes |
| :--- | :--- | :--- |
| **Name** | `namasteqr` | Generates default URL: `namasteqr.onrender.com` |
| **Region** | **Singapore** | Lowest latency to Nepal and India |
| **Branch** | `main` | Production branch with latest Supabase & rebrand code |
| **Root Directory** | *(Leave blank)* | Uses project root |
| **Runtime** | **Node** | Node.js runtime environment |
| **Build Command** | `npm install && npm run build` | Installs deps, runs `prisma generate`, and builds Vite + esbuild |
| **Start Command** | `npm start` | Runs `node dist/server.cjs` |
| **Instance Type** | **Starter ($7/month)** | 512 MB RAM, 0.5 CPU, dedicated persistent server that never sleeps |

---

### Step 3: Environment Variables

Scroll down to the **"Environment Variables"** section. Click **"Add Environment Variable"** for each of the following keys:

| Key | Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production optimizations & asset serving |
| `DATABASE_URL` | Supabase PostgreSQL connection string | App database connection; use the project connection details |
| `DIRECT_URL` | Supabase PostgreSQL connection string | Direct connection for Prisma schema commands |
| `JWT_SECRET` | A unique, randomly generated secret | Cryptographic secret for user auth tokens |
| `EMAIL_PROVIDER` | `smtp` | Transactional email provider |
| `EMAIL_HOST` | Your SMTP host | SMTP server hostname |
| `EMAIL_PORT` | Your SMTP port | SMTP server port |
| `EMAIL_USER` | Your SMTP username | Sender account |
| `EMAIL_PASSWORD` | Your SMTP password or app password | SMTP authentication |
| `EMAIL_FROM` | Your sender name and address | Outgoing sender display header |
| `DEV_OTP_MODE` | `false` | Disables mock OTPs and enforces real dispatch |
| `FRONTEND_URL` | `https://namasteqr.com` | App URL for password reset links & CORS origins |

---

### Step 4: Deploy
Click **"Deploy Web Service"** at the bottom of the page.
* Render will clone your repository, run the build command, and start the service.
* In the live logs, you will see:
  ```text
  🚀 NamasteQR Server running on http://0.0.0.0:10000
  ```
* Once complete, the deployment status indicator will turn green with **"Live"**.

---

## Part 2: Connecting Your Custom Domain (`namasteqr.com`)

You purchased the domain on **Namecheap** and configured DNS on **Cloudflare**. You will manage the records directly inside **Cloudflare** (leave Namecheap untouched).

### Step 5: Add Domains in Render
1. Inside your Render dashboard, navigate to your **`namasteqr`** Web Service.
2. In the left navigation bar, click **"Settings"**.
3. Scroll down to the **"Custom Domains"** card.
4. Click **"Add Custom Domain"**:
   * Enter: `namasteqr.com` ➔ click **Save**.
5. Click **"Add Custom Domain"** again:
   * Enter: `www.namasteqr.com` ➔ click **Save**.
6. Render will show the DNS target you need to point to (e.g., `namasteqr.onrender.com`).

---

### Step 6: Add DNS Records in Cloudflare
1. Open a new browser tab and log in to **[dash.cloudflare.com](https://dash.cloudflare.com)**.
2. Select your domain: **`namasteqr.com`**.
3. In the left sidebar, click **DNS** ➔ **Records**.
4. Check if there are any old placeholder `A` or `CNAME` records for `@` or `www` and delete or update them.
5. Add the following **two CNAME records**:

#### Record 1: Root Domain (`namasteqr.com`)
* **Type**: `CNAME`
* **Name**: `@` *(or `namasteqr.com`)*
* **Target**: `namasteqr.onrender.com`
* **Proxy status**: **DNS only** *(Gray cloud icon — keep this gray during initial SSL issuance)*
* **TTL**: `Auto`
* Click **Save**.

#### Record 2: WWW Subdomain (`www.namasteqr.com`)
* **Type**: `CNAME`
* **Name**: `www`
* **Target**: `namasteqr.onrender.com`
* **Proxy status**: **DNS only** *(Gray cloud icon)*
* **TTL**: `Auto`
* Click **Save**.

---

### Step 7: Configure Cloudflare SSL Mode
1. In Cloudflare's left sidebar, click **SSL/TLS**.
2. Under **Overview**, set the encryption mode to:
   * **Full** (or **Full (strict)**).
   *(Avoid "Flexible" mode, as it can cause infinite redirect loops with Render).*

---

### Step 8: Verify in Render & Enable Cloudflare Proxy
1. Return to Render's **Settings ➔ Custom Domains** panel.
2. Click **"Verify"** (or **"Refresh"**) next to both `namasteqr.com` and `www.namasteqr.com`.
3. Render will verify the DNS records and issue a free Let's Encrypt SSL certificate automatically within 2–5 minutes.
4. *(Recommended)*: Once verified and working, you can return to Cloudflare's DNS panel and click the cloud icon on both records to change them from **Gray (DNS only)** to **Orange (Proxied)**. This enables Cloudflare's global CDN cache and DDoS shield.

---

## Part 3: Verification Checklist

Once deployed, verify the live platform:

- [ ] **Home Page**: Open `https://namasteqr.com` in your browser. Verify the site loads with valid HTTPS lock icon.
- [ ] **Favicon & Logo**: Confirm the NamasteQR icon appears in your browser tab.
- [ ] **API Health Check**: Visit `https://namasteqr.com/api/health` — should return:
  ```json
  { "status": "ok", "service": "NamasteQR Core API", "version": "1.0.0" }
  ```
- [ ] **Customer Menu**: Scan a test table QR code or visit `https://namasteqr.com/menu/preview?biz=<your-business-id>&table=1`.
- [ ] **Authentication**: Log in to the management portal with your owner/staff credentials.
- [ ] **Real-time WebSockets**: Place a test item from the QR menu and confirm it pops up instantly in the KDS / Waiter station.
