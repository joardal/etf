/**
 * ETF Analytics Pro — Frontend Application Logic
 * Kvantitativ Markedsanalyse & Teknisk ETF-Screener
 * Inkluderer teknisk analyse, kursgrafer, månedsmatrise og multi-sammenligning,
 * samt Egendefinert Fane med dynamisk kolonnevelger.
 */

(function () {
  'use strict';

  // State
  let rawData = window.ETF_DATA || [];
  let filteredData = [];
  let sortColumn = 'Avkastning_12M_%';
  let sortDirection = 'desc'; // 'asc' or 'desc'
  let currentPage = 1;
  let pageSize = 25;
  let activeTableView = 'overview'; // 'overview', 'returns_sharpe', 'volatility_drawdown', 'institutional', 'all_20', 'custom'

  // Multi-ETF sammenligning state
  const selectedCompareISINs = new Set();

  // Sparkline SVG generator for tabellvisning (1-års trend)
  function renderSparklineSVG(points, width = 85, height = 22) {
    if (!points || !Array.isArray(points) || points.length < 2) {
      return '<span class="text-muted" style="font-size: 0.72rem;">—</span>';
    }
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const isUp = points[points.length - 1] >= points[0];
    const strokeColor = isUp ? '#10b981' : '#f43f5e';
    const padY = 3;
    const plotH = height - padY * 2;
    const plotW = width - 8;

    const pts = points.map((v, i) => {
      const x = 3 + (i / (points.length - 1)) * plotW;
      const y = padY + plotH - ((v - min) / span) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const lastX = 3 + plotW;
    const lastY = padY + plotH - ((points[points.length - 1] - min) / span) * plotH;

    return `<span class="table-sparkline-wrap" title="Siste 12 mnd trend (${isUp ? '+' : ''}${(((points[points.length - 1] - points[0]) / points[0]) * 100).toFixed(1)}%)">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="table-sparkline">
        <polyline fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" />
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${strokeColor}" />
      </svg>
    </span>`;
  }

  // Egendefinert fane oppsett
  const ALL_CUSTOM_COLUMNS = [
    {
      group: 'Avkastning',
      items: [
        { key: 'Avkastning_1M_%', label: 'Avkastning 1M (%)', type: 'pct' },
        { key: 'Avkastning_3M_%', label: 'Avkastning 3M (%)', type: 'pct' },
        { key: 'Avkastning_6M_%', label: 'Avkastning 6M (%)', type: 'pct' },
        { key: 'Avkastning_12M_%', label: 'Avkastning 12M (%)', type: 'pct' },
        { key: 'Avkastning_3Y_Ann_%', label: 'Avkastning 3Y Ann (%)', type: 'pct' },
        { key: 'Avkastning_5Y_Ann_%', label: 'Avkastning 5Y Ann (%)', type: 'pct' },
      ]
    },
    {
      group: 'Sharpe Ratio',
      items: [
        { key: 'Sharpe_1Y', label: 'Sharpe 1Y', type: 'num' },
        { key: 'Sharpe_3Y', label: 'Sharpe 3Y', type: 'sharpe' },
        { key: 'Sharpe_5Y', label: 'Sharpe 5Y', type: 'num' },
      ]
    },
    {
      group: 'Volatilitet & Drawdown',
      items: [
        { key: 'Standardavvik_1Y_%', label: 'StdDev 1Y (%)', type: 'num', suffix: '%' },
        { key: 'Standardavvik_3Y_%', label: 'StdDev 3Y (%)', type: 'num', suffix: '%' },
        { key: 'Standardavvik_5Y_%', label: 'StdDev 5Y (%)', type: 'num', suffix: '%' },
        { key: 'Max_Drawdown_1Y_%', label: 'Max Drawdown 1Y (%)', type: 'dd' },
        { key: 'Max_Drawdown_3Y_%', label: 'Max Drawdown 3Y (%)', type: 'dd' },
        { key: 'Max_Drawdown_5Y_%', label: 'Max Drawdown 5Y (%)', type: 'dd' },
        { key: 'Beregnet_Sortino_Ratio', label: 'Sortino Ratio', type: 'num' },
        { key: 'Beregnet_Calmar_Ratio', label: 'Calmar Ratio', type: 'num' },
        { key: 'Beregnet_Ulcer_Index', label: 'Ulcer Index', type: 'num' },
        { key: 'Beregnet_CVaR_95_%', label: 'CVaR 95% (%)', type: 'num', suffix: '%' },
        { key: 'Beregnet_Recovery_Dager', label: 'Recovery Tid (dager)', type: 'num' },
      ]
    },
    {
      group: 'Beta, Alpha & R²',
      items: [
        { key: 'Beta_1Y', label: 'Beta 1Y', type: 'num' },
        { key: 'Beta_3Y', label: 'Beta 3Y', type: 'num' },
        { key: 'Beta_5Y', label: 'Beta 5Y', type: 'num' },
        { key: 'Alpha_1Y_%', label: 'Alpha 1Y (%)', type: 'pct' },
        { key: 'Alpha_3Y_%', label: 'Alpha 3Y (%)', type: 'pct' },
        { key: 'Alpha_5Y_%', label: 'Alpha 5Y (%)', type: 'pct' },
        { key: 'R2_1Y', label: 'R² 1Y (%)', type: 'num', suffix: '%' },
        { key: 'R2_3Y', label: 'R² 3Y (%)', type: 'num', suffix: '%' },
        { key: 'R2_5Y', label: 'R² 5Y (%)', type: 'num', suffix: '%' },
      ]
    },
    {
      group: 'Institusjonelt & Portefølje',
      items: [
        { key: 'Upside_Capture_3Y_%', label: 'Upside Capture 3Y (%)', type: 'num', suffix: '%' },
        { key: 'Downside_Capture_3Y_%', label: 'Downside Capture 3Y (%)', type: 'num', suffix: '%' },
        { key: 'Tracking_Error_1Y_%', label: 'Tracking Error 1Y (%)', type: 'num', suffix: '%' },
        { key: 'Tracking_Error_3Y_%', label: 'Tracking Error 3Y (%)', type: 'num', suffix: '%' },
        { key: 'Tracking_Error_5Y_%', label: 'Tracking Error 5Y (%)', type: 'num', suffix: '%' },
        { key: 'Information_Ratio_1Y', label: 'Info Ratio 1Y', type: 'num' },
        { key: 'Information_Ratio_3Y', label: 'Info Ratio 3Y', type: 'num' },
        { key: 'Information_Ratio_5Y', label: 'Info Ratio 5Y', type: 'num' },
        { key: 'Topp_10_Vekt_%', label: 'Topp 10 Vekt (%)', type: 'num', suffix: '%' },
        { key: 'Antall_Beholdninger', label: 'Antall Beholdninger', type: 'num' },
        { key: 'Risk_vs_Category_3Y', label: 'Risk vs Category', type: 'num' },
        { key: 'Return_vs_Category_3Y', label: 'Return vs Category', type: 'num' },
      ]
    },
    {
      group: 'Fondsegenskaper',
      items: [
        { key: 'Kategori_Morningstar', label: 'Kategori (Morningstar)', type: 'text' },
        { key: 'AUM_Verdi', label: 'AUM (Kapital)', type: 'aum' },
        { key: 'Aarlig_Avgift_%', label: 'Årlig Avgift (%)', type: 'num', suffix: '%' },
        { key: 'Benchmark_Navn', label: 'Benchmark', type: 'text' },
        { key: 'Oppdateringsdato', label: 'Oppdateringsdato', type: 'text' },
        { key: 'Datastatus_Prioritet_1', label: 'Datastatus', type: 'status' },
      ]
    },
    {
      group: 'Nordnet-dimensjoner',
      items: [
        { key: 'Nordnet_Kategori', label: 'Kategori (Nordnet)', type: 'text' },
        { key: 'Nordnet_Utdelningspolicy', label: 'Utdelningspolicy (Nordnet)', type: 'text' },
        { key: 'Nordnet_Årlig_avgift', label: 'Årlig avgift (Nordnet)', type: 'num', suffix: '%' },
        { key: 'Nordnet_MS_Rating', label: 'Morningstar-rating (Nordnet)', type: 'num' },
        { key: 'Nordnet_Risk', label: 'Risiko (Nordnet)', type: 'num' },
        { key: 'Nordnet_Hållbarhet', label: 'Bærekraft (Nordnet)', type: 'text' },
        { key: 'Nordnet_Spread', label: 'Spread (Nordnet)', type: 'num', suffix: '%' },
      ]
    }
  ];

  const DEFAULT_CUSTOM_COLUMNS = [
    'Kategori_Morningstar',
    'Avkastning_12M_%',
    'Sharpe_3Y',
    'Standardavvik_3Y_%',
    'Beta_3Y',
    'Alpha_3Y_%',
    'Max_Drawdown_3Y_%',
    'Aarlig_Avgift_%',
    'AUM_Verdi'
  ];

  let userCustomColumnKeys = [];
  let userCustomTabName = 'Min Fane';

  function loadCustomColumns() {
    try {
      const saved = localStorage.getItem('etf_custom_columns');
      if (saved) {
        userCustomColumnKeys = JSON.parse(saved);
      }
      const savedName = localStorage.getItem('etf_custom_tab_name');
      if (savedName && savedName.trim()) {
        userCustomTabName = savedName.trim();
      }
    } catch (e) {
      userCustomColumnKeys = [];
      userCustomTabName = 'Min Fane';
    }
    if (!userCustomColumnKeys || !userCustomColumnKeys.length) {
      userCustomColumnKeys = [...DEFAULT_CUSTOM_COLUMNS];
    }
  }

  function updateCustomTabButtonLabel() {
    const customTabBtn = document.getElementById('tab-custom-btn');
    if (customTabBtn) {
      customTabBtn.textContent = '⭐ ' + (userCustomTabName || 'Min Fane');
    }
  }

  function getColumnDefinition(key) {
    for (const grp of ALL_CUSTOM_COLUMNS) {
      const found = grp.items.find(i => i.key === key);
      if (found) return found;
    }
    return { key, label: key, type: 'text' };
  }

  function buildCustomViewConfig() {
    const baseCols = [
      { key: 'ISIN', label: 'ISIN / Ticker', type: 'text', width: '130px' },
      { key: 'Navn_Morningstar', label: 'Fond / ETF', type: 'text', minWidth: '200px' },
    ];
    const pickedCols = userCustomColumnKeys.map(k => getColumnDefinition(k));
    return { columns: [...baseCols, ...pickedCols] };
  }

  // De 20 nøkkeltallene + øvrige institusjonelle parametere (1, 3 og 5 år)
  const NUMERIC_COLUMNS = {
    // 1. Maximum Drawdown (1, 3 og 5 år)
    'Max_Drawdown_1Y_%': { label: 'Maximum Drawdown 1 år (%)', suffix: '%' },
    'Max_Drawdown_3Y_%': { label: 'Maximum Drawdown 3 år (%)', suffix: '%' },
    'Max_Drawdown_5Y_%': { label: 'Maximum Drawdown 5 år (%)', suffix: '%' },
    'Max_Drawdown_Prosent': { label: 'Maximum Drawdown (Hoved %)', suffix: '%' },

    // 2. Avkastning (1, 3, 6, 12 mnd, 3 år, 5 år)
    'Avkastning_1M_%': { label: 'Avkastning 1 mnd (%)', suffix: '%' },
    'Avkastning_3M_%': { label: 'Avkastning 3 mnd (%)', suffix: '%' },
    'Avkastning_6M_%': { label: 'Avkastning 6 mnd (%)', suffix: '%' },
    'Avkastning_12M_%': { label: 'Avkastning 12 mnd (%)', suffix: '%' },
    'Avkastning_3Y_Ann_%': { label: 'Avkastning 3 år ann. (%)', suffix: '%' },
    'Avkastning_5Y_Ann_%': { label: 'Avkastning 5 år ann. (%)', suffix: '%' },

    // 3. Sharpe ratio (1, 3, 5 år)
    'Sharpe_1Y': { label: 'Sharpe Ratio 1 år', suffix: '' },
    'Sharpe_3Y': { label: 'Sharpe Ratio 3 år', suffix: '' },
    'Sharpe_5Y': { label: 'Sharpe Ratio 5 år', suffix: '' },

    // 4. Standardavvik / Volatilitet (1, 3, 5 år)
    'Standardavvik_1Y_%': { label: 'Standardavvik 1 år (%)', suffix: '%' },
    'Standardavvik_3Y_%': { label: 'Standardavvik 3 år (%)', suffix: '%' },
    'Standardavvik_5Y_%': { label: 'Standardavvik 5 år (%)', suffix: '%' },

    // 5. Beta (1, 3, 5 år)
    'Beta_1Y': { label: 'Beta 1 år', suffix: '' },
    'Beta_3Y': { label: 'Beta 3 år', suffix: '' },
    'Beta_5Y': { label: 'Beta 5 år', suffix: '' },

    // 6. Alpha (1, 3, 5 år)
    'Alpha_1Y_%': { label: 'Alpha 1 år (%)', suffix: '%' },
    'Alpha_3Y_%': { label: 'Alpha 3 år (%)', suffix: '%' },
    'Alpha_5Y_%': { label: 'Alpha 5 år (%)', suffix: '%' },

    // 7. R² (1, 3, 5 år)
    'R2_1Y': { label: 'R² 1 år (%)', suffix: '%' },
    'R2_3Y': { label: 'R² 3 år (%)', suffix: '%' },
    'R2_5Y': { label: 'R² 5 år (%)', suffix: '%' },

    // 8. AUM og Gebyr
    'AUM_Verdi': { label: 'AUM (Forvaltningskapital)', suffix: '' },
    'Aarlig_Avgift_%': { label: 'Årlig avgift (%)', suffix: '%' },
    'Nordnet_Årlig_avgift': { label: 'Årlig avgift (Nordnet, %)', suffix: '%' },
    'Nordnet_MS_Rating': { label: 'Morningstar-rating (Nordnet)', suffix: '' },
    'Nordnet_Risk': { label: 'Risiko (Nordnet)', suffix: '' },
    'Nordnet_Spread': { label: 'Spread (Nordnet, %)', suffix: '%' },

    // 9. Institusjonelt: Capture & Tracking & Info Ratio
    'Upside_Capture_3Y_%': { label: 'Upside Capture 3 år (%)', suffix: '%' },
    'Downside_Capture_3Y_%': { label: 'Downside Capture 3 år (%)', suffix: '%' },
    'Tracking_Error_1Y_%': { label: 'Tracking Error 1 år (%)', suffix: '%' },
    'Tracking_Error_3Y_%': { label: 'Tracking Error 3 år (%)', suffix: '%' },
    'Tracking_Error_5Y_%': { label: 'Tracking Error 5 år (%)', suffix: '%' },
    'Information_Ratio_1Y': { label: 'Information Ratio 1 år', suffix: '' },
    'Information_Ratio_3Y': { label: 'Information Ratio 3 år', suffix: '' },
    'Information_Ratio_5Y': { label: 'Information Ratio 5 år', suffix: '' },

    // 10. Portefølje og kategori
    'Topp_10_Vekt_%': { label: 'Topp 10-vekt (%)', suffix: '%' },
    'Antall_Beholdninger': { label: 'Antall beholdninger', suffix: '' },
    'Risk_vs_Category_3Y': { label: 'Risk vs Category (3 år rating 1-5)', suffix: '' },
    'Return_vs_Category_3Y': { label: 'Return vs Category (3 år rating 1-5)', suffix: '' },

    // 11. Egenberegnede risikomål (Prioritet 3)
    'Beregnet_Sortino_Ratio': { label: 'Sortino Ratio (Rf=2%)', suffix: '' },
    'Beregnet_Calmar_Ratio': { label: 'Calmar Ratio', suffix: '' },
    'Beregnet_Ulcer_Index': { label: 'Ulcer Index', suffix: '' },
    'Beregnet_CVaR_95_%': { label: 'Expected Shortfall (CVaR 95%)', suffix: '%' },
  };

  const TEXT_COLUMNS = {
    'ISIN': 'ISIN',
    'Kategori_Morningstar': 'Morningstar-kategori',
    'Nordnet_Kategori': 'Nordnet-kategori',
    'Nordnet_Utdelningspolicy': 'Utdelningspolicy (Nordnet)',
    'Nordnet_Hållbarhet': 'Bærekraft (Nordnet)',
    'Oppdateringsdato': 'Oppdateringsdato',
    'Benchmark_Navn': 'Benchmark',
    'Kortnavn': 'Ticker',
    'Navn_Morningstar': 'Fond Navn',
  };

  // 3 initial custom filter rules as requested by user
  let filterRules = [
    { field: 'Avkastning_12M_%', op: 'gte', value: '10' },
    { field: 'Standardavvik_3Y_%', op: 'lte', value: '18' },
    { field: 'Sharpe_3Y', op: 'gte', value: '0.8' },
  ];

  // Tabell-kolonne definisjoner for ulike visninger
  const TABLE_VIEWS = {
    overview: {
      columns: [
        { key: 'ISIN', label: 'ISIN / Ticker', type: 'text', width: '130px' },
        { key: 'Navn_Morningstar', label: 'Fond / ETF', type: 'text', minWidth: '220px' },
        { key: 'Trend_1Y', label: '1Å Trend', type: 'sparkline', width: '95px' },
        { key: 'Pct_ATH', label: '% fra ATH', type: 'pct_ath', width: '85px' },
        { key: 'Kategori_Morningstar', label: 'Kategori', type: 'text' },
        { key: 'Avkastning_12M_%', label: '12M %', type: 'pct' },
        { key: 'Sharpe_3Y', label: 'Sharpe 3Y', type: 'sharpe' },
        { key: 'Standardavvik_3Y_%', label: 'StdDev 3Y', type: 'num', suffix: '%' },
        { key: 'Max_Drawdown_3Y_%', label: 'Max DD 3Y %', type: 'dd' },
        { key: 'Beregnet_Sortino_Ratio', label: 'Sortino', type: 'num' },
        { key: 'Aarlig_Avgift_%', label: 'Avgift %', type: 'num', suffix: '%' },
        { key: 'AUM_Verdi', label: 'AUM', type: 'aum' },
        { key: 'Datastatus_Prioritet_1', label: 'Status', type: 'status' },
      ]
    },
    returns_sharpe: {
      columns: [
        { key: 'ISIN', label: 'ISIN / Ticker', type: 'text', width: '130px' },
        { key: 'Navn_Morningstar', label: 'Fond / ETF', type: 'text', minWidth: '200px' },
        { key: 'Avkastning_1M_%', label: '1M %', type: 'pct' },
        { key: 'Avkastning_3M_%', label: '3M %', type: 'pct' },
        { key: 'Avkastning_6M_%', label: '6M %', type: 'pct' },
        { key: 'Avkastning_12M_%', label: '12M %', type: 'pct' },
        { key: 'Avkastning_3Y_Ann_%', label: '3Y Ann %', type: 'pct' },
        { key: 'Avkastning_5Y_Ann_%', label: '5Y Ann %', type: 'pct' },
        { key: 'Sharpe_1Y', label: 'Sharpe 1Y', type: 'num' },
        { key: 'Sharpe_3Y', label: 'Sharpe 3Y', type: 'sharpe' },
        { key: 'Sharpe_5Y', label: 'Sharpe 5Y', type: 'num' },
        { key: 'Standardavvik_3Y_%', label: 'StdDev 3Y %', type: 'num', suffix: '%' },
      ]
    },
    volatility_drawdown: {
      columns: [
        { key: 'ISIN', label: 'ISIN / Ticker', type: 'text', width: '130px' },
        { key: 'Navn_Morningstar', label: 'Fond / ETF', type: 'text', minWidth: '200px' },
        { key: 'Standardavvik_1Y_%', label: 'StdDev 1Y', type: 'num', suffix: '%' },
        { key: 'Standardavvik_3Y_%', label: 'StdDev 3Y', type: 'num', suffix: '%' },
        { key: 'Standardavvik_5Y_%', label: 'StdDev 5Y', type: 'num', suffix: '%' },
        { key: 'Max_Drawdown_1Y_%', label: 'Max DD 1Y %', type: 'dd' },
        { key: 'Max_Drawdown_3Y_%', label: 'Max DD 3Y %', type: 'dd' },
        { key: 'Max_Drawdown_5Y_%', label: 'Max DD 5Y %', type: 'dd' },
        { key: 'Beregnet_Sortino_Ratio', label: 'Sortino', type: 'num' },
        { key: 'Beregnet_Calmar_Ratio', label: 'Calmar', type: 'num' },
        { key: 'Beregnet_Ulcer_Index', label: 'Ulcer Index', type: 'num' },
        { key: 'Beregnet_CVaR_95_%', label: 'CVaR 95%', type: 'num', suffix: '%' },
      ]
    },
    institutional: {
      columns: [
        { key: 'ISIN', label: 'ISIN / Ticker', type: 'text', width: '130px' },
        { key: 'Navn_Morningstar', label: 'Fond / ETF', type: 'text', minWidth: '200px' },
        { key: 'Beta_1Y', label: 'Beta 1Y', type: 'num' },
        { key: 'Beta_3Y', label: 'Beta 3Y', type: 'num' },
        { key: 'Beta_5Y', label: 'Beta 5Y', type: 'num' },
        { key: 'Alpha_1Y_%', label: 'Alpha 1Y %', type: 'pct' },
        { key: 'Alpha_3Y_%', label: 'Alpha 3Y %', type: 'pct' },
        { key: 'Alpha_5Y_%', label: 'Alpha 5Y %', type: 'pct' },
        { key: 'R2_1Y', label: 'R² 1Y %', type: 'num', suffix: '%' },
        { key: 'R2_3Y', label: 'R² 3Y %', type: 'num', suffix: '%' },
        { key: 'R2_5Y', label: 'R² 5Y %', type: 'num', suffix: '%' },
        { key: 'Upside_Capture_3Y_%', label: 'Upside Cap %', type: 'num', suffix: '%' },
        { key: 'Downside_Capture_3Y_%', label: 'Downside Cap %', type: 'num', suffix: '%' },
        { key: 'Tracking_Error_3Y_%', label: 'Track. Err 3Y', type: 'num', suffix: '%' },
        { key: 'Information_Ratio_3Y', label: 'Info Ratio 3Y', type: 'num' },
      ]
    },
    all_20: {
      columns: [
        { key: 'ISIN', label: '1. ISIN', type: 'text', width: '120px' },
        { key: 'Navn_Morningstar', label: 'Fond Navn', type: 'text', minWidth: '180px' },
        { key: 'Kategori_Morningstar', label: '2. Kategori', type: 'text' },
        { key: 'Oppdateringsdato', label: '3. Dato', type: 'text' },
        { key: 'Avkastning_1M_%', label: '4a. 1M %', type: 'pct' },
        { key: 'Avkastning_3M_%', label: '4b. 3M %', type: 'pct' },
        { key: 'Avkastning_6M_%', label: '4c. 6M %', type: 'pct' },
        { key: 'Avkastning_12M_%', label: '4d. 12M %', type: 'pct' },
        { key: 'Sharpe_1Y', label: '5a. Sharpe 1Y', type: 'num' },
        { key: 'Sharpe_3Y', label: '5b. Sharpe 3Y', type: 'sharpe' },
        { key: 'Sharpe_5Y', label: '5c. Sharpe 5Y', type: 'num' },
        { key: 'Standardavvik_1Y_%', label: '6a. StdDev 1Y', type: 'num', suffix: '%' },
        { key: 'Standardavvik_3Y_%', label: '6b. StdDev 3Y', type: 'num', suffix: '%' },
        { key: 'Standardavvik_5Y_%', label: '6c. StdDev 5Y', type: 'num', suffix: '%' },
        { key: 'Beta_1Y', label: '7a. Beta 1Y', type: 'num' },
        { key: 'Beta_3Y', label: '7b. Beta 3Y', type: 'num' },
        { key: 'Beta_5Y', label: '7c. Beta 5Y', type: 'num' },
        { key: 'R2_1Y', label: '8a. R² 1Y %', type: 'num', suffix: '%' },
        { key: 'R2_3Y', label: '8b. R² 3Y %', type: 'num', suffix: '%' },
        { key: 'R2_5Y', label: '8c. R² 5Y %', type: 'num', suffix: '%' },
        { key: 'Alpha_1Y_%', label: '9a. Alpha 1Y %', type: 'pct' },
        { key: 'Alpha_3Y_%', label: '9b. Alpha 3Y %', type: 'pct' },
        { key: 'Alpha_5Y_%', label: '9c. Alpha 5Y %', type: 'pct' },
        { key: 'AUM_Verdi', label: '10. AUM', type: 'aum' },
        { key: 'Aarlig_Avgift_%', label: '11. Avgift %', type: 'num', suffix: '%' },
        { key: 'Benchmark_Navn', label: '12. Benchmark', type: 'text' },
        { key: 'Max_Drawdown_1Y_%', label: '13a. Max DD 1Y %', type: 'dd' },
        { key: 'Max_Drawdown_3Y_%', label: '13b. Max DD 3Y %', type: 'dd' },
        { key: 'Max_Drawdown_5Y_%', label: '13c. Max DD 5Y %', type: 'dd' },
        { key: 'Upside_Capture_3Y_%', label: '14. Upside Cap', type: 'num', suffix: '%' },
        { key: 'Downside_Capture_3Y_%', label: '15. Downside Cap', type: 'num', suffix: '%' },
        { key: 'Tracking_Error_3Y_%', label: '16. Track Err 3Y', type: 'num', suffix: '%' },
        { key: 'Topp_10_Vekt_%', label: '17. Topp 10 %', type: 'num', suffix: '%' },
        { key: 'Antall_Beholdninger', label: '18. Beholdninger', type: 'num' },
        { key: 'Risk_vs_Category_3Y', label: '19a. Risk vs Cat', type: 'num' },
        { key: 'Return_vs_Category_3Y', label: '19b. Ret vs Cat', type: 'num' },
        { key: 'Information_Ratio_3Y', label: '20. Info Ratio 3Y', type: 'num' },
      ]
    },
    custom: {
      columns: []
    }
  };

  // DOM Elements
  const elHeaderCount = document.getElementById('header-count');
  const elSearchInput = document.getElementById('search-input');
  const elSearchClear = document.getElementById('search-clear');
  const elCategoryFilter = document.getElementById('category-filter');
  const elNordnetCategoryFilter = document.getElementById('nordnet-category-filter');
  const elFilterRows = document.getElementById('filter-rows-container');
  const elBtnAddFilter = document.getElementById('btn-add-filter');
  const elTableHead = document.getElementById('etf-table-head');
  const elTableBody = document.getElementById('etf-table-body');
  const elRecordInfo = document.getElementById('table-record-info');
  const elPageDisplay = document.getElementById('current-page-display');
  const elPaginationInfo = document.getElementById('pagination-info');
  const elPageSizeSelect = document.getElementById('page-size-select');
  const elBtnReset = document.getElementById('btn-reset-filters');

  // KPI elements
  const elKpiCount = document.getElementById('kpi-val-count');
  const elKpiSubCount = document.getElementById('kpi-sub-count');
  const elKpiReturn = document.getElementById('kpi-val-return');
  const elKpiSharpe = document.getElementById('kpi-val-sharpe');
  const elKpiStdDev = document.getElementById('kpi-val-stddev');
  const elKpiDrawdown = document.getElementById('kpi-val-drawdown');
  const elKpiFee = document.getElementById('kpi-val-fee');

  // Modal elements (Fond Detaljer)
  const elModal = document.getElementById('etf-modal');
  const elModalClose = document.getElementById('modal-close-btn');

  // Modal elements (Kolonnevelger for Min Fane)
  const elCustomModal = document.getElementById('custom-columns-modal');
  const elCustomModalClose = document.getElementById('custom-modal-close-btn');
  const elBtnOpenCustomModal = document.getElementById('btn-open-custom-modal');
  const elBtnSaveCustomView = document.getElementById('btn-save-custom-view');
  const elPickerContainer = document.getElementById('picker-columns-container');
  const elPickerBadge = document.getElementById('picker-count-badge');
  const elPickerSelectAll = document.getElementById('picker-select-all');
  const elPickerDeselectAll = document.getElementById('picker-deselect-all');
  const elPickerResetDefault = document.getElementById('picker-reset-default');
  const elPickerTabNameInput = document.getElementById('picker-tab-name-input');
  const elPickerSearchInput = document.getElementById('picker-search-input');

  // ==========================================================================
  // Eksklusiv Tilgang / Autentisering
  // Brukernavn: hengekøye | Passord: hengepupper
  // ==========================================================================
  const AUTH_KEY = 'etf_vip_authenticated';
  const VALID_USER = 'hengekøye';
  const VALID_PASS = 'hengepupper';

  function initAuthProtection() {
    const overlay = document.getElementById('auth-lock-overlay');
    const form = document.getElementById('auth-form');
    const inputUser = document.getElementById('auth-username');
    const inputPass = document.getElementById('auth-password');
    const errorMsg = document.getElementById('auth-error-msg');
    const card = document.getElementById('auth-card');
    const btnLogout = document.getElementById('btn-auth-logout');

    function isAuth() {
      try {
        return localStorage.getItem(AUTH_KEY) === 'true';
      } catch (e) {
        return false;
      }
    }

    function lock() {
      if (overlay) {
        overlay.classList.remove('auth-hidden');
      }
      document.body.style.overflow = 'hidden';
      if (inputUser) {
        inputUser.value = '';
        inputUser.classList.remove('input-error');
      }
      if (inputPass) {
        inputPass.value = '';
        inputPass.classList.remove('input-error');
      }
      if (errorMsg) {
        errorMsg.style.display = 'none';
      }
      setTimeout(() => {
        if (inputUser) inputUser.focus();
      }, 100);
    }

    function unlock() {
      if (overlay) {
        overlay.classList.add('auth-hidden');
      }
      document.body.style.overflow = '';
    }

    // Sjekk status ved oppstart
    if (isAuth()) {
      unlock();
    } else {
      lock();
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = (inputUser ? inputUser.value : '').trim().toLowerCase();
        const pass = (inputPass ? inputPass.value : '').trim();

        if (user === VALID_USER && pass === VALID_PASS) {
          try {
            localStorage.setItem(AUTH_KEY, 'true');
          } catch (err) {}
          if (errorMsg) errorMsg.style.display = 'none';
          if (inputUser) inputUser.classList.remove('input-error');
          if (inputPass) inputPass.classList.remove('input-error');
          unlock();
        } else {
          if (errorMsg) errorMsg.style.display = 'block';
          if (inputUser) inputUser.classList.add('input-error');
          if (inputPass) inputPass.classList.add('input-error');
          if (card) {
            card.classList.remove('auth-shake');
            void card.offsetWidth; // Trigger reflow for shake animation
            card.classList.add('auth-shake');
          }
          if (inputPass) {
            inputPass.value = '';
            inputPass.focus();
          }
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        try {
          localStorage.removeItem(AUTH_KEY);
        } catch (err) {}
        lock();
      });
    }
  }

  // Initialize
  function init() {
    initAuthProtection();

    if (!rawData || !rawData.length) {
      elHeaderCount.textContent = 'Ingen data funnet';
      return;
    }

    // Last inn brukerens lagrede kolonner og bygg custom view
    loadCustomColumns();
    TABLE_VIEWS.custom = buildCustomViewConfig();
    updateCustomTabButtonLabel();

    // Normalisering av datafelt for konsistent oppslag og visning
    rawData.forEach(item => {
      // 1. Drawdown 1Y, 3Y, 5Y
      if (item['Max_Drawdown_3Y_%'] === undefined || item['Max_Drawdown_3Y_%'] === null) {
        let dd3 = item['Beregnet_Max_Drawdown_3Y_%'] || item['Beregnet_Max_Drawdown_%'] || item['Morningstar_Max_Drawdown_%'];
        item['Max_Drawdown_3Y_%'] = (dd3 !== null && dd3 !== undefined && dd3 !== '' && !isNaN(dd3)) ? parseFloat(dd3) : null;
      }
      if (item['Max_Drawdown_1Y_%'] === undefined || item['Max_Drawdown_1Y_%'] === null) {
        let dd1 = item['Beregnet_Max_Drawdown_1Y_%'];
        item['Max_Drawdown_1Y_%'] = (dd1 !== null && dd1 !== undefined && dd1 !== '' && !isNaN(dd1)) ? parseFloat(dd1) : null;
      }
      if (item['Max_Drawdown_5Y_%'] === undefined || item['Max_Drawdown_5Y_%'] === null) {
        let dd5 = item['Beregnet_Max_Drawdown_5Y_%'] || item['Beregnet_Max_Drawdown_%'];
        item['Max_Drawdown_5Y_%'] = (dd5 !== null && dd5 !== undefined && dd5 !== '' && !isNaN(dd5)) ? parseFloat(dd5) : null;
      }
      item['Max_Drawdown_Prosent'] = item['Max_Drawdown_3Y_%'] || item['Max_Drawdown_5Y_%'] || item['Max_Drawdown_1Y_%'];

      // 2. Oppdateringsdato
      if (!item.Oppdateringsdato) {
        item.Oppdateringsdato = item.Oppdateringsdato_Risiko || item.Oppdateringsdato_Avkastning || '—';
      }
    });

    elHeaderCount.textContent = `${rawData.length.toLocaleString('no-NO')} ETF-er lastet inn`;

    // Populate category dropdown
    populateCategories();
    populateNordnetCategories();

    // Render initial 3 filter rows
    renderFilterBuilder();

    // Bygg kolonnevelger i modalen
    renderColumnPickerUI();

    // Setup event listeners
    setupEventListeners();

    // Setup Chart Studio (TradingView-stil Kursgraf)
    initChartStudio();

    // Render thead for active view
    renderTableHeader();

    // Initial filter & render
    applyFilters();

    // Forhåndslast pris-manifest for sparklines og ATH-statistikk i tabellen
    fetch('./prices/manifest.json')
      .then(res => res.ok ? res.json() : null)
      .then(m => {
        if (!m) return;
        csState.manifest = m;
        rawData.forEach(item => {
          const entry = m[item.ISIN] || (item.Kortnavn && m[item.Kortnavn]);
          if (entry) {
            item.Sparkline = entry.sparkline;
            item.Pct_ATH = entry.pct_ath;
            item.ATH = entry.ath;
            item.Above_SMA200 = entry.above_sma200;
            item.Above_SMA50 = entry.above_sma50;
          }
        });
        if (activeTableView === 'overview') {
          renderTable();
        }
      })
      .catch(() => {});
  }

  // Populate Category options
  function populateCategories() {
    const catSet = new Set();
    rawData.forEach(item => {
      if (item.Kategori_Morningstar) {
        catSet.add(item.Kategori_Morningstar);
      }
    });
    const sortedCats = Array.from(catSet).sort();
    sortedCats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      elCategoryFilter.appendChild(opt);
    });
  }

  // Populate Nordnet category options
  function populateNordnetCategories() {
    const catSet = new Set();
    rawData.forEach(item => {
      if (item.Nordnet_Kategori) {
        catSet.add(item.Nordnet_Kategori);
      }
    });
    Array.from(catSet).sort().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      elNordnetCategoryFilter.appendChild(opt);
    });
  }

  // Render the filter rows in the control panel
  function renderFilterBuilder() {
    elFilterRows.innerHTML = '';
    filterRules.forEach((rule, idx) => {
      const row = document.createElement('div');
      row.className = 'filter-row';
      row.dataset.index = idx;

      // Select field
      const selectField = document.createElement('select');
      selectField.className = 'filter-field-select';

      // Numeric group
      const grpNum = document.createElement('optgroup');
      grpNum.label = 'Institusjonelle Nøkkeltall (1, 3 og 5 år)';
      Object.entries(NUMERIC_COLUMNS).forEach(([key, conf]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = conf.label;
        if (key === rule.field) opt.selected = true;
        grpNum.appendChild(opt);
      });
      selectField.appendChild(grpNum);

      // Text group
      const grpText = document.createElement('optgroup');
      grpText.label = 'Beskrivelser (Tekst)';
      Object.entries(TEXT_COLUMNS).forEach(([key, label]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        if (key === rule.field) opt.selected = true;
        grpText.appendChild(opt);
      });
      selectField.appendChild(grpText);

      // Operator select
      const selectOp = document.createElement('select');
      selectOp.className = 'filter-op-select';
      updateOperatorOptions(selectOp, rule.field, rule.op);

      // Value input
      const inputVal = document.createElement('input');
      inputVal.className = 'filter-val-input';
      inputVal.type = (rule.field in NUMERIC_COLUMNS) ? 'number' : 'text';
      if (rule.field in NUMERIC_COLUMNS) inputVal.step = 'any';
      inputVal.value = rule.value !== undefined ? rule.value : '';
      inputVal.placeholder = (rule.field in NUMERIC_COLUMNS) ? 'Verdi...' : 'Søketekst...';

      // Remove button
      const btnRemove = document.createElement('button');
      btnRemove.className = 'filter-remove-btn';
      btnRemove.title = 'Fjern filter';
      btnRemove.innerHTML = '&times;';

      // Listeners
      selectField.addEventListener('change', () => {
        rule.field = selectField.value;
        rule.op = (rule.field in NUMERIC_COLUMNS) ? 'gte' : 'contains';
        updateOperatorOptions(selectOp, rule.field, rule.op);
        inputVal.type = (rule.field in NUMERIC_COLUMNS) ? 'number' : 'text';
        inputVal.placeholder = (rule.field in NUMERIC_COLUMNS) ? 'Verdi...' : 'Søketekst...';
        applyFilters();
      });

      selectOp.addEventListener('change', () => {
        rule.op = selectOp.value;
        applyFilters();
      });

      inputVal.addEventListener('input', () => {
        rule.value = inputVal.value;
        applyFilters();
      });

      btnRemove.addEventListener('click', () => {
        filterRules.splice(idx, 1);
        renderFilterBuilder();
        applyFilters();
      });

      row.appendChild(selectField);
      row.appendChild(selectOp);
      row.appendChild(inputVal);
      row.appendChild(btnRemove);
      elFilterRows.appendChild(row);
    });
  }

  function updateOperatorOptions(selectEl, field, selectedOp) {
    selectEl.innerHTML = '';
    const isNum = field in NUMERIC_COLUMNS;
    const ops = isNum
      ? [
          { val: 'gte', label: '≥ (større eller lik)' },
          { val: 'lte', label: '≤ (mindre eller lik)' },
          { val: 'gt', label: '> (større enn)' },
          { val: 'lt', label: '< (mindre enn)' },
          { val: 'eq', label: '= (nøyaktig lik)' },
        ]
      : [
          { val: 'contains', label: 'inneholder' },
          { val: 'eq', label: 'er nøyaktig' },
        ];

    ops.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.label;
      if (o.val === selectedOp) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // Render Kolonnevelger UI i modalen
  function renderColumnPickerUI() {
    elPickerContainer.innerHTML = '';
    const activeSet = new Set(userCustomColumnKeys);

    if (elPickerTabNameInput) {
      elPickerTabNameInput.value = userCustomTabName || 'Min Fane';
    }
    if (elPickerSearchInput) {
      elPickerSearchInput.value = '';
    }

    ALL_CUSTOM_COLUMNS.forEach(grp => {
      const grpTitle = document.createElement('div');
      grpTitle.className = 'picker-group-title';
      grpTitle.textContent = grp.group;
      elPickerContainer.appendChild(grpTitle);

      const grid = document.createElement('div');
      grid.className = 'picker-group-grid';

      grp.items.forEach(col => {
        const card = document.createElement('label');
        card.className = 'picker-checkbox-card' + (activeSet.has(col.key) ? ' selected' : '');

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.value = col.key;
        chk.checked = activeSet.has(col.key);

        chk.addEventListener('change', () => {
          if (chk.checked) {
            card.classList.add('selected');
          } else {
            card.classList.remove('selected');
          }
          updatePickerCount();
        });

        const span = document.createElement('span');
        span.className = 'picker-checkbox-label';
        span.textContent = col.label;

        card.appendChild(chk);
        card.appendChild(span);
        grid.appendChild(card);
      });

      elPickerContainer.appendChild(grid);
    });

    updatePickerCount();
  }

  function updatePickerCount() {
    const chks = elPickerContainer.querySelectorAll('input[type="checkbox"]:checked');
    elPickerBadge.textContent = `${chks.length} kolonner valgt`;
  }

  // Render Table Header dynamically
  function renderTableHeader() {
    const viewConf = TABLE_VIEWS[activeTableView] || TABLE_VIEWS.overview;
    let html = '<tr>';

    html += '<th class="col-check-cell" title="Huk av fond for å sammenligne (maks 5 fond)">⚖️</th>';

    viewConf.columns.forEach(col => {
      const isSorted = sortColumn === col.key;
      const arrow = isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
      const colorStyle = isSorted ? 'style="color: #38bdf8;"' : '';
      const widthStyle = col.width ? `style="width: ${col.width};"` : (col.minWidth ? `style="min-width: ${col.minWidth};"` : '');
      html += `<th data-col="${col.key}" class="sortable" ${widthStyle} ${colorStyle}>${col.label}<span class="sort-icon">${arrow}</span></th>`;
    });

    html += '<th class="col-actions">Detaljer</th></tr>';
    elTableHead.innerHTML = html;

    // Attach click listeners to new headers
    elTableHead.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = (col in NUMERIC_COLUMNS || col.includes('%') || col.includes('Avkastning') || col.includes('Sharpe') || col.includes('Beta') || col.includes('Alpha')) ? 'desc' : 'asc';
        }
        renderTableHeader();
        sortAndRender();
      });
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Search input
    elSearchInput.addEventListener('input', () => {
      elSearchClear.style.display = elSearchInput.value ? 'block' : 'none';
      applyFilters();
    });

    elSearchClear.addEventListener('click', () => {
      elSearchInput.value = '';
      elSearchClear.style.display = 'none';
      applyFilters();
    });

    // Category select
    elCategoryFilter.addEventListener('change', applyFilters);

    // Nordnet category select
    elNordnetCategoryFilter.addEventListener('change', applyFilters);

    // Add filter rule button
    elBtnAddFilter.addEventListener('click', () => {
      filterRules.push({ field: 'Avkastning_12M_%', op: 'gte', value: '' });
      renderFilterBuilder();
    });

    // Reset all filters button
    elBtnReset.addEventListener('click', () => {
      elSearchInput.value = '';
      elSearchClear.style.display = 'none';
      elCategoryFilter.value = '';
      elNordnetCategoryFilter.value = '';
      filterRules = [
        { field: 'Avkastning_12M_%', op: 'gte', value: '' },
        { field: 'Standardavvik_3Y_%', op: 'lte', value: '' },
        { field: 'Sharpe_3Y', op: 'gte', value: '' },
      ];
      renderFilterBuilder();
      applyFilters();
    });

    // Preset pills
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        applyPreset(pill.dataset.preset);
      });
    });

    // Table View Tabs
    const tabBtns = document.querySelectorAll('.table-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.id === 'btn-open-custom-modal') return; // Åpner modal istedet
        if (btn.id === 'tab-custom-btn' && activeTableView === 'custom') {
          // Allerede aktiv og klikket igjen -> åpne redigeringsmodal
          renderColumnPickerUI();
          elCustomModal.style.display = 'flex';
          return;
        }
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTableView = btn.dataset.view;
        renderTableHeader();
        renderTable();
      });
    });

    // Kolonnevelger Modal Hendelser
    if (elBtnOpenCustomModal) {
      elBtnOpenCustomModal.addEventListener('click', () => {
        renderColumnPickerUI();
        elCustomModal.style.display = 'flex';
      });
    }

    if (elCustomModalClose) {
      elCustomModalClose.addEventListener('click', () => {
        elCustomModal.style.display = 'none';
      });
    }

    if (elCustomModal) {
      elCustomModal.addEventListener('click', (e) => {
        if (e.target === elCustomModal) {
          elCustomModal.style.display = 'none';
        }
      });
    }

    if (elPickerSelectAll) {
      elPickerSelectAll.addEventListener('click', () => {
        elPickerContainer.querySelectorAll('input[type="checkbox"]').forEach(c => {
          c.checked = true;
          c.closest('.picker-checkbox-card').classList.add('selected');
        });
        updatePickerCount();
      });
    }

    if (elPickerDeselectAll) {
      elPickerDeselectAll.addEventListener('click', () => {
        elPickerContainer.querySelectorAll('input[type="checkbox"]').forEach(c => {
          c.checked = false;
          c.closest('.picker-checkbox-card').classList.remove('selected');
        });
        updatePickerCount();
      });
    }

    if (elPickerResetDefault) {
      elPickerResetDefault.addEventListener('click', () => {
        const defSet = new Set(DEFAULT_CUSTOM_COLUMNS);
        elPickerContainer.querySelectorAll('input[type="checkbox"]').forEach(c => {
          const isDef = defSet.has(c.value);
          c.checked = isDef;
          if (isDef) {
            c.closest('.picker-checkbox-card').classList.add('selected');
          } else {
            c.closest('.picker-checkbox-card').classList.remove('selected');
          }
        });
        updatePickerCount();
      });
    }

    // Søk i kolonnevelger
    if (elPickerSearchInput) {
      elPickerSearchInput.addEventListener('input', () => {
        const q = elPickerSearchInput.value.toLowerCase().trim();
        const groups = elPickerContainer.querySelectorAll('.picker-group-title');
        const grids = elPickerContainer.querySelectorAll('.picker-group-grid');
        grids.forEach((grid, idx) => {
          let visibleCount = 0;
          grid.querySelectorAll('.picker-checkbox-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            const show = !q || text.includes(q);
            card.style.display = show ? 'flex' : 'none';
            if (show) visibleCount++;
          });
          if (groups[idx]) {
            groups[idx].style.display = visibleCount > 0 ? 'flex' : 'none';
          }
        });
      });
    }

    // Lagre Min Fane
    if (elBtnSaveCustomView) {
      elBtnSaveCustomView.addEventListener('click', () => {
        const selected = [];
        elPickerContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(c => {
          selected.push(c.value);
        });

        if (selected.length === 0) {
          alert('Vennligst velg minst én kolonne for din personlige fane.');
          return;
        }

        if (elPickerTabNameInput && elPickerTabNameInput.value.trim()) {
          userCustomTabName = elPickerTabNameInput.value.trim();
        } else {
          userCustomTabName = 'Min Fane';
        }

        userCustomColumnKeys = selected;
        try {
          localStorage.setItem('etf_custom_columns', JSON.stringify(selected));
          localStorage.setItem('etf_custom_tab_name', userCustomTabName);
        } catch (e) {}

        TABLE_VIEWS.custom = buildCustomViewConfig();
        activeTableView = 'custom';

        // Oppdater fane-styling og tittel
        updateCustomTabButtonLabel();
        tabBtns.forEach(b => b.classList.remove('active'));
        const customTabBtn = document.getElementById('tab-custom-btn');
        if (customTabBtn) customTabBtn.classList.add('active');

        elCustomModal.style.display = 'none';
        renderTableHeader();
        renderTable();
      });
    }

    // Export Excel (.xlsx) og CSV
    const elBtnExportXlsx = document.getElementById('btn-export-xlsx');
    if (elBtnExportXlsx) {
      elBtnExportXlsx.addEventListener('click', exportToExcel);
    }
    const elBtnExportCsv = document.getElementById('btn-export-csv');
    if (elBtnExportCsv) {
      elBtnExportCsv.addEventListener('click', exportToCSV);
    }

    // Page size select
    elPageSizeSelect.addEventListener('change', () => {
      const val = elPageSizeSelect.value;
      pageSize = val === 'all' ? filteredData.length : parseInt(val, 10);
      currentPage = 1;
      renderTable();
    });

    // Pagination buttons
    document.getElementById('btn-page-first').addEventListener('click', () => {
      currentPage = 1;
      renderTable();
    });
    document.getElementById('btn-page-prev').addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
    document.getElementById('btn-page-next').addEventListener('click', () => {
      const maxPages = Math.ceil(filteredData.length / pageSize) || 1;
      if (currentPage < maxPages) {
        currentPage++;
        renderTable();
      }
    });
    document.getElementById('btn-page-last').addEventListener('click', () => {
      currentPage = Math.ceil(filteredData.length / pageSize) || 1;
      renderTable();
    });

    // Modal tabs
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // Modal close
    elModalClose.addEventListener('click', () => {
      elModal.style.display = 'none';
    });
    elModal.addEventListener('click', (e) => {
      if (e.target === elModal) {
        elModal.style.display = 'none';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        elModal.style.display = 'none';
        if (elCustomModal) elCustomModal.style.display = 'none';
        closeAiChat();
      }
    });

    // Setup AI Chat events
    setupAiChatEventListeners();

    // Setup Analytics Charts
    initAnalyticsCharts();
  }

  // Quick preset filters handler
  function applyPreset(preset) {
    if (preset === 'sharpe_high') {
      filterRules = [
        { field: 'Sharpe_3Y', op: 'gte', value: '1.0' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '' },
        { field: 'Standardavvik_3Y_%', op: 'lte', value: '' },
      ];
    } else if (preset === 'return_15') {
      filterRules = [
        { field: 'Avkastning_12M_%', op: 'gte', value: '15' },
        { field: 'Sharpe_3Y', op: 'gte', value: '' },
        { field: 'Standardavvik_3Y_%', op: 'lte', value: '' },
      ];
    } else if (preset === 'stddev_low') {
      filterRules = [
        { field: 'Standardavvik_3Y_%', op: 'lte', value: '12' },
        { field: 'Sharpe_3Y', op: 'gte', value: '0.8' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '' },
      ];
    } else if (preset === 'drawdown_safe') {
      filterRules = [
        { field: 'Max_Drawdown_3Y_%', op: 'gte', value: '-15' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '5' },
        { field: 'Sharpe_3Y', op: 'gte', value: '' },
      ];
    } else if (preset === 'low_fee') {
      filterRules = [
        { field: 'Aarlig_Avgift_%', op: 'lte', value: '0.20' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '' },
        { field: 'Sharpe_3Y', op: 'gte', value: '' },
      ];
    } else if (preset === 'large_aum') {
      filterRules = [
        { field: 'AUM_Verdi', op: 'gte', value: '1000000000' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '' },
        { field: 'Sharpe_3Y', op: 'gte', value: '' },
      ];
    }
    renderFilterBuilder();
    applyFilters();
  }

  // Filter application
  function applyFilters() {
    const query = elSearchInput.value.trim().toLowerCase();
    const selCat = elCategoryFilter.value;
    const selNordnetCat = elNordnetCategoryFilter.value;

    filteredData = rawData.filter(item => {
      // 1. Text Search (Name, ISIN, Ticker, Benchmark)
      if (query) {
        const nameM = (item.Navn_Morningstar || '').toLowerCase();
        const nameF = (item.Navn_Fil || '').toLowerCase();
        const isin = (item.ISIN || '').toLowerCase();
        const ticker = (item.Kortnavn || '').toLowerCase();
        const bm = (item.Benchmark_Navn || '').toLowerCase();
        const match = nameM.includes(query) || nameF.includes(query) || isin.includes(query) || ticker.includes(query) || bm.includes(query);
        if (!match) return false;
      }

      // 2. Category Filter
      if (selCat && item.Kategori_Morningstar !== selCat) {
        return false;
      }

      // 3. Nordnet category filter
      if (selNordnetCat && item.Nordnet_Kategori !== selNordnetCat) {
        return false;
      }

      // 4. Custom Filter Rules
      for (const rule of filterRules) {
        if (!rule.value && rule.value !== 0) continue; // Skip empty rule

        const val = item[rule.field];
        if (rule.field in NUMERIC_COLUMNS) {
          const numTarget = parseFloat(rule.value);
          if (isNaN(numTarget)) continue;

          const numVal = parseFloat(val);
          if (isNaN(numVal) || val === null || val === undefined) return false;

          if (rule.op === 'gte' && !(numVal >= numTarget)) return false;
          if (rule.op === 'lte' && !(numVal <= numTarget)) return false;
          if (rule.op === 'gt' && !(numVal > numTarget)) return false;
          if (rule.op === 'lt' && !(numVal < numTarget)) return false;
          if (rule.op === 'eq' && !(Math.abs(numVal - numTarget) < 1e-4)) return false;
        } else {
          // Text comparison
          const strVal = String(val || '').toLowerCase();
          const targetStr = String(rule.value).toLowerCase();
          if (rule.op === 'contains' && !strVal.includes(targetStr)) return false;
          if (rule.op === 'eq' && strVal !== targetStr) return false;
        }
      }

      return true;
    });

    currentPage = 1;
    updateKPIs();
    sortAndRender();
    renderAnalyticsChart();
  }

  // Update KPI Cards
  function updateKPIs() {
    const n = filteredData.length;
    elKpiCount.textContent = n.toLocaleString('no-NO');
    elKpiSubCount.textContent = `av ${rawData.length.toLocaleString('no-NO')} totalt`;

    if (n === 0) {
      elKpiReturn.textContent = '—';
      elKpiSharpe.textContent = '—';
      elKpiStdDev.textContent = '—';
      elKpiDrawdown.textContent = '—';
      elKpiFee.textContent = '—';
      return;
    }

    // Helper to calculate average of valid numbers
    const calcAvg = (col) => {
      const vals = filteredData.map(d => parseFloat(d[col])).filter(v => !isNaN(v));
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    // Helper to calculate median
    const calcMedian = (col) => {
      const vals = filteredData.map(d => parseFloat(d[col])).filter(v => !isNaN(v)).sort((a, b) => a - b);
      if (!vals.length) return null;
      const mid = Math.floor(vals.length / 2);
      return vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    };

    const avgRet = calcAvg('Avkastning_12M_%');
    const avgSharpe = calcAvg('Sharpe_3Y');
    const medStdDev = calcMedian('Standardavvik_3Y_%');
    const avgDD = calcAvg('Max_Drawdown_3Y_%') || calcAvg('Max_Drawdown_Prosent');
    const avgFee = calcAvg('Aarlig_Avgift_%');

    elKpiReturn.textContent = avgRet !== null ? `${avgRet >= 0 ? '+' : ''}${avgRet.toFixed(2)}%` : '—';
    elKpiSharpe.textContent = avgSharpe !== null ? avgSharpe.toFixed(2) : '—';
    elKpiStdDev.textContent = medStdDev !== null ? `${medStdDev.toFixed(2)}%` : '—';
    elKpiDrawdown.textContent = avgDD !== null ? `${avgDD.toFixed(2)}%` : '—';
    elKpiFee.textContent = avgFee !== null ? `${avgFee.toFixed(2)}%` : '—';
  }

  // Sorting
  function sortAndRender() {
    const isNum = sortColumn in NUMERIC_COLUMNS || sortColumn.includes('%') || sortColumn.includes('Avkastning') || sortColumn.includes('Sharpe') || sortColumn.includes('Beta') || sortColumn.includes('Alpha');

    filteredData.sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      const aEmpty = (valA === null || valA === undefined || valA === '' || (isNum && isNaN(valA)));
      const bEmpty = (valB === null || valB === undefined || valB === '' || (isNum && isNaN(valB)));

      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (isNum) {
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      } else {
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return sortDirection === 'asc' ? strA.localeCompare(strB, 'no') : strB.localeCompare(strA, 'no');
      }
    });

    renderTable();
  }

  // Render Table Rows based on current view
  function renderTable() {
    const total = filteredData.length;
    const maxPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > maxPages) currentPage = maxPages;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = pageSize === total ? total : Math.min(startIdx + pageSize, total);
    const pageRows = filteredData.slice(startIdx, endIdx);

    elRecordInfo.textContent = `Viser ${total === 0 ? 0 : startIdx + 1}–${endIdx} av ${total.toLocaleString('no-NO')} fond`;
    elPaginationInfo.textContent = `Side ${currentPage} av ${maxPages}`;
    elPageDisplay.textContent = currentPage;

    document.getElementById('btn-page-first').disabled = currentPage === 1;
    document.getElementById('btn-page-prev').disabled = currentPage === 1;
    document.getElementById('btn-page-next').disabled = currentPage === maxPages || maxPages === 0;
    document.getElementById('btn-page-last').disabled = currentPage === maxPages || maxPages === 0;

    elTableBody.innerHTML = '';

    const viewConf = TABLE_VIEWS[activeTableView] || TABLE_VIEWS.overview;

    if (pageRows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${viewConf.columns.length + 1}" style="text-align: center; padding: 3rem; color: var(--text-muted);">
        Ingen ETF-er matchet de valgte kriteriene. Prøv å justere filtrene.
      </td>`;
      elTableBody.appendChild(tr);
      return;
    }

    // Formatteringshjelpere
    const fmtPct = (val) => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      const num = parseFloat(val);
      const cls = num > 0 ? 'text-emerald' : (num < 0 ? 'text-rose' : '');
      return `<span class="${cls}">${num > 0 ? '+' : ''}${num.toFixed(2)}%</span>`;
    };

    const fmtNum = (val, dec = 2, suffix = '') => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      return `${parseFloat(val).toFixed(dec)}${suffix}`;
    };

    const fmtAUM = (val) => {
      if (!val || isNaN(val)) return '<span class="text-muted">—</span>';
      const num = parseFloat(val);
      if (num >= 1e9) return (num / 1e9).toFixed(1) + ' mrd';
      if (num >= 1e6) return (num / 1e6).toFixed(0) + ' mill';
      return num.toLocaleString('no-NO');
    };

    const fmtSharpe = (val) => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      const s = parseFloat(val);
      const cls = s >= 1.0 ? 'text-indigo font-bold' : (s < 0 ? 'text-rose' : '');
      return `<span class="${cls}">${s.toFixed(2)}</span>`;
    };

    const fmtDD = (val) => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      return `<span class="text-rose font-bold">${parseFloat(val).toFixed(2)}%</span>`;
    };

    pageRows.forEach(item => {
      const tr = document.createElement('tr');
      const isChecked = selectedCompareISINs.has(item.ISIN);
      let rowHtml = `<td class="col-check-cell"><input type="checkbox" class="etf-row-check" data-isin="${item.ISIN}" ${isChecked ? 'checked' : ''} title="Huk av for å sammenligne"></td>`;

      viewConf.columns.forEach(col => {
        const val = item[col.key];

        if (col.type === 'sparkline') {
          const spark = item.Sparkline || (csState.manifest && (csState.manifest[item.ISIN] || csState.manifest[item.Kortnavn])?.sparkline);
          rowHtml += `<td class="col-num">${renderSparklineSVG(spark)}</td>`;
        } else if (col.type === 'pct_ath') {
          const pct = item.Pct_ATH !== undefined ? item.Pct_ATH : (csState.manifest && (csState.manifest[item.ISIN] || csState.manifest[item.Kortnavn])?.pct_ath);
          if (pct !== undefined && pct !== null && !isNaN(pct)) {
            const num = parseFloat(pct);
            const isNear = num >= -3.0;
            rowHtml += `<td class="col-num"><span class="badge-ath ${isNear ? 'near-ath' : ''}">${num > 0 ? '+' : ''}${num.toFixed(1)}%</span></td>`;
          } else {
            rowHtml += `<td class="col-num text-muted">—</td>`;
          }
        } else if (col.key === 'ISIN') {
          rowHtml += `<td class="col-isin">${item.ISIN} ${item.Kortnavn ? `<br><span class="col-ticker">${item.Kortnavn}</span>` : ''}</td>`;
        } else if (col.key === 'Navn_Morningstar') {
          rowHtml += `<td class="col-name" title="${item.Navn_Morningstar || item.Navn_Fil}">
            <span class="name-text">${item.Navn_Morningstar || item.Navn_Fil}</span>
            <button class="btn-chart-pill" data-isin="${item.ISIN}" title="Åpne teknisk kursgraf for ${item.Kortnavn || item.ISIN}">📈</button>
          </td>`;
        } else if (col.key === 'Datastatus_Prioritet_1') {
          let badge = '<span class="badge badge-na">Utilgjengelig</span>';
          if (item.Datastatus_Prioritet_1 === 'Offisiell (Morningstar)') {
            badge = '<span class="badge badge-official">Morningstar P1</span>';
          } else if (item.Beregnet_Status === 'Beregnet fra daglig NAV') {
            badge = '<span class="badge badge-calc">NAV Beregnet</span>';
          }
          rowHtml += `<td class="col-status">${badge}</td>`;
        } else if (col.type === 'pct') {
          rowHtml += `<td class="col-num">${fmtPct(val)}</td>`;
        } else if (col.type === 'sharpe') {
          rowHtml += `<td class="col-num">${fmtSharpe(val)}</td>`;
        } else if (col.type === 'dd') {
          rowHtml += `<td class="col-num">${fmtDD(val)}</td>`;
        } else if (col.type === 'aum') {
          rowHtml += `<td class="col-num">${fmtAUM(val)}</td>`;
        } else if (col.type === 'num') {
          rowHtml += `<td class="col-num">${fmtNum(val, 2, col.suffix || '')}</td>`;
        } else {
          rowHtml += `<td class="col-text" title="${val || ''}">${val || '<span class="text-muted">—</span>'}</td>`;
        }
      });

      rowHtml += `<td class="col-actions">
        <button class="btn btn-sm btn-chart-action" data-isin="${item.ISIN}" title="Åpne teknisk kursgraf">📈 Kurs</button>
        <button class="btn btn-sm btn-secondary view-details-btn">Se tall</button>
      </td>`;

      tr.innerHTML = rowHtml;

      const rowCheck = tr.querySelector('.etf-row-check');
      if (rowCheck) {
        rowCheck.addEventListener('click', (e) => {
          e.stopPropagation();
          const isin = item.ISIN;
          if (rowCheck.checked) {
            if (selectedCompareISINs.size >= 5) {
              alert('Du kan sammenligne opptil 5 fond samtidig.');
              rowCheck.checked = false;
              return;
            }
            selectedCompareISINs.add(isin);
          } else {
            selectedCompareISINs.delete(isin);
          }
          updateCompareDock();
        });
      }

      const chartPill = tr.querySelector('.btn-chart-pill');
      if (chartPill) {
        chartPill.addEventListener('click', (e) => {
          e.stopPropagation();
          openChartStudio(item);
        });
      }

      const chartAction = tr.querySelector('.btn-chart-action');
      if (chartAction) {
        chartAction.addEventListener('click', (e) => {
          e.stopPropagation();
          openChartStudio(item);
        });
      }

      tr.addEventListener('click', () => openModal(item));
      elTableBody.appendChild(tr);
    });
  }

  // Open Modal with all parameters (inkl. 1, 3 og 5 år for Beta, Alpha, R2 og Drawdown)
  function openModal(item) {
    currentlyInspectedItem = item;
    updateAiContextIndicator();

    const btnOpenChartFromModal = document.getElementById('modal-open-chart-btn');
    if (btnOpenChartFromModal) {
      btnOpenChartFromModal.onclick = () => {
        openChartStudio(item);
      };
    }

    document.getElementById('modal-isin-tag').textContent = `${item.ISIN} ${item.Kortnavn ? `(${item.Kortnavn})` : ''}`;
    document.getElementById('modal-fund-title').textContent = item.Navn_Morningstar || item.Navn_Fil;
    document.getElementById('modal-benchmark-sub').textContent = item.Benchmark_Navn ? `Benchmark: ${item.Benchmark_Navn}` : 'Benchmark ikke spesifisert';

    const createBox = (label, val, unit = '') => {
      let displayVal = 'Utilgjengelig';
      let cls = '';
      if (val !== null && val !== undefined && val !== '' && !isNaN(val)) {
        const num = parseFloat(val);
        displayVal = `${num.toFixed(2)}${unit}`;
        if (label.includes('Avkastning') || label.includes('Alpha')) {
          cls = num > 0 ? 'text-emerald' : (num < 0 ? 'text-rose' : '');
        }
      } else if (typeof val === 'string' && val.trim()) {
        displayVal = val;
      }
      return `
        <div class="metric-box">
          <div class="metric-label">${label}</div>
          <div class="metric-val ${cls}">${displayVal}</div>
        </div>
      `;
    };

    // 1. Prioritet 1 Grid (Avkastning, Sharpe, Volatilitet, Beta 1/3/5, Alpha 1/3/5, R² 1/3/5)
    const p1Grid = document.getElementById('modal-p1-grid');
    p1Grid.innerHTML = `
      ${createBox('Kategori', item.Kategori_Morningstar)}
      ${createBox('Årlig avgift', item['Aarlig_Avgift_%'], '%')}
      ${createBox('AUM', item.AUM_Verdi ? `${(item.AUM_Verdi / 1e6).toFixed(1)}M ${item.Valuta_AUM || ''}` : null)}
      ${createBox('Avkastning 1 mnd', item['Avkastning_1M_%'], '%')}
      ${createBox('Avkastning 3 mnd', item['Avkastning_3M_%'], '%')}
      ${createBox('Avkastning 6 mnd', item['Avkastning_6M_%'], '%')}
      ${createBox('Avkastning 12 mnd', item['Avkastning_12M_%'], '%')}
      ${createBox('Avkastning 3 år (ann)', item['Avkastning_3Y_Ann_%'], '%')}
      ${createBox('Avkastning 5 år (ann)', item['Avkastning_5Y_Ann_%'], '%')}
      ${createBox('Sharpe Ratio 1 år', item.Sharpe_1Y)}
      ${createBox('Sharpe Ratio 3 år', item.Sharpe_3Y)}
      ${createBox('Sharpe Ratio 5 år', item.Sharpe_5Y)}
      ${createBox('Standardavvik 1 år', item['Standardavvik_1Y_%'], '%')}
      ${createBox('Standardavvik 3 år', item['Standardavvik_3Y_%'], '%')}
      ${createBox('Standardavvik 5 år', item['Standardavvik_5Y_%'], '%')}
      ${createBox('Beta 1 år', item.Beta_1Y)}
      ${createBox('Beta 3 år', item.Beta_3Y)}
      ${createBox('Beta 5 år', item.Beta_5Y)}
      ${createBox('Alpha 1 år', item['Alpha_1Y_%'], '%')}
      ${createBox('Alpha 3 år', item['Alpha_3Y_%'], '%')}
      ${createBox('Alpha 5 år', item['Alpha_5Y_%'], '%')}
      ${createBox('R² 1 år', item.R2_1Y, '%')}
      ${createBox('R² 3 år', item.R2_3Y, '%')}
      ${createBox('R² 5 år', item.R2_5Y, '%')}
    `;

    // 2. Prioritet 2 Grid
    const p2Grid = document.getElementById('modal-p2-grid');
    p2Grid.innerHTML = `
      ${createBox('Upside Capture 3Y', item['Upside_Capture_3Y_%'], '%')}
      ${createBox('Downside Capture 3Y', item['Downside_Capture_3Y_%'], '%')}
      ${createBox('Tracking Error 1Y', item['Tracking_Error_1Y_%'], '%')}
      ${createBox('Tracking Error 3Y', item['Tracking_Error_3Y_%'], '%')}
      ${createBox('Tracking Error 5Y', item['Tracking_Error_5Y_%'], '%')}
      ${createBox('Information Ratio 1Y', item.Information_Ratio_1Y)}
      ${createBox('Information Ratio 3Y', item.Information_Ratio_3Y)}
      ${createBox('Information Ratio 5Y', item.Information_Ratio_5Y)}
      ${createBox('Topp 10 konsentrasjon', item['Topp_10_Vekt_%'], '%')}
      ${createBox('Antall beholdninger', item.Antall_Beholdninger)}
      ${createBox('Risk vs Category (3Y)', item.Risk_vs_Category_3Y)}
      ${createBox('Return vs Category (3Y)', item.Return_vs_Category_3Y)}
    `;

    // 3. Prioritet 3 Grid (Maximum Drawdown 1, 3 og 5 år)
    const p3Banner = document.getElementById('modal-drawdown-banner');
    const dd1 = item['Max_Drawdown_1Y_%'] !== null && !isNaN(item['Max_Drawdown_1Y_%']) ? `${parseFloat(item['Max_Drawdown_1Y_%']).toFixed(2)}%` : '—';
    const dd3 = item['Max_Drawdown_3Y_%'] !== null && !isNaN(item['Max_Drawdown_3Y_%']) ? `${parseFloat(item['Max_Drawdown_3Y_%']).toFixed(2)}%` : '—';
    const dd5 = item['Max_Drawdown_5Y_%'] !== null && !isNaN(item['Max_Drawdown_5Y_%']) ? `${parseFloat(item['Max_Drawdown_5Y_%']).toFixed(2)}%` : '—';
    
    p3Banner.innerHTML = `
      <div>
        <div class="drawdown-item-label">Max Drawdown 1 år</div>
        <div class="drawdown-item-val text-rose">${dd1}</div>
      </div>
      <div>
        <div class="drawdown-item-label">Max Drawdown 3 år</div>
        <div class="drawdown-item-val text-rose">${dd3}</div>
      </div>
      <div>
        <div class="drawdown-item-label">Max Drawdown 5 år</div>
        <div class="drawdown-item-val text-rose">${dd5}</div>
      </div>
      <div>
        <div class="drawdown-item-label">Recovery Tid (3/5Y)</div>
        <div class="drawdown-item-val" style="font-size: 0.95rem;">${item.Beregnet_Recovery_Dager ? `${item.Beregnet_Recovery_Dager} dager` : '—'}</div>
      </div>
    `;

    const p3Grid = document.getElementById('modal-p3-grid');
    p3Grid.innerHTML = `
      ${createBox('Sortino Ratio (Rf=2%)', item.Beregnet_Sortino_Ratio)}
      ${createBox('Calmar Ratio', item.Beregnet_Calmar_Ratio)}
      ${createBox('Ulcer Index', item.Beregnet_Ulcer_Index)}
      ${createBox('Expected Shortfall (CVaR 95%)', item['Beregnet_CVaR_95_%'], '%')}
      ${createBox('Siste Rullerende 1Y Sharpe', item.Beregnet_Siste_Rullerende_Sharpe_1y)}
      ${createBox('Drawdown Peak Dato', item.Beregnet_Drawdown_Peak_Dato)}
      ${createBox('Drawdown Valley Dato', item.Beregnet_Drawdown_Valley_Dato)}
    `;

    // 4. Metadata Grid
    const metaGrid = document.getElementById('modal-meta-grid');
    metaGrid.innerHTML = `
      ${createBox('P1 Datastatus', item.Datastatus_Prioritet_1)}
      ${createBox('P3 Datastatus', item.Beregnet_Status)}
      ${createBox('Oppdateringsdato Avkastning', item.Oppdateringsdato_Avkastning)}
      ${createBox('Oppdateringsdato Risiko', item.Oppdateringsdato_Risiko)}
      ${createBox('Valuta Avkastning', item.Valuta_Avkastning)}
      ${createBox('Valuta Risiko', item.Valuta_Risiko)}
      ${createBox('Valuta AUM', item.Valuta_AUM)}
      ${createBox('Egenberegning Startdato', item.Beregnet_Startdato)}
      ${createBox('Egenberegning Sluttdato', item.Beregnet_Sluttdato)}
      ${createBox('Antall Dager Beregnet', item.Beregnet_Antall_Dager)}
      ${createBox('Eventuell Feilmelding', item.Feilmelding || 'Ingen feil registrert')}
    `;

    elModal.style.display = 'flex';
  }

  // Export filtered dataset to Excel (.xlsx) using SheetJS
  function exportToExcel() {
    if (!filteredData.length) {
      alert('Ingen data å eksportere.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `etf_screening_filtrert_${todayStr}.xlsx`;

    if (window.XLSX) {
      try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(filteredData);

        const colWidths = [];
        const keys = Object.keys(filteredData[0]);
        keys.forEach((key) => {
          let maxLen = key.length;
          const sampleLimit = Math.min(filteredData.length, 50);
          for (let i = 0; i < sampleLimit; i++) {
            const val = filteredData[i][key];
            if (val !== null && val !== undefined) {
              maxLen = Math.max(maxLen, String(val).length);
            }
          }
          colWidths.push({ wch: Math.min(Math.max(maxLen + 2, 10), 38) });
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Filtrerte_ETF');

        const methodData = [
          { Kategori: 'Prioritet 1 (Obligatorisk)', Beskrivelse: 'Avkastning (1m-5y), Sharpe (1,3,5y), StdDev (1,3,5y), Beta (1,3,5y), Alpha (1,3,5y), R² (1,3,5y), AUM, Gebyr, Benchmark', Status: 'Offisiell (Morningstar)' },
          { Kategori: 'Prioritet 2 (Institusjonell)', Beskrivelse: 'Upside/Downside Capture, Tracking Error (1,3,5y), Info Ratio (1,3,5y), Topp 10 konsentrasjon, Beholdninger', Status: 'Offisiell (Morningstar)' },
          { Kategori: 'Prioritet 3 (Egenberegnet)', Beskrivelse: 'Max Drawdown (1,3,5y), Peak/Valley, Sortino, Calmar, Ulcer Index, Recovery time, CVaR 95%, Rullerende Sharpe', Status: 'Beregnet fra daglig NAV' },
          { Kategori: 'Filterkriterier brukt', Beskrivelse: `Eksportert ${filteredData.length} fond av ${rawData.length} totalt. Dato: ${todayStr}`, Status: 'Brukerdefinert utvalg' },
        ];
        const wsMeta = XLSX.utils.json_to_sheet(methodData);
        XLSX.utils.book_append_sheet(wb, wsMeta, 'Metodikk_og_Kilder');

        XLSX.writeFile(wb, fileName);
      } catch (err) {
        console.error('Feil ved generering av Excel:', err);
        exportToCSV();
      }
    } else {
      exportToCSV();
    }
  }

  // Export filtered dataset to CSV
  function exportToCSV() {
    if (!filteredData.length) {
      alert('Ingen data å eksportere.');
      return;
    }

    const headers = Object.keys(filteredData[0]);
    const csvRows = [];
    csvRows.push(headers.join(';'));

    filteredData.forEach(row => {
      const values = headers.map(header => {
        let val = row[header];
        if (val === null || val === undefined) val = '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      });
      csvRows.push(values.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `etf_screening_eksport_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==========================================================================
  // Gemini AI Fondsrådgiver (Chat Widget)
  // ==========================================================================
  const DEFAULT_GEMINI_API_KEY = '';
  let currentlyInspectedItem = null;

  function getGeminiApiKey() {
    return localStorage.getItem('etf_gemini_api_key') || DEFAULT_GEMINI_API_KEY;
  }

  function saveGeminiApiKey(key) {
    if (key && key.trim()) {
      localStorage.setItem('etf_gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('etf_gemini_api_key');
    }
  }

  function updateAiContextIndicator() {
    const elIndicator = document.getElementById('ai-context-indicator');
    if (!elIndicator) return;
    if (currentlyInspectedItem) {
      const name = currentlyInspectedItem.Navn_Morningstar || currentlyInspectedItem.Navn_Fil || currentlyInspectedItem.ISIN;
      elIndicator.textContent = `Aktivt fond: ${name} (${currentlyInspectedItem.ISIN})`;
      elIndicator.title = `${name} (${currentlyInspectedItem.ISIN})`;
    } else {
      const count = filteredData ? filteredData.length : (rawData ? rawData.length : 0);
      elIndicator.textContent = `Kontekst: ${count.toLocaleString('no-NO')} fond i aktiv visning`;
      elIndicator.title = `Kontekst: ${count.toLocaleString('no-NO')} fond i aktiv visning`;
    }
  }

  function openAiChat() {
    const elPanel = document.getElementById('ai-chat-panel');
    if (elPanel) elPanel.style.display = 'flex';
    updateAiContextIndicator();
    const elInput = document.getElementById('ai-user-input');
    if (elInput) elInput.focus();
  }

  function closeAiChat() {
    const elPanel = document.getElementById('ai-chat-panel');
    if (elPanel) elPanel.style.display = 'none';
  }

  function formatAiMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Split into paragraphs / lists
    const lines = html.split('\n');
    let inList = false;
    let listType = 'ul';
    let result = '';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        if (!inList) {
          result += '<ul>';
          inList = true;
          listType = 'ul';
        }
        result += `<li>${trimmed.substring(2)}</li>`;
      } else if (/^\d+\.\s/.test(trimmed)) {
        if (!inList) {
          result += '<ol>';
          inList = true;
          listType = 'ol';
        }
        result += `<li>${trimmed.replace(/^\d+\.\s/, '')}</li>`;
      } else {
        if (inList) {
          result += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        if (trimmed) {
          result += `<p>${trimmed}</p>`;
        }
      }
    });

    if (inList) result += listType === 'ul' ? '</ul>' : '</ol>';
    return result;
  }

  function appendAiMessage(role, text) {
    const container = document.getElementById('ai-messages-container');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ai-message-${role === 'user' ? 'user' : 'assistant'}`;

    const avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    avatar.textContent = role === 'user' ? '👤' : '✨';

    const content = document.createElement('div');
    content.className = 'ai-msg-content';
    if (role === 'user') {
      content.textContent = text;
    } else {
      content.innerHTML = formatAiMarkdown(text);
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('ai-messages-container');
    if (!container) return;
    const typing = document.createElement('div');
    typing.id = 'ai-typing-indicator';
    typing.className = 'ai-message ai-message-assistant';
    typing.innerHTML = `
      <div class="ai-msg-avatar">✨</div>
      <div class="ai-msg-content ai-msg-typing">
        <span class="ai-dot"></span>
        <span class="ai-dot"></span>
        <span class="ai-dot"></span>
      </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function hideTypingIndicator() {
    const el = document.getElementById('ai-typing-indicator');
    if (el) el.remove();
  }

  // Søk etter reelle lavrisiko- eller diversifiserende alternativer i databasen
  function findAlternativeCandidates() {
    if (!rawData || !rawData.length) return [];
    
    // Finn fond som ikke er teknologi, men har lav 3-års drawdown (< -18%) og lav beta (< 0.85)
    const candidates = rawData
      .filter(d => {
        const cat = (d.Kategori_Morningstar || '').toLowerCase();
        const dd3 = parseFloat(d['Max_Drawdown_3Y_%']);
        const beta3 = parseFloat(d['Beta_3Y']);
        const notTech = !cat.includes('teknologi') && !cat.includes('technology');
        return notTech && !isNaN(dd3) && dd3 > -20 && !isNaN(beta3) && beta3 > 0.25 && beta3 < 0.85;
      })
      .sort((a, b) => (parseFloat(b.Sharpe_3Y) || 0) - (parseFloat(a.Sharpe_3Y) || 0))
      .slice(0, 5);

    return candidates.map(c => ({
      ISIN: c.ISIN,
      Navn: c.Navn_Morningstar || c.Navn_Fil,
      Kategori: c.Kategori_Morningstar,
      Sharpe_3Y: c.Sharpe_3Y,
      'Max_Drawdown_3Y_%': c['Max_Drawdown_3Y_%'],
      Beta_3Y: c.Beta_3Y,
      'Alpha_3Y_%': c['Alpha_3Y_%'],
      'Aarlig_Avgift_%': c['Aarlig_Avgift_%'],
      AUM: c.AUM_Verdi
    }));
  }

  async function sendAiMessage(userText) {
    if (!userText || !userText.trim()) return;
    const text = userText.trim();

    appendAiMessage('user', text);

    const elInput = document.getElementById('ai-user-input');
    if (elInput) elInput.value = '';

    const elSendBtn = document.getElementById('ai-send-btn');
    if (elSendBtn) elSendBtn.disabled = true;

    showTypingIndicator();

    const apiKey = getGeminiApiKey();

    // Samle kontekst for prompten
    let contextPrompt = 'KONTEKST FRA ETF ANALYTICS PRO:\n';

    if (currentlyInspectedItem) {
      contextPrompt += `Brukeren undersøker for øyeblikket dette spesifikke fondet i detalj:\n`;
      contextPrompt += JSON.stringify({
        ISIN: currentlyInspectedItem.ISIN,
        Navn: currentlyInspectedItem.Navn_Morningstar || currentlyInspectedItem.Navn_Fil,
        Kategori: currentlyInspectedItem.Kategori_Morningstar,
        Benchmark: currentlyInspectedItem.Benchmark_Navn,
        'Avkastning_12M_%': currentlyInspectedItem['Avkastning_12M_%'],
        'Avkastning_3Y_Ann_%': currentlyInspectedItem['Avkastning_3Y_Ann_%'],
        Sharpe_1Y: currentlyInspectedItem.Sharpe_1Y,
        Sharpe_3Y: currentlyInspectedItem.Sharpe_3Y,
        Sharpe_5Y: currentlyInspectedItem.Sharpe_5Y,
        Beta_1Y: currentlyInspectedItem.Beta_1Y,
        Beta_3Y: currentlyInspectedItem.Beta_3Y,
        Beta_5Y: currentlyInspectedItem.Beta_5Y,
        'Alpha_1Y_%': currentlyInspectedItem['Alpha_1Y_%'],
        'Alpha_3Y_%': currentlyInspectedItem['Alpha_3Y_%'],
        'Alpha_5Y_%': currentlyInspectedItem['Alpha_5Y_%'],
        'Max_Drawdown_1Y_%': currentlyInspectedItem['Max_Drawdown_1Y_%'],
        'Max_Drawdown_3Y_%': currentlyInspectedItem['Max_Drawdown_3Y_%'],
        'Max_Drawdown_5Y_%': currentlyInspectedItem['Max_Drawdown_5Y_%'],
        'Standardavvik_3Y_%': currentlyInspectedItem['Standardavvik_3Y_%'],
        Sortino: currentlyInspectedItem.Beregnet_Sortino_Ratio,
        'Aarlig_Avgift_%': currentlyInspectedItem['Aarlig_Avgift_%'],
        AUM: currentlyInspectedItem.AUM_Verdi
      }, null, 2) + '\n\n';
    }

    const lowerRiskAlts = findAlternativeCandidates();
    if (lowerRiskAlts.length) {
      contextPrompt += `Ferdig filtrerte eksempler på lavrisiko/defensive alternativer fra basen (lav Max Drawdown og Beta < 0.85):\n`;
      contextPrompt += JSON.stringify(lowerRiskAlts, null, 2) + '\n\n';
    }

    const systemInstruction = `Du er en erfaren og institusjonell ETF- og porteføljerådgiver i ETF Analytics Pro.
Du svarer alltid på profesjonelt, pedagogisk og klart norsk med et lite glimt i øyet.
Ikke nevn hvilken spesifikk underliggende AI-modell du er hvis du blir spurt – du er rett og slett bare den overlegne og alltid opplagte AI-fondsrådgiveren i systemet.
Bruk konkrete tall (Sharpe 1-5Y, Beta 1-5Y, Alpha 1-5Y, Max Drawdown 1-5Y, Sortino og årlige avgifter) for å underbygge resonnementene dine.
Når brukeren ber om lavere risiko, alternativer eller diversifisering (f.eks. bort fra teknologi), skal du foreslå konkrete fond med ISIN og navn fra den oppgitte konteksten eller andre anerkjente UCITS ETF-er, og tydelig sammenligne risiko/avkastning mot fondet brukeren har. Vær konsis og strukturer svaret med kulepunkter.`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${contextPrompt}\nBrukerens spørsmål: ${text}` }]
      }
    ];

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      hideTypingIndicator();

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        appendAiMessage('model', `Beklager, det oppstod en feil ved kontakt med Gemini API: ${errMsg}. Sjekk API-nøkkelen i innstillinger (⚙️).`);
        return;
      }

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Fikk ikke noe tekstsvar fra modellen.';
      appendAiMessage('model', reply);

    } catch (e) {
      hideTypingIndicator();
      appendAiMessage('model', `Nettverksfeil: Kunne ikke koble til Gemini API (${e.message}).`);
    } finally {
      if (elSendBtn) elSendBtn.disabled = false;
    }
  }

  function setupAiChatEventListeners() {
    const elToggleBtn = document.getElementById('ai-chat-toggle-btn');
    const elCloseBtn = document.getElementById('ai-close-btn');
    const elSendBtn = document.getElementById('ai-send-btn');
    const elUserInput = document.getElementById('ai-user-input');
    const elSettingsBtn = document.getElementById('ai-settings-btn');
    const elSettingsPane = document.getElementById('ai-settings-pane');
    const elApiKeyInput = document.getElementById('ai-api-key-input');
    const elSaveKeyBtn = document.getElementById('ai-save-key-btn');
    const elClearBtn = document.getElementById('ai-clear-btn');
    const elModalAskAi = document.getElementById('modal-ask-ai-btn');

    if (elToggleBtn) {
      elToggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('ai-chat-panel');
        if (panel.style.display === 'none' || !panel.style.display) {
          openAiChat();
        } else {
          closeAiChat();
        }
      });
    }

    if (elCloseBtn) {
      elCloseBtn.addEventListener('click', closeAiChat);
    }

    if (elSendBtn && elUserInput) {
      elSendBtn.addEventListener('click', () => {
        sendAiMessage(elUserInput.value);
      });

      elUserInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendAiMessage(elUserInput.value);
        }
      });
    }

    // Quick prompt buttons
    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        openAiChat();
        sendAiMessage(prompt);
      });
    });

    // Modal ask AI button
    if (elModalAskAi) {
      elModalAskAi.addEventListener('click', () => {
        openAiChat();
        if (currentlyInspectedItem) {
          const name = currentlyInspectedItem.Navn_Morningstar || currentlyInspectedItem.Navn_Fil;
          sendAiMessage(`Jeg ser på fondet ${name} (${currentlyInspectedItem.ISIN}). Gi meg en analyse av risikoen her, og foreslå gode alternativer med lavere risiko hvis jeg ønsker å redusere teknologi-eksponering.`);
        }
      });
    }

    // Settings pane toggle
    if (elSettingsBtn && elSettingsPane) {
      elSettingsBtn.addEventListener('click', () => {
        elSettingsPane.style.display = elSettingsPane.style.display === 'none' ? 'block' : 'none';
        if (elApiKeyInput) elApiKeyInput.value = getGeminiApiKey();
      });
    }

    // Save API key
    if (elSaveKeyBtn && elApiKeyInput) {
      elSaveKeyBtn.addEventListener('click', () => {
        saveGeminiApiKey(elApiKeyInput.value);
        alert('API-nøkkel lagret i localStorage!');
        if (elSettingsPane) elSettingsPane.style.display = 'none';
      });
    }

    // Clear chat
    if (elClearBtn) {
      elClearBtn.addEventListener('click', () => {
        const container = document.getElementById('ai-messages-container');
        if (container) {
          container.innerHTML = `
            <div class="ai-message ai-message-assistant">
              <div class="ai-msg-avatar">✨</div>
              <div class="ai-msg-content">
                <p>Samtalen er tilbakestilt. Hva vil du undersøke?</p>
              </div>
            </div>
          `;
        }
      });
    }
  }

  // ==========================================================================
  // Interaktiv Analyse-graf & Scatter Plot (Risk/Return, Sortino, Drawdown)
  // ==========================================================================
  let currentChartMode = 'risk_return'; // 'risk_return', 'sortino_sharpe', 'sortino_drawdown'
  let isChartsPanelOpen = false;
  let chartPoints = [];

  function initAnalyticsCharts() {
    const elBtnToggle = document.getElementById('btn-toggle-charts');
    const elChartsPanel = document.getElementById('analytics-charts-panel');
    const elToggleState = document.getElementById('charts-toggle-state');
    const modeBtns = document.querySelectorAll('.chart-mode-btn');
    const canvas = document.getElementById('analytics-canvas');
    const tooltip = document.getElementById('chart-tooltip');
    const btnFullscreen = document.getElementById('btn-chart-fullscreen');

    function toggleChartFullscreen(forceState) {
      if (!elChartsPanel) return;
      const isFs = typeof forceState === 'boolean' ? forceState : !elChartsPanel.classList.contains('charts-fullscreen-mode');
      if (isFs) {
        elChartsPanel.classList.add('charts-fullscreen-mode');
        if (btnFullscreen) {
          btnFullscreen.classList.add('active');
          btnFullscreen.innerHTML = '<span class="fs-icon">✕</span> <span class="fs-text">Lukk fullskjerm</span>';
        }
      } else {
        elChartsPanel.classList.remove('charts-fullscreen-mode');
        if (btnFullscreen) {
          btnFullscreen.classList.remove('active');
          btnFullscreen.innerHTML = '<span class="fs-icon">⛶</span> <span class="fs-text">Fullskjerm</span>';
        }
      }
      setTimeout(() => {
        renderAnalyticsChart();
      }, 50);
    }

    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => toggleChartFullscreen());
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elChartsPanel && elChartsPanel.classList.contains('charts-fullscreen-mode')) {
        toggleChartFullscreen(false);
      }
    });

    try {
      if (localStorage.getItem('etf_charts_open') === 'true') {
        isChartsPanelOpen = true;
        if (elChartsPanel) elChartsPanel.style.display = 'block';
        if (elToggleState) elToggleState.textContent = '▲ Skjul';
      }
    } catch (e) {}

    if (elBtnToggle && elChartsPanel) {
      elBtnToggle.addEventListener('click', () => {
        isChartsPanelOpen = !isChartsPanelOpen;
        elChartsPanel.style.display = isChartsPanelOpen ? 'block' : 'none';
        if (elToggleState) {
          elToggleState.textContent = isChartsPanelOpen ? '▲ Skjul' : '▼ Åpne';
        }
        try {
          localStorage.setItem('etf_charts_open', isChartsPanelOpen ? 'true' : 'false');
        } catch (e) {}

        if (isChartsPanelOpen) {
          renderAnalyticsChart();
        }
      });
    }

    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentChartMode = btn.dataset.chart;
        renderAnalyticsChart();
      });
    });

    window.addEventListener('resize', () => {
      if (isChartsPanelOpen) {
        renderAnalyticsChart();
      }
    });

    if (canvas && tooltip) {
      canvas.addEventListener('mousemove', (e) => {
        if (!chartPoints.length) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let closest = null;
        let minDist = 14;

        chartPoints.forEach(p => {
          const dist = Math.hypot(p.px - mouseX, p.py - mouseY);
          if (dist < minDist) {
            minDist = dist;
            closest = p;
          }
        });

        if (closest) {
          canvas.style.cursor = 'pointer';
          tooltip.style.display = 'block';

          // Smart kant-deteksjon så tooltippen aldri kuttes av på toppen eller sidene
          const isNearTop = closest.py < 135;
          const isNearLeft = closest.px < 150;
          const isNearRight = closest.px > (rect.width - 150);

          let transX = '-50%';
          if (isNearLeft) transX = '0%';
          else if (isNearRight) transX = '-100%';

          let transY = isNearTop ? '14px' : 'calc(-100% - 14px)';

          tooltip.style.left = `${closest.px}px`;
          tooltip.style.top = `${closest.py}px`;
          tooltip.style.transform = `translate(${transX}, ${transY})`;

          const item = closest.item;
          const name = item.Navn_Morningstar || item.Navn_Fil || item.ISIN;
          const cat = item.Kategori_Morningstar || 'Uten kategori';

          let xLabel = 'X';
          let yLabel = 'Y';
          let xFmt = closest.x.toFixed(2);
          let yFmt = closest.y.toFixed(2);

          if (currentChartMode === 'risk_return') {
            xLabel = 'Volatilitet (StdDev)';
            xFmt = `${closest.x.toFixed(2)}%`;
            yLabel = 'Avkastning 3Y';
            yFmt = `${closest.y >= 0 ? '+' : ''}${closest.y.toFixed(2)}%`;
          } else if (currentChartMode === 'sortino_sharpe') {
            xLabel = 'Sharpe Ratio';
            yLabel = 'Sortino Ratio';
          } else if (currentChartMode === 'sortino_drawdown') {
            xLabel = 'Max Drawdown 3Y';
            xFmt = `${closest.x.toFixed(2)}%`;
            yLabel = 'Sortino Ratio';
          }

          tooltip.innerHTML = `
            <div class="chart-tooltip-title">${name}</div>
            <div class="chart-tooltip-isin">${item.ISIN} &middot; ${cat}</div>
            <div class="chart-tooltip-stat"><span>${xLabel}:</span><span class="chart-tooltip-stat-val">${xFmt}</span></div>
            <div class="chart-tooltip-stat"><span>${yLabel}:</span><span class="chart-tooltip-stat-val">${yFmt}</span></div>
            ${item['Aarlig_Avgift_%'] ? `<div class="chart-tooltip-stat"><span>Avgift:</span><span class="chart-tooltip-stat-val">${parseFloat(item['Aarlig_Avgift_%']).toFixed(2)}%</span></div>` : ''}
            <div style="font-size: 0.68rem; color: #818cf8; margin-top: 0.35rem; font-style: italic;">Klikk for å åpne alle tall</div>
          `;
        } else {
          canvas.style.cursor = 'crosshair';
          tooltip.style.display = 'none';
        }
      });

      canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });

      canvas.addEventListener('click', (e) => {
        if (!chartPoints.length) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let closest = null;
        let minDist = 14;

        chartPoints.forEach(p => {
          const dist = Math.hypot(p.px - mouseX, p.py - mouseY);
          if (dist < minDist) {
            minDist = dist;
            closest = p;
          }
        });

        if (closest && closest.item) {
          openModal(closest.item);
        }
      });
    }
  }

  function renderAnalyticsChart() {
    if (!isChartsPanelOpen) return;

    const canvas = document.getElementById('analytics-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight || 520;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    chartPoints = [];

    const dataset = filteredData && filteredData.length ? filteredData : rawData;
    if (!dataset || !dataset.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ingen fond matcher de valgte filtrene.', width / 2, height / 2);
      return;
    }

    const validItems = [];
    dataset.forEach(item => {
      let x = null;
      let y = null;

      if (currentChartMode === 'risk_return') {
        const std = parseFloat(item['Standardavvik_3Y_%']) || parseFloat(item['Standardavvik_1Y_%']);
        const ret = parseFloat(item['Avkastning_3Y_Ann_%']) !== null && !isNaN(parseFloat(item['Avkastning_3Y_Ann_%'])) 
          ? parseFloat(item['Avkastning_3Y_Ann_%']) 
          : parseFloat(item['Avkastning_12M_%']);
        if (!isNaN(std) && !isNaN(ret) && std > 0 && std < 60 && ret > -50 && ret < 100) {
          x = std;
          y = ret;
        }
      } else if (currentChartMode === 'sortino_sharpe') {
        const sharpe = parseFloat(item.Sharpe_3Y) || parseFloat(item.Sharpe_1Y);
        const sortino = parseFloat(item.Beregnet_Sortino_Ratio);
        if (!isNaN(sharpe) && !isNaN(sortino) && sharpe > -2 && sharpe < 4 && sortino > -2 && sortino < 5) {
          x = sharpe;
          y = sortino;
        }
      } else if (currentChartMode === 'sortino_drawdown') {
        const dd = parseFloat(item['Max_Drawdown_3Y_%']) || parseFloat(item['Max_Drawdown_1Y_%']);
        const sortino = parseFloat(item.Beregnet_Sortino_Ratio);
        if (!isNaN(dd) && !isNaN(sortino) && dd <= 0 && dd > -80 && sortino > -2 && sortino < 5) {
          x = dd;
          y = sortino;
        }
      }

      if (x !== null && y !== null) {
        validItems.push({ item, x, y });
      }
    });

    const infoTag = document.getElementById('chart-info-tag');
    if (infoTag) {
      infoTag.textContent = `Viser ${validItems.length} fond med gyldige tall (klikk på et punkt for detaljer)`;
    }

    if (!validItems.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ikke tilstrekkelig kurshistorikk for disse nøkkeltallene i utvalget.', width / 2, height / 2);
      return;
    }

    let minX = Math.min(...validItems.map(d => d.x));
    let maxX = Math.max(...validItems.map(d => d.x));
    let minY = Math.min(...validItems.map(d => d.y));
    let maxY = Math.max(...validItems.map(d => d.y));

    const padX = (maxX - minX) * 0.08 || 1;
    const padY = (maxY - minY) * 0.12 || 1;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    const padLeft = 65;
    const padRight = 30;
    const padTop = 50;
    const padBottom = 48;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const toPxX = (val) => padLeft + ((val - minX) / (maxX - minX)) * plotW;
    const toPxY = (val) => padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

    ctx.clearRect(0, 0, width, height);

    if (currentChartMode === 'risk_return') {
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const qX = padLeft;
      const qY = padTop;
      const qW = toPxX(midX) - padLeft;
      const qH = toPxY(midY) - padTop;

      ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
      ctx.fillRect(qX, qY, qW, qH);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.strokeRect(qX, qY, qW, qH);

      ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🏆 Gyllen Kvadrant (Høy avkastning / Lav risiko)', qX + 12, qY + 20);
    } else if (currentChartMode === 'sortino_sharpe') {
      const lineMin = Math.max(minX, minY);
      const lineMax = Math.min(maxX, maxY);
      if (lineMax > lineMin) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toPxX(lineMin), toPxY(lineMin));
        ctx.lineTo(toPxX(lineMax), toPxY(lineMax));
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🚀 Asymmetrisk oppside (Sortino > Sharpe)', toPxX(lineMin) + 15, toPxY(lineMax) + 25);
      }
    } else if (currentChartMode === 'sortino_drawdown') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('🛡️ Robust nedsidebeskyttelse & Høy Sortino', width - padRight - 15, padTop + 20);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';

    const numStepsX = 5;
    for (let i = 0; i <= numStepsX; i++) {
      const val = minX + (i / numStepsX) * (maxX - minX);
      const px = toPxX(val);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, height - padBottom);
      ctx.stroke();

      ctx.textAlign = 'center';
      const label = currentChartMode === 'risk_return' || currentChartMode === 'sortino_drawdown'
        ? `${val.toFixed(1)}%`
        : val.toFixed(2);
      ctx.fillText(label, px, height - padBottom + 16);
    }

    const numStepsY = 5;
    for (let i = 0; i <= numStepsY; i++) {
      const val = minY + (i / numStepsY) * (maxY - minY);
      const py = toPxY(val);
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(width - padRight, py);
      ctx.stroke();

      ctx.textAlign = 'right';
      const label = currentChartMode === 'risk_return'
        ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
        : val.toFixed(2);
      ctx.fillText(label, padLeft - 10, py + 3);
    }

    if (minY < 0 && maxY > 0) {
      const zeroY = toPxY(0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(padLeft, zeroY);
      ctx.lineTo(width - padRight, zeroY);
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';

    let xTitle = 'Volatilitet / Standardavvik 3 år (%)';
    let yTitle = 'Avkastning 3 år ann. (%)';
    if (currentChartMode === 'sortino_sharpe') {
      xTitle = 'Sharpe Ratio 3 år (Tradisjonell risiko)';
      yTitle = 'Sortino Ratio (Kun nedsiderisiko)';
    } else if (currentChartMode === 'sortino_drawdown') {
      xTitle = 'Maximum Drawdown 3 år (% fall)';
      yTitle = 'Sortino Ratio';
    }

    ctx.fillText(xTitle, padLeft + plotW / 2, height - 12);

    ctx.save();
    ctx.translate(16, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yTitle, 0, 0);
    ctx.restore();

    validItems.forEach(d => {
      const px = toPxX(d.x);
      const py = toPxY(d.y);

      let color = '#818cf8';
      let radius = 4.5;

      if (currentChartMode === 'risk_return') {
        const s = parseFloat(d.item.Sharpe_3Y);
        if (s >= 1.0) {
          color = '#10b981';
          radius = 5.5;
        } else if (s < 0) {
          color = '#f43f5e';
        }
      } else if (currentChartMode === 'sortino_sharpe') {
        if (d.y > d.x) {
          color = '#10b981';
          radius = 5.5;
        } else {
          color = '#f43f5e';
        }
      } else if (currentChartMode === 'sortino_drawdown') {
        if (d.y >= 1.2 && d.x > -18) {
          color = '#06b6d4';
          radius = 5.5;
        } else {
          color = '#a855f7';
        }
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      chartPoints.push({
        x: d.x,
        y: d.y,
        px,
        py,
        item: d.item,
        color
      });
    });

    const legendEl = document.getElementById('chart-legend');
    if (legendEl) {
      if (currentChartMode === 'risk_return') {
        legendEl.innerHTML = `
          <div class="chart-legend-item"><span class="legend-dot" style="background:#10b981;"></span> Sharpe &ge; 1.0 (Attraktiv betaling)</div>
          <div class="chart-legend-item"><span class="legend-dot" style="background:#818cf8;"></span> Sharpe 0.0 &ndash; 1.0 (Moderat)</div>
          <div class="chart-legend-item"><span class="legend-dot" style="background:#f43f5e;"></span> Negativ Sharpe / Høy risiko</div>
        `;
      } else if (currentChartMode === 'sortino_sharpe') {
        legendEl.innerHTML = `
          <div class="chart-legend-item"><span class="legend-dot" style="background:#10b981;"></span> Sortino &gt; Sharpe (Sterk oppsidevolatilitet)</div>
          <div class="chart-legend-item"><span class="legend-dot" style="background:#f43f5e;"></span> Sortino &le; Sharpe (Svingninger preget av nedturer)</div>
          <div class="chart-legend-item"><span style="border-top: 1.5px dashed rgba(255,255,255,0.4); width: 20px; display:inline-block;"></span> Likevekt (Sortino = Sharpe)</div>
        `;
      } else if (currentChartMode === 'sortino_drawdown') {
        legendEl.innerHTML = `
          <div class="chart-legend-item"><span class="legend-dot" style="background:#06b6d4;"></span> Sortino &ge; 1.2 & Drawdown &gt; -18% (Maksimal nedsidebeskyttelse)</div>
          <div class="chart-legend-item"><span class="legend-dot" style="background:#a855f7;"></span> Øvrige fond i filteret</div>
        `;
      }
    }
  }

  // =========================================================================
  // ETF CHART STUDIO (TradingView-stil Kursgraf & Teknisk Analyse)
  // =========================================================================
  let csState = {
    item: null,
    timeRange: '3Y',
    chartType: 'area', // 'area' | 'line'
    indicators: {
      sma50: true,
      sma200: true,
      ema20: false,
      bollinger: false,
      h52w: true
    },
    subIndicator: null, // null | 'rsi' | 'dd' | 'rolling_sharpe' | 'rolling_vol'
    showBenchmark: false,
    isFullscreen: false,
    activeTab: 'graph', // 'graph' | 'heatmap'
    rawPriceData: [],
    benchmarkData: [],
    manifest: null,
    mainChart: null,
    mainSeries: null,
    sma50Series: null,
    sma200Series: null,
    ema20Series: null,
    bbUpperSeries: null,
    bbLowerSeries: null,
    benchSeries: null,
    priceLines: [],
    subChart: null,
    subSeries: null,
    subLines: [],
    // Multi-sammenligning
    isComparisonMode: false,
    comparisonISINs: [],
    compareSeriesMap: {}
  };

  function calcSMA(data, period) {
    if (!data || data.length < period) return [];
    const res = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i].value;
    res.push({ time: data[period - 1].time, value: +(sum / period).toFixed(4) });
    for (let i = period; i < data.length; i++) {
      sum += data[i].value - data[i - period].value;
      res.push({ time: data[i].time, value: +(sum / period).toFixed(4) });
    }
    return res;
  }

  function calcEMA(data, period) {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    const res = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i].value;
    let ema = sum / period;
    res.push({ time: data[period - 1].time, value: +ema.toFixed(4) });
    for (let i = period; i < data.length; i++) {
      ema = (data[i].value - ema) * k + ema;
      res.push({ time: data[i].time, value: +ema.toFixed(4) });
    }
    return res;
  }

  function calcBollinger(data, period = 20, mult = 2) {
    if (!data || data.length < period) return { upper: [], lower: [] };
    const upper = [];
    const lower = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j].value;
      const mean = sum / period;
      let sumSq = 0;
      for (let j = 0; j < period; j++) sumSq += Math.pow(data[i - j].value - mean, 2);
      const stdDev = Math.sqrt(sumSq / period);
      upper.push({ time: data[i].time, value: +(mean + mult * stdDev).toFixed(4) });
      lower.push({ time: data[i].time, value: +(mean - mult * stdDev).toFixed(4) });
    }
    return { upper, lower };
  }

  function calcRSI(data, period = 14) {
    if (!data || data.length <= period) return [];
    const res = [];
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = data[i].value - data[i - 1].value;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    res.push({ time: data[period].time, value: +rsi.toFixed(2) });

    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i].value - data[i - 1].value;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
      res.push({ time: data[i].time, value: +rsi.toFixed(2) });
    }
    return res;
  }

  function calcDrawdown(data) {
    if (!data || !data.length) return [];
    let peak = -Infinity;
    const res = [];
    for (let i = 0; i < data.length; i++) {
      const val = data[i].value;
      if (val > peak) peak = val;
      const dd = peak === 0 ? 0 : ((val - peak) / peak) * 100;
      res.push({ time: data[i].time, value: +dd.toFixed(2) });
    }
    return res;
  }

  function calcRollingSharpe(data, window = 252, rfAnnual = 0.02) {
    if (!data || data.length <= window) return [];
    const rfDaily = rfAnnual / 252;
    const dailyReturns = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].value;
      const cur = data[i].value;
      dailyReturns.push({ time: data[i].time, r: prev > 0 ? (cur - prev) / prev : 0 });
    }

    const res = [];
    for (let i = window - 1; i < dailyReturns.length; i++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += dailyReturns[i - j].r;
      }
      const mean = sum / window;
      let sumSq = 0;
      for (let j = 0; j < window; j++) {
        sumSq += Math.pow(dailyReturns[i - j].r - mean, 2);
      }
      const std = Math.sqrt(sumSq / window);
      const sharpe = std > 0 ? ((mean - rfDaily) / std) * Math.sqrt(252) : 0;
      res.push({ time: dailyReturns[i].time, value: +sharpe.toFixed(2) });
    }
    return res;
  }

  function calcRollingVol(data, window = 30) {
    if (!data || data.length <= window) return [];
    const dailyReturns = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].value;
      const cur = data[i].value;
      dailyReturns.push({ time: data[i].time, r: prev > 0 ? (cur - prev) / prev : 0 });
    }

    const res = [];
    for (let i = window - 1; i < dailyReturns.length; i++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += dailyReturns[i - j].r;
      }
      const mean = sum / window;
      let sumSq = 0;
      for (let j = 0; j < window; j++) {
        sumSq += Math.pow(dailyReturns[i - j].r - mean, 2);
      }
      const std = Math.sqrt(sumSq / window);
      const volAnn = std * Math.sqrt(252) * 100;
      res.push({ time: dailyReturns[i].time, value: +volAnn.toFixed(2) });
    }
    return res;
  }

  function filterByTimeRange(data, range) {
    if (!data || !data.length || range === 'ALL') return data;
    const lastDate = new Date(data[data.length - 1].time);
    let cutoff = new Date(lastDate);
    if (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
    else if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
    else if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (range === 'YTD') cutoff = new Date(lastDate.getFullYear(), 0, 1);
    else if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (range === '3Y') cutoff.setFullYear(cutoff.getFullYear() - 3);
    else if (range === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);

    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = data.filter(d => d.time >= cutoffStr);
    return filtered.length >= 2 ? filtered : data;
  }

  function normalizeToPct(data) {
    if (!data || !data.length) return [];
    const base = data[0].value;
    if (base === 0) return data;
    return data.map(d => ({
      time: d.time,
      value: +(((d.value - base) / base) * 100).toFixed(2)
    }));
  }

  function initChartStudio() {
    const elModal = document.getElementById('etf-chart-modal');
    const elClose = document.getElementById('chart-modal-close-btn');
    const elFullscreen = document.getElementById('chart-btn-fullscreen');
    const elDialog = document.getElementById('chart-studio-dialog');
    const rangeBtns = document.querySelectorAll('#chart-time-ranges .chart-tb-btn');
    const btnTypeArea = document.getElementById('btn-chart-type-area');
    const btnTypeLine = document.getElementById('btn-chart-type-line');
    const btnIndDropdown = document.getElementById('btn-chart-indicators');
    const menuInd = document.getElementById('chart-indicators-menu');
    const btnRsi = document.getElementById('btn-toggle-rsi');
    const btnDd = document.getElementById('btn-toggle-dd');
    const btnRollingSharpe = document.getElementById('btn-toggle-rolling-sharpe');
    const btnRollingVol = document.getElementById('btn-toggle-rolling-vol');
    const btnBenchmark = document.getElementById('btn-toggle-benchmark');
    const tabGraph = document.getElementById('tab-btn-graph');
    const tabHeatmap = document.getElementById('tab-btn-heatmap');
    const mainContainer = document.getElementById('chart-container-main');
    const subContainer = document.getElementById('chart-container-sub');
    const heatContainer = document.getElementById('chart-heatmap-container');
    const liveLegend = document.getElementById('chart-live-legend');
    const chartToolbar = document.querySelector('.chart-studio-toolbar');

    // Fane-bytte: Kurs & Analyse vs Månedsmatrise
    if (tabGraph && tabHeatmap) {
      tabGraph.addEventListener('click', () => {
        tabGraph.classList.add('active');
        tabHeatmap.classList.remove('active');
        csState.activeTab = 'graph';
        if (heatContainer) heatContainer.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';
        if (liveLegend) liveLegend.style.display = 'flex';
        if (chartToolbar) chartToolbar.style.display = 'flex';
        if (csState.subIndicator && subContainer) subContainer.style.display = 'block';
        setTimeout(resizeCharts, 30);
      });

      tabHeatmap.addEventListener('click', () => {
        tabHeatmap.classList.add('active');
        tabGraph.classList.remove('active');
        csState.activeTab = 'heatmap';
        if (mainContainer) mainContainer.style.display = 'none';
        if (subContainer) subContainer.style.display = 'none';
        if (liveLegend) liveLegend.style.display = 'none';
        if (chartToolbar) chartToolbar.style.display = 'none';
        if (heatContainer) {
          heatContainer.style.display = 'flex';
          renderMonthlyHeatmap(csState.item, csState.rawPriceData);
        }
      });
    }

    // Lukk modal
    if (elClose) {
      elClose.addEventListener('click', closeChartStudio);
    }
    if (elModal) {
      elModal.addEventListener('click', (e) => {
        if (e.target === elModal) closeChartStudio();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elModal && elModal.style.display !== 'none') {
        closeChartStudio();
      }
    });

    // Fullskjerm toggle
    if (elFullscreen && elDialog) {
      elFullscreen.addEventListener('click', () => {
        csState.isFullscreen = !csState.isFullscreen;
        elDialog.classList.toggle('modal-fullscreen', csState.isFullscreen);
        elFullscreen.textContent = csState.isFullscreen ? '❐' : '⛶';
        elFullscreen.title = csState.isFullscreen ? 'Minimer vindu' : 'Fullskjerm';
        setTimeout(resizeCharts, 50);
      });
    }

    // Tidsrom-knapper
    rangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        rangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        csState.timeRange = btn.dataset.range;
        updateChartRender();
      });
    });

    // Graf-stil (Areal vs Linje)
    if (btnTypeArea && btnTypeLine) {
      btnTypeArea.addEventListener('click', () => {
        btnTypeArea.classList.add('active');
        btnTypeLine.classList.remove('active');
        csState.chartType = 'area';
        buildMainSeries();
        updateChartRender();
      });
      btnTypeLine.addEventListener('click', () => {
        btnTypeLine.classList.add('active');
        btnTypeArea.classList.remove('active');
        csState.chartType = 'line';
        buildMainSeries();
        updateChartRender();
      });
    }

    // Indikator-meny dropdown
    if (btnIndDropdown && menuInd) {
      btnIndDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menuInd.style.display !== 'none';
        menuInd.style.display = isOpen ? 'none' : 'block';
      });
      document.addEventListener('click', (e) => {
        if (!menuInd.contains(e.target) && e.target !== btnIndDropdown) {
          menuInd.style.display = 'none';
        }
      });
    }

    // Indikator-sjekkbokser
    const indCheckboxes = {
      sma50: document.getElementById('ind-sma50'),
      sma200: document.getElementById('ind-sma200'),
      ema20: document.getElementById('ind-ema20'),
      bollinger: document.getElementById('ind-bollinger'),
      h52w: document.getElementById('ind-52w')
    };

    Object.keys(indCheckboxes).forEach(key => {
      const cb = indCheckboxes[key];
      if (cb) {
        cb.checked = csState.indicators[key];
        cb.addEventListener('change', () => {
          csState.indicators[key] = cb.checked;
          updateChartRender();
        });
      }
    });

    // Underspor: RSI, Drawdown, Rullerende Sharpe, Rullerende Volatilitet
    const clearOtherSubBtns = (activeBtn) => {
      [btnRsi, btnDd, btnRollingSharpe, btnRollingVol].forEach(b => {
        if (b && b !== activeBtn) b.classList.remove('active');
      });
    };

    if (btnRsi) {
      btnRsi.addEventListener('click', () => {
        if (csState.subIndicator === 'rsi') {
          csState.subIndicator = null;
          btnRsi.classList.remove('active');
        } else {
          csState.subIndicator = 'rsi';
          clearOtherSubBtns(btnRsi);
          btnRsi.classList.add('active');
        }
        updateSubChartVisibility();
      });
    }

    if (btnDd) {
      btnDd.addEventListener('click', () => {
        if (csState.subIndicator === 'dd') {
          csState.subIndicator = null;
          btnDd.classList.remove('active');
        } else {
          csState.subIndicator = 'dd';
          clearOtherSubBtns(btnDd);
          btnDd.classList.add('active');
        }
        updateSubChartVisibility();
      });
    }

    if (btnRollingSharpe) {
      btnRollingSharpe.addEventListener('click', () => {
        if (csState.subIndicator === 'rolling_sharpe') {
          csState.subIndicator = null;
          btnRollingSharpe.classList.remove('active');
        } else {
          csState.subIndicator = 'rolling_sharpe';
          clearOtherSubBtns(btnRollingSharpe);
          btnRollingSharpe.classList.add('active');
        }
        updateSubChartVisibility();
      });
    }

    if (btnRollingVol) {
      btnRollingVol.addEventListener('click', () => {
        if (csState.subIndicator === 'rolling_vol') {
          csState.subIndicator = null;
          btnRollingVol.classList.remove('active');
        } else {
          csState.subIndicator = 'rolling_vol';
          clearOtherSubBtns(btnRollingVol);
          btnRollingVol.classList.add('active');
        }
        updateSubChartVisibility();
      });
    }

    // Benchmark toggle
    if (btnBenchmark) {
      btnBenchmark.addEventListener('click', () => {
        csState.showBenchmark = !csState.showBenchmark;
        btnBenchmark.classList.toggle('active', csState.showBenchmark);
        updateChartRender();
      });
    }

    // Window resize observer for responsive chart
    window.addEventListener('resize', resizeCharts);

    // Forhåndslast manifest
    fetch('./prices/manifest.json')
      .then(res => res.ok ? res.json() : null)
      .then(m => { csState.manifest = m; })
      .catch(() => {});
  }

  function resizeCharts() {
    const mainContainer = document.getElementById('chart-container-main');
    if (csState.mainChart && mainContainer) {
      csState.mainChart.applyOptions({
        width: mainContainer.clientWidth,
        height: mainContainer.clientHeight || 360
      });
    }
    const subContainer = document.getElementById('chart-container-sub');
    if (csState.subChart && subContainer && subContainer.style.display !== 'none') {
      csState.subChart.applyOptions({
        width: subContainer.clientWidth,
        height: subContainer.clientHeight || 140
      });
    }
  }

  function closeChartStudio() {
    const elModal = document.getElementById('etf-chart-modal');
    if (elModal) elModal.style.display = 'none';
    destroyCharts();
    csState.item = null;
    csState.rawPriceData = [];
  }

  function destroyCharts() {
    if (csState.mainChart) {
      try { csState.mainChart.remove(); } catch (e) {}
      csState.mainChart = null;
      csState.mainSeries = null;
      csState.sma50Series = null;
      csState.sma200Series = null;
      csState.ema20Series = null;
      csState.bbUpperSeries = null;
      csState.bbLowerSeries = null;
      csState.benchSeries = null;
      csState.priceLines = [];
    }
    if (csState.subChart) {
      try { csState.subChart.remove(); } catch (e) {}
      csState.subChart = null;
      csState.subSeries = null;
      csState.subLines = [];
    }
  }

  function openChartStudio(item) {
    if (!item) return;
    csState.item = item;
    csState.isComparisonMode = false;

    const elModal = document.getElementById('etf-chart-modal');
    if (elModal) elModal.style.display = 'flex';

    // Fyll inn headere
    const ticker = item.Kortnavn || item.Ticker || item.ISIN.slice(0, 6);
    document.getElementById('chart-modal-ticker').textContent = ticker;
    document.getElementById('chart-modal-isin').textContent = item.ISIN;
    document.getElementById('chart-modal-cat').textContent = item.Kategori_Morningstar || item.Kategori_Nordnet || 'ETF';
    document.getElementById('chart-modal-title').textContent = item.Navn_Morningstar || item.Navn_Fil || item.ISIN;

    // Nullstill stat
    document.getElementById('chart-stat-price').textContent = 'Laster...';
    document.getElementById('chart-stat-change').textContent = '—';
    document.getElementById('chart-stat-52w').textContent = '—';

    // Fane-synlighet
    const mainContainer = document.getElementById('chart-container-main');
    const subContainer = document.getElementById('chart-container-sub');
    const heatContainer = document.getElementById('chart-heatmap-container');
    const liveLegend = document.getElementById('chart-live-legend');
    const chartToolbar = document.querySelector('.chart-studio-toolbar');
    const tabGraph = document.getElementById('tab-btn-graph');
    const tabHeatmap = document.getElementById('tab-btn-heatmap');

    if (csState.activeTab === 'heatmap') {
      if (tabHeatmap) tabHeatmap.classList.add('active');
      if (tabGraph) tabGraph.classList.remove('active');
      if (mainContainer) mainContainer.style.display = 'none';
      if (subContainer) subContainer.style.display = 'none';
      if (liveLegend) liveLegend.style.display = 'none';
      if (chartToolbar) chartToolbar.style.display = 'none';
      if (heatContainer) heatContainer.style.display = 'flex';
    } else {
      if (tabGraph) tabGraph.classList.add('active');
      if (tabHeatmap) tabHeatmap.classList.remove('active');
      if (heatContainer) heatContainer.style.display = 'none';
      if (mainContainer) mainContainer.style.display = 'block';
      if (liveLegend) liveLegend.style.display = 'flex';
      if (chartToolbar) chartToolbar.style.display = 'flex';
    }

    // Skjul empty state mens vi laster
    const elEmpty = document.getElementById('chart-empty-state');
    if (elEmpty) elEmpty.style.display = 'none';

    // Hent data
    loadPriceDataForETF(item);
  }

  async function loadPriceDataForETF(item) {
    let data = null;
    let targetId = item.ISIN;

    // Forsøk 1: ISIN.json
    try {
      const res = await fetch(`./prices/${targetId}.json`);
      if (res.ok) {
        const payload = await res.json();
        data = payload.data || payload;
      }
    } catch (e) {}

    // Forsøk 2: Kortnavn.json hvis ISIN feilet
    if (!data && item.Kortnavn) {
      try {
        const res = await fetch(`./prices/${item.Kortnavn}.json`);
        if (res.ok) {
          const payload = await res.json();
          data = payload.data || payload;
        }
      } catch (e) {}
    }

    // Forsøk 3: Sjekk manifest
    if (!data && csState.manifest) {
      const keys = Object.keys(csState.manifest);
      const match = keys.find(k => k.toLowerCase() === (item.Kortnavn || '').toLowerCase() || k === item.ISIN);
      if (match) {
        try {
          const res = await fetch(`./prices/${match}.json`);
          if (res.ok) {
            const payload = await res.json();
            data = payload.data || payload;
          }
        } catch (e) {}
      }
    }

    if (!data || !data.length) {
      showEmptyState(item);
      return;
    }

    csState.rawPriceData = data;

    // Render månedsmatrise hvis den fanen er valgt
    if (csState.activeTab === 'heatmap') {
      renderMonthlyHeatmap(item, data);
    }

    // Prøv også å laste referanseindeks for sammenligning
    loadBenchmarkData();

    // Initialiser chart og tegn
    initChartInstances();
    updateChartRender();
  }

  async function loadBenchmarkData() {
    if (csState.benchmarkData && csState.benchmarkData.length) return;
    try {
      // S&P 500 eller MSCI World som standard referanseindeks
      const res = await fetch('./prices/_GSPC.json');
      if (res.ok) {
        const payload = await res.json();
        csState.benchmarkData = payload.data || payload;
      }
    } catch (e) {}
  }

  function showEmptyState(item) {
    destroyCharts();
    const elEmpty = document.getElementById('chart-empty-state');
    if (!elEmpty) return;

    elEmpty.style.display = 'flex';
    const ticker = item.Kortnavn || item.ISIN;
    document.getElementById('empty-state-title').textContent = `Kurshistorikk for ${ticker} behandles`;
    document.getElementById('empty-state-msg').textContent =
      `Råkursene for dette instrumentet lastes for øyeblikket ned og synkroniseres av markedsmotoren. Prøv et av fondene som allerede har komplette kurser:`;

    const pillsContainer = document.getElementById('empty-state-quick-pills');
    if (!pillsContainer) return;
    pillsContainer.innerHTML = '';

    const popular = [
      { name: 'iShares Core MSCI World (EUNL)', isin: 'IE00B4L5Y983' },
      { name: 'iShares Core S&P 500 (SXR8)', isin: 'IE00B5BMR087' },
      { name: 'Vanguard S&P 500 (VUAA)', isin: 'IE00BFMXXD54' },
      { name: 'Vanguard FTSE All-World (VGWL)', isin: 'IE00B3RBWM25' },
      { name: 'Amundi Australia S&P/ASX (LYPU)', isin: 'LU0496786905' },
      { name: 'Amundi Stoxx Europe 600 (LYP6)', isin: 'LU0908500753' },
      { name: 'iShares $ Treasury Bd 1-3yr (2B7S)', isin: 'IE00BDFK1573' },
      { name: 'Amundi Core MSCI Europe (CEU2)', isin: 'LU1437015735' }
    ];

    popular.forEach(pop => {
      const btn = document.createElement('button');
      btn.className = 'quick-etf-pill';
      btn.textContent = pop.name;
      btn.onclick = () => {
        const found = rawData.find(d => d.ISIN === pop.isin);
        if (found) openChartStudio(found);
      };
      pillsContainer.appendChild(btn);
    });
  }

  function initChartInstances() {
    destroyCharts();

    const mainContainer = document.getElementById('chart-container-main');
    if (!mainContainer || typeof LightweightCharts === 'undefined') return;

    // 1. Lag Hovedgraf
    csState.mainChart = LightweightCharts.createChart(mainContainer, {
      width: mainContainer.clientWidth,
      height: mainContainer.clientHeight || 360,
      layout: {
        background: { type: 'solid', color: '#080c14' },
        textColor: '#94a3b8',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Plus Jakarta Sans', monospace"
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' },
        horzLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 }
      }
    });

    buildMainSeries();

    // Crosshair hover event for live legend
    csState.mainChart.subscribeCrosshairMove(param => {
      updateLiveLegend(param);
    });

    // 2. Lag Underspor hvis nødvendig
    initSubChartInstance();
  }

  function buildMainSeries() {
    if (!csState.mainChart) return;
    if (csState.mainSeries) {
      try { csState.mainChart.removeSeries(csState.mainSeries); } catch (e) {}
    }

    if (csState.chartType === 'area') {
      csState.mainSeries = csState.mainChart.addSeries(LightweightCharts.AreaSeries, {
        lineColor: '#6366f1',
        topColor: 'rgba(99, 102, 241, 0.38)',
        bottomColor: 'rgba(99, 102, 241, 0.01)',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });
    } else {
      csState.mainSeries = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
        color: '#6366f1',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });
    }
  }

  function initSubChartInstance() {
    const subContainer = document.getElementById('chart-container-sub');
    if (!subContainer || typeof LightweightCharts === 'undefined') return;

    if (!csState.subIndicator) {
      subContainer.style.display = 'none';
      if (csState.subChart) {
        try { csState.subChart.remove(); } catch (e) {}
        csState.subChart = null;
      }
      return;
    }

    subContainer.style.display = 'block';

    if (!csState.subChart) {
      csState.subChart = LightweightCharts.createChart(subContainer, {
        width: subContainer.clientWidth,
        height: 140,
        layout: {
          background: { type: 'solid', color: '#060910' },
          textColor: '#94a3b8',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace"
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.03)' }
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#818cf8', width: 1, style: 3 },
          horzLine: { color: '#818cf8', width: 1, style: 3 }
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          visible: false
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.08)'
        }
      });

      // Synkroniser tidslinje mellom hovedgraf og underspor
      csState.mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (csState.subChart && range) {
          csState.subChart.timeScale().setVisibleLogicalRange(range);
        }
      });
      csState.subChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (csState.mainChart && range) {
          csState.mainChart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    buildSubSeries();
  }

  function buildSubSeries() {
    if (!csState.subChart) return;
    if (csState.subSeries) {
      try { csState.subChart.removeSeries(csState.subSeries); } catch (e) {}
      csState.subSeries = null;
    }
    csState.subLines.forEach(l => {
      try { csState.subSeries?.removePriceLine(l); } catch (e) {}
    });
    csState.subLines = [];

    if (csState.subIndicator === 'rsi') {
      csState.subSeries = csState.subChart.addSeries(LightweightCharts.LineSeries, {
        color: '#c084fc',
        lineWidth: 1.5,
        priceFormat: { type: 'custom', formatter: (p) => p.toFixed(1) }
      });
      // 70 overkjøpt & 30 oversolgt linjer
      const l70 = csState.subSeries.createPriceLine({
        price: 70,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '70'
      });
      const l30 = csState.subSeries.createPriceLine({
        price: 30,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '30'
      });
      csState.subLines.push(l70, l30);
    } else if (csState.subIndicator === 'dd') {
      csState.subSeries = csState.subChart.addSeries(LightweightCharts.AreaSeries, {
        lineColor: '#f43f5e',
        topColor: 'rgba(244, 63, 94, 0.0)',
        bottomColor: 'rgba(244, 63, 94, 0.35)',
        lineWidth: 1.5,
        priceFormat: { type: 'custom', formatter: (p) => `${p.toFixed(1)}%` }
      });
      const l0 = csState.subSeries.createPriceLine({
        price: 0,
        color: '#94a3b8',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: '0%'
      });
      csState.subLines.push(l0);
    } else if (csState.subIndicator === 'rolling_sharpe') {
      csState.subSeries = csState.subChart.addSeries(LightweightCharts.LineSeries, {
        color: '#34d399',
        lineWidth: 1.5,
        priceFormat: { type: 'custom', formatter: (p) => p.toFixed(2) }
      });
      const l0 = csState.subSeries.createPriceLine({
        price: 0,
        color: 'rgba(255, 255, 255, 0.25)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: '0.0'
      });
      const l1 = csState.subSeries.createPriceLine({
        price: 1.0,
        color: 'rgba(52, 211, 153, 0.45)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '1.0'
      });
      csState.subLines.push(l0, l1);
    } else if (csState.subIndicator === 'rolling_vol') {
      csState.subSeries = csState.subChart.addSeries(LightweightCharts.AreaSeries, {
        lineColor: '#38bdf8',
        topColor: 'rgba(56, 189, 248, 0.35)',
        bottomColor: 'rgba(56, 189, 248, 0.02)',
        lineWidth: 1.5,
        priceFormat: { type: 'custom', formatter: (p) => `${p.toFixed(1)}%` }
      });
    }
  }

  function updateSubChartVisibility() {
    initSubChartInstance();
    updateChartRender();
    setTimeout(resizeCharts, 30);
  }

  function updateChartRender() {
    if (!csState.rawPriceData || !csState.rawPriceData.length || !csState.mainChart) return;

    // 1. Filtrer data etter tidsrom
    const filtered = filterByTimeRange(csState.rawPriceData, csState.timeRange);
    if (!filtered || !filtered.length) return;

    // 2. Oppdater header statistikk
    const firstPoint = filtered[0];
    const lastPoint = filtered[filtered.length - 1];
    const diffPct = ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100;
    const currency = csState.item?.Valuta || 'EUR';

    document.getElementById('chart-stat-price').textContent = `${lastPoint.value.toFixed(2)} ${currency}`;
    const elChange = document.getElementById('chart-stat-change');
    elChange.textContent = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`;
    elChange.className = `chart-stat-val ${diffPct >= 0 ? 'text-emerald' : 'text-rose'}`;

    // 52-ukers beregning (siste ~252 punkter)
    const points52w = csState.rawPriceData.slice(-252);
    let min52 = Infinity, max52 = -Infinity;
    points52w.forEach(p => {
      if (p.value < min52) min52 = p.value;
      if (p.value > max52) max52 = p.value;
    });
    document.getElementById('chart-stat-52w').textContent = `${min52.toFixed(2)} – ${max52.toFixed(2)}`;

    // 3. Sett hoveddata
    if (csState.showBenchmark) {
      // Normaliser begge til %
      const normMain = normalizeToPct(filtered);
      csState.mainSeries.setData(normMain);
    } else {
      csState.mainSeries.setData(filtered);
    }

    // 4. SMA 50
    if (csState.indicators.sma50 && !csState.showBenchmark) {
      if (!csState.sma50Series) {
        csState.sma50Series = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: '#f59e0b',
          lineWidth: 1.5,
          title: 'SMA 50'
        });
      }
      const allSma50 = calcSMA(csState.rawPriceData, 50);
      csState.sma50Series.setData(filterByTimeRange(allSma50, csState.timeRange));
      document.getElementById('leg-sma50-wrap').style.display = 'inline-flex';
    } else if (csState.sma50Series) {
      try { csState.mainChart.removeSeries(csState.sma50Series); } catch (e) {}
      csState.sma50Series = null;
      document.getElementById('leg-sma50-wrap').style.display = 'none';
    }

    // 5. SMA 200
    if (csState.indicators.sma200 && !csState.showBenchmark) {
      if (!csState.sma200Series) {
        csState.sma200Series = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: '#06b6d4',
          lineWidth: 1.5,
          title: 'SMA 200'
        });
      }
      const allSma200 = calcSMA(csState.rawPriceData, 200);
      csState.sma200Series.setData(filterByTimeRange(allSma200, csState.timeRange));
      document.getElementById('leg-sma200-wrap').style.display = 'inline-flex';
    } else if (csState.sma200Series) {
      try { csState.mainChart.removeSeries(csState.sma200Series); } catch (e) {}
      csState.sma200Series = null;
      document.getElementById('leg-sma200-wrap').style.display = 'none';
    }

    // 6. EMA 20
    if (csState.indicators.ema20 && !csState.showBenchmark) {
      if (!csState.ema20Series) {
        csState.ema20Series = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: '#a855f7',
          lineWidth: 1.5,
          title: 'EMA 20'
        });
      }
      const allEma20 = calcEMA(csState.rawPriceData, 20);
      csState.ema20Series.setData(filterByTimeRange(allEma20, csState.timeRange));
      document.getElementById('leg-ema20-wrap').style.display = 'inline-flex';
    } else if (csState.ema20Series) {
      try { csState.mainChart.removeSeries(csState.ema20Series); } catch (e) {}
      csState.ema20Series = null;
      document.getElementById('leg-ema20-wrap').style.display = 'none';
    }

    // 7. Bollinger Bands
    if (csState.indicators.bollinger && !csState.showBenchmark) {
      if (!csState.bbUpperSeries) {
        csState.bbUpperSeries = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: 'rgba(99, 102, 241, 0.45)',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          title: 'BB Øvre'
        });
        csState.bbLowerSeries = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: 'rgba(99, 102, 241, 0.45)',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          title: 'BB Nedre'
        });
      }
      const bb = calcBollinger(csState.rawPriceData, 20, 2);
      csState.bbUpperSeries.setData(filterByTimeRange(bb.upper, csState.timeRange));
      csState.bbLowerSeries.setData(filterByTimeRange(bb.lower, csState.timeRange));
    } else if (csState.bbUpperSeries) {
      try {
        csState.mainChart.removeSeries(csState.bbUpperSeries);
        csState.mainChart.removeSeries(csState.bbLowerSeries);
      } catch (e) {}
      csState.bbUpperSeries = null;
      csState.bbLowerSeries = null;
    }

    // 8. 52-ukers prislinjer
    csState.priceLines.forEach(l => {
      try { csState.mainSeries?.removePriceLine(l); } catch (e) {}
    });
    csState.priceLines = [];

    if (csState.indicators.h52w && !csState.showBenchmark && Number.isFinite(max52) && Number.isFinite(min52)) {
      const lineH = csState.mainSeries.createPriceLine({
        price: max52,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '52U Høy'
      });
      const lineL = csState.mainSeries.createPriceLine({
        price: min52,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '52U Lav'
      });
      csState.priceLines.push(lineH, lineL);
    }

    // 9. Benchmark sammenligning
    if (csState.showBenchmark && csState.benchmarkData && csState.benchmarkData.length) {
      if (!csState.benchSeries) {
        csState.benchSeries = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
          color: '#38bdf8',
          lineWidth: 1.5,
          lineStyle: LightweightCharts.LineStyle.Dotted,
          title: 'S&P 500 %'
        });
      }
      const benchFiltered = filterByTimeRange(csState.benchmarkData, csState.timeRange);
      csState.benchSeries.setData(normalizeToPct(benchFiltered));
      document.getElementById('leg-bench-wrap').style.display = 'inline-flex';
    } else if (csState.benchSeries) {
      try { csState.mainChart.removeSeries(csState.benchSeries); } catch (e) {}
      csState.benchSeries = null;
      document.getElementById('leg-bench-wrap').style.display = 'none';
    }

    // 10. Underspor data (RSI, Drawdown, Rullerende Sharpe, Rullerende Volatilitet)
    if (csState.subChart && csState.subSeries) {
      if (csState.subIndicator === 'rsi') {
        const allRsi = calcRSI(csState.rawPriceData, 14);
        csState.subSeries.setData(filterByTimeRange(allRsi, csState.timeRange));
        document.getElementById('leg-rsi-wrap').style.display = 'inline-flex';
        document.getElementById('leg-dd-wrap').style.display = 'none';
        document.getElementById('leg-sharpe-wrap').style.display = 'none';
        document.getElementById('leg-vol-wrap').style.display = 'none';
      } else if (csState.subIndicator === 'dd') {
        const allDd = calcDrawdown(csState.rawPriceData);
        csState.subSeries.setData(filterByTimeRange(allDd, csState.timeRange));
        document.getElementById('leg-dd-wrap').style.display = 'inline-flex';
        document.getElementById('leg-rsi-wrap').style.display = 'none';
        document.getElementById('leg-sharpe-wrap').style.display = 'none';
        document.getElementById('leg-vol-wrap').style.display = 'none';
      } else if (csState.subIndicator === 'rolling_sharpe') {
        const allSharpe = calcRollingSharpe(csState.rawPriceData, 252);
        csState.subSeries.setData(filterByTimeRange(allSharpe, csState.timeRange));
        document.getElementById('leg-sharpe-wrap').style.display = 'inline-flex';
        document.getElementById('leg-rsi-wrap').style.display = 'none';
        document.getElementById('leg-dd-wrap').style.display = 'none';
        document.getElementById('leg-vol-wrap').style.display = 'none';
      } else if (csState.subIndicator === 'rolling_vol') {
        const allVol = calcRollingVol(csState.rawPriceData, 30);
        csState.subSeries.setData(filterByTimeRange(allVol, csState.timeRange));
        document.getElementById('leg-vol-wrap').style.display = 'inline-flex';
        document.getElementById('leg-rsi-wrap').style.display = 'none';
        document.getElementById('leg-dd-wrap').style.display = 'none';
        document.getElementById('leg-sharpe-wrap').style.display = 'none';
      }
      csState.subChart.timeScale().fitContent();
    } else {
      document.getElementById('leg-rsi-wrap').style.display = 'none';
      document.getElementById('leg-dd-wrap').style.display = 'none';
      document.getElementById('leg-sharpe-wrap').style.display = 'none';
      document.getElementById('leg-vol-wrap').style.display = 'none';
    }

    // Tilpass synlig område
    csState.mainChart.timeScale().fitContent();
  }

  function updateLiveLegend(param) {
    if (!param || !param.time || !param.seriesData) return;

    document.getElementById('leg-date').textContent = param.time;

    const mainVal = param.seriesData.get(csState.mainSeries);
    if (mainVal) {
      const price = mainVal.value !== undefined ? mainVal.value : mainVal.close;
      if (price !== undefined) {
        document.getElementById('leg-price').textContent = csState.showBenchmark ? `${price.toFixed(2)}%` : `${price.toFixed(2)}`;
      }
    }

    if (csState.sma50Series) {
      const v = param.seriesData.get(csState.sma50Series);
      document.getElementById('leg-sma50').textContent = v && v.value ? v.value.toFixed(2) : '—';
    }
    if (csState.sma200Series) {
      const v = param.seriesData.get(csState.sma200Series);
      document.getElementById('leg-sma200').textContent = v && v.value ? v.value.toFixed(2) : '—';
    }
    if (csState.ema20Series) {
      const v = param.seriesData.get(csState.ema20Series);
      document.getElementById('leg-ema20').textContent = v && v.value ? v.value.toFixed(2) : '—';
    }
    if (csState.benchSeries) {
      const v = param.seriesData.get(csState.benchSeries);
      document.getElementById('leg-bench').textContent = v && v.value ? `${v.value.toFixed(2)}%` : '—';
    }
    if (csState.subSeries && csState.subIndicator === 'rsi') {
      const v = param.seriesData.get(csState.subSeries);
      document.getElementById('leg-rsi').textContent = v && v.value !== undefined ? v.value.toFixed(1) : '—';
    }
    if (csState.subSeries && csState.subIndicator === 'dd') {
      const v = param.seriesData.get(csState.subSeries);
      document.getElementById('leg-dd').textContent = v && v.value !== undefined ? `${v.value.toFixed(2)}%` : '—';
    }
    if (csState.subSeries && csState.subIndicator === 'rolling_sharpe') {
      const v = param.seriesData.get(csState.subSeries);
      document.getElementById('leg-sharpe').textContent = v && v.value !== undefined ? v.value.toFixed(2) : '—';
    }
    if (csState.subSeries && csState.subIndicator === 'rolling_vol') {
      const v = param.seriesData.get(csState.subSeries);
      document.getElementById('leg-vol').textContent = v && v.value !== undefined ? `${v.value.toFixed(1)}%` : '—';
    }
  }

  // =========================================================================
  // Månedsmatrise (Monthly Returns Heatmap / Sesonganalyse)
  // =========================================================================
  function renderMonthlyHeatmap(item, data) {
    const container = document.getElementById('chart-heatmap-container');
    if (!container) return;

    if (!data || data.length < 20) {
      container.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🗓️</div>
          <h3 style="color: #f8fafc; font-size: 1.15rem; margin-bottom: 0.4rem;">Kurshistorikken behandles</h3>
          <p>Ikke tilstrekkelig månedshistorikk tilgjengelig for dette instrumentet ennå.</p>
        </div>
      `;
      return;
    }

    const yearsMap = {};
    data.forEach(p => {
      const parts = p.time.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!yearsMap[y]) yearsMap[y] = {};
      if (!yearsMap[y][m]) yearsMap[y][m] = [];
      yearsMap[y][m].push(p.value);
    });

    const years = Object.keys(yearsMap).map(Number).sort((a, b) => b - a);
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

    const matrix = {};
    const allMonthReturns = [];

    const sortedChronologicalYears = [...years].sort((a, b) => a - b);
    let prevMonthClose = null;

    sortedChronologicalYears.forEach(y => {
      matrix[y] = {};
      let yearFirstVal = null;
      let yearLastVal = null;

      months.forEach(m => {
        const quotes = yearsMap[y][m];
        if (!quotes || !quotes.length) return;

        const curClose = quotes[quotes.length - 1];
        if (yearFirstVal === null) {
          yearFirstVal = prevMonthClose !== null ? prevMonthClose : quotes[0];
        }
        yearLastVal = curClose;

        const startPrice = prevMonthClose !== null ? prevMonthClose : quotes[0];
        const pct = startPrice > 0 ? ((curClose - startPrice) / startPrice) * 100 : 0;
        matrix[y][m] = pct;
        allMonthReturns.push(pct);

        prevMonthClose = curClose;
      });

      if (yearFirstVal !== null && yearLastVal !== null && yearFirstVal > 0) {
        matrix[y].total = ((yearLastVal - yearFirstVal) / yearFirstVal) * 100;
      }
    });

    const positiveCount = allMonthReturns.filter(r => r > 0).length;
    const winRate = allMonthReturns.length ? (positiveCount / allMonthReturns.length) * 100 : 0;
    const bestMonth = allMonthReturns.length ? Math.max(...allMonthReturns) : 0;
    const worstMonth = allMonthReturns.length ? Math.min(...allMonthReturns) : 0;
    const avgMonth = allMonthReturns.length ? allMonthReturns.reduce((a, b) => a + b, 0) / allMonthReturns.length : 0;

    const getHeatColor = (pct) => {
      if (pct === undefined || pct === null) return 'transparent';
      if (pct > 0) {
        const opacity = Math.min(0.65, Math.max(0.12, (pct / 8) * 0.55));
        return `rgba(16, 185, 129, ${opacity.toFixed(2)})`;
      } else if (pct < 0) {
        const opacity = Math.min(0.65, Math.max(0.12, (Math.abs(pct) / 8) * 0.55));
        return `rgba(244, 63, 94, ${opacity.toFixed(2)})`;
      }
      return 'rgba(255, 255, 255, 0.04)';
    };

    let html = `
      <div class="heatmap-kpi-bar">
        <div class="heatmap-kpi-card">
          <span class="heatmap-kpi-label">Positiv Treffprosent</span>
          <span class="heatmap-kpi-val text-emerald">${winRate.toFixed(1)}%</span>
        </div>
        <div class="heatmap-kpi-card">
          <span class="heatmap-kpi-label">Beste Måned</span>
          <span class="heatmap-kpi-val text-emerald">+${bestMonth.toFixed(2)}%</span>
        </div>
        <div class="heatmap-kpi-card">
          <span class="heatmap-kpi-label">Verste Måned</span>
          <span class="heatmap-kpi-val text-rose">${worstMonth.toFixed(2)}%</span>
        </div>
        <div class="heatmap-kpi-card">
          <span class="heatmap-kpi-label">Gj.snittlig Mnd</span>
          <span class="heatmap-kpi-val ${avgMonth >= 0 ? 'text-emerald' : 'text-rose'}">${avgMonth >= 0 ? '+' : ''}${avgMonth.toFixed(2)}%</span>
        </div>
      </div>

      <div class="heatmap-table-wrap">
        <table class="heatmap-table">
          <thead>
            <tr>
              <th style="width: 65px;">År</th>
              ${monthNames.map(m => `<th>${m}</th>`).join('')}
              <th style="width: 85px;">År / YTD</th>
            </tr>
          </thead>
          <tbody>
    `;

    years.forEach(y => {
      const row = matrix[y] || {};
      const tot = row.total;
      const totStyle = tot !== undefined ? `background: ${getHeatColor(tot)};` : '';
      const totFmt = tot !== undefined ? `${tot >= 0 ? '+' : ''}${tot.toFixed(2)}%` : '—';
      const totCls = tot > 0 ? 'text-emerald' : (tot < 0 ? 'text-rose' : '');

      html += `<tr><td class="heatmap-year">${y}</td>`;

      months.forEach(m => {
        const val = row[m];
        if (val !== undefined) {
          const bg = getHeatColor(val);
          const cls = val > 0 ? 'text-emerald font-bold' : (val < 0 ? 'text-rose font-bold' : '');
          html += `<td style="background: ${bg};" class="${cls}" title="${y} ${monthNames[m - 1]}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%">${val >= 0 ? '+' : ''}${val.toFixed(1)}%</td>`;
        } else {
          html += `<td class="heatmap-empty">—</td>`;
        }
      });

      html += `<td class="heatmap-total ${totCls}" style="${totStyle}">${totFmt}</td></tr>`;
    });

    html += `<tr class="heatmap-avg-row"><td class="heatmap-year" style="color: #38bdf8;">Snitt</td>`;
    months.forEach(m => {
      const vals = years.map(y => matrix[y] ? matrix[y][m] : undefined).filter(v => v !== undefined);
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const bg = getHeatColor(avg);
        const cls = avg > 0 ? 'text-emerald font-bold' : (avg < 0 ? 'text-rose font-bold' : '');
        html += `<td style="background: ${bg};" class="${cls}" title="Historisk gj.snitt for ${monthNames[m - 1]}: ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%">${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%</td>`;
      } else {
        html += `<td class="heatmap-empty">—</td>`;
      }
    });

    const yearTotals = years.map(y => matrix[y]?.total).filter(v => v !== undefined);
    const avgYear = yearTotals.length ? yearTotals.reduce((a, b) => a + b, 0) / yearTotals.length : null;
    html += `<td class="heatmap-total ${avgYear >= 0 ? 'text-emerald' : 'text-rose'}" style="background: ${getHeatColor(avgYear)};">${avgYear !== null ? `${avgYear >= 0 ? '+' : ''}${avgYear.toFixed(1)}%` : '—'}</td></tr>`;

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // =========================================================================
  // Multi-ETF Sammenligningsmodus (Flytende Dock & Normalisert Chart)
  // =========================================================================
  function updateCompareDock() {
    const dock = document.getElementById('compare-floating-dock');
    const badge = document.getElementById('dock-count-badge');
    const chips = document.getElementById('dock-chips');
    const btnClear = document.getElementById('btn-clear-compare');
    const btnLaunch = document.getElementById('btn-launch-compare');

    if (!dock) return;

    const count = selectedCompareISINs.size;
    if (count === 0) {
      dock.style.display = 'none';
      return;
    }

    dock.style.display = 'block';
    if (badge) badge.textContent = count;

    if (chips) {
      chips.innerHTML = '';
      selectedCompareISINs.forEach(isin => {
        const item = rawData.find(d => d.ISIN === isin);
        const name = item ? (item.Kortnavn || item.ISIN.slice(0, 8)) : isin;
        const chip = document.createElement('span');
        chip.className = 'dock-chip';
        chip.innerHTML = `<span>${name}</span><span class="dock-chip-close" data-isin="${isin}">&times;</span>`;
        chips.appendChild(chip);

        chip.querySelector('.dock-chip-close').addEventListener('click', (e) => {
          e.stopPropagation();
          selectedCompareISINs.delete(isin);
          updateCompareDock();
          const rowCheck = document.querySelector(`.etf-row-check[data-isin="${isin}"]`);
          if (rowCheck) rowCheck.checked = false;
        });
      });
    }

    if (btnClear) {
      btnClear.onclick = () => {
        selectedCompareISINs.clear();
        updateCompareDock();
        document.querySelectorAll('.etf-row-check').forEach(cb => { cb.checked = false; });
      };
    }

    if (btnLaunch) {
      btnLaunch.onclick = () => {
        openComparisonStudio(Array.from(selectedCompareISINs));
      };
    }
  }

  async function openComparisonStudio(isinList) {
    if (!isinList || !isinList.length) return;

    const elModal = document.getElementById('etf-chart-modal');
    if (elModal) elModal.style.display = 'flex';

    csState.isComparisonMode = true;
    csState.comparisonISINs = isinList;
    csState.timeRange = '3Y';
    csState.showBenchmark = false;
    csState.subIndicator = null;
    csState.activeTab = 'graph';

    const tabGraph = document.getElementById('tab-btn-graph');
    const tabHeatmap = document.getElementById('tab-btn-heatmap');
    if (tabGraph) tabGraph.classList.add('active');
    if (tabHeatmap) tabHeatmap.classList.remove('active');

    const mainContainer = document.getElementById('chart-container-main');
    const subContainer = document.getElementById('chart-container-sub');
    const heatContainer = document.getElementById('chart-heatmap-container');
    const liveLegend = document.getElementById('chart-live-legend');
    const chartToolbar = document.querySelector('.chart-studio-toolbar');

    if (heatContainer) heatContainer.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    if (subContainer) subContainer.style.display = 'none';
    if (liveLegend) liveLegend.style.display = 'flex';
    if (chartToolbar) chartToolbar.style.display = 'flex';

    document.getElementById('chart-modal-ticker').textContent = 'SAMMENLIGNING';
    document.getElementById('chart-modal-isin').textContent = `${isinList.length} FOND VALGT`;
    document.getElementById('chart-modal-cat').textContent = 'Relativ Avkastning (Normalisert til 0%)';

    const fundNames = isinList.map(isin => {
      const item = rawData.find(d => d.ISIN === isin);
      return item ? (item.Kortnavn || item.ISIN) : isin;
    });
    document.getElementById('chart-modal-title').textContent = fundNames.join('  vs.  ');

    document.getElementById('chart-stat-price').textContent = `${isinList.length} fond`;
    document.getElementById('chart-stat-change').textContent = 'Normalisert %';
    document.getElementById('chart-stat-52w').textContent = 'Felles start';

    const elEmpty = document.getElementById('chart-empty-state');
    if (elEmpty) elEmpty.style.display = 'none';

    const colorPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
    const fetchPromises = isinList.map(async (isin) => {
      const item = rawData.find(d => d.ISIN === isin) || { ISIN: isin };
      let data = null;
      try {
        const res = await fetch(`./prices/${isin}.json`);
        if (res.ok) {
          const payload = await res.json();
          data = payload.data || payload;
        }
      } catch (e) {}

      if (!data && item.Kortnavn) {
        try {
          const res = await fetch(`./prices/${item.Kortnavn}.json`);
          if (res.ok) {
            const payload = await res.json();
            data = payload.data || payload;
          }
        } catch (e) {}
      }

      return { isin, item, data };
    });

    const results = await Promise.all(fetchPromises);
    const validResults = results.filter(r => r.data && r.data.length);

    if (!validResults.length) {
      showEmptyState(rawData.find(d => d.ISIN === isinList[0]) || { ISIN: isinList[0] });
      return;
    }

    csState.rawPriceData = validResults[0].data;
    csState.item = validResults[0].item;

    destroyCharts();

    if (!mainContainer || typeof LightweightCharts === 'undefined') return;

    csState.mainChart = LightweightCharts.createChart(mainContainer, {
      width: mainContainer.clientWidth,
      height: mainContainer.clientHeight || 360,
      layout: {
        background: { type: 'solid', color: '#080c14' },
        textColor: '#94a3b8',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Plus Jakarta Sans', monospace"
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#6366f1', width: 1, style: 3 },
        horzLine: { color: '#6366f1', width: 1, style: 3 }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }
    });

    csState.compareSeriesMap = {};

    validResults.forEach((res, idx) => {
      const color = colorPalette[idx % colorPalette.length];
      const ticker = res.item.Kortnavn || res.isin;
      const filtered = filterByTimeRange(res.data, csState.timeRange);
      const normalized = normalizeToPct(filtered);

      const series = csState.mainChart.addSeries(LightweightCharts.LineSeries, {
        color: color,
        lineWidth: 2,
        title: ticker,
        priceFormat: { type: 'custom', formatter: (p) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` }
      });
      series.setData(normalized);

      csState.compareSeriesMap[res.isin] = {
        series,
        color,
        ticker,
        name: res.item.Navn_Morningstar || ticker
      };
    });

    // 0%-linje
    const firstSeries = Object.values(csState.compareSeriesMap)[0]?.series;
    if (firstSeries) {
      const zeroLine = firstSeries.createPriceLine({
        price: 0,
        color: 'rgba(255, 255, 255, 0.25)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        title: '0.0%'
      });
      csState.priceLines.push(zeroLine);
    }

    // Oppdater live legend
    csState.mainChart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) return;

      const items = Object.entries(csState.compareSeriesMap).map(([isin, info]) => {
        const val = param.seriesData.get(info.series);
        const p = val && val.value !== undefined ? val.value : (val && val.close !== undefined ? val.close : null);
        const pStr = p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : '—';
        return `<span class="legend-item" style="color: ${info.color}; font-weight: 600;">${info.ticker}: <strong>${pStr}</strong></span>`;
      });

      const leg = document.getElementById('chart-live-legend');
      if (leg) {
        leg.innerHTML = `<span class="legend-item"><strong id="leg-date">${param.time}</strong></span>` + items.join(' ');
      }
    });

    csState.mainChart.timeScale().fitContent();
  }

  // Start init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
