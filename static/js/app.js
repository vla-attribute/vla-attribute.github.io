(function () {
  const DATA = window.SITE_DATA;
  const conditions = DATA.conditions; // in fixed order: nominal, light, object_add, blur, fog, blur+fog
  const curated = DATA.curated_episodes;
  // chart display order: highest empirical success rate first (descending)
  const chartOrder = conditions.slice().sort((a, b) => b.success_rate - a.success_rate);

  const palette = {
    base: "#d4d4d8",
    highlight: "#111827",
    grid: "#e5e5e5",
    text: "#52525b"
  };

  let chart;
  let selectedCondition = "nominal";

  function byCondition(cond) {
    return curated.filter((e) => e.condition === cond);
  }

  function renderChart() {
    const ctx = document.getElementById("sensitivity-chart").getContext("2d");
    const labels = chartOrder.map((c) => c.label);
    const rates = chartOrder.map((c) => Math.round(c.success_rate * 100));
    const colors = chartOrder.map((c) =>
      c.condition === selectedCondition ? palette.highlight : palette.base
    );

    if (chart) {
      chart.data.datasets[0].backgroundColor = colors;
      chart.update();
      return;
    }

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Empirical task success rate (%)",
            data: rates,
            backgroundColor: colors,
            borderRadius: 6,
            maxBarThickness: 56
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          selectCondition(chartOrder[idx].condition);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const c = chartOrder[item.dataIndex];
                return `${c.success} / ${c.n} episodes succeeded (${item.formattedValue}%)`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: palette.grid },
            ticks: { callback: (v) => v + "%" }
          },
          x: {
            grid: { display: false },
            ticks: { color: palette.text }
          }
        }
      }
    });
  }

  function renderVideos() {
    const wrap = document.getElementById("condition-videos");
    const items = byCondition(selectedCondition);
    wrap.innerHTML = "";
    items.forEach((ep) => {
      const badge =
        ep.outcome === "success"
          ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">success</span>'
          : '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">failure</span>';
      const fig = document.createElement("figure");
      fig.className = "rounded-2xl overflow-hidden bg-neutral-100 shadow";
      fig.innerHTML = `
        <video class="w-full aspect-video bg-black" controls playsinline preload="metadata" poster="${ep.poster}">
          <source src="${ep.video}" type="video/mp4" />
          Your browser doesn't support HTML5 video.
        </video>
        <figcaption class="p-3 text-sm text-neutral-600 flex items-center justify-between gap-2">
          <span>${ep.caption}</span>${badge}
        </figcaption>`;
      wrap.appendChild(fig);
    });
  }

  function renderStatCallout() {
    const c = conditions.find((c) => c.condition === selectedCondition);
    const el = document.getElementById("condition-stat");
    el.innerHTML = `<strong>${c.success}/${c.n}</strong> real hardware episodes succeeded under
      <strong>${c.label.toLowerCase()}</strong> &mdash; a
      <strong>${Math.round(c.success_rate * 100)}%</strong> success rate
      (${Math.round(c.failure_rate * 100)}% failure rate), vs. 96% success rate with no corruption present.`;
  }

  function selectCondition(cond) {
    selectedCondition = cond;
    document.querySelectorAll(".cond-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.cond === cond));
    });
    renderChart();
    renderVideos();
    renderStatCallout();
  }

  function initConditionButtons() {
    const bar = document.getElementById("condition-buttons");
    chartOrder.forEach((c) => {
      const btn = document.createElement("button");
      btn.className =
        "cond-btn px-3 py-1.5 rounded-full border border-neutral-300 text-sm";
      btn.textContent = c.label;
      btn.dataset.cond = c.condition;
      btn.setAttribute("aria-pressed", String(c.condition === selectedCondition));
      btn.addEventListener("click", () => selectCondition(c.condition));
      bar.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initConditionButtons();
    renderChart();
    renderVideos();
    renderStatCallout();
  });
})();
