/* Interactive pipeline / loss explorer.
 * Click an OUTPUT (Presence, Risk, Attribution) to see which components produce it
 * and which training losses shape it. Data object is edited to match the paper
 * (vca/model.py + vca/train.py); rendering/interaction is data-driven below.
 */
(function () {
  // ------------------------------------------------------------------ DATA
  // Corruption blocks (K=6), each a d_cblock-dim slice of the corruption latent z_c.
  const BLOCKS = ["light", "table", "view", "object_add", "blur", "fog"];

  // Pipeline stages (left -> right). `col` groups them into visual columns.
  const NODES = {
    img:    { col: 0, title: "Image  φₜ", sub: "single RGB frame",
              body: "The one frame the policy actually receives — possibly with several corruptions co-occurring." },
    txt:    { col: 0, title: "Task instruction  ℓ", sub: "natural language",
              body: "The task prompt (e.g. &ldquo;put the cube in the bowl&rdquo;), encoded together with the image." },
    siglip: { col: 1, title: "SigLIP encoder", sub: "frozen",
              body: "A frozen image-and-text encoder maps the image and instruction to a 1161-d feature (1152-d SigLIP image + a 9-d projection of the task embedding). Everything downstream is a light head on top." },
    zs:     { col: 2, title: "Scene latent \\(z_s\\)", sub: "task / content",
              body: "Encodes what the task and scene are. Corruption information is actively <em>pushed out</em> of \\(z_s\\) by the adversaries and INLP, so it can't shortcut the attribution." },
    zc:     { col: 2, title: "Corruption latent \\(z_c\\)", sub: "K=6 blocks",
              body: "Split into one block per corruption type. Each block is meant to carry only its own corruption's signal — this is what makes per-corruption removal meaningful.", blocks: true },
    phead:  { col: 3, title: "Presence heads", sub: "one per block",
              body: "A small linear head on each \\(z_c\\) block predicts whether that corruption is present: \\(\\hat\\rho_k = \\sigma(w_k^\\top z_c^{(k)} + b_k)\\)." },
    head:   { col: 3, title: "Shared failure head", sub: "risk from \\(z_s, z_c\\)",
              body: "A small shared head reads both latents together and predicts the failure risk \\(\\hat r(z_c; z_s)\\). Attribution simply re-runs this same head with one corruption block zeroed." },
  };

  // Outputs the user can click.
  const OUTPUTS = {
    presence: {
      title: "Presence \\(\\hat\\rho_k\\)",
      tag: "what's in frame",
      formula: "\\(\\hat\\rho_k(\\phi_t,\\ell) = \\sigma\\!\\big(w_k^\\top z_c^{(k)} + b_k\\big)\\)",
      plain: "For each corruption k, the probability it is present in the current image. Read by a per-block presence head from that corruption's own \\(z_c\\) block. This is <em>detection</em>: necessary, but not the same as blame.",
      from: ["phead"],
      losses: ["presenceBCE", "anchor"],
    },
    risk: {
      title: "Failure risk \\(\\hat r\\)",
      tag: "will it fail",
      formula: "\\(\\hat r = \\hat r(z_c; z_s)\\)",
      plain: "The probability the episode ends in failure, predicted by a shared head that reads the scene latent and the corruption latent together.",
      from: ["head"],
      losses: ["failBCE", "binAdv", "consistency", "anchor"],
    },
    attribution: {
      title: "Attribution \\(\\hat\\Delta_k\\)",
      tag: "which one is to blame",
      formula: "\\(\\hat\\Delta_k = \\mathrm{ReLU}\\!\\big(\\hat r(z_c; z_s) - \\hat r(z_c^{\\setminus k}; z_s)\\big)\\)",
      plain: "Our target quantity: how much removing corruption k, while holding the scene and every other corruption fixed, would lower the failure risk. The losses below are what make it mean &ldquo;remove corruption k&rdquo;.",
      from: ["zc", "head"],
      losses: ["anchor", "consistency", "binAdv", "inlp"],
    },
  };

  // Loss terms (coefficients/descriptions matched to pipeline/train/loss_scales.py — the current loop).
  const LOSSES = {
    failBCE:     { label: "Failure BCE",       coef: null,       cls: "loss-risk",
                   what: "Supervises the failure risk \\(\\hat r\\) against the true episode outcome (success / failure)." },
    presenceBCE: { label: "Presence BCE",      coef: "λ=1.0",    cls: "loss-pres",
                   what: "Supervises each corruption-presence head \\(\\hat\\rho_k\\) against ground-truth presence." },
    anchor:      { label: "Absence anchor",    coef: "λ=0.1",    cls: "loss-anchor",
                   what: "Pushes a corruption block toward 0 whenever that corruption is absent, so an absent corruption contributes \\(\\approx 0\\) to risk and \\(\\hat\\Delta_k\\)." },
    binAdv:      { label: "Corruption adversary", coef: "λ=20",  cls: "loss-adv",
                   what: "Adversary that scrubs the &lsquo;any corruption present&rsquo; direction out of the scene latent \\(z_s\\), so the clean-scene baseline \\(r(z_s,0)\\) stays calibrated instead of leaking corruption." },
    consistency: { label: "Mask consistency",  coef: "λ=3",      cls: "loss-cons",
                   what: "Forces the &lsquo;remove block k&rsquo; latent edit to match the model's own prediction on real frames where corruption k is genuinely absent. This is what calibrates attribution magnitude." },
    inlp:        { label: "INLP scrub",        coef: "pre-proc", cls: "loss-proj",
                   what: "Before training, iteratively projects residual corruption directions out of the scene features that feed \\(z_s\\). This is a preprocessing scrub, not a loss term." },
  };

  // Which nodes a given output's components depend on (for path highlighting).
  const NODE_DEPS = {
    head: ["img", "txt", "siglip", "zs", "zc"],
    phead: ["img", "txt", "siglip", "zc"],
    zc: ["img", "txt", "siglip", "zc"],
    zs: ["img", "txt", "siglip", "zs"],
  };

  // ------------------------------------------------------------------ RENDER
  const root = document.getElementById("pipeline-flow");
  const panel = document.getElementById("pipeline-detail");
  if (!root || !panel) return;

  // (re)render LaTeX in a subtree once MathJax is available (it also auto-typesets on load)
  function typeset(el) {
    if (window.MathJax && MathJax.typesetPromise) {
      try { MathJax.typesetClear([el]); } catch (e) {}
      MathJax.typesetPromise([el]).catch(() => {});
    }
  }

  const cols = [[], [], [], []];
  Object.entries(NODES).forEach(([id, n]) => cols[n.col].push([id, n]));

  function nodeHTML(id, n) {
    let inner = `<div class="pl-title">${n.title}</div><div class="pl-sub">${n.sub}</div>`;
    if (n.blocks) {
      inner += `<div class="pl-blocks">` +
        BLOCKS.map((b, i) => `<span class="pl-block" data-block="${i}" title="${b}">${b}</span>`).join("") +
        `</div>`;
    }
    return `<div class="pl-node" id="node-${id}" data-node="${id}">${inner}</div>`;
  }

  root.innerHTML = cols
    .map((c, i) =>
      `<div class="pl-col">${c.map(([id, n]) => nodeHTML(id, n)).join("")}</div>` +
      (i < cols.length - 1 ? `<div class="pl-arrow" aria-hidden="true">→</div>` : "")
    )
    .join("") +
    `<div class="pl-divider" aria-hidden="true"></div>` +
    `<div class="pl-col pl-outcol">` +
      `<div class="pl-out-head">Outputs &mdash; click to trace</div>` +
      Object.entries(OUTPUTS).map(([id, o]) =>
        `<button class="pl-out" data-out="${id}"><span class="pl-out-title">${o.title}</span>` +
        `<span class="pl-out-tag">${o.tag}</span></button>`
      ).join("") +
    `</div>`;
  typeset(root);

  function lossPill(lid) {
    const l = LOSSES[lid];
    const coef = l.coef ? ` <span class="pl-coef">${l.coef}</span>` : "";
    return `<div class="pl-loss ${l.cls}"><div class="pl-loss-h">${l.label}${coef}</div>` +
           `<div class="pl-loss-w">${l.what}</div></div>`;
  }

  function select(outId) {
    const o = OUTPUTS[outId];

    // highlight output buttons
    document.querySelectorAll(".pl-out").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.out === outId));

    // compute the set of contributing nodes
    const active = new Set();
    o.from.forEach((f) => (NODE_DEPS[f] || [f]).forEach((n) => active.add(n)));
    o.from.forEach((f) => active.add(f));

    document.querySelectorAll(".pl-node").forEach((el) => {
      const on = active.has(el.dataset.node);
      el.classList.toggle("is-active", on);
      el.classList.toggle("is-dim", !on);
    });
    // for attribution, spotlight one block to convey "zero block k"
    root.classList.toggle("show-blockzero", outId === "attribution");

    panel.innerHTML =
      `<div class="pl-detail-head">
         <div class="pl-detail-title">${o.title}</div>
         <div class="pl-formula">${o.formula}</div>
       </div>
       <p class="pl-plain">${o.plain}</p>
       <div class="pl-comp-label">Components that produce it</div>
       <div class="pl-comps">${o.from.map((f) => `<span class="pl-chip">${NODES[f].title}</span>`).join("")}</div>
       <div class="pl-comp-label">Training losses that shape it</div>
       <div class="pl-losses">${o.losses.map(lossPill).join("")}</div>`;
    typeset(panel);
  }

  document.querySelectorAll(".pl-out").forEach((b) =>
    b.addEventListener("click", () => select(b.dataset.out)));

  // default view
  select("attribution");
})();
