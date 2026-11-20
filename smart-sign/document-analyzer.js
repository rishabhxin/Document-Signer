(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  class DocumentAnalyzer {
    constructor() {
      this.abortController = null;
      this.worker = null;
    }

    cancel() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.terminateWorker();
    }

    terminateWorker() {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
    }

    destroy() {
      this.cancel();
    }

    canUseWorker() {
      if (typeof Worker === "undefined") return false;
      const proto = window.location?.protocol || "";
      return proto === "http:" || proto === "https:";
    }

    runWorkerDetection(extractedDoc, onProgress, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          return reject(new DOMException("Aborted", "AbortError"));
        }

        let worker;
        try {
          worker = new Worker("smart-sign/analysis-worker.js");
        } catch (err) {
          return reject(Object.assign(err, { workerUnavailable: true }));
        }

        this.worker = worker;

        const onAbort = () => {
          this.terminateWorker();
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        worker.onmessage = (e) => {
          const { type, payload } = e.data || {};
          if (type === "progress") {
            onProgress?.(payload);
          } else if (type === "result") {
            signal?.removeEventListener("abort", onAbort);
            this.terminateWorker();
            resolve(payload.fields);
          } else if (type === "error") {
            signal?.removeEventListener("abort", onAbort);
            this.terminateWorker();
            reject(new Error(payload?.message || "Worker analysis error."));
          }
        };

        worker.onerror = (err) => {
          signal?.removeEventListener("abort", onAbort);
          this.terminateWorker();
          reject(Object.assign(new Error(err.message || "Worker failed."), { workerUnavailable: true }));
        };

        worker.postMessage({ type: "analyze", payload: extractedDoc });
      });
    }

    async analyze(pdfBytes, { onProgress } = {}) {
      this.cancel();
      this.abortController = new AbortController();
      const { signal } = this.abortController;

      const extracted = await NS.extractDocumentPages(pdfBytes, { signal, onProgress });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      let fields;
      if (this.canUseWorker()) {
        try {
          fields = await this.runWorkerDetection(extracted, onProgress, signal);
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          if (err?.workerUnavailable) {
            fields = await NS.runDetectionPipelineAsync(extracted, onProgress, signal);
          } else {
            throw err;
          }
        }
      } else {
        fields = await NS.runDetectionPipelineAsync(extracted, onProgress, signal);
      }

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      onProgress?.({ stage: "done", message: "Suggestions ready.", progress: 1 });
      return {
        fields,
        totalPages: extracted.totalPages,
        hadScannedPages: extracted.hadScannedPages,
        hadOcrErrors: extracted.hadOcrErrors,
      };
    }
  }

  NS.DocumentAnalyzer = DocumentAnalyzer;
})(typeof self !== "undefined" ? self : window);
