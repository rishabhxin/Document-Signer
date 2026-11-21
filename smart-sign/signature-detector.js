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
  const DESIRED_H = 0.044;
  const MIN_H = 0.028;

  function placeAboveBaseline(x, width, baselineY, segments, excludeSegId, blankType) {
    const w = Math.min(0.42, Math.max(0.18, width));
    const fit = NS.measureClearHeightAbove(x, w, baselineY, segments, excludeSegId, DESIRED_H, MIN_H);
    return {
      x,
      y: fit.y,
      width: w,
      height: fit.height,
      blankType,
    };
  }

  function computePlacement(seg, segments) {
    const g = seg.geometry;

    // 1. Caption directly under a signature line (no trailing colon) -> prioritize lineAbove FIRST
    if (!seg.hasTrailingColon && g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    // 2. Inline blank line on the same segment ("By: ___________________" or "Signature: ________")
    if (seg.inlineBlankBox && seg.inlineBlankBox.width >= 0.08) {
      const b = seg.inlineBlankBox;
      const baselineY = b.baselineY || b.y + b.height;
      return placeAboveBaseline(b.x, b.width, baselineY, segments, seg.id, "inline-underscore");
    }

    // 3. Vector or synthetic line to the right on the exact same baseline ("By:       __________")
    if (g.lineRight) {
      return placeAboveBaseline(g.lineRight.x, g.lineRight.width, g.lineRight.y, segments, seg.id, "vector-line-right");
    }

    // 4. Line directly above label (fallback for colon-labels that still have a line above)
    if (g.lineAbove) {
      return placeAboveBaseline(g.lineAbove.x, g.lineAbove.width, g.lineAbove.y, segments, seg.id, "vector-line-above");
    }

    // 5. Box to the right or enclosing box
    if (g.rightBox) {
      const b = g.rightBox;
      return {
        x: b.x + 0.004,
        y: b.y + 0.004,
        width: Math.max(0.14, b.width - 0.008),
        height: Math.max(0.03, b.height - 0.008),
        blankType: "vector-box",
      };
    }

    if (g.enclosingBox && g.enclosingBox.height >= 0.032) {
      const b = g.enclosingBox;
      const labelNearBottom = seg.y > b.y + b.height * 0.5;
      return {
        x: b.x + 0.006,
        y: labelNearBottom ? b.y + 0.004 : seg.y + seg.height + 0.004,
        width: Math.max(0.14, b.width - 0.012),
        height: Math.max(0.028, b.height - seg.height - 0.008),
        blankType: "vector-box",
      };
    }

    // 6. Line below label ("Signature" header above an underline)
    if (g.lineBelow) {
      return placeAboveBaseline(g.lineBelow.x, g.lineBelow.width, g.lineBelow.y, segments, seg.id, "vector-line-below");
    }

    // 7. Whitespace to the right (for "Signature:" style)
    if (seg.hasTrailingColon && g.freeSpaceRight >= 0.14) {
      const x = seg.x + seg.width + 0.01;
      const w = Math.min(DEFAULT_W, g.freeSpaceRight - 0.01);
      return placeAboveBaseline(x, w, seg.y + seg.height, segments, seg.id, "whitespace-right");
    }

    // 8. Whitespace above standalone label
    if (g.freeSpaceAbove >= 0.032) {
      const w = Math.max(0.22, Math.min(DEFAULT_W, seg.width + 0.12));
      return placeAboveBaseline(seg.x, w, seg.y - 0.003, segments, seg.id, "whitespace-above");
    }

    // 9. Whitespace below standalone label
    if (g.freeSpaceBelow >= 0.032) {
      return {
        x: seg.x,
        y: seg.y + seg.height + 0.004,
        width: Math.max(0.22, Math.min(DEFAULT_W, seg.width + 0.12)),
        height: Math.min(DESIRED_H, Math.max(MIN_H, g.freeSpaceBelow)),
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
          height: Math.max(0.032, w.height),
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

      const placement = computePlacement(seg, normalizedPage.segments);
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
