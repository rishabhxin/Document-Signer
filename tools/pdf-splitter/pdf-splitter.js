(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const MAX_FILE_BYTES = 100 * 1024 * 1024; // Configurable 100 MB browser limit
  const LARGE_FILE_WARN_BYTES = 40 * 1024 * 1024;
  const PAGES_PER_BATCH = 36; // Pagination batch size for large PDFs
  const DEFAULT_SINGLE_NAME = "opensign-split-document.pdf";
  const DEFAULT_ZIP_NAME = "opensign-split-pdfs.zip";

  // DOM Elements
  const fileInput = $("spFileInput");
  const dropzone = $("spDropzone");
  const alertBox = $("spAlert");
  const alertMsg = $("spAlertMsg");
  const alertClose = $("spAlertClose");

  const docHeader = $("spDocHeader");
  const docNameEl = $("spDocName");
  const docStatusEl = $("spDocStatus");
  const docSizeEl = $("spDocSize");
  const docPagesEl = $("spDocPages");
  const docDimsEl = $("spDocDims");
  const changePdfBtn = $("spChangePdfBtn");

  const modesSection = $("spModesSection");
  const modeCards = Array.from(document.querySelectorAll(".sp-mode-card"));
  const selectionSummaryEl = $("spSelectionSummary");

  const panelExtract = $("spPanelExtract");
  const panelEvery = $("spPanelEvery");
  const panelRanges = $("spPanelRanges");
  const panelEqual = $("spPanelEqual");

  const pageSelectInput = $("spPageSelectInput");
  const applySelectBtn = $("spApplySelectBtn");
  const rangeInput = $("spRangeInput");
  const rangePreviewChips = $("spRangePreviewChips");
  const partsCountInput = $("spPartsCountInput");
  const equalDistNote = $("spEqualDistNote");
  const equalPreviewChips = $("spEqualPreviewChips");

  const quickBar = $("spQuickBar");
  const btnSelectAll = $("spBtnSelectAll");
  const btnDeselectAll = $("spBtnDeselectAll");
  const btnReverseSel = $("spBtnReverseSel");
  const btnClearSel = $("spBtnClearSel");
  const btnQuickExtract = $("spBtnQuickExtract");
  const btnQuickEvery = $("spBtnQuickEvery");

  const gridSection = $("spGridSection");
  const pageGridEl = $("spPageGrid");
  const pagerBar = $("spPagerBar");
  const pagerLabel = $("spPagerLabel");
  const pagerPrevBtn = $("spPagerPrev");
  const pagerNextBtn = $("spPagerNext");

  const compatNote = $("spCompatNote");
  const progressPanel = $("spProgressPanel");
  const progressMsg = $("spProgressMsg");
  const progressMeta = $("spProgressMeta");
  const progressFill = $("spProgressFill");

  const actionBar = $("spActionBar");
  const clearAllBtn = $("spClearAllBtn");
  const splitBtn = $("spSplitBtn");
  const splitBtnLabel = $("spSplitBtnLabel");

  const resultPanel = $("spResultPanel");
  const resultSub = $("spResultSub");
  const resOrigName = $("spResOrigName");
  const resOrigPages = $("spResOrigPages");
  const resModeUsed = $("spResModeUsed");
  const resOutCount = $("spResOutCount");
  const outputListEl = $("spOutputList");
  const downloadZipBtn = $("spDownloadZipBtn");
  const splitAnotherBtn = $("spSplitAnotherBtn");
  const resetResultBtn = $("spResetResultBtn");

  // Zoom Modal Elements
  const zoomModal = $("spZoomModal");
  const zoomTitle = $("spZoomTitle");
  const zoomCloseTop = $("spZoomCloseTop");
  const zoomPrevBtn = $("spZoomPrev");
  const zoomNextBtn = $("spZoomNext");
  const zoomOutBtn = $("spZoomOut");
  const zoomInBtn = $("spZoomIn");
  const zoomPctLabel = $("spZoomPct");
  const zoomToggleSelBtn = $("spZoomToggleSel");
  const zoomCanvas = $("spZoomCanvas");

  if (!fileInput || !dropzone || !splitBtn) return;

  // Strictly volatile in-memory state (zero web storage usage)
  let currentFile = null;
  let pdfBytes = null;
  let pdfJsDoc = null;
  let totalPages = 0;
  let activeMode = "extract"; // 'extract' | 'every' | 'ranges' | 'equal'
  let selectedPages = new Set(); // 1-based page numbers
  let currentBatch = 0;
  let thumbObserver = null;
  let renderedThumbs = new Set();
  let isProcessing = false;
  let generatedOutputs = []; // { id, filename, pageCount, pageDesc, size, blob, url }
  let zoomPageNum = 1;
  let zoomScale = 1.25;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fmtBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    if (b >= 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
    return `${b} B`;
  }

  function sanitizeFilename(raw, fallback) {
    let clean = String(raw || "")
      .trim()
      .replace(/[<>:\x22/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+|\.+$/g, "");
    if (!clean) clean = fallback || DEFAULT_SINGLE_NAME;
    if (!/\.pdf$/i.test(clean)) clean += ".pdf";
    return clean;
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

  /* ---------- Cleanup Blob URLs & PDF.js Document ---------- */
  function revokeOutputUrls() {
    for (const item of generatedOutputs) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
    generatedOutputs = [];
  }

  async function destroyPdfJsDoc() {
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
    revokeOutputUrls();
    destroyPdfJsDoc();
  });

  /* ---------- Selection Parsing & Range Validation ---------- */
  /**
   * Parse flat page selection string ("1", "1,3,5", "1-5", "1-5,8,10-12").
   * Returns { ok: true, pages: number[] } (deduplicated & sorted in original PDF page order)
   * or { ok: false, error: string }.
   */
  function parseSelectionExpression(raw, maxPage) {
    const str = String(raw || "").trim();
    if (!str) {
      return { ok: false, error: "Please enter at least one page number or range (for example: 1-5, 8, 10-12)." };
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
          return { ok: false, error: `Invalid page numbers in range "${tok}". Only positive integers are allowed.` };
        }
        const start = parseInt(parts[0].trim(), 10);
        const end = parseInt(parts[1].trim(), 10);
        if (start < 1 || end < 1) {
          return { ok: false, error: `Page numbers must be 1 or greater (found "${tok}").` };
        }
        if (start > maxPage || end > maxPage) {
          return { ok: false, error: `Page range "${tok}" exceeds the document's ${maxPage} pages.` };
        }
        if (start > end) {
          return { ok: false, error: `Reversed range "${tok}" is invalid (start page ${start} is greater than end page ${end}).` };
        }
        for (let p = start; p <= end; p++) {
          if (picked.has(p)) {
            return { ok: false, error: `Duplicate page ${p} detected in "${tok}". Remove duplicate pages or overlapping ranges.` };
          }
          picked.add(p);
        }
      } else {
        if (!/^\d+$/.test(tok)) {
          return { ok: false, error: `Invalid page value "${tok}". Enter numbers or ranges like 1-5, 8.` };
        }
        const num = parseInt(tok, 10);
        if (num < 1 || num > maxPage) {
          return { ok: false, error: `Page ${num} is out of range (valid pages: 1 to ${maxPage}).` };
        }
        if (picked.has(num)) {
          return { ok: false, error: `Duplicate page ${num} detected. Each page should be listed once.` };
        }
        picked.add(num);
      }
    }

    const sorted = Array.from(picked).sort((a, b) => a - b);
    return { ok: true, pages: sorted };
  }

  /**
   * Parse "Split by Page Ranges" expression ("1-5, 7-10, 12, 15-18") into separate output groups.
   */
  function parseSplitRangeGroups(raw, maxPage) {
    const str = String(raw || "").trim();
    if (!str) {
      return { ok: false, error: "Enter one or more page ranges separated by commas (for example: 1-5, 7-10, 12)." };
    }

    const tokens = str.split(",");
    const groups = [];
    const seenGroupKeys = new Set();

    for (const rawTok of tokens) {
      const tok = rawTok.trim();
      if (!tok) {
        return { ok: false, error: "Empty range found. Remove extra or trailing commas." };
      }

      if (tok.includes("-")) {
        const parts = tok.split("-");
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
          return { ok: false, error: `Invalid range "${tok}". Use format start-end (e.g., 1-5).` };
        }
        if (!/^\d+$/.test(parts[0].trim()) || !/^\d+$/.test(parts[1].trim())) {
          return { ok: false, error: `Invalid characters in range "${tok}". Use whole page numbers only.` };
        }
        const start = parseInt(parts[0].trim(), 10);
        const end = parseInt(parts[1].trim(), 10);
        if (start < 1 || end < 1) {
          return { ok: false, error: `Page numbers must start at 1 (invalid: "${tok}").` };
        }
        if (start > maxPage || end > maxPage) {
          return { ok: false, error: `Out-of-range page in "${tok}". This document has ${maxPage} pages.` };
        }
        if (start > end) {
          return { ok: false, error: `Reversed range "${tok}" is not allowed (start ${start} > end ${end}).` };
        }
        const key = `${start}-${end}`;
        if (seenGroupKeys.has(key)) {
          return { ok: false, error: `Duplicate range "${tok}" found. Remove duplicate entries.` };
        }
        seenGroupKeys.add(key);

        const pages = [];
        for (let p = start; p <= end; p++) pages.push(p);
        groups.push({ label: start === end ? `Page ${start}` : `Pages ${start}–${end}`, pages });
      } else {
        if (!/^\d+$/.test(tok)) {
          return { ok: false, error: `Invalid page number "${tok}".` };
        }
        const num = parseInt(tok, 10);
        if (num < 1 || num > maxPage) {
          return { ok: false, error: `Page ${num} is out of range (1–${maxPage}).` };
        }
        const key = `${num}-${num}`;
        if (seenGroupKeys.has(key)) {
          return { ok: false, error: `Duplicate page "${num}" found. Remove duplicate entries.` };
        }
        seenGroupKeys.add(key);
        groups.push({ label: `Page ${num}`, pages: [num] });
      }
    }

    return { ok: true, groups };
  }

  /**
   * Compute Equal Parts distribution.
   * Distributes any remainder pages sensibly across the first parts (e.g., 10 pages / 3 parts -> 4, 3, 3).
   */
  function computeEqualPartGroups(maxPage, numParts) {
    const parts = Math.floor(Number(numParts) || 0);
    if (parts < 2) {
      return { ok: false, error: "Please enter at least 2 parts to split into equal sections." };
    }
    if (parts > maxPage) {
      return {
        ok: false,
        error: `Cannot split a ${maxPage}-page PDF into ${parts} parts. Enter a number between 2 and ${maxPage}.`,
      };
    }

    const baseSize = Math.floor(maxPage / parts);
    const remainder = maxPage % parts;
    const groups = [];
    let cursor = 1;

    for (let i = 0; i < parts; i++) {
      const count = baseSize + (i < remainder ? 1 : 0);
      const pages = [];
      for (let k = 0; k < count; k++) pages.push(cursor + k);
      const start = pages[0];
      const end = pages[pages.length - 1];
      groups.push({
        label: start === end ? `Part ${i + 1}: Page ${start}` : `Part ${i + 1}: Pages ${start}–${end}`,
        pages,
      });
      cursor += count;
    }

    return { ok: true, groups, remainder, baseSize };
  }

  function formatPagesCompact(sortedPages) {
    if (!sortedPages || !sortedPages.length) return "";
    const ranges = [];
    let start = sortedPages[0];
    let prev = sortedPages[0];

    for (let i = 1; i < sortedPages.length; i++) {
      const cur = sortedPages[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = cur;
        prev = cur;
      }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    return ranges.join(", ");
  }

  /* ---------- Sync Selection State Across UI ---------- */
  function syncSelectionUI({ updateInput = true } = {}) {
    const sorted = Array.from(selectedPages).sort((a, b) => a - b);
    const count = sorted.length;

    if (selectionSummaryEl) {
      selectionSummaryEl.textContent = `${count} ${count === 1 ? "page" : "pages"} selected out of ${totalPages} ${totalPages === 1 ? "page" : "pages"}.`;
    }

    if (updateInput && pageSelectInput) {
      pageSelectInput.value = formatPagesCompact(sorted);
    }

    // Update visible cards in current batch
    pageGridEl.querySelectorAll(".sp-page-card").forEach((card) => {
      const p = Number(card.dataset.page);
      const on = selectedPages.has(p);
      card.classList.toggle("is-selected", on);
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = on;
    });

    updateSplitButtonState();
  }

  function updateModePreviews() {
    if (!totalPages) return;

    if (activeMode === "ranges" && rangePreviewChips) {
      rangePreviewChips.innerHTML = "";
      const parsed = parseSplitRangeGroups(rangeInput?.value || "", totalPages);
      if (parsed.ok) {
        parsed.groups.forEach((g, idx) => {
          const chip = document.createElement("span");
          chip.className = "sp-part-chip";
          chip.textContent = `opensign-part-${idx + 1}.pdf (${g.label})`;
          rangePreviewChips.appendChild(chip);
        });
      }
    }

    if (activeMode === "equal" && equalPreviewChips && equalDistNote) {
      equalPreviewChips.innerHTML = "";
      const res = computeEqualPartGroups(totalPages, partsCountInput?.value);
      if (res.ok) {
        if (res.remainder === 0) {
          equalDistNote.textContent = `Divides ${totalPages} pages evenly into ${res.groups.length} PDFs of ${res.baseSize} ${res.baseSize === 1 ? "page" : "pages"} each.`;
        } else {
          equalDistNote.textContent = `${totalPages} pages cannot be divided equally into ${res.groups.length} parts, so the first ${res.remainder} ${res.remainder === 1 ? "part receives" : "parts receive"} ${res.baseSize + 1} pages and the remaining ${res.groups.length - res.remainder === 1 ? "part receives" : "parts receive"} ${res.baseSize} pages.`;
        }
        res.groups.slice(0, 12).forEach((g) => {
          const chip = document.createElement("span");
          chip.className = "sp-part-chip";
          chip.textContent = g.label;
          equalPreviewChips.appendChild(chip);
        });
        if (res.groups.length > 12) {
          const more = document.createElement("span");
          more.className = "sp-part-chip";
          more.textContent = `+${res.groups.length - 12} more parts`;
          equalPreviewChips.appendChild(more);
        }
      } else {
        equalDistNote.textContent = res.error;
      }
    }
  }

  function updateSplitButtonState() {
    if (!totalPages || isProcessing) {
      splitBtn.disabled = true;
      return;
    }

    if (activeMode === "extract") {
      splitBtn.disabled = selectedPages.size < 1;
      splitBtnLabel.textContent =
        selectedPages.size > 0
          ? `Extract ${selectedPages.size} ${selectedPages.size === 1 ? "Page" : "Pages"}`
          : "Split PDF";
    } else if (activeMode === "every") {
      splitBtn.disabled = totalPages < 1;
      splitBtnLabel.textContent = `Split All ${totalPages} Pages`;
    } else if (activeMode === "ranges") {
      const check = parseSplitRangeGroups(rangeInput?.value || "", totalPages);
      splitBtn.disabled = !check.ok;
      splitBtnLabel.textContent = check.ok
        ? `Split into ${check.groups.length} ${check.groups.length === 1 ? "PDF" : "PDFs"}`
        : "Split PDF";
    } else if (activeMode === "equal") {
      const check = computeEqualPartGroups(totalPages, partsCountInput?.value);
      splitBtn.disabled = !check.ok;
      splitBtnLabel.textContent = check.ok ? `Split into ${check.groups.length} Parts` : "Split PDF";
    }
  }

  /* ---------- Mode Switching ---------- */
  function setMode(nextMode) {
    activeMode = nextMode;
    modeCards.forEach((c) => {
      const on = c.dataset.mode === nextMode;
      c.setAttribute("aria-checked", String(on));
    });

    panelExtract.hidden = nextMode !== "extract";
    panelEvery.hidden = nextMode !== "every";
    panelRanges.hidden = nextMode !== "ranges";
    panelEqual.hidden = nextMode !== "equal";
    quickBar.hidden = nextMode !== "extract";

    showAlert("");
    updateModePreviews();
    updateSplitButtonState();
  }

  modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (!isProcessing) setMode(card.dataset.mode);
    });
  });

  /* ---------- Upload & Inspect Single PDF ---------- */
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
      showAlert(`"${name}" is empty (0 bytes) and cannot be split.`, "error");
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
    revokeOutputUrls();
    await destroyPdfJsDoc();
    if (resultPanel) resultPanel.hidden = true;
    setProgress("Reading your PDF...", "Validating file signature", 20);

    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);

      if (!hasPdfMagicHeader(bytes)) {
        throw new Error(
          `"${name}" does not contain a valid PDF header signature. Make sure it is an authentic PDF file.`
        );
      }

      if (!window.PDFLib || !window.pdfjsLib) {
        throw new Error("Required PDF libraries failed to load. Please refresh the page and try again.");
      }

      setProgress("Loading document pages...", "Inspecting PDF structure and page count", 55);

      // Verify encryption & exact page count with pdf-lib
      const checkDoc = await window.PDFLib.PDFDocument.load(bytes.slice(), {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      const count = checkDoc.getPageCount();
      if (count < 1) {
        throw new Error(`"${name}" has 0 pages and cannot be split.`);
      }

      // Open PDF.js document for lazy thumbnail rendering & zoom preview
      const loadedPdfJs = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const p1 = await loadedPdfJs.getPage(1);
      const vp1 = p1.getViewport({ scale: 1 });
      const wPt = Math.round(vp1.width);
      const hPt = Math.round(vp1.height);
      const orient = vp1.width > vp1.height ? "Landscape" : "Portrait";
      p1.cleanup?.();

      currentFile = file;
      pdfBytes = bytes;
      pdfJsDoc = loadedPdfJs;
      totalPages = count;
      selectedPages = new Set();
      currentBatch = 0;

      // Populate uploaded PDF header
      docNameEl.textContent = name;
      docNameEl.title = name;
      docSizeEl.textContent = fmtBytes(file.size);
      docPagesEl.textContent = count === 1 ? "1 page" : `${count} pages`;
      docDimsEl.textContent = `${wPt} × ${hPt} pt (${orient})`;
      docStatusEl.textContent = "Ready to split";
      docStatusEl.dataset.status = "ready";

      // Configure default range & equal parts inputs sensibly for this PDF
      if (rangeInput) {
        rangeInput.value = count >= 4 ? `1-${Math.ceil(count / 2)}, ${Math.ceil(count / 2) + 1}-${count}` : "1";
      }
      if (partsCountInput) {
        partsCountInput.max = String(Math.max(2, count));
        partsCountInput.value = String(Math.min(2, Math.max(2, count)));
      }

      dropzone.hidden = true;
      docHeader.hidden = false;
      modesSection.hidden = false;
      gridSection.hidden = false;
      compatNote.hidden = false;
      actionBar.hidden = false;
      clearAllBtn.disabled = false;
      progressPanel.hidden = true;

      if (file.size > LARGE_FILE_WARN_BYTES) {
        showAlert(
          `Large PDF loaded (${fmtBytes(file.size)}, ${count} pages). Page thumbnails render lazily as you scroll to keep memory usage low.`,
          "warn"
        );
      }

      setMode("extract");
      renderThumbnailBatch(0);
      syncSelectionUI({ updateInput: true });
      toast(`Loaded "${name}" (${count} ${count === 1 ? "page" : "pages"}).`);
    } catch (err) {
      progressPanel.hidden = true;
      await resetAll(false);
      if (isEncryptedError(err)) {
        showAlert(
          `"${name}" is password-protected or encrypted. Unlock the PDF first before splitting.`,
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
      updateSplitButtonState();
    }
  }

  /* ---------- Lazy Thumbnail Rendering with Batch Pagination ---------- */
  async function renderSingleThumbnail(pageNum, canvas, skeleton) {
    if (!pdfJsDoc || renderedThumbs.has(pageNum)) return;
    renderedThumbs.add(pageNum);

    try {
      const page = await pdfJsDoc.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      const targetW = 240;
      const scale = Math.min(targetW / Math.max(vp1.width, 1), 1.5);
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

    // Configure pagination bar if document has multiple batches (> 36 pages)
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
            const skel = card.querySelector(".sp-thumb-skeleton");
            thumbObserver?.unobserve(card);
            renderSingleThumbnail(pNum, canvas, skel);
          }
        },
        { rootMargin: "220px" }
      );
    }

    for (let p = startPage; p <= endPage; p++) {
      const card = document.createElement("div");
      card.className = `sp-page-card${selectedPages.has(p) ? " is-selected" : ""}`;
      card.dataset.page = String(p);

      const stage = document.createElement("div");
      stage.className = "sp-thumb-stage";

      const canvas = document.createElement("canvas");
      canvas.hidden = true;

      const skel = document.createElement("span");
      skel.className = "sp-thumb-skeleton";
      skel.textContent = `Page ${p}`;

      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "sp-zoom-btn";
      zoomBtn.title = `Preview & zoom Page ${p}`;
      zoomBtn.setAttribute("aria-label", `Preview and zoom Page ${p}`);
      zoomBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" /></svg>`;
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomModal(p);
      });

      stage.append(canvas, skel, zoomBtn);

      const foot = document.createElement("div");
      foot.className = "sp-card-foot";

      const lbl = document.createElement("label");
      lbl.className = "sp-page-check-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedPages.has(p);
      cb.setAttribute("aria-label", `Select page ${p}`);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedPages.add(p);
        else selectedPages.delete(p);
        if (activeMode !== "extract") setMode("extract");
        syncSelectionUI({ updateInput: true });
      });

      const numSpan = document.createElement("span");
      numSpan.textContent = `Page ${p}`;
      lbl.append(cb, numSpan);

      const indicator = document.createElement("span");
      indicator.className = "sp-sel-indicator";
      indicator.textContent = "Selected";

      foot.append(lbl, indicator);
      card.append(stage, foot);

      // Clicking card toggles selection
      card.addEventListener("click", (e) => {
        if (e.target.closest("input") || e.target.closest(".sp-zoom-btn")) return;
        if (selectedPages.has(p)) selectedPages.delete(p);
        else selectedPages.add(p);
        if (activeMode !== "extract") setMode("extract");
        syncSelectionUI({ updateInput: true });
      });

      pageGridEl.appendChild(card);

      if (thumbObserver) {
        thumbObserver.observe(card);
      } else {
        renderSingleThumbnail(p, canvas, skel);
      }
    }
  }

  /* ---------- Page Zoom / Preview Modal ---------- */
  async function renderZoomPage() {
    if (!pdfJsDoc || !zoomCanvas) return;
    zoomTitle.textContent = `Page ${zoomPageNum} of ${totalPages}`;
    zoomPctLabel.textContent = `${Math.round((zoomScale / 1.25) * 100)}%`;
    zoomPrevBtn.disabled = zoomPageNum <= 1;
    zoomNextBtn.disabled = zoomPageNum >= totalPages;
    zoomOutBtn.disabled = zoomScale <= 0.75;
    zoomInBtn.disabled = zoomScale >= 2.5;

    const isSel = selectedPages.has(zoomPageNum);
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
  }

  function openZoomModal(pageNum) {
    if (!zoomModal || !pdfJsDoc) return;
    zoomPageNum = Math.max(1, Math.min(totalPages, pageNum));
    zoomScale = 1.25;
    zoomModal.showModal();
    renderZoomPage();
  }

  zoomCloseTop?.addEventListener("click", () => zoomModal.close());
  zoomPrevBtn?.addEventListener("click", () => {
    if (zoomPageNum > 1) {
      zoomPageNum--;
      renderZoomPage();
    }
  });
  zoomNextBtn?.addEventListener("click", () => {
    if (zoomPageNum < totalPages) {
      zoomPageNum++;
      renderZoomPage();
    }
  });
  zoomOutBtn?.addEventListener("click", () => {
    if (zoomScale > 0.75) {
      zoomScale = Math.max(0.75, zoomScale - 0.25);
      renderZoomPage();
    }
  });
  zoomInBtn?.addEventListener("click", () => {
    if (zoomScale < 2.5) {
      zoomScale = Math.min(2.5, zoomScale + 0.25);
      renderZoomPage();
    }
  });
  zoomToggleSelBtn?.addEventListener("click", () => {
    if (selectedPages.has(zoomPageNum)) selectedPages.delete(zoomPageNum);
    else selectedPages.add(zoomPageNum);
    if (activeMode !== "extract") setMode("extract");
    syncSelectionUI({ updateInput: true });
    renderZoomPage();
  });

  /* ---------- Progress Display Helper ---------- */
  function setProgress(msg, meta, pct) {
    if (!progressPanel) return;
    progressPanel.hidden = false;
    if (progressMsg) progressMsg.textContent = msg;
    if (progressMeta) progressMeta.textContent = meta || "";
    if (progressFill && typeof pct === "number") {
      progressFill.style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
    }
  }

  /* ---------- Core PDF Splitting Engine (pdf-lib + JSZip) ---------- */
  async function executeSplit() {
    if (isProcessing || !pdfBytes || totalPages < 1) return;

    showAlert("");

    // 1. Determine target output groups based on active mode
    let groups = [];
    let modeTitle = "";
    const baseDocSlug = (currentFile?.name || "document")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "document";

    if (activeMode === "extract") {
      modeTitle = "Extract Selected Pages";
      // If user typed in pageSelectInput, parse & validate it first
      if (pageSelectInput && pageSelectInput.value.trim()) {
        const parsed = parseSelectionExpression(pageSelectInput.value, totalPages);
        if (!parsed.ok) {
          showAlert(parsed.error, "error");
          return;
        }
        selectedPages = new Set(parsed.pages);
        syncSelectionUI({ updateInput: false });
      }
      const sorted = Array.from(selectedPages).sort((a, b) => a - b);
      if (!sorted.length) {
        showAlert("Please select at least one page to extract.", "error");
        return;
      }
      groups = [
        {
          filename: DEFAULT_SINGLE_NAME,
          pageDesc: `Pages: ${formatPagesCompact(sorted)}`,
          pages: sorted,
        },
      ];
    } else if (activeMode === "every") {
      modeTitle = "Split Every Page";
      for (let p = 1; p <= totalPages; p++) {
        groups.push({
          filename: `page-${p}.pdf`,
          pageDesc: `Page ${p} of ${totalPages}`,
          pages: [p],
        });
      }
    } else if (activeMode === "ranges") {
      modeTitle = "Split by Page Ranges";
      const parsed = parseSplitRangeGroups(rangeInput?.value || "", totalPages);
      if (!parsed.ok) {
        showAlert(parsed.error, "error");
        return;
      }
      groups = parsed.groups.map((g, idx) => ({
        filename: parsed.groups.length === 1 ? DEFAULT_SINGLE_NAME : `opensign-part-${idx + 1}.pdf`,
        pageDesc: g.label,
        pages: g.pages,
      }));
    } else if (activeMode === "equal") {
      modeTitle = "Split into Equal Parts";
      const parsed = computeEqualPartGroups(totalPages, partsCountInput?.value);
      if (!parsed.ok) {
        showAlert(parsed.error, "error");
        return;
      }
      groups = parsed.groups.map((g, idx) => ({
        filename: `opensign-part-${idx + 1}.pdf`,
        pageDesc: g.label,
        pages: g.pages,
      }));
    }

    isProcessing = true;
    revokeOutputUrls();
    resultPanel.hidden = true;
    splitBtn.disabled = true;
    clearAllBtn.disabled = true;
    changePdfBtn.disabled = true;
    modeCards.forEach((c) => (c.disabled = true));
    docStatusEl.textContent = "Splitting PDF...";
    docStatusEl.dataset.status = "processing";
    splitBtnLabel.innerHTML = `<span class="sp-spinner" aria-hidden="true"></span> Splitting PDF...`;

    try {
      setProgress("Preparing selected pages...", `${groups.length} output ${groups.length === 1 ? "file" : "files"} queued`, 10);
      await sleep(20);

      const { PDFDocument } = window.PDFLib;
      const srcDoc = await PDFDocument.load(pdfBytes.slice(), {
        ignoreEncryption: false,
        updateMetadata: false,
      });

      const created = [];
      for (let i = 0; i < groups.length; i++) {
        const grp = groups[i];
        const pct = 15 + ((i / groups.length) * 65);
        setProgress(
          "Splitting your document...",
          `Creating file ${i + 1} of ${groups.length}: ${grp.filename}`,
          pct
        );

        const outDoc = await PDFDocument.create();
        const zeroBasedIndices = grp.pages.map((p) => p - 1);
        const copiedPages = await outDoc.copyPages(srcDoc, zeroBasedIndices);

        for (const page of copiedPages) {
          outDoc.addPage(page);
        }

        outDoc.setCreator("Open Sign PDF Splitter");
        outDoc.setProducer("Open Sign (https://www.opensign.in/tools/pdf-splitter/)");

        setProgress("Creating downloadable files...", `Encoding ${grp.filename}`, pct + 4);
        const outBytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });

        // Verify generated PDF structure and page count
        setProgress("Verifying output documents...", `Validating ${grp.filename}`, 82 + ((i + 1) / groups.length) * 15);
        if (!hasPdfMagicHeader(outBytes)) {
          throw new Error(`Generated file "${grp.filename}" failed PDF signature validation.`);
        }
        const verifyDoc = await PDFDocument.load(outBytes.slice(), {
          ignoreEncryption: false,
          updateMetadata: false,
        });
        if (verifyDoc.getPageCount() !== grp.pages.length) {
          throw new Error(`Page count mismatch in "${grp.filename}".`);
        }

        const blob = new Blob([outBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        created.push({
          id: i + 1,
          filename: grp.filename,
          pageCount: grp.pages.length,
          pageDesc: grp.pageDesc,
          size: blob.size,
          blob,
          url,
        });

        await sleep(0);
      }

      generatedOutputs = created;
      setProgress("Your PDFs are ready!", `${created.length} ${created.length === 1 ? "file" : "files"} verified`, 100);
      await sleep(160);
      progressPanel.hidden = true;

      renderResultsDashboard(modeTitle, baseDocSlug);
      docStatusEl.textContent = `Split into ${created.length} ${created.length === 1 ? "file" : "files"}`;
      docStatusEl.dataset.status = "ready";
      toast(`Created ${created.length} ${created.length === 1 ? "PDF file" : "PDF files"} successfully.`);
    } catch (err) {
      progressPanel.hidden = true;
      revokeOutputUrls();
      docStatusEl.textContent = "Ready to split";
      docStatusEl.dataset.status = "ready";
      showAlert(
        err?.message || "Unable to split this PDF. One or more pages may use an unsupported PDF feature.",
        "error"
      );
      toast("PDF split failed.", "error");
    } finally {
      isProcessing = false;
      clearAllBtn.disabled = !currentFile;
      changePdfBtn.disabled = false;
      modeCards.forEach((c) => (c.disabled = false));
      updateSplitButtonState();
    }
  }

  /* ---------- Render Results Dashboard ---------- */
  function renderResultsDashboard(modeTitle, baseDocSlug) {
    if (!resultPanel || !outputListEl) return;

    resOrigName.textContent = currentFile?.name || "document.pdf";
    resOrigPages.textContent = totalPages === 1 ? "1 page" : `${totalPages} pages`;
    resModeUsed.textContent = modeTitle;
    resOutCount.textContent = `${generatedOutputs.length} ${generatedOutputs.length === 1 ? "PDF" : "PDFs"}`;

    resultSub.textContent =
      generatedOutputs.length === 1
        ? "Customize the output filename if desired and download your extracted PDF."
        : "Download individual split PDFs below or package all generated files into a single ZIP archive.";

    outputListEl.innerHTML = "";

    generatedOutputs.forEach((item) => {
      const li = document.createElement("li");
      li.className = "sp-output-row";

      const info = document.createElement("div");
      info.className = "sp-output-info";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "sp-output-name-input";
      nameInput.value = item.filename;
      nameInput.setAttribute("aria-label", `Filename for ${item.pageDesc}`);
      nameInput.addEventListener("input", () => {
        item.filename = sanitizeFilename(nameInput.value, item.filename);
      });
      nameInput.addEventListener("blur", () => {
        nameInput.value = item.filename;
      });

      const meta = document.createElement("span");
      meta.className = "sp-output-meta";
      meta.textContent = `${item.pageDesc} (${item.pageCount} ${item.pageCount === 1 ? "page" : "pages"}) · ${fmtBytes(item.size)}`;

      info.append(nameInput, meta);

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "btn primary";
      dlBtn.style.minHeight = "36px";
      dlBtn.style.padding = "0 14px";
      dlBtn.style.fontSize = "13px";
      dlBtn.textContent = "Download PDF";
      dlBtn.addEventListener("click", () => {
        const finalName = sanitizeFilename(nameInput.value, item.filename);
        item.filename = finalName;
        nameInput.value = finalName;
        triggerBlobDownload(item.url, finalName, "application/pdf");
        toast(`Downloading ${finalName}`);
      });

      li.append(info, dlBtn);
      outputListEl.appendChild(li);
    });

    // Show "Download All as ZIP" when multiple PDFs were produced
    if (downloadZipBtn) {
      downloadZipBtn.hidden = generatedOutputs.length < 2;
      downloadZipBtn.disabled = generatedOutputs.length < 2;
      downloadZipBtn.dataset.zipName = `${baseDocSlug}-split.zip`;
    }

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

  async function downloadAllAsZip() {
    if (generatedOutputs.length < 2) return;
    if (!window.JSZip) {
      showAlert("ZIP packaging library (JSZip) is unavailable. Download individual PDFs instead.", "error");
      return;
    }

    downloadZipBtn.disabled = true;
    const origText = downloadZipBtn.textContent;
    downloadZipBtn.textContent = "Creating ZIP...";

    try {
      const zip = new window.JSZip();
      const usedNames = new Set();

      for (const item of generatedOutputs) {
        let fname = sanitizeFilename(item.filename, `part-${item.id}.pdf`);
        if (usedNames.has(fname.toLowerCase())) {
          fname = fname.replace(/\.pdf$/i, `-${item.id}.pdf`);
        }
        usedNames.add(fname.toLowerCase());
        zip.file(fname, item.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const zipFilename = downloadZipBtn.dataset.zipName || DEFAULT_ZIP_NAME;
      triggerBlobDownload(zipUrl, zipFilename, "application/zip");
      setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      toast(`Downloaded ${zipFilename}`);
    } catch (err) {
      showAlert(err?.message || "Unable to create ZIP archive.", "error");
    } finally {
      downloadZipBtn.disabled = false;
      downloadZipBtn.textContent = origText;
    }
  }

  /* ---------- Reset Tool Completely ---------- */
  async function resetAll(clearAlerts = true) {
    revokeOutputUrls();
    await destroyPdfJsDoc();
    currentFile = null;
    pdfBytes = null;
    totalPages = 0;
    selectedPages = new Set();
    currentBatch = 0;

    if (clearAlerts) showAlert("");
    dropzone.hidden = false;
    docHeader.hidden = true;
    modesSection.hidden = true;
    gridSection.hidden = true;
    compatNote.hidden = true;
    progressPanel.hidden = true;
    actionBar.hidden = true;
    resultPanel.hidden = true;
    pageGridEl.innerHTML = "";
    if (pageSelectInput) pageSelectInput.value = "";
    if (rangeInput) rangeInput.value = "";
    clearAllBtn.disabled = true;
    splitBtn.disabled = true;
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

  // Apply typed page selection ("1-5, 8, 10-12")
  const applyTypedSelection = () => {
    if (!totalPages) return;
    const parsed = parseSelectionExpression(pageSelectInput?.value || "", totalPages);
    if (!parsed.ok) {
      showAlert(parsed.error, "error");
      return;
    }
    showAlert("");
    selectedPages = new Set(parsed.pages);
    syncSelectionUI({ updateInput: true });
    toast(`Selected ${parsed.pages.length} ${parsed.pages.length === 1 ? "page" : "pages"}.`);
  };

  applySelectBtn?.addEventListener("click", applyTypedSelection);
  pageSelectInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyTypedSelection();
    }
  });

  rangeInput?.addEventListener("input", () => {
    showAlert("");
    updateModePreviews();
    updateSplitButtonState();
  });

  partsCountInput?.addEventListener("input", () => {
    showAlert("");
    updateModePreviews();
    updateSplitButtonState();
  });

  // Quick Actions
  btnSelectAll?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages = new Set();
    for (let p = 1; p <= totalPages; p++) selectedPages.add(p);
    syncSelectionUI({ updateInput: true });
  });

  btnDeselectAll?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages.clear();
    syncSelectionUI({ updateInput: true });
  });

  btnClearSel?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    selectedPages.clear();
    showAlert("");
    syncSelectionUI({ updateInput: true });
  });

  btnReverseSel?.addEventListener("click", () => {
    if (!totalPages || isProcessing) return;
    const next = new Set();
    for (let p = 1; p <= totalPages; p++) {
      if (!selectedPages.has(p)) next.add(p);
    }
    selectedPages = next;
    syncSelectionUI({ updateInput: true });
  });

  btnQuickExtract?.addEventListener("click", () => {
    if (!isProcessing) setMode("extract");
  });

  btnQuickEvery?.addEventListener("click", () => {
    if (!isProcessing) setMode("every");
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

  splitBtn.addEventListener("click", executeSplit);
  downloadZipBtn?.addEventListener("click", downloadAllAsZip);

  clearAllBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetAll(true);
      toast("PDF Splitter cleared.");
    }
  });

  resetResultBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetAll(true);
      toast("PDF Splitter reset.");
    }
  });

  splitAnotherBtn?.addEventListener("click", () => {
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
