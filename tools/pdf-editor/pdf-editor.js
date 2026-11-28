(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const MAX_PDF_BYTES = 80 * 1024 * 1024; // 80 MB safe browser memory guard

  const FONT_FAMILIES = [
    { label: "Helvetica", css: "Helvetica, Arial, sans-serif", pdfBase: "Helvetica" },
    { label: "Arial", css: "Arial, Helvetica, sans-serif", pdfBase: "Helvetica" },
    { label: "Times New Roman", css: "'Times New Roman', Times, serif", pdfBase: "TimesRoman" },
    { label: "Courier New", css: "'Courier New', Courier, monospace", pdfBase: "Courier" },
    { label: "Georgia", css: "Georgia, 'Times New Roman', serif", pdfBase: "TimesRoman" },
    { label: "Verdana", css: "Verdana, Geneva, sans-serif", pdfBase: "Helvetica" },
    { label: "Open Sans", css: "'Open Sans', Arial, sans-serif", pdfBase: "Helvetica" },
    { label: "Roboto", css: "'Roboto', Arial, sans-serif", pdfBase: "Helvetica" },
  ];

  let uidSeq = 1;
  const uid = (p) => `${p}_${Date.now()}_${uidSeq++}`;

  // Volatile in-memory state (never persisted to browser storage or uploaded)
  let state = {
    fileName: "",
    // sourceDocs[docId] = { id, bytes: Uint8Array, pdfjsDoc }
    sourceDocs: {},
    // pages: [{ id, sourceDocId, sourcePageIndex, width, height, rotation, crop: {t,r,b,l}, blank, objects: [], textSpans: [] }]
    pages: [],
    currentPageIdx: 0,
    selectedPageIds: new Set(),
    zoom: 1.0,
    thumbZoom: 120,
    activeTool: "select", // select, pan, edit_text, text, whiteout, highlight, underline, strike, draw, eraser, sticky, comment, rect, circle, line, arrow, polygon, form_text, form_check, form_radio, form_select, form_date
    selectedObjId: null,
    clipboardObj: null,
    sessionSignatures: [], // [{ id, label, dataUrl }]
    watermark: {
      enabled: false,
      type: "text", // 'text' | 'image'
      text: "CONFIDENTIAL",
      font: "Helvetica",
      size: 48,
      color: "#e42527",
      opacity: 0.22,
      rotation: -35,
      position: "center", // center | top | bottom | tile
      scope: "all", // all | selected
      imageDataUrl: null,
      imageScale: 0.4,
    },
    headerFooter: {
      enabled: false,
      headerLeft: "",
      headerCenter: "",
      headerRight: "",
      footerLeft: "",
      footerCenter: "",
      footerRight: "",
      pageNumbers: false,
      pageNumPos: "bottom-right", // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
      pageNumFormat: "Page {n} of {total}",
      startPage: 1,
      fontSize: 10,
      color: "#4a5568",
      margin: 24,
    },
    metadata: {
      title: "",
      author: "",
      subject: "",
      keywords: "",
      creator: "Open Sign PDF Editor",
      producer: "Open Sign",
    },
    existingFormFields: [], // [{ name, type, value, options }]
    search: {
      query: "",
      matches: [], // [{ pageIdx, spanIdx }]
      currentHit: -1,
    },
    undoStack: [],
    redoStack: [],
    isExporting: false,
  };

  let activeObjectUrls = [];

  function trackUrl(url) {
    activeObjectUrls.push(url);
    return url;
  }

  function revokeTrackedUrls() {
    activeObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    activeObjectUrls = [];
  }

  window.addEventListener("beforeunload", revokeTrackedUrls);

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function currentPage() {
    return state.pages[state.currentPageIdx] || null;
  }

  function getSelectedObj() {
    const pg = currentPage();
    if (!pg || !state.selectedObjId) return null;
    return pg.objects.find((o) => o.id === state.selectedObjId) || null;
  }

  /* ---------- Undo / Redo Snapshot Engine ---------- */
  function takeSnapshot() {
    return JSON.stringify({
      pages: state.pages.map((p) => ({
        id: p.id,
        sourceDocId: p.sourceDocId,
        sourcePageIndex: p.sourcePageIndex,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
        crop: p.crop,
        blank: p.blank,
        objects: p.objects,
      })),
      currentPageIdx: state.currentPageIdx,
      watermark: state.watermark,
      headerFooter: state.headerFooter,
      metadata: state.metadata,
    });
  }

  function pushUndo() {
    state.undoStack.push(takeSnapshot());
    if (state.undoStack.length > 35) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function restoreSnapshot(snapStr) {
    const parsed = JSON.parse(snapStr);
    const oldTextMap = new Map(state.pages.map((p) => [p.id, p.textSpans || []]));
    state.pages = parsed.pages.map((p) => ({
      ...p,
      textSpans: oldTextMap.get(p.id) || [],
    }));
    state.currentPageIdx = Math.max(0, Math.min(parsed.currentPageIdx, state.pages.length - 1));
    state.watermark = parsed.watermark;
    state.headerFooter = parsed.headerFooter;
    state.metadata = parsed.metadata;
    state.selectedObjId = null;
    updateHistoryButtons();
    renderThumbnails();
    renderCurrentPage();
    renderPropertiesPanel();
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(takeSnapshot());
    restoreSnapshot(state.undoStack.pop());
    toast("Undid last action.");
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(takeSnapshot());
    restoreSnapshot(state.redoStack.pop());
    toast("Redid action.");
  }

  function updateHistoryButtons() {
    if ($("peUndoBtn")) $("peUndoBtn").disabled = state.undoStack.length === 0;
    if ($("peRedoBtn")) $("peRedoBtn").disabled = state.redoStack.length === 0;
  }

  /* ---------- Load PDF (Single, Merge, Insert, Replace, or Blank) ---------- */
  async function loadPdfFile(file, mode = "open") {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name || "") && file.type !== "application/pdf") {
      toast("Please select a valid PDF file.", "error");
      return;
    }
    if (file.size === 0) {
      toast("Selected PDF file is empty.", "error");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast("PDF exceeds 80 MB browser memory limit. Compress it first with PDF Compressor.", "error");
      return;
    }

    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      await loadPdfBytes(bytes, file.name || "document.pdf", mode);
    } catch (err) {
      toast(err?.message || "Could not read PDF file.", "error");
    }
  }

  async function loadPdfBytes(bytes, fileName, mode = "open", password = undefined) {
    if (!window.pdfjsLib || !window.PDFLib) {
      toast("PDF libraries failed to load. Refresh the page and try again.", "error");
      return;
    }

    try {
      const loadingTask = window.pdfjsLib.getDocument({ data: bytes.slice(0), password });
      const pdfjsDoc = await loadingTask.promise;

      const docId = uid("src");
      state.sourceDocs[docId] = { id: docId, bytes: bytes.slice(0), pdfjsDoc };

      const newPages = [];
      for (let i = 1; i <= pdfjsDoc.numPages; i++) {
        const pg = await pdfjsDoc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        newPages.push({
          id: uid("pg"),
          sourceDocId: docId,
          sourcePageIndex: i - 1,
          width: vp.width,
          height: vp.height,
          rotation: 0,
          crop: { t: 0, r: 0, b: 0, l: 0 },
          blank: false,
          objects: [],
          textSpans: [],
        });
      }

      if (mode === "open") {
        revokeTrackedUrls();
        state.fileName = fileName;
        state.pages = newPages;
        state.currentPageIdx = 0;
        state.selectedPageIds = new Set();
        state.selectedObjId = null;
        state.undoStack = [];
        state.redoStack = [];
        state.search = { query: "", matches: [], currentHit: -1 };
        await inspectPdfLibMetadataAndForms(bytes);
        openWorkspaceView();
        toast(`Opened "${fileName}" (${newPages.length} page${newPages.length === 1 ? "" : "s"}).`);
      } else if (mode === "merge") {
        pushUndo();
        state.pages.push(...newPages);
        toast(`Merged ${newPages.length} page(s) from "${fileName}".`);
      } else if (mode === "insert") {
        pushUndo();
        state.pages.splice(state.currentPageIdx + 1, 0, ...newPages);
        toast(`Inserted ${newPages.length} page(s) after Page ${state.currentPageIdx + 1}.`);
      } else if (mode === "replace") {
        pushUndo();
        state.pages.splice(state.currentPageIdx, 1, newPages[0]);
        toast(`Replaced Page ${state.currentPageIdx + 1} with page 1 of "${fileName}".`);
      }

      renderThumbnails();
      await renderCurrentPage();
      renderPropertiesPanel();
      updateHistoryButtons();
    } catch (err) {
      if (err && (err.name === "PasswordException" || /password/i.test(err.message || ""))) {
        const pw = window.prompt("This PDF is password-protected. Enter the valid document password to open it:");
        if (pw !== null && pw !== "") {
          return loadPdfBytes(bytes, fileName, mode, pw);
        }
        toast("Password required to open encrypted PDF. Open Sign never bypasses password protection.", "error");
        return;
      }
      toast(err?.message || "Failed to open PDF. The file may be corrupted or unsupported.", "error");
    }
  }

  async function inspectPdfLibMetadataAndForms(bytes) {
    state.existingFormFields = [];
    try {
      const pdfDoc = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      state.metadata = {
        title: pdfDoc.getTitle() || "",
        author: pdfDoc.getAuthor() || "",
        subject: pdfDoc.getSubject() || "",
        keywords: "",
        creator: pdfDoc.getCreator() || "Open Sign PDF Editor",
        producer: pdfDoc.getProducer() || "Open Sign",
      };

      const form = pdfDoc.getForm();
      const fields = form.getFields();
      state.existingFormFields = fields.map((f) => {
        const typeName = f.constructor.name;
        const name = f.getName();
        let value = "";
        let options = [];
        try {
          if (typeName === "PDFTextField") value = f.getText() || "";
          else if (typeName === "PDFCheckBox") value = f.isChecked();
          else if (typeName === "PDFDropdown") {
            options = f.getOptions() || [];
            value = (f.getSelected() || [])[0] || "";
          } else if (typeName === "PDFRadioGroup") {
            options = f.getOptions() || [];
            value = f.getSelected() || "";
          }
        } catch (_) {}
        return { name, type: typeName, value, options };
      });
    } catch (_) {
      // Encrypted or form-less PDF fallback
    }
    const fBtn = $("peFormsBtn");
    if (fBtn) {
      fBtn.textContent = state.existingFormFields.length
        ? `Fill Forms (${state.existingFormFields.length})`
        : "Fill Forms";
    }
  }

  async function createBlankPdfDocument() {
    const doc = await window.PDFLib.PDFDocument.create();
    doc.addPage([595.28, 841.89]); // A4 Portrait
    const bytes = await doc.save();
    await loadPdfBytes(bytes, "Untitled_Document.pdf", "open");
  }

  function openWorkspaceView() {
    $("peLandingView").hidden = true;
    $("peWorkspaceShell").hidden = false;
    $("peFileNameLbl").textContent = state.fileName || "Document.pdf";
  }

  /* ---------- Render Page Thumbnails (Left Sidebar) ---------- */
  let dragSrcIdx = null;
  function renderThumbnails() {
    const list = $("peThumbList");
    if (!list) return;
    list.innerHTML = "";

    state.pages.forEach((pg, idx) => {
      const card = document.createElement("div");
      card.className = `pe-thumb-card${idx === state.currentPageIdx ? " active" : ""}`;
      card.draggable = true;
      card.dataset.idx = String(idx);

      const canvas = document.createElement("canvas");
      canvas.className = "pe-thumb-canvas";
      canvas.style.width = `${state.thumbZoom}px`;

      const foot = document.createElement("div");
      foot.className = "pe-thumb-foot";
      foot.innerHTML = `
        <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer">
          <input type="checkbox" class="pe-thumb-check" ${state.selectedPageIds.has(pg.id) ? "checked" : ""} aria-label="Select page ${idx + 1}" />
          <span>Page ${idx + 1}</span>
        </label>
        <span style="font-size:10px;color:var(--muted)">${pg.objects.length ? `${pg.objects.length} obj` : ""}</span>
      `;

      foot.querySelector(".pe-thumb-check").addEventListener("change", (e) => {
        e.stopPropagation();
        if (e.target.checked) state.selectedPageIds.add(pg.id);
        else state.selectedPageIds.delete(pg.id);
        updateBulkPageButtons();
      });

      card.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
        state.currentPageIdx = idx;
        state.selectedObjId = null;
        renderThumbnails();
        renderCurrentPage();
        renderPropertiesPanel();
      });

      // Drag-and-drop page reordering
      card.addEventListener("dragstart", () => {
        dragSrcIdx = idx;
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragSrcIdx === null || dragSrcIdx === idx) return;
        pushUndo();
        const [moved] = state.pages.splice(dragSrcIdx, 1);
        state.pages.splice(idx, 0, moved);
        state.currentPageIdx = idx;
        dragSrcIdx = null;
        renderThumbnails();
        renderCurrentPage();
        toast(`Moved page to position ${idx + 1}.`);
      });

      card.append(canvas, foot);
      list.appendChild(card);

      // Render thumbnail asynchronously
      renderPageToCanvas(pg, canvas, Math.max(0.22, state.thumbZoom / Math.max(pg.width, 400)));
    });

    updateBulkPageButtons();
    updateBottomBar();
  }

  function updateBulkPageButtons() {
    const cnt = state.selectedPageIds.size;
    if ($("peExtractPagesBtn")) $("peExtractPagesBtn").disabled = cnt === 0;
  }

  async function renderPageToCanvas(pg, canvas, scale) {
    const ctx = canvas.getContext("2d");
    const rot = ((pg.rotation % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    const dispW = swapped ? pg.height : pg.width;
    const dispH = swapped ? pg.width : pg.height;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(dispW * scale * dpr));
    canvas.height = Math.max(1, Math.round(dispH * scale * dpr));

    if (pg.blank || !pg.sourceDocId || !state.sourceDocs[pg.sourceDocId]) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    try {
      const pdfPage = await state.sourceDocs[pg.sourceDocId].pdfjsDoc.getPage(pg.sourcePageIndex + 1);
      const vp = pdfPage.getViewport({ scale: scale * dpr, rotation: (pdfPage.rotate + rot) % 360 });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch (_) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /* ---------- Render Main Editing Canvas, Text Layer, Vector Layer & Objects ---------- */
  async function renderCurrentPage() {
    const pg = currentPage();
    if (!pg) return;

    const rot = ((pg.rotation % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    const baseW = swapped ? pg.height : pg.width;
    const baseH = swapped ? pg.width : pg.height;

    const stage = $("pePageStage");
    const pdfCanvas = $("pePdfCanvas");
    const dispW = Math.round(baseW * state.zoom);
    const dispH = Math.round(baseH * state.zoom);

    stage.style.width = `${dispW}px`;
    stage.style.height = `${dispH}px`;

    await renderPageToCanvas(pg, pdfCanvas, state.zoom);

    // Extract text spans once for search & Mode A text editing
    if (!pg.blank && pg.sourceDocId && pg.textSpans.length === 0) {
      await extractPageTextSpans(pg);
    }

    renderTextLayer(pg);
    renderSvgLayer(pg, baseW, baseH);
    renderObjectLayer(pg);
    renderDocOverlay(pg, baseW, baseH);
    updateBottomBar();
  }

  async function extractPageTextSpans(pg) {
    const src = state.sourceDocs[pg.sourceDocId];
    if (!src) return;
    try {
      const pdfPage = await src.pdfjsDoc.getPage(pg.sourcePageIndex + 1);
      const vp = pdfPage.getViewport({ scale: 1 });
      const tc = await pdfPage.getTextContent();
      const spans = [];
      for (const item of tc.items) {
        if (!item.str || !item.str.trim()) continue;
        const tx = window.pdfjsLib.Util.transform(vp.transform, item.transform);
        const fontSize = Math.hypot(tx[2], tx[3]) || 12;
        const x = tx[4];
        const y = tx[5] - fontSize * 0.85;
        const w = Math.max(item.width || fontSize * item.str.length * 0.5, 16);
        const h = fontSize * 1.25;
        spans.push({ text: item.str, x, y, w, h, fontSize });
      }
      pg.textSpans = spans;
    } catch (_) {
      pg.textSpans = [];
    }
  }

  function renderTextLayer(pg) {
    const layer = $("peTextLayer");
    if (!layer) return;
    layer.innerHTML = "";
    const isEditTextMode = state.activeTool === "edit_text";
    layer.classList.toggle("is-active", isEditTextMode);

    const hits = state.search.matches.filter((m) => m.pageIdx === state.currentPageIdx);
    const curMatch = state.search.matches[state.search.currentHit];

    pg.textSpans.forEach((sp, sIdx) => {
      const hitObj = hits.find((h) => h.spanIdx === sIdx);
      if (!isEditTextMode && !hitObj) return;

      const el = document.createElement("div");
      el.className = "pe-pdf-span";
      if (hitObj) el.classList.add("is-search-hit");
      if (curMatch && curMatch.pageIdx === state.currentPageIdx && curMatch.spanIdx === sIdx) {
        el.classList.add("is-search-current");
      }

      el.style.left = `${sp.x * state.zoom}px`;
      el.style.top = `${sp.y * state.zoom}px`;
      el.style.width = `${sp.w * state.zoom}px`;
      el.style.height = `${sp.h * state.zoom}px`;
      el.title = isEditTextMode ? `Click to edit: "${sp.text}"` : sp.text;

      if (isEditTextMode) {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          pushUndo();
          // Visual cover + replacement text box matched to the extracted PDF text span
          const obj = createDefaultTextObj(sp.x, sp.y, sp.text);
          obj.w = Math.max(sp.w + 14, 90);
          obj.h = Math.max(sp.h + 6, 26);
          obj.fontSize = Math.max(8, Math.round(sp.fontSize));
          obj.bgColor = "#ffffff";
          obj.padding = 2;
          obj.isVisualReplace = true;
          pg.objects.push(obj);
          state.selectedObjId = obj.id;
          setActiveTool("select");
          renderObjectLayer(pg);
          renderPropertiesPanel();
          toast("Visual text replacement box created over original span.");
        });
      }

      layer.appendChild(el);
    });
  }

  function renderSvgLayer(pg, baseW, baseH) {
    const svg = $("peSvgLayer");
    if (!svg) return;
    svg.setAttribute("viewBox", `0 0 ${baseW} ${baseH}`);
    svg.innerHTML = `
      <defs>
        <marker id="peArrowHead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
        </marker>
      </defs>
    `;

    pg.objects.forEach((obj) => {
      if (obj.type === "draw" && Array.isArray(obj.points) && obj.points.length > 1) {
        const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        pl.setAttribute("points", obj.points.map((pt) => `${pt.x},${pt.y}`).join(" "));
        pl.setAttribute("fill", "none");
        pl.setAttribute("stroke", obj.strokeColor || "#e42527");
        pl.setAttribute("stroke-width", String(obj.strokeWidth || 2.5));
        pl.setAttribute("stroke-linecap", "round");
        pl.setAttribute("stroke-linejoin", "round");
        pl.setAttribute("opacity", String(obj.opacity ?? 1));
        pl.style.pointerEvents = state.activeTool === "eraser" || state.activeTool === "select" ? "stroke" : "none";
        pl.style.cursor = state.activeTool === "eraser" ? "crosshair" : "pointer";
        pl.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.activeTool === "eraser") {
            pushUndo();
            pg.objects = pg.objects.filter((x) => x.id !== obj.id);
            renderSvgLayer(pg, baseW, baseH);
            renderThumbnails();
          } else {
            state.selectedObjId = obj.id;
            renderObjectLayer(pg);
            renderPropertiesPanel();
          }
        });
        svg.appendChild(pl);
      } else if (obj.type === "line" || obj.type === "arrow") {
        const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
        ln.setAttribute("x1", String(obj.x));
        ln.setAttribute("y1", String(obj.y));
        ln.setAttribute("x2", String(obj.x + obj.w));
        ln.setAttribute("y2", String(obj.y + obj.h));
        ln.setAttribute("stroke", obj.strokeColor || "#056cb8");
        ln.setAttribute("stroke-width", String(obj.strokeWidth || 2.5));
        ln.setAttribute("opacity", String(obj.opacity ?? 1));
        if (obj.borderStyle === "dashed") ln.setAttribute("stroke-dasharray", "7 4");
        if (obj.borderStyle === "dotted") ln.setAttribute("stroke-dasharray", "2 4");
        if (obj.type === "arrow") ln.setAttribute("marker-end", "url(#peArrowHead)");
        ln.style.pointerEvents = "stroke";
        ln.style.cursor = "pointer";
        ln.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.activeTool === "eraser") {
            pushUndo();
            pg.objects = pg.objects.filter((x) => x.id !== obj.id);
            renderSvgLayer(pg, baseW, baseH);
          } else {
            state.selectedObjId = obj.id;
            renderObjectLayer(pg);
            renderPropertiesPanel();
          }
        });
        svg.appendChild(ln);
      }
    });
  }

  function renderObjectLayer(pg) {
    const layer = $("peObjLayer");
    if (!layer) return;
    layer.innerHTML = "";

    pg.objects.forEach((obj) => {
      if (obj.type === "draw" || obj.type === "line" || obj.type === "arrow") return;

      const el = document.createElement("div");
      el.className = `pe-obj${obj.id === state.selectedObjId ? " is-selected" : ""}`;
      el.dataset.objId = obj.id;
      el.style.left = `${obj.x * state.zoom}px`;
      el.style.top = `${obj.y * state.zoom}px`;
      el.style.width = `${obj.w * state.zoom}px`;
      el.style.height = `${obj.h * state.zoom}px`;
      el.style.opacity = String(obj.opacity ?? 1);
      el.style.transform = `rotate(${obj.rotation || 0}deg)`;

      if (obj.type === "text" || obj.type === "comment") {
        const inner = document.createElement("div");
        inner.className = "pe-obj-text-content";
        inner.contentEditable = "true";
        inner.spellcheck = false;
        inner.textContent = obj.text || "";
        const fMeta = FONT_FAMILIES.find((f) => f.label === obj.fontFamily) || FONT_FAMILIES[0];
        inner.style.fontFamily = fMeta.css;
        inner.style.fontSize = `${(obj.fontSize || 14) * state.zoom}px`;
        inner.style.fontWeight = obj.bold ? "700" : "400";
        inner.style.fontStyle = obj.italic ? "italic" : "normal";
        const decos = [];
        if (obj.underline) decos.push("underline");
        if (obj.strike) decos.push("line-through");
        inner.style.textDecoration = decos.join(" ") || "none";
        inner.style.color = obj.color || "#0b132b";
        inner.style.textAlign = obj.align || "left";
        inner.style.lineHeight = String(obj.lineHeight || 1.35);
        inner.style.letterSpacing = `${obj.letterSpacing || 0}px`;
        inner.style.backgroundColor = obj.bgColor && obj.bgColor !== "transparent" ? obj.bgColor : "transparent";
        inner.style.padding = `${(obj.padding || 4) * state.zoom}px`;
        if (obj.borderWidth > 0) {
          inner.style.border = `${obj.borderWidth}px ${obj.borderStyle || "solid"} ${obj.borderColor || "#056cb8"}`;
          inner.style.borderRadius = "4px";
        }

        inner.addEventListener("input", () => {
          obj.text = inner.textContent;
        });
        inner.addEventListener("focus", () => {
          state.selectedObjId = obj.id;
          renderPropertiesPanel();
        });
        el.appendChild(inner);
      } else if (obj.type === "image" || obj.type === "signature") {
        const img = document.createElement("img");
        img.className = "pe-obj-img";
        img.src = obj.dataUrl;
        img.alt = obj.type === "signature" ? "Signature" : "Inserted image";
        if (obj.crop) {
          img.style.clipPath = `inset(${obj.crop.t || 0}% ${obj.crop.r || 0}% ${obj.crop.b || 0}% ${obj.crop.l || 0}%)`;
        }
        el.appendChild(img);
      } else if (obj.type === "sticky") {
        const note = document.createElement("div");
        note.className = "pe-obj-sticky";
        note.contentEditable = "true";
        note.textContent = obj.text || "Note...";
        note.addEventListener("input", () => {
          obj.text = note.textContent;
        });
        el.appendChild(note);
      } else if (obj.type === "whiteout") {
        el.style.backgroundColor = obj.fillColor || "#ffffff";
        el.style.border = obj.id === state.selectedObjId ? "" : "1px dashed rgba(11,19,43,0.18)";
      } else if (obj.type === "highlight") {
        el.style.backgroundColor = obj.fillColor || "#fed600";
        el.style.mixBlendMode = "multiply";
      } else if (obj.type === "underline" || obj.type === "strike") {
        el.style.backgroundColor = obj.strokeColor || "#056cb8";
      } else if (obj.type === "rect" || obj.type === "circle" || obj.type === "polygon") {
        el.style.backgroundColor = obj.fillColor && obj.fillColor !== "transparent" ? obj.fillColor : "transparent";
        el.style.border = `${obj.strokeWidth || 2}px ${obj.borderStyle || "solid"} ${obj.strokeColor || "#056cb8"}`;
        if (obj.type === "circle") el.style.borderRadius = "50%";
        if (obj.type === "polygon") el.style.clipPath = "polygon(50% 0%, 100% 100%, 0% 100%)";
      } else if (obj.type.startsWith("form_")) {
        el.style.backgroundColor = "rgba(5, 108, 184, 0.08)";
        el.style.border = "1.5px dashed #056cb8";
        el.style.borderRadius = "4px";
        el.style.padding = "3px 6px";
        el.style.fontSize = `${11 * state.zoom}px`;
        el.style.fontWeight = "700";
        el.style.color = "#056cb8";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.textContent = obj.fieldLabel || obj.type.replace("form_", "Form ");
      }

      // Click select or erase
      el.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("pe-resize-handle") || e.target.classList.contains("pe-rotate-handle")) return;
        e.stopPropagation();
        if (state.activeTool === "eraser") {
          pushUndo();
          pg.objects = pg.objects.filter((x) => x.id !== obj.id);
          state.selectedObjId = null;
          renderObjectLayer(pg);
          renderPropertiesPanel();
          renderThumbnails();
          return;
        }
        state.selectedObjId = obj.id;
        renderPropertiesPanel();
        layer.querySelectorAll(".pe-obj").forEach((node) => node.classList.toggle("is-selected", node.dataset.objId === obj.id));

        // If user clicked inside editable text directly, allow typing without immediately dragging
        if (e.target.isContentEditable && document.activeElement === e.target) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const origX = obj.x;
        const origY = obj.y;
        let moved = false;

        const onMove = (me) => {
          const dx = (me.clientX - startX) / state.zoom;
          const dy = (me.clientY - startY) / state.zoom;
          if (!moved && Math.hypot(dx, dy) > 3) {
            pushUndo();
            moved = true;
          }
          if (moved) {
            obj.x = Math.round(origX + dx);
            obj.y = Math.round(origY + dy);
            el.style.left = `${obj.x * state.zoom}px`;
            el.style.top = `${obj.y * state.zoom}px`;
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (moved) renderPropertiesPanel();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      // Resize & Rotate Handles when selected
      if (obj.id === state.selectedObjId) {
        const res = document.createElement("div");
        res.className = "pe-resize-handle";
        res.title = "Drag to resize";
        res.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          pushUndo();
          const sx = e.clientX;
          const sy = e.clientY;
          const ow = obj.w;
          const oh = obj.h;
          const aspect = ow / Math.max(1, oh);

          const onMove = (me) => {
            const nw = Math.max(18, Math.round(ow + (me.clientX - sx) / state.zoom));
            const nh = obj.lockAspect ? Math.max(12, Math.round(nw / aspect)) : Math.max(8, Math.round(oh + (me.clientY - sy) / state.zoom));
            obj.w = nw;
            obj.h = nh;
            el.style.width = `${nw * state.zoom}px`;
            el.style.height = `${nh * state.zoom}px`;
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            renderPropertiesPanel();
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });

        const rotH = document.createElement("div");
        rotH.className = "pe-rotate-handle";
        rotH.title = "Drag to rotate";
        rotH.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          pushUndo();
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const onMove = (me) => {
            const deg = Math.round((Math.atan2(me.clientY - cy, me.clientX - cx) * 180) / Math.PI + 90);
            obj.rotation = deg;
            el.style.transform = `rotate(${deg}deg)`;
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            renderPropertiesPanel();
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });

        el.append(res, rotH);
      }

      layer.appendChild(el);
    });
  }

  /* ---------- Live Watermark + Header/Footer/Page Numbers Preview ---------- */
  function renderDocOverlay(pg, baseW, baseH) {
    const ov = $("peDocOverlay");
    if (!ov) return;
    ov.innerHTML = "";

    const wm = state.watermark;
    const wmApplies = wm.enabled && (wm.scope === "all" || state.selectedPageIds.has(pg.id));
    if (wmApplies) {
      const wmEl = document.createElement("div");
      wmEl.style.cssText = `position:absolute;inset:0;display:flex;align-items:${wm.position === "top" ? "flex-start" : wm.position === "bottom" ? "flex-end" : "center"};justify-content:center;padding:36px;opacity:${wm.opacity};pointer-events:none;`;
      if (wm.type === "image" && wm.imageDataUrl) {
        wmEl.innerHTML = `<img src="${wm.imageDataUrl}" style="max-width:${Math.round(wm.imageScale * 100)}%;transform:rotate(${wm.rotation}deg)" alt="" />`;
      } else {
        wmEl.innerHTML = `<span style="font-size:${wm.size * state.zoom}px;font-weight:800;color:${wm.color};transform:rotate(${wm.rotation}deg);white-space:nowrap">${esc(wm.text)}</span>`;
      }
      ov.appendChild(wmEl);
    }

    const hf = state.headerFooter;
    if (hf.enabled || hf.pageNumbers) {
      const m = (hf.margin || 24) * state.zoom;
      const fs = (hf.fontSize || 10) * state.zoom;
      const col = hf.color || "#4a5568";
      const pageNum = state.currentPageIdx + 1;
      const total = state.pages.length;
      const pnStr =
        hf.pageNumbers && pageNum >= (hf.startPage || 1)
          ? (hf.pageNumFormat || "Page {n} of {total}").replace("{n}", String(pageNum)).replace("{total}", String(total))
          : "";

      const topL = hf.headerLeft || (hf.pageNumPos === "top-left" ? pnStr : "");
      const topC = hf.headerCenter || (hf.pageNumPos === "top-center" ? pnStr : "");
      const topR = hf.headerRight || (hf.pageNumPos === "top-right" ? pnStr : "");
      const botL = hf.footerLeft || (hf.pageNumPos === "bottom-left" ? pnStr : "");
      const botC = hf.footerCenter || (hf.pageNumPos === "bottom-center" ? pnStr : "");
      const botR = hf.footerRight || (hf.pageNumPos === "bottom-right" ? pnStr : "");

      if (topL || topC || topR) {
        const bar = document.createElement("div");
        bar.style.cssText = `position:absolute;top:${m * 0.5}px;left:${m}px;right:${m}px;display:grid;grid-template-columns:1fr 1fr 1fr;font-size:${fs}px;color:${col};font-weight:600;`;
        bar.innerHTML = `<span>${esc(topL)}</span><span style="text-align:center">${esc(topC)}</span><span style="text-align:right">${esc(topR)}</span>`;
        ov.appendChild(bar);
      }
      if (botL || botC || botR) {
        const bar = document.createElement("div");
        bar.style.cssText = `position:absolute;bottom:${m * 0.5}px;left:${m}px;right:${m}px;display:grid;grid-template-columns:1fr 1fr 1fr;font-size:${fs}px;color:${col};font-weight:600;`;
        bar.innerHTML = `<span>${esc(botL)}</span><span style="text-align:center">${esc(botC)}</span><span style="text-align:right">${esc(botR)}</span>`;
        ov.appendChild(bar);
      }
    }
  }

  /* ---------- Create Default Objects ---------- */
  function createDefaultTextObj(x, y, initialText = "Double-click to edit text") {
    return {
      id: uid("obj"),
      type: "text",
      x: Math.round(x),
      y: Math.round(y),
      w: 190,
      h: 36,
      rotation: 0,
      opacity: 1,
      text: initialText,
      fontFamily: "Helvetica",
      fontSize: 14,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      color: "#0b132b",
      align: "left",
      lineHeight: 1.35,
      letterSpacing: 0,
      bgColor: "transparent",
      borderWidth: 0,
      borderColor: "#056cb8",
      borderStyle: "solid",
      padding: 4,
    };
  }

  /* ---------- Right Sidebar: Context-Sensitive Properties Panel ---------- */
  function renderPropertiesPanel() {
    const body = $("pePropsBody");
    if (!body) return;
    const obj = getSelectedObj();
    const pg = currentPage();

    if (!obj) {
      body.innerHTML = `
        <div class="pe-prop-sec">
          <p class="pe-prop-title">Current Page</p>
          <p style="margin:0;font-size:12.5px;color:var(--muted)">
            Page ${state.currentPageIdx + 1} of ${state.pages.length}<br/>
            Dimensions: ${pg ? `${Math.round(pg.width)} × ${Math.round(pg.height)} pt` : "—"}<br/>
            Rotation: ${pg ? `${pg.rotation}°` : "0°"}
          </p>
          <p style="margin:0;font-size:12px;color:var(--muted)">
            Select any text, image, shape, or annotation on the canvas to adjust its font, colors, opacity, size, crop, or layer order.
          </p>
        </div>
        <div class="pe-prop-sec">
          <p class="pe-prop-title">Quick Page Orientation &amp; Size</p>
          <div class="pe-grid-2">
            <button type="button" class="pe-tool-btn" id="pePropRotCw">Rotate CW</button>
            <button type="button" class="pe-tool-btn" id="pePropRotCcw">Rotate CCW</button>
            <button type="button" class="pe-tool-btn" id="pePropSizeA4">Set A4</button>
            <button type="button" class="pe-tool-btn" id="pePropSizeLetter">Set Letter</button>
          </div>
        </div>
      `;
      $("pePropRotCw")?.addEventListener("click", () => rotateCurrentPage(90));
      $("pePropRotCcw")?.addEventListener("click", () => rotateCurrentPage(-90));
      $("pePropSizeA4")?.addEventListener("click", () => resizeCurrentPage(595.28, 841.89));
      $("pePropSizeLetter")?.addEventListener("click", () => resizeCurrentPage(612, 792));
      return;
    }

    let html = `
      <div class="pe-prop-sec">
        <p class="pe-prop-title">Selected: ${esc(obj.type.toUpperCase())}</p>
        <div class="pe-grid-2">
          <div class="pe-field"><label>X (pt)</label><input type="number" class="pe-input" id="prX" value="${Math.round(obj.x)}" /></div>
          <div class="pe-field"><label>Y (pt)</label><input type="number" class="pe-input" id="prY" value="${Math.round(obj.y)}" /></div>
          <div class="pe-field"><label>Width</label><input type="number" class="pe-input" id="prW" value="${Math.round(obj.w || 0)}" /></div>
          <div class="pe-field"><label>Height</label><input type="number" class="pe-input" id="prH" value="${Math.round(obj.h || 0)}" /></div>
        </div>
        <div class="pe-grid-2">
          <div class="pe-field"><label>Rotate (°)</label><input type="number" class="pe-input" id="prRot" value="${obj.rotation || 0}" /></div>
          <div class="pe-field"><label>Opacity</label><input type="range" id="prOp" min="0.1" max="1" step="0.05" value="${obj.opacity ?? 1}" /></div>
        </div>
      </div>
    `;

    if (obj.type === "text" || obj.type === "comment") {
      const fOpts = FONT_FAMILIES.map(
        (f) => `<option value="${f.label}"${obj.fontFamily === f.label ? " selected" : ""}>${f.label}</option>`
      ).join("");
      html += `
        <div class="pe-prop-sec">
          <p class="pe-prop-title">Typography &amp; Box</p>
          <div class="pe-field"><label>Font Family</label><select class="pe-select" id="prFont">${fOpts}</select></div>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Font Size</label><input type="number" class="pe-input" id="prSize" min="6" max="120" value="${obj.fontSize || 14}" /></div>
            <div class="pe-field"><label>Text Color</label><input type="color" class="pe-input" style="height:34px;padding:2px" id="prColor" value="${obj.color || "#0b132b"}" /></div>
          </div>
          <div class="pe-style-row">
            <button type="button" class="pe-tool-btn${obj.bold ? " active" : ""}" id="prBold">B</button>
            <button type="button" class="pe-tool-btn${obj.italic ? " active" : ""}" id="prItalic">I</button>
            <button type="button" class="pe-tool-btn${obj.underline ? " active" : ""}" id="prUnder">U</button>
            <button type="button" class="pe-tool-btn${obj.strike ? " active" : ""}" id="prStrike">S</button>
            <button type="button" class="pe-tool-btn${obj.align === "left" ? " active" : ""}" id="prAlL">L</button>
            <button type="button" class="pe-tool-btn${obj.align === "center" ? " active" : ""}" id="prAlC">C</button>
            <button type="button" class="pe-tool-btn${obj.align === "right" ? " active" : ""}" id="prAlR">R</button>
          </div>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Line Spacing</label><input type="number" class="pe-input" id="prLh" step="0.1" min="0.8" max="3" value="${obj.lineHeight || 1.35}" /></div>
            <div class="pe-field"><label>Letter Spacing</label><input type="number" class="pe-input" id="prLs" step="0.5" min="-2" max="12" value="${obj.letterSpacing || 0}" /></div>
          </div>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Background</label><select class="pe-select" id="prBg"><option value="transparent"${obj.bgColor === "transparent" ? " selected" : ""}>Transparent</option><option value="#ffffff"${obj.bgColor === "#ffffff" ? " selected" : ""}>White</option><option value="#fff9db"${obj.bgColor === "#fff9db" ? " selected" : ""}>Light Yellow</option><option value="#eef2ff"${obj.bgColor === "#eef2ff" ? " selected" : ""}>Soft Blue</option></select></div>
            <div class="pe-field"><label>Border (px)</label><input type="number" class="pe-input" id="prBw" min="0" max="8" value="${obj.borderWidth || 0}" /></div>
          </div>
        </div>
      `;
    } else if (obj.type === "image" || obj.type === "signature") {
      const c = obj.crop || { t: 0, r: 0, b: 0, l: 0 };
      html += `
        <div class="pe-prop-sec">
          <p class="pe-prop-title">Image &amp; Crop</p>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600">
            <input type="checkbox" id="prLockAspect" ${obj.lockAspect ? "checked" : ""} /> Maintain aspect ratio
          </label>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Crop Top %</label><input type="number" class="pe-input" id="prCt" min="0" max="45" value="${c.t}" /></div>
            <div class="pe-field"><label>Crop Right %</label><input type="number" class="pe-input" id="prCr" min="0" max="45" value="${c.r}" /></div>
            <div class="pe-field"><label>Crop Bottom %</label><input type="number" class="pe-input" id="prCb" min="0" max="45" value="${c.b}" /></div>
            <div class="pe-field"><label>Crop Left %</label><input type="number" class="pe-input" id="prCl" min="0" max="45" value="${c.l}" /></div>
          </div>
          <label class="pe-tool-btn" for="peReplaceImgInput" style="width:100%">Replace Image</label>
          <input type="file" id="peReplaceImgInput" class="sr-only" accept="image/png,image/jpeg,image/webp" />
        </div>
      `;
    } else if (["rect", "circle", "polygon", "line", "arrow", "highlight", "whiteout", "draw", "underline", "strike"].includes(obj.type)) {
      html += `
        <div class="pe-prop-sec">
          <p class="pe-prop-title">Shape &amp; Stroke</p>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Stroke Color</label><input type="color" class="pe-input" style="height:34px;padding:2px" id="prStroke" value="${obj.strokeColor || "#056cb8"}" /></div>
            <div class="pe-field"><label>Fill Color</label><input type="color" class="pe-input" style="height:34px;padding:2px" id="prFill" value="${obj.fillColor && obj.fillColor !== "transparent" ? obj.fillColor : "#ffffff"}" /></div>
          </div>
          <div class="pe-grid-2">
            <div class="pe-field"><label>Thickness</label><input type="number" class="pe-input" id="prSw" min="1" max="24" value="${obj.strokeWidth || 2}" /></div>
            <div class="pe-field"><label>Style</label><select class="pe-select" id="prBs"><option value="solid"${obj.borderStyle === "solid" ? " selected" : ""}>Solid</option><option value="dashed"${obj.borderStyle === "dashed" ? " selected" : ""}>Dashed</option><option value="dotted"${obj.borderStyle === "dotted" ? " selected" : ""}>Dotted</option></select></div>
          </div>
        </div>
      `;
    }

    html += `
      <div class="pe-prop-sec">
        <p class="pe-prop-title">Arrange &amp; Actions</p>
        <div class="pe-grid-2">
          <button type="button" class="pe-tool-btn" id="prFwd">Bring Forward</button>
          <button type="button" class="pe-tool-btn" id="prBack">Send Backward</button>
          <button type="button" class="pe-tool-btn" id="prDup">Duplicate</button>
          <button type="button" class="pe-tool-btn danger" id="prDel">Delete</button>
        </div>
      </div>
    `;

    body.innerHTML = html;

    const refresh = () => {
      const p = currentPage();
      if (!p) return;
      const rot = ((p.rotation % 360) + 360) % 360;
      const sw = rot === 90 || rot === 270;
      renderSvgLayer(p, sw ? p.height : p.width, sw ? p.width : p.height);
      renderObjectLayer(p);
    };

    const bindNum = (id, key) => {
      $(id)?.addEventListener("input", (e) => {
        obj[key] = Number(e.target.value) || 0;
        refresh();
      });
    };
    bindNum("prX", "x");
    bindNum("prY", "y");
    bindNum("prW", "w");
    bindNum("prH", "h");
    bindNum("prRot", "rotation");
    $("prOp")?.addEventListener("input", (e) => {
      obj.opacity = Number(e.target.value);
      refresh();
    });

    // Typography bindings
    $("prFont")?.addEventListener("change", (e) => { pushUndo(); obj.fontFamily = e.target.value; refresh(); });
    bindNum("prSize", "fontSize");
    $("prColor")?.addEventListener("input", (e) => { obj.color = e.target.value; refresh(); });
    $("prBold")?.addEventListener("click", () => { pushUndo(); obj.bold = !obj.bold; refresh(); renderPropertiesPanel(); });
    $("prItalic")?.addEventListener("click", () => { pushUndo(); obj.italic = !obj.italic; refresh(); renderPropertiesPanel(); });
    $("prUnder")?.addEventListener("click", () => { pushUndo(); obj.underline = !obj.underline; refresh(); renderPropertiesPanel(); });
    $("prStrike")?.addEventListener("click", () => { pushUndo(); obj.strike = !obj.strike; refresh(); renderPropertiesPanel(); });
    $("prAlL")?.addEventListener("click", () => { pushUndo(); obj.align = "left"; refresh(); renderPropertiesPanel(); });
    $("prAlC")?.addEventListener("click", () => { pushUndo(); obj.align = "center"; refresh(); renderPropertiesPanel(); });
    $("prAlR")?.addEventListener("click", () => { pushUndo(); obj.align = "right"; refresh(); renderPropertiesPanel(); });
    bindNum("prLh", "lineHeight");
    bindNum("prLs", "letterSpacing");
    $("prBg")?.addEventListener("change", (e) => { pushUndo(); obj.bgColor = e.target.value; refresh(); });
    bindNum("prBw", "borderWidth");

    // Image & crop bindings
    $("prLockAspect")?.addEventListener("change", (e) => { obj.lockAspect = e.target.checked; });
    ["t", "r", "b", "l"].forEach((side) => {
      $(`prC${side}`)?.addEventListener("input", (e) => {
        if (!obj.crop) obj.crop = { t: 0, r: 0, b: 0, l: 0 };
        obj.crop[side] = Math.max(0, Math.min(45, Number(e.target.value) || 0));
        refresh();
      });
    });
    $("peReplaceImgInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      readImageAsPngDataUrl(f, (dataUrl) => {
        pushUndo();
        obj.dataUrl = dataUrl;
        refresh();
        toast("Image replaced.");
      });
    });

    // Shape bindings
    $("prStroke")?.addEventListener("input", (e) => { obj.strokeColor = e.target.value; refresh(); });
    $("prFill")?.addEventListener("input", (e) => { obj.fillColor = e.target.value; refresh(); });
    bindNum("prSw", "strokeWidth");
    $("prBs")?.addEventListener("change", (e) => { obj.borderStyle = e.target.value; refresh(); });

    // Arrange bindings
    $("prFwd")?.addEventListener("click", () => {
      const idx = pg.objects.findIndex((x) => x.id === obj.id);
      if (idx >= 0 && idx < pg.objects.length - 1) {
        pushUndo();
        [pg.objects[idx], pg.objects[idx + 1]] = [pg.objects[idx + 1], pg.objects[idx]];
        refresh();
      }
    });
    $("prBack")?.addEventListener("click", () => {
      const idx = pg.objects.findIndex((x) => x.id === obj.id);
      if (idx > 0) {
        pushUndo();
        [pg.objects[idx], pg.objects[idx - 1]] = [pg.objects[idx - 1], pg.objects[idx]];
        refresh();
      }
    });
    $("prDup")?.addEventListener("click", duplicateSelectedObject);
    $("prDel")?.addEventListener("click", deleteSelectedObject);
  }

  function duplicateSelectedObject() {
    const pg = currentPage();
    const obj = getSelectedObj();
    if (!pg || !obj) return;
    pushUndo();
    const copy = JSON.parse(JSON.stringify(obj));
    copy.id = uid("obj");
    copy.x += 16;
    copy.y += 16;
    pg.objects.push(copy);
    state.selectedObjId = copy.id;
    renderCurrentPage();
    renderPropertiesPanel();
    renderThumbnails();
  }

  function deleteSelectedObject() {
    const pg = currentPage();
    if (!pg || !state.selectedObjId) return;
    pushUndo();
    pg.objects = pg.objects.filter((x) => x.id !== state.selectedObjId);
    state.selectedObjId = null;
    renderCurrentPage();
    renderPropertiesPanel();
    renderThumbnails();
  }

  /* ---------- Canvas Tool Pointer Interaction (Add Text, Draw, Shapes, Highlights, Forms) ---------- */
  function wireCanvasInteractions() {
    const stage = $("pePageStage");
    const center = $("peCenterPane");

    // Pan tool on center pane
    center.addEventListener("pointerdown", (e) => {
      if (state.activeTool !== "pan") return;
      center.classList.add("is-panning");
      const sx = e.clientX;
      const sy = e.clientY;
      const sl = center.scrollLeft;
      const st = center.scrollTop;
      const onMove = (me) => {
        center.scrollLeft = sl - (me.clientX - sx);
        center.scrollTop = st - (me.clientY - sy);
      };
      const onUp = () => {
        center.classList.remove("is-panning");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".pe-obj") || e.target.closest(".pe-pdf-span")) return;
      const pg = currentPage();
      if (!pg) return;

      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / state.zoom;
      const y = (e.clientY - rect.top) / state.zoom;
      const tool = state.activeTool;

      if (tool === "select") {
        state.selectedObjId = null;
        renderObjectLayer(pg);
        renderPropertiesPanel();
        return;
      }

      if (tool === "text" || tool === "comment") {
        pushUndo();
        const obj = createDefaultTextObj(x, y, tool === "comment" ? "Comment..." : "New text");
        if (tool === "comment") {
          obj.type = "comment";
          obj.bgColor = "#eef2ff";
          obj.borderWidth = 1;
          obj.borderColor = "#056cb8";
        }
        pg.objects.push(obj);
        state.selectedObjId = obj.id;
        setActiveTool("select");
        renderObjectLayer(pg);
        renderPropertiesPanel();
        renderThumbnails();
        return;
      }

      if (tool === "sticky") {
        pushUndo();
        const obj = { id: uid("obj"), type: "sticky", x: Math.round(x), y: Math.round(y), w: 150, h: 110, rotation: 0, opacity: 1, text: "Sticky note..." };
        pg.objects.push(obj);
        state.selectedObjId = obj.id;
        setActiveTool("select");
        renderObjectLayer(pg);
        renderPropertiesPanel();
        renderThumbnails();
        return;
      }

      if (tool.startsWith("form_")) {
        pushUndo();
        const labelMap = {
          form_text: "Text Field",
          form_check: "Checkbox",
          form_radio: "Radio Option",
          form_select: "Dropdown",
          form_date: "Date Field",
        };
        const obj = {
          id: uid("obj"),
          type: tool,
          fieldName: `${tool}_${pg.objects.length + 1}`,
          fieldLabel: labelMap[tool] || "Form Field",
          x: Math.round(x),
          y: Math.round(y),
          w: tool === "form_check" || tool === "form_radio" ? 24 : 160,
          h: tool === "form_check" || tool === "form_radio" ? 24 : 28,
          rotation: 0,
          opacity: 1,
        };
        pg.objects.push(obj);
        state.selectedObjId = obj.id;
        setActiveTool("select");
        renderObjectLayer(pg);
        renderPropertiesPanel();
        renderThumbnails();
        return;
      }

      if (tool === "draw") {
        pushUndo();
        const drawObj = {
          id: uid("obj"),
          type: "draw",
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          strokeColor: "#e42527",
          strokeWidth: 2.5,
          opacity: 1,
          points: [{ x, y }],
        };
        pg.objects.push(drawObj);
        const rot = ((pg.rotation % 360) + 360) % 360;
        const sw = rot === 90 || rot === 270;
        const bw = sw ? pg.height : pg.width;
        const bh = sw ? pg.width : pg.height;

        const onMove = (me) => {
          const nx = (me.clientX - rect.left) / state.zoom;
          const ny = (me.clientY - rect.top) / state.zoom;
          drawObj.points.push({ x: nx, y: ny });
          renderSvgLayer(pg, bw, bh);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          renderThumbnails();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }

      // Drag-to-draw shapes, highlight, whiteout, underline, strike, line, arrow
      if (["rect", "circle", "polygon", "line", "arrow", "highlight", "whiteout", "underline", "strike"].includes(tool)) {
        pushUndo();
        const obj = {
          id: uid("obj"),
          type: tool,
          x: Math.round(x),
          y: Math.round(y),
          w: 10,
          h: tool === "underline" || tool === "strike" ? 3 : 10,
          rotation: 0,
          opacity: tool === "highlight" ? 0.45 : 1,
          strokeColor: tool === "strike" ? "#e42527" : "#056cb8",
          fillColor: tool === "whiteout" ? "#ffffff" : tool === "highlight" ? "#fed600" : "transparent",
          strokeWidth: 2.5,
          borderStyle: "solid",
        };
        pg.objects.push(obj);
        state.selectedObjId = obj.id;

        const rot = ((pg.rotation % 360) + 360) % 360;
        const sw = rot === 90 || rot === 270;
        const bw = sw ? pg.height : pg.width;
        const bh = sw ? pg.width : pg.height;

        const onMove = (me) => {
          const cx = (me.clientX - rect.left) / state.zoom;
          const cy = (me.clientY - rect.top) / state.zoom;
          if (tool === "line" || tool === "arrow") {
            obj.w = Math.round(cx - obj.x);
            obj.h = Math.round(cy - obj.y);
            renderSvgLayer(pg, bw, bh);
          } else {
            obj.w = Math.max(12, Math.round(cx - obj.x));
            if (tool !== "underline" && tool !== "strike") {
              obj.h = Math.max(10, Math.round(cy - obj.y));
            }
            renderObjectLayer(pg);
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          renderPropertiesPanel();
          renderThumbnails();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }
    });
  }

  /* ---------- Image Insertion Helper ---------- */
  function readImageAsPngDataUrl(file, cb) {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name || "")) {
      toast("Upload PNG, JPG, JPEG, or WebP.", "error");
      return;
    }
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxDim = 1000;
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * sc));
      c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/png");
      URL.revokeObjectURL(u);
      cb(dataUrl, c.width, c.height);
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      toast("Could not load image.", "error");
    };
    img.src = u;
  }

  function insertImageToCurrentPage(dataUrl, natW, natH, type = "image") {
    const pg = currentPage();
    if (!pg) return;
    pushUndo();
    const targetW = Math.min(200, pg.width * 0.4);
    const targetH = Math.max(30, Math.round(targetW * (natH / Math.max(1, natW))));
    const obj = {
      id: uid("obj"),
      type,
      x: Math.round((pg.width - targetW) / 2),
      y: Math.round((pg.height - targetH) / 2),
      w: Math.round(targetW),
      h: targetH,
      rotation: 0,
      opacity: 1,
      lockAspect: true,
      crop: { t: 0, r: 0, b: 0, l: 0 },
      dataUrl,
    };
    pg.objects.push(obj);
    state.selectedObjId = obj.id;
    setActiveTool("select");
    renderObjectLayer(pg);
    renderPropertiesPanel();
    renderThumbnails();
    toast(type === "signature" ? "Visual signature placed on page." : "Image inserted on page.");
  }

  /* ---------- Page Management Operations ---------- */
  function rotateCurrentPage(delta) {
    const pg = currentPage();
    if (!pg) return;
    pushUndo();
    pg.rotation = (pg.rotation + delta + 360) % 360;
    renderThumbnails();
    renderCurrentPage();
    renderPropertiesPanel();
  }

  function resizeCurrentPage(w, h) {
    const pg = currentPage();
    if (!pg) return;
    pushUndo();
    pg.width = w;
    pg.height = h;
    renderThumbnails();
    renderCurrentPage();
    renderPropertiesPanel();
    toast("Updated page dimensions.");
  }

  function addBlankPage() {
    pushUndo();
    const ref = currentPage();
    const w = ref ? ref.width : 595.28;
    const h = ref ? ref.height : 841.89;
    state.pages.splice(state.currentPageIdx + 1, 0, {
      id: uid("pg"),
      sourceDocId: null,
      sourcePageIndex: -1,
      width: w,
      height: h,
      rotation: 0,
      crop: { t: 0, r: 0, b: 0, l: 0 },
      blank: true,
      objects: [],
      textSpans: [],
    });
    state.currentPageIdx += 1;
    renderThumbnails();
    renderCurrentPage();
    toast("Added blank page.");
  }

  function duplicateCurrentPage() {
    const pg = currentPage();
    if (!pg) return;
    pushUndo();
    const copy = JSON.parse(JSON.stringify({ ...pg, textSpans: [] }));
    copy.id = uid("pg");
    copy.objects.forEach((o) => (o.id = uid("obj")));
    state.pages.splice(state.currentPageIdx + 1, 0, copy);
    state.currentPageIdx += 1;
    renderThumbnails();
    renderCurrentPage();
    toast("Duplicated current page.");
  }

  function deleteCurrentOrSelectedPages() {
    const targets = state.selectedPageIds.size
      ? state.pages.filter((p) => state.selectedPageIds.has(p.id))
      : [currentPage()].filter(Boolean);
    if (!targets.length) return;
    if (targets.length >= state.pages.length) {
      toast("A PDF must keep at least 1 page.", "error");
      return;
    }
    pushUndo();
    const delIds = new Set(targets.map((p) => p.id));
    state.pages = state.pages.filter((p) => !delIds.has(p.id));
    state.selectedPageIds.clear();
    state.currentPageIdx = Math.min(state.currentPageIdx, state.pages.length - 1);
    state.selectedObjId = null;
    renderThumbnails();
    renderCurrentPage();
    renderPropertiesPanel();
    toast(`Deleted ${targets.length} page(s).`);
  }

  /* ---------- Search Across Document ---------- */
  async function runDocumentSearch() {
    const q = $("peSearchInput").value.trim().toLowerCase();
    state.search = { query: q, matches: [], currentHit: -1 };
    if (!q) {
      $("peSearchStatus").textContent = "";
      renderCurrentPage();
      return;
    }

    let totalSpans = 0;
    for (let i = 0; i < state.pages.length; i++) {
      const pg = state.pages[i];
      if (!pg.blank && pg.sourceDocId && pg.textSpans.length === 0) {
        await extractPageTextSpans(pg);
      }
      totalSpans += pg.textSpans.length;
      pg.textSpans.forEach((sp, sIdx) => {
        if (sp.text.toLowerCase().includes(q)) {
          state.search.matches.push({ pageIdx: i, spanIdx: sIdx });
        }
      });
    }

    if (totalSpans === 0) {
      $("peSearchStatus").textContent = "No extractable text found (scanned PDF — run OCR first).";
      return;
    }

    if (!state.search.matches.length) {
      $("peSearchStatus").textContent = "0 matches found.";
      renderCurrentPage();
      return;
    }

    state.search.currentHit = 0;
    jumpToSearchHit(0);
  }

  function jumpToSearchHit(idx) {
    const m = state.search.matches[idx];
    if (!m) return;
    state.search.currentHit = idx;
    const pagesSet = Array.from(new Set(state.search.matches.map((x) => x.pageIdx + 1)));
    $("peSearchStatus").textContent = `Match ${idx + 1} of ${state.search.matches.length} (Pages: ${pagesSet.join(", ")})`;
    if (state.currentPageIdx !== m.pageIdx) {
      state.currentPageIdx = m.pageIdx;
      renderThumbnails();
    }
    renderCurrentPage();
  }

  /* ---------- Optional Browser OCR (Lazy-Loaded Tesseract.js) ---------- */
  async function runOcrOnCurrentPage() {
    const pg = currentPage();
    if (!pg) return;
    const btn = $("peOcrBtn");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Loading OCR...";

    try {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("Could not load Tesseract.js OCR engine."));
          document.head.appendChild(s);
        });
      }

      btn.textContent = "Scanning Page...";
      const pdfCanvas = $("pePdfCanvas");
      const res = await window.Tesseract.recognize(pdfCanvas, "eng");
      const text = (res?.data?.text || "").trim();
      if (!text) {
        toast("OCR finished but detected no readable text on this page.", "error");
      } else {
        $("peOcrOutput").value = text;
        $("peOcrDialog").showModal();
      }
    } catch (err) {
      toast(err?.message || "OCR failed.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  /* ---------- PDF Export Engine (Preserves Original Vector/Text via pdf-lib) ---------- */
  function hexToRgbPdf(hex, rgbFn) {
    const c = String(hex || "#0b132b").replace("#", "");
    if (c.length !== 6) return rgbFn(0.05, 0.08, 0.17);
    return rgbFn(parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255);
  }

  function sanitizePdfStr(str) {
    return String(str ?? "").replace(/[^\x20-\x7E\n]/g, " ");
  }

  function dataUrlToUint8(dataUrl) {
    const b64 = dataUrl.split(",")[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function buildEditedPdfBytes(pageList = null, options = { flattenForms: false }) {
    const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
    const outDoc = await PDFDocument.create();
    const targetPages = pageList || state.pages;

    // Cache loaded source PDFDocument instances
    const loadedSources = {};
    const fontCache = {};
    let usedFallbackFont = false;

    const getFont = async (familyLabel, bold, italic) => {
      const fDef = FONT_FAMILIES.find((f) => f.label === familyLabel) || FONT_FAMILIES[0];
      if (!["Helvetica", "Times New Roman", "Courier New"].includes(fDef.label)) {
        usedFallbackFont = true;
      }
      const key = `${fDef.pdfBase}_${bold ? "B" : ""}${italic ? "I" : ""}`;
      if (fontCache[key]) return fontCache[key];

      let stdName = StandardFonts.Helvetica;
      if (fDef.pdfBase === "TimesRoman") {
        stdName = bold && italic ? StandardFonts.TimesRomanBoldItalic : bold ? StandardFonts.TimesRomanBold : italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman;
      } else if (fDef.pdfBase === "Courier") {
        stdName = bold && italic ? StandardFonts.CourierBoldOblique : bold ? StandardFonts.CourierBold : italic ? StandardFonts.CourierOblique : StandardFonts.Courier;
      } else {
        stdName = bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica;
      }
      fontCache[key] = await outDoc.embedFont(stdName);
      return fontCache[key];
    };

    const form = outDoc.getForm();
    const totalOutPages = targetPages.length;

    for (let idx = 0; idx < targetPages.length; idx++) {
      const pg = targetPages[idx];
      if ($("peExportStatus")) {
        $("peExportStatus").textContent = `Exporting page ${idx + 1} of ${totalOutPages}...`;
      }

      let pdfPage;
      if (pg.blank || !pg.sourceDocId || !state.sourceDocs[pg.sourceDocId]) {
        pdfPage = outDoc.addPage([pg.width, pg.height]);
      } else {
        if (!loadedSources[pg.sourceDocId]) {
          loadedSources[pg.sourceDocId] = await PDFDocument.load(state.sourceDocs[pg.sourceDocId].bytes, { ignoreEncryption: true });
        }
        const [copied] = await outDoc.copyPages(loadedSources[pg.sourceDocId], [pg.sourcePageIndex]);
        outDoc.addPage(copied);
        pdfPage = copied;
      }

      if (pg.rotation) {
        const curRot = pdfPage.getRotation().angle || 0;
        pdfPage.setRotation(degrees((curRot + pg.rotation) % 360));
      }

      const { width: pw, height: ph } = pdfPage.getSize();
      if (pg.crop && (pg.crop.t || pg.crop.r || pg.crop.b || pg.crop.l)) {
        const cl = (pg.crop.l / 100) * pw;
        const cb = (pg.crop.b / 100) * ph;
        const cw = Math.max(50, pw - cl - (pg.crop.r / 100) * pw);
        const ch = Math.max(50, ph - cb - (pg.crop.t / 100) * ph);
        pdfPage.setCropBox(cl, cb, cw, ch);
      }

      // Apply Watermark
      const wm = state.watermark;
      if (wm.enabled && (wm.scope === "all" || state.selectedPageIds.has(pg.id))) {
        if (wm.type === "image" && wm.imageDataUrl) {
          try {
            const img = await outDoc.embedPng(dataUrlToUint8(wm.imageDataUrl));
            const iw = pw * (wm.imageScale || 0.4);
            const ih = iw * (img.height / Math.max(1, img.width));
            pdfPage.drawImage(img, {
              x: (pw - iw) / 2,
              y: (ph - ih) / 2,
              width: iw,
              height: ih,
              opacity: wm.opacity,
              rotate: degrees(-(wm.rotation || 0)),
            });
          } catch (_) {}
        } else {
          const wf = await getFont(wm.font || "Helvetica", true, false);
          const wt = sanitizePdfStr(wm.text || "CONFIDENTIAL");
          const wSize = Number(wm.size) || 48;
          const tw = wf.widthOfTextAtSize(wt, wSize);
          pdfPage.drawText(wt, {
            x: Math.max(20, (pw - tw) / 2),
            y: wm.position === "top" ? ph - 90 : wm.position === "bottom" ? 60 : ph / 2,
            size: wSize,
            font: wf,
            color: hexToRgbPdf(wm.color, rgb),
            opacity: wm.opacity,
            rotate: degrees(-(wm.rotation || 0)),
          });
        }
      }

      // Apply Header, Footer & Page Numbers
      const hf = state.headerFooter;
      if (hf.enabled || hf.pageNumbers) {
        const hFont = await getFont("Helvetica", false, false);
        const hSize = Number(hf.fontSize) || 10;
        const hCol = hexToRgbPdf(hf.color, rgb);
        const m = Number(hf.margin) || 24;
        const pNum = idx + 1;
        const pnStr =
          hf.pageNumbers && pNum >= (hf.startPage || 1)
            ? (hf.pageNumFormat || "Page {n} of {total}").replace("{n}", String(pNum)).replace("{total}", String(totalOutPages))
            : "";

        const drawSlot = (txt, pos) => {
          const clean = sanitizePdfStr(txt).trim();
          if (!clean) return;
          const tw = hFont.widthOfTextAtSize(clean, hSize);
          const x = pos.endsWith("left") ? m : pos.endsWith("right") ? pw - m - tw : (pw - tw) / 2;
          const y = pos.startsWith("top") ? ph - m : m * 0.65;
          pdfPage.drawText(clean, { x, y, size: hSize, font: hFont, color: hCol });
        };

        drawSlot(hf.headerLeft || (hf.pageNumPos === "top-left" ? pnStr : ""), "top-left");
        drawSlot(hf.headerCenter || (hf.pageNumPos === "top-center" ? pnStr : ""), "top-center");
        drawSlot(hf.headerRight || (hf.pageNumPos === "top-right" ? pnStr : ""), "top-right");
        drawSlot(hf.footerLeft || (hf.pageNumPos === "bottom-left" ? pnStr : ""), "bottom-left");
        drawSlot(hf.footerCenter || (hf.pageNumPos === "bottom-center" ? pnStr : ""), "bottom-center");
        drawSlot(hf.footerRight || (hf.pageNumPos === "bottom-right" ? pnStr : ""), "bottom-right");
      }

      // Render Page Editing Objects
      for (const obj of pg.objects) {
        const pdfY = ph - obj.y - (obj.h || 0);

        if (obj.type === "whiteout" || obj.type === "highlight") {
          pdfPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.w,
            height: obj.h,
            color: hexToRgbPdf(obj.fillColor || (obj.type === "whiteout" ? "#ffffff" : "#fed600"), rgb),
            opacity: obj.opacity ?? 1,
          });
        } else if (obj.type === "underline" || obj.type === "strike") {
          pdfPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.w,
            height: Math.max(1.5, obj.h || 2),
            color: hexToRgbPdf(obj.strokeColor || "#056cb8", rgb),
            opacity: obj.opacity ?? 1,
          });
        } else if (obj.type === "rect" || obj.type === "polygon") {
          pdfPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.w,
            height: obj.h,
            color: obj.fillColor && obj.fillColor !== "transparent" ? hexToRgbPdf(obj.fillColor, rgb) : undefined,
            borderColor: hexToRgbPdf(obj.strokeColor || "#056cb8", rgb),
            borderWidth: obj.strokeWidth || 2,
            opacity: obj.opacity ?? 1,
          });
        } else if (obj.type === "circle") {
          pdfPage.drawEllipse({
            x: obj.x + obj.w / 2,
            y: pdfY + obj.h / 2,
            xScale: obj.w / 2,
            yScale: obj.h / 2,
            color: obj.fillColor && obj.fillColor !== "transparent" ? hexToRgbPdf(obj.fillColor, rgb) : undefined,
            borderColor: hexToRgbPdf(obj.strokeColor || "#056cb8", rgb),
            borderWidth: obj.strokeWidth || 2,
            opacity: obj.opacity ?? 1,
          });
        } else if (obj.type === "line" || obj.type === "arrow") {
          pdfPage.drawLine({
            start: { x: obj.x, y: ph - obj.y },
            end: { x: obj.x + obj.w, y: ph - (obj.y + obj.h) },
            thickness: obj.strokeWidth || 2,
            color: hexToRgbPdf(obj.strokeColor || "#056cb8", rgb),
            opacity: obj.opacity ?? 1,
          });
        } else if (obj.type === "draw" && Array.isArray(obj.points) && obj.points.length > 1) {
          const col = hexToRgbPdf(obj.strokeColor || "#e42527", rgb);
          const sw = obj.strokeWidth || 2.5;
          for (let k = 1; k < obj.points.length; k++) {
            pdfPage.drawLine({
              start: { x: obj.points[k - 1].x, y: ph - obj.points[k - 1].y },
              end: { x: obj.points[k].x, y: ph - obj.points[k].y },
              thickness: sw,
              color: col,
              opacity: obj.opacity ?? 1,
            });
          }
        } else if (obj.type === "image" || obj.type === "signature") {
          try {
            const img = await outDoc.embedPng(dataUrlToUint8(obj.dataUrl));
            pdfPage.drawImage(img, {
              x: obj.x,
              y: pdfY,
              width: obj.w,
              height: obj.h,
              opacity: obj.opacity ?? 1,
              rotate: degrees(-(obj.rotation || 0)),
            });
          } catch (_) {}
        } else if (obj.type === "text" || obj.type === "comment" || obj.type === "sticky") {
          const bg = obj.type === "sticky" ? "#fef08a" : obj.bgColor;
          if (bg && bg !== "transparent") {
            pdfPage.drawRectangle({
              x: obj.x,
              y: pdfY,
              width: obj.w,
              height: obj.h,
              color: hexToRgbPdf(bg, rgb),
              borderColor: obj.borderWidth > 0 ? hexToRgbPdf(obj.borderColor || "#056cb8", rgb) : undefined,
              borderWidth: obj.borderWidth || 0,
              opacity: obj.opacity ?? 1,
            });
          }
          const tf = await getFont(obj.fontFamily || "Helvetica", Boolean(obj.bold), Boolean(obj.italic));
          const fSize = Number(obj.fontSize) || (obj.type === "sticky" ? 11 : 14);
          const lines = sanitizePdfStr(obj.text || "").split("\n");
          const pad = Number(obj.padding) || 4;
          lines.forEach((ln, li) => {
            const ly = ph - obj.y - pad - fSize - li * (fSize * (obj.lineHeight || 1.35));
            pdfPage.drawText(ln, {
              x: obj.x + pad,
              y: ly,
              size: fSize,
              font: tf,
              color: hexToRgbPdf(obj.color || "#0b132b", rgb),
              opacity: obj.opacity ?? 1,
            });
          });
        } else if (obj.type.startsWith("form_")) {
          // Create interactive AcroForm fields via pdf-lib!
          try {
            const fname = `${obj.fieldName || obj.type}_${idx}_${uidSeq++}`;
            if (obj.type === "form_check") {
              const cb = form.createCheckBox(fname);
              cb.addToPage(pdfPage, { x: obj.x, y: pdfY, width: obj.w, height: obj.h });
            } else if (obj.type === "form_select") {
              const dd = form.createDropdown(fname);
              dd.addOptions(["Option 1", "Option 2", "Option 3"]);
              dd.addToPage(pdfPage, { x: obj.x, y: pdfY, width: obj.w, height: obj.h });
            } else if (obj.type === "form_radio") {
              const rg = form.createRadioGroup(fname);
              rg.addOptionToPage("Choice 1", pdfPage, { x: obj.x, y: pdfY, width: obj.w, height: obj.h });
            } else {
              const tf = form.createTextField(fname);
              tf.setText(obj.type === "form_date" ? new Date().toISOString().slice(0, 10) : "");
              tf.addToPage(pdfPage, { x: obj.x, y: pdfY, width: obj.w, height: obj.h });
            }
          } catch (_) {}
        }
      }

      if (idx % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }

    // Apply Filled Existing Form Values where present
    if (state.existingFormFields.length) {
      try {
        const outForm = outDoc.getForm();
        state.existingFormFields.forEach((ff) => {
          try {
            if (ff.type === "PDFTextField") outForm.getTextField(ff.name).setText(String(ff.value || ""));
            else if (ff.type === "PDFCheckBox") {
              if (ff.value) outForm.getCheckBox(ff.name).check();
              else outForm.getCheckBox(ff.name).uncheck();
            } else if (ff.type === "PDFDropdown" && ff.value) {
              outForm.getDropdown(ff.name).select(ff.value);
            } else if (ff.type === "PDFRadioGroup" && ff.value) {
              outForm.getRadioGroup(ff.name).select(ff.value);
            }
          } catch (_) {}
        });
        if (options.flattenForms) outForm.flatten();
      } catch (_) {}
    } else if (options.flattenForms) {
      try {
        form.flatten();
      } catch (_) {}
    }

    // Apply Document Metadata
    if (state.metadata.title) outDoc.setTitle(state.metadata.title);
    if (state.metadata.author) outDoc.setAuthor(state.metadata.author);
    if (state.metadata.subject) outDoc.setSubject(state.metadata.subject);
    if (state.metadata.keywords) outDoc.setKeywords(state.metadata.keywords.split(",").map((s) => s.trim()).filter(Boolean));
    if (state.metadata.creator) outDoc.setCreator(state.metadata.creator);
    if (state.metadata.producer) outDoc.setProducer(state.metadata.producer);

    const bytes = await outDoc.save({ useObjectStreams: true });
    return { bytes, usedFallbackFont };
  }

  async function exportEditedPdf(flattenForms = false, customFileName = null) {
    if (state.isExporting || !state.pages.length) return;
    state.isExporting = true;
    $("peExportProgress").hidden = false;
    $("peExportStatus").textContent = "Preparing PDF export...";

    try {
      const { bytes, usedFallbackFont } = await buildEditedPdfBytes(null, { flattenForms });
      const url = trackUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      const base = (state.fileName || "document.pdf").replace(/\.pdf$/i, "");
      const outName = customFileName || `${base}${flattenForms ? "-flattened" : "-edited"}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast(
        usedFallbackFont
          ? `Downloaded ${outName} (standard PDF fallback font applied for web fonts).`
          : `Downloaded ${outName}`
      );
    } catch (err) {
      toast(err?.message || "PDF export failed.", "error");
    } finally {
      state.isExporting = false;
      $("peExportProgress").hidden = true;
    }
  }

  async function extractSelectedPagesPdf() {
    const selected = state.pages.filter((p) => state.selectedPageIds.has(p.id));
    if (!selected.length) return;
    $("peExportProgress").hidden = false;
    try {
      const { bytes } = await buildEditedPdfBytes(selected, { flattenForms: false });
      const url = trackUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted-${selected.length}-pages.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`Extracted ${selected.length} page(s) to PDF.`);
    } finally {
      $("peExportProgress").hidden = true;
    }
  }

  async function splitAllPagesZip() {
    if (!window.JSZip || !state.pages.length) return;
    $("peExportProgress").hidden = false;
    try {
      const zip = new window.JSZip();
      for (let i = 0; i < state.pages.length; i++) {
        $("peExportStatus").textContent = `Splitting page ${i + 1} of ${state.pages.length}...`;
        const { bytes } = await buildEditedPdfBytes([state.pages[i]], { flattenForms: false });
        zip.file(`page-${i + 1}.pdf`, bytes);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = trackUrl(URL.createObjectURL(blob));
      const a = document.createElement("a");
      a.href = url;
      a.download = "opensign-split-pages.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Downloaded split pages ZIP.");
    } finally {
      $("peExportProgress").hidden = true;
    }
  }

  /* ---------- Tool & Bottom Bar State Helpers ---------- */
  function setActiveTool(toolName) {
    state.activeTool = toolName;
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === toolName);
    });
    $("peCenterPane")?.classList.toggle("is-pan", toolName === "pan");
    const pg = currentPage();
    if (pg) renderTextLayer(pg);
  }

  function updateBottomBar() {
    $("pePageIndicator").textContent = `Page ${state.currentPageIdx + 1} of ${state.pages.length}`;
    $("peZoomLbl").textContent = `${Math.round(state.zoom * 100)}%`;
    $("pePrevPageBtn").disabled = state.currentPageIdx <= 0;
    $("peNextPageBtn").disabled = state.currentPageIdx >= state.pages.length - 1;
  }

  /* ---------- Signature Modal Wiring ---------- */
  function wireSignatureModal() {
    const canvas = $("peSigCanvas");
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let hasInk = false;

    const clearSig = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false;
    };

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      hasInk = true;
      const r = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo((e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height));
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const r = canvas.getBoundingClientRect();
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0b132b";
      ctx.lineTo((e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height));
      ctx.stroke();
    });
    window.addEventListener("pointerup", () => { drawing = false; });

    $("peSigClearBtn").addEventListener("click", clearSig);

    $("peSigInsertDrawBtn").addEventListener("click", () => {
      if (!hasInk) {
        toast("Draw a signature first.", "error");
        return;
      }
      const url = canvas.toDataURL("image/png");
      state.sessionSignatures.push({ id: uid("sig"), label: `Drawn #${state.sessionSignatures.length + 1}`, dataUrl: url });
      renderSavedSignatures();
      insertImageToCurrentPage(url, canvas.width, canvas.height, "signature");
      $("peSigDialog").close();
    });

    $("peSigInsertTypeBtn").addEventListener("click", () => {
      const txt = $("peSigTypeInput").value.trim();
      if (!txt) {
        toast("Type your name first.", "error");
        return;
      }
      const c = document.createElement("canvas");
      c.width = 420;
      c.height = 110;
      const c2 = c.getContext("2d");
      c2.font = "italic 46px 'Dancing Script', 'Caveat', Georgia, serif";
      c2.fillStyle = "#0b132b";
      c2.textBaseline = "middle";
      c2.fillText(txt, 14, 58);
      const url = c.toDataURL("image/png");
      state.sessionSignatures.push({ id: uid("sig"), label: txt, dataUrl: url });
      renderSavedSignatures();
      insertImageToCurrentPage(url, c.width, c.height, "signature");
      $("peSigDialog").close();
    });

    $("peSigUploadInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      readImageAsPngDataUrl(f, (url, w, h) => {
        state.sessionSignatures.push({ id: uid("sig"), label: f.name, dataUrl: url });
        renderSavedSignatures();
        insertImageToCurrentPage(url, w, h, "signature");
        $("peSigDialog").close();
      });
    });

    $("peSigCloseTop").addEventListener("click", () => $("peSigDialog").close());
  }

  function renderSavedSignatures() {
    const tray = $("peSavedSigsTray");
    if (!tray) return;
    tray.innerHTML = "";
    state.sessionSignatures.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pe-tool-btn";
      b.textContent = `Use: ${s.label}`;
      b.addEventListener("click", () => {
        insertImageToCurrentPage(s.dataUrl, 320, 100, "signature");
        $("peSigDialog").close();
      });
      tray.appendChild(b);
    });
  }

  /* ---------- Init & Event Wiring ---------- */
  function init() {
    // Landing Dropzone & Upload
    const fileInput = $("peFileInput");
    const dropzone = $("peDropzone");
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) loadPdfFile(f, "open");
    });
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("is-over"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-over");
      const f = e.dataTransfer?.files?.[0];
      if (f) loadPdfFile(f, "open");
    });
    $("peCreateBlankBtn").addEventListener("click", createBlankPdfDocument);

    // Ribbon Tab Switching
    document.querySelectorAll(".pe-tab-btn").forEach((tab) => {
      tab.addEventListener("click", () => {
        const key = tab.dataset.tab;
        document.querySelectorAll(".pe-tab-btn").forEach((t) => t.classList.toggle("active", t === tab));
        document.querySelectorAll(".pe-tool-group").forEach((g) => g.classList.toggle("active", g.dataset.group === key));
      });
    });

    // Tool Buttons
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
    });

    // Image & Stamp Upload Buttons
    $("peAddImageInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) readImageAsPngDataUrl(f, (url, w, h) => insertImageToCurrentPage(url, w, h, "image"));
    });

    // Quick Date, Name & Initials Inserts
    $("peInsertDateBtn").addEventListener("click", () => {
      const pg = currentPage();
      if (!pg) return;
      pushUndo();
      const obj = createDefaultTextObj(80, 120, new Date().toLocaleDateString("en-GB"));
      obj.w = 130;
      pg.objects.push(obj);
      state.selectedObjId = obj.id;
      renderObjectLayer(pg);
      renderPropertiesPanel();
    });
    $("peInsertNameBtn").addEventListener("click", () => {
      const pg = currentPage();
      if (!pg) return;
      pushUndo();
      const obj = createDefaultTextObj(80, 160, "Full Name");
      pg.objects.push(obj);
      state.selectedObjId = obj.id;
      renderObjectLayer(pg);
      renderPropertiesPanel();
    });
    $("peInsertInitialsBtn").addEventListener("click", () => {
      const pg = currentPage();
      if (!pg) return;
      pushUndo();
      const obj = createDefaultTextObj(80, 200, "A.B.");
      obj.w = 72;
      obj.bold = true;
      pg.objects.push(obj);
      state.selectedObjId = obj.id;
      renderObjectLayer(pg);
      renderPropertiesPanel();
    });

    // Signature Modal Trigger
    $("peOpenSigBtn").addEventListener("click", () => $("peSigDialog").showModal());
    wireSignatureModal();

    // OCR Button & Modal
    $("peOcrBtn").addEventListener("click", runOcrOnCurrentPage);
    $("peOcrCloseTop").addEventListener("click", () => $("peOcrDialog").close());
    $("peOcrCopyBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("peOcrOutput").value);
        toast("OCR text copied.");
      } catch (_) {}
    });

    // Page Management Controls
    $("peAddBlankBtn").addEventListener("click", addBlankPage);
    $("peDupPageBtn").addEventListener("click", duplicateCurrentPage);
    $("peDelPageBtn").addEventListener("click", deleteCurrentOrSelectedPages);
    $("peRotCwBtn").addEventListener("click", () => rotateCurrentPage(90));
    $("peRotCcwBtn").addEventListener("click", () => rotateCurrentPage(-90));
    $("peExtractPagesBtn").addEventListener("click", extractSelectedPagesPdf);
    $("peSplitZipBtn").addEventListener("click", splitAllPagesZip);
    $("peMergePdfInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) loadPdfFile(f, "merge");
    });
    $("peInsertPdfInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) loadPdfFile(f, "insert");
    });
    $("peReplacePdfInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) loadPdfFile(f, "replace");
    });
    $("peCropPageBtn").addEventListener("click", () => {
      const pg = currentPage();
      if (!pg) return;
      $("peCropT").value = pg.crop.t;
      $("peCropR").value = pg.crop.r;
      $("peCropB").value = pg.crop.b;
      $("peCropL").value = pg.crop.l;
      $("peCropDialog").showModal();
    });
    $("peCropApplyBtn").addEventListener("click", () => {
      const pg = currentPage();
      if (!pg) return;
      pushUndo();
      pg.crop = {
        t: Number($("peCropT").value) || 0,
        r: Number($("peCropR").value) || 0,
        b: Number($("peCropB").value) || 0,
        l: Number($("peCropL").value) || 0,
      };
      $("peCropDialog").close();
      toast("Crop margins saved (applied on PDF export).");
    });
    $("peCropCloseTop").addEventListener("click", () => $("peCropDialog").close());

    $("peThumbZoom").addEventListener("input", (e) => {
      state.thumbZoom = Number(e.target.value) || 120;
      document.querySelectorAll(".pe-thumb-canvas").forEach((c) => (c.style.width = `${state.thumbZoom}px`));
    });

    // Watermark Dialog
    $("peWatermarkBtn").addEventListener("click", () => {
      $("peWmEnabled").checked = state.watermark.enabled;
      $("peWmText").value = state.watermark.text;
      $("peWmSize").value = state.watermark.size;
      $("peWmColor").value = state.watermark.color;
      $("peWmOpacity").value = state.watermark.opacity;
      $("peWmRot").value = state.watermark.rotation;
      $("peWmPos").value = state.watermark.position;
      $("peWmScope").value = state.watermark.scope;
      $("peWmDialog").showModal();
    });
    document.querySelectorAll("[data-wm-preset]").forEach((b) => {
      b.addEventListener("click", () => { $("peWmText").value = b.dataset.wmPreset; });
    });
    $("peWmImgInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) readImageAsPngDataUrl(f, (url) => { state.watermark.imageDataUrl = url; state.watermark.type = "image"; toast("Watermark image loaded."); });
    });
    $("peWmApplyBtn").addEventListener("click", () => {
      pushUndo();
      state.watermark.enabled = $("peWmEnabled").checked;
      state.watermark.text = $("peWmText").value;
      state.watermark.size = Number($("peWmSize").value) || 48;
      state.watermark.color = $("peWmColor").value;
      state.watermark.opacity = Number($("peWmOpacity").value) || 0.22;
      state.watermark.rotation = Number($("peWmRot").value) || -35;
      state.watermark.position = $("peWmPos").value;
      state.watermark.scope = $("peWmScope").value;
      if ($("peWmText").value.trim()) state.watermark.type = "text";
      $("peWmDialog").close();
      renderCurrentPage();
      toast("Watermark settings applied.");
    });
    $("peWmCloseTop").addEventListener("click", () => $("peWmDialog").close());

    // Header / Footer / Page Numbers Dialog
    $("peHfBtn").addEventListener("click", () => {
      const hf = state.headerFooter;
      $("peHfEnabled").checked = hf.enabled;
      $("peHfHL").value = hf.headerLeft;
      $("peHfHC").value = hf.headerCenter;
      $("peHfHR").value = hf.headerRight;
      $("peHfFL").value = hf.footerLeft;
      $("peHfFC").value = hf.footerCenter;
      $("peHfFR").value = hf.footerRight;
      $("peHfPn").checked = hf.pageNumbers;
      $("peHfPnPos").value = hf.pageNumPos;
      $("peHfPnFmt").value = hf.pageNumFormat;
      $("peHfStart").value = hf.startPage;
      $("peHfSize").value = hf.fontSize;
      $("peHfColor").value = hf.color;
      $("peHfDialog").showModal();
    });
    $("peHfApplyBtn").addEventListener("click", () => {
      pushUndo();
      Object.assign(state.headerFooter, {
        enabled: $("peHfEnabled").checked,
        headerLeft: $("peHfHL").value,
        headerCenter: $("peHfHC").value,
        headerRight: $("peHfHR").value,
        footerLeft: $("peHfFL").value,
        footerCenter: $("peHfFC").value,
        footerRight: $("peHfFR").value,
        pageNumbers: $("peHfPn").checked,
        pageNumPos: $("peHfPnPos").value,
        pageNumFormat: $("peHfPnFmt").value,
        startPage: Math.max(1, Number($("peHfStart").value) || 1),
        fontSize: Number($("peHfSize").value) || 10,
        color: $("peHfColor").value,
      });
      $("peHfDialog").close();
      renderCurrentPage();
      toast("Header, footer & page numbers updated.");
    });
    $("peHfCloseTop").addEventListener("click", () => $("peHfDialog").close());

    // Metadata & Security Dialog
    $("peMetaBtn").addEventListener("click", () => {
      $("peMetaTitle").value = state.metadata.title;
      $("peMetaAuthor").value = state.metadata.author;
      $("peMetaSubject").value = state.metadata.subject;
      $("peMetaKeywords").value = state.metadata.keywords;
      $("peMetaCreator").value = state.metadata.creator;
      $("peMetaProducer").value = state.metadata.producer;
      $("peMetaDialog").showModal();
    });
    $("peMetaApplyBtn").addEventListener("click", () => {
      pushUndo();
      state.metadata = {
        title: $("peMetaTitle").value,
        author: $("peMetaAuthor").value,
        subject: $("peMetaSubject").value,
        keywords: $("peMetaKeywords").value,
        creator: $("peMetaCreator").value,
        producer: $("peMetaProducer").value,
      };
      $("peMetaDialog").close();
      toast("Document metadata updated.");
    });
    $("peMetaCloseTop").addEventListener("click", () => $("peMetaDialog").close());

    // Fill Existing PDF Forms Dialog
    $("peFormsBtn").addEventListener("click", () => {
      const box = $("peFormsList");
      box.innerHTML = "";
      if (!state.existingFormFields.length) {
        box.innerHTML = `<p style="margin:0;font-size:13px;color:var(--muted)">No existing AcroForm fields detected in this PDF. Use the Insert tab to add new interactive form fields.</p>`;
      } else {
        state.existingFormFields.forEach((ff, i) => {
          const wrap = document.createElement("div");
          wrap.className = "pe-field";
          if (ff.type === "PDFCheckBox") {
            wrap.innerHTML = `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-ff-idx="${i}" ${ff.value ? "checked" : ""} /> ${esc(ff.name)}</label>`;
          } else if (ff.type === "PDFDropdown" || ff.type === "PDFRadioGroup") {
            const opts = ff.options.map((o) => `<option value="${esc(o)}"${ff.value === o ? " selected" : ""}>${esc(o)}</option>`).join("");
            wrap.innerHTML = `<label>${esc(ff.name)}</label><select class="pe-select" data-ff-idx="${i}"><option value="">— Select —</option>${opts}</select>`;
          } else {
            wrap.innerHTML = `<label>${esc(ff.name)}</label><input type="text" class="pe-input" data-ff-idx="${i}" value="${esc(ff.value)}" />`;
          }
          box.appendChild(wrap);
        });
      }
      $("peFormsDialog").showModal();
    });
    $("peFormsSaveBtn").addEventListener("click", () => {
      $("peFormsList").querySelectorAll("[data-ff-idx]").forEach((el) => {
        const ff = state.existingFormFields[Number(el.dataset.ffIdx)];
        if (!ff) return;
        ff.value = el.type === "checkbox" ? el.checked : el.value;
      });
      $("peFormsDialog").close();
      toast("Form field values saved for PDF export.");
    });
    $("peFormsClearBtn").addEventListener("click", () => {
      state.existingFormFields.forEach((ff) => (ff.value = ff.type === "PDFCheckBox" ? false : ""));
      $("peFormsDialog").close();
      toast("Cleared all form field values.");
    });
    $("peFormsCloseTop").addEventListener("click", () => $("peFormsDialog").close());

    // Search Controls
    $("peToggleSearchBtn").addEventListener("click", () => {
      const bar = $("peSearchBar");
      bar.hidden = !bar.hidden;
      if (!bar.hidden) $("peSearchInput").focus();
    });
    $("peSearchGoBtn").addEventListener("click", runDocumentSearch);
    $("peSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runDocumentSearch(); });
    $("peSearchPrevBtn").addEventListener("click", () => {
      if (!state.search.matches.length) return;
      jumpToSearchHit((state.search.currentHit - 1 + state.search.matches.length) % state.search.matches.length);
    });
    $("peSearchNextBtn").addEventListener("click", () => {
      if (!state.search.matches.length) return;
      jumpToSearchHit((state.search.currentHit + 1) % state.search.matches.length);
    });
    $("peSearchClearBtn").addEventListener("click", () => {
      $("peSearchInput").value = "";
      state.search = { query: "", matches: [], currentHit: -1 };
      $("peSearchStatus").textContent = "";
      renderCurrentPage();
    });

    // Zoom & Page Navigation
    $("peZoomInBtn").addEventListener("click", () => { state.zoom = Math.min(2.5, +(state.zoom + 0.15).toFixed(2)); renderCurrentPage(); });
    $("peZoomOutBtn").addEventListener("click", () => { state.zoom = Math.max(0.4, +(state.zoom - 0.15).toFixed(2)); renderCurrentPage(); });
    $("peFitWidthBtn").addEventListener("click", () => {
      const pg = currentPage();
      const paneW = $("peCenterPane").clientWidth - 48;
      if (pg && paneW > 100) {
        state.zoom = Math.max(0.4, Math.min(2.2, +(paneW / pg.width).toFixed(2)));
        renderCurrentPage();
      }
    });
    $("peFitPageBtn").addEventListener("click", () => {
      const pg = currentPage();
      const paneW = $("peCenterPane").clientWidth - 48;
      const paneH = $("peCenterPane").clientHeight - 48;
      if (pg && paneW > 100 && paneH > 100) {
        state.zoom = Math.max(0.4, Math.min(2.0, +Math.min(paneW / pg.width, paneH / pg.height).toFixed(2)));
        renderCurrentPage();
      }
    });
    $("pePrevPageBtn").addEventListener("click", () => {
      if (state.currentPageIdx > 0) {
        state.currentPageIdx--;
        state.selectedObjId = null;
        renderThumbnails();
        renderCurrentPage();
        renderPropertiesPanel();
      }
    });
    $("peNextPageBtn").addEventListener("click", () => {
      if (state.currentPageIdx < state.pages.length - 1) {
        state.currentPageIdx++;
        state.selectedObjId = null;
        renderThumbnails();
        renderCurrentPage();
        renderPropertiesPanel();
      }
    });

    // Undo / Redo / Export / Print / Open Another
    $("peUndoBtn").addEventListener("click", undo);
    $("peRedoBtn").addEventListener("click", redo);
    $("peDownloadBtn").addEventListener("click", () => exportEditedPdf(false));
    $("peDownloadFlatBtn").addEventListener("click", () => exportEditedPdf(true));
    $("pePrintBtn").addEventListener("click", async () => {
      const { bytes } = await buildEditedPdfBytes(null, { flattenForms: true });
      const url = trackUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
      const w = window.open(url, "_blank");
      if (w) w.addEventListener("load", () => w.print());
    });
    $("peOpenNewBtn").addEventListener("click", () => fileInput.click());

    // Mobile Panel Switcher
    document.querySelectorAll("[data-mob-pane]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.mobPane;
        $("peBody").dataset.mobPane = p;
        document.querySelectorAll("[data-mob-pane]").forEach((b) => b.classList.toggle("active", b === btn));
      });
    });

    // Keyboard Shortcuts (Safely bypassed when typing in inputs or contenteditable)
    document.addEventListener("keydown", (e) => {
      if ($("peWorkspaceShell").hidden) return;
      const active = document.activeElement;
      const isEditingText =
        active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportEditedPdf(false);
        return;
      }
      if (isEditingText) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const obj = getSelectedObj();
        if (obj) {
          state.clipboardObj = JSON.parse(JSON.stringify(obj));
          toast("Copied object.");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        const pg = currentPage();
        if (pg && state.clipboardObj) {
          pushUndo();
          const pasted = JSON.parse(JSON.stringify(state.clipboardObj));
          pasted.id = uid("obj");
          pasted.x += 18;
          pasted.y += 18;
          pg.objects.push(pasted);
          state.selectedObjId = pasted.id;
          renderCurrentPage();
          renderPropertiesPanel();
          toast("Pasted object.");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedObject();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedObjId) {
          e.preventDefault();
          deleteSelectedObject();
        }
      }
    });

    wireCanvasInteractions();
  }

  init();
})();
