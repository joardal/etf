@echo off
chcp 65001 > nul
title ETF Analytics Pro - Daglig Oppdatering
echo ======================================================
echo    ETF Analytics Pro - Automatisk Oppdatering
echo ======================================================
echo.

cd /d "%~dp0"

echo Henter ferske kurser og kjorer beregningspipeline...
python oppdater_data.py --fetch-prices
if errorlevel 1 goto :feil

echo.
echo Publiserer dataendringer til GitHub...
git add app/data.js app/model_portfolios.json app/prices/ egenberegning_test/data/prices/ egenberegning_test/output/
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Oppdatert markedsdata og beregninger"
    if errorlevel 1 goto :feil
    git pull --rebase origin main
    if errorlevel 1 goto :feil
    git push origin main
    if errorlevel 1 goto :feil
) else (
    echo Ingen nye dataendringer i repoet.
)

echo.
echo Deployer til Cloudflare Pages...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_to_cloudflare.ps1"
if errorlevel 1 goto :feil

echo.
echo ======================================================
echo    [FERDIG] Nettsiden er oppdatert pa Cloudflare!
echo ======================================================
goto :slutt

:feil
echo.
echo [FEIL] Oppdateringen stoppet. Se meldingen over.

:slutt
echo.
pause
