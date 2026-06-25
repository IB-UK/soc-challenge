# Operation: Dark Harbour
### SOC Challenge — Cardinal Newman College Digital & IT Induction

A 20-minute browser-based team activity simulating a Security Operations Centre investigation.

---

## Setup (one-time, before the session)

### 1. Install dependencies
```bash
cd soc-challenge
npm install
```

### 2. Set up Supabase
1. Go to your Supabase project → **SQL Editor → New Query**
2. Paste and run the contents of `supabase-schema.sql`
3. That's it — tables, RLS policies and Realtime are all configured

### 3. Add logo
Copy the Cardinal Newman College logo to:
```
soc-challenge/public/logo.png
```

### 4. Deploy to Vercel
```bash
npx vercel
```
Add these environment variables in the Vercel dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=https://zzqgsnawkbzzuvqizfll.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
```

---

## On the day

| URL | Purpose |
|-----|---------|
| `https://your-app.vercel.app/` | Teams enter their code here |
| `https://your-app.vercel.app/mission` | SOC dashboard (teams work here) |
| `https://your-app.vercel.app/leaderboard` | Live leaderboard (put on projector) |
| `https://your-app.vercel.app/admin` | Facilitator view (password: `newman2026`) |

**Team codes:** ALPHA · BRAVO · CHARLIE · DELTA · ECHO · FOXTROT

---

## Answers (facilitator reference)

| Q | Question | Answer |
|---|----------|--------|
| 1 | Login time | **02:13:02** |
| 2 | Attack method | **Phishing email with a fake login link** |
| 3 | Compromised account | **sarah.chen** |
| 4 | Exfil destination | **An anonymous cloud storage server** |
| 5 | Data type stolen | **Financial records, payroll data and legal contracts** |

---

## After the event
Run the cleanup SQL at the bottom of `supabase-schema.sql` to drop all tables.
