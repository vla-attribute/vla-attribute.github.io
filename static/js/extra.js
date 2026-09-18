(function () {
  // ---- shared: direct value-label plugin for Chart.js bar charts ----
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.fillStyle = "#52525b";
      ctx.textAlign = "center";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v === null || v === undefined) return;
          const label = ds.labelFmt ? ds.labelFmt(v) : v;
          ctx.fillText(label, bar.x, bar.y - 5);
        });
      });
      ctx.restore();
    },
  };
  Chart.register(valueLabels);

  const ACCENT = "#111827";
  const ACCENT_SOFT = "rgba(17,24,39,0.35)";
  const NEUTRAL = "#d4d4d8";
  const GRID = "#e5e5e5";
  const commonScales = (max, fmt) => ({
    y: { beginAtZero: true, max, grid: { color: GRID }, ticks: { callback: fmt } },
    x: { grid: { display: false } },
  });

  function bar(id, labels, datasets, opts) {
    const el = document.getElementById(id);
    if (!el) return;
    new Chart(el.getContext("2d"), {
      type: "bar",
      data: { labels, datasets },
      options: Object.assign(
        {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18 } },
          plugins: { legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        },
        opts
      ),
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Presence detection accuracy — canvas x-labels hidden; real HTML labels overlaid so MathJax renders π.
    const presLabels = ["Ours (OpenVLA)", "Ours (\\(\\pi_{0.5}\\))", "VLM (few-shot)"];
    function placePresLabels(chart) {
      const layer = document.getElementById("chart-presence-xlabels");
      if (!layer || !chart.scales || !chart.scales.x) return;
      const xs = chart.scales.x;
      layer.innerHTML = presLabels.map((h, i) =>
        `<span style="position:absolute;left:${xs.getPixelForTick(i)}px;bottom:0;transform:translateX(-50%);font-size:12px;color:#52525b;white-space:nowrap;">${h}</span>`
      ).join("");
      if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([layer]).catch(() => {});
    }
    const presEl = document.getElementById("chart-presence");
    if (presEl) {
      const presChart = new Chart(presEl.getContext("2d"), {
        type: "bar",
        data: { labels: ["", "", ""], datasets: [{ data: [99.4, 99.3, 90.3], backgroundColor: [ACCENT, ACCENT, NEUTRAL], borderRadius: 4, labelFmt: (v) => v.toFixed(1) }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 18, bottom: 22 } },
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 100, grid: { color: GRID }, ticks: { callback: (v) => v + "%" } },
            x: { grid: { display: false }, ticks: { display: false } },
          },
          animation: { onComplete() { placePresLabels(this); } },
        },
      });
      window.addEventListener("resize", () => placePresLabels(presChart));
      if (window.MathJax && MathJax.startup && MathJax.startup.promise)
        MathJax.startup.promise.then(() => placePresLabels(presChart));
    }

    // Failure recognition ROC-AUC across episode positions (OpenVLA, Ours SigLIP). Line chart.
    const frPos = ["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"];
    function failRecogChart(id, title, oursColor, oursData, oracleVal) {
      const el = document.getElementById(id);
      if (!el) return;
      new Chart(el.getContext("2d"), {
        type: "line",
        data: {
          labels: frPos,
          datasets: [
            { label: "Ours", data: oursData, borderColor: oursColor, backgroundColor: "rgba(17,24,39,0.05)", tension: 0.3, fill: true, pointRadius: 3, borderWidth: 2 },
            { label: "Oracle", data: frPos.map(() => oracleVal), borderColor: "#a1a1aa", borderDash: [5, 4], pointRadius: 0, fill: false, borderWidth: 1.5 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
            title: { display: true, text: title, font: { size: 13 }, color: "#111827" },
            valueLabels: false,
          },
          scales: {
            y: { min: 0.4, max: 1.0, grid: { color: GRID }, ticks: { callback: (v) => v.toFixed(1) }, title: { display: true, text: "ROC-AUC", font: { size: 11 }, color: "#52525b" } },
            x: { grid: { display: false }, title: { display: true, text: "episode position", font: { size: 11 }, color: "#52525b" } },
          },
        },
      });
    }
    failRecogChart("chart-failrecog-corrupt", "Corrupted episodes", ACCENT, [0.918, 0.918, 0.917, 0.932, 0.927, 0.925], 0.862);
    failRecogChart("chart-failrecog-nominal", "Nominal episodes", "#6366f1", [0.510, 0.655, 0.485, 0.722, 0.679, 0.723], 0.500);

    // Main table — attribution by method (OpenVLA-balanced), removal-effect MAE + regret (↓ better).
    // All three VLM variants shown, as in the paper. Oracle (=0) omitted from bars as the lower bound.
    const methods = ["Monolithic", "VLM (Terra)", "VLM (Sol)", "VLM (Opus 5)", "Ours (SAFE)", "Ours (SigLIP)"];
    const methodColors = [NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, ACCENT_SOFT, ACCENT];
    const fmt3 = (v) => v.toFixed(3);
    bar("chart-attr-single", methods, [{ data: [0.416, 0.207, 0.246, 0.245, 0.104, 0.095], backgroundColor: methodColors, borderRadius: 4, labelFmt: fmt3 }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Single-corruption MAE ↓", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(0.45, (v) => v.toFixed(2)),
    });
    bar("chart-attr-multi", methods, [{ data: [0.265, 0.237, 0.308, 0.292, 0.117, 0.101], backgroundColor: methodColors, borderRadius: 4, labelFmt: fmt3 }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Multi-corruption MAE ↓", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(0.45, (v) => v.toFixed(2)),
    });
    bar("chart-attr-regret", methods, [{ data: [0.256, 0.285, 0.098, 0.107, 0.029, 0.011], backgroundColor: methodColors, borderRadius: 4, labelFmt: fmt3 }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Regret ↓", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(0.3, (v) => v.toFixed(2)),
    });

    // Ablation table (OpenVLA-balanced, 5 seeds) — current TSr multi-column framing.
    // cols: config, presence%, MAE, regret, absent-block norm, z_s-leak-AUC%. `bad` flags a wrecked column.
    const ablationRows = [
      { cfg: "Full (final)", pres: "99.4", mae: "0.092", reg: "0.010", norm: "0.31", leak: "75.1", full: true },
      { cfg: "− adversary", pres: "99.5", mae: "0.080", reg: "0.014", norm: "0.21", leak: "99.8", badLeak: true },
      { cfg: "− anchor", pres: "99.4", mae: "0.089", reg: "0.040", norm: "30.3", leak: "78.0", badNorm: true },
      { cfg: "− consistency", pres: "99.5", mae: "0.132", reg: "0.016", norm: "0.06", leak: "72.1", badMae: true },
      { cfg: "− INLP", pres: "99.5", mae: "0.084", reg: "0.016", norm: "0.35", leak: "82.6" },
      { cfg: "− presence", pres: "49.3", mae: "0.370", reg: "0.245", norm: "0.52", leak: "68.6", badMae: true, badPres: true },
    ];
    const tb = document.getElementById("ablation-tbody");
    if (tb) {
      const cell = (v) => `<td>${v}</td>`;
      tb.innerHTML = ablationRows.map((r) =>
        `<tr${r.full ? ' style="background:#fafafa;font-weight:600"' : ""}>` +
        `<td style="text-align:left">${r.cfg}</td>` +
        cell(r.pres, r.badPres) + cell(r.mae, r.badMae) + cell(r.reg) +
        cell(r.norm, r.badNorm) + cell(r.leak, r.badLeak) + `</tr>`
      ).join("");
    }
  });

  // ---- Rollout & failure predictor: synthetic risk curves synced to video playback ----
  function lerpColor(a, b, t) {
    const pa = a.match(/\d+/g).map(Number);
    const pb = b.match(/\d+/g).map(Number);
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const GREEN = "rgb(5,150,105)"; // emerald-600
  const RED = "rgb(225,29,72)"; // rose-600

  function riskAt(points, frac) {
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i];
      const [t1, v1] = points[i + 1];
      if (frac >= t0 && frac <= t1) {
        const localT = (frac - t0) / (t1 - t0 || 1);
        return v0 + (v1 - v0) * localT;
      }
    }
    return points[points.length - 1][1];
  }

  function drawSparkline(canvas, points, frac) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2;
    const h = canvas.height = 70 * 2;
    ctx.clearRect(0, 0, w, h);
    ctx.scale(1, 1);
    const pad = 6 * 2;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;

    // faint grid
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = pad + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    const toXY = ([t, v]) => [pad + t * plotW, pad + (1 - v) * plotH];

    // area fill
    ctx.beginPath();
    points.forEach(([t, v], i) => {
      const [x, y] = toXY([t, v]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad + plotW, pad + plotH);
    ctx.lineTo(pad, pad + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(120,120,130,0.08)";
    ctx.fill();

    // line
    ctx.beginPath();
    points.forEach(([t, v], i) => {
      const [x, y] = toXY([t, v]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#a1a1aa";
    ctx.lineWidth = 2 * 2;
    ctx.stroke();

    // marker
    const risk = riskAt(points, frac);
    const [mx, my] = toXY([frac, risk]);
    const color = lerpColor(GREEN, RED, risk);
    ctx.beginPath();
    ctx.moveTo(mx, pad);
    ctx.lineTo(mx, pad + plotH);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2 * 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(mx, my, 5 * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    return risk;
  }

  // ---- live per-corruption attribution bars (Δ̂ₖ), synced to playback ----
  const DELTA_FAMS = ["Blur", "Fog", "Object", "Light"];   // model family order
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function interpVec(pts, frac) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (frac >= a[0] && frac <= b[0]) {
        const lt = (frac - a[0]) / ((b[0] - a[0]) || 1);
        return a.slice(1).map((v, k) => v + (b[k + 1] - v) * lt);
      }
    }
    return pts[pts.length - 1].slice(1);
  }
  function drawDeltaBars(canvas, pts, frac) {
    const ctx = canvas.getContext("2d");
    const w = (canvas.width = canvas.clientWidth * 2);
    const h = (canvas.height = 104 * 2);
    ctx.clearRect(0, 0, w, h);
    const vals = interpVec(pts, frac).map((v) => Math.max(0, v)); // ReLU, as in Δ̂ₖ
    const n = vals.length, rowH = h / n, maxV = 0.6;
    const labelW = 58 * 2, valW = 46 * 2, barX = labelW, barW = w - labelW - valW;
    const mx = vals.indexOf(Math.max(...vals));
    ctx.font = "600 20px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    for (let k = 0; k < n; k++) {
      const cy = rowH * k + rowH / 2, bh = Math.min(20, rowH - 8);
      ctx.fillStyle = "#52525b"; ctx.textAlign = "left";
      ctx.fillText(DELTA_FAMS[k], 6, cy);
      ctx.fillStyle = "#f1f1f3"; rr(ctx, barX, cy - bh / 2, barW, bh, 6); ctx.fill();
      const frW = Math.min(1, vals[k] / maxV) * barW;
      const hot = k === mx && vals[k] > 0.03;
      ctx.fillStyle = hot ? "#111827" : "#cfcfd4";
      rr(ctx, barX, cy - bh / 2, Math.max(3, frW), bh, 6); ctx.fill();
      ctx.fillStyle = hot ? "#111827" : "#71717a"; ctx.textAlign = "right";
      ctx.fillText(vals[k].toFixed(2), w - 6, cy);
    }
  }

  function initPredictor(videoId, canvasId, valueId, points, deltaId, deltaPts) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    const valueEl = document.getElementById(valueId);
    const deltaCanvas = deltaId ? document.getElementById(deltaId) : null;
    if (!video || !canvas || !valueEl) return;

    function update() {
      const dur = video.duration || 1;
      const frac = dur ? Math.min(1, video.currentTime / dur) : 0;
      const risk = drawSparkline(canvas, points, frac);
      const pct = Math.round(risk * 100);
      valueEl.textContent = pct + "%";
      valueEl.style.color = lerpColor(GREEN, RED, risk);
      if (deltaCanvas && deltaPts) drawDeltaBars(deltaCanvas, deltaPts, frac);
    }
    video.addEventListener("timeupdate", update);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("seeked", update);
    window.addEventListener("resize", update);
    update();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Real per-frame failure risk r̂ and per-corruption attribution Δ̂ₖ (family order: blur, fog, object, light)
    // from the shipped hardware checkpoint (5-seed mean); position = fraction through the rollout.
    initPredictor("pred-video-nominal", "pred-chart-nominal", "pred-value-nominal",
      [[0, 0.032], [0.111, 0.03], [0.222, 0.03], [0.333, 0.045], [0.444, 0.056],
       [0.556, 0.072], [0.667, 0.043], [0.778, 0.034], [0.889, 0.048], [1, 0.12]],
      "pred-delta-nominal",
      [[0, 0.001, -0.016, 0, -0.012], [0.111, 0, -0.015, -0.001, -0.011], [0.222, 0, -0.015, -0.001, -0.01],
       [0.333, -0.001, -0.011, 0, -0.005], [0.444, -0.002, -0.013, -0.003, -0.018], [0.556, -0.002, -0.018, -0.003, -0.018],
       [0.667, -0.001, -0.01, -0.004, -0.009], [0.778, 0, -0.01, 0.001, -0.003], [0.889, -0.001, -0.012, -0.005, -0.012],
       [1, 0, -0.028, -0.004, -0.052]]);
    initPredictor("pred-video-fail", "pred-chart-fail", "pred-value-fail",
      [[0, 0.599], [0.017, 0.593], [0.119, 0.53], [0.22, 0.626], [0.339, 0.503], [0.441, 0.438],
       [0.542, 0.644], [0.661, 0.587], [0.763, 0.7], [0.864, 0.636], [0.983, 0.466], [1, 0.479]],
      "pred-delta-fail",
      [[0, -0.087, 0.547, -0.008, -0.056], [0.017, -0.088, 0.542, -0.008, -0.056], [0.119, -0.063, 0.414, -0.009, -0.045],
       [0.22, -0.073, 0.501, -0.009, -0.046], [0.339, -0.076, 0.395, -0.009, -0.05], [0.441, -0.074, 0.369, -0.011, -0.055],
       [0.542, -0.079, 0.569, -0.004, -0.045], [0.661, -0.071, 0.498, -0.012, -0.054], [0.763, -0.055, 0.479, -0.011, -0.046],
       [0.864, -0.078, 0.524, -0.001, -0.044], [0.983, -0.087, 0.433, 0, -0.058], [1, -0.086, 0.44, -0.012, -0.053]]);
  });
})();
