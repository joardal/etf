@echo off
chcp 65001 > nul
title ETF Analytics Pro - Daglig Oppdatering
echo ======================================================
echo    ETF Analytics Pro - Automatisk Oppdatering
echo ======================================================
echo.

cd /d "C:\Markedsdata"

echo Kjører beregnings- og synkroniseringspipeline...
python oppdater_data.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================
    echo    [Vellykket] Data oppdatert lokalt!
    echo    Laster opp endringer til GitHub og Cloudflare...
    echo ======================================================
    git add app/data.js app/prices/manifest.json egenberegning_test/output/
    git commit -m "Oppdatert markedsdata og beregninger"
    git push origin main
    echo.
    echo ======================================================
    echo    [FERDIG] Nettsiden oppdateres automatisk pa Cloudflare!
    echo ======================================================
) else (
    echo.
    echo [FEIL] Oppdateringen stoppet med feilkode %ERRORLEVEL%.
)

echo.
pause
