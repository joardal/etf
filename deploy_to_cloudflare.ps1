# Deployer de ferdigbygde filene uten å overskrive de egenberegnede nøkkeltallene.
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $repoRoot 'app'
if (-not (Test-Path -LiteralPath (Join-Path $appDir 'data.js')) -or
    -not (Test-Path -LiteralPath (Join-Path $appDir 'model_portfolios.json'))) {
    throw 'Bygg appdata med python oppdater_data.py før utrulling.'
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    $env:CLOUDFLARE_ACCOUNT_ID = "a1d64ce4428dbf0fe2e52cfe466db81b"
}

Write-Host "Laster opp til Cloudflare Pages..." -ForegroundColor Green
npx wrangler pages deploy $appDir --project-name etf-analytics-pro --branch main
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare-utrulling feilet.' }

Write-Host "Ferdig! Nettsiden er tilgjengelig på https://etf-analytics-pro.pages.dev" -ForegroundColor Yellow
