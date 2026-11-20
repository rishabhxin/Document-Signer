(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const HARD_BLANK_TYPES = new Set([
    "acroform",
    "vector-line-right",
    "vector-line-above",
    "vector-line-below",
    "vector-box",
    "inline-underscore",
    "format-placeholder",
  ]);

  function scoreKeyword(c) {
    if (c.blankType === "acroform") return 30;
    if (c.keywordStrength === "strong") return 30;
    if (c.keywordStrength === "medium") return 22;
    return 12;
  }

  function scoreBlankLine(c) {
    if (HARD_BLANK_TYPES.has(c.blankType)) return 25;
    if (c.blankType === "whitespace-right") return 16;
    if (c.blankType === "whitespace-above" || c.blankType === "whitespace-below") return 13;
    return 0;
  }

  function scoreContext(c) {
    if (c.blankType === "acroform") return 20;
    if (c.isParagraphLike) return 4;
    if (c.inSignatureSection) return 20;
    const words = (c.sourceText || "").trim().split(/\s+/).filter(Boolean).length;
    if (words <= 4) return 15;
    if (words <= 7) return 10;
    return 6;
  }

  function scorePosition(c, pageIndex, totalPages) {
    const isLastPages = pageIndex >= Math.max(0, totalPages - 2);
    if (c.type === "initials") {
      if (c.y >= 0.78 || c.x <= 0.18 || c.x >= 0.72) return 10;
      return 7;
    }
    if (c.type === "signature") {
      if (isLastPages && c.y >= 0.25) return 10;
      if (c.y >= 0.45) return 8;
      return 6;
    }
    if (isLastPages || c.y >= 0.35) return 10;
    return 6;
  }

  function scoreLayoutEvidence(c, allPageCandidates) {
    if (c.blankType === "acroform") return 15;

    let relatedDifferentType = false;
    let alignedPeer = false;

    for (const other of allPageCandidates) {
      if (other === c) continue;
      const dy = Math.abs(other.y - c.y);
      const dx = Math.abs(other.x - c.x);

      if (other.type !== c.type && dy <= 0.2 && dx <= 0.38) {
        relatedDifferentType = true;
      }
      if (other.type === c.type && dy <= 0.05 && dx >= 0.22) {
        alignedPeer = true;
      }
    }

    if (relatedDifferentType && alignedPeer) return 15;
    if (relatedDifferentType) return 14;
    if (alignedPeer) return 12;
    if (c.type === "signature" && HARD_BLANK_TYPES.has(c.blankType)) return 9;
    return 4;
  }

  function classifyConfidence(score) {
    if (score >= 85) return "high";
    if (score >= 60) return "medium";
    return "low";
  }

  NS.classifyConfidence = classifyConfidence;

  NS.scoreFields = function scoreFields(candidates, normalizedPage, totalPages) {
    return candidates.map((c) => {
      const keyword = scoreKeyword(c);
      const blankLine = scoreBlankLine(c);
      const context = scoreContext(c);
      const position = scorePosition(c, normalizedPage.pageIndex, totalPages);
      const layout = scoreLayoutEvidence(c, candidates);

      const confidence = Math.max(0, Math.min(100, Math.round(keyword + blankLine + context + position + layout)));

      return {
        ...c,
        confidence,
        confidenceLevel: classifyConfidence(confidence),
        scoreBreakdown: { keyword, blankLine, context, position, layout },
      };
    });
  };
})(typeof self !== "undefined" ? self : window);
