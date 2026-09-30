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

  function safeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

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

  // Taktisk markedstilstand & Porteføljestudio
  let hideGeared = true; // Skjul 2x/3x/Bull/Bear som standard
  let activeTrendPreset = null; // 'above_sma200' | 'golden_cross' | 'near_ath' | 'dip_buyer'
  let compareLoadedData = []; // Lagrer innlastede kursrekker for sammenligning/korrelasjon
  let portfolioWeights = {}; // ISIN -> vekt %

  function isGearedOrDerivative(item) {
    if (!item) return false;
    const cat = ((item.Kategori_Morningstar || '') + ' ' + (item.Nordnet_Kategori || '')).toLowerCase();
    if (cat.includes('trading tools') || cat.includes('options trading')) return true;
    const name = ((item.Navn_Morningstar || '') + ' ' + (item.Navn_Fil || '')).toLowerCase();
    if (/\b(bull|bear|inverse|leveraged|lvrgd|2x|3x|-1x|-2x|-3x)\b|\(2x\)|\(3x\)/i.test(name)) return true;
    if (/\b(daily short|shortdax|shdly|short swap|2x short)\b/i.test(name)) return true;
    return false;
  }

  // Dynamiske filterregler (standard er ingen aktive filtre, brukeren kan legge til ved behov)
  let filterRules = [];

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

    renderMarketBreadth();

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

    // Setup Egen Portefølje seksjon & Hovednavigasjon
    initUserPortfolioSection();
    initAppNavigation();

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
            item.Last_Price = entry.last_price;
          }
        });
        updateUserPortfolioPrices();
        renderMarketBreadth();
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
    if (filterRules.length === 0) {
      elFilterRows.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.35rem 0.2rem; font-style: italic;">Ingen aktive filterregler. Klikk «+ Legg til ekstra filter» over for å sette egne grenser for avkastning, Sharpe, volatilitet osv.</div>';
      return;
    }
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
      activeTrendPreset = null;
      document.querySelectorAll('.preset-pill-trend').forEach(btn => btn.classList.remove('active'));
      filterRules = [];
      renderFilterBuilder();
      applyFilters();
    });

    // Preset pills (Fundamentalt & Trend)
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        if (pill.dataset.action === 'toggle-geared') return;
        applyPreset(pill.dataset.preset);
      });
    });

    // Toggle for gearede/derivat-fond
    const btnToggleGeared = document.getElementById('btn-toggle-geared');
    if (btnToggleGeared) {
      btnToggleGeared.addEventListener('click', () => {
        hideGeared = !hideGeared;
        btnToggleGeared.classList.toggle('active', hideGeared);
        btnToggleGeared.textContent = hideGeared ? '🛡️ Skjuler gearede fond (46)' : '⚠️ Viser alle (inkl. gearede)';
        applyFilters();
      });
    }

    // Breadth barometer hurtigfilter
    const btnBreadthFilter = document.getElementById('btn-breadth-filter-uptrend');
    if (btnBreadthFilter) {
      btnBreadthFilter.addEventListener('click', () => {
        applyPreset('above_sma200');
      });
    }

    // Delta modal (Siste trendskifter)
    const btnOpenDelta = document.getElementById('btn-open-delta-modal');
    const elDeltaModal = document.getElementById('delta-modal');
    const btnCloseDelta = document.getElementById('delta-modal-close-btn');

    if (btnOpenDelta && elDeltaModal) {
      btnOpenDelta.addEventListener('click', () => {
        renderDeltaModal();
        elDeltaModal.style.display = 'flex';
      });
    }
    if (btnCloseDelta && elDeltaModal) {
      btnCloseDelta.addEventListener('click', () => {
        elDeltaModal.style.display = 'none';
      });
    }
    if (elDeltaModal) {
      elDeltaModal.addEventListener('click', (e) => {
        if (e.target === elDeltaModal) elDeltaModal.style.display = 'none';
      });
    }

    // Delta modal fane-bytte
    document.querySelectorAll('.delta-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.delta-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.delta-pane').forEach(p => p.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.dtab);
        if (target) target.style.display = 'block';
      });
    });

    // Factsheet print-knapp i fond-modal
    const btnPrintFactsheet = document.getElementById('modal-print-factsheet-btn');
    if (btnPrintFactsheet) {
      btnPrintFactsheet.addEventListener('click', () => {
        window.print();
      });
    }

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
    const trendPresets = ['above_sma200', 'golden_cross', 'near_ath', 'dip_buyer'];
    if (trendPresets.includes(preset)) {
      if (activeTrendPreset === preset) {
        activeTrendPreset = null; // Toggle av hvis allerede aktiv
      } else {
        activeTrendPreset = preset;
      }
      document.querySelectorAll('.preset-pill-trend').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === activeTrendPreset);
      });
      applyFilters();
      return;
    }

    if (preset === 'sharpe_high') {
      filterRules = [
        { field: 'Sharpe_3Y', op: 'gte', value: '1.0' },
      ];
    } else if (preset === 'return_15') {
      filterRules = [
        { field: 'Avkastning_12M_%', op: 'gte', value: '15' },
      ];
    } else if (preset === 'stddev_low') {
      filterRules = [
        { field: 'Standardavvik_3Y_%', op: 'lte', value: '12' },
        { field: 'Sharpe_3Y', op: 'gte', value: '0.8' },
      ];
    } else if (preset === 'drawdown_safe') {
      filterRules = [
        { field: 'Max_Drawdown_3Y_%', op: 'gte', value: '-15' },
        { field: 'Avkastning_12M_%', op: 'gte', value: '5' },
      ];
    } else if (preset === 'low_fee') {
      filterRules = [
        { field: 'Aarlig_Avgift_%', op: 'lte', value: '0.20' },
      ];
    } else if (preset === 'large_aum') {
      filterRules = [
        { field: 'AUM_Verdi', op: 'gte', value: '1000000000' },
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
      // 0. Skjul gearede og derivat-produkter hvis aktivert
      if (hideGeared && isGearedOrDerivative(item)) {
        return false;
      }

      // 0b. Taktiske trendfiltre
      if (activeTrendPreset === 'above_sma200' && item.Above_SMA200 !== true) {
        return false;
      }
      if (activeTrendPreset === 'golden_cross' && (item.Above_SMA200 !== true || item.Above_SMA50 !== true)) {
        return false;
      }
      if (activeTrendPreset === 'near_ath') {
        const pct = item.Pct_ATH !== undefined && item.Pct_ATH !== null ? parseFloat(item.Pct_ATH) : null;
        if (pct === null || isNaN(pct) || pct < -3.0) return false;
      }
      if (activeTrendPreset === 'dip_buyer') {
        const pct = item.Pct_ATH !== undefined && item.Pct_ATH !== null ? parseFloat(item.Pct_ATH) : null;
        if (item.Above_SMA200 !== true || pct === null || isNaN(pct) || pct > -4.0 || pct < -18.0) return false;
      }

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

    const fmtNum = (val, dec = 2, suffix = '', item = null, key = '') => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      const num = parseFloat(val);
      let extraCls = '';
      let titleAttr = '';
      if ((key === 'Beta_1Y' || key === 'Beta_3Y' || key === 'Beta_5Y' || key.includes('Alpha')) && item) {
        const r2 = parseFloat(item.R2_3Y);
        if (!isNaN(r2) && (r2 < 0.50 || (r2 < 50 && r2 > 1.0))) {
          extraCls = 'r2-low-warning';
          titleAttr = ` title="Lav R² (${r2}) mot indeks – Beta og Alpha har lav forklaringskraft"`;
        }
      }
      return `<span class="${extraCls}"${titleAttr}>${num.toFixed(dec)}${suffix}</span>`;
    };

    const fmtAUM = (val) => {
      if (!val || isNaN(val)) return '<span class="text-muted">—</span>';
      const num = parseFloat(val);
      if (num >= 1e9) return (num / 1e9).toFixed(1) + ' mrd';
      if (num >= 1e6) return (num / 1e6).toFixed(0) + ' mill';
      return num.toLocaleString('no-NO');
    };

    const fmtSharpe = (val, item = null, key = '') => {
      if (val === null || val === undefined || isNaN(val) || val === '') return '<span class="text-muted">—</span>';
      const s = parseFloat(val);
      const cls = s >= 1.0 ? 'text-indigo font-bold' : (s < 0 ? 'text-rose' : '');
      const isShort = (key === 'Sharpe_3Y' || key === 'Sharpe_5Y') && item && item.Beregnet_Antall_Dager && item.Beregnet_Antall_Dager < 750;
      return `<span class="${cls}">${s.toFixed(2)}</span>${isShort ? `<span class="badge-short-hist" title="Merk: Fondet har kun ${item.Beregnet_Antall_Dager} dagers historikk (&lt; 3 år)">⚠️</span>` : ''}`;
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
          rowHtml += `<td class="col-num">${fmtSharpe(val, item, col.key)}</td>`;
        } else if (col.type === 'dd') {
          rowHtml += `<td class="col-num">${fmtDD(val)}</td>`;
        } else if (col.type === 'aum') {
          rowHtml += `<td class="col-num">${fmtAUM(val)}</td>`;
        } else if (col.type === 'num') {
          rowHtml += `<td class="col-num">${fmtNum(val, 2, col.suffix || '', item, col.key)}</td>`;
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
  const DEFAULT_GEMINI_API_KEY = 'AIzaSyA9NKNCVSG_jz91sGSmLONMZJ9Gem2stII';
  let activeAiModel = localStorage.getItem('etf_ai_model') || 'fast'; // 'fast' or 'smart'
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

    // 1. Unnslipp rå HTML-tegn
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Skjul og ta vare på flerlinjers kodeblokker ```...```
    const codeBlocks = [];
    escaped = escaped.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
      const placeholder = `___CODEBLOCK_${codeBlocks.length}___`;
      codeBlocks.push(`<pre class="ai-code-block"><code>${code.trim()}</code></pre>`);
      return placeholder;
    });

    // 3. Inline-kode `kode`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4. Fet og kursiv
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    escaped = escaped.replace(/(^|[^\*])\*([^\*]+?)\*([^\*]|$)/g, '$1<em>$2</em>$3');
    escaped = escaped.replace(/(^|[^_])_([^_]+?)_([^_]|$)/g, '$1<em>$2</em>$3');

    // 5. Linjebasert parsing for overskrifter, lister, tabeller, hr og avsnitt
    const lines = escaped.split('\n');
    let inList = false;
    let listType = 'ul';
    let inTable = false;
    let tableHtml = '';
    const output = [];

    const closeList = () => {
      if (inList) {
        output.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
    };

    const closeTable = () => {
      if (inTable) {
        output.push(`<table>${tableHtml}</tbody></table>`);
        tableHtml = '';
        inTable = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        closeList();
        closeTable();
        continue;
      }

      // Horisontal linje (--- eller ***)
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeList();
        closeTable();
        output.push('<hr>');
        continue;
      }

      // Overskrifter (#, ##, ###, ####, #####, ######)
      if (/^######\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h6>${trimmed.replace(/^######\s+/, '')}</h6>`);
        continue;
      }
      if (/^#####\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h5>${trimmed.replace(/^#####\s+/, '')}</h5>`);
        continue;
      }
      if (/^####\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h4>${trimmed.replace(/^####\s+/, '')}</h4>`);
        continue;
      }
      if (/^###\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h3>${trimmed.replace(/^###\s+/, '')}</h3>`);
        continue;
      }
      if (/^##\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h2>${trimmed.replace(/^##\s+/, '')}</h2>`);
        continue;
      }
      if (/^#\s+(.*)/.test(trimmed)) {
        closeList();
        closeTable();
        output.push(`<h2>${trimmed.replace(/^#\s+/, '')}</h2>`);
        continue;
      }

      // Tabeller (| Kolonne 1 | Kolonne 2 |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        closeList();
        const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
        const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
        if (isSeparator) {
          continue;
        }
        if (!inTable) {
          inTable = true;
          tableHtml = '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
        continue;
      } else {
        closeTable();
      }

      // Lister
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        if (!inList || listType !== 'ul') {
          closeList();
          output.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        output.push(`<li>${trimmed.substring(2)}</li>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== 'ol') {
          closeList();
          output.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        output.push(`<li>${trimmed.replace(/^\d+\.\s+/, '')}</li>`);
        continue;
      }

      closeList();

      // Vanlig tekst-avsnitt
      output.push(`<p>${trimmed}</p>`);
    }

    closeList();
    closeTable();

    let finalHtml = output.join('');

    // Sett inn igjen flerlinjers kodeblokker
    codeBlocks.forEach((block, idx) => {
      finalHtml = finalHtml.replace(`___CODEBLOCK_${idx}___`, block);
    });

    return finalHtml;
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

    // Samle dyp og helhetlig kontekst for prompten
    let contextPrompt = 'KONTEKST FRA ETF ANALYTICS PRO:\n';

    // 1. Brukerens Aktive Portefølje (Portefølje-Studio)
    const activePort = typeof getActivePortfolio === 'function' ? getActivePortfolio() : { holdings: userPortfolioHoldings, name: 'Portefølje 1' };
    const portHoldings = (activePort && activePort.holdings) ? activePort.holdings : (userPortfolioHoldings || []);
    if (portHoldings && portHoldings.length > 0) {
      const totalPortVal = portHoldings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;
      const portDetails = portHoldings.map(h => {
        const w = Math.round(((h.computedValue || 0) / totalPortVal) * 100);
        return {
          Ticker: h.ticker,
          ISIN: h.isin,
          Navn: h.name,
          Andel_Prosent: `${w}%`,
          Investering: h.unit === 'shares'
            ? `${h.rawValue} andeler (${Math.round(h.computedValue).toLocaleString('no-NO')} kr)`
            : `${Math.round(h.rawValue).toLocaleString('no-NO')} kr`
        };
      });

      contextPrompt += `=== BRUKERENS AKTIVE PORTEFØLJE: "${activePort.name || 'Portefølje 1'}" (I Portefølje-Studio) ===\n`;
      contextPrompt += `Total beregnet verdi: ${Math.round(totalPortVal).toLocaleString('no-NO')} kr\n`;
      contextPrompt += `Antall fond: ${portHoldings.length}\n`;
      contextPrompt += `Fondssammensetning og vekting:\n` + JSON.stringify(portDetails, null, 2) + `\n`;

      if (activePort.criteria) {
        const c = activePort.criteria;
        const riskLabel = c.risk === 'conservative' ? 'Defensiv / Kapitalbevaring' : (c.risk === 'aggressive' ? 'Offensiv / Maksimal vekst' : 'Balansert (Vekst & Beskyttelse)');
        contextPrompt += `Definert risikoprofil & strategi:\n`;
        contextPrompt += `- Målsetning: ${riskLabel}\n`;
        if (c.maxSector) contextPrompt += `- Mandatregel: Maks 25 % eksponering mot én enkelt sektor\n`;
        if (c.globalGeo) contextPrompt += `- Mandatregel: Global diversifisering (Maks 50 % i USA/enkeltregion)\n`;
        if (c.maxDrawdown) contextPrompt += `- Mandatregel: Maks 15 % historisk drawdown (3Y)\n`;
        if (c.minSharpe) contextPrompt += `- Mandatregel: Krav om samlet Sharpe Ratio ≥ 1.0\n`;
        if (c.maxFee) contextPrompt += `- Mandatregel: Kostnadskontroll (Vektet årlig avgift < 0,25 %)\n`;
        if (c.customNotes && c.customNotes.trim()) {
          contextPrompt += `- Brukerens egne faste strategi-regler: "${c.customNotes.trim()}"\n`;
        }
      }

      // Sjekk om det er beregnet tall i Studio
      const studioCagr = document.getElementById('studio-port-cagr');
      const studioSharpe = document.getElementById('studio-port-sharpe');
      const studioVol = document.getElementById('studio-port-vol');
      const studioMaxDD = document.getElementById('studio-port-maxdd');
      const studioFee = document.getElementById('studio-port-fee');
      if (studioSharpe && studioSharpe.textContent !== '—') {
        contextPrompt += `Beregnet statistikk for porteføljen:\n`;
        contextPrompt += `- Historisk vekst (CAGR): ${studioCagr ? studioCagr.textContent : '—'}\n`;
        contextPrompt += `- Portefølje Sharpe (3Y): ${studioSharpe.textContent}\n`;
        contextPrompt += `- Årlig volatilitet: ${studioVol ? studioVol.textContent : '—'}\n`;
        contextPrompt += `- Maksimal Drawdown: ${studioMaxDD ? studioMaxDD.textContent : '—'}\n`;
        contextPrompt += `- Vektet årlig avgift: ${studioFee ? studioFee.textContent : '—'}\n`;
      }
      contextPrompt += `\n`;
    } else {
      contextPrompt += `Brukeren har foreløpig ikke lagt inn fond i den aktive porteføljen i Portefølje-Studio.\n\n`;
    }

    // 2. Markedsbredde & Taktisk Regime akkurat nå
    const elTotVal = document.getElementById('breadth-val-total');
    const elRegime = document.getElementById('breadth-regime-label');
    const elEqVal = document.getElementById('breadth-val-equity');
    const elBndVal = document.getElementById('breadth-val-bonds');
    const elCommVal = document.getElementById('breadth-val-comm');
    if (elTotVal) {
      contextPrompt += `=== AKTUELT MARKEDSBREDDE & TAKTISK REGIME PÅ SKJERMEN ===\n`;
      contextPrompt += `- Totalt Marked over SMA 200: ${elTotVal.textContent} (${elRegime ? elRegime.textContent.trim() : ''})\n`;
      contextPrompt += `- Aksjer over SMA 200: ${elEqVal ? elEqVal.textContent : '—'}\n`;
      contextPrompt += `- Renter over SMA 200: ${elBndVal ? elBndVal.textContent : '—'}\n`;
      contextPrompt += `- Råvarer over SMA 200: ${elCommVal ? elCommVal.textContent : '—'}\n\n`;
    }

    // 3. Valgte fond i tabellen (sammenligningsdokk)
    if (selectedCompareISINs && selectedCompareISINs.size > 0) {
      const compFunds = Array.from(selectedCompareISINs).map(isin => {
        const item = rawData.find(d => d.ISIN === isin);
        return item ? `${item.Kortnavn || isin} (${item.Navn_Morningstar || item.Navn_Fil || isin})` : isin;
      });
      contextPrompt += `Brukeren har valgt disse ${compFunds.length} fondene til sammenligning: ${compFunds.join(', ')}\n\n`;
    }

    // 4. Aktivt inspisert fond (hvis åpent)
    if (currentlyInspectedItem) {
      contextPrompt += `Brukeren undersøker for øyeblikket dette spesifikke fondet i detalj:\n`;
      contextPrompt += JSON.stringify({
        ISIN: currentlyInspectedItem.ISIN,
        Ticker: currentlyInspectedItem.Kortnavn,
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
        AUM: currentlyInspectedItem.AUM_Verdi,
        Antall_Beholdninger: currentlyInspectedItem.Antall_Beholdninger,
        'Topp_10_Vekt_%': currentlyInspectedItem['Topp_10_Vekt_%']
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
Du har full innsikt i brukerens faktiske portefølje (hvis lagt inn), markedsbredden og alle 2 238 ETF-ene i databasen.
Bruk konkrete tall (Sharpe 1-5Y, Beta 1-5Y, Alpha 1-5Y, Max Drawdown 1-5Y, Sortino og årlige avgifter) for å underbygge resonnementene dine.
Når brukeren ber om råd, porteføljeanalyse eller lavere risiko/diversifisering, skal du henvise direkte til deres faktiske fond og foreslå konkrete UCITS ETF-er med ISIN og ticker for å forbedre risikojustert avkastning. Vær konsis og strukturer svaret med kulepunkter.`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${contextPrompt}\nBrukerens spørsmål: ${text}` }]
      }
    ];

    const primaryModel = activeAiModel === 'smart' ? 'gemini-flash-latest' : 'gemini-3.5-flash';
    const fallbackModel = activeAiModel === 'smart' ? 'gemini-3.5-flash' : 'gemini-flash-latest';

    async function callModel(modelName) {
      return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
    }

    try {
      let res = await callModel(primaryModel);
      let usedFallback = false;

      if (!res.ok) {
        console.warn(`Primærmodell ${primaryModel} feilet med HTTP ${res.status}. Forsøker reservemodell ${fallbackModel}...`);
        try {
          const fallbackRes = await callModel(fallbackModel);
          if (fallbackRes.ok) {
            res = fallbackRes;
            usedFallback = true;
          }
        } catch (fbErr) {}
      }

      hideTypingIndicator();

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        appendAiMessage('model', `Beklager, det oppstod en feil ved kontakt med Gemini API: ${errMsg}. Sjekk API-nøkkelen i innstillinger (⚙️).`);
        return;
      }

      const data = await res.json();
      let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Fikk ikke noe tekstsvar fra modellen.';
      if (usedFallback) {
        reply = `*(Merk: Svarte via reservemodell da primærmodellen opplevde midlertidig ventetid)*\n\n` + reply;
      }
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
    const elFullscreenBtn = document.getElementById('ai-fullscreen-btn');
    const elAiPanel = document.getElementById('ai-chat-panel');
    const elSendBtn = document.getElementById('ai-send-btn');
    const elUserInput = document.getElementById('ai-user-input');
    const elSettingsBtn = document.getElementById('ai-settings-btn');
    const elSettingsPane = document.getElementById('ai-settings-pane');
    const elApiKeyInput = document.getElementById('ai-api-key-input');
    const elSaveKeyBtn = document.getElementById('ai-save-key-btn');
    const elClearBtn = document.getElementById('ai-clear-btn');
    const elModalAskAi = document.getElementById('modal-ask-ai-btn');

    // Fullskjerm-toggle for AI Fondsrådgiver
    if (elFullscreenBtn && elAiPanel) {
      elFullscreenBtn.addEventListener('click', () => {
        const isFull = elAiPanel.classList.toggle('ai-panel-fullscreen');
        elFullscreenBtn.innerHTML = isFull ? '🗗' : '⛶';
        elFullscreenBtn.title = isFull ? 'Gjenopprett normal størrelse' : 'Utvid til fullskjerm';
      });
    }

    // Modell-velger: Rask & Smart vs Litt tregere & smartere
    const btnModelFast = document.getElementById('btn-model-fast');
    const btnModelSmart = document.getElementById('btn-model-smart');
    if (btnModelFast && btnModelSmart) {
      if (activeAiModel === 'smart') {
        btnModelSmart.classList.add('active');
        btnModelFast.classList.remove('active');
      } else {
        btnModelFast.classList.add('active');
        btnModelSmart.classList.remove('active');
      }

      btnModelFast.addEventListener('click', () => {
        activeAiModel = 'fast';
        localStorage.setItem('etf_ai_model', 'fast');
        btnModelFast.classList.add('active');
        btnModelSmart.classList.remove('active');
      });

      btnModelSmart.addEventListener('click', () => {
        activeAiModel = 'smart';
        localStorage.setItem('etf_ai_model', 'smart');
        btnModelSmart.classList.add('active');
        btnModelFast.classList.remove('active');
      });
    }

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
      elCloseBtn.addEventListener('click', () => {
        if (elAiPanel) elAiPanel.classList.remove('ai-panel-fullscreen');
        if (elFullscreenBtn) {
          elFullscreenBtn.innerHTML = '⛶';
          elFullscreenBtn.title = 'Utvid til fullskjerm';
        }
        closeAiChat();
      });
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
    const tabCorrelation = document.getElementById('tab-btn-correlation');
    const tabPortfolio = document.getElementById('tab-btn-portfolio');
    const mainContainer = document.getElementById('chart-container-main');
    const subContainer = document.getElementById('chart-container-sub');
    const heatContainer = document.getElementById('chart-heatmap-container');
    const corrContainer = document.getElementById('chart-correlation-container');
    const portContainer = document.getElementById('chart-portfolio-container');
    const liveLegend = document.getElementById('chart-live-legend');
    const chartToolbar = document.querySelector('.chart-studio-toolbar');

    // Fane-bytte i Studio (Kurs & Analyse, Månedsmatrise, Korrelasjon, Portefølje)
    window.switchStudioTab = function(tabName) {
      csState.activeTab = tabName;
      [tabGraph, tabHeatmap, tabCorrelation, tabPortfolio].forEach(b => {
        if (b) b.classList.toggle('active', b.id === `tab-btn-${tabName}`);
      });

      if (mainContainer) mainContainer.style.display = tabName === 'graph' ? 'block' : 'none';
      if (subContainer) subContainer.style.display = (tabName === 'graph' && csState.subIndicator) ? 'block' : 'none';
      if (liveLegend) liveLegend.style.display = tabName === 'graph' ? 'flex' : 'none';
      if (chartToolbar) chartToolbar.style.display = tabName === 'graph' ? 'flex' : 'none';

      if (heatContainer) heatContainer.style.display = tabName === 'heatmap' ? 'flex' : 'none';
      if (corrContainer) corrContainer.style.display = tabName === 'correlation' ? 'block' : 'none';
      if (portContainer) portContainer.style.display = tabName === 'portfolio' ? 'block' : 'none';

      if (tabName === 'graph') {
        if (csState.isComparisonMode && !csState.mainChart && compareLoadedData && compareLoadedData.length) {
          renderComparisonChart(compareLoadedData);
        }
        setTimeout(resizeCharts, 30);
      } else if (tabName === 'heatmap') {
        renderMonthlyHeatmap(csState.item, csState.rawPriceData);
      } else if (tabName === 'correlation') {
        renderCorrelationMatrix(compareLoadedData);
      } else if (tabName === 'portfolio') {
        renderPortfolioStudio(compareLoadedData);
        if (portfolioChartInstance) {
          setTimeout(() => {
            const chartContainer = document.getElementById('portfolio-equity-chart');
            if (chartContainer && portfolioChartInstance) {
              portfolioChartInstance.resize(chartContainer.clientWidth, 260);
              portfolioChartInstance.timeScale().fitContent();
            }
          }, 50);
        }
      }
    };

    if (tabGraph) tabGraph.addEventListener('click', () => switchStudioTab('graph'));
    if (tabHeatmap) tabHeatmap.addEventListener('click', () => switchStudioTab('heatmap'));
    if (tabCorrelation) tabCorrelation.addEventListener('click', () => switchStudioTab('correlation'));
    if (tabPortfolio) tabPortfolio.addEventListener('click', () => switchStudioTab('portfolio'));

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
    const portContainer = document.getElementById('portfolio-equity-chart');
    if (portfolioChartInstance && portContainer && portContainer.clientWidth) {
      portfolioChartInstance.applyOptions({
        width: portContainer.clientWidth,
        height: 260
      });
      portfolioChartInstance.timeScale().fitContent();
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
    if (portfolioChartInstance) {
      try { portfolioChartInstance.remove(); } catch (e) {}
      portfolioChartInstance = null;
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
    const tabCorr = document.getElementById('tab-btn-correlation');
    const tabPort = document.getElementById('tab-btn-portfolio');

    const corrContainer = document.getElementById('chart-correlation-container');
    const portContainer = document.getElementById('chart-portfolio-container');
    if (corrContainer) corrContainer.style.display = 'none';
    if (portContainer) portContainer.style.display = 'none';

    if (tabCorr) tabCorr.style.display = 'none';
    if (tabPort) tabPort.style.display = 'none';
    if (csState.activeTab === 'correlation' || csState.activeTab === 'portfolio') {
      csState.activeTab = 'graph';
    }

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

    const btnLaunchCorr = document.getElementById('btn-launch-correlation');
    const btnLaunchPort = document.getElementById('btn-launch-portfolio');

    if (btnLaunch) {
      btnLaunch.onclick = () => {
        openComparisonStudio(Array.from(selectedCompareISINs), 'graph');
      };
    }
    if (btnLaunchCorr) {
      btnLaunchCorr.onclick = () => {
        openComparisonStudio(Array.from(selectedCompareISINs), 'correlation');
      };
    }
    if (btnLaunchPort) {
      btnLaunchPort.onclick = () => {
        openComparisonStudio(Array.from(selectedCompareISINs), 'portfolio');
      };
    }
  }

  async function openComparisonStudio(isinList, initialTab = 'graph') {
    if (!isinList || !isinList.length) return;

    const elModal = document.getElementById('etf-chart-modal');
    if (elModal) elModal.style.display = 'flex';

    csState.isComparisonMode = true;
    csState.comparisonISINs = isinList;
    csState.timeRange = '3Y';
    csState.showBenchmark = false;
    csState.subIndicator = null;
    csState.activeTab = initialTab;

    const tabGraph = document.getElementById('tab-btn-graph');
    const tabHeatmap = document.getElementById('tab-btn-heatmap');
    const tabCorr = document.getElementById('tab-btn-correlation');
    const tabPort = document.getElementById('tab-btn-portfolio');
    if (tabGraph) tabGraph.classList.toggle('active', initialTab === 'graph');
    if (tabHeatmap) tabHeatmap.classList.remove('active');
    if (tabCorr) {
      tabCorr.style.display = 'inline-flex';
      tabCorr.classList.toggle('active', initialTab === 'correlation');
    }
    if (tabPort) {
      tabPort.style.display = 'inline-flex';
      tabPort.classList.toggle('active', initialTab === 'portfolio');
    }

    const mainContainer = document.getElementById('chart-container-main');
    const subContainer = document.getElementById('chart-container-sub');
    const heatContainer = document.getElementById('chart-heatmap-container');
    const corrContainer = document.getElementById('chart-correlation-container');
    const portContainer = document.getElementById('chart-portfolio-container');
    const liveLegend = document.getElementById('chart-live-legend');
    const chartToolbar = document.querySelector('.chart-studio-toolbar');

    if (heatContainer) heatContainer.style.display = 'none';
    if (mainContainer) mainContainer.style.display = initialTab === 'graph' ? 'block' : 'none';
    if (subContainer) subContainer.style.display = 'none';
    if (corrContainer) corrContainer.style.display = initialTab === 'correlation' ? 'block' : 'none';
    if (portContainer) portContainer.style.display = initialTab === 'portfolio' ? 'block' : 'none';
    if (liveLegend) liveLegend.style.display = initialTab === 'graph' ? 'flex' : 'none';
    if (chartToolbar) chartToolbar.style.display = initialTab === 'graph' ? 'flex' : 'none';

    document.getElementById('chart-modal-ticker').textContent = 'SAMMENLIGNING';
    document.getElementById('chart-modal-isin').textContent = `${isinList.length} FOND VALGT`;
    document.getElementById('chart-modal-cat').textContent = 'Relativ Avkastning / Korrelasjon / Portefølje';

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
    compareLoadedData = validResults;

    if (initialTab === 'correlation') {
      renderCorrelationMatrix(validResults);
    } else if (initialTab === 'portfolio') {
      renderPortfolioStudio(validResults);
    } else {
      renderComparisonChart(validResults);
    }
  }

  function renderComparisonChart(validResults) {
    if (!validResults || !validResults.length) return;
    destroyCharts();
    const mainContainer = document.getElementById('chart-container-main');
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
    const colorPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

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

  // ==========================================================================
  // Markedsbredde & Taktisk Regime Barometer
  // ==========================================================================
  function renderMarketBreadth() {
    let totKnown = 0, totAbove = 0;
    let eqKnown = 0, eqAbove = 0;
    let bndKnown = 0, bndAbove = 0;
    let commKnown = 0, commAbove = 0;

    rawData.forEach(item => {
      if (item.Above_SMA200 === undefined) return;
      totKnown++;
      if (item.Above_SMA200) totAbove++;

      const cat = (item.Kategori_Morningstar || item.Nordnet_Kategori || '').toLowerCase();
      if (cat.includes('equity') || cat.includes('aksj')) {
        eqKnown++;
        if (item.Above_SMA200) eqAbove++;
      } else if (cat.includes('fixed income') || cat.includes('bond') || cat.includes('rent')) {
        bndKnown++;
        if (item.Above_SMA200) bndAbove++;
      } else if (cat.includes('commodit') || cat.includes('råvar') || cat.includes('metal') || cat.includes('energy')) {
        commKnown++;
        if (item.Above_SMA200) commAbove++;
      }
    });

    const calcPct = (num, den) => den > 0 ? Math.round((num / den) * 100) : null;
    const totPct = calcPct(totAbove, totKnown);
    const eqPct = calcPct(eqAbove, eqKnown);
    const bndPct = calcPct(bndAbove, bndKnown);
    const commPct = calcPct(commAbove, commKnown);

    const elTotVal = document.getElementById('breadth-val-total');
    const elTotBar = document.getElementById('breadth-bar-total');
    const elRegime = document.getElementById('breadth-regime-label');

    if (totPct !== null) {
      if (elTotVal) elTotVal.textContent = `${totPct}% (${totAbove}/${totKnown})`;
      if (elTotBar) elTotBar.style.width = `${totPct}%`;
      if (elRegime) {
        if (totPct >= 65) {
          elRegime.innerHTML = '<span class="text-emerald font-bold">🟢 Bullish / Ekspansivt marked</span>';
        } else if (totPct >= 45) {
          elRegime.innerHTML = '<span class="text-amber font-bold">🟡 Nøytralt / Konsolidering</span>';
        } else {
          elRegime.innerHTML = '<span class="text-rose font-bold">🔴 Bearish / Korreksjonsregime</span>';
        }
      }
    }

    const setMeter = (valId, barId, pct, count, total) => {
      const elV = document.getElementById(valId);
      const elB = document.getElementById(barId);
      if (pct !== null) {
        if (elV) elV.textContent = `${pct}% (${count}/${total})`;
        if (elB) elB.style.width = `${pct}%`;
      }
    };

    setMeter('breadth-val-equity', 'breadth-bar-equity', eqPct, eqAbove, eqKnown);
    setMeter('breadth-val-bonds', 'breadth-bar-bonds', bndPct, bndAbove, bndKnown);
    setMeter('breadth-val-comm', 'breadth-bar-comm', commPct, commAbove, commKnown);
  }

  // ==========================================================================
  // Siste Trendskifter & Signalendringer (Delta Modal)
  // ==========================================================================
  function renderDeltaCard(item, badgeText, badgeClass) {
    const ticker = item.Kortnavn || item.ISIN;
    const name = item.Navn_Morningstar || item.Navn_Fil || ticker;
    const ret12 = (item['Avkastning_12M_%'] !== null && item['Avkastning_12M_%'] !== undefined && !isNaN(item['Avkastning_12M_%'])) ? `${parseFloat(item['Avkastning_12M_%']).toFixed(1)}%` : '—';
    const pctAth = (item.Pct_ATH !== undefined && item.Pct_ATH !== null && !isNaN(item.Pct_ATH)) ? `${item.Pct_ATH > 0 ? '+' : ''}${parseFloat(item.Pct_ATH).toFixed(1)}%` : '—';
    const retNum = parseFloat(ret12);
    const retCls = !isNaN(retNum) ? (retNum >= 0 ? 'text-emerald font-bold' : 'text-rose font-bold') : '';

    return `
      <div class="delta-card" data-isin="${item.ISIN}">
        <div class="delta-card-head">
          <span class="delta-card-ticker">${ticker}</span>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="delta-card-title" title="${name}">${name}</div>
        <div class="delta-card-stats">
          <span>12M: <strong class="${retCls}">${ret12}</strong></span>
          <span>Fra ATH: <strong style="color: #cbd5e1;">${pctAth}</strong></span>
        </div>
      </div>
    `;
  }

  function renderDeltaModal() {
    const listUptrend = document.getElementById('delta-uptrend-list');
    const listNearAth = document.getElementById('delta-nearath-list');
    const listDips = document.getElementById('delta-dips-list');

    // 1. Sterk opptrend: Above_SMA200 && Above_SMA50
    const uptrendItems = rawData
      .filter(d => !isGearedOrDerivative(d) && d.Above_SMA200 === true && d.Above_SMA50 === true)
      .sort((a, b) => (parseFloat(b['Avkastning_12M_%']) || -999) - (parseFloat(a['Avkastning_12M_%']) || -999))
      .slice(0, 36);

    // 2. Nær 52-ukers topp (<= 3% fra ATH)
    const nearAthItems = rawData
      .filter(d => !isGearedOrDerivative(d) && d.Pct_ATH !== undefined && d.Pct_ATH !== null && parseFloat(d.Pct_ATH) >= -3.0)
      .sort((a, b) => (parseFloat(b.Pct_ATH) || -999) - (parseFloat(a.Pct_ATH) || -999))
      .slice(0, 36);

    // 3. Attraktive dips i opptrend: Over SMA 200, men falt -5% til -18% fra ATH
    const dipItems = rawData
      .filter(d => !isGearedOrDerivative(d) && d.Above_SMA200 === true && d.Pct_ATH !== undefined && d.Pct_ATH !== null && parseFloat(d.Pct_ATH) <= -5.0 && parseFloat(d.Pct_ATH) >= -18.0)
      .sort((a, b) => (parseFloat(b['Sharpe_3Y'] || b['Sharpe_1Y']) || -999) - (parseFloat(a['Sharpe_3Y'] || a['Sharpe_1Y']) || -999))
      .slice(0, 36);

    if (listUptrend) {
      listUptrend.innerHTML = uptrendItems.length
        ? uptrendItems.map(item => renderDeltaCard(item, 'Golden Cross', 'badge-official')).join('')
        : '<p class="text-muted" style="padding:1rem;">Ingen fond i denne kategorien.</p>';
    }

    if (listNearAth) {
      listNearAth.innerHTML = nearAthItems.length
        ? nearAthItems.map(item => renderDeltaCard(item, 'Nær All-Time High', 'badge-calc')).join('')
        : '<p class="text-muted" style="padding:1rem;">Ingen fond i denne kategorien.</p>';
    }

    if (listDips) {
      listDips.innerHTML = dipItems.length
        ? dipItems.map(item => renderDeltaCard(item, 'Kjøpsmulighet (Dip)', 'badge-na')).join('')
        : '<p class="text-muted" style="padding:1rem;">Ingen fond i denne kategorien.</p>';
    }

    // Lytter på kortene for å åpne teknisk analyse
    document.querySelectorAll('.delta-card').forEach(card => {
      card.addEventListener('click', () => {
        const isin = card.dataset.isin;
        const item = rawData.find(d => d.ISIN === isin);
        if (item) {
          const m = document.getElementById('delta-modal');
          if (m) m.style.display = 'none';
          openChartStudio(item);
        }
      });
    });
  }

  // ==========================================================================
  // N x N Pearson Korrelasjonsmatrise
  // ==========================================================================
  function renderCorrelationMatrix(validResults) {
    const container = document.getElementById('chart-correlation-container');
    if (!container) return;
    if (!validResults || validResults.length < 2) {
      container.innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
          <h3>Velg minst 2 fond for å beregne korrelasjonsmatrise</h3>
          <p>Bruk sjekkboksene i tabellen og klikk på 'Korrelasjon' i dokken nederst.</p>
        </div>
      `;
      return;
    }

    const fundData = validResults.map(res => {
      const ticker = res.item.Kortnavn || res.isin;
      const name = res.item.Navn_Morningstar || res.item.Navn_Fil || ticker;
      const dateMap = new Map();
      if (res.data && Array.isArray(res.data)) {
        res.data.forEach(d => {
          const val = (d.value !== undefined && d.value !== null) ? d.value : d.close;
          if (d.time && val !== undefined && val !== null && !isNaN(val)) {
            dateMap.set(d.time, parseFloat(val));
          }
        });
      }
      return { isin: res.isin, ticker, name, dateMap, count: res.data ? res.data.length : 0 };
    });

    const N = fundData.length;
    const matrix = [];
    const highCorrelationWarnings = [];

    for (let i = 0; i < N; i++) {
      matrix[i] = [];
      for (let j = 0; j < N; j++) {
        if (i === j) {
          matrix[i][j] = 1.00;
        } else if (j < i) {
          matrix[i][j] = matrix[j][i];
        } else {
          const f1 = fundData[i];
          const f2 = fundData[j];
          const commonDates = [];
          for (let date of f1.dateMap.keys()) {
            if (f2.dateMap.has(date)) {
              commonDates.push(date);
            }
          }
          commonDates.sort();

          if (commonDates.length < 15) {
            matrix[i][j] = null;
          } else {
            const r1 = [];
            const r2 = [];
            for (let k = 1; k < commonDates.length; k++) {
              const p1Prev = f1.dateMap.get(commonDates[k - 1]);
              const p1Curr = f1.dateMap.get(commonDates[k]);
              const p2Prev = f2.dateMap.get(commonDates[k - 1]);
              const p2Curr = f2.dateMap.get(commonDates[k]);
              if (p1Prev > 0 && p2Prev > 0) {
                r1.push((p1Curr - p1Prev) / p1Prev);
                r2.push((p2Curr - p2Prev) / p2Prev);
              }
            }

            if (r1.length < 15) {
              matrix[i][j] = null;
            } else {
              const mean1 = r1.reduce((a, b) => a + b, 0) / r1.length;
              const mean2 = r2.reduce((a, b) => a + b, 0) / r2.length;
              let num = 0, den1 = 0, den2 = 0;
              for (let k = 0; k < r1.length; k++) {
                const diff1 = r1[k] - mean1;
                const diff2 = r2[k] - mean2;
                num += diff1 * diff2;
                den1 += diff1 * diff1;
                den2 += diff2 * diff2;
              }
              const denom = Math.sqrt(den1 * den2);
              const r = denom > 0 ? (num / denom) : 0;
              const clamped = Math.max(-1, Math.min(1, r));
              matrix[i][j] = clamped;

              if (clamped >= 0.85) {
                highCorrelationWarnings.push({
                  f1: f1.ticker,
                  f2: f2.ticker,
                  r: clamped.toFixed(2)
                });
              }
            }
          }
        }
      }
    }

    function getCorrCellStyle(r, isDiag) {
      if (isDiag) return 'background: rgba(255, 255, 255, 0.06); color: #94a3b8; font-weight: 700;';
      if (r === null || isNaN(r)) return 'background: rgba(255, 255, 255, 0.02); color: #64748b;';
      if (r >= 0.85) return 'background: rgba(244, 63, 94, 0.28); color: #fda4af; font-weight: 800;';
      if (r >= 0.60) return 'background: rgba(245, 158, 11, 0.22); color: #fde68a; font-weight: 700;';
      if (r >= 0.30) return 'background: rgba(56, 189, 248, 0.16); color: #bae6fd; font-weight: 600;';
      if (r >= 0.00) return 'background: rgba(99, 102, 241, 0.16); color: #c7d2fe; font-weight: 600;';
      return 'background: rgba(16, 185, 129, 0.28); color: #a7f3d0; font-weight: 800;';
    }

    const tableHtml = `
      <div class="corr-table-wrap">
        <table class="corr-table">
          <thead>
            <tr>
              <th></th>
              ${fundData.map(f => `<th title="${f.name}">${f.ticker}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${fundData.map((fRow, i) => `
              <tr>
                <th class="corr-row-header" title="${fRow.name}">
                  <span style="color: #a5b4fc; font-weight: 700;">${fRow.ticker}</span>
                  <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${fRow.name}</div>
                </th>
                ${fundData.map((fCol, j) => {
                  const val = matrix[i][j];
                  const isDiag = i === j;
                  const strVal = val !== null && !isNaN(val) ? val.toFixed(2) : '—';
                  const style = getCorrCellStyle(val, isDiag);
                  return `<td class="corr-cell ${isDiag ? 'diagonal' : ''}" style="${style}" title="${fRow.ticker} vs. ${fCol.ticker}: ${strVal}">${strVal}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="corr-scale-legend">
        <span>Negativ (Sikring)</span>
        <div class="corr-scale-bar"></div>
        <span>Sterk (Overlapp)</span>
      </div>
    `;

    let warningHtml = '';
    if (highCorrelationWarnings.length > 0) {
      warningHtml = `
        <div class="corr-warning-box">
          <span style="font-size: 1.1rem; line-height: 1;">⚠️</span>
          <div>
            <strong>Advarsel om porteføljeoverlapp:</strong>
            ${highCorrelationWarnings.map(w => `
              <div><strong>${w.f1}</strong> og <strong>${w.f2}</strong> har en korrelasjon på <strong>${w.r}</strong>. De beveger seg nesten identisk, noe som gir minimal risikospredning ved å eie begge samtidig.</div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      warningHtml = `
        <div class="corr-warning-box" style="background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.25); color: #a7f3d0;">
          <span style="font-size: 1.1rem; line-height: 1;">✅</span>
          <div>
            <strong>Utmerket diversifiseringspotensial:</strong>
            Ingen av de valgte fondene har overdrevent høy samvariasjon (&ge; 0.85). Kurven har god spredning på tvers av aktivaklasser/sektorer.
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="background: rgba(15, 21, 35, 0.85); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.25rem;">
        <h4 class="corr-card-title">
          <span>📊 N &times; N Pearson Korrelasjonsmatrise (Daglige Avkastninger)</span>
        </h4>
        <div class="corr-card-sub">
          Beregnet på alle felles historiske handelsdager. Verdier nær +1.00 indikerer identisk kursutvikling, mens lave eller negative verdier gir reell porteføljediversifisering.
        </div>
        ${tableHtml}
        ${warningHtml}
      </div>
    `;
  }

  // ==========================================================================
  // Portefølje Studio (Vekting, Simulert NAV & Risikojustert Avkastning)
  // ==========================================================================
  let portfolioChartInstance = null;

  function renderPortfolioStudio(validResults) {
    const container = document.getElementById('chart-portfolio-container');
    if (!container) return;
    if (!validResults || validResults.length < 2) {
      container.innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">💼</div>
          <h3>Velg minst 2 fond for å simulere en vektet portefølje</h3>
          <p>Bruk sjekkboksene i tabellen og klikk på 'Vektet Portefølje' i dokken nederst.</p>
        </div>
      `;
      return;
    }

    const currentISINs = validResults.map(r => r.isin);
    const hasAll = currentISINs.every(isin => portfolioWeights[isin] !== undefined);
    if (!hasAll || Object.keys(portfolioWeights).length !== validResults.length) {
      const eq = Math.floor(100 / validResults.length);
      portfolioWeights = {};
      validResults.forEach((r, idx) => {
        portfolioWeights[r.isin] = (idx === validResults.length - 1) ? (100 - eq * (validResults.length - 1)) : eq;
      });
    }

    container.innerHTML = `
      <div class="portfolio-grid-layout">
        <!-- Left panel: Weights -->
        <div class="portfolio-weights-panel">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; font-size:0.92rem; font-weight:700;">Allokering & Vekting</h4>
            <button id="btn-portfolio-equal-weight" class="btn btn-xs btn-outline" style="font-size:0.72rem;">1/N Lik vekting</button>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin:0.3rem 0 0.85rem 0;">Juster vekting for hvert fond (0–100%). Samlet sum bør være 100%.</p>
          
          <div class="portfolio-weights-list" id="portfolio-weights-list">
            ${validResults.map(r => {
              const ticker = r.item.Kortnavn || r.isin;
              const name = r.item.Navn_Morningstar || r.item.Navn_Fil || ticker;
              const curW = portfolioWeights[r.isin] || 0;
              return `
                <div class="portfolio-weight-item" data-isin="${r.isin}">
                  <div class="portfolio-weight-top">
                    <span class="portfolio-item-name" title="${name}"><strong>${ticker}</strong> <span style="font-size:0.72rem; color:var(--text-muted); font-weight:normal;">${name}</span></span>
                    <span class="portfolio-weight-val" id="port-w-val-${r.isin}">${curW}%</span>
                  </div>
                  <div class="portfolio-slider-row">
                    <input type="range" class="portfolio-slider" data-isin="${r.isin}" min="0" max="100" step="1" value="${curW}">
                    <input type="number" class="portfolio-num-input" data-isin="${r.isin}" min="0" max="100" step="1" value="${curW}">
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="portfolio-total-row">
            <span>Total Allokering:</span>
            <span id="portfolio-total-weight-badge" class="badge">100%</span>
          </div>
        </div>

        <!-- Right panel: Performance metrics & synthetic NAV chart -->
        <div class="portfolio-results-panel">
          <div class="portfolio-kpi-strip">
            <div class="portfolio-kpi-card">
              <div class="lbl">Portefølje Årlig Avkastning</div>
              <div class="val text-emerald" id="port-cagr">—%</div>
            </div>
            <div class="portfolio-kpi-card">
              <div class="lbl">Portefølje Sharpe Ratio</div>
              <div class="val text-indigo" id="port-sharpe">—</div>
            </div>
            <div class="portfolio-kpi-card">
              <div class="lbl">Portefølje Volatilitet</div>
              <div class="val text-amber" id="port-vol">—%</div>
            </div>
            <div class="portfolio-kpi-card">
              <div class="lbl">Maks Drawdown</div>
              <div class="val text-rose" id="port-maxdd">—%</div>
            </div>
          </div>
          <div class="portfolio-chart-canvas-wrap">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
              <span>📈 Syntetisk Portefølje-NAV (Normalisert til 100 ved felles start)</span>
              <span id="port-chart-date-range" style="font-family:var(--font-mono); font-size:0.7rem; color:#a5b4fc;"></span>
            </div>
            <div id="portfolio-equity-chart" style="width: 100%; height: 260px;"></div>
          </div>
        </div>
      </div>
    `;

    setupPortfolioEventListeners(validResults);
    calculateAndRenderPortfolio(validResults);
  }

  function setupPortfolioEventListeners(validResults) {
    const list = document.getElementById('portfolio-weights-list');
    if (!list) return;

    const btnEq = document.getElementById('btn-portfolio-equal-weight');
    if (btnEq) {
      btnEq.onclick = () => {
        const eq = Math.floor(100 / validResults.length);
        validResults.forEach((r, idx) => {
          portfolioWeights[r.isin] = (idx === validResults.length - 1) ? (100 - eq * (validResults.length - 1)) : eq;
        });
        updateWeightInputs(validResults);
        calculateAndRenderPortfolio(validResults);
      };
    }

    const sliders = list.querySelectorAll('.portfolio-slider');
    const nums = list.querySelectorAll('.portfolio-num-input');

    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const isin = e.target.dataset.isin;
        const val = parseInt(e.target.value, 10) || 0;
        portfolioWeights[isin] = val;
        const numInput = list.querySelector(`.portfolio-num-input[data-isin="${isin}"]`);
        if (numInput) numInput.value = val;
        const lblVal = document.getElementById(`port-w-val-${isin}`);
        if (lblVal) lblVal.textContent = `${val}%`;
        updateTotalWeightBadge();
        calculateAndRenderPortfolio(validResults);
      });
    });

    nums.forEach(num => {
      num.addEventListener('change', (e) => {
        const isin = e.target.dataset.isin;
        let val = parseInt(e.target.value, 10) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        portfolioWeights[isin] = val;
        const sliderInput = list.querySelector(`.portfolio-slider[data-isin="${isin}"]`);
        if (sliderInput) sliderInput.value = val;
        const lblVal = document.getElementById(`port-w-val-${isin}`);
        if (lblVal) lblVal.textContent = `${val}%`;
        updateTotalWeightBadge();
        calculateAndRenderPortfolio(validResults);
      });
    });

    function updateWeightInputs(results) {
      results.forEach(r => {
        const val = portfolioWeights[r.isin] || 0;
        const slider = list.querySelector(`.portfolio-slider[data-isin="${r.isin}"]`);
        const num = list.querySelector(`.portfolio-num-input[data-isin="${r.isin}"]`);
        const lbl = document.getElementById(`port-w-val-${r.isin}`);
        if (slider) slider.value = val;
        if (num) num.value = val;
        if (lbl) lbl.textContent = `${val}%`;
      });
      updateTotalWeightBadge();
    }

    function updateTotalWeightBadge() {
      const total = Object.values(portfolioWeights).reduce((a, b) => a + b, 0);
      const badge = document.getElementById('portfolio-total-weight-badge');
      if (badge) {
        badge.textContent = `${total}%`;
        if (total === 100) {
          badge.className = 'badge badge-official';
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#34d399';
        } else {
          badge.className = 'badge badge-calc';
          badge.style.background = 'rgba(245, 158, 11, 0.2)';
          badge.style.color = '#fde68a';
        }
      }
    }
    updateTotalWeightBadge();
  }

  function calculateAndRenderPortfolio(validResults) {
    if (!validResults || !validResults.length) return;

    // 1. Build date -> price map for each fund
    const fundMaps = validResults.map(r => {
      const map = new Map();
      if (r.data && Array.isArray(r.data)) {
        r.data.forEach(d => {
          const val = (d.value !== undefined && d.value !== null) ? d.value : d.close;
          if (d.time && val !== undefined && val !== null && !isNaN(val)) {
            map.set(d.time, parseFloat(val));
          }
        });
      }
      return { isin: r.isin, map };
    });

    const activeFunds = validResults.filter(r => (portfolioWeights[r.isin] || 0) > 0);
    const fundsToUse = activeFunds.length ? activeFunds : validResults;

    // Find the latest start date among the funds to ensure all have historical data
    let commonStartDate = null;
    for (let f of fundsToUse) {
      const fm = fundMaps.find(m => m.isin === f.isin);
      if (!fm || fm.map.size === 0) continue;
      const fundDates = Array.from(fm.map.keys()).sort();
      const firstDate = fundDates[0];
      if (!commonStartDate || firstDate > commonStartDate) {
        commonStartDate = firstDate;
      }
    }

    if (!commonStartDate) return;

    // Gather all unique trading dates starting from commonStartDate
    const dateSet = new Set();
    for (let f of fundsToUse) {
      const fm = fundMaps.find(m => m.isin === f.isin);
      if (!fm) continue;
      for (let d of fm.map.keys()) {
        if (d >= commonStartDate) {
          dateSet.add(d);
        }
      }
    }
    const commonDates = Array.from(dateSet).sort();
    if (commonDates.length < 10) return;

    // Forward fill prices for each fund across commonDates
    const fundFilledPrices = new Map();
    for (let f of fundsToUse) {
      const fm = fundMaps.find(m => m.isin === f.isin);
      const filled = new Map();
      let lastPrice = null;
      for (let date of commonDates) {
        if (fm && fm.map.has(date)) {
          lastPrice = fm.map.get(date);
        }
        if (lastPrice !== null) {
          filled.set(date, lastPrice);
        }
      }
      fundFilledPrices.set(f.isin, filled);
    }

    const firstDate = commonDates[0];
    const lastDate = commonDates[commonDates.length - 1];

    const basePrices = {};
    fundsToUse.forEach(f => {
      const filled = fundFilledPrices.get(f.isin);
      basePrices[f.isin] = filled ? filled.get(firstDate) : null;
    });

    const rawSumWeights = fundsToUse.reduce((sum, f) => sum + (portfolioWeights[f.isin] || 0), 0) || 100;

    const navSeries = [];
    for (let date of commonDates) {
      let nav = 0;
      let hasAll = true;
      for (let f of fundsToUse) {
        const filled = fundFilledPrices.get(f.isin);
        const p = filled ? filled.get(date) : null;
        const p0 = basePrices[f.isin];
        if (!p || !p0) {
          hasAll = false;
          break;
        }
        const w = (portfolioWeights[f.isin] || 0) / rawSumWeights;
        const normP = (p / p0) * 100.0;
        nav += w * normP;
      }
      if (hasAll) {
        navSeries.push({ time: date, value: parseFloat(nav.toFixed(2)) });
      }
    }

    if (navSeries.length < 10) return;

    const V0 = navSeries[0].value;
    const VT = navSeries[navSeries.length - 1].value;

    const d0 = new Date(firstDate);
    const dT = new Date(lastDate);
    const years = Math.max(0.1, (dT - d0) / (1000 * 60 * 60 * 24 * 365.25));
    const cagr = (Math.pow(VT / V0, 1 / years) - 1) * 100;

    const dailyReturns = [];
    let maxDD = 0;
    let peak = V0;

    for (let k = 1; k < navSeries.length; k++) {
      const prev = navSeries[k - 1].value;
      const curr = navSeries[k].value;
      const r = (curr - prev) / prev;
      dailyReturns.push(r);

      if (curr > peak) peak = curr;
      const dd = ((curr - peak) / peak) * 100;
      if (dd < maxDD) maxDD = dd;
    }

    const meanR = dailyReturns.length ? (dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length) : 0;
    const variance = dailyReturns.length ? (dailyReturns.reduce((a, b) => a + Math.pow(b - meanR, 2), 0) / (dailyReturns.length - 1)) : 0;
    const dailyStd = Math.sqrt(variance);
    const annVol = dailyStd * Math.sqrt(252) * 100;

    const riskFreeRate = 2.5;
    const sharpe = annVol > 0 ? ((cagr - riskFreeRate) / annVol) : 0;

    const elCagr = document.getElementById('port-cagr');
    const elSharpe = document.getElementById('port-sharpe');
    const elVol = document.getElementById('port-vol');
    const elMaxdd = document.getElementById('port-maxdd');
    const elRange = document.getElementById('port-chart-date-range');

    if (elCagr) {
      elCagr.textContent = `${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)}% p.a.`;
      elCagr.className = `val ${cagr >= 0 ? 'text-emerald' : 'text-rose'}`;
    }
    if (elSharpe) {
      elSharpe.textContent = sharpe.toFixed(2);
      elSharpe.className = `val ${sharpe >= 1.0 ? 'text-indigo' : (sharpe < 0 ? 'text-rose' : 'text-white')}`;
    }
    if (elVol) {
      elVol.textContent = `${annVol.toFixed(2)}%`;
    }
    if (elMaxdd) {
      elMaxdd.textContent = `${maxDD.toFixed(2)}%`;
      elMaxdd.className = 'val text-rose';
    }
    if (elRange) {
      elRange.textContent = `${firstDate} til ${lastDate} (${commonDates.length} handelsdager, ${years.toFixed(1)} år)`;
    }

    drawPortfolioChart(navSeries);
  }

  function drawPortfolioChart(navSeries) {
    const chartContainer = document.getElementById('portfolio-equity-chart');
    if (!chartContainer || typeof LightweightCharts === 'undefined') return;

    if (portfolioChartInstance) {
      try {
        portfolioChartInstance.remove();
      } catch (e) {}
      portfolioChartInstance = null;
    }

    chartContainer.innerHTML = '';
    const containerW = chartContainer.clientWidth || 650;
    const containerH = 260;

    portfolioChartInstance = LightweightCharts.createChart(chartContainer, {
      width: containerW,
      height: containerH,
      layout: {
        background: { type: 'solid', color: '#090d16' },
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

    const areaSeries = portfolioChartInstance.addSeries(LightweightCharts.AreaSeries, {
      topColor: 'rgba(99, 102, 241, 0.45)',
      bottomColor: 'rgba(99, 102, 241, 0.02)',
      lineColor: '#818cf8',
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: p => p.toFixed(2) }
    });

    areaSeries.setData(navSeries);

    areaSeries.createPriceLine({
      price: 100.0,
      color: 'rgba(255, 255, 255, 0.25)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      title: 'Basis (100)'
    });

    const elDateRange = document.getElementById('port-chart-date-range');
    const defaultRangeText = elDateRange ? elDateRange.textContent : '';

    portfolioChartInstance.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) {
        if (elDateRange && defaultRangeText) elDateRange.textContent = defaultRangeText;
        return;
      }
      const val = param.seriesData.get(areaSeries);
      const p = val && val.value !== undefined ? val.value : (val && val.close !== undefined ? val.close : null);
      if (p !== null && elDateRange) {
        const diff = p - 100;
        elDateRange.innerHTML = `Dato: <strong style="color:#fff;">${param.time}</strong> | NAV: <strong style="color:#818cf8;">${p.toFixed(2)}</strong> (<span style="color:${diff >= 0 ? '#10b981' : '#f43f5e'}; font-weight:700;">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</span>)`;
      }
    });

    portfolioChartInstance.timeScale().fitContent();

    // Trigger an immediate micro-resize in case container dimensions settled after DOM insertion
    setTimeout(() => {
      if (portfolioChartInstance && chartContainer) {
        portfolioChartInstance.applyOptions({
          width: chartContainer.clientWidth || containerW,
          height: containerH
        });
        portfolioChartInstance.timeScale().fitContent();
      }
    }, 50);
  }


  // ==========================================================================
  // Portefølje-Studio (Multi-portefølje opptil 5 profiler, mandater og AI-revisjon)
  // ==========================================================================
  let userPortfolios = [];
  let activePortfolioId = 'port_1';
  let userPortfolioHoldings = []; // Peker alltid på aktiv porteføljes beholdninger
  let userPortSelectedETF = null;
  let userPortCurrentUnit = 'shares';
  let studioPortfolioChartInstance = null;

  function createDefaultPortfolio(id = 'port_1', name = 'Portefølje 1') {
    return {
      id: id,
      name: name,
      holdings: [],
      criteria: {
        risk: 'balanced',
        maxSector: true,
        globalGeo: true,
        maxDrawdown: true,
        minSharpe: true,
        maxFee: true,
        customNotes: ''
      }
    };
  }

  function getActivePortfolio() {
    if (!userPortfolios || !userPortfolios.length) {
      userPortfolios = [createDefaultPortfolio('port_1', 'Portefølje 1')];
      activePortfolioId = 'port_1';
    }
    let p = userPortfolios.find(item => item.id === activePortfolioId);
    if (!p) {
      p = userPortfolios[0];
      activePortfolioId = p.id;
    }
    userPortfolioHoldings = p.holdings || (p.holdings = []);
    return p;
  }

  function loadSavedUserPortfolio() {
    try {
      const saved = localStorage.getItem('etf_saved_portfolios_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          userPortfolios = parsed;
          const savedActiveId = localStorage.getItem('etf_active_portfolio_id');
          if (savedActiveId && userPortfolios.some(p => p.id === savedActiveId)) {
            activePortfolioId = savedActiveId;
          } else {
            activePortfolioId = userPortfolios[0].id;
          }
          getActivePortfolio();
          return;
        }
      }
    } catch (e) {}

    // Migrering fra v1
    try {
      const legacy = localStorage.getItem('etf_user_portfolio_holdings');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const def = createDefaultPortfolio('port_1', 'Portefølje 1');
          def.holdings = parsedLegacy;
          userPortfolios = [def];
          activePortfolioId = 'port_1';
          userPortfolioHoldings = parsedLegacy;
          saveUserPortfolio();
          return;
        }
      }
    } catch (e) {}

    userPortfolios = [createDefaultPortfolio('port_1', 'Portefølje 1')];
    activePortfolioId = 'port_1';
    getActivePortfolio();
  }

  function saveUserPortfolio() {
    try {
      const active = getActivePortfolio();
      active.holdings = userPortfolioHoldings;
      localStorage.setItem('etf_saved_portfolios_v2', JSON.stringify(userPortfolios));
      localStorage.setItem('etf_active_portfolio_id', activePortfolioId);
      // Bakoverkompatibilitet
      localStorage.setItem('etf_user_portfolio_holdings', JSON.stringify(userPortfolioHoldings));
    } catch (e) {}
    updateNavAndShortcutBadges();
  }

  function updateNavAndShortcutBadges() {
    const p = getActivePortfolio();
    const count = (p.holdings || []).length;
    const totalVal = (p.holdings || []).reduce((sum, h) => sum + (h.computedValue || 0), 0);

    const navBadge = document.getElementById('main-nav-port-count');
    if (navBadge) {
      navBadge.textContent = `${count} fond`;
    }

    const banner = document.getElementById('portfolio-quick-banner');
    const nameEl = document.getElementById('shortcut-port-name');
    const countEl = document.getElementById('shortcut-port-count');
    const valEl = document.getElementById('shortcut-port-val');

    if (banner) {
      if (count > 0) {
        banner.style.display = 'flex';
        if (nameEl) nameEl.textContent = p.name;
        if (countEl) countEl.textContent = `${count} fond`;
        if (valEl) valEl.textContent = `${Math.round(totalVal).toLocaleString('no-NO')} kr`;
      } else {
        banner.style.display = 'none';
      }
    }
  }

  function renderPortfolioProfileTabs() {
    const tabsContainer = document.getElementById('portfolio-profile-tabs');
    const nameDisplay = document.getElementById('port-active-name-display');
    const active = getActivePortfolio();

    if (nameDisplay) {
      nameDisplay.textContent = active.name || 'Portefølje 1';
    }

    if (tabsContainer) {
      let html = '';
      userPortfolios.forEach(port => {
        const isActive = port.id === activePortfolioId;
        const count = (port.holdings || []).length;
        html += `
          <button type="button" class="port-profile-tab ${isActive ? 'active' : ''}" data-id="${port.id}">
            <span>${safeHtml(port.name)}</span>
            <span class="port-profile-count-pill">${count}</span>
          </button>
        `;
      });

      if (userPortfolios.length < 5) {
        html += `
          <button type="button" id="btn-add-profile-tab" class="btn-add-profile-tab" title="Opprett en ny tom portefølje (inntil 5)">
            <span>+</span> Ny portefølje
          </button>
        `;
      }
      tabsContainer.innerHTML = html;

      // Event listeners for tabs
      tabsContainer.querySelectorAll('.port-profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const id = tab.dataset.id;
          if (id && id !== activePortfolioId) {
            activePortfolioId = id;
            getActivePortfolio();
            saveUserPortfolio();
            renderPortfolioProfileTabs();
            renderUserPortfolioChips();
            syncCriteriaUIFromActivePortfolio();
            calculateAndRenderStudioPortfolioAnalysis();
          }
        });
      });

      const btnAddTab = document.getElementById('btn-add-profile-tab');
      if (btnAddTab) {
        btnAddTab.addEventListener('click', addNewPortfolio);
      }
    }
  }

  function addNewPortfolio() {
    if (userPortfolios.length >= 5) {
      alert('Du kan maksimalt opprette 5 porteføljer samtidig. Slett eller gi nytt navn til en eksisterende.');
      return;
    }
    const newId = 'port_' + Date.now();
    const newName = `Portefølje ${userPortfolios.length + 1}`;
    const newPort = createDefaultPortfolio(newId, newName);
    userPortfolios.push(newPort);
    activePortfolioId = newId;
    getActivePortfolio();
    saveUserPortfolio();
    renderPortfolioProfileTabs();
    renderUserPortfolioChips();
    syncCriteriaUIFromActivePortfolio();
    calculateAndRenderStudioPortfolioAnalysis();
  }

  function renameCurrentPortfolio() {
    const active = getActivePortfolio();
    const currentName = active.name || 'Portefølje 1';
    const newName = prompt('Endre navn på porteføljen:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      active.name = newName.trim().slice(0, 40);
      saveUserPortfolio();
      renderPortfolioProfileTabs();
      updateNavAndShortcutBadges();
    }
  }

  function duplicateCurrentPortfolio() {
    if (userPortfolios.length >= 5) {
      alert('Du kan maksimalt ha 5 porteføljer samtidig. Slett en før du dupliserer.');
      return;
    }
    const active = getActivePortfolio();
    const dupId = 'port_' + Date.now();
    const dupName = `${active.name} (Kopi)`.slice(0, 40);
    const dup = JSON.parse(JSON.stringify(active));
    dup.id = dupId;
    dup.name = dupName;
    userPortfolios.push(dup);
    activePortfolioId = dupId;
    getActivePortfolio();
    saveUserPortfolio();
    renderPortfolioProfileTabs();
    renderUserPortfolioChips();
    syncCriteriaUIFromActivePortfolio();
    calculateAndRenderStudioPortfolioAnalysis();
  }

  function deleteCurrentPortfolio() {
    if (userPortfolios.length <= 1) {
      alert('Du må ha minst én aktiv portefølje. Du kan tømme fondene i stedet.');
      return;
    }
    const active = getActivePortfolio();
    if (confirm(`Er du sikker på at du vil slette porteføljen "${active.name}"? Dette kan ikke angres.`)) {
      userPortfolios = userPortfolios.filter(p => p.id !== activePortfolioId);
      activePortfolioId = userPortfolios[0].id;
      getActivePortfolio();
      saveUserPortfolio();
      renderPortfolioProfileTabs();
      renderUserPortfolioChips();
      syncCriteriaUIFromActivePortfolio();
      calculateAndRenderStudioPortfolioAnalysis();
    }
  }

  function syncCriteriaUIFromActivePortfolio() {
    const active = getActivePortfolio();
    const c = active.criteria || (active.criteria = {
      risk: 'balanced',
      maxSector: true,
      globalGeo: true,
      maxDrawdown: true,
      minSharpe: true,
      maxFee: true,
      customNotes: ''
    });

    const riskRadios = document.querySelectorAll('input[name="crit-risk"]');
    riskRadios.forEach(r => {
      r.checked = (r.value === (c.risk || 'balanced'));
    });

    const chkSector = document.getElementById('crit-chk-sector');
    const chkGeo = document.getElementById('crit-chk-geo');
    const chkDD = document.getElementById('crit-chk-drawdown');
    const chkSharpe = document.getElementById('crit-chk-sharpe');
    const chkFee = document.getElementById('crit-chk-fee');
    const txtNotes = document.getElementById('crit-custom-notes');

    if (chkSector) chkSector.checked = c.maxSector !== false;
    if (chkGeo) chkGeo.checked = c.globalGeo !== false;
    if (chkDD) chkDD.checked = c.maxDrawdown !== false;
    if (chkSharpe) chkSharpe.checked = c.minSharpe !== false;
    if (chkFee) chkFee.checked = c.maxFee !== false;
    if (txtNotes) txtNotes.value = c.customNotes || '';
  }

  function initPortfolioCriteriaEvents() {
    document.querySelectorAll('input[name="crit-risk"]').forEach(r => {
      r.addEventListener('change', () => {
        const active = getActivePortfolio();
        if (!active.criteria) active.criteria = {};
        active.criteria.risk = r.value;
        saveUserPortfolio();
      });
    });

    const bindCheck = (id, prop) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          const active = getActivePortfolio();
          if (!active.criteria) active.criteria = {};
          active.criteria[prop] = el.checked;
          saveUserPortfolio();
        });
      }
    };

    bindCheck('crit-chk-sector', 'maxSector');
    bindCheck('crit-chk-geo', 'globalGeo');
    bindCheck('crit-chk-drawdown', 'maxDrawdown');
    bindCheck('crit-chk-sharpe', 'minSharpe');
    bindCheck('crit-chk-fee', 'maxFee');

    const txtNotes = document.getElementById('crit-custom-notes');
    if (txtNotes) {
      let notesTimer = null;
      txtNotes.addEventListener('input', () => {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(() => {
          const active = getActivePortfolio();
          if (!active.criteria) active.criteria = {};
          active.criteria.customNotes = txtNotes.value;
          saveUserPortfolio();
        }, 300);
      });
    }

    const btnAudit = document.getElementById('btn-trigger-ai-audit');
    if (btnAudit) {
      btnAudit.addEventListener('click', triggerPortfolioAiAudit);
    }
  }

  function triggerPortfolioAiAudit() {
    const active = getActivePortfolio();
    const holdings = active.holdings || [];
    if (!holdings.length) {
      alert('Legg til minst ett eller to fond i porteføljen din først, så AI kan analysere og vurdere den mot kravene dine.');
      return;
    }

    const totalVal = holdings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;
    const c = active.criteria || {};
    const riskLabel = c.risk === 'conservative' ? 'Defensiv / Kapitalbevaring' : (c.risk === 'aggressive' ? 'Offensiv / Maksimal vekst' : 'Balansert (Vekst & Beskyttelse)');

    let fundListStr = holdings.map(h => {
      const w = Math.round(((h.computedValue || 0) / totalVal) * 100);
      const valStr = h.unit === 'shares' ? `${h.rawValue} andeler (${Math.round(h.computedValue).toLocaleString('no-NO')} kr)` : `${Math.round(h.rawValue).toLocaleString('no-NO')} kr`;
      return `- ${h.ticker} (${h.isin}) — ${h.name}: ${w}% vekt (${valStr})`;
    }).join('\n');

    let reqList = [];
    reqList.push(`- Risikoprofil: ${riskLabel}`);
    if (c.maxSector) reqList.push('- Mandatkrav: Maks 25 % eksponering mot én enkelt sektor (f.eks. teknologi)');
    if (c.globalGeo) reqList.push('- Mandatkrav: Global diversifisering (Maks 50 % konsentrert i USA/enkeltregion)');
    if (c.maxDrawdown) reqList.push('- Mandatkrav: Maksimalt 15 % historisk drawdown (3 år)');
    if (c.minSharpe) reqList.push('- Mandatkrav: Krav om samlet Sharpe Ratio ≥ 1.0 (høy risikojustert avkastning)');
    if (c.maxFee) reqList.push('- Mandatkrav: Kostnadskontroll (Vektet årlig avgift under 0,25 %)');
    if (c.customNotes && c.customNotes.trim()) {
      reqList.push(`- Egne faste regler: "${c.customNotes.trim()}"`);
    }

    const prompt = `Gjennomfør en grundig og institusjonell porteføljerevisjon av min portefølje "${active.name}" opp mot mine definerte mandatkrav og risikoprofil.

PORTEFØLJEN MIN:
Beregnet totalverdi: ${Math.round(totalVal).toLocaleString('no-NO')} kr (${holdings.length} fond)
${fundListStr}

MINE DEFINERTE KRAV & MANDAT:
${reqList.join('\n')}

Vennligst gi en strukturert evaluering med følgende tre overskrifter:
### 1. Evaluering mot definert mandat og risikoprofil
Vurder om porteføljen bryter med noen av de oppgitte mandatreglene (sektor, geografi, drawdown, Sharpe, kostnad og egne regler).

### 2. Svakheter, konsentrasjonsrisiko og nedsidesårbarhet
Hva er de største sårbarhetene ved denne sammensetningen i et stresset marked?

### 3. Konkrete justeringer og alternative UCITS ETF-er
Gi konkrete anbefalinger for vekting (hva bør reduseres/økes) og foreslå spesifikke UCITS ETF-er med ISIN og ticker som oppfyller kravene mine.`;

    if (typeof openAiChat === 'function') openAiChat();
    if (typeof sendAiMessage === 'function') sendAiMessage(prompt);
  }

  function calculateAndRenderStudioPortfolioAnalysis() {
    const section = document.getElementById('port-analysis-section');
    const elVal = document.getElementById('studio-port-val');
    const elCountSub = document.getElementById('studio-port-count-sub');
    const elFee = document.getElementById('studio-port-fee');
    const elSharpe = document.getElementById('studio-port-sharpe');
    const elVol = document.getElementById('studio-port-vol');
    const elMaxdd = document.getElementById('studio-port-maxdd');
    const elCagr = document.getElementById('studio-port-cagr');

    const active = getActivePortfolio();
    const holdings = active.holdings || [];

    if (!holdings.length) {
      if (section) section.style.display = 'none';
      if (elVal) elVal.textContent = '0 kr';
      if (elCountSub) elCountSub.textContent = '0 fond';
      return;
    }

    if (section) section.style.display = 'block';

    const totalVal = holdings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;
    if (elVal) elVal.textContent = `${Math.round(totalVal).toLocaleString('no-NO')} kr`;
    if (elCountSub) elCountSub.textContent = `${holdings.length} fond valgt (100%)`;

    // Beregn vektet statistikk
    let weightedFee = 0;
    let weightedSharpe = 0;
    let weightedVol = 0;
    let weightedMaxDD = 0;
    let weightedCagr = 0;
    let validFeeWeight = 0;
    let validSharpeWeight = 0;
    let validVolWeight = 0;
    let validDDWeight = 0;
    let validCagrWeight = 0;

    holdings.forEach(h => {
      const item = rawData.find(d => d.ISIN === h.isin);
      const w = (h.computedValue || 0) / totalVal;
      if (item) {
        if (item['Aarlig_Avgift_%'] !== null && !isNaN(item['Aarlig_Avgift_%'])) {
          weightedFee += w * parseFloat(item['Aarlig_Avgift_%']);
          validFeeWeight += w;
        }
        const sh = item.Sharpe_3Y !== null && item.Sharpe_3Y !== undefined ? parseFloat(item.Sharpe_3Y) : parseFloat(item.Sharpe_1Y);
        if (!isNaN(sh)) {
          weightedSharpe += w * sh;
          validSharpeWeight += w;
        }
        const vol = item['Standardavvik_3Y_%'] !== null && item['Standardavvik_3Y_%'] !== undefined ? parseFloat(item['Standardavvik_3Y_%']) : null;
        if (vol !== null && !isNaN(vol)) {
          weightedVol += w * vol;
          validVolWeight += w;
        }
        const dd = item['Max_Drawdown_3Y_%'] !== null && item['Max_Drawdown_3Y_%'] !== undefined ? parseFloat(item['Max_Drawdown_3Y_%']) : parseFloat(item['Max_Drawdown_1Y_%']);
        if (dd !== null && !isNaN(dd)) {
          weightedMaxDD += w * dd;
          validDDWeight += w;
        }
        const cagr = item['Avkastning_3Y_Ann_%'] !== null && item['Avkastning_3Y_Ann_%'] !== undefined ? parseFloat(item['Avkastning_3Y_Ann_%']) : parseFloat(item['Avkastning_12M_%']);
        if (cagr !== null && !isNaN(cagr)) {
          weightedCagr += w * cagr;
          validCagrWeight += w;
        }
      }
    });

    const finalFee = validFeeWeight > 0 ? (weightedFee / validFeeWeight) : null;
    const finalSharpe = validSharpeWeight > 0 ? (weightedSharpe / validSharpeWeight) : null;
    const finalVol = validVolWeight > 0 ? (weightedVol / validVolWeight) : null;
    const finalDD = validDDWeight > 0 ? (weightedMaxDD / validDDWeight) : null;
    const finalCagr = validCagrWeight > 0 ? (weightedCagr / validCagrWeight) : null;

    if (elFee) elFee.textContent = finalFee !== null ? `${finalFee.toFixed(2)}%` : '—%';
    if (elSharpe) {
      elSharpe.textContent = finalSharpe !== null ? finalSharpe.toFixed(2) : '—';
      elSharpe.className = `port-kpi-value ${finalSharpe !== null && finalSharpe >= 1.0 ? 'text-indigo' : (finalSharpe !== null && finalSharpe < 0 ? 'text-rose' : 'text-white')}`;
    }
    if (elVol) elVol.textContent = finalVol !== null ? `${finalVol.toFixed(1)}%` : '—%';
    if (elMaxdd) {
      elMaxdd.textContent = finalDD !== null ? `${finalDD.toFixed(1)}%` : '—%';
      elMaxdd.className = 'port-kpi-value text-rose';
    }
    if (elCagr) {
      elCagr.textContent = finalCagr !== null ? `${finalCagr >= 0 ? '+' : ''}${finalCagr.toFixed(1)}%` : '—%';
      elCagr.className = `port-kpi-value ${finalCagr !== null && finalCagr >= 0 ? 'text-emerald' : 'text-rose'}`;
    }

    // Tegn eller oppdater Studio-graf
    drawStudioPortfolioChart(holdings);
  }

  function drawStudioPortfolioChart(holdings) {
    const container = document.getElementById('studio-portfolio-equity-chart');
    const tooltip = document.getElementById('studio-chart-tooltip');
    if (!container || typeof LightweightCharts === 'undefined') return;

    if (studioPortfolioChartInstance) {
      try {
        studioPortfolioChartInstance.remove();
      } catch (e) {}
      studioPortfolioChartInstance = null;
    }

    container.innerHTML = '';
    const containerW = container.clientWidth || 800;
    const containerH = 320;

    // Bygg simulert serie basert på sparklines eller tilgjengelig historikk
    const navSeries = [];
    const totalVal = holdings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;

    // Finn sparklines for fondene
    const sparklines = [];
    holdings.forEach(h => {
      const item = rawData.find(d => d.ISIN === h.isin);
      const w = (h.computedValue || 0) / totalVal;
      if (item && Array.isArray(item.Sparkline) && item.Sparkline.length >= 10) {
        sparklines.push({ weight: w, pts: item.Sparkline });
      }
    });

    if (sparklines.length > 0) {
      const minLen = Math.min(...sparklines.map(s => s.pts.length));
      const today = new Date();
      for (let i = 0; i < minLen; i++) {
        let nav = 0;
        sparklines.forEach(s => {
          const p0 = s.pts[0] || 1;
          const pt = s.pts[i];
          const norm = (pt / p0) * 100.0;
          nav += s.weight * norm;
        });
        const d = new Date(today.getTime() - (minLen - 1 - i) * 7 * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        navSeries.push({ time: dateStr, value: parseFloat(nav.toFixed(2)) });
      }
    }

    if (navSeries.length < 5) {
      container.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-size:0.85rem;">Ikke tilstrekkelig kurshistorikk for simulering av alle valgte fond.</div>';
      return;
    }

    studioPortfolioChartInstance = LightweightCharts.createChart(container, {
      width: containerW,
      height: containerH,
      layout: {
        background: { type: 'solid', color: '#080c14' },
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
        vertLine: { color: '#6366f1', width: 1, style: 3 },
        horzLine: { color: '#6366f1', width: 1, style: 3 }
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: false
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }
    });

    const areaSeries = studioPortfolioChartInstance.addSeries(LightweightCharts.AreaSeries, {
      topColor: 'rgba(99, 102, 241, 0.45)',
      bottomColor: 'rgba(99, 102, 241, 0.02)',
      lineColor: '#818cf8',
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: p => p.toFixed(2) }
    });

    areaSeries.setData(navSeries);

    areaSeries.createPriceLine({
      price: 100.0,
      color: 'rgba(255, 255, 255, 0.25)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      title: 'Basis (100)'
    });

    studioPortfolioChartInstance.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.seriesData) {
        if (tooltip) tooltip.textContent = 'Hold musepeker over grafen for detaljer';
        return;
      }
      const val = param.seriesData.get(areaSeries);
      const p = val && val.value !== undefined ? val.value : (val && val.close !== undefined ? val.close : null);
      if (p !== null && tooltip) {
        const diff = p - 100;
        tooltip.innerHTML = `Dato: <strong style="color:#fff;">${param.time}</strong> | Normalisert NAV: <strong style="color:#818cf8;">${p.toFixed(2)}</strong> (<span style="color:${diff >= 0 ? '#10b981' : '#f43f5e'}; font-weight:700;">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</span>)`;
      }
    });

    studioPortfolioChartInstance.timeScale().fitContent();

    setTimeout(() => {
      if (studioPortfolioChartInstance && container) {
        studioPortfolioChartInstance.applyOptions({
          width: container.clientWidth || containerW,
          height: containerH
        });
        studioPortfolioChartInstance.timeScale().fitContent();
      }
    }, 50);
  }

  function initAppNavigation() {
    const tabScreener = document.getElementById('tab-nav-screener');
    const tabPortfolio = document.getElementById('tab-nav-portfolio');
    const paneScreener = document.getElementById('view-pane-screener');
    const panePortfolio = document.getElementById('view-pane-portfolio');
    const btnGotoStudio = document.getElementById('btn-goto-portfolio-studio');

    function switchView(viewName) {
      if (viewName === 'portfolio') {
        if (tabPortfolio) tabPortfolio.classList.add('active');
        if (tabScreener) tabScreener.classList.remove('active');
        if (paneScreener) paneScreener.style.display = 'none';
        if (panePortfolio) {
          panePortfolio.style.display = 'block';
          // Oppdater analyse og re-render graf med korrekte dimensjoner
          calculateAndRenderStudioPortfolioAnalysis();
        }
      } else {
        if (tabScreener) tabScreener.classList.add('active');
        if (tabPortfolio) tabPortfolio.classList.remove('active');
        if (paneScreener) paneScreener.style.display = 'block';
        if (panePortfolio) panePortfolio.style.display = 'none';
      }
      updateNavAndShortcutBadges();
    }

    if (tabScreener) {
      tabScreener.addEventListener('click', () => switchView('screener'));
    }
    if (tabPortfolio) {
      tabPortfolio.addEventListener('click', () => switchView('portfolio'));
    }
    if (btnGotoStudio) {
      btnGotoStudio.addEventListener('click', () => switchView('portfolio'));
    }

    updateNavAndShortcutBadges();
  }

  function initUserPortfolioSection() {
    const elCard = document.getElementById('user-portfolio-card');
    if (!elCard) return;

    const searchInput = document.getElementById('user-port-search-input');
    const searchResults = document.getElementById('user-port-search-results');
    const btnClearSearch = document.getElementById('user-port-search-clear');
    const elSelectedBadge = document.getElementById('user-port-selected-etf');
    const elSelectedTicker = document.getElementById('user-port-selected-ticker');
    const elSelectedName = document.getElementById('user-port-selected-name');
    const elSelectedPrice = document.getElementById('user-port-selected-price');
    const btnCancelSelection = document.getElementById('user-port-cancel-selection');
    const btnUnitShares = document.getElementById('unit-btn-shares');
    const btnUnitAmount = document.getElementById('unit-btn-amount');
    const elValLabel = document.getElementById('user-port-val-label');
    const qtyInput = document.getElementById('user-port-qty-input');
    const btnAdd = document.getElementById('btn-user-port-add');
    const btnClearAll = document.getElementById('btn-user-port-clear');
    const btnAnalyze = document.getElementById('btn-user-port-analyze');

    // Admin knapper for aktiv portefølje
    const btnRename = document.getElementById('btn-port-rename');
    const btnDuplicate = document.getElementById('btn-port-duplicate');
    const btnDelete = document.getElementById('btn-port-delete');

    if (btnRename) btnRename.addEventListener('click', renameCurrentPortfolio);
    if (btnDuplicate) btnDuplicate.addEventListener('click', duplicateCurrentPortfolio);
    if (btnDelete) btnDelete.addEventListener('click', deleteCurrentPortfolio);

    // 1. Last inn lagrede beholdninger & profiler fra localStorage
    loadSavedUserPortfolio();
    renderPortfolioProfileTabs();
    syncCriteriaUIFromActivePortfolio();
    initPortfolioCriteriaEvents();
    renderUserPortfolioChips();
    calculateAndRenderStudioPortfolioAnalysis();

    // 2. Søk i ETF-er med umiddelbar åpning ved klikk/fokus og søk fra 0-1 bokstav
    let searchDebounceTimer = null;

    if (searchInput) {
      const openSearchDropdown = () => {
        const q = searchInput.value.trim().toLowerCase();
        performPortfolioSearch(q);
      };

      searchInput.addEventListener('focus', openSearchDropdown);
      searchInput.addEventListener('click', openSearchDropdown);

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (btnClearSearch) btnClearSearch.style.display = query ? 'block' : 'none';

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          performPortfolioSearch(query);
        }, 70);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (searchResults) searchResults.style.display = 'none';
        }
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        btnClearSearch.style.display = 'none';
        performPortfolioSearch('');
      });
    }

    // Klikk utenfor lukker dropdown
    document.addEventListener('click', (e) => {
      if (searchResults && searchInput) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
          searchResults.style.display = 'none';
        }
      }
    });

    function performPortfolioSearch(query) {
      if (!searchResults || !Array.isArray(rawData) || !rawData.length) return;

      let matches = [];
      let isDefaultPopular = false;

      if (!query) {
        // Tomt søkefelt: vis de 15 største og mest populære ETF-ene etter AUM
        isDefaultPopular = true;
        matches = rawData
          .filter(d => d && (d.Kortnavn || d.ISIN))
          .slice()
          .sort((a, b) => (b.AUM_Verdi || 0) - (a.AUM_Verdi || 0))
          .slice(0, 15);
      } else {
        // Søk fra 1 bokstav og oppover:
        const hits = [];
        for (let i = 0; i < rawData.length; i++) {
          const item = rawData[i];
          if (!item) continue;
          const ticker = (item.Kortnavn || '').toLowerCase();
          const isin = (item.ISIN || '').toLowerCase();
          const name = (item.Navn_Morningstar || item.Navn_Fil || '').toLowerCase();

          if (ticker === query) {
            hits.push({ item, score: 100 });
          } else if (ticker.startsWith(query)) {
            hits.push({ item, score: 85 });
          } else if (isin.startsWith(query)) {
            hits.push({ item, score: 75 });
          } else if (ticker.includes(query)) {
            hits.push({ item, score: 65 });
          } else if (name.startsWith(query)) {
            hits.push({ item, score: 55 });
          } else if (name.includes(query) || isin.includes(query)) {
            hits.push({ item, score: 40 });
          }
        }

        // Sorter treff: høyest relevans-score først, deretter største fond (AUM)
        hits.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (b.item.AUM_Verdi || 0) - (a.item.AUM_Verdi || 0);
        });

        matches = hits.slice(0, 16).map(h => h.item);
      }

      if (!matches.length) {
        searchResults.innerHTML = '<div style="padding: 0.85rem 1rem; color: var(--text-muted); font-size: 0.82rem; text-align: center;">Ingen ETF-er funnet for "' + safeHtml(query) + '"</div>';
        searchResults.style.display = 'block';
        return;
      }

      const headerHtml = isDefaultPopular
        ? `<div class="user-port-dd-header">💡 Populære & største ETF-er (klikk eller søk)</div>`
        : `<div class="user-port-dd-header">🔍 Søketreff (${matches.length} fond)</div>`;

      const itemsHtml = matches.map(m => {
        const ticker = m.Kortnavn || m.ISIN;
        const name = m.Navn_Morningstar || m.Navn_Fil || ticker;
        const price = getETFPrice(m);
        const priceStr = price ? `${price.toFixed(2)} ${m.Valuta_AUM || '€'}` : '—';
        const kat = m.Kategori_Morningstar || m.Nordnet_Kategori || 'ETF';
        return `
          <div class="user-port-dropdown-item" data-isin="${m.ISIN}">
            <div class="user-port-dd-left">
              <span class="user-port-dd-ticker">${safeHtml(ticker)}</span>
              <span class="user-port-dd-name" title="${safeHtml(name)}">${safeHtml(name)}</span>
            </div>
            <div class="user-port-dd-right">
              <span class="user-port-dd-price">${priceStr}</span>
              <span style="font-size: 0.68rem; color: var(--text-muted);">${safeHtml(kat)}</span>
            </div>
          </div>
        `;
      }).join('');

      searchResults.innerHTML = headerHtml + itemsHtml;

      searchResults.querySelectorAll('.user-port-dropdown-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const isin = itemEl.dataset.isin;
          const found = rawData.find(d => d.ISIN === isin);
          if (found) {
            selectEtfForUserPortfolio(found);
          }
        });
      });

      searchResults.style.display = 'block';
    }

    function selectEtfForUserPortfolio(item) {
      userPortSelectedETF = item;
      const ticker = item.Kortnavn || item.ISIN;
      const name = item.Navn_Morningstar || item.Navn_Fil || ticker;
      const price = getETFPrice(item);
      const priceStr = price ? `Kurs: ${price.toFixed(2)} ${item.Valuta_AUM || '€'}` : 'Siste kurs ukjent';

      if (elSelectedTicker) elSelectedTicker.textContent = ticker;
      if (elSelectedName) elSelectedName.textContent = name.length > 35 ? name.slice(0, 32) + '...' : name;
      if (elSelectedPrice) elSelectedPrice.textContent = priceStr;
      if (elSelectedBadge) elSelectedBadge.style.display = 'flex';

      if (searchInput) searchInput.style.display = 'none';
      if (btnClearSearch) btnClearSearch.style.display = 'none';
      if (searchResults) searchResults.style.display = 'none';

      if (qtyInput) {
        qtyInput.focus();
        validateAddBtn();
      }
    }

    if (btnCancelSelection) {
      btnCancelSelection.addEventListener('click', () => {
        userPortSelectedETF = null;
        if (elSelectedBadge) elSelectedBadge.style.display = 'none';
        if (searchInput) {
          searchInput.style.display = 'block';
          searchInput.value = '';
          searchInput.focus();
          performPortfolioSearch('');
        }
        validateAddBtn();
      });
    }

    // 3. Enhetsvelger (Andeler vs Beløp)
    if (btnUnitShares && btnUnitAmount) {
      btnUnitShares.addEventListener('click', () => {
        userPortCurrentUnit = 'shares';
        btnUnitShares.classList.add('active');
        btnUnitAmount.classList.remove('active');
        if (elValLabel) elValLabel.textContent = 'Antall andeler (stk):';
        if (qtyInput) qtyInput.placeholder = 'f.eks. 50';
      });

      btnUnitAmount.addEventListener('click', () => {
        userPortCurrentUnit = 'amount';
        btnUnitAmount.classList.add('active');
        btnUnitShares.classList.remove('active');
        if (elValLabel) elValLabel.textContent = 'Investert beløp:';
        if (qtyInput) qtyInput.placeholder = 'f.eks. 50 000 kr';
      });
    }

    // 4. Input validering
    function validateAddBtn() {
      const val = parseFloat(qtyInput ? qtyInput.value : 0);
      if (btnAdd) {
        btnAdd.disabled = !(userPortSelectedETF && !isNaN(val) && val > 0);
      }
    }

    if (qtyInput) {
      qtyInput.addEventListener('input', validateAddBtn);
      qtyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (btnAdd && !btnAdd.disabled) {
            addHolding();
          }
        }
      });
    }

    // 5. Legg til beholdning
    function addHolding() {
      if (!userPortSelectedETF || !qtyInput) return;
      const rawVal = parseFloat(qtyInput.value);
      if (isNaN(rawVal) || rawVal <= 0) return;

      const price = getETFPrice(userPortSelectedETF) || 100;
      const computedVal = userPortCurrentUnit === 'shares' ? (rawVal * price) : rawVal;

      const existingIdx = userPortfolioHoldings.findIndex(h => h.isin === userPortSelectedETF.ISIN);
      if (existingIdx >= 0) {
        userPortfolioHoldings[existingIdx].rawValue = rawVal;
        userPortfolioHoldings[existingIdx].unit = userPortCurrentUnit;
        userPortfolioHoldings[existingIdx].price = price;
        userPortfolioHoldings[existingIdx].computedValue = computedVal;
      } else {
        if (userPortfolioHoldings.length >= 15) {
          alert('Du har nådd maksgrensen på 15 fond i denne porteføljesimuleringen.');
          return;
        }
        userPortfolioHoldings.push({
          isin: userPortSelectedETF.ISIN,
          ticker: userPortSelectedETF.Kortnavn || userPortSelectedETF.ISIN,
          name: userPortSelectedETF.Navn_Morningstar || userPortSelectedETF.Navn_Fil || userPortSelectedETF.ISIN,
          unit: userPortCurrentUnit,
          rawValue: rawVal,
          price: price,
          computedValue: computedVal
        });
      }

      saveUserPortfolio();
      renderPortfolioProfileTabs();
      renderUserPortfolioChips();
      calculateAndRenderStudioPortfolioAnalysis();

      // Reset inntastingsfelt
      qtyInput.value = '';
      userPortSelectedETF = null;
      if (elSelectedBadge) elSelectedBadge.style.display = 'none';
      if (searchInput) {
        searchInput.style.display = 'block';
        searchInput.value = '';
        searchInput.focus();
      }
      validateAddBtn();
    }

    if (btnAdd) {
      btnAdd.addEventListener('click', addHolding);
    }

    // 6. Tøm alle i aktiv portefølje
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        const active = getActivePortfolio();
        if (confirm(`Er du sikker på at du vil tømme beholdningene i "${active.name}"?`)) {
          userPortfolioHoldings = [];
          active.holdings = [];
          saveUserPortfolio();
          renderPortfolioProfileTabs();
          renderUserPortfolioChips();
          calculateAndRenderStudioPortfolioAnalysis();
        }
      });
    }

    // 7. Beregn kvantitativ analyse (samme logikk som multi-sammenligning)
    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', () => {
        analyzeUserPortfolio();
      });
    }
  }

  function getETFPrice(item) {
    if (!item) return null;
    if (item.Last_Price) return item.Last_Price;
    if (csState.manifest) {
      const entry = csState.manifest[item.ISIN] || (item.Kortnavn && csState.manifest[item.Kortnavn]);
      if (entry && entry.last_price) return entry.last_price;
    }
    return null;
  }

  function updateUserPortfolioPrices() {
    if (!userPortfolios || !userPortfolios.length) return;
    let changed = false;
    userPortfolios.forEach(port => {
      (port.holdings || []).forEach(h => {
        const item = rawData.find(d => d.ISIN === h.isin);
        if (item) {
          const newPrice = getETFPrice(item);
          if (newPrice && newPrice !== h.price) {
            h.price = newPrice;
            if (h.unit === 'shares') {
              h.computedValue = h.rawValue * newPrice;
            }
            changed = true;
          }
        }
      });
    });
    if (changed) {
      saveUserPortfolio();
      renderPortfolioProfileTabs();
      renderUserPortfolioChips();
      calculateAndRenderStudioPortfolioAnalysis();
    }
  }

  function renderUserPortfolioChips() {
    const wrap = document.getElementById('user-port-holdings-container');
    const grid = document.getElementById('user-port-chips-grid');
    const lblCount = document.getElementById('user-port-holdings-count');
    const lblTotal = document.getElementById('user-port-total-value');
    const btnClear = document.getElementById('btn-user-port-clear');
    const btnAnalyze = document.getElementById('btn-user-port-analyze');

    if (!wrap || !grid) return;

    const active = getActivePortfolio();
    const holdings = active.holdings || [];

    if (!holdings.length) {
      wrap.style.display = 'none';
      if (btnClear) btnClear.style.display = 'none';
      if (btnAnalyze) {
        btnAnalyze.disabled = true;
        btnAnalyze.title = 'Legg til minst 2 fond for å starte porteføljeanalysen';
      }
      return;
    }

    wrap.style.display = 'block';
    if (btnClear) btnClear.style.display = 'inline-flex';

    const totalVal = holdings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;

    grid.innerHTML = holdings.map((h, idx) => {
      const weight = Math.max(1, Math.round(((h.computedValue || 0) / totalVal) * 100));
      const valStr = h.unit === 'shares'
        ? `${h.rawValue} stk (${Math.round(h.computedValue).toLocaleString('no-NO')} kr)`
        : `${Math.round(h.rawValue).toLocaleString('no-NO')} kr`;

      return `
        <div class="user-port-chip" data-isin="${h.isin}">
          <span class="user-port-chip-ticker">${h.ticker}</span>
          <span class="user-port-chip-weight">${weight}%</span>
          <span class="user-port-chip-val">${valStr}</span>
          <button type="button" class="user-port-chip-remove" data-isin="${h.isin}" title="Fjern fra portefølje">&times;</button>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.user-port-chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isin = btn.dataset.isin;
        active.holdings = active.holdings.filter(h => h.isin !== isin);
        userPortfolioHoldings = active.holdings;
        saveUserPortfolio();
        renderPortfolioProfileTabs();
        renderUserPortfolioChips();
        calculateAndRenderStudioPortfolioAnalysis();
      });
    });

    if (lblCount) {
      lblCount.textContent = `Dine beholdninger (${holdings.length} fond valgt)`;
    }
    if (lblTotal) {
      lblTotal.textContent = `Beregnet totalverdi: ${Math.round(totalVal).toLocaleString('no-NO')} kr (100%)`;
    }

    if (btnAnalyze) {
      const canAnalyze = holdings.length >= 2;
      btnAnalyze.disabled = !canAnalyze;
      btnAnalyze.title = canAnalyze ? 'Klikk for å åpne full institusjonell risiko- og avkastningsanalyse' : 'Legg til minst 2 fond for å starte analysen';
    }
  }

  function analyzeUserPortfolio() {
    const active = getActivePortfolio();
    const holdings = active.holdings || [];
    if (holdings.length < 2) {
      alert('Legg til minst 2 fond i porteføljen din for å kunne beregne vektet risiko, Sharpe og korrelasjon.');
      return;
    }

    const totalVal = holdings.reduce((sum, h) => sum + (h.computedValue || 0), 0) || 1;
    const isinList = holdings.map(h => h.isin);

    portfolioWeights = {};
    let assigned = 0;
    holdings.forEach((h, idx) => {
      if (idx === holdings.length - 1) {
        portfolioWeights[h.isin] = Math.max(1, 100 - assigned);
      } else {
        const w = Math.round(((h.computedValue || 0) / totalVal) * 100);
        portfolioWeights[h.isin] = w;
        assigned += w;
      }
    });

    // Synkroniser også dokken nederst så de samme fondene er valgt
    selectedCompareISINs.clear();
    isinList.forEach(isin => selectedCompareISINs.add(isin));
    updateCompareDock();

    // Åpne samme studio direkte på 'portfolio'-fanen med brukerens egne vekter
    openComparisonStudio(isinList, 'portfolio');
  }

  // Start init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
