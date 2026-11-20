(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});
  const CoordinateMapper = NS.CoordinateMapper;
  const DocumentAnalyzer = NS.DocumentAnalyzer;
  const DetectionOverlay = NS.DetectionOverlay;
  const ReviewPanel = NS.ReviewPanel;

  if (CoordinateMapper) {
    window.__openSignCoordMapper = CoordinateMapper;
  }

  function initSmartSign() {
    const bridge = window.__openSignBridge;
    const btn = document.getElementById("smartSignBtn");
    if (!bridge || !btn || !DocumentAnalyzer || !DetectionOverlay || !ReviewPanel) return;

    const analyzer = new DocumentAnalyzer();
    let state = "idle";
    let guidedCursor = -1;

    const setBtnActive = (on) => btn.classList.toggle("ss-active", !!on);

    const panel = new ReviewPanel({
      onCancelAnalysis: () => {
        analyzer.cancel();
        resetSmartSign();
        bridge.toast("Smart Sign analysis cancelled.");
      },

      onConfirmAll: () => {
        const confirmed = overlay.getFields();
        if (!confirmed.length) return;
        state = "guided";
        guidedCursor = -1;
        overlay.setGuidedFields(confirmed);
        goToNextField();
        bridge.toast("Fields confirmed. Click each field to sign or fill it.");
      },

      onSelectFromList: (id) => {
        overlay.select(id, { scroll: true });
      },

      onRemoveSelected: () => {
        const sel = overlay.getSelectedId();
        if (sel) overlay.removeField(sel);
      },

      onStartAddField: (type) => {
        overlay.setAddingType(type);
        panel.renderReview(overlay.getFields(), overlay.getSelectedId(), type);
        if (type) {
          bridge.toast(`Click anywhere on a page to place a ${type} field.`);
        }
      },

      onCancelReview: () => {
        resetSmartSign();
      },

      onNextField: () => {
        goToNextField();
      },

      onApproveDetails: (info) => {
        const remaining = overlay.getFields().filter((f) => f.status !== "completed");
        let filledCount = 0;

        for (const f of remaining) {
          if (f.type === "name" && info.name) {
            placeTextSlot(f, info.name, false);
            filledCount++;
          } else if (f.type === "initials" && info.initials) {
            placeTextSlot(f, info.initials, false);
            filledCount++;
          } else if (f.type === "date" && info.date) {
            placeTextSlot(f, info.date, false);
            filledCount++;
          }
        }

        if (filledCount > 0) {
          bridge.toast(`Filled ${filledCount} approved ${filledCount === 1 ? "field" : "fields"}.`);
        }
        panel.renderGuided(overlay.getFields(), overlay.getSelectedId());
      },

      onExitGuided: () => {
        resetSmartSign();
      },
    });

    const overlay = new DetectionOverlay({
      getPageEls: () => bridge.getPageEls(),
      goToPage: (p) => bridge.goToPage(p),
      onChange: (fields) => {
        if (state === "review") {
          panel.renderReview(fields, overlay.getSelectedId(), overlay.addingType);
        } else if (state === "guided") {
          panel.renderGuided(fields, overlay.getSelectedId());
        }
      },
      onSelect: (id) => {
        if (state === "review") {
          panel.renderReview(overlay.getFields(), id, overlay.addingType);
        } else if (state === "guided") {
          panel.renderGuided(overlay.getFields(), id);
        }
      },
      onSlotActivate: (field) => {
        activateGuidedSlot(field);
      },
    });

    function resetSmartSign() {
      analyzer.cancel();
      overlay.clear();
      panel.hide();
      state = "idle";
      guidedCursor = -1;
      setBtnActive(false);
    }

    function placeTextSlot(field, initialText, focusText) {
      const wrap = bridge.getPageEls()[field.page];
      if (!wrap) return;
      const dom = CoordinateMapper.normalizedToDom(field, wrap);
      const kind = field.type === "date" ? "date" : "text";
      bridge.placeFieldItem({
        page: field.page,
        kind,
        x: dom.x,
        y: dom.y,
        w: dom.w,
        h: dom.h,
        text: initialText,
        focusText,
      });
      overlay.markCompleted(field.id);
    }

    function activateGuidedSlot(field) {
      const wrap = bridge.getPageEls()[field.page];
      if (!wrap) return;
      const dom = CoordinateMapper.normalizedToDom(field, wrap);

      if (field.type === "signature") {
        if (!bridge.getSignatureDataUrl()) {
          bridge.openSignatureModal(() => {
            overlay.select(field.id, { scroll: true });
            bridge.toast("Signature saved. Click the highlighted signature field to apply it.");
          });
          return;
        }

        bridge.placeFieldItem({
          page: field.page,
          kind: "sig",
          x: dom.x,
          y: dom.y,
          w: dom.w,
          h: dom.h,
        });
        overlay.markCompleted(field.id);
        panel.renderGuided(overlay.getFields(), null);
        return;
      }

      const info = panel.getApprovedInfo();
      let value = "";
      if (info.approved) {
        if (field.type === "name") value = info.name;
        else if (field.type === "initials") value = info.initials;
        else if (field.type === "date") value = info.date;
      }

      placeTextSlot(field, value, !value);
    }

    function goToNextField() {
      const remaining = overlay.getFields().filter((f) => f.status !== "completed");
      if (!remaining.length) {
        panel.renderGuided(overlay.getFields(), null);
        bridge.toast("All confirmed fields are complete. Click Download when ready.");
        return;
      }
      guidedCursor = (guidedCursor + 1) % remaining.length;
      const target = remaining[guidedCursor];
      overlay.select(target.id, { scroll: true });
      panel.renderGuided(overlay.getFields(), target.id);
    }

    async function startSmartSign() {
      const pdfBytes = bridge.getPdfBytes();
      if (!pdfBytes) return;

      if (state === "analyzing") return;
      if (state === "review" || state === "guided") {
        resetSmartSign();
        return;
      }

      bridge.clearSelection();
      state = "analyzing";
      setBtnActive(true);
      panel.showProgress("Reading document...", 0.06);

      try {
        const result = await analyzer.analyze(pdfBytes, {
          onProgress: ({ message, progress }) => {
            if (state === "analyzing") {
              panel.showProgress(message, progress);
            }
          },
        });

        if (state !== "analyzing") return;

        if (result.hadOcrErrors) {
          bridge.toast("Local OCR could not read one or more scanned pages. You can still place fields manually.", "error");
        }

        if (!result.fields.length) {
          resetSmartSign();
          bridge.toast("No signature fields were detected. You can place fields manually using the toolbar.");
          return;
        }

        state = "review";
        overlay.setReviewFields(result.fields);
        overlay.select(result.fields[0].id, { scroll: true });
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("[Smart Sign]", err);
        resetSmartSign();
        bridge.toast(err?.message || "Smart Sign could not analyse this PDF. Please sign manually.", "error");
      }
    }

    btn.addEventListener("click", startSmartSign);

    window.addEventListener("opensign:document-closed", resetSmartSign);
    window.addEventListener("opensign:document-loaded", resetSmartSign);

    document.addEventListener("keydown", (e) => {
      if (state !== "review") return;
      if (document.querySelector("dialog[open]")) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        if (overlay.addingType) {
          overlay.setAddingType(null);
          panel.renderReview(overlay.getFields(), overlay.getSelectedId(), null);
        } else {
          overlay.select(null);
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && overlay.getSelectedId()) {
        e.preventDefault();
        overlay.removeField(overlay.getSelectedId());
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSmartSign, { once: true });
  } else {
    initSmartSign();
  }
})(typeof self !== "undefined" ? self : window);
