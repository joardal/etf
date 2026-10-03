/* Interaktiv 3D-projeksjon for fondsammenligning. Ingen eksterne biblioteker. */
(function () {
  'use strict';

  const DEFAULT_VIEW = { yaw: 0.72, pitch: 0.56, zoom: 1 };

  function project(x, y, z, view, width, height, scale) {
    const px = x - 0.5;
    const py = y - 0.5;
    const pz = z - 0.5;
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const horizontal = px * cy - py * sy;
    const depthPlane = px * sy + py * cy;
    const vertical = pz * cp - depthPlane * sp;
    const depth = pz * sp + depthPlane * cp;
    const perspective = 3.4 / (3.4 + depth * 0.46);
    return {
      x: width * 0.5 + horizontal * scale * perspective,
      y: height * 0.52 - vertical * scale * perspective,
      depth,
      perspective
    };
  }

  function line(ctx, a, b, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, align = 'left') {
    ctx.font = '600 11px Inter, sans-serif';
    const pad = 7;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + pad * 2;
    const left = align === 'right' ? x - boxWidth : x;
    ctx.fillStyle = 'rgba(8, 15, 30, 0.9)';
    ctx.fillRect(left, y - 14, boxWidth, 22);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.strokeRect(left + 0.5, y - 13.5, boxWidth - 1, 21);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, left + pad, y + 1);
  }

  function quantile(values, q) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.round((sorted.length - 1) * q)];
  }

  function render(ctx, width, height, items, view) {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0b1730');
    bg.addColorStop(0.54, '#0a1223');
    bg.addColorStop(1, '#08151e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.51, height * 0.45, 0, width * 0.51, height * 0.45, Math.max(width, height) * 0.65);
    glow.addColorStop(0, 'rgba(45, 212, 191, 0.08)');
    glow.addColorStop(0.55, 'rgba(99, 102, 241, 0.04)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    if (!items.length) return [];

    // Robuste akser gjør hovedskyen lesbar. Ytterpunkter beholdes, men festes til kanten.
    const maxVol = Math.max(5, Math.ceil(quantile(items.map(d => d.x), 0.98) / 5) * 5);
    const maxFall = Math.max(5, Math.ceil(quantile(items.map(d => d.y), 0.98) / 5) * 5);
    const minRet = Math.floor(quantile(items.map(d => d.z), 0.02) / 5) * 5;
    const maxRet = Math.max(minRet + 5, Math.ceil(quantile(items.map(d => d.z), 0.98) / 5) * 5);
    const scale = Math.min(width * 0.6, height * 0.52) * view.zoom;
    const p = (x, y, z) => project(x, y, z, view, width, height, scale);

    // Gulv: de to uavhengige risikomålene.
    ctx.save();
    ctx.setLineDash([3, 6]);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      line(ctx, p(t, 0, 0), p(t, 1, 0), 'rgba(45, 212, 191, 0.14)');
      line(ctx, p(0, t, 0), p(1, t, 0), 'rgba(129, 140, 248, 0.15)');
    }
    ctx.restore();

    // Kubens ramme gjør dybden mulig å lese også når punktene overlapper.
    const corners = [p(0, 0, 0), p(1, 0, 0), p(0, 1, 0), p(1, 1, 0),
      p(0, 0, 1), p(1, 0, 1), p(0, 1, 1), p(1, 1, 1)];
    const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7],
      [0, 4], [1, 5], [2, 6], [3, 7]];
    edges.forEach(([a, b]) => line(ctx, corners[a], corners[b], 'rgba(148, 163, 184, 0.17)'));
    line(ctx, corners[0], corners[1], '#818cf8', 2.2);
    line(ctx, corners[0], corners[2], '#38bdf8', 2.2);
    line(ctx, corners[0], corners[4], '#5eead4', 2.2);

    const plotted = items.map(d => {
      const x = Math.max(0, Math.min(1, d.x / maxVol));
      const y = Math.max(0, Math.min(1, d.y / maxFall));
      const z = Math.max(0, Math.min(1, (d.z - minRet) / (maxRet - minRet)));
      const clipped = d.x > maxVol || d.y > maxFall || d.z < minRet || d.z > maxRet;
      return { ...d, projected: p(x, y, z), normalizedReturn: z, clipped };
    });
    plotted.sort((a, b) => b.projected.depth - a.projected.depth);

    // Sortering på dybde gjør at punkter nær kamera tegnes sist.
    plotted.forEach(d => {
      const { x, y, perspective } = d.projected;
      const color = d.normalizedReturn >= 0.67 ? '#5eead4' : d.normalizedReturn >= 0.33 ? '#a5b4fc' : '#fb7185';
      const radius = (width < 600 ? 2.3 : 2.7) * perspective;
      ctx.globalAlpha = 0.69;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (d.clipped) {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.76)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Det gunstige hjørnet beskriver retning, ikke en anbefaling eller terskel.
    const good = p(0, 0, 1);
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 19;
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(good.x, good.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    label(ctx, 'Gunstig retning', good.x + 12, good.y - 6, '#86efac');

    const xEnd = p(1, 0, 0);
    const yEnd = p(0, 1, 0);
    const zEnd = p(0, 0, 1);
    label(ctx, `Volatilitet → ${maxVol.toFixed(0)} %`, xEnd.x + 8, xEnd.y + 10, '#a5b4fc');
    label(ctx, `Største fall → ${maxFall.toFixed(0)} %`, yEnd.x - 8, yEnd.y + 10, '#7dd3fc', 'right');
    label(ctx, `Avkastning ↑ ${maxRet.toFixed(0)} %`, zEnd.x + 8, zEnd.y + 30, '#99f6e4');
    label(ctx, `${minRet.toFixed(0)} %`, corners[0].x + 8, corners[0].y + 13, '#94a3b8');

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText('AVKASTNING · SVINGNINGER · STØRSTE FALL', 22, 30);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${items.length.toLocaleString('no-NO')} fond med minst 3 års kurshistorikk`, 22, 48);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Aksene dekker 2.–98. persentil. Ytterpunkter vises ved kanten med lys ring.', 22, height - 17);

    return plotted.map(d => ({
      item: d.item,
      x: d.x,
      y: d.y,
      z: d.z,
      px: d.projected.x,
      py: d.projected.y,
      depth: d.projected.depth
    }));
  }

  window.Analytics3D = { render, DEFAULT_VIEW };
})();
