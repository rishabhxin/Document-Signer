(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const DEFAULT_OUTPUT_NAME = "opensign-merged-document.pdf";
  const SINGLE_FILE_WARN_BYTES = 50 * 1024 * 1024;
  const TOTAL_WARN_BYTES = 120 * 1024 * 1024;

  const fileInput = $("pmFileInput");
  const dropzone = $("pmDropzone");
  const alertBox = $("pmAlert");
  const alertMsg = $("pmAlertMsg");
  const alertClose = $("pmAlertClose");
  const statusBar = $("pmStatusBar");
  const statFiles = $("pmStatFiles");
  const statPages = $("pmStatPages");
  const statSize = $("pmStatSize");
  const statusPill = $("pmStatusPill");
  const emptyState = $("pmEmptyState");
  const listWrap = $("pmListWrap");
  const fileListEl = $("pmFileList");
  const addMoreBtn = $("pmAddMoreBtn");
  const clearAllBtn = $("pmClearAllBtn");
  const mergeBtn = $("pmMergeBtn");
  const mergeBtnLabel = $("pmMergeBtnLabel");
  const progressPanel = $("pmProgressPanel");
  const progressMsg = $("pmProgressMsg");
  const progressPct = $("pmProgressPct");
  const progressFill = $("pmProgressFill");
  const resultPanel = $("pmResultPanel");
  const resultFileName = $("pmResultFileName");
  const resultPages = $("pmResultPages");
  const resultCount = $("pmResultCount");
  const resultSize = $("pmResultSize");
  const customNameInput = $("pmCustomFileName");
  const downloadMergedBtn = $("pmDownloadMergedBtn");

  if (!fileInput || !dropzone || !fileListEl || !mergeBtn) return;

  // Strictly kept in volatile browser memory only (never persisted to web storage)
  let uploadedDocs = [];
  let nextDocId = 1;
  let isProcessing = false;
  let mergedBlobUrl = null;
  let mergedByteLength = 0;
  let dragSourceIndex = null;

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
  function revokeMergedUrl() {
    if (mergedBlobUrl) {
      URL.revokeObjectURL(mergedBlobUrl);
      mergedBlobUrl = null;
      mergedByteLength = 0;
    }
  }

  function clearResult() {
    revokeMergedUrl();
    if (resultPanel) resultPanel.hidden = true;
  }

  window.addEventListener("beforeunload", revokeMergedUrl);

  /* ---------- Strict Binary PDF Header Signature Check ---------- */
  function hasPdfMagicHeader(uint8) {
    if (!uint8 || uint8.length < 5) return false;
    // PDF specification allows "%PDF-" anywhere within the first 1024 bytes
    const limit = Math.min(uint8.length - 4, 1024);
    for (let i = 0; i <= limit; i++) {
      if (
        uint8[i] === 0x25 && // %
        uint8[i + 1] === 0x50 && // P
        uint8[i + 2] === 0x44 && // D
        uint8[i + 3] === 0x46 && // F
        uint8[i + 4] === 0x2d // -
      ) {
        return true;
      }
    }
    return false;
  }

  function isEncryptedPdfError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return msg.includes("encrypted") || msg.includes("password") || err?.name === "EncryptedPDFError";
  }

  /* ---------- Validate & Inspect a Single Uploaded File ---------- */
  async function inspectPdfFile(file) {
    if (!file) {
      return { ok: false, error: "Invalid file selection." };
    }

    const name = file.name || "document.pdf";
    const hasPdfExt = /\.pdf$/i.test(name);
    const mimeOk = !file.type || file.type === "application/pdf" || file.type === "application/x-pdf";

    if (!hasPdfExt) {
      return { ok: false, error: `"${name}" is not a PDF file. Only .pdf files are supported.` };
    }

    if (file.size === 0) {
      return { ok: false, error: `"${name}" is empty (0 bytes) and cannot be merged.` };
    }

    // Duplicate detection (same name, byte size, and modified timestamp)
    const isDuplicate = uploadedDocs.some(
      (d) => d.name === name && d.size === file.size && d.lastModified === file.lastModified
    );
    if (isDuplicate) {
      return { ok: false, duplicate: true, error: `"${name}" is already in your merge list.` };
    }

    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (_) {
      return { ok: false, error: `Unable to read "${name}" from your device.` };
    }

    const bytes = new Uint8Array(buffer);
    if (!hasPdfMagicHeader(bytes)) {
      return {
        ok: false,
        error: `"${name}" does not contain valid PDF content (file header mismatch). Please upload an authentic PDF document.`,
      };
    }

    if (!mimeOk && !hasPdfMagicHeader(bytes)) {
      return { ok: false, error: `"${name}" has an unsupported file type.` };
    }

    if (!window.PDFLib || !window.PDFLib.PDFDocument) {
      return { ok: false, error: "PDF processing library failed to load. Please refresh and try again." };
    }

    // Parse with pdf-lib to verify structure, encryption, and exact page count
    try {
      const pdfDoc = await window.PDFLib.PDFDocument.load(buffer, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      const pageCount = pdfDoc.getPageCount();
      if (pageCount < 1) {
        return { ok: false, error: `"${name}" contains 0 pages and cannot be merged.` };
      }

      return {
        ok: true,
        doc: {
          id: nextDocId++,
          file,
          name,
          size: file.size,
          lastModified: file.lastModified,
          type: "PDF",
          pageCount,
          status: "Ready",
        },
      };
    } catch (err) {
      if (isEncryptedPdfError(err)) {
        return {
          ok: false,
          error: `"${name}" is password-protected or encrypted. Please unlock it first before merging.`,
        };
      }
      return {
        ok: false,
        error: `"${name}" appears to be corrupted or uses an unsupported PDF structure.`,
      };
    }
  }

  /* ---------- Handle Multiple File Uploads ---------- */
  async function handleFiles(fileList) {
    if (isProcessing) {
      toast("Please wait for the current merge to finish.", "error");
      return;
    }

    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    isProcessing = true;
    showAlert("");
    setStatusPill("Validating files...", "processing");
    updateActionStates();

    const errors = [];
    const warnings = [];
    let addedCount = 0;

    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      setStatusPill(`Inspecting ${i + 1} of ${incoming.length}...`, "processing");
      const res = await inspectPdfFile(f);
      if (res.ok) {
        uploadedDocs.push(res.doc);
        addedCount++;
        if (f.size > SINGLE_FILE_WARN_BYTES) {
          warnings.push(`"${f.name}" is large (${fmtBytes(f.size)}). Browser merging may take a few extra seconds.`);
        }
      } else if (res.duplicate) {
        warnings.push(res.error);
      } else {
        errors.push(res.error);
      }
      // Yield so large batches never freeze the UI
      await sleep(0);
    }

    isProcessing = false;

    if (addedCount > 0) {
      clearResult();
      uploadedDocs.forEach((d) => (d.status = "Ready"));
    }

    const totalSize = uploadedDocs.reduce((s, d) => s + d.size, 0);
    if (totalSize > TOTAL_WARN_BYTES) {
      warnings.push(
        `Total uploaded size is ${fmtBytes(totalSize)}. Merging very large PDFs depends on available device memory.`
      );
    }

    if (errors.length) {
      showAlert(errors.join(" "), "error");
    } else if (warnings.length) {
      showAlert(warnings.join(" "), "warn");
    }

    if (addedCount > 0) {
      toast(`Added ${addedCount} PDF ${addedCount === 1 ? "file" : "files"} to merge queue.`);
    }

    renderList();
  }

  /* ---------- UI Rendering & Reordering ---------- */
  function setStatusPill(text, status) {
    if (!statusPill) return;
    statusPill.textContent = text;
    statusPill.dataset.status = status || "idle";
  }

  function updateStats() {
    const count = uploadedDocs.length;
    const totalPages = uploadedDocs.reduce((s, d) => s + (d.pageCount || 0), 0);
    const totalBytes = uploadedDocs.reduce((s, d) => s + (d.size || 0), 0);

    if (statFiles) statFiles.textContent = String(count);
    if (statPages) statPages.textContent = String(totalPages);
    if (statSize) statSize.textContent = fmtBytes(totalBytes);

    if (!isProcessing) {
      if (mergedBlobUrl) {
        setStatusPill("Merge complete", "merged");
      } else if (count >= 2) {
        setStatusPill("Ready to merge", "ready");
      } else if (count === 1) {
        setStatusPill("Add 1 more PDF", "idle");
      } else {
        setStatusPill("Waiting for files", "idle");
      }
    }
  }

  function updateActionStates() {
    const count = uploadedDocs.length;
    mergeBtn.disabled = isProcessing || count < 2;
    if (clearAllBtn) clearAllBtn.disabled = isProcessing || count === 0;
    if (addMoreBtn) addMoreBtn.disabled = isProcessing;
    if (dropzone) dropzone.classList.toggle("is-compact", count > 0);
    if (emptyState) emptyState.hidden = count > 0;
    if (listWrap) listWrap.hidden = count === 0;
    if (statusBar) statusBar.hidden = false;
  }

  function moveDoc(fromIdx, toIdx) {
    if (isProcessing) return;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= uploadedDocs.length || toIdx >= uploadedDocs.length || fromIdx === toIdx) {
      return;
    }
    const [moved] = uploadedDocs.splice(fromIdx, 1);
    uploadedDocs.splice(toIdx, 0, moved);
    clearResult();
    uploadedDocs.forEach((d) => (d.status = "Ready"));
    renderList();
  }

  function removeDoc(id) {
    if (isProcessing) return;
    const idx = uploadedDocs.findIndex((d) => d.id === id);
    if (idx === -1) return;
    uploadedDocs.splice(idx, 1);
    clearResult();
    uploadedDocs.forEach((d) => (d.status = "Ready"));
    renderList();
  }

  function renderList() {
    fileListEl.innerHTML = "";

    uploadedDocs.forEach((doc, idx) => {
      const li = document.createElement("li");
      li.className = "pm-file-row";
      li.draggable = !isProcessing;
      li.dataset.index = String(idx);

      // Drag handle
      const handle = document.createElement("span");
      handle.className = "pm-drag-handle";
      handle.title = "Drag to reorder";
      handle.setAttribute("aria-hidden", "true");
      handle.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5.5" cy="3.5" r="1.2" /><circle cx="10.5" cy="3.5" r="1.2" />
          <circle cx="5.5" cy="8" r="1.2" /><circle cx="10.5" cy="8" r="1.2" />
          <circle cx="5.5" cy="12.5" r="1.2" /><circle cx="10.5" cy="12.5" r="1.2" />
        </svg>
      `;

      const orderBadge = document.createElement("span");
      orderBadge.className = "pm-order-num";
      orderBadge.textContent = String(idx + 1);
      orderBadge.setAttribute("aria-label", `Position ${idx + 1}`);

      const pdfIcon = document.createElement("span");
      pdfIcon.className = "pm-pdf-icon";
      pdfIcon.setAttribute("aria-hidden", "true");
      pdfIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h5" />
        </svg>
      `;

      const meta = document.createElement("div");
      meta.className = "pm-file-meta";

      const nameEl = document.createElement("div");
      nameEl.className = "pm-file-name";
      nameEl.textContent = doc.name;
      nameEl.title = doc.name;

      const tagsEl = document.createElement("div");
      tagsEl.className = "pm-file-tags";

      const typeBadge = document.createElement("span");
      typeBadge.className = "pm-tag-badge";
      typeBadge.textContent = doc.type;

      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = fmtBytes(doc.size);

      const pagesSpan = document.createElement("span");
      pagesSpan.textContent = doc.pageCount === 1 ? "1 page" : `${doc.pageCount} pages`;

      const statusSpan = document.createElement("span");
      statusSpan.className = "pm-tag-status";
      statusSpan.textContent = doc.status;

      tagsEl.append(typeBadge, sizeSpan, pagesSpan, statusSpan);
      meta.append(nameEl, tagsEl);

      // Reorder & remove controls
      const actions = document.createElement("div");
      actions.className = "pm-row-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "pm-row-btn";
      upBtn.disabled = isProcessing || idx === 0;
      upBtn.setAttribute("aria-label", `Move ${doc.name} up`);
      upBtn.title = "Move up";
      upBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>`;
      upBtn.addEventListener("click", () => moveDoc(idx, idx - 1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "pm-row-btn";
      downBtn.disabled = isProcessing || idx === uploadedDocs.length - 1;
      downBtn.setAttribute("aria-label", `Move ${doc.name} down`);
      downBtn.title = "Move down";
      downBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>`;
      downBtn.addEventListener("click", () => moveDoc(idx, idx + 1));

      const remBtn = document.createElement("button");
      remBtn.type = "button";
      remBtn.className = "pm-row-btn danger";
      remBtn.disabled = isProcessing;
      remBtn.setAttribute("aria-label", `Remove ${doc.name}`);
      remBtn.title = "Remove file";
      remBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>`;
      remBtn.addEventListener("click", () => removeDoc(doc.id));

      actions.append(upBtn, downBtn, remBtn);
      li.append(handle, orderBadge, pdfIcon, meta, actions);

      // HTML5 Drag & Drop Reordering
      li.addEventListener("dragstart", (e) => {
        if (isProcessing) {
          e.preventDefault();
          return;
        }
        dragSourceIndex = idx;
        li.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      });

      li.addEventListener("dragover", (e) => {
        if (dragSourceIndex === null || dragSourceIndex === idx) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        li.classList.add("is-drag-over");
      });

      li.addEventListener("dragleave", () => {
        li.classList.remove("is-drag-over");
      });

      li.addEventListener("drop", (e) => {
        if (dragSourceIndex === null) return;
        e.preventDefault();
        e.stopPropagation();
        li.classList.remove("is-drag-over");
        const from = dragSourceIndex;
        dragSourceIndex = null;
        if (from !== idx) moveDoc(from, idx);
      });

      li.addEventListener("dragend", () => {
        dragSourceIndex = null;
        fileListEl.querySelectorAll(".pm-file-row").forEach((r) => {
          r.classList.remove("is-dragging", "is-drag-over");
        });
      });

      fileListEl.appendChild(li);
    });

    updateStats();
    updateActionStates();
  }

  /* ---------- PDF Merging Engine (100% Client-Side via pdf-lib) ---------- */
  function setProgress(msg, pct) {
    if (!progressPanel) return;
    progressPanel.hidden = false;
    if (progressMsg) progressMsg.textContent = msg;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (progressPct) progressPct.textContent = `${clamped}%`;
    if (progressFill) progressFill.style.width = `${clamped}%`;
  }

  async function mergeUploadedPdfs() {
    if (isProcessing) return;
    if (uploadedDocs.length < 2) {
      showAlert("Please upload at least two valid PDF files to merge.", "warn");
      return;
    }

    if (!window.PDFLib || !window.PDFLib.PDFDocument) {
      showAlert("PDF merging library (pdf-lib) is unavailable. Please reload the page.", "error");
      return;
    }

    isProcessing = true;
    showAlert("");
    clearResult();
    setStatusPill("Merging PDFs...", "processing");

    // Disable controls & show spinner
    mergeBtn.disabled = true;
    mergeBtnLabel.innerHTML = `<span class="pm-spinner" aria-hidden="true"></span> Merging PDFs...`;
    renderList();

    try {
      setProgress("Preparing your documents...", 8);
      await sleep(30);

      const { PDFDocument } = window.PDFLib;
      const mergedPdf = await PDFDocument.create();
      const totalFiles = uploadedDocs.length;
      let totalCopiedPages = 0;

      for (let i = 0; i < totalFiles; i++) {
        const entry = uploadedDocs[i];
        entry.status = "Merging...";
        const pct = 12 + ((i / totalFiles) * 72);
        setProgress(`Merging file ${i + 1} of ${totalFiles}: ${entry.name}`, pct);

        const buffer = await entry.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (!hasPdfMagicHeader(bytes)) {
          throw new Error(`"${entry.name}" failed validation during merge.`);
        }

        const srcPdf = await PDFDocument.load(buffer, {
          ignoreEncryption: false,
          updateMetadata: false,
        });

        const pageIndices = srcPdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);

        for (const page of copiedPages) {
          mergedPdf.addPage(page);
          totalCopiedPages++;
        }

        entry.status = "Merged";
        await sleep(0);
      }

      if (totalCopiedPages < 1) {
        throw new Error("No pages were available to include in the merged PDF.");
      }

      setProgress("Generating final PDF file...", 92);
      await sleep(20);

      mergedPdf.setProducer("Open Sign PDF Merger");
      mergedPdf.setCreator("Open Sign (https://www.opensign.in/tools/pdf-merger/)");
      const mergedBytes = await mergedPdf.save();

      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      revokeMergedUrl();
      mergedBlobUrl = URL.createObjectURL(blob);
      mergedByteLength = blob.size;

      setProgress("Complete!", 100);
      await sleep(160);
      progressPanel.hidden = true;

      // Populate & display result panel
      const defaultName = customNameInput?.value.trim()
        ? sanitizeFilename(customNameInput.value)
        : DEFAULT_OUTPUT_NAME;
      if (customNameInput) customNameInput.value = defaultName;
      if (resultFileName) resultFileName.textContent = defaultName;
      if (resultPages) resultPages.textContent = `${totalCopiedPages} ${totalCopiedPages === 1 ? "page" : "pages"}`;
      if (resultCount) resultCount.textContent = `${totalFiles} PDFs`;
      if (resultSize) resultSize.textContent = fmtBytes(mergedByteLength);
      if (resultPanel) {
        resultPanel.hidden = false;
        resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      toast(`Merged ${totalFiles} PDFs (${totalCopiedPages} pages) successfully.`);
    } catch (err) {
      progressPanel.hidden = true;
      clearResult();
      // Preserve uploaded files & restore Ready status so user can fix or retry
      uploadedDocs.forEach((d) => (d.status = "Ready"));

      const errText = isEncryptedPdfError(err)
        ? "One of the uploaded PDFs is password-protected or encrypted. Remove or unlock it and try again."
        : err?.message || "Unable to merge these PDF files. One of the documents may be corrupted or use an unsupported PDF feature.";
      showAlert(errText, "error");
      toast("PDF merge failed. Your uploaded files were preserved.", "error");
    } finally {
      isProcessing = false;
      mergeBtnLabel.textContent = "Merge PDF";
      renderList();
    }
  }

  /* ---------- Download Merged PDF ---------- */
  function triggerMergedDownload() {
    if (!mergedBlobUrl) {
      toast("Merge your PDFs first before downloading.", "error");
      return;
    }
    const finalName = sanitizeFilename(customNameInput?.value || DEFAULT_OUTPUT_NAME);
    if (customNameInput) customNameInput.value = finalName;
    if (resultFileName) resultFileName.textContent = finalName;

    const a = document.createElement("a");
    a.href = mergedBlobUrl;
    a.download = finalName;
    a.type = "application/pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`Downloading ${finalName}`);
  }

  /* ---------- Event Listeners ---------- */
  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    handleFiles(files);
    e.target.value = "";
  });

  addMoreBtn?.addEventListener("click", () => {
    if (!isProcessing) fileInput.click();
  });

  clearAllBtn?.addEventListener("click", () => {
    if (isProcessing) return;
    uploadedDocs = [];
    clearResult();
    showAlert("");
    if (customNameInput) customNameInput.value = DEFAULT_OUTPUT_NAME;
    renderList();
    toast("All files cleared.");
  });

  mergeBtn.addEventListener("click", mergeUploadedPdfs);
  downloadMergedBtn?.addEventListener("click", triggerMergedDownload);

  customNameInput?.addEventListener("input", () => {
    if (resultFileName) {
      resultFileName.textContent = sanitizeFilename(customNameInput.value);
    }
  });

  // Drag & Drop File Upload onto Dropzone (ignoring internal row drag)
  const isFileDrag = (e) =>
    dragSourceIndex === null &&
    e.dataTransfer &&
    Array.from(e.dataTransfer.types || []).includes("Files");

  let dzDepth = 0;
  dropzone.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dzDepth++;
    dropzone.classList.add("is-over");
  });

  dropzone.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dropzone.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    dzDepth = Math.max(0, dzDepth - 1);
    if (!dzDepth) dropzone.classList.remove("is-over");
  });

  dropzone.addEventListener("drop", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dzDepth = 0;
    dropzone.classList.remove("is-over");
    handleFiles(e.dataTransfer.files);
  });

  // Initial empty state render
  renderList();
})();
