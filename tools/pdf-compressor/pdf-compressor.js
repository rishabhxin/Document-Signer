(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Configure PDF.js worker
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const MAX_FILE_BYTES = 100 * 1024 * 1024; // Configurable 100 MB browser limit
  const LARGE_FILE_WARN_BYTES = 35 * 1024 * 1024;
  const MAX_CANVAS_SIDE = 2400; // Guard browser canvas memory
  const DEFAULT_OUTPUT_NAME = "opensign-compressed-document.pdf";

  const PRESETS = {
    low: {
      id: "low",
      title: "Low Compression",
      label: "Best Quality",
      quality: 0.9,
      maxDpi: 200,
    },
    medium: {
      id: "medium",
      title: "Medium Compression",
      label: "Recommended",
      quality: 0.75,
      maxDpi: 150,
    },
    high: {
      id: "high",
      title: "High Compression",
      label: "Smallest File",
      quality: 0.55,
      maxDpi: 100,
    },
  };

  // DOM References
  const fileInput = $("pcFileInput");
  const dropzone = $("pcDropzone");
  const alertBox = $("pcAlert");
  const alertMsg = $("pcAlertMsg");
  const alertClose = $("pcAlertClose");

  const fileCard = $("pcFileCard");
  const thumbCanvas = $("pcThumbCanvas");
  const thumbFallback = $("pcThumbFallback");
  const fileNameEl = $("pcFileName");
  const fileStatusBadge = $("pcFileStatus");
  const fileSizeEl = $("pcFileSize");
  const filePagesEl = $("pcFilePages");
  const fileDimsEl = $("pcFileDims");
  const fileTypeEl = $("pcFileType");
  const analysisTagsEl = $("pcAnalysisTags");
  const replaceFileBtn = $("pcReplaceFileBtn");

  const settingsSection = $("pcSettingsSection");
  const presetCards = Array.from(document.querySelectorAll(".pc-preset-card"));
  const preserveTextCheck = $("pcPreserveTextOnly");
  const compatWarning = $("pcCompatWarning");
  const compatWarningText = $("pcCompatWarningText");

  const progressPanel = $("pcProgressPanel");
  const progressMsg = $("pcProgressMsg");
  const progressMeta = $("pcProgressMeta");
  const progressFill = $("pcProgressFill");

  const actionBar = $("pcActionBar");
  const resetBtn = $("pcResetBtn");
  const compressBtn = $("pcCompressBtn");
  const compressBtnLabel = $("pcCompressBtnLabel");

  const resultPanel = $("pcResultPanel");
  const resultTitle = $("pcResultTitle");
  const resultSub = $("pcResultSub");
  const resultMethodPill = $("pcResultMethod");
  const resOrigSize = $("pcResOrigSize");
  const resOrigName = $("pcResOrigName");
  const resCompSize = $("pcResCompSize");
  const resCompName = $("pcResCompName");
  const resSavedVal = $("pcResSavedVal");
  const resSavedPct = $("pcResSavedPct");
  const barOrigLabel = $("pcBarOrigLabel");
  const barCompLabel = $("pcBarCompLabel");
  const barCompFill = $("pcBarCompFill");
  const customNameInput = $("pcCustomFileName");
  const downloadCompBtn = $("pcDownloadCompBtn");
  const downloadOrigBtn = $("pcDownloadOrigBtn");
  const compressAnotherBtn = $("pcCompressAnotherBtn");
  const resetResultBtn = $("pcResetResultBtn");

  if (!fileInput || !dropzone || !compressBtn) return;

  // Strictly volatile in-memory state (zero web storage persistence)
  let currentFile = null;
  let originalBytes = null;
  let analysis = null;
  let selectedLevel = "medium";
  let isProcessing = false;
  let compressedBlobUrl = null;
  let originalBlobUrl = null;
  let lastResult = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fmtBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    if (b >= 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
    return `${b} B`;
  }

  function sanitizeFilename(raw) {
    let clean = String(raw || "")
      .trim()
      .replace(/[<>:\x22/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+|\.+$/g, "");
    if (!clean) clean = DEFAULT_OUTPUT_NAME;
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

  /* ---------- Blob URL Resource Cleanup ---------- */
  function revokeBlobUrls() {
    if (compressedBlobUrl) {
      URL.revokeObjectURL(compressedBlobUrl);
      compressedBlobUrl = null;
    }
    if (originalBlobUrl) {
      URL.revokeObjectURL(originalBlobUrl);
      originalBlobUrl = null;
    }
  }

  window.addEventListener("beforeunload", revokeBlobUrls);

  /* ---------- Compatibility Warning Updater ---------- */
  function updateCompatibilityWarning() {
    if (!compatWarning || !compatWarningText || !analysis) return;

    const structuralOnly = !!preserveTextCheck?.checked;
    const notes = [];

    if (analysis.hasSignatures) {
      notes.push(
        "This PDF appears to contain a digital signature field. Modifying or compressing a digitally signed PDF can invalidate existing cryptographic signatures."
      );
    }

    if (structuralOnly) {
      notes.push(
        "Text & structure preservation is enabled: Open Sign will apply safe structural optimization only (selectable text, hyperlinks, and vectors remain intact, though image-heavy PDFs may see smaller reductions)."
      );
    } else {
      notes.push(
        `When image recompression runs (${PRESETS[selectedLevel].label} — ${Math.round(PRESETS[selectedLevel].quality * 100)}% JPEG, up to ${PRESETS[selectedLevel].maxDpi} DPI), pages are rebuilt as compressed images. This reduces image-heavy PDFs significantly, but flattens selectable text, hyperlinks, interactive forms, and bookmarks.`
      );
      if (analysis.hasForms || analysis.hasLinks) {
        notes.push(
          "Interactive form fields or hyperlinks were detected in this PDF. Enable 'Preserve selectable text & structure only' above if you need to keep them interactive."
        );
      }
    }

    compatWarningText.textContent = notes.join(" ");
    compatWarning.hidden = false;
  }

  /* ---------- Step 1: Analyze Uploaded PDF Locally ---------- */
  async function analyzePdfDocument(bytes) {
    if (!window.pdfjsLib || !window.PDFLib) {
      throw new Error("Required PDF libraries (PDF.js / pdf-lib) failed to load. Please refresh and try again.");
    }

    // 1. Validate with pdf-lib first (catches encryption and structural corruption cleanly)
    const pdfLibDoc = await window.PDFLib.PDFDocument.load(bytes.slice(), {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = pdfLibDoc.getPageCount();
    if (pageCount < 1) {
      throw new Error("This PDF has 0 pages and cannot be compressed.");
    }

    // 2. Inspect pages, text density, embedded images, forms, links, and render Page 1 thumbnail via PDF.js
    const pdfJsDoc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const OPS = window.pdfjsLib.OPS;
    const imageOps = new Set([
      OPS.paintImageXObject,
      OPS.paintJpegXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageXObjectRepeat,
    ]);

    let firstWidthPt = 0;
    let firstHeightPt = 0;
    let firstOrientation = "Portrait";
    let totalTextChars = 0;
    let totalImageDraws = 0;
    let hasForms = false;
    let hasSignatures = false;
    let hasLinks = false;

    // Sample up to first 12 pages evenly for fast analysis without blocking UI
    const sampleIndices = [];
    const maxSample = Math.min(pageCount, 12);
    for (let s = 0; s < maxSample; s++) {
      const idx = Math.min(pageCount, Math.floor((s * pageCount) / maxSample) + 1);
      if (!sampleIndices.includes(idx)) sampleIndices.push(idx);
    }

    try {
      for (const pageNum of sampleIndices) {
        const page = await pdfJsDoc.getPage(pageNum);
        const vp1 = page.getViewport({ scale: 1 });

        if (pageNum === 1) {
          firstWidthPt = Math.round(vp1.width);
          firstHeightPt = Math.round(vp1.height);
          firstOrientation = vp1.width > vp1.height ? "Landscape" : "Portrait";

          // Render crisp Page 1 thumbnail
          if (thumbCanvas) {
            const thumbScale = Math.min(184 / vp1.width, 236 / vp1.height);
            const tvp = page.getViewport({ scale: thumbScale });
            thumbCanvas.width = Math.max(1, Math.ceil(tvp.width));
            thumbCanvas.height = Math.max(1, Math.ceil(tvp.height));
            const tctx = thumbCanvas.getContext("2d", { alpha: false });
            tctx.fillStyle = "#FFFFFF";
            tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
            await page.render({ canvasContext: tctx, viewport: tvp }).promise;
            thumbCanvas.hidden = false;
            if (thumbFallback) thumbFallback.hidden = true;
          }
        }

        // Count text characters
        try {
          const tc = await page.getTextContent();
          for (const it of tc.items || []) {
            totalTextChars += (it.str || "").trim().length;
          }
        } catch (_) {}

        // Count embedded image draw calls
        try {
          const opList = await page.getOperatorList();
          for (let i = 0; i < opList.fnArray.length; i++) {
            if (imageOps.has(opList.fnArray[i])) totalImageDraws++;
          }
        } catch (_) {}

        // Inspect annotations for links, forms, and digital signatures
        try {
          const annots = await page.getAnnotations();
          for (const a of annots || []) {
            if (a.subtype === "Link") hasLinks = true;
            if (a.subtype === "Widget") {
              hasForms = true;
              if (a.fieldType === "Sig") hasSignatures = true;
            }
          }
        } catch (_) {}

        page.cleanup?.();
        await sleep(0);
      }
    } finally {
      try {
        await pdfJsDoc.destroy?.();
      } catch (_) {}
    }

    const avgCharsPerPage = totalTextChars / Math.max(1, sampleIndices.length);
    const avgImagesPerPage = totalImageDraws / Math.max(1, sampleIndices.length);
    const bytesPerPage = bytes.byteLength / pageCount;

    let profile = "Mixed Text & Images";
    let isImageHeavy = false;
    if (avgCharsPerPage < 40 && (avgImagesPerPage >= 0.5 || bytesPerPage > 120 * 1024)) {
      profile = "Scanned / Image-Heavy";
      isImageHeavy = true;
    } else if (avgImagesPerPage >= 1 || bytesPerPage > 260 * 1024) {
      profile = "Image-Rich PDF";
      isImageHeavy = true;
    } else {
      profile = "Text / Vector PDF";
      isImageHeavy = false;
    }

    return {
      pageCount,
      firstWidthPt,
      firstHeightPt,
      firstOrientation,
      avgCharsPerPage,
      totalImageDraws,
      hasForms,
      hasSignatures,
      hasLinks,
      profile,
      isImageHeavy,
    };
  }

  /* ---------- Handle Single File Upload ---------- */
  async function handleUploadedFile(file) {
    if (!file || isProcessing) return;

    const name = file.name || "document.pdf";
    const hasPdfExt = /\.pdf$/i.test(name);
    const mimeOk = !file.type || file.type === "application/pdf" || file.type === "application/x-pdf";

    showAlert("");
    if (!hasPdfExt || !mimeOk) {
      showAlert(`"${name}" is not a supported PDF file. Please upload a valid .pdf document.`, "error");
      return;
    }

    if (file.size === 0) {
      showAlert(`"${name}" is empty (0 bytes). Please upload a valid PDF file.`, "error");
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
    revokeBlobUrls();
    lastResult = null;
    if (resultPanel) resultPanel.hidden = true;
    setProgress("Reading your PDF...", "Validating file signature", 15);

    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);

      if (!hasPdfMagicHeader(bytes)) {
        throw new Error(
          `"${name}" does not have a valid PDF file signature. Make sure it is a genuine PDF and not a renamed image or other file.`
        );
      }

      setProgress("Analyzing document pages...", "Inspecting page count, dimensions & images", 45);
      const info = await analyzePdfDocument(bytes);

      currentFile = file;
      originalBytes = bytes;
      analysis = info;

      // Populate uploaded file card
      fileNameEl.textContent = name;
      fileNameEl.title = name;
      fileSizeEl.textContent = fmtBytes(file.size);
      filePagesEl.textContent = info.pageCount === 1 ? "1 page" : `${info.pageCount} pages`;
      fileDimsEl.textContent = `${info.firstWidthPt} × ${info.firstHeightPt} pt (${info.firstOrientation})`;
      fileTypeEl.textContent = "PDF";
      fileStatusBadge.textContent = "Ready to compress";
      fileStatusBadge.dataset.status = "ready";

      // Populate detected characteristics tags
      analysisTagsEl.innerHTML = "";
      const addTag = (label, warn = false) => {
        const span = document.createElement("span");
        span.className = `pc-analysis-tag${warn ? " is-warn" : ""}`;
        span.textContent = label;
        analysisTagsEl.appendChild(span);
      };
      addTag(info.profile);
      if (info.totalImageDraws > 0) addTag(`${info.totalImageDraws} image object${info.totalImageDraws === 1 ? "" : "s"} sampled`);
      if (info.hasSignatures) addTag("Digital signature detected", true);
      if (info.hasForms) addTag("Interactive forms detected", true);
      if (info.hasLinks) addTag("Hyperlinks detected");

      // Show tool sections
      dropzone.hidden = true;
      fileCard.hidden = false;
      settingsSection.hidden = false;
      actionBar.hidden = false;
      compressBtn.disabled = false;
      resetBtn.disabled = false;
      progressPanel.hidden = true;

      // Set suggested default output filename
      if (customNameInput) customNameInput.value = DEFAULT_OUTPUT_NAME;

      if (file.size > LARGE_FILE_WARN_BYTES) {
        showAlert(
          `Large PDF detected (${fmtBytes(file.size)}). Local browser compression may take extra time depending on your device memory.`,
          "warn"
        );
      }

      updateCompatibilityWarning();
      toast(`Loaded "${name}" (${info.pageCount} ${info.pageCount === 1 ? "page" : "pages"}).`);
    } catch (err) {
      progressPanel.hidden = true;
      resetState(false);
      if (isEncryptedError(err)) {
        showAlert(
          `"${name}" is password-protected or encrypted. Please unlock the PDF first before compressing.`,
          "error"
        );
      } else {
        showAlert(
          err?.message || `"${name}" could not be read. It may be corrupted or use an unsupported PDF format.`,
          "error"
        );
      }
    } finally {
      isProcessing = false;
    }
  }

  /* ---------- Progress Display Helper (Actual Stage & Page Progress Only) ---------- */
  function setProgress(message, meta, pct) {
    if (!progressPanel) return;
    progressPanel.hidden = false;
    if (progressMsg) progressMsg.textContent = message;
    if (progressMeta) progressMeta.textContent = meta || "";
    if (progressFill && typeof pct === "number") {
      progressFill.style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
    }
  }

  /* ---------- Compression Strategy A: Lossless Structural Optimization (pdf-lib) ---------- */
  async function runStructuralOptimization(bytes) {
    const { PDFDocument } = window.PDFLib;
    const src = await PDFDocument.load(bytes.slice(), { ignoreEncryption: false, updateMetadata: false });
    const out = await PDFDocument.create();
    const indices = src.getPageIndices();
    const copied = await out.copyPages(src, indices);
    for (const p of copied) out.addPage(p);

    // Strip redundant non-essential metadata bloat safely while preserving document content
    out.setTitle("");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);
    out.setCreator("Open Sign PDF Compressor");
    out.setProducer("Open Sign");

    return await out.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });
  }

  /* ---------- Compression Strategy B: Page Image Recompression (PDF.js + Canvas + pdf-lib) ---------- */
  function canvasToJpegBytes(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) return reject(new Error("Canvas JPEG encoding failed."));
          try {
            const ab = await blob.arrayBuffer();
            resolve(new Uint8Array(ab));
          } catch (err) {
            reject(err);
          }
        },
        "image/jpeg",
        quality
      );
    });
  }

  async function runImageRecompression(bytes, preset) {
    const { PDFDocument } = window.PDFLib;
    const pdfJsDoc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const totalPages = pdfJsDoc.numPages;
    const outPdf = await PDFDocument.create();
    const targetScaleBase = preset.maxDpi / 72;

    try {
      for (let i = 1; i <= totalPages; i++) {
        setProgress(
          "Optimizing images...",
          `Page ${i} of ${totalPages} · ${preset.label} (${Math.round(preset.quality * 100)}% JPEG, max ${preset.maxDpi} DPI)`,
          15 + (i / totalPages) * 70
        );

        const page = await pdfJsDoc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const maxSideScale = MAX_CANVAS_SIDE / Math.max(vp1.width, vp1.height, 1);
        const renderScale = Math.max(0.5, Math.min(targetScaleBase, maxSideScale));
        const vp = page.getViewport({ scale: renderScale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(vp.width));
        canvas.height = Math.max(1, Math.ceil(vp.height));
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const jpgBytes = await canvasToJpegBytes(canvas, preset.quality);

        // Immediately release canvas backing memory
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup?.();

        const embedded = await outPdf.embedJpg(jpgBytes);
        // Preserve exact visual page width, height, and orientation (portrait / landscape)
        const outPage = outPdf.addPage([vp1.width, vp1.height]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: vp1.width,
          height: vp1.height,
        });

        await sleep(0);
      }
    } finally {
      try {
        await pdfJsDoc.destroy?.();
      } catch (_) {}
    }

    setProgress("Rebuilding your PDF...", `Packaging ${totalPages} optimized ${totalPages === 1 ? "page" : "pages"}`, 90);
    outPdf.setCreator("Open Sign PDF Compressor");
    outPdf.setProducer("Open Sign");
    return await outPdf.save({ useObjectStreams: true, addDefaultPage: false });
  }

  /* ---------- Step 5: Verify Output PDF Integrity ---------- */
  async function verifyCompressedPdf(outBytes, expectedPageCount) {
    if (!outBytes || outBytes.byteLength < 100 || !hasPdfMagicHeader(outBytes)) {
      throw new Error("Compressed output failed PDF header validation.");
    }
    const verified = await window.PDFLib.PDFDocument.load(outBytes.slice(), {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const outPages = verified.getPageCount();
    if (outPages !== expectedPageCount) {
      throw new Error(`Page count mismatch after compression (expected ${expectedPageCount}, got ${outPages}).`);
    }
    return outPages;
  }

  /* ---------- Main Compress Action ---------- */
  async function runCompression() {
    if (isProcessing || !currentFile || !originalBytes || !analysis) return;

    isProcessing = true;
    showAlert("");
    revokeBlobUrls();
    resultPanel.hidden = true;

    const preset = PRESETS[selectedLevel] || PRESETS.medium;
    const structuralOnly = !!preserveTextCheck?.checked;

    compressBtn.disabled = true;
    resetBtn.disabled = true;
    replaceFileBtn.disabled = true;
    presetCards.forEach((c) => (c.disabled = true));
    if (preserveTextCheck) preserveTextCheck.disabled = true;

    fileStatusBadge.textContent = `Compressing (${preset.label})...`;
    fileStatusBadge.dataset.status = "processing";
    compressBtnLabel.innerHTML = `<span class="pc-spinner" aria-hidden="true"></span> Compressing...`;

    try {
      const origSize = originalBytes.byteLength;
      setProgress("Analyzing document pages...", `Selected: ${preset.title} (${preset.label})`, 8);
      await sleep(20);

      // Always test safe lossless structural optimization first
      setProgress("Optimizing structure...", "Rebuilding object streams & pruning unused data", 14);
      let structuralBytes = null;
      try {
        structuralBytes = await runStructuralOptimization(originalBytes);
      } catch (_) {
        structuralBytes = null;
      }

      const structuralSavingsRatio =
        structuralBytes && origSize > 0 ? (origSize - structuralBytes.byteLength) / origSize : -1;

      let chosenBytes = null;
      let methodUsed = "Structural Optimization (Lossless Text & Vectors)";

      // Use structural-only when user requested it, OR in Low mode when text-heavy PDF already saw >= 8% lossless reduction
      const skipRaster =
        structuralOnly ||
        (selectedLevel === "low" && !analysis.isImageHeavy && structuralSavingsRatio >= 0.08);

      if (skipRaster) {
        if (structuralBytes) {
          chosenBytes = structuralBytes;
        } else {
          throw new Error("Unable to structurally optimize this PDF. Try unchecking 'Preserve selectable text only'.");
        }
      } else {
        const rasterBytes = await runImageRecompression(originalBytes, preset);

        // Intelligently pick whichever real output is smaller (never worsen size when structural was smaller!)
        if (structuralBytes && structuralBytes.byteLength < rasterBytes.byteLength) {
          chosenBytes = structuralBytes;
          methodUsed = "Structural Optimization (Smaller than Image Recompression)";
        } else {
          chosenBytes = rasterBytes;
          methodUsed = `Image Recompression (${preset.label} · ${Math.round(preset.quality * 100)}% JPEG, ${preset.maxDpi} DPI)`;
        }
      }

      setProgress("Verifying compressed document...", "Checking PDF structure and page count", 95);
      const verifiedPages = await verifyCompressedPdf(chosenBytes, analysis.pageCount);

      setProgress("Compression complete!", `${verifiedPages} pages verified`, 100);
      await sleep(160);
      progressPanel.hidden = true;

      // Build Blob URLs for download
      originalBlobUrl = URL.createObjectURL(new Blob([originalBytes], { type: "application/pdf" }));
      const compSize = chosenBytes.byteLength;
      const spaceSaved = origSize - compSize;
      const pctSaved = origSize > 0 ? (spaceSaved / origSize) * 100 : 0;
      const reduced = spaceSaved > 0;

      if (reduced) {
        compressedBlobUrl = URL.createObjectURL(new Blob([chosenBytes], { type: "application/pdf" }));
      }

      lastResult = {
        origSize,
        compSize,
        spaceSaved,
        pctSaved,
        reduced,
        methodUsed,
        verifiedPages,
      };

      renderResultDashboard(lastResult);
      fileStatusBadge.textContent = reduced
        ? `Reduced by ${pctSaved.toFixed(1)}%`
        : "Already optimized";
      fileStatusBadge.dataset.status = "ready";
    } catch (err) {
      progressPanel.hidden = true;
      fileStatusBadge.textContent = "Ready to compress";
      fileStatusBadge.dataset.status = "ready";
      showAlert(
        err?.message || "Compression failed for this document. Please try another compression level or file.",
        "error"
      );
      toast("Compression could not be completed.", "error");
    } finally {
      isProcessing = false;
      compressBtn.disabled = !currentFile;
      resetBtn.disabled = !currentFile;
      replaceFileBtn.disabled = false;
      presetCards.forEach((c) => (c.disabled = false));
      if (preserveTextCheck) preserveTextCheck.disabled = false;
      compressBtnLabel.textContent = "Compress PDF";
    }
  }

  /* ---------- Render Results Dashboard (Honest Comparison) ---------- */
  function renderResultDashboard(res) {
    const outName = sanitizeFilename(customNameInput?.value || DEFAULT_OUTPUT_NAME);
    if (customNameInput) customNameInput.value = outName;

    resultPanel.dataset.outcome = res.reduced ? "saved" : "no-savings";
    resultMethodPill.textContent = res.methodUsed;

    resOrigName.textContent = currentFile.name;
    resOrigSize.textContent = fmtBytes(res.origSize);

    if (res.reduced) {
      resultTitle.textContent = `PDF compressed — ${res.pctSaved.toFixed(1)}% smaller`;
      resultSub.textContent = `Verified ${res.verifiedPages} ${res.verifiedPages === 1 ? "page" : "pages"} intact and ready to download.`;
      resCompName.textContent = outName;
      resCompSize.textContent = fmtBytes(res.compSize);
      resSavedVal.textContent = fmtBytes(res.spaceSaved);
      resSavedPct.textContent = `${res.pctSaved.toFixed(1)}% size reduction`;

      const compBarPct = Math.max(4, Math.min(100, (res.compSize / res.origSize) * 100));
      barOrigLabel.textContent = `Original (${fmtBytes(res.origSize)})`;
      barCompLabel.textContent = `Compressed (${fmtBytes(res.compSize)} · ${res.pctSaved.toFixed(1)}% saved)`;
      barCompFill.style.width = `${compBarPct.toFixed(1)}%`;
      barCompFill.classList.add("is-saved");

      downloadCompBtn.hidden = false;
      downloadCompBtn.disabled = false;
      toast(`Compressed PDF saved ${fmtBytes(res.spaceSaved)} (${res.pctSaved.toFixed(1)}%).`);
    } else {
      resultTitle.textContent = "Your PDF is already well-optimized";
      resultSub.textContent =
        "The output file was not smaller than your original PDF (often happens with compact text-only or already compressed PDFs). We recommend keeping your original file or trying a stronger compression level.";
      resCompName.textContent = "Original file retained";
      resCompSize.textContent = fmtBytes(res.origSize);
      resSavedVal.textContent = "0 B";
      resSavedPct.textContent = `Output attempt was ${fmtBytes(res.compSize)} — original is smaller`;

      barOrigLabel.textContent = `Original (${fmtBytes(res.origSize)})`;
      barCompLabel.textContent = `Recompressed attempt (${fmtBytes(res.compSize)} — not smaller)`;
      barCompFill.style.width = "100%";
      barCompFill.classList.remove("is-saved");

      downloadCompBtn.hidden = true;
      downloadCompBtn.disabled = true;
      toast("Original PDF is already smaller — you can download the original or try High Compression.");
    }

    resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- Download & Reset Handlers ---------- */
  function triggerBlobDownload(url, filename) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.type = "application/pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function resetState(clearAlerts = true) {
    revokeBlobUrls();
    currentFile = null;
    originalBytes = null;
    analysis = null;
    lastResult = null;
    if (clearAlerts) showAlert("");

    dropzone.hidden = false;
    fileCard.hidden = true;
    settingsSection.hidden = true;
    actionBar.hidden = true;
    progressPanel.hidden = true;
    resultPanel.hidden = true;
    compatWarning.hidden = true;

    if (thumbCanvas) {
      thumbCanvas.width = 0;
      thumbCanvas.height = 0;
      thumbCanvas.hidden = true;
    }
    if (thumbFallback) thumbFallback.hidden = false;
    if (customNameInput) customNameInput.value = DEFAULT_OUTPUT_NAME;
    compressBtn.disabled = true;
    resetBtn.disabled = true;
  }

  /* ---------- Event Wiring ---------- */
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) handleUploadedFile(f);
  });

  replaceFileBtn?.addEventListener("click", () => {
    if (!isProcessing) fileInput.click();
  });

  presetCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (isProcessing) return;
      selectedLevel = card.dataset.level || "medium";
      presetCards.forEach((c) => c.setAttribute("aria-checked", String(c === card)));
      updateCompatibilityWarning();
    });
  });

  preserveTextCheck?.addEventListener("change", () => {
    updateCompatibilityWarning();
  });

  compressBtn.addEventListener("click", runCompression);

  downloadCompBtn?.addEventListener("click", () => {
    if (!compressedBlobUrl) return;
    const fname = sanitizeFilename(customNameInput?.value || DEFAULT_OUTPUT_NAME);
    if (customNameInput) customNameInput.value = fname;
    if (resCompName) resCompName.textContent = fname;
    triggerBlobDownload(compressedBlobUrl, fname);
    toast(`Downloading ${fname}`);
  });

  downloadOrigBtn?.addEventListener("click", () => {
    if (!originalBlobUrl || !currentFile) return;
    triggerBlobDownload(originalBlobUrl, currentFile.name);
    toast(`Downloading original ${currentFile.name}`);
  });

  customNameInput?.addEventListener("input", () => {
    if (resCompName && lastResult?.reduced) {
      resCompName.textContent = sanitizeFilename(customNameInput.value);
    }
  });

  compressAnotherBtn?.addEventListener("click", () => {
    resetState(true);
    fileInput.click();
  });

  resetBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetState(true);
      toast("PDF Compressor reset.");
    }
  });

  resetResultBtn?.addEventListener("click", () => {
    if (!isProcessing) {
      resetState(true);
      toast("PDF Compressor reset.");
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
  resetState(true);
})();
