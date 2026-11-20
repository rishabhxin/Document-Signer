(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const STRONG_SIG_RE =
    /\b(authorized\s+signature|employee\s+signature|employer\s+signature|witness\s+signature|applicant\s+signature|client\s+signature|contractor\s+signature|consultant\s+signature|tenant\s+signature|landlord\s+signature|signature\s+of\s+[a-z\s]{2,24}|sign\s+here|signed\s+by|signatory\s+signature)\b/i;

  const STANDARD_SIG_RE =
    /^(?:x\s*)?(?:signature|signed|sign\s+here|authorized\s+signatory|authorized\s+representative|by)\s*[:.]?$/i;
  const GENERIC_SIG_RE = /\b(signature|signed\s+by|sign\s+here)\b/i;
  const OFFICER_TITLE_RE =
    /\b(officer|counsel|attorney|director|manager|president|vice\s+president|secretary|treasurer|chairman|chairperson|partner|chief\s+executive|ceo|cfo|coo|authorized\s+(?:agent|official|officer|signatory|representative)|commissioner|administrator|executive\s+director|superintendent)\b/i;

  const FALSE_POSITIVE_RE =
    /\b(signature\s+page|signature\s+block|electronic\s+signature\s+act|without\s+the\s+prior|counterparts|distribution)\b/i;
  const BULLET_RE = /^[\u2022\u25CF\u25AA\u25E6\-*]\s*/;

  const DEFAULT_W = 0.28;
  const DEFAULT_H = 0.052;

  function computePlacement(seg) {
    const g = seg.geometry;

    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.08) {
      const b = seg.inlineBlankBox;
      return {
        x: b.x,
        y: Math.max(0.01, b.y - DEFAULT_H * 0.55),
        width: Math.min(0.42, Math.max(0.18, b.width)),
        height: DEFAULT_H,
        blankType: "inline-underscore",
      };
    }

    if (g.lineRight) {
      const ln = g.lineRight;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.006),
        width: Math.min(0.42, Math.max(0.18, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-right",
      };
    }

    if (g.lineAbove) {
      const ln = g.lineAbove;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.42, Math.max(0.2, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-above",
      };
    }

    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.004,
        y: b.y + 0.004,
        width: Math.max(0.14, b.width - 0.008),
        height: Math.max(0.036, b.height - 0.008),
        blankType: "vector-box",
      };
    }

    if (g.enclosingBox && g.enclosingBox.height >= 0.035) {
      const b = g.enclosingBox;
      const labelNearBottom = seg.y > b.y + b.height * 0.5;
      return {
        x: b.x + 0.006,
        y: labelNearBottom ? b.y + 0.004 : seg.y + seg.height + 0.004,
        width: Math.max(0.14, b.width - 0.012),
        height: Math.max(0.032, b.height - seg.height - 0.01),
        blankType: "vector-box",
      };
    }

    if (g.lineBelow) {
      const ln = g.lineBelow;
      return {
        x: ln.x,
        y: Math.max(0.01, ln.y - DEFAULT_H + 0.004),
        width: Math.min(0.42, Math.max(0.18, ln.width)),
        height: DEFAULT_H,
        blankType: "vector-line-below",
      };
    }

    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.14) {
      return {
        x: seg.x + seg.width + 0.01,
        y: Math.max(0.01, seg.y - DEFAULT_H * 0.45),
        width: Math.min(DEFAULT_W, g.freeSpaceRight - 0.01),
        height: DEFAULT_H,
        blankType: "whitespace-right",
      };
    }

    if (g.freeSpaceAbove >= 0.036) {
      return {
        x: seg.x,
        y: Math.max(0.01, seg.y - Math.min(DEFAULT_H, g.freeSpaceAbove) - 0.004),
        width: Math.max(0.22, Math.min(DEFAULT_W, seg.width + 0.12)),
        height: Math.min(DEFAULT_H, Math.max(0.038, g.freeSpaceAbove)),
        blankType: "whitespace-above",
      };
    }

    if (g.freeSpaceBelow >= 0.036) {
      return {
        x: seg.x,
        y: seg.y + seg.height + 0.005,
        width: Math.max(0.22, Math.min(DEFAULT_W, seg.width + 0.12)),
        height: Math.min(DEFAULT_H, Math.max(0.038, g.freeSpaceBelow)),
        blankType: "whitespace-below",
      };
    }

    return null;
  }

  NS.detectSignatureFields = function detectSignatureFields(normalizedPage) {
    const candidates = [];

    for (const w of normalizedPage.widgets) {
      const hintText = `${w.fieldName} ${w.altText}`;
      if (w.fieldType === "Sig" || (w.fieldType === "Tx" && /\bsig(?:nature)?\b/i.test(hintText))) {
        candidates.push({
          type: "signature",
          page: normalizedPage.pageIndex,
          x: w.x,
          y: w.y,
          width: w.width,
          height: Math.max(0.035, w.height),
          sourceText: hintText.trim() || "Signature Widget",
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
      if (!text || FALSE_POSITIVE_RE.test(text) || BULLET_RE.test(text)) continue;
      if (/\b(date\s+of\s+signing|signed\s+on|dated\s+this)\b/i.test(text)) continue;
      if (/\bname\s+of\s+signatory\b/i.test(text)) continue;

      const inSignatureSection =
        normalizedPage.signatureSectionY !== null && seg.y >= normalizedPage.signatureSectionY - 0.03;

      let keywordStrength = null;
      if (STRONG_SIG_RE.test(text)) {
        keywordStrength = "strong";
      } else if (STANDARD_SIG_RE.test(text)) {
        keywordStrength = "strong";
      } else if (GENERIC_SIG_RE.test(text)) {
        keywordStrength = "medium";
      } else if (
        inSignatureSection &&
        seg.wordCount <= 6 &&
        !seg.isParagraphLike &&
        seg.geometry.lineAbove &&
        OFFICER_TITLE_RE.test(text)
      ) {
        // Legal signature line directly above an officer / counsel title (e.g. "Administrative Services Officer", "COMMISSION Counsel")
        keywordStrength = "strong";
      } else {
        continue;
      }

      if (seg.isParagraphLike && !seg.hasInlineBlank && !seg.geometry.lineRight) continue;

      if (/^by\s*:?$/i.test(text)) {
        const hasHardLine =
          seg.hasInlineBlank || seg.geometry.lineRight || seg.geometry.lineAbove || seg.geometry.lineBelow;
        if (!hasHardLine) continue;
        keywordStrength = inSignatureSection ? "strong" : "medium";
      }

      const placement = computePlacement(seg);
      if (!placement) continue;

      candidates.push({
        type: "signature",
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
