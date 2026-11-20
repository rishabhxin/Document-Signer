(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const STRONG_DATE_RE =
    /\b(date\s+of\s+signing|signed\s+on|dated\s+this|signing\s+date|date\s+signed|execution\s+date)\b/i;
  const FORMAT_PLACEHOLDER_RE =
    /\b(dd\s*[/.-]\s*mm\s*[/.-]\s*yyyy|mm\s*[/.-]\s*dd\s*[/.-]\s*yyyy|yyyy\s*[/.-]\s*mm\s*[/.-]\s*dd)\b/i;
  const LABEL_DATE_RE = /^(?:date|dated)\s*[:.]?$/i;
  const ROLE_DATE_RE = /\b(?:employee|employer|witness|applicant|client|contractor|consultant|tenant|landlord)\s+date\b/i;
  const ALREADY_FILLED_DATE_RE =
    /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i;

  const DEFAULT_W = 0.16;
  const DEFAULT_H = 0.028;

  function computePlacement(seg, isPlaceholderItself) {
    const g = seg.geometry;

    if (isPlaceholderItself) {
      return {
        x: seg.x,
        y: Math.max(0.01, seg.y - 0.003),
        width: Math.max(0.13, seg.width + 0.02),
        height: Math.max(DEFAULT_H, seg.height + 0.006),
        blankType: "format-placeholder",
      };
    }

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.05) {
      const b = seg.inlineBlankBox;
      return {
        x: b.x,
        y: Math.max(0.01, b.y - 0.004),
        width: Math.min(0.24, Math.max(0.12, b.width)),
        height: DEFAULT_H,
        blankType: "inline-underscore",
      };
    }

    if (g.lineRight) {
      const ln = g.lineRight;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.24, Math.max(0.12, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-right",
      };
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.003,
        y: b.y + 0.003,
        width: Math.max(0.1, b.width - 0.006),
        height: Math.max(0.024, b.height - 0.006),
        blankType: "vector-box",
      };
    }

    if (g.lineAbove) {
      const ln = g.lineAbove;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.24, Math.max(0.12, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-above",
      };
    }

    if (g.lineBelow) {
      const ln = g.lineBelow;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.24, Math.max(0.12, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-below",
      };
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.09) {
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
        width: Math.max(0.13, Math.min(DEFAULT_W, seg.width + 0.08)),
        height: DEFAULT_H,
        blankType: "whitespace-above",
      };
    }

    return null;
  }

  NS.detectDateFields = function detectDateFields(normalizedPage) {
    const candidates = [];

    for (const w of normalizedPage.widgets) {
      const hint = `${w.fieldName} ${w.altText}`;
      if (w.fieldType === "Tx" && /\bdate\b/i.test(hint)) {
        candidates.push({
          type: "date",
          page: normalizedPage.pageIndex,
          x: w.x,
          y: w.y,
          width: w.width,
          height: Math.max(0.024, w.height),
          sourceText: hint.trim() || "Date Widget",
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

      if (ALREADY_FILLED_DATE_RE.test(text) && !seg.hasInlineBlank) continue;

      const isPlaceholder = FORMAT_PLACEHOLDER_RE.test(text);
      let keywordStrength = null;

      if (STRONG_DATE_RE.test(text) || ROLE_DATE_RE.test(text)) {
        keywordStrength = "strong";
      } else if (isPlaceholder) {
        keywordStrength = "strong";
      } else if (LABEL_DATE_RE.test(text)) {
        keywordStrength = "strong";
      } else if (/^date\s*:/i.test(text) && seg.wordCount <= 4) {
        keywordStrength = "medium";
      } else {
        continue;
      }

      if (seg.isParagraphLike && !seg.hasInlineBlank && !isPlaceholder) continue;

      const placement = computePlacement(seg, isPlaceholder && seg.wordCount <= 3);
      if (!placement) continue;

      const inSignatureSection =
        normalizedPage.signatureSectionY !== null && seg.y >= normalizedPage.signatureSectionY - 0.03;

      candidates.push({
        type: "date",
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
