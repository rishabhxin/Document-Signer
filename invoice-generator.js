(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const INDIAN_STATES = [
    "27 - Maharashtra",
    "29 - Karnataka",
    "07 - Delhi",
    "33 - Tamil Nadu",
    "24 - Gujarat",
    "36 - Telangana",
    "19 - West Bengal",
    "09 - Uttar Pradesh",
    "08 - Rajasthan",
    "06 - Haryana",
    "32 - Kerala",
    "23 - Madhya Pradesh",
    "03 - Punjab",
    "37 - Andhra Pradesh",
    "10 - Bihar",
    "21 - Odisha",
    "18 - Assam",
    "22 - Chhattisgarh",
    "20 - Jharkhand",
    "05 - Uttarakhand",
    "02 - Himachal Pradesh",
    "30 - Goa",
    "04 - Chandigarh",
    "01 - Jammu & Kashmir",
    "34 - Puducherry",
    "16 - Tripura",
    "17 - Meghalaya",
    "14 - Manipur",
    "13 - Nagaland",
    "12 - Arunachal Pradesh",
    "15 - Mizoram",
    "11 - Sikkim",
    "35 - Andaman & Nicobar Islands",
    "26 - Dadra & Nagar Haveli and Daman & Diu",
    "38 - Ladakh",
    "31 - Lakshadweep",
    "97 - Other Territory / International",
  ];

  const CURRENCIES = {
    INR: { symbol: "₹", pdfSymbol: "Rs. ", name: "Rupees", sub: "Paise", indianNum: true },
    USD: { symbol: "$", pdfSymbol: "$", name: "Dollars", sub: "Cents", indianNum: false },
    EUR: { symbol: "€", pdfSymbol: "EUR ", name: "Euros", sub: "Cents", indianNum: false },
    GBP: { symbol: "£", pdfSymbol: "GBP ", name: "Pounds", sub: "Pence", indianNum: false },
    AED: { symbol: "AED ", pdfSymbol: "AED ", name: "Dirhams", sub: "Fils", indianNum: false },
    SGD: { symbol: "S$", pdfSymbol: "S$", name: "Singapore Dollars", sub: "Cents", indianNum: false },
    AUD: { symbol: "A$", pdfSymbol: "A$", name: "Australian Dollars", sub: "Cents", indianNum: false },
    CAD: { symbol: "C$", pdfSymbol: "C$", name: "Canadian Dollars", sub: "Cents", indianNum: false },
  };

  const BRAND_SWATCHES = [
    { name: "Open Sign Cobalt", hex: "#4C00FF" },
    { name: "Inkwell", hex: "#130032" },
    { name: "Royal Blue", hex: "#1652F0" },
    { name: "Emerald", hex: "#0F766E" },
    { name: "Slate", hex: "#334155" },
    { name: "Crimson", hex: "#B91C1C" },
  ];

  const UNITS = ["pcs", "hrs", "days", "nos", "mo", "kg", "pkg", "service"];

  const TERM_PRESETS = {
    standard: "Payment is due within 15 days from the invoice date. Please quote the invoice number on your bank transfer or UPI reference.",
    freelance: "50% advance due upon confirmation and balance due upon final delivery. Late payments beyond 15 days may attract 1.5% monthly interest.",
    gst: "Certified that the particulars given above are true and correct. Subject to Mumbai jurisdiction. E. & O.E.",
  };

  const DRAFT_KEY = "opensign:invoiceDraftV1";

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const addDaysISO = (isoStr, days) => {
    const base = isoStr ? new Date(isoStr + "T00:00:00") : new Date();
    if (Number.isNaN(base.getTime())) return todayISO();
    base.setDate(base.getDate() + Number(days || 0));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  };

  const fmtDisplayDate = (isoStr) => {
    if (!isoStr) return "—";
    const parts = isoStr.split("-");
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  function createDefaultState() {
    const issue = todayISO();
    return {
      docType: "TAX INVOICE",
      currency: "INR",
      taxMode: "gst", // 'gst' | 'simple' | 'none'
      template: "modern", // 'modern' | 'classic' | 'minimal' | 'spreadsheet'
      accent: "#4C00FF",
      showHsn: true,
      taxInclusive: false,
      showShipTo: false,
      roundOff: true,
      logoDataUrl: null,
      sellerName: "",
      sellerGstin: "",
      sellerState: "27 - Maharashtra",
      sellerContact: "",
      sellerAddress: "",
      clientName: "",
      clientGstin: "",
      placeOfSupply: "27 - Maharashtra",
      clientContact: "",
      clientAddress: "",
      shipToAddress: "",
      invoiceNum: "INV-2026-001",
      issueDate: issue,
      paymentTerms: "15",
      dueDate: addDaysISO(issue, 15),
      poNumber: "",
      items: [
        {
          id: 1,
          name: "UI/UX Design & Frontend Development",
          desc: "Responsive web application design and production build",
          hsn: "998314",
          qty: 1,
          unit: "service",
          rate: 45000,
          tax: 18,
        },
      ],
      discountVal: 0,
      discountType: "pct", // 'pct' | 'flat'
      shipping: 0,
      amountPaid: 0,
      upiId: "",
      bankName: "",
      accountNo: "",
      ifsc: "",
      signatoryName: "",
      signatoryRole: "Authorized Signatory",
      sigDataUrl: null,
      notes: "Thank you for your business!",
      terms: TERM_PRESETS.standard,
    };
  }

  let state = createDefaultState();
  let nextItemId = 2;
  let lastUpiQrDataUrl = null;

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- Number Formatting & Amount in Words ---------- */
  function fmtMoney(amount, currencyCode, forPdf = false) {
    const cur = CURRENCIES[currencyCode] || CURRENCIES.INR;
    const n = Number(amount) || 0;
    const abs = Math.abs(n);
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split(".");

    let grouped;
    if (cur.indianNum) {
      // Indian numbering system: 12,34,567.89
      if (intPart.length <= 3) {
        grouped = intPart;
      } else {
        const last3 = intPart.slice(-3);
        const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
        grouped = `${rest},${last3}`;
      }
    } else {
      grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    const sym = forPdf ? cur.pdfSymbol : cur.symbol;
    return `${n < 0 ? "-" : ""}${sym}${grouped}.${decPart}`;
  }

  const ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function twoDigitsToWords(n) {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
  }

  function threeDigitsToWords(n) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    if (h && rem) return `${ONES[h]} Hundred ${twoDigitsToWords(rem)}`;
    if (h) return `${ONES[h]} Hundred`;
    return twoDigitsToWords(rem);
  }

  function intToWordsIndian(num) {
    if (num === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
    if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
    if (num) parts.push(threeDigitsToWords(num));
    return parts.join(" ");
  }

  function intToWordsIntl(num) {
    if (num === 0) return "Zero";
    const scales = ["", "Thousand", "Million", "Billion"];
    const parts = [];
    let scaleIdx = 0;
    while (num > 0 && scaleIdx < scales.length) {
      const chunk = num % 1000;
      if (chunk) {
        parts.unshift(scales[scaleIdx] ? `${threeDigitsToWords(chunk)} ${scales[scaleIdx]}` : threeDigitsToWords(chunk));
      }
      num = Math.floor(num / 1000);
      scaleIdx++;
    }
    return parts.join(" ");
  }

  function amountInWords(amount, currencyCode) {
    const cur = CURRENCIES[currencyCode] || CURRENCIES.INR;
    const abs = Math.max(0, Number(amount) || 0);
    const whole = Math.floor(abs);
    const frac = Math.round((abs - whole) * 100);
    const wholeWords = cur.indianNum ? intToWordsIndian(whole) : intToWordsIntl(whole);
    const prefix = cur.indianNum ? "Indian Rupees " : `${cur.name} `;
    if (frac > 0) {
      return `${prefix}${wholeWords} and ${twoDigitsToWords(frac)} ${cur.sub} Only`;
    }
    return `${prefix}${wholeWords} Only`;
  }

  /* ---------- Core Tax & Invoice Calculations ---------- */
  function calculateTotals() {
    const isGst = state.taxMode === "gst";
    const isNoTax = state.taxMode === "none";
    const isIntraState = isGst && state.sellerState === state.placeOfSupply;

    let rawSubtotal = 0;
    const lineCalcs = state.items.map((it) => {
      const qty = Math.max(0, Number(it.qty) || 0);
      const rate = Math.max(0, Number(it.rate) || 0);
      const taxPct = isNoTax ? 0 : Math.max(0, Math.min(100, Number(it.tax) || 0));
      const gross = qty * rate;

      let taxable;
      let taxAmt;
      let lineTotal;
      if (state.taxInclusive && taxPct > 0) {
        taxable = gross / (1 + taxPct / 100);
        taxAmt = gross - taxable;
        lineTotal = gross;
      } else {
        taxable = gross;
        taxAmt = taxable * (taxPct / 100);
        lineTotal = taxable + taxAmt;
      }

      rawSubtotal += taxable;
      return { ...it, qty, rate, taxPct, taxable, taxAmt, lineTotal };
    });

    const discInput = Math.max(0, Number(state.discountVal) || 0);
    const discountAmt =
      state.discountType === "pct"
        ? Math.min(rawSubtotal, rawSubtotal * (Math.min(100, discInput) / 100))
        : Math.min(rawSubtotal, discInput);

    // Proportionally adjust tax when discount applies to subtotal
    const discFactor = rawSubtotal > 0 ? Math.max(0, (rawSubtotal - discountAmt) / rawSubtotal) : 1;
    let totalTax = 0;
    for (const lc of lineCalcs) {
      totalTax += lc.taxAmt * discFactor;
    }

    const cgst = isGst && isIntraState ? totalTax / 2 : 0;
    const sgst = isGst && isIntraState ? totalTax / 2 : 0;
    const igst = isGst && !isIntraState ? totalTax : 0;

    const shipping = Math.max(0, Number(state.shipping) || 0);
    const unroundedTotal = Math.max(0, rawSubtotal - discountAmt + totalTax + shipping);
    const grandTotal = state.roundOff ? Math.round(unroundedTotal) : Number(unroundedTotal.toFixed(2));
    const roundOffDelta = grandTotal - unroundedTotal;
    const amountPaid = Math.max(0, Number(state.amountPaid) || 0);
    const balanceDue = Math.max(0, grandTotal - amountPaid);

    return {
      isGst,
      isNoTax,
      isIntraState,
      lineCalcs,
      subtotal: rawSubtotal,
      discountAmt,
      totalTax,
      cgst,
      sgst,
      igst,
      shipping,
      roundOffDelta,
      grandTotal,
      amountPaid,
      balanceDue,
    };
  }

  /* ---------- Escaping Helper ---------- */
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- UPI QR Code Local Renderer ---------- */
  function renderUpiQr(canvasEl, upiId, payeeName, amount, note) {
    lastUpiQrDataUrl = null;
    if (!canvasEl || !upiId || typeof window.qrcode !== "function") return false;

    const cleanUpi = upiId.trim();
    if (!cleanUpi.includes("@")) return false;

    const params = new URLSearchParams();
    params.set("pa", cleanUpi);
    params.set("pn", (payeeName || "Merchant").trim().slice(0, 40));
    if (amount > 0) params.set("am", Number(amount).toFixed(2));
    params.set("cu", "INR");
    if (note) params.set("tn", note.trim().slice(0, 40));

    const upiUri = `upi://pay?${params.toString()}`;

    try {
      const qr = window.qrcode(0, "M");
      qr.addData(upiUri);
      qr.make();

      const count = qr.getModuleCount();
      const size = 220;
      const pad = 12;
      const cell = (size - pad * 2) / count;

      canvasEl.width = size;
      canvasEl.height = size;
      const ctx = canvasEl.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#130032";

      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(Math.floor(pad + c * cell), Math.floor(pad + r * cell), Math.ceil(cell), Math.ceil(cell));
          }
        }
      }

      lastUpiQrDataUrl = canvasEl.toDataURL("image/png");
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ---------- Render Dynamic Line Items Editor ---------- */
  function renderItemsEditor() {
    const list = $("igItemsList");
    if (!list) return;
    const showHsn = state.showHsn && state.taxMode !== "none";
    const hideTax = state.taxMode === "none";

    list.innerHTML = "";
    state.items.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "ig-item-card";
      card.dataset.itemId = item.id;

      const qty = Math.max(0, Number(item.qty) || 0);
      const rate = Math.max(0, Number(item.rate) || 0);
      const taxPct = hideTax ? 0 : Math.max(0, Number(item.tax) || 0);
      const raw = qty * rate;
      const lineTotal = state.taxInclusive || hideTax ? raw : raw * (1 + taxPct / 100);

      card.innerHTML = `
        <div class="ig-item-top">
          <span class="ig-item-num">Item #${idx + 1}</span>
          <div class="ig-item-controls">
            <button type="button" class="ig-icon-mini" data-act="up" title="Move up" aria-label="Move item up" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="ig-icon-mini" data-act="down" title="Move down" aria-label="Move item down" ${idx === state.items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="ig-icon-mini" data-act="dup" title="Duplicate item" aria-label="Duplicate item">⧉</button>
            <button type="button" class="ig-icon-mini del" data-act="del" title="Remove item" aria-label="Remove item" ${state.items.length <= 1 ? "disabled" : ""}>×</button>
          </div>
        </div>

        <div class="ig-grid-2">
          <div class="ig-field">
            <label>Item / Service Name</label>
            <input type="text" class="ig-input" data-field="name" value="${esc(item.name)}" placeholder="e.g. Website Design" />
          </div>
          <div class="ig-field">
            <label>Description (Optional)</label>
            <input type="text" class="ig-input" data-field="desc" value="${esc(item.desc)}" placeholder="Brief deliverable details" />
          </div>
        </div>

        <div class="ig-item-metrics ${showHsn ? "has-hsn" : ""}">
          ${
            showHsn
              ? `<div class="ig-field">
                  <label>HSN / SAC</label>
                  <input type="text" class="ig-input" data-field="hsn" value="${esc(item.hsn)}" placeholder="998314" maxlength="12" />
                </div>`
              : ""
          }
          <div class="ig-field">
            <label>Qty</label>
            <input type="number" class="ig-input" data-field="qty" value="${item.qty}" min="0" step="any" />
          </div>
          <div class="ig-field">
            <label>Unit</label>
            <select class="ig-select" data-field="unit">
              ${UNITS.map((u) => `<option value="${u}" ${u === item.unit ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
          <div class="ig-field">
            <label>Rate (${esc(CURRENCIES[state.currency]?.symbol || "₹")})</label>
            <input type="number" class="ig-input" data-field="rate" value="${item.rate}" min="0" step="any" />
          </div>
          ${
            !hideTax
              ? `<div class="ig-field">
                  <label>${state.taxMode === "gst" ? "GST %" : "Tax %"}</label>
                  <input type="number" class="ig-input" data-field="tax" value="${item.tax}" min="0" max="100" step="any" />
                </div>`
              : ""
          }
        </div>

        <div class="ig-line-total-bar">
          <span>Line Amount${!hideTax ? (state.taxInclusive ? " (incl. tax)" : " (incl. computed tax)") : ""}</span>
          <strong data-line-total>${fmtMoney(lineTotal, state.currency)}</strong>
        </div>
      `;

      // Bind field changes
      card.querySelectorAll("[data-field]").forEach((el) => {
        el.addEventListener("input", () => {
          const key = el.dataset.field;
          item[key] = el.type === "number" ? parseFloat(el.value) || 0 : el.value;
          const q = Math.max(0, Number(item.qty) || 0);
          const r = Math.max(0, Number(item.rate) || 0);
          const t = state.taxMode === "none" ? 0 : Math.max(0, Number(item.tax) || 0);
          const lt = state.taxInclusive || state.taxMode === "none" ? q * r : q * r * (1 + t / 100);
          const totEl = card.querySelector("[data-line-total]");
          if (totEl) totEl.textContent = fmtMoney(lt, state.currency);
          renderPreview();
        });
      });

      // Bind item actions
      card.querySelectorAll("[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          if (act === "del" && state.items.length > 1) {
            state.items.splice(idx, 1);
          } else if (act === "dup") {
            state.items.splice(idx + 1, 0, { ...item, id: nextItemId++ });
          } else if (act === "up" && idx > 0) {
            [state.items[idx - 1], state.items[idx]] = [state.items[idx], state.items[idx - 1]];
          } else if (act === "down" && idx < state.items.length - 1) {
            [state.items[idx + 1], state.items[idx]] = [state.items[idx], state.items[idx + 1]];
          }
          renderItemsEditor();
          renderPreview();
        });
      });

      list.appendChild(card);
    });
  }

  /* ---------- Render Live A4 Invoice Preview ---------- */
  function renderPreview() {
    const paper = $("invPaper");
    if (!paper) return;

    const calc = calculateTotals();
    const cur = state.currency;
    const showHsn = state.showHsn && !calc.isNoTax;

    // Update top tax badge & summary strip
    const badge = $("igTaxModeBadge");
    if (badge) {
      if (state.taxMode === "none") badge.textContent = "Non-GST / Tax Exempt";
      else if (state.taxMode === "simple") badge.textContent = "Standard Tax / VAT";
      else badge.textContent = calc.isIntraState ? "GST: Intra-State (CGST + SGST)" : "GST: Inter-State (IGST)";
    }

    const summaryTotalEl = $("igPreviewSummaryTotal");
    if (summaryTotalEl) {
      summaryTotalEl.textContent = `Balance Due: ${fmtMoney(calc.balanceDue, cur)}`;
    }

    paper.dataset.template = state.template;
    paper.style.setProperty("--inv-accent", state.accent);

    const hasBank = state.bankName.trim() || state.accountNo.trim() || state.ifsc.trim();
    const hasUpi = state.upiId.trim().includes("@") && cur === "INR";

    const sellerMetaLines = [
      state.sellerAddress.trim(),
      state.sellerContact.trim(),
      state.sellerGstin.trim() ? `GSTIN / Tax ID: ${state.sellerGstin.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const clientMetaLines = [
      state.clientAddress.trim(),
      state.clientContact.trim(),
      state.clientGstin.trim() ? `GSTIN / Tax ID: ${state.clientGstin.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    paper.innerHTML = `
      <header class="inv-paper-head">
        <div class="inv-brand-block">
          ${state.logoDataUrl ? `<img class="inv-paper-logo" src="${state.logoDataUrl}" alt="Business Logo" />` : ""}
          <h2 class="inv-seller-name">${esc(state.sellerName.trim() || "Your Business Name")}</h2>
          ${sellerMetaLines ? `<div class="inv-muted-head">${esc(sellerMetaLines)}</div>` : ""}
        </div>

        <div class="inv-doc-block">
          <h1 class="inv-doc-type">${esc(state.docType)}</h1>
          <div class="inv-doc-num"># ${esc(state.invoiceNum.trim() || "INV-001")}</div>
          ${state.poNumber.trim() ? `<div class="inv-muted-head">Ref / PO: ${esc(state.poNumber.trim())}</div>` : ""}
        </div>
      </header>

      <div class="inv-paper-body">
        <div class="inv-parties-grid ${state.showShipTo ? "has-ship" : ""}">
          <div class="inv-party-box">
            <span class="inv-mini-label">Bill To</span>
            <span class="inv-party-title">${esc(state.clientName.trim() || "Client Name")}</span>
            ${clientMetaLines ? `<span class="inv-party-text">${esc(clientMetaLines)}</span>` : ""}
          </div>

          ${
            state.showShipTo
              ? `<div class="inv-party-box">
                  <span class="inv-mini-label">Ship To</span>
                  <span class="inv-party-text">${esc(state.shipToAddress.trim() || "Same as billing address")}</span>
                </div>`
              : ""
          }

          <div class="inv-party-box" style="${state.showShipTo ? "" : "text-align:right;align-items:flex-end"}">
            <span class="inv-mini-label">Summary</span>
            <span class="inv-party-title" style="color:var(--inv-accent);font-size:17px">${fmtMoney(calc.balanceDue, cur)}</span>
            <span class="inv-party-text">${calc.amountPaid > 0 ? "Balance Due" : "Total Payable"}</span>
          </div>
        </div>

        <div class="inv-meta-strip">
          <div class="inv-meta-cell">
            <span>Invoice Date</span>
            <strong>${esc(fmtDisplayDate(state.issueDate))}</strong>
          </div>
          <div class="inv-meta-cell">
            <span>Due Date</span>
            <strong>${esc(fmtDisplayDate(state.dueDate))}</strong>
          </div>
          ${
            calc.isGst
              ? `<div class="inv-meta-cell">
                  <span>Place of Supply</span>
                  <strong>${esc(state.placeOfSupply)}</strong>
                </div>`
              : ""
          }
          <div class="inv-meta-cell">
            <span>Currency</span>
            <strong>${esc(cur)}</strong>
          </div>
        </div>

        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th style="width:28px">#</th>
                <th>Item &amp; Description</th>
                ${showHsn ? `<th>HSN/SAC</th>` : ""}
                <th class="num">Qty</th>
                <th class="num">Rate</th>
                ${!calc.isNoTax ? `<th class="num">${calc.isGst ? "GST" : "Tax"}</th>` : ""}
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${calc.lineCalcs
                .map(
                  (lc, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>
                      <div class="inv-item-name">${esc(lc.name || "Untitled item")}</div>
                      ${lc.desc ? `<div class="inv-item-desc">${esc(lc.desc)}</div>` : ""}
                    </td>
                    ${showHsn ? `<td>${esc(lc.hsn || "—")}</td>` : ""}
                    <td class="num">${lc.qty} ${esc(lc.unit)}</td>
                    <td class="num">${fmtMoney(lc.rate, cur)}</td>
                    ${!calc.isNoTax ? `<td class="num">${lc.taxPct}%</td>` : ""}
                    <td class="num"><strong>${fmtMoney(lc.lineTotal, cur)}</strong></td>
                  </tr>
                `
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="inv-summary-row">
          <div class="inv-left-notes">
            <div class="inv-words-box">
              <strong>Total In Words</strong>
              ${esc(amountInWords(calc.grandTotal, cur))}
            </div>

            ${
              hasBank || hasUpi
                ? `<div class="inv-pay-box">
                    ${
                      hasUpi
                        ? `<div class="inv-qr-wrap">
                            <canvas id="invLiveQrCanvas" aria-label="UPI Payment QR Code"></canvas>
                            <span>Scan to Pay (UPI)</span>
                          </div>`
                        : ""
                    }
                    <div class="inv-bank-details">
                      <span class="inv-mini-label" style="margin-bottom:2px">Payment Details</span>
                      ${hasUpi ? `<span><strong>UPI ID:</strong> ${esc(state.upiId.trim())}</span>` : ""}
                      ${state.bankName.trim() ? `<span><strong>Bank:</strong> ${esc(state.bankName.trim())}</span>` : ""}
                      ${state.accountNo.trim() ? `<span><strong>A/C No:</strong> ${esc(state.accountNo.trim())}</span>` : ""}
                      ${state.ifsc.trim() ? `<span><strong>IFSC / SWIFT:</strong> ${esc(state.ifsc.trim())}</span>` : ""}
                    </div>
                  </div>`
                : ""
            }
          </div>

          <div class="inv-totals-box">
            <div class="inv-tot-line">
              <span>Taxable Subtotal</span>
              <span>${fmtMoney(calc.subtotal, cur)}</span>
            </div>
            ${
              calc.discountAmt > 0
                ? `<div class="inv-tot-line">
                    <span>Discount${state.discountType === "pct" ? ` (${state.discountVal}%)` : ""}</span>
                    <span>− ${fmtMoney(calc.discountAmt, cur)}</span>
                  </div>`
                : ""
            }
            ${
              calc.isGst && calc.isIntraState && calc.totalTax > 0
                ? `<div class="inv-tot-line">
                    <span>CGST</span>
                    <span>${fmtMoney(calc.cgst, cur)}</span>
                  </div>
                  <div class="inv-tot-line">
                    <span>SGST</span>
                    <span>${fmtMoney(calc.sgst, cur)}</span>
                  </div>`
                : ""
            }
            ${
              calc.isGst && !calc.isIntraState && calc.totalTax > 0
                ? `<div class="inv-tot-line">
                    <span>IGST</span>
                    <span>${fmtMoney(calc.igst, cur)}</span>
                  </div>`
                : ""
            }
            ${
              !calc.isGst && !calc.isNoTax && calc.totalTax > 0
                ? `<div class="inv-tot-line">
                    <span>Tax / VAT</span>
                    <span>${fmtMoney(calc.totalTax, cur)}</span>
                  </div>`
                : ""
            }
            ${
              calc.shipping > 0
                ? `<div class="inv-tot-line">
                    <span>Shipping / Extra</span>
                    <span>${fmtMoney(calc.shipping, cur)}</span>
                  </div>`
                : ""
            }
            ${
              state.roundOff && Math.abs(calc.roundOffDelta) >= 0.005
                ? `<div class="inv-tot-line">
                    <span>Round Off</span>
                    <span>${calc.roundOffDelta >= 0 ? "+" : ""}${calc.roundOffDelta.toFixed(2)}</span>
                  </div>`
                : ""
            }
            <div class="inv-tot-line grand">
              <span>Grand Total</span>
              <span>${fmtMoney(calc.grandTotal, cur)}</span>
            </div>
            ${
              calc.amountPaid > 0
                ? `<div class="inv-tot-line">
                    <span>Amount Paid</span>
                    <span>− ${fmtMoney(calc.amountPaid, cur)}</span>
                  </div>
                  <div class="inv-tot-line balance">
                    <span>Balance Due</span>
                    <span>${fmtMoney(calc.balanceDue, cur)}</span>
                  </div>`
                : ""
            }
          </div>
        </div>

        <div class="inv-bottom-grid">
          <div class="inv-notes-block">
            ${
              state.notes.trim()
                ? `<div><span class="inv-mini-label" style="display:block;margin-bottom:2px">Notes</span>${esc(state.notes.trim())}</div>`
                : ""
            }
            ${
              state.terms.trim()
                ? `<div><span class="inv-mini-label" style="display:block;margin-bottom:2px">Terms &amp; Conditions</span>${esc(state.terms.trim())}</div>`
                : ""
            }
          </div>

          <div class="inv-sig-block">
            ${state.sigDataUrl ? `<img src="${state.sigDataUrl}" alt="Authorized signature" />` : `<div style="height:36px"></div>`}
            <div class="inv-sig-line"></div>
            ${state.signatoryName.trim() ? `<span class="inv-sig-name">${esc(state.signatoryName.trim())}</span>` : ""}
            <span class="inv-sig-role">${esc(state.signatoryRole.trim() || "Authorized Signatory")}</span>
          </div>
        </div>
      </div>
    `;

    if (hasUpi) {
      const qrCanvas = $("invLiveQrCanvas");
      renderUpiQr(
        qrCanvas,
        state.upiId,
        state.sellerName || "Open Sign Merchant",
        calc.balanceDue > 0 ? calc.balanceDue : calc.grandTotal,
        `Invoice ${state.invoiceNum}`
      );
    } else {
      lastUpiQrDataUrl = null;
    }
  }

  /* ---------- Hex Color to pdf-lib RGB ---------- */
  function hexToRgbTuple(hex) {
    const clean = (hex || "#4C00FF").replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255 || 0;
    const g = parseInt(clean.slice(2, 4), 16) / 255 || 0;
    const b = parseInt(clean.slice(4, 6), 16) / 255 || 0;
    return [r, g, b];
  }

  function sanitizePdfText(str) {
    return String(str || "")
      .replace(/₹/g, "Rs. ")
      .replace(/€/g, "EUR ")
      .replace(/£/g, "GBP ")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, "-")
      .replace(/\u00B7/g, "|")
      .replace(/[^\x20-\x7E\n]/g, " ");
  }

  function wrapPdfLines(text, font, size, maxWidth) {
    const out = [];
    const paras = sanitizePdfText(text).split("\n");
    for (const para of paras) {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          cur = test;
        } else {
          if (cur) out.push(cur);
          cur = w;
        }
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  /* ---------- Vector A4 PDF Builder (pdf-lib, 100% Browser-Based) ---------- */
  async function generateInvoicePdfBytes() {
    if (!window.PDFLib) throw new Error("PDF generator (pdf-lib) failed to load.");
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

    const calc = calculateTotals();
    const cur = state.currency;
    const showHsn = state.showHsn && !calc.isNoTax;

    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 40;
    const W = PAGE_W - M * 2;

    const [ar, ag, ab] = hexToRgbTuple(state.accent);
    const COL_ACCENT = rgb(ar, ag, ab);
    const COL_INK = rgb(0.075, 0, 0.196);
    const COL_MUTED = rgb(0.34, 0.3, 0.42);
    const COL_LINE = rgb(0.86, 0.84, 0.91);
    const COL_TINT = rgb(0.97, 0.96, 0.985);
    const COL_WHITE = rgb(1, 1, 1);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - M;

    const ensureSpace = (needed) => {
      if (y - needed < M + 28) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - M;
      }
    };

    const drawRight = (txt, rightX, yy, size, font, color) => {
      const clean = sanitizePdfText(txt);
      const tw = font.widthOfTextAtSize(clean, size);
      page.drawText(clean, { x: rightX - tw, y: yy, size, font, color });
    };

    // Embed optional PNG images safely
    let logoImg = null;
    if (state.logoDataUrl) {
      try {
        logoImg = await doc.embedPng(state.logoDataUrl);
      } catch (_) {}
    }

    let sigImg = null;
    if (state.sigDataUrl) {
      try {
        sigImg = await doc.embedPng(state.sigDataUrl);
      } catch (_) {}
    }

    let qrImg = null;
    if (lastUpiQrDataUrl && state.upiId.trim().includes("@") && cur === "INR") {
      try {
        qrImg = await doc.embedPng(lastUpiQrDataUrl);
      } catch (_) {}
    }

    // ---------- Header Band ----------
    const isModern = state.template === "modern";
    const headHeight = 104;
    if (isModern) {
      page.drawRectangle({ x: 0, y: PAGE_H - headHeight, width: PAGE_W, height: headHeight, color: COL_ACCENT });
    } else if (state.template === "spreadsheet") {
      page.drawRectangle({ x: 0, y: PAGE_H - headHeight, width: PAGE_W, height: headHeight, color: COL_TINT });
      page.drawLine({ start: { x: 0, y: PAGE_H - headHeight }, end: { x: PAGE_W, y: PAGE_H - headHeight }, thickness: 1.5, color: COL_INK });
    } else {
      page.drawLine({ start: { x: M, y: PAGE_H - headHeight }, end: { x: PAGE_W - M, y: PAGE_H - headHeight }, thickness: state.template === "minimal" ? 0.8 : 2, color: COL_ACCENT });
    }

    const headInk = isModern ? COL_WHITE : COL_INK;
    const headMuted = isModern ? rgb(0.92, 0.9, 1) : COL_MUTED;
    const headAccent = isModern ? COL_WHITE : COL_ACCENT;

    let leftY = PAGE_H - 28;
    if (logoImg) {
      const scale = Math.min(110 / logoImg.width, 32 / logoImg.height, 1);
      const lw = logoImg.width * scale;
      const lh = logoImg.height * scale;
      if (isModern) {
        page.drawRectangle({ x: M - 3, y: leftY - lh - 2, width: lw + 6, height: lh + 4, color: COL_WHITE });
      }
      page.drawImage(logoImg, { x: M, y: leftY - lh, width: lw, height: lh });
      leftY -= lh + 10;
    }

    page.drawText(sanitizePdfText(state.sellerName.trim() || "Your Business Name"), {
      x: M,
      y: leftY - 6,
      size: 14,
      font: fontBold,
      color: headInk,
    });
    leftY -= 20;

    const sellerSubLines = wrapPdfLines(
      [state.sellerAddress.trim(), state.sellerContact.trim(), state.sellerGstin.trim() ? `GSTIN: ${state.sellerGstin.trim()}` : ""]
        .filter(Boolean)
        .join(" | "),
      fontReg,
      8.5,
      W * 0.56
    );
    for (const ln of sellerSubLines.slice(0, 3)) {
      page.drawText(ln, { x: M, y: leftY, size: 8.5, font: fontReg, color: headMuted });
      leftY -= 11;
    }

    // Right side of header: Doc Type + Invoice #
    drawRight(state.docType, PAGE_W - M, PAGE_H - 38, 18, fontBold, headAccent);
    drawRight(`# ${state.invoiceNum.trim() || "INV-001"}`, PAGE_W - M, PAGE_H - 56, 11, fontBold, headInk);
    if (state.poNumber.trim()) {
      drawRight(`Ref / PO: ${state.poNumber.trim()}`, PAGE_W - M, PAGE_H - 72, 9, fontReg, headMuted);
    }

    y = PAGE_H - headHeight - 22;

    // ---------- Parties & Balance Row ----------
    const billLines = wrapPdfLines(
      [state.clientAddress.trim(), state.clientContact.trim(), state.clientGstin.trim() ? `GSTIN: ${state.clientGstin.trim()}` : ""]
        .filter(Boolean)
        .join("\n"),
      fontReg,
      9,
      state.showShipTo ? W * 0.34 : W * 0.52
    );

    page.drawText("BILL TO", { x: M, y, size: 8, font: fontBold, color: COL_ACCENT });
    page.drawText(sanitizePdfText(state.clientName.trim() || "Client Name"), { x: M, y: y - 14, size: 11.5, font: fontBold, color: COL_INK });

    let by = y - 27;
    for (const ln of billLines.slice(0, 5)) {
      page.drawText(ln, { x: M, y: by, size: 9, font: fontReg, color: COL_MUTED });
      by -= 12;
    }

    if (state.showShipTo) {
      const sx = M + W * 0.37;
      page.drawText("SHIP TO", { x: sx, y, size: 8, font: fontBold, color: COL_ACCENT });
      const shipLines = wrapPdfLines(state.shipToAddress.trim() || "Same as billing address", fontReg, 9, W * 0.32);
      let sy = y - 14;
      for (const ln of shipLines.slice(0, 5)) {
        page.drawText(ln, { x: sx, y: sy, size: 9, font: fontReg, color: COL_MUTED });
        sy -= 12;
      }
      by = Math.min(by, sy);
    }

    drawRight(calc.amountPaid > 0 ? "BALANCE DUE" : "TOTAL PAYABLE", PAGE_W - M, y, 8, fontBold, COL_ACCENT);
    drawRight(fmtMoney(calc.balanceDue, cur, true), PAGE_W - M, y - 18, 15, fontBold, COL_INK);

    y = Math.min(by, y - 42) - 10;

    // ---------- Metadata Strip ----------
    page.drawRectangle({ x: M, y: y - 34, width: W, height: 34, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.7 });
    const metaCols = [
      { label: "INVOICE DATE", val: fmtDisplayDate(state.issueDate) },
      { label: "DUE DATE", val: fmtDisplayDate(state.dueDate) },
      ...(calc.isGst ? [{ label: "PLACE OF SUPPLY", val: state.placeOfSupply }] : []),
      { label: "CURRENCY", val: cur },
    ];
    const metaColW = W / metaCols.length;
    metaCols.forEach((mc, i) => {
      const mx = M + 10 + i * metaColW;
      page.drawText(mc.label, { x: mx, y: y - 13, size: 7.5, font: fontBold, color: COL_MUTED });
      page.drawText(sanitizePdfText(mc.val), { x: mx, y: y - 26, size: 9.5, font: fontBold, color: COL_INK });
    });

    y -= 50;

    // ---------- Line Items Table ----------
    const drawTableHeader = () => {
      ensureSpace(36);
      const isMinimal = state.template === "minimal";
      page.drawRectangle({
        x: M,
        y: y - 22,
        width: W,
        height: 22,
        color: isMinimal ? COL_TINT : COL_ACCENT,
      });
      const thColor = isMinimal ? COL_INK : COL_WHITE;
      page.drawText("#", { x: M + 6, y: y - 15, size: 8, font: fontBold, color: thColor });
      page.drawText("ITEM & DESCRIPTION", { x: M + 24, y: y - 15, size: 8, font: fontBold, color: thColor });
      if (showHsn) page.drawText("HSN/SAC", { x: M + 235, y: y - 15, size: 8, font: fontBold, color: thColor });
      drawRight("QTY", M + 322, y - 15, 8, fontBold, thColor);
      drawRight("RATE", M + 392, y - 15, 8, fontBold, thColor);
      if (!calc.isNoTax) drawRight(calc.isGst ? "GST" : "TAX", M + 438, y - 15, 8, fontBold, thColor);
      drawRight("AMOUNT", PAGE_W - M - 6, y - 15, 8, fontBold, thColor);
      y -= 28;
    };

    drawTableHeader();

    const descMaxW = showHsn ? 202 : 250;
    calc.lineCalcs.forEach((lc, idx) => {
      const nameLines = wrapPdfLines(lc.name || "Untitled item", fontBold, 9.5, descMaxW);
      const descLines = lc.desc ? wrapPdfLines(lc.desc, fontReg, 8.2, descMaxW) : [];
      const rowH = Math.max(24, nameLines.length * 12 + descLines.length * 10.5 + 10);

      if (y - rowH < M + 40) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - M;
        drawTableHeader();
      }

      page.drawText(String(idx + 1), { x: M + 6, y: y - 10, size: 9, font: fontReg, color: COL_MUTED });

      let ty = y - 10;
      for (const nl of nameLines) {
        page.drawText(nl, { x: M + 24, y: ty, size: 9.5, font: fontBold, color: COL_INK });
        ty -= 12;
      }
      for (const dl of descLines) {
        page.drawText(dl, { x: M + 24, y: ty, size: 8.2, font: fontReg, color: COL_MUTED });
        ty -= 10.5;
      }

      if (showHsn) {
        page.drawText(sanitizePdfText(lc.hsn || "-"), { x: M + 235, y: y - 10, size: 8.5, font: fontReg, color: COL_MUTED });
      }
      drawRight(`${lc.qty} ${lc.unit}`, M + 322, y - 10, 8.8, fontReg, COL_INK);
      drawRight(fmtMoney(lc.rate, cur, true), M + 392, y - 10, 8.8, fontReg, COL_INK);
      if (!calc.isNoTax) drawRight(`${lc.taxPct}%`, M + 438, y - 10, 8.8, fontReg, COL_MUTED);
      drawRight(fmtMoney(lc.lineTotal, cur, true), PAGE_W - M - 6, y - 10, 9.2, fontBold, COL_INK);

      y -= rowH;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y: y + 4 }, thickness: 0.6, color: COL_LINE });
    });

    y -= 12;

    // ---------- Totals + Words + UPI QR / Bank Details ----------
    ensureSpace(175);
    const summaryStartY = y;

    // Left block: Amount in Words + Payment Details / UPI QR
    const leftW = W * 0.52;
    const wordsLines = wrapPdfLines(amountInWords(calc.grandTotal, cur), fontReg, 8.5, leftW - 16);
    const wordsBoxH = Math.max(36, wordsLines.length * 11 + 20);
    page.drawRectangle({ x: M, y: y - wordsBoxH, width: leftW, height: wordsBoxH, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.6 });
    page.drawText("TOTAL IN WORDS", { x: M + 8, y: y - 13, size: 7.5, font: fontBold, color: COL_ACCENT });
    let wy = y - 25;
    for (const wl of wordsLines) {
      page.drawText(wl, { x: M + 8, y: wy, size: 8.5, font: fontReg, color: COL_INK });
      wy -= 11;
    }

    let leftBottomY = y - wordsBoxH - 12;

    const bankEntries = [
      state.upiId.trim() && cur === "INR" ? `UPI ID: ${state.upiId.trim()}` : "",
      state.bankName.trim() ? `Bank: ${state.bankName.trim()}` : "",
      state.accountNo.trim() ? `A/C No: ${state.accountNo.trim()}` : "",
      state.ifsc.trim() ? `IFSC / SWIFT: ${state.ifsc.trim()}` : "",
    ].filter(Boolean);

    if (qrImg || bankEntries.length) {
      const payBoxH = Math.max(qrImg ? 84 : 24 + bankEntries.length * 12, 58);
      page.drawRectangle({ x: M, y: leftBottomY - payBoxH, width: leftW, height: payBoxH, color: COL_WHITE, borderColor: COL_LINE, borderWidth: 0.7 });

      let textStartX = M + 10;
      if (qrImg) {
        page.drawImage(qrImg, { x: M + 8, y: leftBottomY - 72, width: 62, height: 62 });
        page.drawText("SCAN TO PAY", { x: M + 14, y: leftBottomY - 80, size: 6.5, font: fontBold, color: COL_ACCENT });
        textStartX = M + 78;
      }

      page.drawText("PAYMENT DETAILS", { x: textStartX, y: leftBottomY - 14, size: 7.5, font: fontBold, color: COL_ACCENT });
      let py = leftBottomY - 27;
      for (const be of bankEntries) {
        const lines = wrapPdfLines(be, fontReg, 8.3, M + leftW - textStartX - 8);
        for (const l of lines) {
          page.drawText(l, { x: textStartX, y: py, size: 8.3, font: fontReg, color: COL_INK });
          py -= 11.5;
        }
      }
      leftBottomY -= payBoxH + 10;
    }

    // Right block: Totals Box
    const totX = M + W * 0.56;
    const totW = W * 0.44;
    const totRows = [["Taxable Subtotal", fmtMoney(calc.subtotal, cur, true)]];
    if (calc.discountAmt > 0) {
      totRows.push([
        `Discount${state.discountType === "pct" ? ` (${state.discountVal}%)` : ""}`,
        `- ${fmtMoney(calc.discountAmt, cur, true)}`,
      ]);
    }
    if (calc.isGst && calc.isIntraState && calc.totalTax > 0) {
      totRows.push(["CGST", fmtMoney(calc.cgst, cur, true)]);
      totRows.push(["SGST", fmtMoney(calc.sgst, cur, true)]);
    } else if (calc.isGst && !calc.isIntraState && calc.totalTax > 0) {
      totRows.push(["IGST", fmtMoney(calc.igst, cur, true)]);
    } else if (!calc.isGst && !calc.isNoTax && calc.totalTax > 0) {
      totRows.push(["Tax / VAT", fmtMoney(calc.totalTax, cur, true)]);
    }
    if (calc.shipping > 0) totRows.push(["Shipping / Extra", fmtMoney(calc.shipping, cur, true)]);
    if (state.roundOff && Math.abs(calc.roundOffDelta) >= 0.005) {
      totRows.push(["Round Off", `${calc.roundOffDelta >= 0 ? "+" : ""}${calc.roundOffDelta.toFixed(2)}`]);
    }

    const totBoxH = totRows.length * 16 + 44 + (calc.amountPaid > 0 ? 44 : 0);
    page.drawRectangle({ x: totX, y: summaryStartY - totBoxH, width: totW, height: totBoxH, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.7 });

    let ry = summaryStartY - 16;
    for (const [lbl, val] of totRows) {
      page.drawText(sanitizePdfText(lbl), { x: totX + 10, y: ry, size: 9, font: fontReg, color: COL_MUTED });
      drawRight(val, totX + totW - 10, ry, 9, fontReg, COL_INK);
      ry -= 16;
    }

    page.drawLine({ start: { x: totX + 10, y: ry + 5 }, end: { x: totX + totW - 10, y: ry + 5 }, thickness: 1.2, color: COL_ACCENT });
    ry -= 10;
    page.drawText("Grand Total", { x: totX + 10, y: ry, size: 11, font: fontBold, color: COL_INK });
    drawRight(fmtMoney(calc.grandTotal, cur, true), totX + totW - 10, ry, 11, fontBold, COL_INK);

    if (calc.amountPaid > 0) {
      ry -= 18;
      page.drawText("Amount Paid", { x: totX + 10, y: ry, size: 9, font: fontReg, color: COL_MUTED });
      drawRight(`- ${fmtMoney(calc.amountPaid, cur, true)}`, totX + totW - 10, ry, 9, fontReg, COL_INK);
      ry -= 22;
      page.drawRectangle({ x: totX + 8, y: ry - 6, width: totW - 16, height: 22, color: COL_ACCENT });
      page.drawText("Balance Due", { x: totX + 14, y: ry + 1, size: 10, font: fontBold, color: COL_WHITE });
      drawRight(fmtMoney(calc.balanceDue, cur, true), totX + totW - 14, ry + 1, 10, fontBold, COL_WHITE);
    }

    y = Math.min(leftBottomY, summaryStartY - totBoxH - 14);

    // ---------- Notes, Terms & Authorized Signatory ----------
    ensureSpace(105);
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.7, color: COL_LINE });
    y -= 16;

    let ny = y;
    const notesMaxW = W * 0.62;
    if (state.notes.trim()) {
      page.drawText("NOTES", { x: M, y: ny, size: 7.5, font: fontBold, color: COL_ACCENT });
      ny -= 12;
      for (const ln of wrapPdfLines(state.notes.trim(), fontReg, 8.5, notesMaxW).slice(0, 4)) {
        page.drawText(ln, { x: M, y: ny, size: 8.5, font: fontReg, color: COL_MUTED });
        ny -= 11;
      }
      ny -= 6;
    }

    if (state.terms.trim()) {
      page.drawText("TERMS & CONDITIONS", { x: M, y: ny, size: 7.5, font: fontBold, color: COL_ACCENT });
      ny -= 12;
      for (const ln of wrapPdfLines(state.terms.trim(), fontReg, 8.2, notesMaxW).slice(0, 5)) {
        page.drawText(ln, { x: M, y: ny, size: 8.2, font: fontReg, color: COL_MUTED });
        ny -= 10.5;
      }
    }

    // Right: Authorized Signature
    let sy = y - 6;
    if (sigImg) {
      const sc = Math.min(130 / sigImg.width, 40 / sigImg.height, 1);
      const sw = sigImg.width * sc;
      const sh = sigImg.height * sc;
      page.drawImage(sigImg, { x: PAGE_W - M - sw, y: sy - sh, width: sw, height: sh });
      sy -= sh + 6;
    } else {
      sy -= 38;
    }

    page.drawLine({ start: { x: PAGE_W - M - 140, y: sy }, end: { x: PAGE_W - M, y: sy }, thickness: 1, color: COL_INK });
    sy -= 12;
    if (state.signatoryName.trim()) {
      drawRight(state.signatoryName.trim(), PAGE_W - M, sy, 9.5, fontBold, COL_INK);
      sy -= 12;
    }
    drawRight(state.signatoryRole.trim() || "Authorized Signatory", PAGE_W - M, sy, 8.2, fontReg, COL_MUTED);

    // Subtle page footer
    const pages = doc.getPages();
    pages.forEach((p, idx) => {
      p.drawText(`Generated with Open Sign  |  Page ${idx + 1} of ${pages.length}`, {
        x: M,
        y: 18,
        size: 7.5,
        font: fontReg,
        color: COL_MUTED,
      });
    });

    return await doc.save();
  }

  /* ---------- Image Normalization Helper (converts any upload to PNG dataUrl for pdf-lib) ---------- */
  function fileToPngDataUrl(file, removeWhiteBg = false) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxW = 700;
        const maxH = 300;
        const ratio = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * ratio));
        c.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);

        if (removeWhiteBg) {
          const imgData = ctx.getImageData(0, 0, c.width, c.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image file."));
      };
      img.src = url;
    });
  }

  /* ---------- Sync Form UI from State ---------- */
  function syncFormFromState() {
    $("igDocType").value = state.docType;
    $("igCurrency").value = state.currency;
    $("igTaxMode").value = state.taxMode;
    $("igShowHsn").checked = !!state.showHsn;
    $("igTaxInclusive").checked = !!state.taxInclusive;
    $("igShowShipTo").checked = !!state.showShipTo;
    $("igShipToWrap").hidden = !state.showShipTo;
    $("igRoundOff").checked = !!state.roundOff;

    $("igSellerName").value = state.sellerName;
    $("igSellerGstin").value = state.sellerGstin;
    $("igSellerState").value = state.sellerState;
    $("igSellerContact").value = state.sellerContact;
    $("igSellerAddress").value = state.sellerAddress;

    $("igClientName").value = state.clientName;
    $("igClientGstin").value = state.clientGstin;
    $("igPlaceOfSupply").value = state.placeOfSupply;
    $("igClientContact").value = state.clientContact;
    $("igClientAddress").value = state.clientAddress;
    $("igShipToAddress").value = state.shipToAddress;

    $("igInvoiceNum").value = state.invoiceNum;
    $("igIssueDate").value = state.issueDate;
    $("igPaymentTerms").value = state.paymentTerms;
    $("igDueDate").value = state.dueDate;
    $("igPoNumber").value = state.poNumber;

    $("igDiscountVal").value = state.discountVal;
    $("igDiscountType").value = state.discountType;
    $("igShipping").value = state.shipping;
    $("igAmountPaid").value = state.amountPaid;

    $("igUpiId").value = state.upiId;
    $("igBankName").value = state.bankName;
    $("igAccountNo").value = state.accountNo;
    $("igIfsc").value = state.ifsc;

    $("igSignatoryName").value = state.signatoryName;
    $("igSignatoryRole").value = state.signatoryRole;
    $("igNotes").value = state.notes;
    $("igTerms").value = state.terms;

    // Template buttons
    document.querySelectorAll("#igTemplateRow .ig-tpl-btn").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.tpl === state.template));
    });

    // Accent swatches
    document.querySelectorAll("#igSwatches .ig-swatch").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.hex === state.accent));
    });

    // Logo thumb
    const thumb = $("igLogoThumb");
    const placeholder = $("igLogoPlaceholder");
    const rmLogo = $("igRemoveLogoBtn");
    if (state.logoDataUrl) {
      thumb.src = state.logoDataUrl;
      thumb.hidden = false;
      placeholder.hidden = true;
      rmLogo.hidden = false;
    } else {
      thumb.hidden = true;
      placeholder.hidden = false;
      rmLogo.hidden = true;
    }

    // Signature thumb
    const sigMini = $("igSigMiniPreview");
    const clearSig = $("igClearSigBtn");
    if (state.sigDataUrl) {
      sigMini.src = state.sigDataUrl;
      sigMini.hidden = false;
      clearSig.hidden = false;
    } else {
      sigMini.hidden = true;
      clearSig.hidden = true;
    }

    renderItemsEditor();
    renderPreview();
  }

  /* ---------- Tally-Compatible XML Export ---------- */
  function buildTallyXml() {
    const calc = calculateTotals();
    const xmlEsc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const tallyDate = (state.issueDate || todayISO()).replace(/-/g, "");
    const lines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<ENVELOPE>`,
      `  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>`,
      `  <BODY>`,
      `    <IMPORTDATA>`,
      `      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>`,
      `      <REQUESTDATA>`,
      `        <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
      `          <VOUCHER VCHTYPE="Sales" ACTION="Create">`,
      `            <DATE>${tallyDate}</DATE>`,
      `            <VOUCHERNUMBER>${xmlEsc(state.invoiceNum)}</VOUCHERNUMBER>`,
      `            <PARTYLEDGERNAME>${xmlEsc(state.clientName || "Cash Customer")}</PARTYLEDGERNAME>`,
      `            <PARTYGSTIN>${xmlEsc(state.clientGstin)}</PARTYGSTIN>`,
      `            <PLACEOFSUPPLY>${xmlEsc(state.placeOfSupply)}</PLACEOFSUPPLY>`,
      `            <NARRATION>${xmlEsc(state.notes)}</NARRATION>`,
      `            <ALLLEDGERENTRIES.LIST>`,
      `              <LEDGERNAME>${xmlEsc(state.clientName || "Cash Customer")}</LEDGERNAME>`,
      `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
      `              <AMOUNT>-${calc.grandTotal.toFixed(2)}</AMOUNT>`,
      `            </ALLLEDGERENTRIES.LIST>`,
      `            <ALLLEDGERENTRIES.LIST>`,
      `              <LEDGERNAME>Sales Account</LEDGERNAME>`,
      `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
      `              <AMOUNT>${(calc.subtotal - calc.discountAmt).toFixed(2)}</AMOUNT>`,
      `            </ALLLEDGERENTRIES.LIST>`,
    ];
    if (calc.cgst > 0) {
      lines.push(
        `            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${calc.cgst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
        `            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output SGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${calc.sgst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`
      );
    } else if (calc.igst > 0) {
      lines.push(
        `            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${calc.igst.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`
      );
    } else if (calc.totalTax > 0) {
      lines.push(
        `            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output Tax</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${calc.totalTax.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`
      );
    }
    lines.push(
      `          </VOUCHER>`,
      `        </TALLYMESSAGE>`,
      `      </REQUESTDATA>`,
      `    </IMPORTDATA>`,
      `  </BODY>`,
      `</ENVELOPE>`
    );
    return lines.join("\n");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Quick Draw Signature Modal ---------- */
  function initDrawSignatureModal() {
    const dlg = $("igSigDialog");
    const canvas = $("igSigCanvas");
    const ctx = canvas?.getContext("2d");
    const applyBtn = $("igSigApply");
    if (!dlg || !canvas || !ctx) return;

    let drawing = false;
    let strokes = [];

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * canvas.width) / r.width,
        y: ((e.clientY - r.top) * canvas.height) / r.height,
      };
    };

    const redraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#130032";
      ctx.fillStyle = "#130032";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const pts of strokes) {
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (pts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
      applyBtn.disabled = strokes.length === 0;
    };

    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      strokes.push([pos(e)]);
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      e.preventDefault();
      strokes[strokes.length - 1].push(pos(e));
      redraw();
    });
    const end = () => {
      drawing = false;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    $("igDrawSigBtn").onclick = () => {
      strokes = [];
      redraw();
      dlg.showModal();
    };
    $("igSigClearPad").onclick = () => {
      strokes = [];
      redraw();
    };
    $("igSigCancel").onclick = () => dlg.close();
    $("igSigCloseTop").onclick = () => dlg.close();

    applyBtn.onclick = () => {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (d[(y * canvas.width + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        const out = document.createElement("canvas");
        out.width = maxX - minX + 24;
        out.height = maxY - minY + 24;
        out.getContext("2d").drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, 12, 12, maxX - minX + 1, maxY - minY + 1);
        state.sigDataUrl = out.toDataURL("image/png");
        syncFormFromState();
        toast("Authorized signature added to invoice.");
      }
      dlg.close();
    };
  }

  /* ---------- Initialization & Event Wiring ---------- */
  function init() {
    // Populate Indian State dropdowns
    const sellerSel = $("igSellerState");
    const supplySel = $("igPlaceOfSupply");
    for (const st of INDIAN_STATES) {
      const o1 = document.createElement("option");
      o1.value = st;
      o1.textContent = st;
      sellerSel.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = st;
      o2.textContent = st;
      supplySel.appendChild(o2);
    }

    // Build brand color swatches
    const swatchesEl = $("igSwatches");
    BRAND_SWATCHES.forEach((sw) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ig-swatch";
      b.style.background = sw.hex;
      b.dataset.hex = sw.hex;
      b.title = sw.name;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", sw.name);
      b.setAttribute("aria-checked", String(sw.hex === state.accent));
      b.addEventListener("click", () => {
        state.accent = sw.hex;
        swatchesEl.querySelectorAll(".ig-swatch").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        renderPreview();
      });
      swatchesEl.appendChild(b);
    });

    // Template switcher
    document.querySelectorAll("#igTemplateRow .ig-tpl-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.template = btn.dataset.tpl;
        document.querySelectorAll("#igTemplateRow .ig-tpl-btn").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
        renderPreview();
      });
    });

    // Mobile / Tablet workspace pane switcher
    const ws = $("igWorkspace");
    document.querySelectorAll(".ig-mobile-switcher button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pane = btn.dataset.pane;
        ws.dataset.mobilePane = pane;
        document.querySelectorAll(".ig-mobile-switcher button").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", String(on));
        });
        if (pane === "preview") renderPreview();
      });
    });

    // Bind simple input fields
    const bindField = (id, key, opts = {}) => {
      const el = $(id);
      if (!el) return;
      const evName = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
      el.addEventListener(evName, () => {
        if (el.type === "checkbox") state[key] = el.checked;
        else if (el.type === "number") state[key] = parseFloat(el.value) || 0;
        else state[key] = el.value;

        if (opts.onAfter) opts.onAfter();
        if (opts.rerenderItems) renderItemsEditor();
        renderPreview();
      });
    };

    bindField("igDocType", "docType");
    bindField("igCurrency", "currency", { rerenderItems: true });
    bindField("igTaxMode", "taxMode", { rerenderItems: true });
    bindField("igShowHsn", "showHsn", { rerenderItems: true });
    bindField("igTaxInclusive", "taxInclusive", { rerenderItems: true });
    bindField("igShowShipTo", "showShipTo", {
      onAfter: () => {
        $("igShipToWrap").hidden = !state.showShipTo;
      },
    });
    bindField("igRoundOff", "roundOff");

    bindField("igSellerName", "sellerName");
    bindField("igSellerGstin", "sellerGstin");
    bindField("igSellerState", "sellerState");
    bindField("igSellerContact", "sellerContact");
    bindField("igSellerAddress", "sellerAddress");

    bindField("igClientName", "clientName");
    bindField("igClientGstin", "clientGstin");
    bindField("igPlaceOfSupply", "placeOfSupply");
    bindField("igClientContact", "clientContact");
    bindField("igClientAddress", "clientAddress");
    bindField("igShipToAddress", "shipToAddress");

    bindField("igInvoiceNum", "invoiceNum");
    bindField("igPoNumber", "poNumber");
    bindField("igIssueDate", "issueDate", {
      onAfter: () => {
        if (state.paymentTerms !== "custom") {
          state.dueDate = addDaysISO(state.issueDate, state.paymentTerms);
          $("igDueDate").value = state.dueDate;
        }
      },
    });
    bindField("igPaymentTerms", "paymentTerms", {
      onAfter: () => {
        if (state.paymentTerms !== "custom") {
          state.dueDate = addDaysISO(state.issueDate, state.paymentTerms);
          $("igDueDate").value = state.dueDate;
        }
      },
    });
    bindField("igDueDate", "dueDate", {
      onAfter: () => {
        state.paymentTerms = "custom";
        $("igPaymentTerms").value = "custom";
      },
    });

    bindField("igDiscountVal", "discountVal");
    bindField("igDiscountType", "discountType");
    bindField("igShipping", "shipping");
    bindField("igAmountPaid", "amountPaid");

    bindField("igUpiId", "upiId");
    bindField("igBankName", "bankName");
    bindField("igAccountNo", "accountNo");
    bindField("igIfsc", "ifsc");

    bindField("igSignatoryName", "signatoryName");
    bindField("igSignatoryRole", "signatoryRole");
    bindField("igNotes", "notes");
    bindField("igTerms", "terms");

    // Add line item
    $("igAddItemBtn").onclick = () => {
      state.items.push({
        id: nextItemId++,
        name: "",
        desc: "",
        hsn: "",
        qty: 1,
        unit: "pcs",
        rate: 0,
        tax: state.taxMode === "none" ? 0 : 18,
      });
      renderItemsEditor();
      renderPreview();
    };

    // Logo upload & remove
    $("igLogoInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        state.logoDataUrl = await fileToPngDataUrl(f, false);
        syncFormFromState();
        toast("Business logo added.");
      } catch (err) {
        toast(err.message, "error");
      }
    });
    $("igRemoveLogoBtn").onclick = () => {
      state.logoDataUrl = null;
      syncFormFromState();
    };

    // Signature upload & remove
    $("igUploadSigInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        state.sigDataUrl = await fileToPngDataUrl(f, true);
        syncFormFromState();
        toast("Signature image added to invoice.");
      } catch (err) {
        toast(err.message, "error");
      }
    });
    $("igClearSigBtn").onclick = () => {
      state.sigDataUrl = null;
      syncFormFromState();
    };

    // Term presets
    document.querySelectorAll("[data-term-preset]").forEach((chip) => {
      chip.onclick = () => {
        const key = chip.dataset.termPreset;
        if (TERM_PRESETS[key]) {
          state.terms = TERM_PRESETS[key];
          $("igTerms").value = state.terms;
          renderPreview();
        }
      };
    });

    // Load Sample Indian GST Invoice
    $("igSampleBtn").onclick = () => {
      const issue = todayISO();
      state = {
        ...createDefaultState(),
        docType: "TAX INVOICE",
        currency: "INR",
        taxMode: "gst",
        template: state.template,
        accent: state.accent,
        showHsn: true,
        sellerName: "Creative Nerds Digital Pvt. Ltd.",
        sellerGstin: "27AAACC4821D1Z5",
        sellerState: "27 - Maharashtra",
        sellerContact: "billing@creativenerds.example · +91 98201 55432",
        sellerAddress: "402, Trade Tower, Lower Parel\nMumbai, Maharashtra 400013",
        clientName: "Horizon Ventures India LLP",
        clientGstin: "27AABCH9920M1Z9",
        placeOfSupply: "27 - Maharashtra",
        clientContact: "accounts@horizonventures.example",
        clientAddress: "Level 8, One BKC, Bandra Kurla Complex\nMumbai, Maharashtra 400051",
        invoiceNum: "CN/2026-27/048",
        issueDate: issue,
        paymentTerms: "15",
        dueDate: addDaysISO(issue, 15),
        poNumber: "PO-HV-2026-119",
        items: [
          {
            id: nextItemId++,
            name: "Brand Identity & Campaign Creatives",
            desc: "Social launch kit, digital banners, and motion ad templates",
            hsn: "998361",
            qty: 1,
            unit: "pkg",
            rate: 65000,
            tax: 18,
          },
          {
            id: nextItemId++,
            name: "Responsive Web Development",
            desc: "Custom landing page, performance tuning, and mobile QA",
            hsn: "998314",
            qty: 40,
            unit: "hrs",
            rate: 1500,
            tax: 18,
          },
        ],
        discountVal: 5,
        discountType: "pct",
        shipping: 0,
        amountPaid: 25000,
        upiId: "creativenerds@okhdfcbank",
        bankName: "HDFC Bank — Lower Parel Branch",
        accountNo: "50200048291044",
        ifsc: "HDFC0000240",
        signatoryName: "Rishabh Sharma",
        signatoryRole: "Director · Authorized Signatory",
        sigDataUrl: state.sigDataUrl,
        logoDataUrl: state.logoDataUrl,
        notes: "Thank you for partnering with us! Scan the UPI QR code or use NEFT/IMPS for instant settlement.",
        terms: TERM_PRESETS.gst,
      };
      syncFormFromState();
      toast("Loaded sample GST tax invoice.");
    };

    // Save Local Draft
    $("igSaveDraftBtn").onclick = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
        toast("Draft saved locally in your browser.");
      } catch (_) {
        toast("Unable to save draft (image may exceed browser storage limit).", "error");
      }
    };

    // Reset
    $("igResetBtn").onclick = () => {
      state = createDefaultState();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (_) {}
      syncFormFromState();
      toast("Invoice cleared.");
    };

    // Export JSON Backup
    $("igExportJsonBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const slug = (state.invoiceNum || "invoice").replace(/[^a-z0-9-_]+/gi, "-");
      downloadBlob(blob, `${slug}-backup.json`);
      toast("Exported invoice JSON backup.");
    };

    // Import JSON Backup
    $("igImportJsonInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!parsed || !Array.isArray(parsed.items)) throw new Error("Invalid invoice JSON file.");
        state = { ...createDefaultState(), ...parsed };
        nextItemId = Math.max(10, ...state.items.map((x) => Number(x.id) || 0)) + 1;
        syncFormFromState();
        toast("Invoice restored from JSON backup.");
      } catch (err) {
        toast(err.message || "Could not import JSON file.", "error");
      }
    });

    // Export Tally XML
    $("igExportXmlBtn").onclick = () => {
      const xml = buildTallyXml();
      const blob = new Blob([xml], { type: "application/xml" });
      const slug = (state.invoiceNum || "invoice").replace(/[^a-z0-9-_]+/gi, "-");
      downloadBlob(blob, `${slug}-tally.xml`);
      toast("Exported Tally-compatible Sales Voucher XML.");
    };

    // Print
    $("igPrintBtn").onclick = () => window.print();

    // Download Crisp PDF
    $("igDownloadPdfBtn").onclick = async () => {
      const btn = $("igDownloadPdfBtn");
      btn.disabled = true;
      try {
        const bytes = await generateInvoicePdfBytes();
        const slug = (state.invoiceNum || "invoice").replace(/[^a-z0-9-_]+/gi, "-");
        downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${slug}.pdf`);
        toast(`Downloaded ${slug}.pdf`);
      } catch (err) {
        console.error(err);
        toast(err.message || "Unable to generate PDF.", "error");
      } finally {
        btn.disabled = false;
      }
    };

    // Handoff to Open Sign PDF Signer
    $("igSignInOpenSignBtn").onclick = async () => {
      const btn = $("igSignInOpenSignBtn");
      btn.disabled = true;
      try {
        const bytes = await generateInvoicePdfBytes();
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        const slug = (state.invoiceNum || "invoice").replace(/[^a-z0-9-_]+/gi, "-");
        sessionStorage.setItem(
          "opensign:generatedInvoicePdf",
          JSON.stringify({ fileName: `${slug}.pdf`, base64: b64 })
        );
        window.location.href = "index.html?loadInvoice=1";
      } catch (err) {
        console.error(err);
        toast("Unable to send invoice to Open Sign PDF editor.", "error");
        btn.disabled = false;
      }
    };

    initDrawSignatureModal();

    // Restore saved draft if available
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
          state = { ...createDefaultState(), ...parsed };
          nextItemId = Math.max(10, ...state.items.map((x) => Number(x.id) || 0)) + 1;
        }
      }
    } catch (_) {}

    // Pick up generated signature automatically if user came from Signature Generator
    try {
      const genSig = sessionStorage.getItem("opensign:generatedSignature");
      if (genSig && !state.sigDataUrl) {
        const parsed = JSON.parse(genSig);
        if (parsed?.dataUrl) state.sigDataUrl = parsed.dataUrl;
      }
    } catch (_) {}

    syncFormFromState();
  }

  init();
})();
