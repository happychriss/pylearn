# PyLearn — Fly.io Deployment Guide

## Prerequisites

- [Fly.io CLI](https://fly.io/docs/flyctl/install/) installed
- A Fly.io account (`fly auth login`)
- A Google Cloud project with OAuth 2.0 credentials (for production)

---

## Step 1: Google OAuth Setup (Production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Name: `PyLearn`
7. Authorized redirect URIs: `https://pylearn.fly.dev/api/callback`
   (replace `pylearn` with your actual Fly app name)
8. Copy the **Client ID** and **Client Secret**

> **Important:** Under **OAuth consent screen**, add your Google email as a test user while in testing mode, or publish the app for production use.

---

## Step 2: First-Time Fly.io Setup

Run these commands from the `src/` directory:

```bash
# Create the app (choose a unique name)
fly apps create pylearn

# Create the Postgres database
fly postgres create --name pylearn-db --region lhr --vm-size shared-cpu-1x --initial-cluster-size 1 --volume-size 1

# Attach database to app (this sets DATABASE_URL automatically)
fly postgres attach pylearn-db --app pylearn

# Create the persistent volume for adventure image uploads
fly volumes create pylearn_data --region lhr --size 1

# Set secrets
fly secrets set \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="your-client-secret"
```

### Push DB Schema

The schema must be pushed before the first deploy (and after any schema changes):

```bash
# Start the Postgres machine if stopped
fly machine start <postgres-machine-id> --app pylearn-db

# Open a proxy
fly proxy 15432:5432 --app pylearn-db

# Push schema (in another terminal)
DATABASE_URL="postgresql://flypgadmin:<SU_PASSWORD>@localhost:15432/pylearn?sslmode=disable" \
  pnpm --filter @workspace/db run push
```

To find the SU_PASSWORD: `fly ssh console --app pylearn-db -C env | grep SU_PASSWORD`

### Optional: AI Provider Keys

```bash
fly secrets set AI_INTEGRATIONS_OPENAI_API_KEY="sk-..."
```

---

## Step 3: Deploy

```bash
fly deploy
```

Your app will be live at `https://pylearn.fly.dev`.

---

## Auth Modes

### Google OAuth (Production)

Default when `LOCAL_AUTH` is not set. First Google user to sign in is auto-promoted to admin/teacher.

### Local Auth (Testing)

For testing without Google OAuth (e.g. local dev or first deployment test):

```bash
fly secrets set LOCAL_AUTH=true LOCAL_AUTH_USER=teacher LOCAL_AUTH_PASS=admin
fly deploy
```

Visit `/api/login` for a username/password form. To switch to Google OAuth later:

```bash
fly secrets unset LOCAL_AUTH LOCAL_AUTH_USER LOCAL_AUTH_PASS
```

---

## Step 4: First Login

1. Visit `https://pylearn.fly.dev`
2. Sign in (Google OAuth or local auth depending on mode)
3. The first user is automatically promoted to admin/teacher
4. From the admin dashboard, create student accounts with PINs

---

## Daily Usage

### Start a lesson
Just visit the URL — auto-start wakes the machine in ~2-3 seconds.

### End a lesson
The machine auto-stops after idle timeout. Or manually:
```bash
fly machine stop
```

### Check status / View logs
```bash
fly status
fly logs
```

---

## Local Development

Test the production build locally inside the dev container:

```bash
# Start PostgreSQL (if not running)
sudo service postgresql start

# Push schema to local DB
DATABASE_URL=postgresql://ubuntu:dev@localhost/pylearn pnpm --filter @workspace/db run push

# Build frontend + API server
pnpm --filter @workspace/pylearn run build
pnpm --filter @workspace/api-server run build

# Run locally
LOCAL_AUTH=true DATABASE_URL=postgresql://ubuntu:dev@localhost/pylearn \
  PORT=8080 SESSION_SECRET=local-dev-secret \
  node artifacts/api-server/dist/index.cjs
```

Visit `http://localhost:8080/api/login` — sign in with teacher/admin.

---

## Database Management

### Connect to Postgres directly
```bash
fly postgres connect -a pylearn-db
```

### Backups
```bash
fly postgres backup list -a pylearn-db
```

---

## Custom Domain (Optional)

```bash
fly certs add learn.yourdomain.com
```

Add a CNAME record `learn.yourdomain.com → pylearn.fly.dev`.
Update Google OAuth redirect URI to include `https://learn.yourdomain.com/api/callback`.

---

## Cost

| Component | Estimate |
|-----------|----------|
| Machine (stopped when idle) | ~$3-7/mo for classroom use |
| Postgres (single node) | ~$0 (free allowance) |
| Volume (1 GB) | ~$0.15/mo |
| **Total** | **~$3-7/month** |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Machine not starting | `fly machine start` |
| Google login fails | Check redirect URI matches exactly |
| WebSocket disconnects | Check `fly logs` |
| Database connection refused | Check Postgres machine is running: `fly machine start <id> --app pylearn-db` |
| Adventure images lost | Check volume mounted: `fly ssh console -C "ls /data/uploads"` |
| 500 errors | Check `fly logs`; run locally without `NODE_ENV=production` for stack traces |
