(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const MAX_FILE_BYTES = 100 * 1024 * 1024; // Configurable 100 MB browser limit
  const LARGE_FILE_WARN_BYTES = 40 * 1024 * 1024;
  const PAGES_PER_BATCH = 36;
  const MAX_CANVAS_SIDE = 4096; // Prevent browser canvas memory exhaustion on huge pages
  const DEFAULT_BASE_NAME = "opensign-page";
  const DEFAULT_ZIP_NAME = "opensign-pdf-to-jpg.zip";

  const QUALITY_MAP = {
    low: { id: "low", label: "Low (60%)", value: 0.6 },
    medium: { id: "medium", label: "Medium (80%)", value: 0.8 },
    high: { id: "high", label: "High (95%)", value: 0.95 },
  };

  // DOM Elements
  const fileInput = $("pjFileInput");
  const dropzone = $("pjDropzone");
  const alertBox = $("pjAlert");
  const alertMsg = $("pjAlertMsg");
  const alertClose = $("pjAlertClose");

  const docHeader = $("pjDocHeader");
  const docNameEl = $("pjDocName");
  const docStatusEl = $("pjDocStatus");
  const docSizeEl = $("pjDocSize");
  const docPagesEl = $("pjDocPages");
  const docDimsEl = $("pjDocDims");
  const changePdfBtn = $("pjChangePdfBtn");

  const optionsSection = $("pjOptionsSection");
  const selModeCards = Array.from(document.querySelectorAll("[data-sel-mode]"));
  const rangeInputWrap = $("pjRangeInputWrap");
  const rangeInput = $("pjRangeInput");
  const qualityCards = Array.from(document.querySelectorAll("[data-quality]"));
  const dpiBtns = Array.from(document.querySelectorAll("[data-dpi]"));
  const customDpiWrap = $("pjCustomDpiWrap");
  const customDpiInput = $("pjCustomDpiInput");

  const sumTotalPages = $("pjSumTotalPages");
  const sumSelectedPages = $("pjSumSelectedPages");
  const sumResolution = $("pjSumResolution");
  const sumQuality = $("pjSumQuality");

  const quickBar = $("pjQuickBar");
  const btnSelectAll = $("pjBtnSelectAll");
  const btnDeselectAll = $("pjBtnDeselectAll");
  const btnConvertAllMode = $("pjBtnConvertAllMode");
  const btnClearSel = $("pjBtnClearSel");

  const gridSection = $("pjGridSection");
  const pageGridEl = $("pjPageGrid");
  const pagerBar = $("pjPagerBar");
  const pagerLabel = $("pjPagerLabel");
  const pagerPrevBtn = $("pjPagerPrev");
  const pagerNextBtn = $("pjPagerNext");

  const rasterNote = $("pjRasterNote");
  const progressPanel = $("pjProgressPanel");
  const progressMsg = $("pjProgressMsg");
  const progressMeta = $("pjProgressMeta");
  const progressFill = $("pjProgressFill");

  const actionBar = $("pjActionBar");
  const resetBtn = $("pjResetBtn");
  const convertBtn = $("pjConvertBtn");
  const convertBtnLabel = $("pjConvertBtnLabel");

  // Converted Gallery & Results
  const resultPanel = $("pjResultPanel");
  const resultSub = $("pjResultSub");
  const resPagesConv = $("pjResPagesConv");
  const resFilesGen = $("pjResFilesGen");
  const resTotalSize = $("pjResTotalSize");
  const resDpiUsed = $("pjResDpiUsed");
  const resQualUsed = $("pjResQualUsed");
  const baseNameInput = $("pjBaseFileName");
  const downloadSelectedZipBtn = $("pjDownloadSelectedZipBtn");
  const downloadAllZipBtn = $("pjDownloadAllZipBtn");
  const convertAnotherBtn = $("pjConvertAnotherBtn");
  const resetResultBtn = $("pjResetResultBtn");
  const galleryGridEl = $("pjGalleryGrid");

  // Preview / Zoom Modal
  const zoomModal = $("pjZoomModal");
  const zoomTitle = $("pjZoomTitle");
  const zoomCloseTop = $("pjZoomCloseTop");
  const zoomPrevBtn = $("pjZoomPrev");
  const zoomNextBtn = $("pjZoomNext");
  const zoomOutBtn = $("pjZoomOut");
  const zoomInBtn = $("pjZoomIn");
  const zoomPctLabel = $("pjZoomPct");
  const zoomToggleSelBtn = $("pjZoomToggleSel");
  const zoomCanvas = $("pjZoomCanvas");
  const zoomImg = $("pjZoomImg");

  if (!fileInput || !dropzone || !convertBtn) return;

  // Strictly volatile in-memory state (never persisted to browser web storage)
  let currentFile = null;
  let pdfJsDoc = null;
  let totalPages = 0;
  let pageSelectionMode = "all"; // 'all' | 'selected' | 'ranges'
  let selectedPages = new Set(); // 1-based page numbers
  let qualityKey = "medium";
  let selectedDpi = 150;
  let useCustomDpi = false;
  let currentBatch = 0;
  let thumbObserver = null;
  let renderedThumbs = new Set();
  let isProcessing = false;
  let convertedImages = []; // { pageNum, filename, width, height, size, blob, url, picked }

  // Modal state
  let modalKind = "pdf"; // 'pdf' | 'jpg'
  let zoomPageNum = 1;
  let zoomScale = 1.25;
  let zoomJpgIndex = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fmtBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    if (b >= 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
    return `${b} B`;
  }

  function sanitizeBaseName(raw) {
    const clean = String(raw || "")
      .trim()
      .replace(/\.jpe?g$/i, "")
      .replace(/[<>:\x22/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+|\.+$/g, "");
    return clean || DEFAULT_BASE_NAME;
  }

  function hasPdfMagicHeader(uint8) {
    if (!uint8 || uint8.length < 5) return false;
    const limit = Math.min(uint8.length - 4, 1024);
    for (let i = 0; i <= limit; i++) {
      if (
        uint8[i] === 0x25 &&
        uint8[i + 1] === 0x50 &&
        uint8[i + 2] === 0x44 &&
        uint8[i + 3] === 0x46 &&
        uint8[i + 4] === 0x2d
      ) {
        return true;
      }
    }
    return false;
  }

  function isEncryptedError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return (
      err?.name === "PasswordException" ||
      err?.name === "EncryptedPDFError" ||
      msg.includes("encrypted") ||
      msg.includes("password")
    );
  }

  /* ---------- Toast & Alerts ---------- */
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

  function showAlert(msg, kind = "error") {
    if (!alertBox || !alertMsg) return;
    if (!msg) {
      alertBox.hidden = true;
      alertMsg.textContent = "";
      return;
    }
    alertBox.dataset.kind = kind;
    alertMsg.textContent = msg;
    alertBox.hidden = false;
  }

  alertClose?.addEventListener("click", () => showAlert(""));

  /* ---------- Resource Cleanup ---------- */
  function revokeConvertedUrls() {
    for (const item of convertedImages) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
    convertedImages = [];
  }

  async function destroyPdfDoc() {
    if (thumbObserver) {
      thumbObserver.disconnect();
      thumbObserver = null;
    }
    renderedThumbs.clear();
    if (pdfJsDoc) {
      try {
        await pdfJsDoc.destroy();
      } catch (_) {}
      pdfJsDoc = null;
    }
  }

  window.addEventListener("beforeunload", () => {
    revokeConvertedUrls();
    destroyPdfDoc();
  });

  /* ---------- Page Range Parser ("1-5, 7, 9-12") ---------- */
  function parsePageRanges(raw, maxPage) {
    const str = String(raw || "").trim();
    if (!str) {
      return { ok: false, error: "Please enter page numbers or ranges (for example: 1-5, 7, 9-12)." };
    }

    const tokens = str.split(",");
    const picked = new Set();

    for (const rawTok of tokens) {
      const tok = rawTok.trim();
      if (!tok) {
        return { ok: false, error: "Invalid formatting: remove extra or trailing commas." };
      }

      if (tok.includes("-")) {
        const parts = tok.split("-");
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
          return { ok: false, error: `Invalid range "${tok}". Use start-end format like 1-5.` };
        }
        if (!/^\d+$/.test(parts[0].trim()) || !/^\d+$/.test(parts[1].trim())) {
          return { ok: false, error: `Invalid page numbers in "${tok}". Use positive whole numbers.` };
        }
        const start = parseInt(parts[0].trim(), 10);
        const end = parseInt(parts[1].trim(), 10);
        if (start < 1 || end < 1) {
          return { ok: false, error: `Page numbers must be 1 or greater (found "${tok}").` };
        }
        if (start > maxPage || end > maxPage) {
          return { ok: false, error: `Range "${tok}" exceeds the document's ${maxPage} pages.` };
        }
        if (start > end) {
          return { ok: false, error: `Reversed range "${tok}" is invalid (start ${start} > end ${end}).` };
        }
        for (let p = start; p <= end; p++) {
          if (picked.has(p)) {
            return { ok: false, error: `Duplicate page ${p} found in "${tok}". Remove overlapping or duplicate entries.` };
          }
          picked.add(p);
        }
      } else {
        if (!/^\d+$/.test(tok)) {
          return { ok: false, error: `Invalid page value "${tok}".` };
        }
        const num = parseInt(tok, 10);
        if (num < 1 || num > maxPage) {
          return { ok: false, error: `Page ${num} is out of range (valid pages: 1–${maxPage}).` };
        }
        if (picked.has(num)) {
          return { ok: false, error: `Duplicate page ${num} detected. List each page once.` };
        }
        picked.add(num);
      }
    }

    return { ok: true, pages: Array.from(picked).sort((a, b) => a - b) };
  }

  function getEffectiveDpi() {
    if (useCustomDpi) {
      const val = Math.floor(Number(customDpiInput?.value) || 150);
      return Math.max(36, Math.min(400, val));
    }
    return selectedDpi;
  }

  function resolveTargetPages() {
    if (!totalPages) return { ok: false, error: "Upload a PDF document first." };
    if (pageSelectionMode === "all") {
      const all = [];
      for (let p = 1; p <= totalPages; p++) all.push(p);
      return { ok: true, pages: all };
    }
    if (pageSelectionMode === "selected") {
      const arr = Array.from(selectedPages).sort((a, b) => a - b);
      if (!arr.length) {
        return { ok: false, error: "Please select at least one page from the thumbnail grid below." };
      }
      return { ok: true, pages: arr };
    }
    if (pageSelectionMode === "ranges") {
      return parsePageRanges(rangeInput?.value || "", totalPages);
    }
    return { ok: false, error: "Invalid page selection mode." };
  }

  /* ---------- Sync Settings Summary & UI ---------- */
  function syncSettingsSummary() {
    if (!totalPages) return;
    const dpi = getEffectiveDpi();
    const qual = QUALITY_MAP[qualityKey] || QUALITY_MAP.medium;
    const targetRes = resolveTargetPages();
    const selCount = targetRes.ok ? targetRes.pages.length : 0;

    if (sumTotalPages) sumTotalPages.textContent = String(totalPages);
    if (sumSelectedPages) {
      sumSelectedPages.textContent =
        pageSelectionMode === "all"
          ? `All (${totalPages})`
          : `${selCount} of ${totalPages}`;
    }
    if (sumResolution) sumResolution.textContent = `${dpi} DPI`;
    if (sumQuality) sumQuality.textContent = qual.label;

    convertBtn.disabled = isProcessing || !targetRes.ok;
    if (!isProcessing) {
      convertBtnLabel.textContent =
        targetRes.ok && targetRes.pages.length > 0
          ? `Convert ${targetRes.pages.length} ${targetRes.pages.length === 1 ? "Page" : "Pages"} to JPG`
          : "Convert to JPG";
    }
  }

  function syncGridSelection() {
    pageGridEl.querySelectorAll(".pj-page-card").forEach((card) => {
      const p = Number(card.dataset.page);
      const on = pageSelectionMode === "all" || selectedPages.has(p);
      card.classList.toggle("is-selected", on);
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = on;
    });
    syncSettingsSummary();
  }

  function setSelectionMode(mode) {
    pageSelectionMode = mode;
    selModeCards.forEach((c) => {
      c.setAttribute("aria-checked", String(c.dataset.selMode === mode));
    });
    if (rangeInputWrap) rangeInputWrap.hidden = mode !== "ranges";
    showAlert("");
    syncGridSelection();
  }

  /* ---------- Upload & Validate Single PDF ---------- */
  async function handleUploadedFile(file) {
    if (!file || isProcessing) return;

    const name = file.name || "document.pdf";
    const hasPdfExt = /\.pdf$/i.test(name);
    const mimeOk = !file.type || file.type === "application/pdf" || file.type === "application/x-pdf";

    showAlert("");
    if (!hasPdfExt || !mimeOk) {
      showAlert(`"${name}" is not a valid PDF file. Please upload a .pdf document.`, "error");
      return;
    }

    if (file.size === 0) {
      showAlert(`"${name}" is empty (0 bytes) and cannot be converted.`, "error");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      showAlert(
        `"${name}" (${fmtBytes(file.size)}) exceeds the ${fmtBytes(MAX_FILE_BYTES)} browser processing limit.`,
        "error"
      );
      return;
    }

    isProcessing = true;
    revokeConvertedUrls();
    await destroyPdfDoc();
    if (resultPanel) resultPanel.hidden = true;
    setProgress("Reading your PDF...", "Validating file signature", 20);

    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);

      if (!hasPdfMagicHeader(bytes)) {
        throw new Error(
          `"${name}" does not contain a valid PDF signature. Make sure it is a genuine PDF file.`
        );
      }

      if (!window.pdfjsLib) {
        throw new Error("PDF.js failed to load. Please refresh the page and try again.");
      }

      setProgress("Loading document pages...", "Inspecting page count and dimensions", 60);
      const loadedDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const count = loadedDoc.numPages;
      if (count < 1) {
        await loadedDoc.destroy?.();
        throw new Error(`"${name}" has 0 pages and cannot be converted.`);
      }

      const p1 = await loadedDoc.getPage(1);
      const vp1 = p1.getViewport({ scale: 1 });
      const wPt = Math.round(vp1.width);
      const hPt = Math.round(vp1.height);
      const orient = vp1.width > vp1.height ? "Landscape" : "Portrait";
      p1.cleanup?.();

      currentFile = file;
      pdfJsDoc = loadedDoc;
      totalPages = count;
      selectedPages = new Set();
      for (let p = 1; p <= count; p++) selectedPages.add(p);
      currentBatch = 0;

      docNameEl.textContent = name;
      docNameEl.title = name;
      docSizeEl.textContent = fmtBytes(file.size);
      docPagesEl.textContent = count === 1 ? "1 page" : `${count} pages`;
      docDimsEl.textContent = `${wPt} × ${hPt} pt (${orient})`;
      docStatusEl.textContent = "Ready to convert";
      docStatusEl.dataset.status = "ready";

      if (rangeInput) {
        rangeInput.value = count >= 3 ? `1-${Math.min(3, count)}` : "1";
      }

      dropzone.hidden = true;
      docHeader.hidden = false;
      optionsSection.hidden = false;
      gridSection.hidden = false;
      rasterNote.hidden = false;
      actionBar.hidden = false;
      resetBtn.disabled = false;
      progressPanel.hidden = true;

      if (file.size > LARGE_FILE_WARN_BYTES) {
        showAlert(
          `Large PDF loaded (${fmtBytes(file.size)}, ${count} pages). Thumbnails load lazily and pages convert sequentially to protect device memory.`,
          "warn"
        );
      }

      setSelectionMode("all");
      renderThumbnailBatch(0);
      syncSettingsSummary();
      toast(`Loaded "${name}" (${count} ${count === 1 ? "page" : "pages"}).`);
    } catch (err) {
      progressPanel.hidden = true;
      await resetAll(false);
      if (isEncryptedError(err)) {
        showAlert(
          `"${name}" is password-protected or encrypted. Unlock the PDF first before converting to JPG.`,
          "error"
        );
      } else {
        showAlert(
          err?.message || `"${name}" appears to be corrupted or uses an unsupported PDF format.`,
          "error"
        );
      }
    } finally {
      isProcessing = false;
      syncSettingsSummary();
    }
  }

  /* ---------- Lazy Page Thumbnail Grid ---------- */
  async function renderSingleThumbnail(pageNum, canvas, skeleton) {
    if (!pdfJsDoc || renderedThumbs.has(pageNum)) return;
    renderedThumbs.add(pageNum);

    try {
      const page = await pdfJsDoc.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(240 / Math.max(vp1.width, 1), 1.5);
      const vp = page.getViewport({ scale });

      canvas.width = Math.max(1, Math.ceil(vp.width));
      canvas.height = Math.max(1, Math.ceil(vp.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      canvas.hidden = false;
      if (skeleton) skeleton.hidden = true;
      page.cleanup?.();
    } catch (_) {
      if (skeleton) skeleton.textContent = `Page ${pageNum}`;
    }
  }

  function renderThumbnailBatch(batchIdx) {
    if (!pdfJsDoc || totalPages < 1) return;

    const totalBatches = Math.ceil(totalPages / PAGES_PER_BATCH);
    currentBatch = Math.max(0, Math.min(totalBatches - 1, batchIdx));
    const startPage = currentBatch * PAGES_PER_BATCH + 1;
    const endPage = Math.min(totalPages, startPage + PAGES_PER_BATCH - 1);

    if (thumbObserver) {
      thumbObserver.disconnect();
      thumbObserver = null;
    }
    renderedThumbs.clear();
    pageGridEl.innerHTML = "";

    if (totalBatches > 1) {
      pagerBar.hidden = false;
      pagerLabel.textContent = `Showing pages ${startPage}–${endPage} of ${totalPages}`;
      pagerPrevBtn.disabled = currentBatch === 0;
      pagerNextBtn.disabled = currentBatch >= totalBatches - 1;
    } else {
      pagerBar.hidden = true;
    }

    if ("IntersectionObserver" in window) {
      thumbObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const card = entry.target;
            const pNum = Number(card.dataset.page);
            const canvas = card.querySelector("canvas");
            const skel = card.querySelector(".pj-thumb-skeleton");
            thumbObserver?.unobserve(card);
            renderSingleThumbnail(pNum, canvas, skel);
          }
        },
        { rootMargin: "220px" }
      );
    }

    for (let p = startPage; p <= endPage; p++) {
      const isSel = pageSelectionMode === "all" || selectedPages.has(p);
      const card = document.createElement("div");
      card.className = `pj-page-card${isSel ? " is-selected" : ""}`;
      card.dataset.page = String(p);

      const stage = document.createElement("div");
      stage.className = "pj-thumb-stage";

      const canvas = document.createElement("canvas");
      canvas.hidden = true;

      const skel = document.createElement("span");
      skel.className = "pj-thumb-skeleton";
      skel.textContent = `Page ${p}`;

      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "pj-zoom-btn";
      zoomBtn.title = `Zoom preview Page ${p}`;
      zoomBtn.setAttribute("aria-label", `Zoom preview Page ${p}`);
      zoomBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" /></svg>`;
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPdfZoomModal(p);
      });

      stage.append(canvas, skel, zoomBtn);

      const foot = document.createElement("div");
      foot.className = "pj-card-foot";

      const lbl = document.createElement("label");
      lbl.className = "pj-page-check-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSel;
      cb.setAttribute("aria-label", `Select page ${p}`);
      cb.addEventListener("change", () => {
        if (pageSelectionMode === "all" && !cb.checked) {
          // Switching from "all" to "selected" with all pages except p
          selectedPages = new Set();
          for (let k = 1; k <= totalPages; k++) {
            if (k !== p) selectedPages.add(k);
          }
          setSelectionMode("selected");
          return;
        }
        if (cb.checked) selectedPages.add(p);
        else selectedPages.delete(p);
        if (pageSelectionMode !== "selected") setSelectionMode("selected");
        else syncGridSelection();
      });

      const numSpan = document.createElement("span");
      numSpan.textContent = `Page ${p}`;
      lbl.append(cb, numSpan);

      const indicator = document.createElement("span");
      indicator.className = "pj-sel-indicator";
      indicator.textContent = "Selected";

      foot.append(lbl, indicator);
      card.append(stage, foot);

      card.addEventListener("click", (e) => {
        if (e.target.closest("input") || e.target.closest(".pj-zoom-btn")) return;
        if (pageSelectionMode === "all") {
          selectedPages = new Set();
          for (let k = 1; k <= totalPages; k++) {
            if (k !== p) selectedPages.add(k);
          }
          setSelectionMode("selected");
          return;
        }
        if (selectedPages.has(p)) selectedPages.delete(p);
        else selectedPages.add(p);
        if (pageSelectionMode !== "selected") setSelectionMode("selected");
        else syncGridSelection();
      });

      pageGridEl.appendChild(card);

      if (thumbObserver) {
        thumbObserver.observe(card);
      } else {
        renderSingleThumbnail(p, canvas, skel);
      }
    }
  }

  /* ---------- Preview / Zoom Lightbox (Supports both PDF pages & Converted JPGs) ---------- */
  async function renderZoomModalContent() {
    if (!zoomModal) return;

    if (modalKind === "pdf") {
      if (!pdfJsDoc) return;
      zoomCanvas.hidden = false;
      zoomImg.hidden = true;
      zoomOutBtn.hidden = false;
      zoomInBtn.hidden = false;
      zoomPctLabel.hidden = false;
      zoomToggleSelBtn.hidden = false;

      zoomTitle.textContent = `PDF Page ${zoomPageNum} of ${totalPages}`;
      zoomPctLabel.textContent = `${Math.round((zoomScale / 1.25) * 100)}%`;
      zoomPrevBtn.disabled = zoomPageNum <= 1;
      zoomNextBtn.disabled = zoomPageNum >= totalPages;
      zoomOutBtn.disabled = zoomScale <= 0.75;
      zoomInBtn.disabled = zoomScale >= 2.5;

      const isSel = pageSelectionMode === "all" || selectedPages.has(zoomPageNum);
      zoomToggleSelBtn.textContent = isSel ? `Deselect Page ${zoomPageNum}` : `Select Page ${zoomPageNum}`;

      try {
        const page = await pdfJsDoc.getPage(zoomPageNum);
        const vp = page.getViewport({ scale: zoomScale });
        zoomCanvas.width = Math.max(1, Math.ceil(vp.width));
        zoomCanvas.height = Math.max(1, Math.ceil(vp.height));
        const ctx = zoomCanvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup?.();
      } catch (_) {}
    } else if (modalKind === "jpg") {
      const item = convertedImages[zoomJpgIndex];
      if (!item) return;
      zoomCanvas.hidden = true;
      zoomImg.hidden = false;
      zoomOutBtn.hidden = true;
      zoomInBtn.hidden = true;
      zoomPctLabel.hidden = true;
      zoomToggleSelBtn.hidden = true;

      zoomTitle.textContent = `${item.filename} (Page ${item.pageNum} · ${item.width} × ${item.height} px · ${fmtBytes(item.size)})`;
      zoomPrevBtn.disabled = zoomJpgIndex <= 0;
      zoomNextBtn.disabled = zoomJpgIndex >= convertedImages.length - 1;
      zoomImg.src = item.url;
      zoomImg.alt = `Converted JPG preview for page ${item.pageNum}`;
      zoomImg.style.maxWidth = "100%";
      zoomImg.style.height = "auto";
    }
  }

  function openPdfZoomModal(pageNum) {
    if (!zoomModal || !pdfJsDoc) return;
    modalKind = "pdf";
    zoomPageNum = Math.max(1, Math.min(totalPages, pageNum));
    zoomScale = 1.25;
    zoomModal.showModal();
    renderZoomModalContent();
  }

  function openJpgZoomModal(idx) {
    if (!zoomModal || !convertedImages[idx]) return;
    modalKind = "jpg";
    zoomJpgIndex = idx;
    zoomModal.showModal();
    renderZoomModalContent();
  }

  zoomCloseTop?.addEventListener("click", () => zoomModal.close());
  zoomPrevBtn?.addEventListener("click", () => {
    if (modalKind === "pdf" && zoomPageNum > 1) {
      zoomPageNum--;
      renderZoomModalContent();
    } else if (modalKind === "jpg" && zoomJpgIndex > 0) {
      zoomJpgIndex--;
      renderZoomModalContent();
    }
  });
  zoomNextBtn?.addEventListener("click", () => {
    if (modalKind === "pdf" && zoomPageNum < totalPages) {
      zoomPageNum++;
      renderZoomModalContent();
    } else if (modalKind === "jpg" && zoomJpgIndex < convertedImages.length - 1) {
      zoomJpgIndex++;
      renderZoomModalContent();
    }
  });
  zoomOutBtn?.addEventListener("click", () => {
    if (modalKind === "pdf" && zoomScale > 0.75) {
      zoomScale = Math.max(0.75, zoomScale - 0.25);
      renderZoomModalContent();
    }
  });
  zoomInBtn?.addEventListener("click", () => {
    if (modalKind === "pdf" && zoomScale < 2.5) {
      zoomScale = Math.min(2.5, zoomScale + 0.25);
      renderZoomModalContent();
    }
  });
  zoomToggleSelBtn?.addEventListener("click", () => {
    if (modalKind !== "pdf") return;
    if (pageSelectionMode === "all") {
      selectedPages = new Set();
      for (let k = 1; k <= totalPages; k++) {
        if (k !== zoomPageNum) selectedPages.add(k);
      }
      setSelectionMode("selected");
    } else {
      if (selectedPages.has(zoomPageNum)) selectedPages.delete(zoomPageNum);
      else selectedPages.add(zoomPageNum);
      setSelectionMode("selected");
    }
    renderZoomModalContent();
  });

  /* ---------- Progress Display Helper (Real Completed Page Progress Only) ---------- */
  function setProgress(msg, meta, pct) {
    if (!progressPanel) return;
    progressPanel.hidden = false;
    if (progressMsg) progressMsg.textContent = msg;
    if (progressMeta) progressMeta.textContent = meta || "";
    if (progressFill && typeof pct === "number") {
      progressFill.style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
    }
  }

  /* ---------- Canvas to JPG Blob Helper ---------- */
  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size === 0) {
            return reject(new Error("Canvas failed to encode JPG image."));
          }
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    });
  }

  /* ---------- Main Sequential PDF -> JPG Conversion Engine ---------- */
  async function convertPdfToJpg() {
    if (isProcessing || !pdfJsDoc || totalPages < 1) return;

    showAlert("");
    const targetRes = resolveTargetPages();
    if (!targetRes.ok) {
      showAlert(targetRes.error, "error");
      return;
    }

    const pagesToConvert = targetRes.pages;
    const dpi = getEffectiveDpi();
    const qual = QUALITY_MAP[qualityKey] || QUALITY_MAP.medium;
    const baseName = sanitizeBaseName(baseNameInput?.value || DEFAULT_BASE_NAME);

    isProcessing = true;
    revokeConvertedUrls();
    resultPanel.hidden = true;

    convertBtn.disabled = true;
    resetBtn.disabled = true;
    changePdfBtn.disabled = true;
    selModeCards.forEach((c) => (c.disabled = true));
    qualityCards.forEach((c) => (c.disabled = true));
    dpiBtns.forEach((b) => (b.disabled = true));
    if (customDpiInput) customDpiInput.disabled = true;

    docStatusEl.textContent = "Converting to JPG...";
    docStatusEl.dataset.status = "processing";
    convertBtnLabel.innerHTML = `<span class="pj-spinner" aria-hidden="true"></span> Converting...`;

    const results = [];
    const failedPages = [];
    const targetScaleBase = dpi / 72;

    try {
      setProgress(
        "Preparing selected pages...",
        `${pagesToConvert.length} ${pagesToConvert.length === 1 ? "page" : "pages"} · ${dpi} DPI · ${qual.label}`,
        5
      );
      await sleep(20);

      for (let i = 0; i < pagesToConvert.length; i++) {
        const pageNum = pagesToConvert[i];
        const pct = 8 + (i / pagesToConvert.length) * 86;
        setProgress(
          "Rendering PDF pages...",
          `Converting page ${pageNum} (${i + 1} of ${pagesToConvert.length})`,
          pct
        );

        let canvas = null;
        try {
          const page = await pdfJsDoc.getPage(pageNum);
          const vp1 = page.getViewport({ scale: 1 });
          const maxSideScale = MAX_CANVAS_SIDE / Math.max(vp1.width, vp1.height, 1);
          const renderScale = Math.max(0.25, Math.min(targetScaleBase, maxSideScale));
          const vp = page.getViewport({ scale: renderScale });

          canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.ceil(vp.width));
          canvas.height = Math.max(1, Math.ceil(vp.height));

          const ctx = canvas.getContext("2d", { alpha: false });
          // Fill solid white background so transparent PDFs never turn black in JPEG
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          setProgress(
            "Converting pages into JPG images...",
            `Encoding page ${pageNum} (${i + 1} of ${pagesToConvert.length})`,
            pct + 3
          );

          const blob = await canvasToJpegBlob(canvas, qual.value);
          const url = URL.createObjectURL(blob);
          const outWidth = canvas.width;
          const outHeight = canvas.height;

          results.push({
            pageNum,
            filename: `${baseName}-${pageNum}.jpg`,
            width: outWidth,
            height: outHeight,
            size: blob.size,
            blob,
            url,
            picked: true,
          });

          page.cleanup?.();
        } catch (pageErr) {
          failedPages.push(pageNum);
        } finally {
          // Immediately release canvas memory after every single page
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas = null;
          }
        }

        // Yield to UI thread so browser stays responsive on large PDFs
        await sleep(0);
      }

      if (!results.length) {
        throw new Error("None of the selected PDF pages could be rendered into JPG images.");
      }

      convertedImages = results;
      setProgress("Preparing downloadable images...", `${results.length} JPG images verified`, 98);
      await sleep(120);
      setProgress("Conversion complete!", `${results.length} JPG ${results.length === 1 ? "image" : "images"} ready`, 100);
      await sleep(160);
      progressPanel.hidden = true;

      if (failedPages.length > 0) {
        showAlert(
          `Converted ${results.length} pages, but page(s) ${failedPages.join(", ")} could not be rendered.`,
          "warn"
        );
      }

      renderConvertedGallery(dpi, qual.label);
      docStatusEl.textContent = `Converted ${results.length} ${results.length === 1 ? "page" : "pages"} to JPG`;
      docStatusEl.dataset.status = "ready";
      toast(`Converted ${results.length} ${results.length === 1 ? "page" : "pages"} into JPG images.`);
    } catch (err) {
      progressPanel.hidden = true;
      revokeConvertedUrls();
      docStatusEl.textContent = "Ready to convert";
      docStatusEl.dataset.status = "ready";
      showAlert(err?.message || "PDF to JPG conversion failed. Please try a lower DPI or another file.", "error");
      toast("Conversion failed.", "error");
    } finally {
      isProcessing = false;
      resetBtn.disabled = !currentFile;
      changePdfBtn.disabled = false;
      selModeCards.forEach((c) => (c.disabled = false));
      qualityCards.forEach((c) => (c.disabled = false));
      dpiBtns.forEach((b) => (b.disabled = false));
      if (customDpiInput) customDpiInput.disabled = false;
      syncSettingsSummary();
    }
  }

  /* ---------- Converted Image Gallery & Bulk / Single Downloads ---------- */
  function updateBulkSelectionButtons() {
    const pickedCount = convertedImages.filter((x) => x.picked).length;
    if (downloadSelectedZipBtn) {
      downloadSelectedZipBtn.hidden = convertedImages.length < 2;
      downloadSelectedZipBtn.disabled = pickedCount === 0;
      downloadSelectedZipBtn.textContent = `Download Selected (${pickedCount}) as ZIP`;
    }
    if (downloadAllZipBtn) {
      downloadAllZipBtn.hidden = convertedImages.length < 2;
      downloadAllZipBtn.disabled = convertedImages.length < 2;
    }
  }

  function applyCustomBaseFilename() {
    const base = sanitizeBaseName(baseNameInput?.value || DEFAULT_BASE_NAME);
    convertedImages.forEach((item) => {
      item.filename = `${base}-${item.pageNum}.jpg`;
    });
    galleryGridEl.querySelectorAll("[data-jpg-name]").forEach((el, idx) => {
      if (convertedImages[idx]) el.textContent = convertedImages[idx].filename;
    });
  }

  function renderConvertedGallery(dpi, qualityLabel) {
    if (!resultPanel || !galleryGridEl) return;

    const totalSize = convertedImages.reduce((s, x) => s + x.size, 0);
    resPagesConv.textContent = `${convertedImages.length} ${convertedImages.length === 1 ? "page" : "pages"}`;
    resFilesGen.textContent = `${convertedImages.length} JPG${convertedImages.length === 1 ? "" : "s"}`;
    resTotalSize.textContent = fmtBytes(totalSize);
    resDpiUsed.textContent = `${dpi} DPI`;
    resQualUsed.textContent = qualityLabel;

    resultSub.textContent =
      convertedImages.length === 1
        ? "Preview or download your converted JPG image below."
        : "Download individual JPG images below or package selected / all images into a single ZIP file.";

    galleryGridEl.innerHTML = "";

    convertedImages.forEach((item, idx) => {
      const card = document.createElement("article");
      card.className = `pj-img-card${item.picked ? " is-picked" : ""}`;

      const topRow = document.createElement("div");
      topRow.className = "pj-img-top-row";

      const checkLbl = document.createElement("label");
      checkLbl.className = "pj-img-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = item.picked;
      cb.setAttribute("aria-label", `Select ${item.filename} for bulk download`);
      cb.addEventListener("change", () => {
        item.picked = cb.checked;
        card.classList.toggle("is-picked", item.picked);
        updateBulkSelectionButtons();
      });
      const pgTxt = document.createElement("span");
      pgTxt.textContent = `Page ${item.pageNum}`;
      checkLbl.append(cb, pgTxt);

      const dimSpan = document.createElement("span");
      dimSpan.style.fontSize = "11.5px";
      dimSpan.style.color = "var(--muted)";
      dimSpan.style.fontWeight = "600";
      dimSpan.textContent = `${item.width}×${item.height}px`;

      topRow.append(checkLbl, dimSpan);

      const previewBox = document.createElement("div");
      previewBox.className = "pj-img-preview-box";
      previewBox.title = "Click to open larger preview";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `Page ${item.pageNum} converted to JPG`;
      img.loading = "lazy";
      previewBox.appendChild(img);
      previewBox.addEventListener("click", () => openJpgZoomModal(idx));

      const meta = document.createElement("div");
      meta.className = "pj-img-meta";
      const fnameEl = document.createElement("span");
      fnameEl.className = "pj-img-filename";
      fnameEl.dataset.jpgName = "1";
      fnameEl.textContent = item.filename;
      fnameEl.title = item.filename;

      const sizeEl = document.createElement("span");
      sizeEl.textContent = `JPG Image · ${fmtBytes(item.size)}`;
      meta.append(fnameEl, sizeEl);

      const btns = document.createElement("div");
      btns.className = "pj-img-btns";

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "pj-mini-btn";
      prevBtn.textContent = "Preview";
      prevBtn.addEventListener("click", () => openJpgZoomModal(idx));

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "btn primary";
      dlBtn.style.minHeight = "34px";
      dlBtn.style.padding = "0 12px";
      dlBtn.style.fontSize = "12.5px";
      dlBtn.textContent = "Download JPG";
      dlBtn.addEventListener("click", () => {
        applyCustomBaseFilename();
        triggerBlobDownload(item.url, item.filename, "image/jpeg");
        toast(`Downloading ${item.filename}`);
      });

      btns.append(prevBtn, dlBtn);
      card.append(topRow, previewBox, meta, btns);
      galleryGridEl.appendChild(card);
    });

    updateBulkSelectionButtons();
    resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function triggerBlobDownload(url, filename, mime) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    if (mime) a.type = mime;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadImagesAsZip(items, triggerBtn) {
    if (!items.length) return;
    if (!window.JSZip) {
      showAlert("ZIP library (JSZip) is unavailable. Download individual JPG images instead.", "error");
      return;
    }

    applyCustomBaseName();
    triggerBtn.disabled = true;
    const origText = triggerBtn.textContent;
    triggerBtn.textContent = "Packaging ZIP...";

    try {
      const zip = new window.JSZip();
      for (const item of items) {
        zip.file(item.filename, item.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const base = sanitizeBaseName(baseNameInput?.value || DEFAULT_BASE_NAME);
      const zipName = base === DEFAULT_BASE_NAME ? DEFAULT_ZIP_NAME : `${base}-images.zip`;
      triggerBlobDownload(zipUrl, zipName, "application/zip");
      setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      toast(`Downloaded ${zipName} (${items.length} JPG images).`);
    } catch (err) {
      showAlert(err?.message || "Unable to build ZIP archive.", "error");
    } finally {
      triggerBtn.disabled = false;
      triggerBtn.textContent = origText;
      updateBulkSelectionButtons();
    }
  }

  /* ---------- Reset Tool ---------- */
  async function resetAll(clearAlerts = true) {
    revokeConvertedUrls();
    await destroyPdfDoc();
    currentFile = null;
    totalPages = 0;
    selectedPages = new Set();
    currentBatch = 0;

    if (clearAlerts) showAlert("");
    dropzone.hidden = false;
    docHeader.hidden = true;
    optionsSection.hidden = true;
    gridSection.hidden = true;
    rasterNote.hidden = true;
    progressPanel.hidden = true;
    actionBar.hidden = true;
    resultPanel.hidden = true;
    pageGridEl.innerHTML = "";
    galleryGridEl.innerHTML = "";
    if (rangeInput) rangeInput.value = "";
    if (baseNameInput) baseNameInput.value = DEFAULT_BASE_NAME;
    resetBtn.disabled = true;
    convertBtn.disabled = true;
  }

  /* ---------- Event Wiring ---------- */
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) handleUploadedFile(f);
  });

  changePdfBtn?.addEventListener("click", () => {
    if (!isProcessing) fileInput.click();
  });

  selModeCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (!isProcessing) setSelectionMode(card.dataset.selMode);
    });
  });

  rangeInput?.addEventListener("input", () => {
    showAlert("");
    syncSettingsSummary();
  });

  qualityCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (isProcessing) return;
      qualityKey = card.dataset.quality || "medium";
      qualityCards.forEach((c) => c.setAttribute("aria-checked", String(c === card)));
      syncSettingsSummary();
    });
  });

  dpiBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isProcessing) return;
      const val = btn.dataset.dpi;
      dpiBtns.forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      if (val === "custom") {
        useCustomDpi = true;
        if (customDpiWrap) customDpiWrap.hidden = false;
        customDpiInput?.focus();
      } else {
        useCustomDpi = false;
        selectedDpi = parseInt(val, 10) || 150;
        if (customDpiWrap) customDpiWrap.hidden = true;
      }
      syncSettingsSummary();
    });
  });

  customDpiInput?.addEventListener("input", () => {
    syncSettingsSummary();
  });

  // Quick Actions
  btnSelectAll?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages = new Set();
    for (let p = 1; p <= totalPages; p++) selectedPages.add(p);
    setSelectionMode("selected");
  });

  btnDeselectAll?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages.clear();
    setSelectionMode("selected");
  });

  btnClearSel?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages.clear();
    if (rangeInput) rangeInput.value = "";
    showAlert("");
    setSelectionMode("selected");
  });

  btnConvertAllMode?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    setSelectionMode("all");
  });

  pagerPrevBtn?.addEventListener("click", () => {
    if (currentBatch > 0) {
      renderThumbnailBatch(currentBatch - 1);
      gridSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  pagerNextBtn?.addEventListener("click", () => {
    const maxBatch = Math.ceil(totalPages / PAGES_PER_BATCH) - 1;
    if (currentBatch < maxBatch) {
      renderThumbnailBatch(currentBatch + 1);
      gridSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  convertBtn.addEventListener("click", convertPdfToJpg);

  baseNameInput?.addEventListener("input", applyCustomBaseFilename);

  downloadAllZipBtn?.addEventListener("click", () => {
    downloadImagesAsZip(convertedImages, downloadAllZipBtn);
  });

  downloadSelectedZipBtn?.addEventListener("click", () => {
    const picked = convertedImages.filter((x) => x.picked);
    downloadImagesAsZip(picked, downloadSelectedZipBtn);
  });

  resetBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetAll(true);
      toast("PDF to JPG Converter reset.");
    }
  });

  resetResultBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetAll(true);
      toast("PDF to JPG Converter reset.");
    }
  });

  convertAnotherBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetAll(true);
      fileInput.click();
    }
  });

  // Drag & Drop File Upload
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  let dzDepth = 0;

  dropzone.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dzDepth++;
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dropzone.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dzDepth = Math.max(0, dzDepth - 1);
    if (!dzDepth) dropzone.classList.remove("is-over");
  });

  dropzone.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dzDepth = 0;
    dropzone.classList.remove("is-over");
    const f = e.dataTransfer.files?.[0];
    if (f) handleUploadedFile(f);
  });

  // Initial state
  resetAll(true);
})();
