(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const STRONG_NAME_RE =
    /\b(full\s+name|print(?:ed)?\s+name|name\s+of\s+signatory|employee\s+name|employer\s+name|applicant\s+name|witness\s+name|client\s+name|contractor\s+name|consultant\s+name|tenant\s+name|landlord\s+name|authorized\s+name|signatory\s+name)\b/i;

  const PRINTED_CAPTION_RE = /^(?:printed|print)\s*[:.]?$/i;
  const GENERIC_NAME_RE = /^(?:name|typed\s+name)\s*[:.]?$/i;
  const FALSE_POSITIVE_RE =
    /\b(company\s+name|business\s+name|organization\s+name|firm\s+name|entity\s+name|agency\s+name|domain\s+name|file\s+name|brand\s+name|project\s+name|bank\s+name|account\s+name)\b/i;

  const DEFAULT_W = 0.24;
  const DESIRED_H = 0.026;
  const MIN_H = 0.019;

  function placeAboveBaseline(x, width, baselineY, segments, excludeSegId, blankType) {
    const w = Math.min(0.4, Math.max(0.16, width));
    const fit = NS.measureClearHeightAbove(x, w, baselineY, segments, excludeSegId, DESIRED_H, MIN_H);
    return { x, y: fit.y, width: w, height: fit.height, blankType };
  }

  function computePlacement(seg, segments) {
    const g = seg.geometry;

    if (!seg.hasTrailingColon && g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.07) {
      const b = seg.inlineBlankBox;
      return placeAboveBaseline(b.x, b.width, b.baselineY || b.y + b.height, segments, seg.id, "inline-underscore");
    }

    if (g.lineRight) {
      return placeAboveBaseline(g.lineRight.x, g.lineRight.width, g.lineRight.y, segments, seg.id, "vector-line-right");
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.003,
        y: b.y + 0.003,
        width: Math.max(0.14, b.width - 0.006),
        height: Math.max(0.022, b.height - 0.006),
        blankType: "vector-box",
      };
    }

    if (g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    if (g.lineBelow) {
      return placeAboveBaseline(g.lineBelow.x, g.lineBelow.width, g.lineBelow.y, segments, seg.id, "vector-line-below");
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.12) {
      const x = seg.x + seg.width + 0.008;
      const w = Math.min(DEFAULT_W, g.freeSpaceRight - 0.008);
      return placeAboveBaseline(x, w, seg.y + seg.height, segments, seg.id, "whitespace-right");
    }

    if (g.freeSpaceAbove >= 0.024) {
      const w = Math.max(0.16, Math.min(DEFAULT_W, seg.width + 0.1));
      return placeAboveBaseline(seg.x, w, seg.y - 0.003, segments, seg.id, "whitespace-above");
    }

    return null;
  }

  NS.detectNameFields = function detectNameFields(normalizedPage) {
    const candidates = [];

    for (const w of normalizedPage.widgets) {
      const hint = `${w.fieldName} ${w.altText}`;
      if (w.fieldType === "Tx" && /\b(full.?name|print.?name|signatory.?name|name)\b/i.test(hint) && !FALSE_POSITIVE_RE.test(hint)) {
        candidates.push({
          type: "name",
          page: normalizedPage.pageIndex,
          x: w.x,
          y: w.y,
          width: w.width,
          height: Math.max(0.022, w.height),
          sourceText: hint.trim() || "Name Widget",
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
      if (!text || FALSE_POSITIVE_RE.test(text)) continue;

      let keywordStrength = null;
      if (STRONG_NAME_RE.test(text)) {
        keywordStrength = "strong";
      } else if (PRINTED_CAPTION_RE.test(text)) {
        const g = seg.geometry;
        if (!(g.lineAbove || g.lineBelow || g.lineRight || seg.hasInlineBlank || g.enclosingBox)) continue;
        keywordStrength = "strong";
      } else if (GENERIC_NAME_RE.test(text)) {
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
        type: "name",
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
