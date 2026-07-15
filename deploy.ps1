$ErrorActionPreference = "Stop"
if ((Split-Path -Leaf (Get-Location)) -ne "LS-Task-Manager-Dashboard") {
  throw "Deployment stopped: this script must run only from LS-Task-Manager-Dashboard."
}
if (Test-Path ".vercel\project.json") {
  $project = Get-Content ".vercel\project.json" -Raw | ConvertFrom-Json
  if ($project.projectName -eq "ls-product-dashboard") {
    throw "Deployment stopped: this folder is linked to the existing LS Product Dashboard Vercel project."
  }
}
npm run build
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  npm install -g vercel
}
vercel --prod
