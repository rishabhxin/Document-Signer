(function (root) {
  "use strict";
  const isWorker =
    typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;

  if (isWorker && typeof importScripts === "function") {
    importScripts(
      "./text-normalizer.js",
      "./signer-detector.js",
      "./signature-detector.js",
      "./date-detector.js",
      "./name-detector.js",
      "./initials-detector.js",
      "./confidence-engine.js",
      "./field-validator.js"
    );
  }

  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  function detectSinglePage(rawPage, totalPages) {
    const normalized = NS.normalizePageData(rawPage);
    const signerCtx = NS.detectSignersForPage(normalized);

    const sigs = NS.detectSignatureFields(normalized);
    const dates = NS.detectDateFields(normalized);
    const names = NS.detectNameFields(normalized);
    const initials = NS.detectInitialsFields(normalized);

    const combined = [...sigs, ...dates, ...names, ...initials].map((cand) => ({
      ...cand,
      signer: NS.assignSignerToField(cand, signerCtx),
    }));

    return NS.scoreFields(combined, normalized, totalPages);
  }

  NS.runDetectionPipeline = function runDetectionPipeline(extractedDoc, onProgress) {
    const { pages, totalPages } = extractedDoc;
    const allScored = [];

    onProgress?.({ stage: "detecting", message: "Detecting signature fields...", progress: 0.72 });

    for (let i = 0; i < pages.length; i++) {
      if (i === Math.floor(pages.length / 2)) {
        onProgress?.({ stage: "detecting", message: "Checking date and name fields...", progress: 0.84 });
      }
      allScored.push(...detectSinglePage(pages[i], totalPages));
    }

    onProgress?.({ stage: "preparing", message: "Preparing suggestions...", progress: 0.94 });
    return NS.validateAndDeduplicate(allScored);
  };

  NS.runDetectionPipelineAsync = async function runDetectionPipelineAsync(extractedDoc, onProgress, signal) {
    const { pages, totalPages } = extractedDoc;
    const allScored = [];

    onProgress?.({ stage: "detecting", message: "Detecting signature fields...", progress: 0.72 });

    for (let i = 0; i < pages.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (i === Math.floor(pages.length / 2)) {
        onProgress?.({ stage: "detecting", message: "Checking date and name fields...", progress: 0.84 });
      }
      allScored.push(...detectSinglePage(pages[i], totalPages));
      await new Promise((r) => setTimeout(r, 0));
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onProgress?.({ stage: "preparing", message: "Preparing suggestions...", progress: 0.94 });
    return NS.validateAndDeduplicate(allScored);
  };

  if (isWorker) {
    self.onmessage = function (event) {
      const { type, payload } = event.data || {};
      if (type !== "analyze") return;
      try {
        const fields = NS.runDetectionPipeline(payload, (progress) => {
          self.postMessage({ type: "progress", payload: progress });
        });
        self.postMessage({ type: "result", payload: { fields } });
      } catch (err) {
        self.postMessage({
          type: "error",
          payload: { message: err?.message || "Document analysis failed." },
        });
      }
    };
  }
})(typeof self !== "undefined" ? self : window);
