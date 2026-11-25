(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const CURRENCIES = {
    INR: { symbol: "₹", pdfSymbol: "Rs. ", name: "Rupees", sub: "Paise", indianNum: true },
    USD: { symbol: "$", pdfSymbol: "$", name: "Dollars", sub: "Cents", indianNum: false },
    EUR: { symbol: "€", pdfSymbol: "EUR ", name: "Euros", sub: "Cents", indianNum: false },
    GBP: { symbol: "£", pdfSymbol: "GBP ", name: "Pounds", sub: "Pence", indianNum: false },
    AED: { symbol: "AED ", pdfSymbol: "AED ", name: "Dirhams", sub: "Fils", indianNum: false },
    SGD: { symbol: "S$", pdfSymbol: "S$", name: "Singapore Dollars", sub: "Cents", indianNum: false },
  };

  const BRAND_SWATCHES = [
    { name: "Open Sign Cobalt", hex: "#4C00FF" },
    { name: "Inkwell", hex: "#130032" },
    { name: "Royal Blue", hex: "#1652F0" },
    { name: "Emerald", hex: "#0F766E" },
    { name: "Slate", hex: "#334155" },
    { name: "Crimson", hex: "#B91C1C" },
  ];

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const MAX_LOGO_BYTES = 1 * 1024 * 1024; // 1 MB
  const ALLOWED_LOGO_RE = /\.(png|jpe?g|gif|bmp)$/i;
  const DRAFT_KEY = "opensign:payslipDraftV1";

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const fmtDisplayDate = (isoStr) => {
    if (!isoStr) return "—";
    const parts = isoStr.split("-");
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  let nextId = 20;

  function createDefaultState() {
    const now = new Date();
    return {
      payMonth: MONTHS[now.getMonth()],
      payYear: now.getFullYear(),
      currency: "INR",
      template: "classic", // 'classic' | 'modern' | 'minimal'
      accent: "#4C00FF",
      logoDataUrl: null,
      companyName: "",
      companyCountry: "India",
      companyAddress: "",
      companyCity: "",
      empName: "",
      empId: "",
      paidDays: 30,
      lopDays: 0,
      payDate: todayISO(),
      customFields: [
        { id: 1, label: "Designation", value: "" },
        { id: 2, label: "Department", value: "" },
        { id: 3, label: "PAN", value: "" },
        { id: 4, label: "UAN", value: "" },
        { id: 5, label: "Bank Account No.", value: "" },
      ],
      autoEpf: false,
      earnings: [
        { id: 101, label: "Basic Salary", amount: 30000 },
        { id: 102, label: "House Rent Allowance (HRA)", amount: 15000 },
        { id: 103, label: "Special Allowance", amount: 10000 },
      ],
      deductions: [
        { id: 201, label: "Employee Provident Fund (EPF)", amount: 3600 },
        { id: 202, label: "Professional Tax", amount: 200 },
        { id: 203, label: "Income Tax (TDS)", amount: 0 },
      ],
      signatoryName: "",
      signatoryRole: "Authorized Signatory · HR & Payroll",
      sigDataUrl: null,
      footerNote: "This is a system-generated payslip and does not require a physical signature.",
    };
  }

  let state = createDefaultState();

  /* ---------- Toast & Caution Banner ---------- */
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

  function showAlert(msg) {
    const el = $("psAlert");
    const txt = $("psAlertMsg");
    if (!el || !txt) return;
    if (!msg) {
      el.hidden = true;
      txt.textContent = "";
      return;
    }
    txt.textContent = msg;
    el.hidden = false;
  }

  /* ---------- Formatting & Indian Amount in Words ---------- */
  function fmtMoney(amount, currencyCode, forPdf = false) {
    const cur = CURRENCIES[currencyCode] || CURRENCIES.INR;
    const n = Number(amount) || 0;
    const abs = Math.abs(n);
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split(".");

    let grouped;
    if (cur.indianNum) {
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
    "Seventeen", "Eighteen", "Nineteen",
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
    let idx = 0;
    while (num > 0 && idx < scales.length) {
      const chunk = num % 1000;
      if (chunk) {
        parts.unshift(scales[idx] ? `${threeDigitsToWords(chunk)} ${scales[idx]}` : threeDigitsToWords(chunk));
      }
      num = Math.floor(num / 1000);
      idx++;
    }
    return parts.join(" ");
  }

  function amountInWords(amount, currencyCode) {
    const n = Number(amount) || 0;
    if (n <= 0) return "Amount is less than or equal to zero.";
    const cur = CURRENCIES[currencyCode] || CURRENCIES.INR;
    const whole = Math.floor(n);
    const frac = Math.round((n - whole) * 100);
    const words = cur.indianNum ? intToWordsIndian(whole) : intToWordsIntl(whole);
    const prefix = cur.indianNum ? "Indian Rupees " : `${cur.name} `;
    if (frac > 0) {
      return `${prefix}${words} and ${twoDigitsToWords(frac)} ${cur.sub} Only`;
    }
    return `${prefix}${words} Only`;
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Calculations & Validations ---------- */
  function syncAutoEpf() {
    if (!state.autoEpf) return;
    const basicRow = state.earnings.find((e) => /\bbasic\b/i.test(e.label || ""));
    if (!basicRow) return;
    const epfAmount = Math.round((Math.max(0, Number(basicRow.amount) || 0) * 0.12) * 100) / 100;
    let epfRow = state.deductions.find((d) => /\b(epf|provident\s+fund|pf)\b/i.test(d.label || ""));
    if (!epfRow) {
      epfRow = { id: nextId++, label: "Employee Provident Fund (EPF)", amount: epfAmount };
      state.deductions.unshift(epfRow);
    } else {
      epfRow.amount = epfAmount;
    }
  }

  function validateDays() {
    const paid = Math.max(0, Number(state.paidDays) || 0);
    const lop = Math.max(0, Number(state.lopDays) || 0);
    const sum = paid + lop;
    const badge = $("psDaysCheckBadge");
    if (badge) {
      badge.textContent = `Paid + LOP: ${sum} / 31 days`;
      badge.style.color = sum > 31 ? "#b42318" : "var(--muted)";
    }
    if (sum > 31) {
      showAlert("Loss of Pay Days + Paid Days should be less than or equal to 31 days.");
      return false;
    }
    if (state.payYear && (state.payYear < 2000 || state.payYear > 2100)) {
      showAlert("Please enter a valid payslip year between 2000 and 2100.");
      return false;
    }
    showAlert("");
    return true;
  }

  function calculateTotals() {
    const gross = state.earnings.reduce((s, r) => s + Math.max(0, Number(r.amount) || 0), 0);
    const totalDeductions = state.deductions.reduce((s, r) => s + Math.max(0, Number(r.amount) || 0), 0);
    const netPay = gross - totalDeductions;
    return { gross, totalDeductions, netPay };
  }

  /* ---------- Render Dynamic Lists in Editor ---------- */
  function renderCustomFieldsEditor() {
    const list = $("psCustomFieldsList");
    if (!list) return;
    list.innerHTML = "";

    state.customFields.forEach((cf, idx) => {
      const row = document.createElement("div");
      row.className = "ps-custom-row";
      row.innerHTML = `
        <input type="text" class="ig-input" data-cf="label" value="${esc(cf.label)}" placeholder="Field Name (e.g. PAN)" aria-label="Custom field label" />
        <input type="text" class="ig-input" data-cf="value" value="${esc(cf.value)}" placeholder="Value" aria-label="Custom field value" />
        <button type="button" class="ig-icon-mini del" title="Remove field" aria-label="Remove custom field">&times;</button>
      `;

      row.querySelector('[data-cf="label"]').addEventListener("input", (e) => {
        cf.label = e.target.value;
        renderPreview();
      });
      row.querySelector('[data-cf="value"]').addEventListener("input", (e) => {
        cf.value = e.target.value;
        renderPreview();
      });
      row.querySelector(".del").addEventListener("click", () => {
        state.customFields.splice(idx, 1);
        renderCustomFieldsEditor();
        renderPreview();
      });

      list.appendChild(row);
    });
  }

  function renderIncomeColumn(containerId, arr, isEarning) {
    const list = $(containerId);
    if (!list) return;
    list.innerHTML = "";

    arr.forEach((rowObj, idx) => {
      const row = document.createElement("div");
      row.className = "ps-comp-row";
      const isAutoLockedEpf = !isEarning && state.autoEpf && /\b(epf|provident\s+fund|pf)\b/i.test(rowObj.label || "");

      row.innerHTML = `
        <input type="text" class="ig-input" data-k="label" value="${esc(rowObj.label)}" placeholder="${isEarning ? "Earning name" : "Deduction name"}" aria-label="Component label" />
        <input type="number" class="ig-input" data-k="amount" value="${rowObj.amount}" min="0" step="any" ${isAutoLockedEpf ? "readonly" : ""} aria-label="Component amount" />
        <button type="button" class="ig-icon-mini del" title="Remove row" aria-label="Remove component" ${arr.length <= 1 && isEarning ? "disabled" : ""}>&times;</button>
      `;

      row.querySelector('[data-k="label"]').addEventListener("input", (e) => {
        rowObj.label = e.target.value;
        renderPreview();
      });

      row.querySelector('[data-k="amount"]').addEventListener("input", (e) => {
        rowObj.amount = parseFloat(e.target.value) || 0;
        if (isEarning && state.autoEpf && /\bbasic\b/i.test(rowObj.label || "")) {
          syncAutoEpf();
          renderIncomeColumn("psDeductionsList", state.deductions, false);
        }
        updateEditorTotals();
        renderPreview();
      });

      row.querySelector(".del").addEventListener("click", () => {
        if (isEarning && arr.length <= 1) return;
        arr.splice(idx, 1);
        renderIncomeColumn(containerId, arr, isEarning);
        updateEditorTotals();
        renderPreview();
      });

      list.appendChild(row);
    });
  }

  function updateEditorTotals() {
    const { gross, totalDeductions, netPay } = calculateTotals();
    const cur = state.currency;
    if ($("psGrossEarningsVal")) $("psGrossEarningsVal").textContent = fmtMoney(gross, cur);
    if ($("psTotalDeductionsVal")) $("psTotalDeductionsVal").textContent = fmtMoney(totalDeductions, cur);
    if ($("psNetPayEditorVal")) $("psNetPayEditorVal").textContent = fmtMoney(netPay, cur);
    if ($("psWordsEditorVal")) $("psWordsEditorVal").textContent = amountInWords(netPay, cur);
    if ($("psPreviewNetStrip")) $("psPreviewNetStrip").textContent = `Net Pay: ${fmtMoney(netPay, cur)}`;
  }

  /* ---------- Render Live A4 Payslip Preview ---------- */
  function renderPreview() {
    const paper = $("psPaper");
    if (!paper) return;

    validateDays();
    updateEditorTotals();

    const { gross, totalDeductions, netPay } = calculateTotals();
    const cur = state.currency;
    const payPeriodStr = `${state.payMonth} ${state.payYear || ""}`.trim();

    if ($("psPeriodBadge")) $("psPeriodBadge").textContent = payPeriodStr;

    paper.dataset.template = state.template;
    paper.style.setProperty("--ps-accent", state.accent);

    const companyAddr = [
      state.companyAddress.trim(),
      state.companyCity.trim(),
      state.companyCountry.trim(),
    ]
      .filter(Boolean)
      .join(", ");

    const empRows = [
      { label: "Employee Name", value: state.empName.trim() || "Employee Name" },
      { label: "Employee ID", value: state.empId.trim() || "—" },
      { label: "Pay Period", value: payPeriodStr },
      { label: "Pay Date", value: fmtDisplayDate(state.payDate) },
      ...state.customFields
        .filter((cf) => cf.label.trim() && cf.value.trim())
        .map((cf) => ({ label: cf.label.trim(), value: cf.value.trim() })),
    ];

    const earnRows = state.earnings.filter((r) => r.label.trim() || Number(r.amount) > 0);
    const dedRows = state.deductions.filter((r) => r.label.trim() || Number(r.amount) > 0);
    const maxRows = Math.max(earnRows.length, dedRows.length, 1);

    let tableBodyHtml = "";
    for (let i = 0; i < maxRows; i++) {
      const e = earnRows[i];
      const d = dedRows[i];
      tableBodyHtml += `
        <tr>
          <td>${e ? esc(e.label || "Earning") : ""}</td>
          <td class="num mid-div">${e ? fmtMoney(e.amount, cur) : ""}</td>
          <td>${d ? esc(d.label || "Deduction") : ""}</td>
          <td class="num">${d ? fmtMoney(d.amount, cur) : ""}</td>
        </tr>
      `;
    }

    const wordsStr = amountInWords(netPay, cur);

    paper.innerHTML = `
      <header class="ps-paper-head">
        <div class="ps-brand-col">
          ${state.logoDataUrl ? `<img class="ps-paper-logo" src="${state.logoDataUrl}" alt="Company Logo" />` : ""}
          <div>
            <h2 class="ps-co-name">${esc(state.companyName.trim() || "Your Company Name")}</h2>
            ${companyAddr ? `<div class="ps-head-muted">${esc(companyAddr)}</div>` : ""}
          </div>
        </div>

        <div class="ps-period-col">
          <span class="ps-period-label">Payslip For the Month</span>
          <span class="ps-period-val">${esc(payPeriodStr)}</span>
        </div>
      </header>

      <div class="ps-paper-body">
        <div class="ps-summary-band">
          <div class="ps-emp-card">
            <span class="ps-section-cap">Employee Pay Summary</span>
            <div class="ps-emp-grid">
              ${empRows
                .map(
                  (r) => `
                  <div class="ps-emp-kv">
                    <span>${esc(r.label)}</span>
                    <strong>${esc(r.value)}</strong>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>

          <div class="ps-net-hero">
            <div class="ps-net-hero-top">
              <div class="ps-net-hero-val">${fmtMoney(netPay, cur)}</div>
              <div class="ps-net-hero-lbl">Employee Net Pay</div>
            </div>
            <div class="ps-days-split">
              <div>
                <span>Paid Days</span>
                <strong>${Number(state.paidDays) || 0}</strong>
              </div>
              <div>
                <span>LOP Days</span>
                <strong>${Number(state.lopDays) || 0}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="ps-pay-table-wrap">
          <table class="ps-pay-table">
            <thead>
              <tr>
                <th>Earnings</th>
                <th class="num mid-div">Amount</th>
                <th>Deductions</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableBodyHtml}
              <tr class="ps-tot-row">
                <td>Gross Earnings</td>
                <td class="num mid-div">${fmtMoney(gross, cur)}</td>
                <td>Total Deductions</td>
                <td class="num">${fmtMoney(totalDeductions, cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ps-net-banner">
          <div class="ps-net-banner-left">
            <strong>TOTAL NET PAYABLE</strong>
            <span>Gross Earnings − Total Deductions</span>
          </div>
          <div class="ps-net-banner-val">${fmtMoney(netPay, cur)}</div>
        </div>

        <div class="ps-words-line">
          <strong>Amount In Words:</strong> ${esc(wordsStr)}
        </div>

        <div class="ps-paper-foot">
          <p class="ps-system-note">${esc(state.footerNote.trim())}</p>
          ${
            state.sigDataUrl || state.signatoryName.trim()
              ? `<div class="inv-sig-block">
                  ${state.sigDataUrl ? `<img src="${state.sigDataUrl}" alt="Authorized signature" />` : `<div style="height:28px"></div>`}
                  <div class="inv-sig-line"></div>
                  ${state.signatoryName.trim() ? `<span class="inv-sig-name">${esc(state.signatoryName.trim())}</span>` : ""}
                  <span class="inv-sig-role">${esc(state.signatoryRole.trim() || "Authorized Signatory")}</span>
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  /* ---------- Vector A4 PDF Export (pdf-lib, 100% Browser-Based) ---------- */
  function hexToRgbTuple(hex) {
    const clean = (hex || "#4C00FF").replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16) / 255 || 0,
      parseInt(clean.slice(2, 4), 16) / 255 || 0,
      parseInt(clean.slice(4, 6), 16) / 255 || 0,
    ];
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
    const words = sanitizePdfText(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  async function generatePayslipPdfBytes() {
    if (!window.PDFLib) throw new Error("PDF generator (pdf-lib) failed to load.");
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

    const { gross, totalDeductions, netPay } = calculateTotals();
    const cur = state.currency;
    const payPeriodStr = `${state.payMonth} ${state.payYear || ""}`.trim();

    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 42;
    const W = PAGE_W - M * 2;

    const [ar, ag, ab] = hexToRgbTuple(state.accent);
    const COL_ACCENT = rgb(ar, ag, ab);
    const COL_INK = rgb(0.075, 0, 0.196);
    const COL_MUTED = rgb(0.35, 0.31, 0.43);
    const COL_LINE = rgb(0.86, 0.84, 0.91);
    const COL_TINT = rgb(0.97, 0.96, 0.988);
    const COL_GREEN = rgb(0.082, 0.502, 0.239);
    const COL_GREEN_BG = rgb(0.945, 0.985, 0.955);
    const COL_WHITE = rgb(1, 1, 1);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - M;

    const drawRight = (txt, rightX, yy, size, font, color) => {
      const clean = sanitizePdfText(txt);
      const tw = font.widthOfTextAtSize(clean, size);
      page.drawText(clean, { x: rightX - tw, y: yy, size, font, color });
    };

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

    // ---------- Header Band ----------
    const isModern = state.template === "modern";
    const headH = 92;
    if (isModern) {
      page.drawRectangle({ x: 0, y: PAGE_H - headH, width: PAGE_W, height: headH, color: COL_ACCENT });
    } else {
      page.drawLine({
        start: { x: M, y: PAGE_H - headH },
        end: { x: PAGE_W - M, y: PAGE_H - headH },
        thickness: state.template === "minimal" ? 0.8 : 2,
        color: COL_ACCENT,
      });
    }

    const headInk = isModern ? COL_WHITE : COL_INK;
    const headMuted = isModern ? rgb(0.92, 0.9, 1) : COL_MUTED;
    const headAccent = isModern ? COL_WHITE : COL_ACCENT;

    let textStartX = M;
    if (logoImg) {
      const sc = Math.min(54 / logoImg.width, 44 / logoImg.height, 1);
      const lw = logoImg.width * sc;
      const lh = logoImg.height * sc;
      const ly = PAGE_H - 24 - lh;
      if (isModern) {
        page.drawRectangle({ x: M - 3, y: ly - 3, width: lw + 6, height: lh + 6, color: COL_WHITE });
      }
      page.drawImage(logoImg, { x: M, y: ly, width: lw, height: lh });
      textStartX = M + lw + 12;
    }

    page.drawText(sanitizePdfText(state.companyName.trim() || "Your Company Name"), {
      x: textStartX,
      y: PAGE_H - 38,
      size: 15,
      font: fontBold,
      color: headInk,
    });

    const companyAddr = [state.companyAddress.trim(), state.companyCity.trim(), state.companyCountry.trim()]
      .filter(Boolean)
      .join(", ");
    const addrLines = wrapPdfLines(companyAddr, fontReg, 8.8, W * 0.52);
    let ay = PAGE_H - 54;
    for (const ln of addrLines.slice(0, 2)) {
      page.drawText(ln, { x: textStartX, y: ay, size: 8.8, font: fontReg, color: headMuted });
      ay -= 11.5;
    }

    drawRight("PAYSLIP FOR THE MONTH", PAGE_W - M, PAGE_H - 36, 8, fontBold, headMuted);
    drawRight(payPeriodStr, PAGE_W - M, PAGE_H - 55, 16, fontBold, headAccent);

    y = PAGE_H - headH - 22;

    // ---------- Employee Summary + Net Pay Card ----------
    const empRows = [
      { label: "Employee Name", value: state.empName.trim() || "Employee Name" },
      { label: "Employee ID", value: state.empId.trim() || "-" },
      { label: "Pay Period", value: payPeriodStr },
      { label: "Pay Date", value: fmtDisplayDate(state.payDate) },
      ...state.customFields
        .filter((cf) => cf.label.trim() && cf.value.trim())
        .map((cf) => ({ label: cf.label.trim(), value: cf.value.trim() })),
    ];

    const leftW = W * 0.65;
    const rightX = M + leftW + 14;
    const rightW = W - leftW - 14;
    const pairRows = Math.ceil(empRows.length / 2);
    const summaryH = Math.max(92, 34 + pairRows * 17);

    // Left: Employee Pay Summary Box
    page.drawRectangle({ x: M, y: y - summaryH, width: leftW, height: summaryH, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.7 });
    page.drawText("EMPLOYEE PAY SUMMARY", { x: M + 12, y: y - 16, size: 8, font: fontBold, color: COL_ACCENT });

    const halfW = (leftW - 28) / 2;
    empRows.forEach((r, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const rx = M + 12 + col * (halfW + 8);
      const ry = y - 34 - row * 17;
      page.drawText(sanitizePdfText(r.label.slice(0, 18)), { x: rx, y: ry, size: 8.2, font: fontReg, color: COL_MUTED });
      drawRight(r.value.slice(0, 22), rx + halfW, ry, 8.4, fontBold, COL_INK);
    });

    // Right: Highlighted Employee Net Pay Box
    page.drawRectangle({ x: rightX, y: y - summaryH, width: rightW, height: summaryH, color: COL_GREEN_BG, borderColor: rgb(0.75, 0.88, 0.79), borderWidth: 0.8 });
    page.drawRectangle({ x: rightX + 10, y: y - 46, width: 3, height: 32, color: COL_GREEN });
    page.drawText(sanitizePdfText(fmtMoney(netPay, cur, true)), { x: rightX + 19, y: y - 28, size: 14, font: fontBold, color: COL_INK });
    page.drawText("EMPLOYEE NET PAY", { x: rightX + 19, y: y - 43, size: 7.5, font: fontBold, color: COL_GREEN });

    page.drawLine({ start: { x: rightX + 10, y: y - 56 }, end: { x: rightX + rightW - 10, y: y - 56 }, thickness: 0.6, color: rgb(0.78, 0.88, 0.81) });
    page.drawText("Paid Days", { x: rightX + 12, y: y - 70, size: 8, font: fontReg, color: COL_MUTED });
    drawRight(String(Number(state.paidDays) || 0), rightX + rightW - 12, y - 70, 9.5, fontBold, COL_INK);
    page.drawText("LOP Days", { x: rightX + 12, y: y - 85, size: 8, font: fontReg, color: COL_MUTED });
    drawRight(String(Number(state.lopDays) || 0), rightX + rightW - 12, y - 85, 9.5, fontBold, COL_INK);

    y -= summaryH + 20;

    // ---------- Side-by-Side Earnings & Deductions Table ----------
    const earnRows = state.earnings.filter((r) => r.label.trim() || Number(r.amount) > 0);
    const dedRows = state.deductions.filter((r) => r.label.trim() || Number(r.amount) > 0);
    const maxRows = Math.max(earnRows.length, dedRows.length, 1);
    const midX = M + W / 2;

    const isMinimal = state.template === "minimal";
    page.drawRectangle({ x: M, y: y - 24, width: W, height: 24, color: isMinimal ? COL_TINT : COL_ACCENT });
    const thCol = isMinimal ? COL_INK : COL_WHITE;
    page.drawText("EARNINGS", { x: M + 10, y: y - 16, size: 8.5, font: fontBold, color: thCol });
    drawRight("AMOUNT", midX - 10, y - 16, 8.5, fontBold, thCol);
    page.drawText("DEDUCTIONS", { x: midX + 10, y: y - 16, size: 8.5, font: fontBold, color: thCol });
    drawRight("AMOUNT", PAGE_W - M - 10, y - 16, 8.5, fontBold, thCol);

    const tableTopY = y;
    y -= 24;

    for (let i = 0; i < maxRows; i++) {
      const e = earnRows[i];
      const d = dedRows[i];
      const rowH = 22;

      if (e) {
        page.drawText(sanitizePdfText((e.label || "Earning").slice(0, 32)), { x: M + 10, y: y - 15, size: 9, font: fontReg, color: COL_INK });
        drawRight(fmtMoney(e.amount, cur, true), midX - 10, y - 15, 9, fontReg, COL_INK);
      }
      if (d) {
        page.drawText(sanitizePdfText((d.label || "Deduction").slice(0, 32)), { x: midX + 10, y: y - 15, size: 9, font: fontReg, color: COL_INK });
        drawRight(fmtMoney(d.amount, cur, true), PAGE_W - M - 10, y - 15, 9, fontReg, COL_INK);
      }

      y -= rowH;
      page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: COL_LINE });
    }

    // Gross & Total Deductions Row
    page.drawRectangle({ x: M, y: y - 26, width: W, height: 26, color: COL_TINT });
    page.drawText("Gross Earnings", { x: M + 10, y: y - 17, size: 9.5, font: fontBold, color: COL_INK });
    drawRight(fmtMoney(gross, cur, true), midX - 10, y - 17, 9.5, fontBold, COL_INK);
    page.drawText("Total Deductions", { x: midX + 10, y: y - 17, size: 9.5, font: fontBold, color: COL_INK });
    drawRight(fmtMoney(totalDeductions, cur, true), PAGE_W - M - 10, y - 17, 9.5, fontBold, COL_INK);
    y -= 26;

    // Outer table border + vertical center divider
    page.drawRectangle({ x: M, y, width: W, height: tableTopY - y, borderColor: COL_LINE, borderWidth: 0.8 });
    page.drawLine({ start: { x: midX, y }, end: { x: midX, y: tableTopY - 24 }, thickness: 0.7, color: COL_LINE });

    y -= 18;

    // ---------- Total Net Payable Banner ----------
    page.drawRectangle({ x: M, y: y - 44, width: W, height: 44, color: COL_TINT, borderColor: COL_ACCENT, borderWidth: 1 });
    page.drawText("TOTAL NET PAYABLE", { x: M + 14, y: y - 18, size: 10, font: fontBold, color: COL_INK });
    page.drawText("Gross Earnings - Total Deductions", { x: M + 14, y: y - 33, size: 8.2, font: fontReg, color: COL_MUTED });
    drawRight(fmtMoney(netPay, cur, true), PAGE_W - M - 14, y - 27, 15, fontBold, COL_ACCENT);

    y -= 58;

    // ---------- Amount in Words ----------
    const wordsText = `Amount In Words: ${amountInWords(netPay, cur)}`;
    const wordLines = wrapPdfLines(wordsText, fontBold, 8.8, W - 20);
    for (const wl of wordLines) {
      const tw = fontBold.widthOfTextAtSize(wl, 8.8);
      page.drawText(wl, { x: M + (W - tw) / 2, y, size: 8.8, font: fontBold, color: COL_INK });
      y -= 13;
    }

    y -= 18;

    // ---------- Footer Note & Optional Authorized Signatory ----------
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.6, color: COL_LINE });
    y -= 16;

    const noteLines = wrapPdfLines(state.footerNote.trim(), fontReg, 8.2, W * 0.58);
    let ny = y;
    for (const nl of noteLines.slice(0, 3)) {
      page.drawText(nl, { x: M, y: ny, size: 8.2, font: fontReg, color: COL_MUTED });
      ny -= 11;
    }

    if (sigImg || state.signatoryName.trim()) {
      let sy = y - 2;
      if (sigImg) {
        const sc = Math.min(125 / sigImg.width, 38 / sigImg.height, 1);
        const sw = sigImg.width * sc;
        const sh = sigImg.height * sc;
        page.drawImage(sigImg, { x: PAGE_W - M - sw, y: sy - sh, width: sw, height: sh });
        sy -= sh + 5;
      } else {
        sy -= 34;
      }
      page.drawLine({ start: { x: PAGE_W - M - 140, y: sy }, end: { x: PAGE_W - M, y: sy }, thickness: 0.9, color: COL_INK });
      sy -= 12;
      if (state.signatoryName.trim()) {
        drawRight(state.signatoryName.trim(), PAGE_W - M, sy, 9.2, fontBold, COL_INK);
        sy -= 11.5;
      }
      drawRight(state.signatoryRole.trim() || "Authorized Signatory", PAGE_W - M, sy, 8, fontReg, COL_MUTED);
    }

    page.drawText("Generated with Open Sign  |  100% Browser-Based Processing", {
      x: M,
      y: 18,
      size: 7.5,
      font: fontReg,
      color: COL_MUTED,
    });

    return await doc.save();
  }

  /* ---------- Image Helper ---------- */
  function fileToPngDataUrl(file, removeWhiteBg = false) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxW = 520;
        const maxH = 260;
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
        reject(new Error("Unable to read that image file."));
      };
      img.src = url;
    });
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

  function makePayslipFilename(ext) {
    const emp = (state.empName || "employee").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const period = `${state.payMonth}-${state.payYear}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `payslip-${emp || "employee"}-${period}.${ext}`;
  }

  /* ---------- Sync Form from State ---------- */
  function syncFormFromState() {
    $("psPayMonth").value = state.payMonth;
    $("psPayYear").value = state.payYear;
    $("psCurrency").value = state.currency;
    $("psCompanyName").value = state.companyName;
    $("psCompanyCountry").value = state.companyCountry;
    $("psCompanyAddress").value = state.companyAddress;
    $("psCompanyCity").value = state.companyCity;

    $("psEmpName").value = state.empName;
    $("psEmpId").value = state.empId;
    $("psPaidDays").value = state.paidDays;
    $("psLopDays").value = state.lopDays;
    $("psPayDate").value = state.payDate;
    $("psAutoEpf").checked = !!state.autoEpf;

    $("psSignatoryName").value = state.signatoryName;
    $("psSignatoryRole").value = state.signatoryRole;
    $("psFooterNote").value = state.footerNote;

    document.querySelectorAll("#psTemplateRow .ig-tpl-btn").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.tpl === state.template));
    });
    document.querySelectorAll("#psSwatches .ig-swatch").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.hex === state.accent));
    });

    // Logo
    const thumb = $("psLogoThumb");
    const placeholder = $("psLogoPlaceholder");
    const rmLogo = $("psRemoveLogoBtn");
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

    // Signature
    const sigMini = $("psSigMiniPreview");
    const clearSig = $("psClearSigBtn");
    if (state.sigDataUrl) {
      sigMini.src = state.sigDataUrl;
      sigMini.hidden = false;
      clearSig.hidden = false;
    } else {
      sigMini.hidden = true;
      clearSig.hidden = true;
    }

    if (state.autoEpf) syncAutoEpf();
    renderCustomFieldsEditor();
    renderIncomeColumn("psEarningsList", state.earnings, true);
    renderIncomeColumn("psDeductionsList", state.deductions, false);
    renderPreview();
  }

  /* ---------- Quick Draw Signature Modal ---------- */
  function initSignatureModal() {
    const dlg = $("psSigDialog");
    const canvas = $("psSigCanvas");
    const ctx = canvas?.getContext("2d");
    const applyBtn = $("psSigApply");
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

    $("psDrawSigBtn").onclick = () => {
      strokes = [];
      redraw();
      dlg.showModal();
    };
    $("psSigClearPad").onclick = () => {
      strokes = [];
      redraw();
    };
    $("psSigCancel").onclick = () => dlg.close();
    $("psSigCloseTop").onclick = () => dlg.close();

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
        toast("Authorized signature applied to payslip.");
      }
      dlg.close();
    };
  }

  /* ---------- Initialization & Event Binding ---------- */
  function init() {
    // Swatches
    const swEl = $("psSwatches");
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
        swEl.querySelectorAll(".ig-swatch").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        renderPreview();
      });
      swEl.appendChild(b);
    });

    // Templates
    document.querySelectorAll("#psTemplateRow .ig-tpl-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.template = btn.dataset.tpl;
        document.querySelectorAll("#psTemplateRow .ig-tpl-btn").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
        renderPreview();
      });
    });

    // Mobile/Tablet Edit vs Preview switcher
    const ws = $("psWorkspace");
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

    $("psAlertClose").onclick = () => showAlert("");

    // Bind scalar fields
    const bindField = (id, key, opts = {}) => {
      const el = $(id);
      if (!el) return;
      const ev = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
      el.addEventListener(ev, () => {
        if (el.type === "checkbox") state[key] = el.checked;
        else if (el.type === "number") state[key] = parseFloat(el.value) || 0;
        else state[key] = el.value;

        if (opts.onAfter) opts.onAfter();
        renderPreview();
      });
    };

    bindField("psPayMonth", "payMonth");
    bindField("psPayYear", "payYear");
    bindField("psCurrency", "currency");
    bindField("psCompanyName", "companyName");
    bindField("psCompanyCountry", "companyCountry");
    bindField("psCompanyAddress", "companyAddress");
    bindField("psCompanyCity", "companyCity");

    bindField("psEmpName", "empName");
    bindField("psEmpId", "empId");
    bindField("psPaidDays", "paidDays");
    bindField("psLopDays", "lopDays");
    bindField("psPayDate", "payDate");
    bindField("psSignatoryName", "signatoryName");
    bindField("psSignatoryRole", "signatoryRole");
    bindField("psFooterNote", "footerNote");

    // Auto-EPF (12% of Basic)
    $("psAutoEpf").addEventListener("change", (e) => {
      state.autoEpf = e.target.checked;
      if (state.autoEpf) {
        syncAutoEpf();
        renderIncomeColumn("psDeductionsList", state.deductions, false);
        toast("Auto-EPF enabled (12% of Basic Salary).");
      } else {
        renderIncomeColumn("psDeductionsList", state.deductions, false);
      }
      renderPreview();
    });

    // Apply LOP Pro-Rata Helper
    $("psApplyLopBtn").onclick = () => {
      const paid = Math.max(0, Number(state.paidDays) || 0);
      const lop = Math.max(0, Number(state.lopDays) || 0);
      const total = paid + lop;
      if (lop <= 0 || total <= 0 || total > 31) {
        toast("Enter valid Paid Days and LOP Days (> 0) first to apply pro-rata adjustment.", "error");
        return;
      }
      const factor = paid / total;
      state.earnings.forEach((e) => {
        e.amount = Math.round((Math.max(0, Number(e.amount) || 0) * factor));
      });
      if (state.autoEpf) syncAutoEpf();
      renderIncomeColumn("psEarningsList", state.earnings, true);
      renderIncomeColumn("psDeductionsList", state.deductions, false);
      renderPreview();
      toast(`Earnings pro-rated for ${paid} of ${total} days.`);
    };

    // Dynamic Add buttons
    $("psAddCustomFieldBtn").onclick = () => {
      state.customFields.push({ id: nextId++, label: "", value: "" });
      renderCustomFieldsEditor();
    };
    $("psAddEarningBtn").onclick = () => {
      state.earnings.push({ id: nextId++, label: "Other Allowance", amount: 0 });
      renderIncomeColumn("psEarningsList", state.earnings, true);
      renderPreview();
    };
    $("psAddDeductionBtn").onclick = () => {
      state.deductions.push({ id: nextId++, label: "Other Deduction", amount: 0 });
      renderIncomeColumn("psDeductionsList", state.deductions, false);
      renderPreview();
    };

    // Logo upload with Zoho-matched format & 1MB size validation
    $("psLogoInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (!ALLOWED_LOGO_RE.test(f.name || "")) {
        showAlert("Please upload the Logo in one of the supported formats: BMP, PNG, GIF, JPG or JPEG only.");
        return;
      }
      if (f.size > MAX_LOGO_BYTES) {
        showAlert("Uploading Logo size should be less than 1 MB.");
        return;
      }
      showAlert("");
      try {
        state.logoDataUrl = await fileToPngDataUrl(f, false);
        syncFormFromState();
        toast("Company logo uploaded.");
      } catch (err) {
        showAlert(err.message);
      }
    });
    $("psRemoveLogoBtn").onclick = () => {
      state.logoDataUrl = null;
      syncFormFromState();
    };

    // Signature upload & clear
    $("psUploadSigInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        state.sigDataUrl = await fileToPngDataUrl(f, true);
        syncFormFromState();
        toast("Signature image added to payslip.");
      } catch (err) {
        toast(err.message, "error");
      }
    });
    $("psClearSigBtn").onclick = () => {
      state.sigDataUrl = null;
      syncFormFromState();
    };

    // Load Sample Indian Payslip
    $("psSampleBtn").onclick = () => {
      state = {
        ...createDefaultState(),
        template: state.template,
        accent: state.accent,
        companyName: "Creative Nerds Digital Pvt. Ltd.",
        companyCountry: "India",
        companyAddress: "402, Trade Tower, Lower Parel",
        companyCity: "Mumbai, Maharashtra 400013",
        empName: "Aarav Kulkarni",
        empId: "CN-EMP-042",
        paidDays: 30,
        lopDays: 0,
        payDate: todayISO(),
        customFields: [
          { id: nextId++, label: "Designation", value: "Senior Product Designer" },
          { id: nextId++, label: "Department", value: "Creative & Web" },
          { id: nextId++, label: "PAN", value: "ABCPK4821F" },
          { id: nextId++, label: "UAN", value: "101458923410" },
          { id: nextId++, label: "Bank Account No.", value: "XXXX XXXX 4829" },
        ],
        autoEpf: true,
        earnings: [
          { id: nextId++, label: "Basic Salary", amount: 42000 },
          { id: nextId++, label: "House Rent Allowance (HRA)", amount: 21000 },
          { id: nextId++, label: "Special Allowance", amount: 17000 },
          { id: nextId++, label: "Performance Bonus", amount: 5000 },
        ],
        deductions: [
          { id: nextId++, label: "Employee Provident Fund (EPF)", amount: 5040 },
          { id: nextId++, label: "Professional Tax", amount: 200 },
          { id: nextId++, label: "Income Tax (TDS)", amount: 4200 },
        ],
        signatoryName: "Rishabh Sharma",
        signatoryRole: "Director · HR & Payroll",
        logoDataUrl: state.logoDataUrl,
        sigDataUrl: state.sigDataUrl,
      };
      syncFormFromState();
      toast("Loaded sample Indian salary slip.");
    };

    // Save Local Draft
    $("psSaveDraftBtn").onclick = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
        toast("Payslip draft saved locally in your browser.");
      } catch (_) {
        toast("Unable to save draft in browser storage.", "error");
      }
    };

    // Reset (top & bottom buttons)
    const doReset = () => {
      state = createDefaultState();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (_) {}
      showAlert("");
      syncFormFromState();
      toast("Payslip cleared.");
    };
    $("psResetBtn").onclick = doReset;
    $("psResetBottomBtn").onclick = doReset;

    // Backup & Import JSON
    $("psExportJsonBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      downloadBlob(blob, makePayslipFilename("json"));
      toast("Exported payslip JSON backup.");
    };
    $("psImportJsonInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!parsed || !Array.isArray(parsed.earnings)) throw new Error("Invalid payslip JSON file.");
        state = { ...createDefaultState(), ...parsed };
        syncFormFromState();
        toast("Payslip restored from JSON backup.");
      } catch (err) {
        toast(err.message || "Could not import JSON file.", "error");
      }
    });

    // Print
    $("psPrintBtn").onclick = () => window.print();

    // Download PDF (shared by top toolbar & bottom Generate Payslip PDF button)
    const doDownloadPdf = async (triggerBtn) => {
      if (!validateDays()) return;
      triggerBtn.disabled = true;
      try {
        const bytes = await generatePayslipPdfBytes();
        const fname = makePayslipFilename("pdf");
        downloadBlob(new Blob([bytes], { type: "application/pdf" }), fname);
        toast(`Payslip generated and downloaded (${fname}).`);
      } catch (err) {
        console.error(err);
        toast(err.message || "Unable to generate payslip PDF.", "error");
      } finally {
        triggerBtn.disabled = false;
      }
    };

    $("psDownloadPdfBtn").onclick = (e) => doDownloadPdf(e.currentTarget);
    $("psGenerateBtn").onclick = (e) => doDownloadPdf(e.currentTarget);

    // Sign in Open Sign handoff (reuses app.js's existing generated-PDF loader!)
    $("psSignInOpenSignBtn").onclick = async () => {
      if (!validateDays()) return;
      const btn = $("psSignInOpenSignBtn");
      btn.disabled = true;
      try {
        const bytes = await generatePayslipPdfBytes();
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        sessionStorage.setItem(
          "opensign:generatedInvoicePdf",
          JSON.stringify({ fileName: makePayslipFilename("pdf"), base64: btoa(bin) })
        );
        window.location.href = "index.html?loadInvoice=1";
      } catch (err) {
        console.error(err);
        toast("Unable to open payslip in Open Sign PDF editor.", "error");
        btn.disabled = false;
      }
    };

    initSignatureModal();

    // Restore saved draft if present
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.earnings) && parsed.earnings.length) {
          state = { ...createDefaultState(), ...parsed };
        }
      }
    } catch (_) {}

    // Pick up signature automatically if user came from Signature Generator
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
