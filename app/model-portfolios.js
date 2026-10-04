/* Historical, fixed-weight model portfolios. Data is built by build_model_portfolios.py. */
(() => {
  'use strict';

  const grid = document.getElementById('model-portfolios-grid');
  const note = document.getElementById('model-portfolios-note');
  const backdrop = document.getElementById('model-portfolio-modal');
  const dialog = backdrop?.querySelector('.model-modal-dialog');
  const content = document.getElementById('model-modal-content');
  if (!grid || !backdrop || !content) return;

  let portfolios = [];
  let chartPeriod = '3y';
  let previousFocus = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const percentage = value => `${value > 0 ? '+' : ''}${Number(value).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  const points = value => `${value > 0 ? '+' : ''}${Number(value).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
  const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });

  function visibleSeries(portfolio) {
    const metrics = portfolio.metrics[chartPeriod];
    const dates = portfolio.chart.filter(row => row.date >= metrics.from);
    if (dates.length < 2) return [];
    const basePortfolio = dates[0].portfolio;
    const baseBenchmark = dates[0].benchmark;
    return dates.map(row => ({
      date: row.date,
      portfolio: 100 * row.portfolio / basePortfolio,
      benchmark: 100 * row.benchmark / baseBenchmark,
    }));
  }

  function chartSvg(portfolio) {
    const series = visibleSeries(portfolio);
    if (series.length < 2) return '<div class="model-chart-empty">Graf er ikke tilgjengelig</div>';
    const width = 480, height = 156, top = 12, bottom = 24;
    const all = series.flatMap(row => [row.portfolio, row.benchmark]);
    const low = Math.min(...all), high = Math.max(...all);
    const padding = Math.max(2, (high - low) * 0.13);
    const min = low - padding, max = high + padding;
    const y = value => top + (max - value) / (max - min) * (height - top - bottom);
    const x = index => 2 + index / (series.length - 1) * (width - 4);
    const line = key => series.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
    const portfolioPath = line('portfolio');
    const benchmarkPath = line('benchmark');
    const baseLine = y(100);
    const areaPath = `${portfolioPath} L${x(series.length - 1).toFixed(1)},${height - bottom} L2,${height - bottom} Z`;
    const last = series[series.length - 1];
    const chartTitle = `${portfolio.name}: portefølje ${percentage((last.portfolio - 100))}, referanse ${percentage((last.benchmark - 100))} i perioden ${chartPeriod === '1m' ? 'én måned' : 'tre år'}`;
    return `<svg class="model-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chartTitle)}" preserveAspectRatio="none">
      <defs><linearGradient id="model-fill-${portfolio.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${portfolio.color}" stop-opacity=".25"/><stop offset="100%" stop-color="${portfolio.color}" stop-opacity="0"/></linearGradient></defs>
      <line x1="2" x2="${width - 2}" y1="${baseLine.toFixed(1)}" y2="${baseLine.toFixed(1)}" stroke="rgba(255,255,255,.13)" stroke-dasharray="4 6"/>
      <path d="${areaPath}" fill="url(#model-fill-${portfolio.id})"/>
      <path d="${benchmarkPath}" fill="none" stroke="#78849a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${portfolioPath}" fill="none" stroke="${portfolio.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(series.length - 1).toFixed(1)}" cy="${y(last.portfolio).toFixed(1)}" r="4.5" fill="${portfolio.color}" stroke="#111a2b" stroke-width="2"/>
    </svg>`;
  }

  function metricRow(portfolio, key, label) {
    const metric = portfolio.metrics[key];
    return `<div class="model-metric-row">
      <div class="model-metric-period">${label}</div>
      <div class="model-metric-value">${percentage(metric.portfolio)}</div>
      <div class="model-metric-reference">Referanse ${percentage(metric.benchmark)}</div>
      <div class="model-metric-excess ${metric.excess_pp >= 0 ? 'is-positive' : 'is-negative'}">${points(metric.excess_pp)} mot referanse</div>
    </div>`;
  }

  function cardHtml(portfolio) {
    return `<article class="model-card model-card-${portfolio.id}" style="--model-accent:${portfolio.color}">
      <div class="model-card-top"><span class="model-card-eyebrow">${escapeHtml(portfolio.eyebrow)}</span><span class="model-card-date">Per ${dateLabel(portfolio.as_of)}</span></div>
      <h3>${escapeHtml(portfolio.name)}</h3>
      <p class="model-card-summary">${escapeHtml(portfolio.summary)}</p>
      <div class="model-chart-wrap">${chartSvg(portfolio)}</div>
      <div class="model-chart-bottom"><span>${dateLabel(portfolio.metrics[chartPeriod].from)}</span><span class="model-chart-legend"><i></i>Portefølje <i></i>Referanse</span><span>${dateLabel(portfolio.as_of)}</span></div>
      <div class="model-card-metrics">${metricRow(portfolio, '1m', 'Siste måned')}${metricRow(portfolio, '3y', 'Siste 3 år')}</div>
      <div class="model-card-bottom"><div><span class="model-benchmark-label">REFERANSE</span><strong>${escapeHtml(portfolio.benchmark.name)}</strong></div><button type="button" class="model-composition-button" data-model="${portfolio.id}">Se sammensetning <span aria-hidden="true">↗</span></button></div>
    </article>`;
  }

  function render() {
    grid.innerHTML = portfolios.map(cardHtml).join('');
    document.querySelectorAll('.model-period-btn').forEach(button => {
      const active = button.dataset.period === chartPeriod;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openComposition(portfolio, trigger) {
    previousFocus = trigger;
    const holdingRows = portfolio.holdings.map(holding => `<div class="model-holding">
      <div class="model-holding-head"><div><span class="model-holding-ticker">${escapeHtml(holding.ticker)}</span><strong>${escapeHtml(holding.name)}</strong><span class="model-holding-isin">${escapeHtml(holding.isin)}</span></div><b>${holding.weight.toLocaleString('nb-NO')} %</b></div>
      <div class="model-holding-track"><span style="width:${holding.weight}%"></span></div>
      <p>${escapeHtml(holding.reason)}</p>
    </div>`).join('');
    content.innerHTML = `<div class="model-modal-eyebrow" style="color:${portfolio.color}">${escapeHtml(portfolio.eyebrow)}</div>
      <h2 id="model-modal-title">${escapeHtml(portfolio.name)}</h2>
      <p class="model-modal-lead">${escapeHtml(portfolio.summary)}</p>
      <div class="model-modal-focus"><span>DET VI HAR VEKTLEGT</span><p>${escapeHtml(portfolio.emphasis)} Fondene er vurdert ut fra risikojustert avkastning, fallhøyde, samvariasjon, kostnad og tilgjengelig kurshistorikk.</p></div>
      <div class="model-modal-stats"><div><span>Volatilitet 3 år</span><strong>${portfolio.risk_3y.annual_volatility.toLocaleString('nb-NO')} %</strong></div><div><span>Største fall 3 år</span><strong>${portfolio.risk_3y.max_drawdown.toLocaleString('nb-NO')} %</strong></div><div><span>Vektet årlig avgift</span><strong>${portfolio.weighted_fee.toLocaleString('nb-NO')} %</strong></div></div>
      <h3 class="model-holdings-title">Fond og vekter <span>100 % totalt</span></h3>
      <div class="model-holdings">${holdingRows}</div>
      <div class="model-modal-method"><strong>Historikk og referanse</strong><p>Porteføljen er simulert i EUR med dagens fond og vekter fra ${dateLabel(portfolio.metrics['3y'].from)} til ${dateLabel(portfolio.as_of)}. Daglige utbyttejusterte kurser, rebalansering ved starten av hvert kvartal. Referansen (${escapeHtml(portfolio.benchmark.name)}) beregnes på nøyaktig de samme datoene med samme rebalansering. ETF-kurser brukes som proxy for indeksene. Avkastningen inkluderer fondenes løpende kostnader, men ikke kurtasje, spread eller skatt. Sammensetningen ble valgt i ettertid; den viste historikken er ikke en tidligere investert portefølje.</p></div>`;
    backdrop.hidden = false;
    document.body.classList.add('model-modal-open');
    dialog.focus();
  }

  function openMethod(trigger) {
    previousFocus = trigger;
    content.innerHTML = `<div class="model-modal-eyebrow">METODE</div>
      <h2 id="model-modal-title">Slik er tallene beregnet</h2>
      <p class="model-modal-lead">Fondene er valgt fra prosjektets ETF-univers etter en vurdering av Sharpe, Sortino, svingninger, historiske fall, samvariasjon, kostnad og kurshistorikk. Vektene er faste til de vurderes på nytt; daglige kurser endrer resultatene, ikke sammensetningen.</p>
      <div class="model-modal-focus"><span>HISTORISK SIMULERING</span><p>Vi bruker utbyttejusterte, EUR-noterte ETF-kurser på felles handelsdager. Hver portefølje og referanse starter på 100 og rebalanseres ved starten av hvert kvartal. Én måned og tre år er samlet avkastning for periodene; forskjellen vises i prosentpoeng.</p></div>
      <div class="model-modal-method"><strong>Referanser</strong><p>Lav risiko sammenlignes med 25 % EUNL / 75 % XEON. Moderat/høy risiko sammenlignes med 85 % EUNL / 15 % XEON. Høy risiko sammenlignes med EUNL alene. EUNL følger MSCI World; XEON er et euro overnight-fond som byttet til en €STR-basert indeks i november 2023. Referansene bruker de samme handelsdagene og rebalanseringsreglene som porteføljene.</p></div>
      <div class="model-modal-method"><strong>Hva historikken viser</strong><p>Avkastningen er netto etter fondenes løpende kostnader, men uten kurtasje, spread og skatt. Porteføljene ble satt sammen etter at historikken var kjent, så dette er ikke dokumentert faktisk investeringshistorikk eller en test uten informasjon fra fremtiden. Siste felles kursdato vises på kortene.</p></div>`;
    backdrop.hidden = false;
    document.body.classList.add('model-modal-open');
    dialog.focus();
  }

  function closeComposition() {
    backdrop.hidden = true;
    document.body.classList.remove('model-modal-open');
    previousFocus?.focus();
  }

  document.querySelector('.model-period-toggle')?.addEventListener('click', event => {
    const button = event.target.closest('.model-period-btn');
    if (!button || !['1m', '3y'].includes(button.dataset.period)) return;
    chartPeriod = button.dataset.period;
    render();
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('.model-composition-button');
    if (!button) return;
    const portfolio = portfolios.find(entry => entry.id === button.dataset.model);
    if (portfolio) openComposition(portfolio, button);
  });
  document.getElementById('model-modal-close')?.addEventListener('click', closeComposition);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeComposition(); });
  document.addEventListener('keydown', event => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') closeComposition();
    if (event.key === 'Tab') {
      event.preventDefault();
      document.getElementById('model-modal-close').focus();
    }
  });

  fetch('./model_portfolios.json', { cache: 'no-store' })
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then(data => {
      if (!Array.isArray(data.portfolios) || data.portfolios.length !== 3) throw new Error('Ufullstendige porteføljedata');
      portfolios = data.portfolios;
      render();
      const last = portfolios.map(portfolio => portfolio.as_of).sort()[0];
      const ageDays = Math.floor((Date.now() - new Date(`${last}T12:00:00`).getTime()) / 86400000);
      note.innerHTML = `Simulert historikk med dagens fond og vekter · EUR · Utbyttejusterte kurser · Kvartalsvis rebalansering · Siste felles kurs ${dateLabel(last)}${ageDays > 7 ? ' <strong class="model-data-stale">· Kursene er eldre enn én uke</strong>' : ''}. <button type="button" id="model-method-link">Slik er tallene beregnet</button>`;
      document.getElementById('model-method-link').addEventListener('click', () => {
        openMethod(document.getElementById('model-method-link'));
      });
    })
    .catch(error => {
      grid.innerHTML = '<div class="model-portfolios-loading is-error">Porteføljene kunne ikke lastes. Prøv å oppdatere siden.</div>';
      console.error('Model portfolio data:', error);
    });
})();
