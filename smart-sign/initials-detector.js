(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const STRONG_INITIALS_RE =
    /\b(employee\s+initials?|employer\s+initials?|applicant\s+initials?|tenant\s+initials?|landlord\s+initials?|client\s+initials?|contractor\s+initials?|consultant\s+initials?|buyer\s+initials?|seller\s+initials?|party\s+[ab12]\s+initials?|initial\s+here)\b/i;

  const STANDARD_INITIALS_RE = /^(?:initials?)\s*[:.]?$/i;

  const DEFAULT_W = 0.09;
  const DESIRED_H = 0.028;
  const MIN_H = 0.02;

  function placeAboveBaseline(x, width, baselineY, segments, excludeSegId, blankType) {
    const w = Math.min(0.14, Math.max(0.065, width));
    const fit = NS.measureClearHeightAbove(x, w, baselineY, segments, excludeSegId, DESIRED_H, MIN_H);
    return { x, y: fit.y, width: w, height: fit.height, blankType };
  }

  function computePlacement(seg, segments) {
    const g = seg.geometry;

    if (!seg.hasTrailingColon && g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.03) {
      const b = seg.inlineBlankBox;
      return placeAboveBaseline(b.x, b.width, b.baselineY || b.y + b.height, segments, seg.id, "inline-underscore");
    }

    if (g.lineRight) {
      return placeAboveBaseline(g.lineRight.x, g.lineRight.width, g.lineRight.y, segments, seg.id, "vector-line-right");
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.002,
        y: b.y + 0.002,
        width: Math.max(0.06, b.width - 0.004),
        height: Math.max(0.022, b.height - 0.004),
        blankType: "vector-box",
      };
    }

    if (g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    if (g.lineBelow) {
      return placeAboveBaseline(g.lineBelow.x, g.lineBelow.width, g.lineBelow.y, segments, seg.id, "vector-line-below");
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.06) {
      const x = seg.x + seg.width + 0.008;
      const w = Math.min(DEFAULT_W, g.freeSpaceRight - 0.006);
      return placeAboveBaseline(x, w, seg.y + seg.height, segments, seg.id, "whitespace-right");
    }

    if (g.freeSpaceAbove >= 0.024) {
      return placeAboveBaseline(seg.x, DEFAULT_W, seg.y - 0.003, segments, seg.id, "whitespace-above");
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
          height: Math.max(0.022, w.height),
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

      const placement = computePlacement(seg, normalizedPage.segments);
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
