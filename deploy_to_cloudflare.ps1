# Deployer den nyeste ETF-appen til Cloudflare Pages
if (-not $env:CLOUDFLARE_API_TOKEN) {
    # Kan settes som miljøvariabel eller logges inn via wrangler login
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
    $env:CLOUDFLARE_ACCOUNT_ID = "a1d64ce4428dbf0fe2e52cfe466db81b"
}

Write-Host "Oppdaterer data.js fra etf_morningstar_komplett.csv..." -ForegroundColor Cyan
python -c "import pandas as pd, json; df = pd.read_csv(r'C:\Markedsdata\etf_morningstar_komplett.csv', encoding='utf-8-sig'); recs = df.where(pd.notnull(df), None).to_dict(orient='records'); open(r'C:\Markedsdata\app\data.js', 'w', encoding='utf-8').write('window.ETF_DATA = ' + json.dumps(recs, ensure_ascii=False) + ';'); print('data.js oppdatert med', len(recs), 'fond!')"

Write-Host "Laster opp til Cloudflare Pages..." -ForegroundColor Green
npx wrangler pages deploy C:\Markedsdata\app --project-name etf-analytics-pro --branch main

Write-Host "Ferdig! Nettsiden er tilgjengelig p: https://etf-analytics-pro.pages.dev" -ForegroundColor Yellow
