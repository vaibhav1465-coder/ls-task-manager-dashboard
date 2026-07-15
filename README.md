# LS Task Manager Dashboard

A separate, advanced, read-only Next.js dashboard for the Google Sheet tab identified by gid `1037399204`.

## Important separation

- New project folder: `D:\LS-Task-Manager-Dashboard`
- It does not import, edit, deploy, or overwrite the existing `D:\LS-Product-Dashboard` project.
- The Google Sheet remains the source of truth.
- The dashboard has no write endpoint for task data.

## Included features

- Server-side Google Sheets API using a Viewer service account
- Tab resolution by numeric gid, so the tab can be renamed safely
- 30-second server cache and browser refresh
- Login protection with signed, HTTP-only cookies
- API rate limiting and security headers
- KPI cards, status donut, monthly delivery trend, category and owner workload
- Attention/risk queue, overdue logic, high-priority logic and task ageing
- Data-quality score with missing-field and duplicate-ID detection
- Search, multi-filter, sorting, pagination, expandable task detail and CSV export
- Responsive and print-friendly presentation layout
- Optional automatic support for Due Date, Progress %, Last Updated, Dependencies and effort fields

## Setup

1. Extract/copy the folder to `D:\LS-Task-Manager-Dashboard`.
2. Open PowerShell in the folder.
3. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

4. Open `.env.local` and fill in the values.
5. Share the Google Sheet with the service account's `client_email` as **Viewer**.
6. Convert the service-account JSON to base64 in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json")) | Set-Clipboard
```

7. Paste that value into `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
8. Validate and run:

```powershell
npm run verify-env
npm run dev
```

9. Open `http://localhost:3000`.

## Vercel deployment

Create a new Vercel project. Do not connect it to the existing LS Product Dashboard project.

Add these environment variables in Vercel:

- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SHEET_GID`
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- `GOOGLE_SHEETS_CACHE_TTL_MS`
- `NEXT_PUBLIC_REFRESH_INTERVAL_MS`
- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET`

Then run:

```powershell
.\deploy.ps1
```

## Recommended Google Sheet columns

The current task tracker columns work immediately. For more accurate executive reporting, add these optional columns to the same Task Manager tab:

- `Due Date`
- `Progress %`
- `Last Updated`
- `Blocker Reason`
- `Dependencies`
- `Effort Estimate`
- `Actual Effort`

The dashboard detects them automatically. No code change is required.

## Optional data-accuracy automation

The `google-apps-script` folder contains an `onEdit` automation for the Task Manager tab. When installed as a bound script, it can automatically:

- stamp `Last Updated`
- fill `Task Completed Date` when a task becomes Completed
- set Completed progress to 100%
- flag a blocked task that is missing Blocker Reason or Next Action

This automation changes only the Task Manager tab and is not required for the dashboard to run.

## Additional tools: what is useful and what is not

Use now:

- Google Sheets dropdown validation and protected formula columns for clean source data
- Google Apps Script for timestamps and completion-field consistency
- Vercel logs/error monitoring for failed refreshes

Use later only when scale requires it:

- BigQuery for long-term history, very large task volumes, or cross-team trend analysis
- GA4 or Vercel Analytics to measure dashboard usage, not task performance
- Sentry for production error alerts

Do not use AI to calculate task KPIs. Metrics should remain deterministic. AI can later create a strictly data-grounded executive summary, but it should never invent or overwrite numbers.
