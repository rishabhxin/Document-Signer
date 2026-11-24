(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STYLE_PERSONAS = [
    { id: "curator", persona: "The Curator", font: "Dancing Script", weight: 600, size: 112 },
    { id: "vintage", persona: "The Vintage Enthusiast", font: "Sacramento", weight: 400, size: 120 },
    { id: "letter", persona: "The Letter Writer", font: "Great Vibes", weight: 400, size: 118 },
    { id: "overachiever", persona: "The Overachiever", font: "Allura", weight: 400, size: 122 },
    { id: "party", persona: "The Party Starter", font: "Caveat", weight: 600, size: 114 },
    { id: "renaissance", persona: "The Renaissance Soul", font: "Homemade Apple", weight: 400, size: 84 },
  ];

  const INK_COLORS = [
    { name: "Inkwell", hex: "#130032" },
    { name: "Jet Black", hex: "#141413" },
    { name: "Cobalt Blue", hex: "#1652F0" },
    { name: "Open Sign Violet", hex: "#4C00FF" },
    { name: "Slate", hex: "#334155" },
    { name: "Crimson", hex: "#B91C1C" },
  ];

  const STROKE_WEIGHTS = [
    { label: "Fine", width: 3.2 },
    { label: "Medium", width: 5.0 },
    { label: "Bold", width: 7.4 },
  ];

  const pad = $("sgDrawPad");
  const padStage = $("sgPadStage");
  const pctx = pad?.getContext("2d");
  const typeCanvas = document.createElement("canvas");
  typeCanvas.width = 1040;
  typeCanvas.height = 360;
  const tctx = typeCanvas.getContext("2d");

  const nameInput = $("sgNameInput");
  const styleGrid = $("sgStyleGrid");
  const previewImg = $("sgPreviewImg");
  const previewEmpty = $("sgPreviewEmpty");
  const contractSigImg = $("sgContractSigImg");
  const contractPlaceholder = $("sgContractPlaceholder");
  const contractNameCaption = $("sgContractNameCaption");
  const contractDateEl = $("sgContractDate");
  const readyPill = $("sgReadyPill");

  const dlPngBtn = $("sgDlPng");
  const dlJpgBtn = $("sgDlJpg");
  const useInPdfBtn = $("sgUseInPdf");
  const undoBtn = $("sgUndoBtn");
  const clearDrawBtn = $("sgClearDrawBtn");
  const clearTypeBtn = $("sgClearTypeBtn");

  if (!pad || !pctx) return;

  let mode = "draw"; // 'draw' | 'type'
  let inkColor = INK_COLORS[0].hex;
  let strokeWeight = STROKE_WEIGHTS[1].width;
  let selectedStyle = 0;
  let strokes = [];
  let isDrawing = false;
  let typedRenderToken = 0;
  let activeTrimmedCanvas = null;

  // Format today's date cleanly in Contract Preview
  if (contractDateEl) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    contractDateEl.textContent = `${dd}/${mm}/${now.getFullYear()}`;
  }

  /* ---------- Toast ---------- */
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

  /* ---------- Mode Tabs ---------- */
  const tabBtns = Array.from(document.querySelectorAll(".sg-mode-tab"));
  const panelDraw = $("sgPanelDraw");
  const panelType = $("sgPanelType");
  const weightControlWrap = $("sgWeightGroup");

  function setMode(next) {
    mode = next;
    tabBtns.forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panelDraw.hidden = next !== "draw";
    panelType.hidden = next !== "type";
    if (weightControlWrap) weightControlWrap.hidden = next !== "draw";

    if (next === "type") {
      renderTypedSignature();
      nameInput?.focus({ preventScroll: true });
    } else {
      redrawPad();
      syncPreviewFromCanvas(pad);
    }
  }

  tabBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
    btn.addEventListener("keydown", (e) => {
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const target = tabBtns[(idx + dir + tabBtns.length) % tabBtns.length];
      target.focus();
      setMode(target.dataset.mode);
    });
  });

  /* ---------- Ink Color Swatches & Stroke Weight Controls ---------- */
  const swatchesEl = $("sgSwatches");
  INK_COLORS.forEach((c, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sg-swatch";
    b.style.background = c.hex;
    b.title = c.name;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", `${c.name} ink`);
    b.setAttribute("aria-checked", String(idx === 0));
    b.addEventListener("click", () => {
      inkColor = c.hex;
      swatchesEl
        .querySelectorAll(".sg-swatch")
        .forEach((el, j) => el.setAttribute("aria-checked", String(j === idx)));
      updateStyleCardColors();
      if (mode === "draw") {
        // Update existing strokes to selected ink so color preview feels instant
        strokes.forEach((s) => (s.color = inkColor));
        redrawPad();
        syncPreviewFromCanvas(pad);
      } else {
        renderTypedSignature();
      }
    });
    swatchesEl.appendChild(b);
  });

  const weightsEl = $("sgWeights");
  STROKE_WEIGHTS.forEach((w, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sg-weight-btn";
    b.textContent = w.label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(idx === 1));
    b.addEventListener("click", () => {
      strokeWeight = w.width;
      weightsEl
        .querySelectorAll(".sg-weight-btn")
        .forEach((el, j) => el.setAttribute("aria-checked", String(j === idx)));
    });
    weightsEl.appendChild(b);
  });

  /* ---------- Draw Engine (Smooth Quadratic Bezier) ---------- */
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function canvasPoint(e) {
    const r = pad.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * pad.width) / r.width,
      y: ((e.clientY - r.top) * pad.height) / r.height,
    };
  }

  function renderStroke(stroke) {
    const pts = stroke.pts;
    if (!pts.length) return;
    pctx.save();
    pctx.strokeStyle = stroke.color;
    pctx.fillStyle = stroke.color;
    pctx.lineWidth = stroke.width;
    pctx.lineCap = "round";
    pctx.lineJoin = "round";

    if (pts.length === 1) {
      pctx.beginPath();
      pctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();
      return;
    }

    pctx.beginPath();
    pctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      pctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    const last = pts[pts.length - 1];
    pctx.lineTo(last.x, last.y);
    pctx.stroke();
    pctx.restore();
  }

  function redrawPad() {
    pctx.clearRect(0, 0, pad.width, pad.height);
    strokes.forEach(renderStroke);
    const hasInk = strokes.length > 0;
    padStage.classList.toggle("has-ink", hasInk);
    if (undoBtn) undoBtn.disabled = !hasInk;
    if (clearDrawBtn) clearDrawBtn.disabled = !hasInk;
  }

  pad.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    isDrawing = true;
    padStage.classList.add("is-drawing");
    pad.setPointerCapture(e.pointerId);

    const pressureScale = e.pointerType === "pen" && e.pressure > 0 ? 0.75 + e.pressure * 0.55 : 1;
    const stroke = {
      color: inkColor,
      width: strokeWeight * pressureScale,
      pts: [canvasPoint(e)],
    };
    strokes.push(stroke);
    redrawPad();
  });

  pad.addEventListener("pointermove", (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const s = strokes[strokes.length - 1];
    const p = canvasPoint(e);
    const last = s.pts[s.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.6) return;
    s.pts.push(p);
    redrawPad();
  });

  function finishStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    padStage.classList.remove("is-drawing");
    redrawPad();
    syncPreviewFromCanvas(pad);
  }

  pad.addEventListener("pointerup", finishStroke);
  pad.addEventListener("pointercancel", finishStroke);

  undoBtn?.addEventListener("click", () => {
    if (!strokes.length) return;
    strokes.pop();
    redrawPad();
    syncPreviewFromCanvas(pad);
  });

  clearDrawBtn?.addEventListener("click", () => {
    strokes = [];
    redrawPad();
    syncPreviewFromCanvas(pad);
  });

  /* ---------- Type Engine (6 Persona Cards) ---------- */
  function buildStyleCards() {
    styleGrid.innerHTML = "";
    STYLE_PERSONAS.forEach((st, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sg-style-card";
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", String(idx === selectedStyle));

      const persona = document.createElement("span");
      persona.className = "sg-style-persona";
      persona.textContent = st.persona;

      const sample = document.createElement("span");
      sample.className = "sg-style-sample";
      sample.style.fontFamily = `"${st.font}", "Brush Script MT", cursive`;
      sample.style.fontWeight = String(st.weight);
      sample.style.color = inkColor;
      sample.textContent = "Your name";

      card.append(persona, sample);
      card.addEventListener("click", () => {
        selectedStyle = idx;
        styleGrid
          .querySelectorAll(".sg-style-card")
          .forEach((el, j) => el.setAttribute("aria-checked", String(j === idx)));
        renderTypedSignature();
      });
      styleGrid.appendChild(card);
    });
  }

  function updateStyleCardColors() {
    styleGrid.querySelectorAll(".sg-style-sample").forEach((el) => {
      el.style.color = inkColor;
    });
  }

  function updateStyleCardSamples(text) {
    const display = text.trim() || "Your name";
    styleGrid.querySelectorAll(".sg-style-sample").forEach((el) => {
      el.textContent = display;
    });
  }

  async function renderTypedSignature() {
    const rawText = nameInput?.value || "";
    const text = rawText.trim();
    const token = ++typedRenderToken;

    updateStyleCardSamples(text);
    if (clearTypeBtn) clearTypeBtn.disabled = !text;
    if (contractNameCaption) {
      contractNameCaption.textContent = text ? `Signature — ${text}` : "Authorized Signature";
    }

    if (!text) {
      tctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
      syncPreviewFromCanvas(typeCanvas);
      return;
    }

    const st = STYLE_PERSONAS[selectedStyle];
    try {
      await document.fonts.load(`${st.weight} 72px "${st.font}"`, text);
    } catch (_) {}
    if (token !== typedRenderToken) return;

    const maxW = typeCanvas.width - 96;
    let fontSize = st.size;
    const fontSpec = (s) => `${st.weight} ${s}px "${st.font}", "Brush Script MT", "Segoe Script", cursive`;
    tctx.font = fontSpec(fontSize);
    const measured = tctx.measureText(text).width;
    if (measured > maxW) {
      fontSize = Math.max(32, Math.floor((fontSize * maxW) / measured));
    }

    tctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
    tctx.font = fontSpec(fontSize);
    tctx.fillStyle = inkColor;
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillText(text, typeCanvas.width / 2, typeCanvas.height / 2);

    syncPreviewFromCanvas(typeCanvas);
  }

  nameInput?.addEventListener("input", renderTypedSignature);
  clearTypeBtn?.addEventListener("click", () => {
    if (!nameInput) return;
    nameInput.value = "";
    renderTypedSignature();
    nameInput.focus();
  });

  /* ---------- Canvas Trimming & Live Preview Sync ---------- */
  function trimCanvasWithPadding(src, padPx) {
    const ctx = src.getContext("2d", { willReadFrequently: true });
    const w = src.width;
    const h = src.height;
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return null;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const p = padPx || 24;

    const out = document.createElement("canvas");
    out.width = cropW + p * 2;
    out.height = cropH + p * 2;
    out.getContext("2d").drawImage(src, minX, minY, cropW, cropH, p, p, cropW, cropH);
    return out;
  }

  function syncPreviewFromCanvas(sourceCanvas) {
    activeTrimmedCanvas = trimCanvasWithPadding(sourceCanvas, 24);
    const ready = !!activeTrimmedCanvas;

    if (dlPngBtn) dlPngBtn.disabled = !ready;
    if (dlJpgBtn) dlJpgBtn.disabled = !ready;
    if (useInPdfBtn) useInPdfBtn.disabled = !ready;
    if (readyPill) readyPill.hidden = !ready;

    if (!ready) {
      previewImg.hidden = true;
      previewImg.removeAttribute("src");
      previewEmpty.hidden = false;

      contractSigImg.hidden = true;
      contractSigImg.removeAttribute("src");
      contractPlaceholder.hidden = false;
      return;
    }

    const pngUrl = activeTrimmedCanvas.toDataURL("image/png");
    previewImg.src = pngUrl;
    previewImg.hidden = false;
    previewEmpty.hidden = true;

    contractSigImg.src = pngUrl;
    contractSigImg.hidden = false;
    contractPlaceholder.hidden = true;
  }

  /* ---------- Dual Export (Transparent PNG & Crisp White-Background JPEG) ---------- */
  function makeExportFilename(ext) {
    const rawName = (mode === "type" && nameInput?.value.trim()) || "open-sign-signature";
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return `${slug || "signature"}-signature.${ext}`;
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  dlPngBtn?.addEventListener("click", () => {
    if (!activeTrimmedCanvas) return;
    const url = activeTrimmedCanvas.toDataURL("image/png");
    const name = makeExportFilename("png");
    triggerDownload(url, name);
    toast(`Downloaded transparent PNG (${name}).`);
  });

  dlJpgBtn?.addEventListener("click", () => {
    if (!activeTrimmedCanvas) return;
    const jpgCanvas = document.createElement("canvas");
    jpgCanvas.width = activeTrimmedCanvas.width;
    jpgCanvas.height = activeTrimmedCanvas.height;
    const jctx = jpgCanvas.getContext("2d", { alpha: false });
    jctx.fillStyle = "#FFFFFF";
    jctx.fillRect(0, 0, jpgCanvas.width, jpgCanvas.height);
    jctx.drawImage(activeTrimmedCanvas, 0, 0);

    const url = jpgCanvas.toDataURL("image/jpeg", 0.96);
    const name = makeExportFilename("jpg");
    triggerDownload(url, name);
    toast(`Downloaded JPEG (${name}).`);
  });

  /* ---------- Direct Handoff into Open Sign PDF Editor ---------- */
  useInPdfBtn?.addEventListener("click", () => {
    if (!activeTrimmedCanvas) return;
    try {
      sessionStorage.setItem(
        "opensign:generatedSignature",
        JSON.stringify({
          dataUrl: activeTrimmedCanvas.toDataURL("image/png"),
          w: activeTrimmedCanvas.width,
          h: activeTrimmedCanvas.height,
        })
      );
    } catch (_) {}
    window.location.href = "index.html";
  });

  // Init
  buildStyleCards();
  redrawPad();
  syncPreviewFromCanvas(pad);
})();
