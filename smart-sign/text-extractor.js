(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const MIN_TEXT_CHARS_FOR_NATIVE = 15;
  let tesseractScriptPromise = null;

  function loadTesseractLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractScriptPromise) return tesseractScriptPromise;

    tesseractScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = () =>
        window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract failed to initialize."));
      s.onerror = () => reject(new Error("Unable to load local OCR engine (Tesseract.js)."));
      document.head.appendChild(s);
    });
    return tesseractScriptPromise;
  }

  function multiplyTransform(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  }

  function applyPoint(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  async function extractVectorGeometry(page, viewport) {
    const CoordinateMapper = NS.CoordinateMapper;
    const lines = [];
    const boxes = [];
    const OPS = window.pdfjsLib.OPS;

    let opList;
    try {
      opList = await page.getOperatorList();
    } catch (_) {
      return { lines, boxes };
    }

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let curX = 0;
    let curY = 0;

    const pushSegment = (x1, y1, x2, y2) => {
      const [px1, py1] = applyPoint(ctm, x1, y1);
      const [px2, py2] = applyPoint(ctm, x2, y2);
      const p1 = CoordinateMapper.pdfPointToNormalized(px1, py1, viewport);
      const p2 = CoordinateMapper.pdfPointToNormalized(px2, py2, viewport);
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      if (dx >= 0.06 && dy <= 0.008) {
        lines.push({
          x: Math.min(p1.x, p2.x),
          y: (p1.y + p2.y) / 2,
          width: dx,
          height: Math.max(0.002, dy),
          source: "vector",
        });
      }
    };

    const pushRect = (rx, ry, rw, rh) => {
      const [px1, py1] = applyPoint(ctm, rx, ry);
      const [px2, py2] = applyPoint(ctm, rx + rw, ry + rh);
      const norm = CoordinateMapper.pdfRectToNormalized([px1, py1, px2, py2], viewport);
      if (norm.width >= 0.06 && norm.height <= 0.009) {
        lines.push({ ...norm, source: "vector-rect" });
      } else if (norm.width >= 0.05 && norm.width <= 0.85 && norm.height >= 0.016 && norm.height <= 0.16) {
        boxes.push({ ...norm, source: "vector-box" });
      }
    };

    const { fnArray, argsArray } = opList;
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && args && args.length === 6) {
        ctm = multiplyTransform(ctm, args);
      } else if (fn === OPS.moveTo && args) {
        curX = args[0];
        curY = args[1];
      } else if (fn === OPS.lineTo && args) {
        pushSegment(curX, curY, args[0], args[1]);
        curX = args[0];
        curY = args[1];
      } else if (fn === OPS.rectangle && args) {
        pushRect(args[0], args[1], args[2], args[3]);
      } else if (fn === OPS.constructPath && args && args.length >= 2) {
        const ops = args[0];
        const vals = args[1];
        let vi = 0;
        for (let j = 0; j < ops.length; j++) {
          const sub = ops[j];
          if (sub === OPS.moveTo) {
            curX = vals[vi++];
            curY = vals[vi++];
          } else if (sub === OPS.lineTo) {
            const nx = vals[vi++];
            const ny = vals[vi++];
            pushSegment(curX, curY, nx, ny);
            curX = nx;
            curY = ny;
          } else if (sub === OPS.curveTo) {
            vi += 4;
            curX = vals[vi++];
            curY = vals[vi++];
          } else if (sub === OPS.curveTo2 || sub === OPS.curveTo3) {
            vi += 2;
            curX = vals[vi++];
            curY = vals[vi++];
          } else if (sub === OPS.rectangle) {
            const rx = vals[vi++];
            const ry = vals[vi++];
            const rw = vals[vi++];
            const rh = vals[vi++];
            pushRect(rx, ry, rw, rh);
          }
        }
      }
    }

    return { lines, boxes };
  }

  async function extractFormWidgets(page, viewport) {
    const CoordinateMapper = NS.CoordinateMapper;
    const widgets = [];
    let annots = [];
    try {
      annots = await page.getAnnotations();
    } catch (_) {
      return widgets;
    }

    for (const a of annots) {
      if (a.subtype !== "Widget" || !a.rect) continue;
      const ft = a.fieldType;
      if (ft !== "Sig" && ft !== "Tx") continue;
      const box = CoordinateMapper.pdfRectToNormalized(a.rect, viewport);
      if (box.width < 0.02 || box.height < 0.01) continue;
      widgets.push({
        ...box,
        fieldType: ft,
        fieldName: (a.fieldName || "").trim(),
        altText: (a.alternativeText || "").trim(),
        readOnly: !!a.readOnly,
      });
    }
    return widgets;
  }

  function detectCanvasHorizontalLines(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    const lines = [];
    const minRunPx = Math.floor(w * 0.09);

    for (let y = 2; y < h - 2; y += 2) {
      let runStart = -1;
      let gap = 0;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const luma = img[idx] * 0.299 + img[idx + 1] * 0.587 + img[idx + 2] * 0.114;
        const dark = luma < 165;
        if (dark) {
          if (runStart === -1) runStart = x;
          gap = 0;
        } else if (runStart !== -1) {
          gap++;
          if (gap > 3) {
            const runLen = x - gap - runStart;
            if (runLen >= minRunPx) {
              lines.push({
                x: runStart / w,
                y: y / h,
                width: runLen / w,
                height: 0.003,
                source: "ocr-line",
              });
            }
            runStart = -1;
            gap = 0;
          }
        }
      }
      if (runStart !== -1 && w - runStart >= minRunPx) {
        lines.push({
          x: runStart / w,
          y: y / h,
          width: (w - runStart) / w,
          height: 0.003,
          source: "ocr-line",
        });
      }
    }

    const merged = [];
    for (const ln of lines) {
      const prev = merged.find(
        (m) => Math.abs(m.y - ln.y) < 0.008 && Math.abs(m.x - ln.x) < 0.03 && Math.abs(m.width - ln.width) < 0.05
      );
      if (!prev) merged.push(ln);
    }
    return merged;
  }

  async function extractPageWithOcr(page, pageIndex, totalPages, ocrHolder, signal, onProgress) {
    const CoordinateMapper = NS.CoordinateMapper;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress?.({
      stage: "ocr",
      message: `Running local OCR on page ${pageIndex + 1} of ${totalPages}...`,
      progress: 0.15 + ((pageIndex + 0.3) / totalPages) * 0.55,
    });

    const baseVp = page.getViewport({ scale: 1 });
    const maxDim = 2000;
    const scale = Math.min(2.0, maxDim / Math.max(baseVp.width, baseVp.height));
    const vp = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const scannedLines = detectCanvasHorizontalLines(canvas);
    const items = [];

    try {
      const Tesseract = await loadTesseractLibrary();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (!ocrHolder.worker) {
        ocrHolder.worker = await Tesseract.createWorker("eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text" && typeof m.progress === "number") {
              const pct = Math.round(m.progress * 100);
              onProgress?.({
                stage: "ocr",
                message: `Running local OCR on page ${pageIndex + 1} of ${totalPages} (${pct}%)...`,
                progress: 0.15 + ((pageIndex + m.progress) / totalPages) * 0.55,
              });
            }
          },
        });
      }

      const { data } = await ocrHolder.worker.recognize(canvas);
      const words = data?.words || [];
      for (const w of words) {
        const text = (w.text || "").trim();
        if (!text || (w.confidence != null && w.confidence < 25)) continue;
        const box = CoordinateMapper.ocrBoxToNormalized(w.bbox, canvas.width, canvas.height);
        items.push({
          text,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          fontSize: box.height,
          source: "ocr",
        });
      }
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      console.warn(`[Smart Sign] OCR failed on page ${pageIndex + 1}:`, err);
      return { items: [], lines: scannedLines, ocrFailed: true };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }

    return { items, lines: scannedLines, ocrFailed: false };
  }

  NS.extractDocumentPages = async function extractDocumentPages(pdfBytes, { signal, onProgress } = {}) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js is not loaded.");

    onProgress?.({ stage: "reading", message: "Reading document...", progress: 0.05 });

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
    } catch (err) {
      if (err?.name === "PasswordException") {
        throw Object.assign(new Error("This PDF is encrypted or password-protected."), { code: "ENCRYPTED" });
      }
      throw Object.assign(new Error("Unsupported or unreadable PDF document."), { code: "UNSUPPORTED" });
    }

    const totalPages = pdf.numPages;
    const pagesData = [];
    const ocrHolder = { worker: null };
    let hadScannedPages = false;
    let hadOcrErrors = false;

    const cleanupOcr = async () => {
      if (ocrHolder.worker) {
        const w = ocrHolder.worker;
        ocrHolder.worker = null;
        try {
          await w.terminate();
        } catch (_) {}
      }
    };

    const onAbort = () => {
      cleanupOcr();
      try {
        pdf.destroy?.();
      } catch (_) {}
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      for (let i = 1; i <= totalPages; i++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        onProgress?.({
          stage: "extracting",
          message: `Analysing page ${i} of ${totalPages}...`,
          progress: 0.1 + ((i - 1) / totalPages) * 0.55,
        });

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const { lines, boxes } = await extractVectorGeometry(page, viewport);
        const widgets = await extractFormWidgets(page, viewport);

        const items = [];
        let alphaNumCount = 0;

        for (const raw of textContent.items) {
          const str = raw.str;
          if (!str || !str.trim()) continue;
          alphaNumCount += (str.match(/[a-zA-Z0-9]/g) || []).length;

          const tx = pdfjsLib.Util.transform(viewport.transform, raw.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(raw.height) || 10;
          const itemWidth = Math.abs(raw.width) || fontHeight * str.length * 0.5;
          const vx = tx[4];
          const vy = tx[5] - fontHeight * 0.85;

          const vw = viewport.width || 1;
          const vh = viewport.height || 1;
          const x = Math.min(1, Math.max(0, vx / vw));
          const y = Math.min(1, Math.max(0, vy / vh));
          const width = Math.min(1 - x, Math.max(0.002, itemWidth / vw));
          const height = Math.min(1 - y, Math.max(0.004, fontHeight / vh));

          items.push({
            text: str,
            x,
            y,
            width,
            height,
            fontSize: height,
            source: "pdf",
          });
        }

        let isScanned = false;
        let combinedLines = lines;

        if (alphaNumCount < MIN_TEXT_CHARS_FOR_NATIVE && widgets.length === 0) {
          isScanned = true;
          hadScannedPages = true;
          const ocrRes = await extractPageWithOcr(page, i - 1, totalPages, ocrHolder, signal, onProgress);
          if (ocrRes.ocrFailed) hadOcrErrors = true;
          items.push(...ocrRes.items);
          combinedLines = lines.concat(ocrRes.lines);
        }

        pagesData.push({
          pageIndex: i - 1,
          width: viewport.width,
          height: viewport.height,
          rotation: page.rotate || 0,
          isScanned,
          items,
          lines: combinedLines,
          boxes,
          widgets,
        });

        page.cleanup?.();
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      await cleanupOcr();
      try {
        await pdf.destroy?.();
      } catch (_) {}
    }

    return {
      totalPages,
      pages: pagesData,
      hadScannedPages,
      hadOcrErrors,
    };
  };
})(typeof self !== "undefined" ? self : window);
