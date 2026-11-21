(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const ROLE_PATTERNS = [
    { role: "Employee", re: /\bemployee\b/i },
    { role: "Employer", re: /\bemployer\b/i },
    { role: "Witness", re: /\bwitness(?:\s*\d+)?\b/i },
    { role: "Applicant", re: /\bapplicant\b/i },
    { role: "Landlord", re: /\b(?:landlord|lessor|owner)\b/i },
    { role: "Tenant", re: /\b(?:tenant|lessee|renter)\b/i },
    { role: "Consultant", re: /\bconsultant\b/i },
    { role: "Contractor", re: /\b(?:contractor|freelancer|service provider|vendor)\b/i },
    { role: "Client", re: /\b(?:client|customer)\b/i },
    { role: "Disclosing Party", re: /\bdisclosing party\b/i },
    { role: "Receiving Party", re: /\breceiving party\b/i },
    { role: "Counsel", re: /\b(?:counsel|attorney)\b/i },
    { role: "Officer", re: /\bofficer\b/i },
    { role: "Commission", re: /\bcommission\b/i },
    { role: "Company", re: /\b(?:company|organization|authorized representative)\b/i },
    { role: "Buyer", re: /\b(?:buyer|purchaser)\b/i },
    { role: "Seller", re: /\b(?:seller)\b/i },
    { role: "Party A", re: /\bparty\s*(?:a|1|one)\b/i },
    { role: "Party B", re: /\bparty\s*(?:b|2|two)\b/i },
  ];

  const NUMBERED_HEADER_RE = /^\d+\.\s+([A-Za-z][A-Za-z0-9\s&.,/-]{2,48}):?$/;
  const APPROVAL_HEADER_RE = /^(?:\d+\.\s*)?approved\s+as\s+to\s+([a-z\s]{2,24}):?$/i;

  function titleCase(str) {
    return str
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .trim();
  }

  function extractRoleFromText(text) {
    if (!text) return null;
    const appMatch = text.match(APPROVAL_HEADER_RE);
    if (appMatch) {
      return `Approval (${titleCase(appMatch[1])})`;
    }
    for (const p of ROLE_PATTERNS) {
      if (p.re.test(text)) return p.role;
    }
    return null;
  }

  NS.extractRoleFromText = extractRoleFromText;

  NS.detectSignersForPage = function detectSignersForPage(normalizedPage) {
    const anchors = [];
    const sigY = normalizedPage.signatureSectionY;

    for (const seg of normalizedPage.segments) {
      if (seg.wordCount > 9) continue;

      let role = extractRoleFromText(seg.cleanText);

      if (!role && sigY !== null && seg.y >= sigY - 0.02) {
        const m = seg.cleanText.match(NUMBERED_HEADER_RE);
        if (m && seg.cleanText === seg.cleanText.toUpperCase()) {
          const cleanLabel = m[1].trim().split(/\s+/).slice(0, 3).join(" ");
          role = titleCase(cleanLabel);
        }
      }

      if (!role) continue;

      const isHeader =
        seg.wordCount <= 6 ||
        seg.cleanText === seg.cleanText.toUpperCase() ||
        /\b(for|by|signature|signatory|party|approved)\b/i.test(seg.cleanText);

      if (isHeader) {
        anchors.push({
          role,
          x: seg.x,
          y: seg.y,
          cx: seg.x + seg.width / 2,
          width: seg.width,
        });
      }
    }

    const leftAnchors = anchors.filter((a) => a.cx < 0.45);
    const rightAnchors = anchors.filter((a) => a.cx >= 0.45);
    const isTwoColumn = leftAnchors.length > 0 && rightAnchors.length > 0;

    return { anchors, isTwoColumn };
  };

  NS.assignSignerToField = function assignSignerToField(field, signerContext) {
    const direct = extractRoleFromText(field.sourceText || "");
    if (direct) return direct;

    const { anchors, isTwoColumn } = signerContext;
    if (!anchors.length) return "Signer 1";

    const fieldCx = field.x + field.width / 2;
    let best = null;
    let bestDist = Infinity;

    for (const a of anchors) {
      if (isTwoColumn) {
        const sameSide = (fieldCx < 0.45 && a.cx < 0.45) || (fieldCx >= 0.45 && a.cx >= 0.45);
        if (!sameSide) continue;
      }

      const dy = field.y - a.y;
      if (dy < -0.02 || dy > 0.24) continue;

      const dx = Math.abs(fieldCx - a.cx);
      const dist = dy * 1.5 + dx * 0.7;
      if (dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    }

    return best ? best.role : "Signer 1";
  };
})(typeof self !== "undefined" ? self : window);
