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
    // Table I — presence detection accuracy
    bar(
      "chart-presence",
      ["Sim OpenVLA", "Sim π-0.5", "HW π-0.5", "VLM (few-shot)"],
      [
        { label: "Single", data: [99.81, 99.82, 100.0, 99.33], backgroundColor: ACCENT_SOFT, borderRadius: 4, labelFmt: (v) => v.toFixed(1) },
        { label: "Multi", data: [99.47, 99.66, 100.0, 83.81], backgroundColor: ACCENT, borderRadius: 4, labelFmt: (v) => v.toFixed(1) },
      ],
      { scales: commonScales(100, (v) => v + "%") }
    );

    // Table II — frame-level F1
    bar(
      "chart-f1",
      ["Sim OpenVLA", "Sim π-0.5", "HW π-0.5"],
      [
        { label: "Single F1", data: [0.89, 0.5, 0.73], backgroundColor: ACCENT_SOFT, borderRadius: 4, labelFmt: (v) => v.toFixed(2) },
        { label: "Multi F1", data: [0.96, 0.74, 0.89], backgroundColor: ACCENT, borderRadius: 4, labelFmt: (v) => v.toFixed(2) },
      ],
      { scales: commonScales(1, (v) => v.toFixed(1)) }
    );

    // Table IV — attribution by method, one small chart per metric
    const methods = ["Monolithic", "VLM", "Ours"];
    const methodColors = [NEUTRAL, NEUTRAL, ACCENT];
    bar("chart-attr-presence", methods, [{ data: [99.7, 90.3, 99.5], backgroundColor: methodColors, borderRadius: 4, labelFmt: (v) => v.toFixed(1) }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Presence (%)", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(100, (v) => v),
    });
    bar("chart-attr-corr", methods, [{ data: [0.68, 0.64, 0.87], backgroundColor: methodColors, borderRadius: 4, labelFmt: (v) => v.toFixed(2) }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Correlation (r)", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(1, (v) => v.toFixed(1)),
    });
    bar("chart-attr-top1", methods, [{ data: [0.09, 0.99, 0.85], backgroundColor: methodColors, borderRadius: 4, labelFmt: (v) => v.toFixed(2) }], {
      plugins: { legend: { display: false }, title: { display: true, text: "Top-1 accuracy", font: { size: 12 }, color: "#52525b" } },
      scales: commonScales(1, (v) => v.toFixed(1)),
    });

    // Table V — ablation, RF-corr with std shown as a caption via tooltip
    const ablationLabels = ["Full (final)", "− presence loss", "− routing anchor", "− adversary", "− INLP"];
    const ablationVals = [0.87, 0.49, 0.53, 0.57, 0.6];
    const ablationStd = [0.06, 0.22, 0.07, 0.06, 0.2];
    bar(
      "chart-ablation",
      ablationLabels,
      [
        {
          label: "RF-corr (↑ better)",
          data: ablationVals,
          backgroundColor: ablationLabels.map((_, i) => (i === 0 ? ACCENT : NEUTRAL)),
          borderRadius: 4,
          labelFmt: (v, i) => v.toFixed(2),
        },
      ],
      {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => `RF-corr ${item.formattedValue} ± ${ablationStd[item.dataIndex]}` } },
        },
        scales: commonScales(1, (v) => v.toFixed(1)),
      }
    );
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

  function initPredictor(videoId, canvasId, valueId, points) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    const valueEl = document.getElementById(valueId);
    if (!video || !canvas || !valueEl) return;

    function update() {
      const dur = video.duration || 1;
      const frac = dur ? Math.min(1, video.currentTime / dur) : 0;
      const risk = drawSparkline(canvas, points, frac);
      const pct = Math.round(risk * 100);
      valueEl.textContent = pct + "%";
      valueEl.style.color = lerpColor(GREEN, RED, risk);
    }
    video.addEventListener("timeupdate", update);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("seeked", update);
    window.addEventListener("resize", update);
    update();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPredictor("pred-video-nominal", "pred-chart-nominal", "pred-value-nominal", [
      [0, 0.05], [0.25, 0.07], [0.5, 0.06], [0.75, 0.09], [1, 0.08],
    ]);
    initPredictor("pred-video-fail", "pred-chart-fail", "pred-value-fail", [
      [0, 0.08], [0.2, 0.15], [0.4, 0.32], [0.6, 0.55], [0.8, 0.78], [1, 0.91],
    ]);
  });
})();
