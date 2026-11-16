# Deployer de ferdigbygde filene uten å overskrive de egenberegnede nøkkeltallene.
# Cloudflare Pages-prosjektet er Direct Upload: GitHub-push alene oppdaterer ikke nettsiden.
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $repoRoot 'app'
if (-not (Test-Path -LiteralPath (Join-Path $appDir 'data.js')) -or
    -not (Test-Path -LiteralPath (Join-Path $appDir 'model_portfolios.json'))) {
    throw 'Bygg appdata med python oppdater_data.py før utrulling.'
}

# Last lokale hemmeligheter fra rot-.env (som ikke deployes).
$rootEnv = Join-Path $repoRoot '.env'
if (Test-Path -LiteralPath $rootEnv) {
    Get-Content -LiteralPath $rootEnv | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
            $name = $matches[1]
            $value = $matches[2].Trim().Trim('"').Trim("'")
            if (-not [Environment]::GetEnvironmentVariable($name)) {
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}

# Aldri deploy hemmeligheter: app/ publiseres offentlig.
$appEnv = Join-Path $appDir '.env'
if (Test-Path -LiteralPath $appEnv) {
    $appEnvContent = Get-Content -LiteralPath $appEnv -Raw
    if ($appEnvContent -match '(?m)^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=' -or
        $appEnvContent -match 'cfut_') {
        throw 'app/.env inneholder hemmeligheter. Flytt filen til rotmappen .env før deploy.'
    }
}

if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    $env:CLOUDFLARE_ACCOUNT_ID = "a1d64ce4428dbf0fe2e52cfe466db81b"
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
    throw 'CLOUDFLARE_API_TOKEN mangler. Legg den i rotmappen .env eller sett miljøvariabelen.'
}

Write-Host "Laster opp til Cloudflare Pages..." -ForegroundColor Green
Push-Location $repoRoot
try {
    npx wrangler pages deploy $appDir --project-name etf-analytics-pro --branch main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare-utrulling feilet.' }
} finally {
    Pop-Location
}

Write-Host "Ferdig! Nettsiden er tilgjengelig på https://etf-analytics-pro.pages.dev" -ForegroundColor Yellow
