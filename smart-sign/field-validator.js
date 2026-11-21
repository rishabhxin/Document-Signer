(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const MIN_ACTIVE_CONFIDENCE = 60;
  const TYPE_PRIORITY = { signature: 4, date: 3, name: 2, initials: 1 };
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function computeIoU(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    if (x2 <= x1 || y2 <= y1) return 0;
    const inter = (x2 - x1) * (y2 - y1);
    const union = a.width * a.height + b.width * b.height - inter;
    return union > 0 ? inter / union : 0;
  }

  function centersClose(a, b) {
    const acx = a.x + a.width / 2;
    const acy = a.y + a.height / 2;
    const bcx = b.x + b.width / 2;
    const bcy = b.y + b.height / 2;
    return Math.abs(acx - bcx) < 0.06 && Math.abs(acy - bcy) < 0.022;
  }

  function normalizeGeometry(f) {
    const minW = f.type === "initials" ? 0.055 : 0.09;
    const maxW = f.type === "initials" ? 0.16 : 0.5;
    const minH = f.type === "signature" ? 0.026 : 0.018;
    const maxH = f.type === "signature" ? 0.12 : 0.055;

    const width = clamp(f.width, minW, maxW);
    const height = clamp(f.height, minH, maxH);
    const x = clamp(f.x, 0.01, 0.99 - width);
    const y = clamp(f.y, 0.01, 0.99 - height);
    return { x, y, width, height };
  }

  NS.validateAndDeduplicate = function validateAndDeduplicate(scoredFields) {
    const eligible = scoredFields
      .filter((f) => f.confidence >= MIN_ACTIVE_CONFIDENCE)
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0);
      });

    const kept = [];
    for (const cand of eligible) {
      const geom = normalizeGeometry(cand);
      const candidate = { ...cand, ...geom };

      const duplicate = kept.find((k) => {
        if (k.page !== candidate.page) return false;
        const iou = computeIoU(k, candidate);
        if (iou >= 0.35) return true;
        if (k.type === candidate.type && centersClose(k, candidate)) return true;
        return false;
      });

      if (!duplicate) kept.push(candidate);
    }

    kept.sort((a, b) => a.page - b.page || Math.round(a.y * 40) - Math.round(b.y * 40) || a.x - b.x);

    let unnamedSigCount = 0;
    for (const f of kept) {
      if (f.type === "signature" && f.signer === "Signer 1") {
        unnamedSigCount++;
        if (unnamedSigCount > 1) {
          f.signer = `Signer ${unnamedSigCount}`;
        }
      }
    }

    return kept.map((f, idx) => ({
      id: `ss-field-${f.page + 1}-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
      type: f.type,
      page: f.page,
      x: Number(f.x.toFixed(4)),
      y: Number(f.y.toFixed(4)),
      width: Number(f.width.toFixed(4)),
      height: Number(f.height.toFixed(4)),
      confidence: f.confidence,
      signer: f.signer || "Signer 1",
      status: "suggested",
    }));
  };
})(typeof self !== "undefined" ? self : window);
