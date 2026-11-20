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
  const DEFAULT_H = 0.028;

  function computePlacement(seg) {
    const g = seg.geometry;

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.07) {
      const b = seg.inlineBlankBox;
      return {
        x: b.x,
        y: Math.max(0.01, b.y - 0.004),
        width: Math.min(0.38, Math.max(0.16, b.width)),
        height: DEFAULT_H,
        blankType: "inline-underscore",
      };
    }

    if (g.lineRight) {
      const ln = g.lineRight;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.38, Math.max(0.16, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-right",
      };
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.003,
        y: b.y + 0.003,
        width: Math.max(0.14, b.width - 0.006),
        height: Math.max(0.024, b.height - 0.006),
        blankType: "vector-box",
      };
    }

    if (g.lineAbove) {
      const ln = g.lineAbove;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.38, Math.max(0.16, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-above",
      };
    }

    if (g.lineBelow) {
      const ln = g.lineBelow;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.38, Math.max(0.16, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-below",
      };
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.12) {
      return {
        x: seg.x + seg.width + 0.008,
        y: Math.max(0.01, seg.y - 0.003),
        width: Math.min(DEFAULT_W, g.freeSpaceRight - 0.008),
        height: DEFAULT_H,
        blankType: "whitespace-right",
      };
    }

    if (g.freeSpaceAbove >= 0.028) {
      return {
        x: seg.x,
        y: Math.max(0.01, seg.y - DEFAULT_H - 0.004),
        width: Math.max(0.16, Math.min(DEFAULT_W, seg.width + 0.1)),
        height: DEFAULT_H,
        blankType: "whitespace-above",
      };
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
          height: Math.max(0.024, w.height),
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
        // Common legal pairing: "SIGNED" line followed by "PRINTED" line
        const g = seg.geometry;
        if (!(g.lineAbove || g.lineBelow || g.lineRight || seg.hasInlineBlank || g.enclosingBox)) continue;
        keywordStrength = "strong";
      } else if (GENERIC_NAME_RE.test(text)) {
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
