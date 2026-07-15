$ErrorActionPreference = "Stop"
if ((Split-Path -Leaf (Get-Location)) -ne "LS-Task-Manager-Dashboard") {
  throw "Run setup only inside the new LS-Task-Manager-Dashboard folder. Do not run it inside LS-Product-Dashboard."
}
Write-Host "`nLS Task Manager Dashboard setup" -ForegroundColor Cyan
foreach ($command in @("node", "npm", "git")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is not installed or not available in PATH."
  }
}
if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local. Add the service-account base64 value and secure login values." -ForegroundColor Yellow
}
npm install
if (-not (Test-Path ".git")) {
  git init
  git branch -M master
  Write-Host "Created a new independent Git repository." -ForegroundColor Green
}
Write-Host "`nDependencies installed." -ForegroundColor Green
Write-Host "1. Share the Google Sheet with the service-account client_email as Viewer."
Write-Host "2. Complete .env.local."
Write-Host "3. Run: npm run verify-env"
Write-Host "4. Run: npm run dev"
