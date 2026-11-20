(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const STRONG_INITIALS_RE =
    /\b(employee\s+initials?|employer\s+initials?|applicant\s+initials?|tenant\s+initials?|landlord\s+initials?|client\s+initials?|contractor\s+initials?|consultant\s+initials?|buyer\s+initials?|seller\s+initials?|party\s+[ab12]\s+initials?|initial\s+here)\b/i;

  const STANDARD_INITIALS_RE = /^(?:initials?)\s*[:.]?$/i;

  const DEFAULT_W = 0.09;
  const DEFAULT_H = 0.032;

  function computePlacement(seg) {
    const g = seg.geometry;

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.03) {
      const b = seg.inlineBlankBox;
      return {
        x: b.x,
        y: Math.max(0.01, b.y - 0.005),
        width: Math.min(0.14, Math.max(0.07, b.width)),
        height: DEFAULT_H,
        blankType: "inline-underscore",
      };
    }

    if (g.lineRight) {
      const ln = g.lineRight;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.14, Math.max(0.07, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-right",
      };
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.002,
        y: b.y + 0.002,
        width: Math.max(0.06, b.width - 0.004),
        height: Math.max(0.025, b.height - 0.004),
        blankType: "vector-box",
      };
    }

    if (g.lineAbove) {
      const ln = g.lineAbove;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.14, Math.max(0.07, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-above",
      };
    }

    if (g.lineBelow) {
      const ln = g.lineBelow;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.14, Math.max(0.07, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-below",
      };
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.06) {
      return {
        x: seg.x + seg.width + 0.008,
        y: Math.max(0.01, seg.y - 0.004),
        width: Math.min(DEFAULT_W, g.freeSpaceRight - 0.006),
        height: DEFAULT_H,
        blankType: "whitespace-right",
      };
    }

    if (g.freeSpaceAbove >= 0.028) {
      return {
        x: seg.x,
        y: Math.max(0.01, seg.y - DEFAULT_H - 0.004),
        width: DEFAULT_W,
        height: DEFAULT_H,
        blankType: "whitespace-above",
      };
    }

    return null;
  }

  NS.detectInitialsFields = function detectInitialsFields(normalizedPage) {
    const candidates = [];

    for (const w of normalizedPage.widgets) {
      const hint = `${w.fieldName} ${w.altText}`;
      if (w.fieldType === "Tx" && /\binitials?\b/i.test(hint)) {
        candidates.push({
          type: "initials",
          page: normalizedPage.pageIndex,
          x: w.x,
          y: w.y,
          width: w.width,
          height: Math.max(0.024, w.height),
          sourceText: hint.trim() || "Initials Widget",
          keywordStrength: "strong",
          blankType: "acroform",
          isParagraphLike: false,
          inSignatureSection: true,
          labelY: w.y,
        });
      }
    }

    for (const seg of normalizedPage.segments) {
      const text = seg.cleanText;
      if (!text) continue;

      let keywordStrength = null;
      if (STRONG_INITIALS_RE.test(text)) {
        keywordStrength = "strong";
      } else if (STANDARD_INITIALS_RE.test(text)) {
        keywordStrength = "strong";
      } else if (/\binitials?\s*:/i.test(text) && seg.wordCount <= 4) {
        keywordStrength = "medium";
      } else {
        continue;
      }

      if (seg.isParagraphLike && !seg.hasInlineBlank && !seg.geometry.lineRight) continue;

      const placement = computePlacement(seg);
      if (!placement) continue;

      const inSignatureSection =
        normalizedPage.signatureSectionY !== null && seg.y >= normalizedPage.signatureSectionY - 0.03;

      candidates.push({
        type: "initials",
        page: normalizedPage.pageIndex,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        sourceText: text,
        keywordStrength,
        blankType: placement.blankType,
        isParagraphLike: seg.isParagraphLike,
        inSignatureSection,
        labelY: seg.y,
      });
    }

    return candidates;
  };
})(typeof self !== "undefined" ? self : window);
