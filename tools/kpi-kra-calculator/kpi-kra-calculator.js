(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const MEASUREMENT_TYPES = [
    { value: "number", label: "Number" },
    { value: "percentage", label: "Percentage (%)" },
    { value: "currency", label: "Currency (₹)" },
    { value: "count", label: "Count" },
    { value: "time", label: "Time (hrs / days)" },
    { value: "binary", label: "Completed / Not Completed" },
  ];

  const DIRECTIONS = [
    { value: "higher", label: "Higher is better" },
    { value: "lower", label: "Lower is better" },
    { value: "binary", label: "Binary completion" },
  ];

  const DEFAULT_THRESHOLDS = {
    outstanding: 90,
    exceeds: 80,
    meets: 70,
    needs: 60,
  };

  let uidCounter = 1;
  const nextId = (prefix) => `${prefix}_${Date.now()}_${uidCounter++}`;

  function createSampleState() {
    return {
      employee: {
        name: "Aarav Mehta",
        id: "EMP-204",
        department: "Revenue & Operations",
        designation: "Senior Account Manager",
        reviewPeriod: "Q3 FY 2026–27 (Oct – Dec 2026)",
        companyName: "Open Sign Demo Corp",
      },
      capEnabled: true,
      maxCap: 120,
      thresholds: { ...DEFAULT_THRESHOLDS },
      kras: [
        {
          id: nextId("kra"),
          name: "Sales Performance",
          description: "Monthly recurring revenue, new logo acquisition, and funnel conversion efficiency.",
          weight: "60",
          kpis: [
            {
              id: nextId("kpi"),
              name: "Revenue",
              measurement: "currency",
              direction: "higher",
              target: "500000",
              actual: "450000",
              weight: "50",
            },
            {
              id: nextId("kpi"),
              name: "New Customers",
              measurement: "count",
              direction: "higher",
              target: "20",
              actual: "18",
              weight: "30",
            },
            {
              id: nextId("kpi"),
              name: "Conversion Rate",
              measurement: "percentage",
              direction: "higher",
              target: "10",
              actual: "12",
              weight: "20",
            },
          ],
        },
        {
          id: nextId("kra"),
          name: "Productivity",
          description: "Timely delivery and completion of assigned client projects.",
          weight: "40",
          kpis: [
            {
              id: nextId("kpi"),
              name: "Projects Completed",
              measurement: "count",
              direction: "higher",
              target: "10",
              actual: "9",
              weight: "60",
            },
            {
              id: nextId("kpi"),
              name: "On-time Delivery",
              measurement: "percentage",
              direction: "higher",
              target: "95",
              actual: "90",
              weight: "40",
            },
          ],
        },
      ],
    };
  }

  function createBlankState() {
    return {
      employee: {
        name: "",
        id: "",
        department: "",
        designation: "",
        reviewPeriod: "",
        companyName: "",
      },
      capEnabled: true,
      maxCap: 120,
      thresholds: { ...DEFAULT_THRESHOLDS },
      kras: [
        {
          id: nextId("kra"),
          name: "",
          description: "",
          weight: "100",
          kpis: [
            {
              id: nextId("kpi"),
              name: "",
              measurement: "number",
              direction: "higher",
              target: "",
              actual: "",
              weight: "100",
            },
          ],
        },
      ],
    };
  }

  let state = createSampleState();
  let lastEval = null;

  /* ---------- Toast & Confirmation ---------- */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function confirmAction(title, msg) {
    const dlg = $("kkConfirmDialog");
    if (!dlg) return Promise.resolve(window.confirm(msg));
    $("kkConfirmTitle").textContent = title;
    $("kkConfirmMsg").textContent = msg;
    return new Promise((resolve) => {
      const ok = $("kkConfirmOk");
      const cancel = $("kkConfirmCancel");
      const closeTop = $("kkConfirmCloseTop");
      const done = (ans) => {
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        closeTop.removeEventListener("click", onCancel);
        if (dlg.open) dlg.close();
        resolve(ans);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      closeTop.addEventListener("click", onCancel);
      dlg.showModal();
    });
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function parseNum(raw) {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function formatMetricValue(raw, measurement, direction) {
    if (direction === "binary" || measurement === "binary") {
      return raw === "completed" ? "Completed" : raw === "not_completed" ? "Not Completed" : "—";
    }
    const n = parseNum(raw);
    if (n === null) return "—";
    if (measurement === "currency") {
      return `₹${n.toLocaleString("en-IN")}`;
    }
    if (measurement === "percentage") {
      return `${n}%`;
    }
    return n.toLocaleString("en-IN");
  }

  /* ---------- Core Calculation Engine ---------- */
  function evaluateKpi(kpi, capEnabled, maxCap) {
    const isBinary = kpi.direction === "binary" || kpi.measurement === "binary";
    const weight = parseNum(kpi.weight);
    const missing = [];

    if (weight === null || weight <= 0) {
      missing.push("valid KPI weightage (> 0%)");
    }

    let rawAchievement = null;

    if (isBinary) {
      if (kpi.actual === "completed") {
        rawAchievement = 100;
      } else if (kpi.actual === "not_completed") {
        rawAchievement = 0;
      } else {
        missing.push("completion status");
      }
    } else {
      const target = parseNum(kpi.target);
      const actual = parseNum(kpi.actual);
      if (target === null) missing.push("target value");
      if (actual === null) missing.push("actual value");

      if (target !== null && actual !== null) {
        if (kpi.direction === "lower") {
          if (target < 0 || actual < 0) {
            missing.push("non-negative target & actual values");
          } else if (actual === 0 && target === 0) {
            rawAchievement = 100;
          } else if (actual === 0 && target > 0) {
            rawAchievement = capEnabled ? maxCap : 100;
          } else if (target === 0 && actual > 0) {
            rawAchievement = 0;
          } else {
            rawAchievement = (target / actual) * 100;
          }
        } else {
          // Higher is better
          if (target <= 0) {
            missing.push("target value > 0");
          } else if (actual < 0) {
            missing.push("non-negative actual value");
          } else {
            rawAchievement = (actual / target) * 100;
          }
        }
      }
    }

    if (missing.length > 0 || rawAchievement === null) {
      return {
        complete: false,
        missing,
        rawAchievement: null,
        cappedAchievement: null,
        weightedScore: null,
        status: "incomplete",
        statusLabel: "Incomplete",
      };
    }

    const cappedAchievement = capEnabled ? Math.min(rawAchievement, maxCap) : rawAchievement;
    const weightedScore = (cappedAchievement * weight) / 100;

    let status = "below";
    let statusLabel = "Below Target";
    if (cappedAchievement >= 90) {
      status = "achieved";
      statusLabel = "Achieved";
    } else if (cappedAchievement >= 70) {
      status = "partial";
      statusLabel = "Partially Achieved";
    }

    return {
      complete: true,
      missing: [],
      rawAchievement,
      cappedAchievement,
      weightedScore,
      status,
      statusLabel,
    };
  }

  function getPerformanceRating(score, thresholds) {
    if (score === null || !Number.isFinite(score)) {
      return { label: "Incomplete", tier: "incomplete" };
    }
    if (score >= thresholds.outstanding) return { label: "Outstanding", tier: "outstanding" };
    if (score >= thresholds.exceeds) return { label: "Exceeds Expectations", tier: "exceeds" };
    if (score >= thresholds.meets) return { label: "Meets Expectations", tier: "meets" };
    if (score >= thresholds.needs) return { label: "Needs Improvement", tier: "needs" };
    return { label: "Unsatisfactory", tier: "unsatisfactory" };
  }

  function evaluateAll() {
    const capEnabled = Boolean(state.capEnabled);
    const maxCap = Math.max(100, parseNum(state.maxCap) ?? 120);
    const alerts = [];

    let totalKraWeight = 0;
    let totalKpis = 0;
    const kpiAchievementValues = [];

    const kraResults = state.kras.map((kra, kIdx) => {
      const kraLabel = kra.name.trim() || `KRA #${kIdx + 1}`;
      const kraWeight = parseNum(kra.weight);
      if (kraWeight !== null && kraWeight > 0) totalKraWeight += kraWeight;

      let kpiWeightSum = 0;
      const missingReasons = [];

      if (kraWeight === null || kraWeight <= 0) {
        missingReasons.push("KRA weightage must be greater than 0%");
      }
      if (!kra.kpis.length) {
        missingReasons.push("Add at least one KPI under this KRA");
      }

      const kpiResults = kra.kpis.map((kpi, pIdx) => {
        totalKpis++;
        const w = parseNum(kpi.weight);
        if (w !== null && w > 0) kpiWeightSum += w;
        const ev = evaluateKpi(kpi, capEnabled, maxCap);
        if (ev.complete) {
          kpiAchievementValues.push(ev.cappedAchievement);
        } else {
          const pName = kpi.name.trim() || `KPI #${pIdx + 1}`;
          missingReasons.push(`${pName}: missing ${ev.missing.join(", ")}`);
        }
        return { kpi, eval: ev };
      });

      const kpiWeightsValid = Math.abs(kpiWeightSum - 100) < 0.01;
      if (kra.kpis.length > 0 && !kpiWeightsValid) {
        missingReasons.push(`KPI weightages total ${Math.round(kpiWeightSum * 100) / 100}% (must equal 100%)`);
      }

      const allKpisComplete = kpiResults.length > 0 && kpiResults.every((r) => r.eval.complete);
      const kraComplete = Boolean(allKpisComplete && kpiWeightsValid && kraWeight !== null && kraWeight > 0);

      const kraScore = kraComplete
        ? kpiResults.reduce((acc, r) => acc + (r.eval.weightedScore || 0), 0)
        : null;

      const rawKraScore = kraComplete
        ? kpiResults.reduce((acc, r) => acc + ((r.eval.rawAchievement || 0) * (parseNum(r.kpi.weight) || 0)) / 100, 0)
        : null;

      const weightedKraContribution = kraComplete ? (kraScore * kraWeight) / 100 : null;

      if (!kraComplete) {
        alerts.push({
          level: "warn",
          text: `${kraLabel} is incomplete: ${missingReasons[0] || "complete all KPI fields"}.`,
        });
      }

      return {
        kra,
        label: kraLabel,
        kraWeight,
        kpiWeightSum,
        kpiWeightsValid,
        kraComplete,
        missingReasons,
        kraScore,
        rawKraScore,
        weightedKraContribution,
        kpiResults,
      };
    });

    const kraWeightsValid = state.kras.length > 0 && Math.abs(totalKraWeight - 100) < 0.01;
    if (state.kras.length === 0) {
      alerts.push({ level: "error", text: "Add at least one KRA to calculate overall performance." });
    } else if (!kraWeightsValid) {
      alerts.push({
        level: "error",
        text: `Total KRA weightage is ${Math.round(totalKraWeight * 100) / 100}%. All KRA weightages must total 100%.`,
      });
    }

    const allKrasComplete = kraResults.length > 0 && kraResults.every((r) => r.kraComplete);
    const overallComplete = Boolean(kraWeightsValid && allKrasComplete);

    const overallScore = overallComplete
      ? kraResults.reduce((acc, r) => acc + (r.weightedKraContribution || 0), 0)
      : null;

    const rawOverallScore = overallComplete
      ? kraResults.reduce((acc, r) => acc + ((r.rawKraScore || 0) * (r.kraWeight || 0)) / 100, 0)
      : null;

    const rating = getPerformanceRating(overallScore, state.thresholds);

    const avgKpiAchievement = kpiAchievementValues.length
      ? kpiAchievementValues.reduce((a, b) => a + b, 0) / kpiAchievementValues.length
      : null;

    const completedKras = kraResults.filter((r) => r.kraComplete);
    let highestKra = null;
    let lowestKra = null;
    if (completedKras.length) {
      const sorted = [...completedKras].sort((a, b) => b.kraScore - a.kraScore);
      highestKra = sorted[0];
      lowestKra = sorted[sorted.length - 1];
    }

    return {
      capEnabled,
      maxCap,
      totalKraWeight,
      kraWeightsValid,
      totalKras: state.kras.length,
      totalKpis,
      kraResults,
      overallComplete,
      overallScore,
      rawOverallScore,
      rating,
      avgKpiAchievement,
      highestKra,
      lowestKra,
      alerts,
    };
  }

  /* ---------- Render KRA & KPI Editor Cards ---------- */
  function renderKraList() {
    const container = $("kkKraList");
    if (!container) return;
    container.innerHTML = "";

    if (!state.kras.length) {
      container.innerHTML = `
        <div class="kk-empty">
          <h3>No KRAs added yet</h3>
          <p>Click "Add KRA" to start building your performance scorecard, or load the pre-filled sample calculation.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px">
            <button type="button" class="kk-mini-btn blue" id="kkEmptyAddKra">+ Add KRA</button>
            <button type="button" class="kk-mini-btn" id="kkEmptyLoadSample">Load Sample Data</button>
          </div>
        </div>
      `;
      $("kkEmptyAddKra")?.addEventListener("click", addKra);
      $("kkEmptyLoadSample")?.addEventListener("click", loadSample);
      return;
    }

    state.kras.forEach((kra, kIdx) => {
      const card = document.createElement("article");
      card.className = "kk-kra-card";
      card.dataset.kraId = kra.id;

      // Header
      const head = document.createElement("div");
      head.className = "kk-kra-head";
      head.innerHTML = `
        <div class="kk-kra-head-top">
          <div class="kk-field">
            <label for="kra_name_${kra.id}">KRA #${kIdx + 1} Name</label>
            <input type="text" id="kra_name_${kra.id}" class="kk-input" list="kkKraSuggestions" placeholder="e.g. Sales Performance, Productivity" value="${esc(kra.name)}" data-kra-field="name" />
          </div>
          <div class="kk-field">
            <label for="kra_w_${kra.id}">KRA Weight (%)</label>
            <input type="number" id="kra_w_${kra.id}" class="kk-input" min="0" max="100" step="0.5" placeholder="e.g. 60" value="${esc(kra.weight)}" data-kra-field="weight" />
          </div>
          <button type="button" class="kk-mini-btn danger" data-del-kra="${kra.id}" title="Delete KRA">Delete KRA</button>
        </div>
        <div class="kk-field">
          <label for="kra_desc_${kra.id}">KRA Description (Optional)</label>
          <input type="text" id="kra_desc_${kra.id}" class="kk-input" placeholder="Short objective or scope for this KRA" value="${esc(kra.description)}" data-kra-field="description" />
        </div>
        <div class="kk-kra-meta-row">
          <span id="kra_wsum_${kra.id}" style="font-weight:700">KPI Weightages: 0%</span>
          <span id="kra_score_badge_${kra.id}" class="kk-pill is-incomplete">Incomplete</span>
        </div>
      `;

      // Bind KRA field events
      head.querySelectorAll("[data-kra-field]").forEach((inp) => {
        inp.addEventListener("input", () => {
          kra[inp.dataset.kraField] = inp.value;
          updateCalculationsAndDashboard();
        });
      });

      head.querySelector("[data-del-kra]").addEventListener("click", () => {
        state.kras = state.kras.filter((x) => x.id !== kra.id);
        renderAll();
        toast("Removed KRA.");
      });

      // Body (KPIs)
      const body = document.createElement("div");
      body.className = "kk-kra-body";

      const kpiList = document.createElement("div");
      kpiList.className = "kk-kpi-list";

      kra.kpis.forEach((kpi, pIdx) => {
        const isBinary = kpi.direction === "binary" || kpi.measurement === "binary";
        const row = document.createElement("div");
        row.className = "kk-kpi-row";
        row.dataset.kpiId = kpi.id;

        const measOpts = MEASUREMENT_TYPES.map(
          (m) => `<option value="${m.value}"${kpi.measurement === m.value ? " selected" : ""}>${m.label}</option>`
        ).join("");
        const dirOpts = DIRECTIONS.map(
          (d) => `<option value="${d.value}"${kpi.direction === d.value ? " selected" : ""}>${d.label}</option>`
        ).join("");

        const targetActualHtml = isBinary
          ? `
            <div class="kk-field">
              <label for="kpi_t_${kpi.id}">Target</label>
              <input type="text" id="kpi_t_${kpi.id}" class="kk-input" value="Completed (100%)" disabled />
            </div>
            <div class="kk-field">
              <label for="kpi_a_${kpi.id}">Actual Status</label>
              <select id="kpi_a_${kpi.id}" class="kk-select" data-kpi-field="actual">
                <option value=""${kpi.actual !== "completed" && kpi.actual !== "not_completed" ? " selected" : ""}>— Select Status —</option>
                <option value="completed"${kpi.actual === "completed" ? " selected" : ""}>Completed (100%)</option>
                <option value="not_completed"${kpi.actual === "not_completed" ? " selected" : ""}>Not Completed (0%)</option>
              </select>
            </div>
          `
          : `
            <div class="kk-field">
              <label for="kpi_t_${kpi.id}">Target Value</label>
              <input type="number" id="kpi_t_${kpi.id}" class="kk-input" step="any" placeholder="e.g. 100" value="${esc(kpi.target)}" data-kpi-field="target" />
            </div>
            <div class="kk-field">
              <label for="kpi_a_${kpi.id}">Actual Value</label>
              <input type="number" id="kpi_a_${kpi.id}" class="kk-input" step="any" placeholder="e.g. 92" value="${esc(kpi.actual)}" data-kpi-field="actual" />
            </div>
          `;

        row.innerHTML = `
          <div class="kk-kpi-grid">
            <div class="kk-field">
              <label for="kpi_n_${kpi.id}">KPI #${pIdx + 1} Name</label>
              <input type="text" id="kpi_n_${kpi.id}" class="kk-input" placeholder="e.g. Monthly Revenue, Defect Rate" value="${esc(kpi.name)}" data-kpi-field="name" />
            </div>
            <div class="kk-field">
              <label for="kpi_m_${kpi.id}">Measurement Type</label>
              <select id="kpi_m_${kpi.id}" class="kk-select" data-kpi-field="measurement">${measOpts}</select>
            </div>
            <div class="kk-field">
              <label for="kpi_d_${kpi.id}">Performance Direction</label>
              <select id="kpi_d_${kpi.id}" class="kk-select" data-kpi-field="direction">${dirOpts}</select>
            </div>
          </div>

          <div class="kk-kpi-vals-grid">
            ${targetActualHtml}
            <div class="kk-field">
              <label for="kpi_w_${kpi.id}">Weight (%)</label>
              <input type="number" id="kpi_w_${kpi.id}" class="kk-input" min="0" max="100" step="0.5" placeholder="%" value="${esc(kpi.weight)}" data-kpi-field="weight" />
            </div>
            <button type="button" class="kk-mini-btn danger" style="height:38px" data-del-kpi="${kpi.id}" title="Remove KPI">×</button>
          </div>

          <div class="kk-kpi-foot">
            <div class="kk-kpi-metrics">
              <span>Achievement: <strong id="kpi_ach_${kpi.id}">—</strong></span>
              <span>Weighted Score: <strong id="kpi_wscore_${kpi.id}">—</strong></span>
            </div>
            <span id="kpi_status_${kpi.id}" class="kk-pill is-incomplete">Incomplete</span>
          </div>
        `;

        row.querySelectorAll("[data-kpi-field]").forEach((ctrl) => {
          const field = ctrl.dataset.kpiField;
          const evName = ctrl.tagName === "SELECT" ? "change" : "input";
          ctrl.addEventListener(evName, () => {
            kpi[field] = ctrl.value;
            // Keep measurement & direction aligned when binary is chosen
            if (field === "measurement" && ctrl.value === "binary") {
              kpi.direction = "binary";
              if (kpi.actual !== "completed" && kpi.actual !== "not_completed") kpi.actual = "completed";
              renderKraList();
              updateCalculationsAndDashboard();
              return;
            }
            if (field === "direction" && ctrl.value === "binary") {
              kpi.measurement = "binary";
              if (kpi.actual !== "completed" && kpi.actual !== "not_completed") kpi.actual = "completed";
              renderKraList();
              updateCalculationsAndDashboard();
              return;
            }
            if ((field === "measurement" && ctrl.value !== "binary" && kpi.direction === "binary") ||
                (field === "direction" && ctrl.value !== "binary" && kpi.measurement === "binary")) {
              if (field === "measurement") kpi.direction = "higher";
              else kpi.measurement = "number";
              kpi.actual = "";
              renderKraList();
              updateCalculationsAndDashboard();
              return;
            }
            updateCalculationsAndDashboard();
          });
        });

        row.querySelector("[data-del-kpi]").addEventListener("click", () => {
          kra.kpis = kra.kpis.filter((x) => x.id !== kpi.id);
          renderAll();
        });

        kpiList.appendChild(row);
      });

      const foot = document.createElement("div");
      foot.className = "kk-kra-foot";
      foot.innerHTML = `
        <button type="button" class="kk-mini-btn" data-add-kpi="${kra.id}">+ Add KPI to ${esc(kra.name || `KRA #${kIdx + 1}`)}</button>
        <button type="button" class="kk-mini-btn" data-balance-kpis="${kra.id}" title="Distribute 100% evenly across KPIs">Auto-Split KPIs to 100%</button>
      `;

      foot.querySelector("[data-add-kpi]").addEventListener("click", () => {
        kra.kpis.push({
          id: nextId("kpi"),
          name: "",
          measurement: "number",
          direction: "higher",
          target: "",
          actual: "",
          weight: "",
        });
        renderAll();
      });

      foot.querySelector("[data-balance-kpis]").addEventListener("click", () => {
        if (!kra.kpis.length) return;
        const base = Math.floor((100 / kra.kpis.length) * 100) / 100;
        let rem = 100;
        kra.kpis.forEach((p, idx) => {
          const val = idx === kra.kpis.length - 1 ? Math.round(rem * 100) / 100 : base;
          p.weight = String(val);
          rem -= val;
        });
        renderAll();
        toast("KPI weightages balanced to 100%.");
      });

      body.append(kpiList, foot);
      card.append(head, body);
      container.appendChild(card);
    });
  }

  /* ---------- Live Calculation & Dashboard Update (No Full DOM Tear-down on Typing) ---------- */
  function updateCalculationsAndDashboard() {
    const ev = evaluateAll();
    lastEval = ev;

    // 1. Top KRA weightage bar
    const wBar = $("kkKraWeightBar");
    const wSumRounded = Math.round(ev.totalKraWeight * 100) / 100;
    if (wBar) {
      wBar.className = `kk-weight-bar ${ev.kraWeightsValid ? "is-ok" : "is-error"}`;
      $("kkKraWeightText").textContent = ev.kraWeightsValid
        ? `Total KRA Weightage: 100% (Valid)`
        : `Total KRA Weightage: ${wSumRounded}% — Must equal 100% (${wSumRounded < 100 ? `${Math.round((100 - wSumRounded) * 100) / 100}% remaining` : `${Math.round((wSumRounded - 100) * 100) / 100}% over`})`;
    }

    // 2. Update per-KRA and per-KPI inline live scores
    ev.kraResults.forEach((kr) => {
      const wsumEl = $(`kra_wsum_${kr.kra.id}`);
      if (wsumEl) {
        const ks = Math.round(kr.kpiWeightSum * 100) / 100;
        wsumEl.textContent = kr.kpiWeightsValid
          ? `KPI Weightages: 100% ✓`
          : `KPI Weightages: ${ks}% (Must total 100%)`;
        wsumEl.style.color = kr.kpiWeightsValid ? "#066a32" : "#b42318";
      }

      const kBadge = $(`kra_score_badge_${kr.kra.id}`);
      if (kBadge) {
        if (kr.kraComplete) {
          const tierCls = kr.kraScore >= 90 ? "is-achieved" : kr.kraScore >= 70 ? "is-partial" : "is-below";
          kBadge.className = `kk-pill ${tierCls}`;
          kBadge.textContent = `KRA Score: ${kr.kraScore.toFixed(2)}%`;
        } else {
          kBadge.className = "kk-pill is-incomplete";
          kBadge.textContent = "Incomplete";
        }
      }

      kr.kpiResults.forEach(({ kpi, eval: ke }) => {
        const achEl = $(`kpi_ach_${kpi.id}`);
        const wsEl = $(`kpi_wscore_${kpi.id}`);
        const stEl = $(`kpi_status_${kpi.id}`);

        if (achEl) {
          if (!ke.complete) {
            achEl.textContent = "—";
          } else if (ev.capEnabled && ke.rawAchievement > ev.maxCap) {
            achEl.textContent = `${ke.cappedAchievement.toFixed(1)}% (Actual: ${ke.rawAchievement.toFixed(1)}%)`;
          } else {
            achEl.textContent = `${ke.cappedAchievement.toFixed(1)}%`;
          }
        }
        if (wsEl) {
          wsEl.textContent = ke.complete ? `${ke.weightedScore.toFixed(2)}` : "—";
        }
        if (stEl) {
          stEl.className = `kk-pill is-${ke.status}`;
          stEl.textContent = ke.statusLabel;
        }
      });
    });

    // 3. Right Panel: Overall Score Hero & Rating Badge
    const scoreEl = $("kkOverallScore");
    const ratingEl = $("kkOverallRating");
    const subEl = $("kkOverallSub");

    if (ev.overallComplete) {
      scoreEl.textContent = `${ev.overallScore.toFixed(2)}%`;
      ratingEl.textContent = ev.rating.label;
      ratingEl.dataset.tier = ev.rating.tier;

      if (ev.overallScore > 100) {
        subEl.textContent = `Actual score exceeds 100% (${ev.overallScore.toFixed(2)}%). Rating applied using configured scale (Outstanding ≥ ${state.thresholds.outstanding}%).`;
      } else if (ev.capEnabled && ev.rawOverallScore > ev.overallScore + 0.05) {
        subEl.textContent = `Achievement cap (${ev.maxCap}%) applied. Uncapped weighted score: ${ev.rawOverallScore.toFixed(2)}%.`;
      } else {
        subEl.textContent = `Calculated from ${ev.totalKras} KRAs and ${ev.totalKpis} KPIs totaling 100% weightage.`;
      }
    } else {
      scoreEl.textContent = "Incomplete";
      ratingEl.textContent = "Awaiting Valid Inputs";
      ratingEl.dataset.tier = "incomplete";
      subEl.textContent = "Ensure all KRA and KPI weightages total 100% and all KPI targets/actuals are filled.";
    }

    // 4. Summary Cards
    $("kkStatKras").textContent = String(ev.totalKras);
    $("kkStatKpis").textContent = String(ev.totalKpis);
    $("kkStatAvgKpi").textContent = ev.avgKpiAchievement !== null ? `${ev.avgKpiAchievement.toFixed(1)}%` : "—";
    $("kkStatHighKra").textContent = ev.highestKra ? `${ev.highestKra.label} (${ev.highestKra.kraScore.toFixed(1)}%)` : "—";
    $("kkStatLowKra").textContent = ev.lowestKra ? `${ev.lowestKra.label} (${ev.lowestKra.kraScore.toFixed(1)}%)` : "—";
    $("kkStatRating").textContent = ev.rating.label;

    // 5. Validation Alerts
    const alertsEl = $("kkValAlerts");
    alertsEl.innerHTML = "";
    if (ev.alerts.length) {
      alertsEl.hidden = false;
      ev.alerts.forEach((a) => {
        const li = document.createElement("li");
        if (a.level === "error") li.className = "is-error";
        li.textContent = a.text;
        alertsEl.appendChild(li);
      });
    } else {
      alertsEl.hidden = true;
    }

    // 6. KRA-Wise Breakdown & Progress Bars
    const barsEl = $("kkKraBreakdown");
    barsEl.innerHTML = "";
    if (!ev.kraResults.length) {
      barsEl.innerHTML = `<p style="margin:0;font-size:13px;color:var(--muted)">Add KRAs to see breakdown.</p>`;
    } else {
      ev.kraResults.forEach((kr) => {
        const pct = kr.kraComplete ? kr.kraScore : 0;
        const barCls = !kr.kraComplete ? "" : pct >= 90 ? "is-achieved" : pct >= 70 ? "is-partial" : "is-below";
        const item = document.createElement("div");
        item.className = "kk-bar-item";
        item.innerHTML = `
          <div class="kk-bar-top">
            <span>${esc(kr.label)} <span style="color:var(--muted);font-weight:600">(${kr.kraWeight ?? 0}% wt)</span></span>
            <span>${kr.kraComplete ? `${kr.kraScore.toFixed(2)}% · Contrib: ${kr.weightedKraContribution.toFixed(2)}` : "Incomplete"}</span>
          </div>
          <div class="kk-bar-track">
            <div class="kk-bar-fill ${barCls}" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
          </div>
        `;
        barsEl.appendChild(item);
      });
    }

    // 7. SVG Performance Comparison Chart
    renderSvgChart(ev);

    // 8. KPI Target vs Actual Comparison Table
    const tbody = $("kkKpiCompBody");
    tbody.innerHTML = "";
    const allKpiRows = [];
    ev.kraResults.forEach((kr) => {
      kr.kpiResults.forEach(({ kpi, eval: ke }) => {
        allKpiRows.push({ kraLabel: kr.label, kpi, ke });
      });
    });

    if (!allKpiRows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">No KPIs added yet.</td></tr>`;
    } else {
      allKpiRows.forEach(({ kraLabel, kpi, ke }) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${esc(kpi.name || "Untitled KPI")}</strong><div style="font-size:11px;color:var(--muted)">${esc(kraLabel)} (${kpi.weight || 0}%)</div></td>
          <td>${esc(formatMetricValue(kpi.target, kpi.measurement, kpi.direction))}</td>
          <td>${esc(formatMetricValue(kpi.actual, kpi.measurement, kpi.direction))}</td>
          <td><strong>${ke.complete ? `${ke.cappedAchievement.toFixed(1)}%` : "—"}</strong></td>
          <td><span class="kk-pill is-${ke.status}">${ke.statusLabel}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  function renderSvgChart(ev) {
    const chartWrap = $("kkPerfChart");
    if (!chartWrap) return;
    const completed = ev.kraResults.filter((r) => r.kraComplete);
    if (!completed.length) {
      chartWrap.innerHTML = `<p style="margin:0;font-size:13px;color:var(--muted)">Complete at least one KRA to view the visual performance chart.</p>`;
      return;
    }

    const maxVal = Math.max(100, ...completed.map((r) => r.kraScore));
    const barW = Math.min(58, Math.floor(280 / completed.length));
    const gap = 20;
    const svgW = Math.max(320, completed.length * (barW + gap) + 40);
    const svgH = 150;
    const baseY = 122;

    const bars = completed
      .map((r, i) => {
        const h = Math.max(4, Math.round((r.kraScore / maxVal) * 96));
        const x = 24 + i * (barW + gap);
        const y = baseY - h;
        const fill = r.kraScore >= 90 ? "#089949" : r.kraScore >= 70 ? "#056cb8" : "#e42527";
        const shortLbl = r.label.length > 11 ? `${r.label.slice(0, 10)}…` : r.label;
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${fill}" />
          <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#0b132b">${r.kraScore.toFixed(1)}%</text>
          <text x="${x + barW / 2}" y="${baseY + 15}" text-anchor="middle" font-size="10" font-weight="600" fill="#4a5568">${esc(shortLbl)}</text>
        `;
      })
      .join("");

    const y100 = baseY - Math.round((100 / maxVal) * 96);
    chartWrap.innerHTML = `
      <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto;display:block" role="img" aria-label="KRA performance bar chart">
        <line x1="12" y1="${y100}" x2="${svgW - 12}" y2="${y100}" stroke="#cbd5e1" stroke-dasharray="4 3" stroke-width="1" />
        <line x1="12" y1="${baseY}" x2="${svgW - 12}" y2="${baseY}" stroke="#94a3b8" stroke-width="1.2" />
        ${bars}
      </svg>
    `;
  }

  /* ---------- Actions: Add KRA, Auto-Balance, Load Sample, Clear, Reset ---------- */
  function addKra() {
    state.kras.push({
      id: nextId("kra"),
      name: "",
      description: "",
      weight: "",
      kpis: [
        {
          id: nextId("kpi"),
          name: "",
          measurement: "number",
          direction: "higher",
          target: "",
          actual: "",
          weight: "100",
        },
      ],
    });
    renderAll();
  }

  function autoBalanceKras() {
    if (!state.kras.length) return;
    const base = Math.floor((100 / state.kras.length) * 100) / 100;
    let rem = 100;
    state.kras.forEach((k, idx) => {
      const val = idx === state.kras.length - 1 ? Math.round(rem * 100) / 100 : base;
      k.weight = String(val);
      rem -= val;
    });
    renderAll();
    toast("KRA weightages balanced to 100%.");
  }

  function loadSample() {
    state = createSampleState();
    syncBasicInputs();
    renderAll();
    toast("Loaded pre-filled Sales & Productivity sample.");
  }

  async function clearAndStartBlank() {
    const ok = await confirmAction(
      "Start From Scratch",
      "Clear all current employee details, KRAs, and KPIs to start with a blank calculator?"
    );
    if (!ok) return;
    state = createBlankState();
    syncBasicInputs();
    renderAll();
    toast("Calculator cleared.");
  }

  async function resetCalculator() {
    const ok = await confirmAction(
      "Reset Calculator",
      "Reset the KPI & KRA Calculator back to default settings and sample data?"
    );
    if (!ok) return;
    state = createSampleState();
    syncBasicInputs();
    renderAll();
    toast("Calculator reset to defaults.");
  }

  /* ---------- Exports: PDF (pdf-lib), Excel (SheetJS), CSV ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const ev = lastEval || evaluateAll();
    const emp = state.employee;
    const rows = [
      ["Open Sign — KPI & KRA Performance Report"],
      ["Company", emp.companyName || "—", "Review Period", emp.reviewPeriod || "—"],
      ["Employee Name", emp.name || "—", "Employee ID", emp.id || "—"],
      ["Department", emp.department || "—", "Designation", emp.designation || "—"],
      ["Overall Score", ev.overallComplete ? `${ev.overallScore.toFixed(2)}%` : "Incomplete", "Final Rating", ev.rating.label],
      [],
      ["KRA", "KRA Weight (%)", "KPI", "Direction", "Target", "Actual", "KPI Weight (%)", "Achievement (%)", "Weighted KPI Score", "Status"],
    ];

    ev.kraResults.forEach((kr) => {
      kr.kpiResults.forEach(({ kpi, eval: ke }) => {
        rows.push([
          kr.label,
          kr.kraWeight ?? "",
          kpi.name || "Untitled KPI",
          kpi.direction,
          formatMetricValue(kpi.target, kpi.measurement, kpi.direction),
          formatMetricValue(kpi.actual, kpi.measurement, kpi.direction),
          kpi.weight || "",
          ke.complete ? `${ke.cappedAchievement.toFixed(2)}%` : "Incomplete",
          ke.complete ? ke.weightedScore.toFixed(2) : "—",
          ke.statusLabel,
        ]);
      });
    });

    const text = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), "opensign-kpi-kra-report.csv");
    toast("Exported opensign-kpi-kra-report.csv");
  }

  function exportExcel() {
    if (!window.XLSX) {
      toast("Excel export library (SheetJS) failed to load.", "error");
      return;
    }
    const XLSX = window.XLSX;
    const ev = lastEval || evaluateAll();
    const emp = state.employee;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const s1 = [
      ["Open Sign — KPI & KRA Performance Summary"],
      [],
      ["Company Name", emp.companyName || "—", "Review Period", emp.reviewPeriod || "—"],
      ["Employee Name", emp.name || "—", "Employee ID", emp.id || "—"],
      ["Department", emp.department || "—", "Designation", emp.designation || "—"],
      [],
      ["Overall Performance Score", ev.overallComplete ? `${ev.overallScore.toFixed(2)}%` : "Incomplete"],
      ["Final Performance Rating", ev.rating.label],
      ["Total KRAs", ev.totalKras],
      ["Total KPIs", ev.totalKpis],
      ["Average KPI Achievement", ev.avgKpiAchievement !== null ? `${ev.avgKpiAchievement.toFixed(2)}%` : "—"],
      ["Achievement Cap", ev.capEnabled ? `${ev.maxCap}%` : "Disabled"],
      [],
      ["KRA Name", "KRA Weight (%)", "KRA Score (%)", "Weighted Contribution (%)", "Status"],
      ...ev.kraResults.map((kr) => [
        kr.label,
        kr.kraWeight ?? "",
        kr.kraComplete ? Number(kr.kraScore.toFixed(2)) : "Incomplete",
        kr.kraComplete ? Number(kr.weightedKraContribution.toFixed(2)) : "—",
        kr.kraComplete ? "Complete" : "Incomplete",
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Performance Summary");

    // Sheet 2: Detailed KPI Breakdown
    const s2 = [
      ["KRA", "KRA Weight (%)", "KPI Name", "Measurement", "Direction", "Target", "Actual", "KPI Weight (%)", "Achievement (%)", "Weighted Score", "Status"],
    ];
    ev.kraResults.forEach((kr) => {
      kr.kpiResults.forEach(({ kpi, eval: ke }) => {
        s2.push([
          kr.label,
          kr.kraWeight ?? "",
          kpi.name || "Untitled KPI",
          kpi.measurement,
          kpi.direction,
          formatMetricValue(kpi.target, kpi.measurement, kpi.direction),
          formatMetricValue(kpi.actual, kpi.measurement, kpi.direction),
          kpi.weight || "",
          ke.complete ? Number(ke.cappedAchievement.toFixed(2)) : "Incomplete",
          ke.complete ? Number(ke.weightedScore.toFixed(2)) : "—",
          ke.statusLabel,
        ]);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, "KPI Details");

    XLSX.writeFile(wb, "opensign-kpi-kra-report.xlsx");
    toast("Exported opensign-kpi-kra-report.xlsx");
  }

  function getLogoPngDataUrl() {
    return new Promise((resolve) => {
      const img = document.querySelector(".brand-logo");
      if (!img || !img.complete || !img.naturalWidth) return resolve(null);
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch (_) {
        resolve(null);
      }
    });
  }

  function pdfClean(str) {
    return String(str ?? "")
      .replace(/₹/g, "Rs. ")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function exportPdf() {
    if (!window.PDFLib) {
      toast("PDF export library (pdf-lib) failed to load.", "error");
      return;
    }

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const ev = lastEval || evaluateAll();
    const emp = state.employee;

    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 36;
    const W = PAGE_W - M * 2;

    const COL_INK = rgb(0.043, 0.075, 0.169);
    const COL_BLUE = rgb(0.02, 0.424, 0.722);
    const COL_RED = rgb(0.894, 0.145, 0.153);
    const COL_GREEN = rgb(0.031, 0.6, 0.286);
    const COL_MUTED = rgb(0.32, 0.36, 0.44);
    const COL_TINT = rgb(0.953, 0.961, 0.976);
    const COL_LINE = rgb(0.84, 0.87, 0.91);
    const COL_WHITE = rgb(1, 1, 1);

    let logoImg = null;
    const logoUrl = await getLogoPngDataUrl();
    if (logoUrl) {
      try {
        logoImg = await doc.embedPng(logoUrl);
      } catch (_) {}
    }

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - M;

    const ensureSpace = (needed) => {
      if (y - needed < M + 32) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - M;
      }
    };

    // Header bar with Open Sign Logo
    if (logoImg) {
      const sc = Math.min(115 / logoImg.width, 28 / logoImg.height, 1);
      page.drawImage(logoImg, { x: M, y: y - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
    } else {
      page.drawText("OPEN SIGN", { x: M, y: y - 16, size: 15, font: fontBold, color: COL_INK });
    }

    const titleRight = "KPI & KRA PERFORMANCE REPORT";
    const tw = fontBold.widthOfTextAtSize(titleRight, 12);
    page.drawText(titleRight, { x: PAGE_W - M - tw, y: y - 13, size: 12, font: fontBold, color: COL_BLUE });
    const dtStr = `Generated: ${new Date().toLocaleDateString("en-GB")}`;
    const dw = fontReg.widthOfTextAtSize(dtStr, 8.5);
    page.drawText(dtStr, { x: PAGE_W - M - dw, y: y - 25, size: 8.5, font: fontReg, color: COL_MUTED });

    y -= 40;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1.4, color: COL_BLUE });
    y -= 18;

    // Employee Details Box
    page.drawRectangle({ x: M, y: y - 62, width: W, height: 62, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.8 });
    const leftMeta = [
      `Employee: ${emp.name || "Not specified"}${emp.id ? ` (${emp.id})` : ""}`,
      `Department: ${emp.department || "Not specified"}`,
      `Designation: ${emp.designation || "Not specified"}`,
    ];
    const rightMeta = [
      `Company: ${emp.companyName || "Not specified"}`,
      `Review Period: ${emp.reviewPeriod || "Not specified"}`,
      `Achievement Cap: ${ev.capEnabled ? `${ev.maxCap}%` : "Disabled"}`,
    ];
    leftMeta.forEach((line, idx) => {
      page.drawText(pdfClean(line).slice(0, 48), { x: M + 12, y: y - 18 - idx * 16, size: 9, font: idx === 0 ? fontBold : fontReg, color: COL_INK });
    });
    rightMeta.forEach((line, idx) => {
      page.drawText(pdfClean(line).slice(0, 48), { x: M + W / 2 + 8, y: y - 18 - idx * 16, size: 9, font: idx === 0 ? fontBold : fontReg, color: COL_INK });
    });
    y -= 78;

    // Overall Performance Banner
    page.drawRectangle({ x: M, y: y - 48, width: W, height: 48, color: COL_BLUE });
    const scoreTxt = ev.overallComplete ? `${ev.overallScore.toFixed(2)}%` : "Incomplete";
    page.drawText("OVERALL PERFORMANCE SCORE", { x: M + 14, y: y - 17, size: 8, font: fontBold, color: rgb(0.85, 0.93, 1) });
    page.drawText(scoreTxt, { x: M + 14, y: y - 37, size: 18, font: fontBold, color: COL_WHITE });

    const ratingLabel = `FINAL RATING: ${ev.rating.label.toUpperCase()}`;
    const rw = fontBold.widthOfTextAtSize(ratingLabel, 11);
    page.drawText(ratingLabel, { x: PAGE_W - M - 14 - rw, y: y - 28, size: 11, font: fontBold, color: rgb(0.996, 0.839, 0) });
    y -= 66;

    // KRA-by-KRA Breakdown Tables
    ev.kraResults.forEach((kr, idx) => {
      ensureSpace(78);
      const kraHead = `KRA ${idx + 1}: ${pdfClean(kr.label)}  |  Weight: ${kr.kraWeight ?? 0}%  |  KRA Score: ${kr.kraComplete ? `${kr.kraScore.toFixed(2)}%` : "Incomplete"}`;
      page.drawText(kraHead.slice(0, 92), { x: M, y: y - 12, size: 10.5, font: fontBold, color: COL_INK });
      y -= 20;

      // Table Header
      page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: COL_INK });
      const cols = [
        { label: "KPI", x: M + 6 },
        { label: "Target", x: M + 188 },
        { label: "Actual", x: M + 258 },
        { label: "Wt%", x: M + 328 },
        { label: "Achiev.%", x: M + 372 },
        { label: "Weighted", x: M + 432 },
        { label: "Status", x: M + 482 },
      ];
      cols.forEach((c) => {
        page.drawText(c.label, { x: c.x, y: y - 12, size: 7.5, font: fontBold, color: COL_WHITE });
      });
      y -= 18;

      kr.kpiResults.forEach(({ kpi, eval: ke }, rIdx) => {
        ensureSpace(20);
        if (rIdx % 2 === 1) {
          page.drawRectangle({ x: M, y: y - 17, width: W, height: 17, color: COL_TINT });
        }
        page.drawText(pdfClean(kpi.name || "Untitled KPI").slice(0, 34), { x: M + 6, y: y - 12, size: 8, font: fontBold, color: COL_INK });
        page.drawText(pdfClean(formatMetricValue(kpi.target, kpi.measurement, kpi.direction)).slice(0, 14), { x: M + 188, y: y - 12, size: 8, font: fontReg, color: COL_INK });
        page.drawText(pdfClean(formatMetricValue(kpi.actual, kpi.measurement, kpi.direction)).slice(0, 14), { x: M + 258, y: y - 12, size: 8, font: fontReg, color: COL_INK });
        page.drawText(`${kpi.weight || 0}%`, { x: M + 328, y: y - 12, size: 8, font: fontReg, color: COL_INK });
        page.drawText(ke.complete ? `${ke.cappedAchievement.toFixed(1)}%` : "—", { x: M + 372, y: y - 12, size: 8, font: fontBold, color: COL_INK });
        page.drawText(ke.complete ? ke.weightedScore.toFixed(2) : "—", { x: M + 432, y: y - 12, size: 8, font: fontReg, color: COL_INK });
        const stCol = ke.status === "achieved" ? COL_GREEN : ke.status === "below" ? COL_RED : COL_MUTED;
        page.drawText(ke.statusLabel.slice(0, 10), { x: M + 482, y: y - 12, size: 7.5, font: fontBold, color: stCol });
        y -= 17;
        page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: COL_LINE });
      });

      y -= 14;
    });

    // Calculation Methodology Footer Block
    ensureSpace(84);
    page.drawRectangle({ x: M, y: y - 72, width: W, height: 72, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.7 });
    page.drawText("Calculation Methodology", { x: M + 10, y: y - 15, size: 9, font: fontBold, color: COL_INK });
    const methLines = [
      "1. Higher-is-better KPI: Achievement % = (Actual / Target) x 100. Lower-is-better KPI: (Target / Actual) x 100. Binary: 100% or 0%.",
      `2. Weighted KPI Score = Achievement % (capped at ${ev.capEnabled ? `${ev.maxCap}%` : "No Cap"}) x KPI Weightage / 100.`,
      "3. KRA Score = Sum of Weighted KPI Scores under that KRA. Overall Score = Sum of (KRA Score x KRA Weightage / 100).",
      `4. Rating Scale: Outstanding >= ${state.thresholds.outstanding}%, Exceeds >= ${state.thresholds.exceeds}%, Meets >= ${state.thresholds.meets}%, Needs Improvement >= ${state.thresholds.needs}%, Below ${state.thresholds.needs}% Unsatisfactory.`,
    ];
    methLines.forEach((ml, i) => {
      page.drawText(ml, { x: M + 10, y: y - 29 - i * 12, size: 7.2, font: fontReg, color: COL_MUTED });
    });

    const pages = doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Generated locally with Open Sign KPI & KRA Calculator  |  Page ${i + 1} of ${pages.length}`, {
        x: M,
        y: 16,
        size: 7.5,
        font: fontReg,
        color: COL_MUTED,
      });
    });

    const bytes = await doc.save();
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), "opensign-kpi-kra-report.pdf");
    toast("Downloaded opensign-kpi-kra-report.pdf");
  }

  /* ---------- Sync Top Inputs & Boot ---------- */
  function syncBasicInputs() {
    $("kkEmpName").value = state.employee.name;
    $("kkEmpId").value = state.employee.id;
    $("kkEmpDept").value = state.employee.department;
    $("kkEmpRole").value = state.employee.designation;
    $("kkReviewPeriod").value = state.employee.reviewPeriod;
    $("kkCompanyName").value = state.employee.companyName;

    $("kkCapEnabled").checked = state.capEnabled;
    $("kkMaxCap").value = String(state.maxCap);
    $("kkMaxCap").disabled = !state.capEnabled;

    $("kkThrOut").value = String(state.thresholds.outstanding);
    $("kkThrExc").value = String(state.thresholds.exceeds);
    $("kkThrMeet").value = String(state.thresholds.meets);
    $("kkThrNeed").value = String(state.thresholds.needs);
  }

  function renderAll() {
    renderKraList();
    updateCalculationsAndDashboard();
  }

  function init() {
    const bindEmp = (id, key) => {
      $(id)?.addEventListener("input", (e) => {
        state.employee[key] = e.target.value;
      });
    };
    bindEmp("kkEmpName", "name");
    bindEmp("kkEmpId", "id");
    bindEmp("kkEmpDept", "department");
    bindEmp("kkEmpRole", "designation");
    bindEmp("kkReviewPeriod", "reviewPeriod");
    bindEmp("kkCompanyName", "companyName");

    $("kkCapEnabled")?.addEventListener("change", (e) => {
      state.capEnabled = e.target.checked;
      $("kkMaxCap").disabled = !state.capEnabled;
      updateCalculationsAndDashboard();
    });
    $("kkMaxCap")?.addEventListener("input", (e) => {
      const n = parseNum(e.target.value);
      if (n !== null && n >= 100) state.maxCap = n;
      updateCalculationsAndDashboard();
    });

    const bindThr = (id, key) => {
      $(id)?.addEventListener("input", (e) => {
        const n = parseNum(e.target.value);
        if (n !== null && n >= 0 && n <= 150) {
          state.thresholds[key] = n;
          updateCalculationsAndDashboard();
        }
      });
    };
    bindThr("kkThrOut", "outstanding");
    bindThr("kkThrExc", "exceeds");
    bindThr("kkThrMeet", "meets");
    bindThr("kkThrNeed", "needs");

    $("kkAddKraBtn")?.addEventListener("click", addKra);
    $("kkBalanceKrasBtn")?.addEventListener("click", autoBalanceKras);
    $("kkLoadSampleBtn")?.addEventListener("click", loadSample);
    $("kkClearBlankBtn")?.addEventListener("click", clearAndStartBlank);
    $("kkResetBtn")?.addEventListener("click", resetCalculator);

    $("kkExportPdfBtn")?.addEventListener("click", exportPdf);
    $("kkExportExcelBtn")?.addEventListener("click", exportExcel);
    $("kkExportCsvBtn")?.addEventListener("click", exportCsv);
    $("kkPrintBtn")?.addEventListener("click", () => window.print());

    syncBasicInputs();
    renderAll();
  }

  init();
})();
