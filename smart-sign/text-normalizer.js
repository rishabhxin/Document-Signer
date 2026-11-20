(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const SECTION_CUE_RE =
    /\b(in witness whereof|agreed and accepted|accepted and agreed|agreed to and accepted|executed by|approved as to|signatures?|signatories|execution|signed by the parties|authorized signatories|acknowledg(?:e)?ment)\b/i;

  const INLINE_UNDERSCORE_RE = /_{3,}|\.{5,}|\u2026{2,}|\u2014{3,}|-{5,}/;
  const PURE_BLANK_LINE_RE = /^[_\u2014\u2013\-.\u2026\s]+$/;

  function cleanText(str) {
    return String(str || "")
      .replace(/[\u00A0\u2000-\u200B\uFEFF]/g, " ")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPureBlankLine(str) {
    const t = cleanText(str);
    return t.length >= 3 && PURE_BLANK_LINE_RE.test(t) && INLINE_UNDERSCORE_RE.test(t);
  }

  function rectsOverlap(a, b, pad = 0.002) {
    return !(
      a.x + a.width + pad < b.x ||
      b.x + b.width + pad < a.x ||
      a.y + a.height + pad < b.y ||
      b.y + b.height + pad < a.y
    );
  }

  function buildSegmentsAndSyntheticLines(items) {
    const sorted = items
      .filter((it) => it.text && it.text.trim().length > 0)
      .map((it) => ({ ...it, text: cleanText(it.text) }))
      .filter((it) => it.text.length > 0)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const rows = [];
    for (const tok of sorted) {
      const midY = tok.y + tok.height / 2;
      let row = rows.find((r) => Math.abs(r.midY - midY) <= Math.max(r.avgH, tok.height) * 0.65);
      if (!row) {
        row = { tokens: [], midY, avgH: tok.height };
        rows.push(row);
      }
      row.tokens.push(tok);
      row.midY = row.tokens.reduce((s, t) => s + t.y + t.height / 2, 0) / row.tokens.length;
      row.avgH = row.tokens.reduce((s, t) => s + t.height, 0) / row.tokens.length;
    }

    const segments = [];
    const syntheticLines = [];
    let rowIndex = 0;

    for (const row of rows) {
      row.tokens.sort((a, b) => a.x - b.x);
      const groups = [];
      let cur = [row.tokens[0]];

      for (let i = 1; i < row.tokens.length; i++) {
        const prev = cur[cur.length - 1];
        const next = row.tokens[i];
        const gap = next.x - (prev.x + prev.width);
        if (gap > Math.max(0.045, row.avgH * 2.4)) {
          groups.push(cur);
          cur = [next];
        } else {
          cur.push(next);
        }
      }
      groups.push(cur);

      for (const grp of groups) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const parts = [];

        for (let k = 0; k < grp.length; k++) {
          const t = grp[k];
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x + t.width);
          maxY = Math.max(maxY, t.y + t.height);
          if (k > 0) {
            const prev = grp[k - 1];
            const gap = t.x - (prev.x + prev.width);
            parts.push(gap > 0.002 ? " " + t.text : t.text);
          } else {
            parts.push(t.text);
          }
        }

        const rawText = cleanText(parts.join(""));
        const segW = Math.max(0.005, maxX - minX);
        const segH = Math.max(0.008, maxY - minY);

        // Pure underscore / dashed text lines (e.g. Word-exported signature lines)
        // Convert them directly into horizontal lines so they inform placement instead of blocking whitespace!
        if (isPureBlankLine(rawText)) {
          if (segW >= 0.05) {
            syntheticLines.push({
              x: minX,
              y: minY + segH * 0.85,
              width: segW,
              height: 0.003,
              source: "text-underline",
            });
          }
          continue;
        }

        const strippedText = cleanText(rawText.replace(new RegExp(INLINE_UNDERSCORE_RE.source, "g"), " "));
        const inlineBlankMatch = rawText.match(INLINE_UNDERSCORE_RE);

        let inlineBlankBox = null;
        if (inlineBlankMatch) {
          // Prefer exact token geometry if the underscores came from distinct token(s)
          const blankToks = grp.filter((t) => isPureBlankLine(t.text));
          if (blankToks.length) {
            const bx1 = Math.min(...blankToks.map((t) => t.x));
            const by1 = Math.min(...blankToks.map((t) => t.y));
            const bx2 = Math.max(...blankToks.map((t) => t.x + t.width));
            const by2 = Math.max(...blankToks.map((t) => t.y + t.height));
            inlineBlankBox = {
              x: bx1,
              y: by1,
              width: Math.max(0.06, bx2 - bx1),
              height: Math.max(0.018, by2 - by1),
            };
          } else {
            const idx = rawText.indexOf(inlineBlankMatch[0]);
            const fracStart = rawText.length ? idx / rawText.length : 0.5;
            const fracLen = rawText.length ? inlineBlankMatch[0].length / rawText.length : 0.4;
            inlineBlankBox = {
              x: minX + segW * fracStart,
              y: minY,
              width: Math.max(0.07, segW * fracLen),
              height: Math.max(0.018, segH),
            };
          }

          // Also emit inline underscores >= 8% wide as a synthetic line so captions directly below
          // (like "SIGNED" beneath "By: ___________________") detect it via lineAbove!
          if (inlineBlankBox.width >= 0.08) {
            syntheticLines.push({
              x: inlineBlankBox.x,
              y: inlineBlankBox.y + inlineBlankBox.height * 0.85,
              width: inlineBlankBox.width,
              height: 0.003,
              source: "inline-underline",
            });
          }
        }

        const wordCount = strippedText ? strippedText.split(/\s+/).length : 0;
        const isParagraphLike =
          wordCount >= 11 ||
          (wordCount >= 7 && /[.?!]$/.test(strippedText) && !inlineBlankMatch && !/:$/.test(strippedText));

        segments.push({
          id: `seg-${rowIndex}-${segments.length}`,
          rowIndex,
          text: rawText,
          cleanText: strippedText,
          lowerText: strippedText.toLowerCase(),
          x: minX,
          y: minY,
          width: segW,
          height: segH,
          tokens: grp,
          hasInlineBlank: !!inlineBlankMatch,
          inlineBlankBox,
          hasTrailingColon: /:\s*$/.test(strippedText),
          isParagraphLike,
          wordCount,
        });
      }
      rowIndex++;
    }

    return { segments, syntheticLines };
  }

  function enrichGeometry(segments, lines, boxes) {
    for (const seg of segments) {
      const segRight = seg.x + seg.width;
      const segBottom = seg.y + seg.height;

      let lineAbove = null;
      let lineBelow = null;
      let lineRight = null;

      for (const ln of lines) {
        const horizOverlap = Math.min(segRight, ln.x + ln.width) - Math.max(seg.x, ln.x);
        const alignedHoriz = horizOverlap > -0.04;

        const dyAbove = seg.y - ln.y;
        if (alignedHoriz && dyAbove >= -0.006 && dyAbove <= 0.048) {
          if (!lineAbove || dyAbove < seg.y - lineAbove.y) lineAbove = ln;
        }

        const dyBelow = ln.y - segBottom;
        if (alignedHoriz && dyBelow >= -0.006 && dyBelow <= 0.055) {
          if (!lineBelow || dyBelow < lineBelow.y - segBottom) lineBelow = ln;
        }

        const dxRight = ln.x - segRight;
        const sameRow = Math.abs(ln.y - (seg.y + seg.height * 0.8)) <= Math.max(0.02, seg.height * 1.5);
        if (sameRow && dxRight >= -0.015 && dxRight <= 0.14) {
          if (!lineRight || dxRight < lineRight.x - segRight) lineRight = ln;
        }
      }

      let enclosingBox = null;
      let rightBox = null;
      for (const b of boxes) {
        if (rectsOverlap(seg, b, 0.004)) {
          if (!enclosingBox || b.width * b.height < enclosingBox.width * enclosingBox.height) {
            enclosingBox = b;
          }
        } else {
          const dx = b.x - segRight;
          const dy = Math.abs(b.y + b.height / 2 - (seg.y + seg.height / 2));
          if (dx >= -0.005 && dx <= 0.06 && dy <= 0.03) {
            if (!rightBox || dx < rightBox.x - segRight) rightBox = b;
          }
        }
      }

      let freeRightEnd = 0.94;
      let freeAboveTop = Math.max(0.02, seg.y - 0.075);
      let freeBelowBottom = Math.min(0.96, segBottom + 0.075);

      for (const other of segments) {
        if (other.id === seg.id) continue;
        const sameY = other.y < segBottom + 0.006 && other.y + other.height > seg.y - 0.006;
        if (sameY && other.x > segRight - 0.005) {
          freeRightEnd = Math.min(freeRightEnd, other.x - 0.012);
        }
        const sameX = other.x < seg.x + Math.max(seg.width, 0.24) && other.x + other.width > seg.x - 0.02;
        if (sameX && other.y + other.height <= seg.y + 0.002) {
          freeAboveTop = Math.max(freeAboveTop, other.y + other.height + 0.004);
        }
        if (sameX && other.y >= segBottom - 0.002) {
          freeBelowBottom = Math.min(freeBelowBottom, other.y - 0.004);
        }
      }

      seg.geometry = {
        lineAbove,
        lineBelow,
        lineRight,
        enclosingBox,
        rightBox,
        freeSpaceRight: Math.max(0, freeRightEnd - segRight),
        freeSpaceAbove: Math.max(0, seg.y - freeAboveTop),
        freeSpaceBelow: Math.max(0, freeBelowBottom - segBottom),
      };
    }
  }

  NS.normalizePageData = function normalizePageData(rawPage) {
    const { segments, syntheticLines } = buildSegmentsAndSyntheticLines(rawPage.items || []);
    const allLines = (rawPage.lines || []).concat(syntheticLines);
    enrichGeometry(segments, allLines, rawPage.boxes || []);

    let signatureSectionY = null;
    for (const seg of segments) {
      if (SECTION_CUE_RE.test(seg.cleanText)) {
        if (signatureSectionY === null || seg.y < signatureSectionY) {
          signatureSectionY = seg.y;
        }
      }
    }

    return {
      pageIndex: rawPage.pageIndex,
      width: rawPage.width,
      height: rawPage.height,
      rotation: rawPage.rotation,
      isScanned: !!rawPage.isScanned,
      segments,
      lines: allLines,
      boxes: rawPage.boxes || [],
      widgets: rawPage.widgets || [],
      signatureSectionY,
    };
  };
})(typeof self !== "undefined" ? self : window);
