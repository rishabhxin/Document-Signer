(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const CURRENCIES = {
    INR: { code: "INR", symbol: "₹", pdfPrefix: "Rs. ", unit: "Rupees", subunit: "Paise" },
    USD: { code: "USD", symbol: "$", pdfPrefix: "$", unit: "Dollars", subunit: "Cents" },
    EUR: { code: "EUR", symbol: "€", pdfPrefix: "EUR ", unit: "Euros", subunit: "Cents" },
    GBP: { code: "GBP", symbol: "£", pdfPrefix: "GBP ", unit: "Pounds", subunit: "Pence" },
    AED: { code: "AED", symbol: "AED ", pdfPrefix: "AED ", unit: "Dirhams", subunit: "Fils" },
    SGD: { code: "SGD", symbol: "S$", pdfPrefix: "SGD ", unit: "Dollars", subunit: "Cents" },
  };

  // Standard Schema for Column Mapping & Excel Template
  const FIELD_DEFS = [
    // Employee Information
    { key: "empId", label: "Employee ID", group: "employee", required: false, aliases: ["employee id", "emp id", "emp_id", "empid", "id", "staff id"] },
    { key: "empName", label: "Employee Name", group: "employee", required: true, aliases: ["employee name", "emp name", "name", "full name", "staff name"] },
    { key: "designation", label: "Designation", group: "employee", required: false, aliases: ["designation", "role", "job title", "title"] },
    { key: "department", label: "Department", group: "employee", required: false, aliases: ["department", "dept", "team"] },
    { key: "doj", label: "Date of Joining", group: "employee", required: false, isDate: true, aliases: ["date of joining", "joining date", "doj", "join date"] },
    { key: "location", label: "Work Location", group: "employee", required: false, aliases: ["work location", "location", "branch", "office", "city"] },
    { key: "bankLast4", label: "Bank Account Last Four Digits", group: "employee", required: false, aliases: ["bank account last four digits", "bank last 4", "account last 4", "bank account", "bank"] },

    // Salary Earnings
    { key: "basic", label: "Basic Salary", group: "earning", required: true, numeric: true, aliases: ["basic salary", "basic", "basic pay"] },
    { key: "hra", label: "HRA", group: "earning", required: false, numeric: true, aliases: ["hra", "house rent allowance"] },
    { key: "conveyance", label: "Conveyance Allowance", group: "earning", required: false, numeric: true, aliases: ["conveyance allowance", "conveyance", "transport allowance"] },
    { key: "medical", label: "Medical Allowance", group: "earning", required: false, numeric: true, aliases: ["medical allowance", "medical"] },
    { key: "special", label: "Special Allowance", group: "earning", required: false, numeric: true, aliases: ["special allowance", "special"] },
    { key: "otherAllowances", label: "Other Allowances", group: "earning", required: false, numeric: true, aliases: ["other allowances", "other allowance"] },
    { key: "bonus", label: "Bonus", group: "earning", required: false, numeric: true, aliases: ["bonus", "performance bonus"] },
    { key: "incentives", label: "Incentives", group: "earning", required: false, numeric: true, aliases: ["incentives", "incentive", "commission"] },
    { key: "overtime", label: "Overtime", group: "earning", required: false, numeric: true, aliases: ["overtime", "ot", "overtime pay"] },
    { key: "otherEarnings", label: "Other Earnings", group: "earning", required: false, numeric: true, aliases: ["other earnings", "misc earnings", "arrears"] },

    // Deductions
    { key: "pf", label: "Provident Fund (PF)", group: "deduction", required: false, numeric: true, aliases: ["provident fund (pf)", "provident fund", "pf", "epf"] },
    { key: "esi", label: "Employee State Insurance (ESI)", group: "deduction", required: false, numeric: true, aliases: ["employee state insurance (esi)", "esi", "esic"] },
    { key: "pt", label: "Professional Tax", group: "deduction", required: false, numeric: true, aliases: ["professional tax", "pt", "prof tax"] },
    { key: "tds", label: "Tax Deducted at Source (TDS)", group: "deduction", required: false, numeric: true, aliases: ["tax deducted at source (tds)", "tds", "income tax", "tax"] },
    { key: "loan", label: "Loan Deduction", group: "deduction", required: false, numeric: true, aliases: ["loan deduction", "loan", "emi"] },
    { key: "advance", label: "Advance Salary Deduction", group: "deduction", required: false, numeric: true, aliases: ["advance salary deduction", "advance salary", "salary advance", "advance"] },
    { key: "otherDeductions", label: "Other Deductions", group: "deduction", required: false, numeric: true, aliases: ["other deductions", "other deduction", "misc deductions"] },

    // Attendance & Payment
    { key: "workingDays", label: "Total Working Days", group: "attendance", required: false, numeric: true, aliases: ["total working days", "working days", "total days"] },
    { key: "daysWorked", label: "Days Worked", group: "attendance", required: false, numeric: true, aliases: ["days worked", "paid days", "present days"] },
    { key: "lwp", label: "Leave Without Pay", group: "attendance", required: false, numeric: true, aliases: ["leave without pay", "lwp", "lop", "lop days"] },
    { key: "paymentMode", label: "Payment Mode", group: "attendance", required: false, aliases: ["payment mode", "pay mode", "mode of payment"] },
  ];

  const EARNING_KEYS = FIELD_DEFS.filter((f) => f.group === "earning").map((f) => f.key);
  const DEDUCTION_KEYS = FIELD_DEFS.filter((f) => f.group === "deduction").map((f) => f.key);

  const MAX_ROWS_WARN = 500;
  const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB spreadsheet guard

  // Strictly volatile in-memory state (never persisted to web storage or uploaded)
  const now = new Date();
  let state = createDefaultState();

  function createDefaultState() {
    const y = now.getFullYear();
    const m = now.getMonth();
    const fy = m >= 3 ? `FY ${y}-${String(y + 1).slice(-2)}` : `FY ${y - 1}-${String(y).slice(-2)}`;
    const todayIso = `${y}-${String(m + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    return {
      company: {
        name: "",
        logoDataUrl: null,
        stampDataUrl: null,
        address: "",
        email: "",
        phone: "",
        gstin: "",
        pan: "",
        website: "",
        signatory: "",
      },
      payroll: {
        month: m,
        year: y,
        issueDate: todayIso,
        paymentDate: todayIso,
        currency: "INR",
        financialYear: fy,
        referenceNo: `PR-${y}-${String(m + 1).padStart(2, "0")}`,
        prefix: "OS",
        numFormat: "PREFIX/YYYY/MM/EMPID", // or PREFIX-YYYY-MM-SEQ
      },
      customization: {
        template: "modern", // 'modern' | 'classic'
        brandColor: "#056cb8",
        heading: "PAYSLIP",
        fontSize: "13",
        tableLayout: "side-by-side", // 'side-by-side' | 'stacked'
        numberFormat: "en-IN", // 'en-IN' | 'en-US'
        footerMessage: "This is a computer-generated payslip.",
        showOptionalFields: true,
        showEmptyRows: false,
        allowNegativeNetOverride: false,
      },
      uploadedFileName: "",
      headers: [],
      rawRows: [],
      mapping: {},          // fieldKey -> headerName
      ambiguousFields: [],  // fieldKeys that had multiple candidate columns
      customEarnings: [],   // headerNames mapped as extra earnings
      customDeductions: [], // headerNames mapped as extra deductions
      parsedRecords: [],    // normalized & validated row objects
      previewIndex: 0,
      previewPrintMode: false,
      isGenerating: false,
      generatedPdfs: [],    // { rowIndex, empId, empName, payslipNo, filename, bytes, url, netSalary, status, error }
      combinedPdfUrl: null,
      zipBlobUrl: null,
    };
  }

  /* ---------- Resource Cleanup ---------- */
  function revokeAllBlobUrls() {
    for (const item of state.generatedPdfs) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
    state.generatedPdfs = [];
    if (state.combinedPdfUrl) {
      URL.revokeObjectURL(state.combinedPdfUrl);
      state.combinedPdfUrl = null;
    }
    if (state.zipBlobUrl) {
      URL.revokeObjectURL(state.zipBlobUrl);
      state.zipBlobUrl = null;
    }
  }

  window.addEventListener("beforeunload", revokeAllBlobUrls);

  /* ---------- Toast & Confirmation ---------- */
  let toastTimer = null;
  function toast(msg, kind) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
  }

  function confirmAction(title, msg) {
    const dlg = $("bpConfirmDialog");
    if (!dlg) return Promise.resolve(window.confirm(msg));
    $("bpConfirmTitle").textContent = title;
    $("bpConfirmMsg").textContent = msg;
    return new Promise((resolve) => {
      const ok = $("bpConfirmOk");
      const cancel = $("bpConfirmCancel");
      const closeTop = $("bpConfirmCloseTop");
      const done = (ans) => {
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        closeTop.removeEventListener("click", onCancel);
        if (dlg.open) dlg.close();
        resolve(ans);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      closeTop.addEventListener("click", onCancel);
      dlg.showModal();
    });
  }

  /* ---------- Utilities: Escaping, Decimal-Safe Math, Formatting, Indian Words ---------- */
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function toCents(val) {
    return Math.round(Number(val) * 100);
  }

  function fromCents(cents) {
    return Math.round(cents) / 100;
  }

  function parseAmount(raw) {
    if (raw === null || raw === undefined) return { ok: true, empty: true, value: 0, cents: 0 };
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return { ok: false, empty: false, reason: "Invalid number" };
      if (raw < 0) return { ok: false, empty: false, value: raw, reason: "Negative value not allowed" };
      return { ok: true, empty: false, value: fromCents(toCents(raw)), cents: toCents(raw) };
    }
    const cleaned = String(raw).trim().replace(/[₹$€£,\s]/g, "");
    if (!cleaned) return { ok: true, empty: true, value: 0, cents: 0 };
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return { ok: false, empty: false, reason: `Invalid numeric value "${raw}"` };
    }
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return { ok: false, empty: false, reason: `Invalid numeric value "${raw}"` };
    if (num < 0) return { ok: false, empty: false, value: num, reason: `Negative amount (${cleaned})` };
    const cents = toCents(num);
    return { ok: true, empty: false, value: fromCents(cents), cents };
  }

  function maskBankLast4(raw) {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const last4 = digits.slice(-4);
    return `XXXX${last4}`;
  }

  function formatMoney(amount, forPdf = false) {
    const cur = CURRENCIES[state.payroll.currency] || CURRENCIES.INR;
    const prefix = forPdf ? cur.pdfPrefix : cur.symbol;
    const locale = state.customization.numberFormat || "en-IN";
    const abs = Math.abs(amount);
    const hasFraction = Math.abs(abs - Math.round(abs)) > 0.001;
    const formatted = abs.toLocaleString(locale, {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
    return `${amount < 0 ? "-" : ""}${prefix}${formatted}`;
  }

  function numberToIndianWords(amount) {
    const cur = CURRENCIES[state.payroll.currency] || CURRENCIES.INR;
    const isNeg = amount < 0;
    const totalCents = Math.abs(toCents(amount));
    const whole = Math.floor(totalCents / 100);
    const sub = totalCents % 100;

    const ones = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
      "Seventeen", "Eighteen", "Nineteen",
    ];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const twoDigits = (n) => {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return o ? `${tens[t]}-${ones[o]}` : tens[t];
    };

    const threeDigits = (n) => {
      const h = Math.floor(n / 100);
      const rem = n % 100;
      if (h && rem) return `${ones[h]} Hundred ${twoDigits(rem)}`;
      if (h) return `${ones[h]} Hundred`;
      return twoDigits(rem);
    };

    let words = "";
    if (whole === 0) {
      words = "Zero";
    } else {
      const parts = [];
      const crore = Math.floor(whole / 10000000);
      const lakh = Math.floor((whole % 10000000) / 100000);
      const thousand = Math.floor((whole % 100000) / 1000);
      const hundred = whole % 1000;

      if (crore) parts.push(`${twoDigits(crore)} Crore`);
      if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
      if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
      if (hundred) parts.push(threeDigits(hundred));
      words = parts.join(" ");
    }

    let out = `${isNeg ? "Minus " : ""}${words} ${cur.unit}`;
    if (sub > 0) {
      out += ` and ${twoDigits(sub)} ${cur.subunit}`;
    }
    return `${out} Only`;
  }

  function normalizeDateCell(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") return { ok: true, value: "" };
    if (typeof raw === "number" && raw > 20000 && raw < 80000) {
      // Excel serial date
      const utcDays = Math.floor(raw - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(d.getTime())) {
        return { ok: true, value: d.toISOString().slice(0, 10) };
      }
    }
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s) || !Number.isNaN(Date.parse(s))) {
      return { ok: true, value: s };
    }
    return { ok: false, value: s, reason: `Invalid date "${s}"` };
  }

  function buildPayslipNumber(empId, seqIndex) {
    const prefix = (state.payroll.prefix || "OS").trim().replace(/[^A-Za-z0-9_-]/g, "") || "OS";
    const yyyy = String(state.payroll.year);
    const mm = String(state.payroll.month + 1).padStart(2, "0");
    const cleanId = String(empId || "").trim().replace(/[^A-Za-z0-9_-]/g, "") || `EMP${String(seqIndex + 1).padStart(3, "0")}`;
    const seq = String(seqIndex + 1).padStart(3, "0");

    if (state.payroll.numFormat === "PREFIX-YYYY-MM-SEQ") {
      return `${prefix}-${yyyy}-${mm}-${seq}`;
    }
    return `${prefix}/${yyyy}/${mm}/${cleanId}`;
  }

  function sanitizeFilenamePart(s) {
    return String(s || "Employee").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Employee";
  }

  /* ---------- Download Ready-Made Excel Template ---------- */
  function downloadExcelTemplate() {
    if (!window.XLSX) {
      toast("Excel library (SheetJS) failed to load.", "error");
      return;
    }
    const XLSX = window.XLSX;
    const headers = FIELD_DEFS.map((f) => f.label);
    const sampleRows = [
      [
        "EMP001", "Rahul Sharma", "Senior Software Engineer", "Engineering", "2023-04-10", "Mumbai", "4821",
        45000, 18000, 3000, 1500, 8500, 0, 5000, 0, 0, 0,
        5400, 0, 200, 4500, 0, 0, 0,
        22, 22, 0, "Bank Transfer",
      ],
      [
        "EMP002", "Priya Deshmukh", "Product Designer", "Design", "2024-01-15", "Pune", "9134",
        38000, 15200, 2500, 1250, 6050, 0, 0, 3000, 0, 0,
        4560, 0, 200, 2200, 0, 0, 0,
        22, 21, 1, "NEFT",
      ],
      [
        "EMP003", "Amit Kulkarni", "HR Executive", "Human Resources", "2024-07-01", "Bengaluru", "6602",
        28000, 11200, 2000, 1000, 4300, 0, 0, 0, 1500, 0,
        3360, 0, 200, 800, 1000, 0, 0,
        22, 22, 0, "Bank Transfer",
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(15, h.length + 3) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Salary Data");
    XLSX.writeFile(wb, "OpenSign_Bulk_Payslip_Template.xlsx");
    toast("Downloaded OpenSign_Bulk_Payslip_Template.xlsx");
  }

  /* ---------- Load 10-Employee Sample Dataset (Quick Local Test) ---------- */
  function loadSampleDataset() {
    const headers = FIELD_DEFS.map((f) => f.label);
    const sampleEmployees = [
      ["EMP001", "Rahul Sharma", "Senior Engineer", "Engineering", "2023-04-10", "Mumbai", "4821", 45000, 18000, 3000, 1500, 8500, 0, 5000, 0, 0, 0, 5400, 0, 200, 4500, 0, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP002", "Priya Deshmukh", "Product Designer", "Design", "2024-01-15", "Pune", "9134", 38000, 15200, 2500, 1250, 6050, 0, 0, 3000, 0, 0, 4560, 0, 200, 2200, 0, 0, 0, 22, 21, 1, "NEFT"],
      ["EMP003", "Amit Kulkarni", "HR Executive", "Human Resources", "2024-07-01", "Bengaluru", "6602", 28000, 11200, 2000, 1000, 4300, 0, 0, 0, 1500, 0, 3360, 0, 200, 800, 1000, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP004", "Sneha Joshi", "Account Manager", "Sales", "2023-09-18", "Mumbai", "3345", 36000, 14400, 2500, 1250, 5850, 0, 4000, 6000, 0, 0, 4320, 0, 200, 3200, 0, 0, 0, 22, 22, 0, "IMPS"],
      ["EMP005", "Vikram Mehta", "Finance Analyst", "Finance", "2022-11-05", "Delhi NCR", "7710", 42000, 16800, 3000, 1500, 7200, 0, 0, 0, 0, 0, 5040, 0, 200, 3800, 0, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP006", "Ananya Iyer", "QA Lead", "Engineering", "2023-02-20", "Chennai", "5598", 40000, 16000, 2500, 1250, 6750, 0, 2500, 0, 0, 0, 4800, 0, 200, 3100, 0, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP007", "Karan Verma", "Support Specialist", "Customer Support", "2025-01-08", "Hyderabad", "2041", 22000, 8800, 1600, 1000, 3100, 0, 0, 1500, 800, 0, 2640, 290, 200, 0, 0, 0, 0, 22, 22, 0, "NEFT"],
      ["EMP008", "Diya Menon", "Content Strategist", "Marketing", "2024-05-12", "Kochi", "8823", 32000, 12800, 2000, 1250, 4950, 0, 0, 2000, 0, 0, 3840, 0, 200, 1500, 0, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP009", "Rohan Das", "DevOps Engineer", "Engineering", "2023-08-01", "Kolkata", "1190", 48000, 19200, 3000, 1500, 9300, 0, 0, 0, 2000, 0, 5760, 0, 200, 5600, 0, 0, 0, 22, 22, 0, "Bank Transfer"],
      ["EMP010", "Neha Kapoor", "Operations Manager", "Operations", "2022-06-14", "Mumbai", "6409", 44000, 17600, 3000, 1500, 7900, 0, 3000, 0, 0, 0, 5280, 0, 200, 4100, 0, 2000, 0, 22, 22, 0, "Bank Transfer"],
    ];

    const rowObjs = sampleEmployees.map((arr) => {
      const o = {};
      headers.forEach((h, i) => (o[h] = arr[i]));
      return o;
    });

    ingestUploadedTable("Sample_10_Employees_Payroll.xlsx", headers, rowObjs);
    toast("Loaded 10-employee sample dataset.");
  }

  /* ---------- Parse Uploaded Excel / CSV File Locally ---------- */
  async function handleSpreadsheetFile(file) {
    if (!file) return;
    const fname = file.name || "payroll.xlsx";
    if (!/\.(xlsx|xls|csv)$/i.test(fname)) {
      toast(`Unsupported file "${fname}". Upload .xlsx, .xls, or .csv.`, "error");
      return;
    }
    if (file.size === 0) {
      toast(`"${fname}" is empty (0 bytes).`, "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast(`"${fname}" exceeds the 15 MB browser spreadsheet limit.`, "error");
      return;
    }
    if (!window.XLSX) {
      toast("Spreadsheet parser (SheetJS) failed to load.", "error");
      return;
    }

    try {
      const ab = await file.arrayBuffer();
      const wb = window.XLSX.read(ab, { type: "array", raw: true });
      const firstSheet = wb.SheetNames?.[0];
      if (!firstSheet) throw new Error("No worksheets found in this file.");

      const ws = wb.Sheets[firstSheet];
      const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!aoa || aoa.length < 2) {
        throw new Error("Spreadsheet has no employee rows below the header row.");
      }

      const rawHeaders = aoa[0].map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
      // Deduplicate identical header names cleanly
      const seenH = new Map();
      const headers = rawHeaders.map((h) => {
        const cnt = (seenH.get(h) || 0) + 1;
        seenH.set(h, cnt);
        return cnt > 1 ? `${h} (${cnt})` : h;
      });

      const rows = [];
      for (let r = 1; r < aoa.length; r++) {
        const line = aoa[r];
        if (!line || line.every((cell) => String(cell ?? "").trim() === "")) continue;
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = line[idx] !== undefined ? line[idx] : "";
        });
        rows.push(obj);
      }

      if (!rows.length) {
        throw new Error("All data rows in the spreadsheet are empty.");
      }

      if (rows.length > MAX_ROWS_WARN) {
        toast(`Large batch detected (${rows.length} rows). Generation will run in chunks to keep the browser responsive.`);
      }

      ingestUploadedTable(fname, headers, rows);
      toast(`Loaded ${rows.length} employee record(s) from "${fname}".`);
    } catch (err) {
      toast(err?.message || `Could not read "${fname}". The file may be corrupted or encrypted.`, "error");
    }
  }

  /* ---------- Ambiguity-Safe Column Auto-Mapping ---------- */
  function ingestUploadedTable(filename, headers, rawRows) {
    revokeAllBlobUrls();
    state.uploadedFileName = filename;
    state.headers = headers;
    state.rawRows = rawRows;
    state.mapping = {};
    state.ambiguousFields = [];
    state.customEarnings = [];
    state.customDeductions = [];
    state.previewIndex = 0;

    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const usedHeaders = new Set();

    // Pass 1: Exact alias match
    for (const def of FIELD_DEFS) {
      const exactMatches = headers.filter((h) => !usedHeaders.has(h) && def.aliases.includes(norm(h)));
      if (exactMatches.length === 1) {
        state.mapping[def.key] = exactMatches[0];
        usedHeaders.add(exactMatches[0]);
      } else if (exactMatches.length > 1) {
        // Ambiguous — do NOT silently assume!
        state.mapping[def.key] = "";
        state.ambiguousFields.push(def.key);
      }
    }

    // Pass 2: Unambiguous substring match only if single candidate
    for (const def of FIELD_DEFS) {
      if (state.mapping[def.key] || state.ambiguousFields.includes(def.key)) continue;
      const partial = headers.filter((h) => {
        if (usedHeaders.has(h)) return false;
        const nh = norm(h);
        return def.aliases.some((al) => al.length >= 4 && (nh.includes(al) || al.includes(nh)));
      });
      if (partial.length === 1) {
        state.mapping[def.key] = partial[0];
        usedHeaders.add(partial[0]);
      } else if (partial.length > 1) {
        state.mapping[def.key] = "";
        state.ambiguousFields.push(def.key);
      }
    }

    recomputeRecords();
    renderUploadAndMappingUI();
    renderValidationTable();
    renderPayslipPreview();
    renderGenerationPanel();
    updateStepIndicators();

    $("step4").hidden = false;
    $("step5").hidden = false;
    $("step4").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Validate & Calculate All Employee Rows (Decimal-Safe) ---------- */
  function recomputeRecords() {
    const prevExcluded = new Map();
    state.parsedRecords.forEach((r) => prevExcluded.set(r.rowIndex, r.excluded));

    const empIdCounts = new Map();
    const payslipNoSet = new Set();

    // Pre-count Employee IDs to detect duplicates
    state.rawRows.forEach((raw) => {
      const idCol = state.mapping.empId;
      const rawId = idCol ? String(raw[idCol] ?? "").trim() : "";
      if (rawId) {
        const low = rawId.toLowerCase();
        empIdCounts.set(low, (empIdCounts.get(low) || 0) + 1);
      }
    });

    const hasAnyEarningMapped =
      EARNING_KEYS.some((k) => Boolean(state.mapping[k])) || state.customEarnings.length > 0;

    state.parsedRecords = state.rawRows.map((raw, idx) => {
      const getVal = (key) => {
        const col = state.mapping[key];
        return col ? raw[col] : "";
      };

      const errors = [];
      const warnings = [];

      const empId = String(getVal("empId") ?? "").trim();
      const empName = String(getVal("empName") ?? "").trim();
      const designation = String(getVal("designation") ?? "").trim();
      const department = String(getVal("department") ?? "").trim();
      const location = String(getVal("location") ?? "").trim();
      const bankLast4 = maskBankLast4(getVal("bankLast4"));
      const paymentMode = String(getVal("paymentMode") ?? "").trim();

      const dojCheck = normalizeDateCell(getVal("doj"));
      if (!dojCheck.ok) errors.push(dojCheck.reason);

      if (!empName) errors.push("Missing Employee Name");
      if (empId && (empIdCounts.get(empId.toLowerCase()) || 0) > 1) {
        errors.push(`Duplicate Employee ID "${empId}"`);
      }
      if (!hasAnyEarningMapped) {
        errors.push("No salary earning column mapped (map Basic Salary)");
      }

      // Compute Earnings in integer cents
      const earnings = [];
      let totalEarningsCents = 0;

      for (const k of EARNING_KEYS) {
        const def = FIELD_DEFS.find((d) => d.key === k);
        const col = state.mapping[k];
        if (!col) continue;
        const parsed = parseAmount(raw[col]);
        if (!parsed.ok) {
          errors.push(`${def.label}: ${parsed.reason}`);
        } else {
          totalEarningsCents += parsed.cents;
          earnings.push({ key: k, label: def.label, cents: parsed.cents, amount: parsed.value });
        }
      }

      // Custom mapped earnings
      for (const cHeader of state.customEarnings) {
        const parsed = parseAmount(raw[cHeader]);
        if (!parsed.ok) {
          errors.push(`${cHeader}: ${parsed.reason}`);
        } else {
          totalEarningsCents += parsed.cents;
          earnings.push({ key: `ce_${cHeader}`, label: cHeader, cents: parsed.cents, amount: parsed.value });
        }
      }

      // Compute Deductions in integer cents (strictly from uploaded values — zero assumed statutory rates!)
      const deductions = [];
      let totalDeductionsCents = 0;

      for (const k of DEDUCTION_KEYS) {
        const def = FIELD_DEFS.find((d) => d.key === k);
        const col = state.mapping[k];
        if (!col) continue;
        const parsed = parseAmount(raw[col]);
        if (!parsed.ok) {
          errors.push(`${def.label}: ${parsed.reason}`);
        } else {
          totalDeductionsCents += parsed.cents;
          deductions.push({ key: k, label: def.label, cents: parsed.cents, amount: parsed.value });
        }
      }

      for (const cHeader of state.customDeductions) {
        const parsed = parseAmount(raw[cHeader]);
        if (!parsed.ok) {
          errors.push(`${cHeader}: ${parsed.reason}`);
        } else {
          totalDeductionsCents += parsed.cents;
          deductions.push({ key: `cd_${cHeader}`, label: cHeader, cents: parsed.cents, amount: parsed.value });
        }
      }

      // Attendance optional numeric fields
      const wdP = parseAmount(getVal("workingDays"));
      const dwP = parseAmount(getVal("daysWorked"));
      const lwpP = parseAmount(getVal("lwp"));
      if (!wdP.ok) errors.push(`Total Working Days: ${wdP.reason}`);
      if (!dwP.ok) errors.push(`Days Worked: ${dwP.reason}`);
      if (!lwpP.ok) errors.push(`Leave Without Pay: ${lwpP.reason}`);

      const netCents = totalEarningsCents - totalDeductionsCents;
      if (totalEarningsCents === 0 && hasAnyEarningMapped) {
        warnings.push("Total Earnings is 0");
      }
      if (totalDeductionsCents > totalEarningsCents) {
        if (state.customization.allowNegativeNetOverride) {
          warnings.push("Deductions exceed earnings (authorized override active)");
        } else {
          errors.push("Total Deductions exceed Total Earnings");
        }
      }

      // Unique payslip number generation with duplicate guard
      let payslipNo = buildPayslipNumber(empId, idx);
      if (payslipNoSet.has(payslipNo.toLowerCase())) {
        payslipNo = `${payslipNo}-${idx + 1}`;
        warnings.push("Adjusted payslip number to avoid duplicate in batch");
      }
      payslipNoSet.add(payslipNo.toLowerCase());

      return {
        rowIndex: idx,
        excluded: prevExcluded.get(idx) || false,
        empId,
        empName,
        designation,
        department,
        doj: dojCheck.value,
        location,
        bankLast4,
        paymentMode,
        workingDays: wdP.empty ? "" : wdP.value,
        daysWorked: dwP.empty ? "" : dwP.value,
        lwp: lwpP.empty ? "" : lwpP.value,
        earnings,
        deductions,
        totalEarningsCents,
        totalDeductionsCents,
        netCents,
        totalEarnings: fromCents(totalEarningsCents),
        totalDeductions: fromCents(totalDeductionsCents),
        netSalary: fromCents(netCents),
        payslipNo,
        errors,
        warnings,
        valid: errors.length === 0,
      };
    });
  }

  /* ---------- Render Column Mapping UI ---------- */
  function renderUploadAndMappingUI() {
    $("bpLoadedFileBar").hidden = !state.uploadedFileName;
    $("bpLoadedFileName").textContent = state.uploadedFileName || "No file loaded";
    $("bpLoadedRowCount").textContent = `${state.rawRows.length} employee rows · ${state.headers.length} columns`;

    const ambAlert = $("bpAmbiguousAlert");
    if (state.ambiguousFields.length) {
      ambAlert.hidden = false;
      ambAlert.textContent = `Ambiguous column headers detected for: ${state.ambiguousFields
        .map((k) => FIELD_DEFS.find((d) => d.key === k)?.label || k)
        .join(", ")}. Please map them manually below.`;
    } else {
      ambAlert.hidden = true;
    }

    const mapGrid = $("bpMappingGrid");
    mapGrid.innerHTML = "";
    for (const def of FIELD_DEFS) {
      const box = document.createElement("div");
      const isAmb = state.ambiguousFields.includes(def.key) && !state.mapping[def.key];
      box.className = `bp-map-item${isAmb ? " is-ambiguous" : ""}`;

      const opts = [
        `<option value="">— Not Mapped —</option>`,
        ...state.headers.map(
          (h) => `<option value="${esc(h)}"${state.mapping[def.key] === h ? " selected" : ""}>${esc(h)}</option>`
        ),
      ].join("");

      box.innerHTML = `
        <label for="map_${def.key}">${esc(def.label)}${def.required ? ' <span style="color:#e42527">*</span>' : ""}</label>
        <select id="map_${def.key}" class="bp-select" style="padding:6px 8px;font-size:12.5px" data-map-key="${def.key}">${opts}</select>
      `;

      box.querySelector("select").addEventListener("change", (e) => {
        state.mapping[def.key] = e.target.value;
        state.ambiguousFields = state.ambiguousFields.filter((k) => k !== def.key);
        recomputeRecords();
        renderValidationTable();
        renderPayslipPreview();
        renderGenerationPanel();
      });

      mapGrid.appendChild(box);
    }

    // Extra Unmapped Columns -> allow assigning as Custom Earning or Custom Deduction
    const mappedSet = new Set(Object.values(state.mapping).filter(Boolean));
    const unmapped = state.headers.filter((h) => !mappedSet.has(h));
    const customWrap = $("bpCustomColsWrap");
    customWrap.innerHTML = "";

    if (!unmapped.length) {
      customWrap.innerHTML = `<p class="bp-hint">All uploaded columns are mapped to standard payslip fields.</p>`;
    } else {
      unmapped.forEach((h) => {
        const curRole = state.customEarnings.includes(h)
          ? "earning"
          : state.customDeductions.includes(h)
            ? "deduction"
            : "ignore";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:#fafbfd";
        row.innerHTML = `
          <strong style="font-size:12.5px">${esc(h)}</strong>
          <select class="bp-select" style="width:auto;padding:5px 9px;font-size:12px">
            <option value="ignore"${curRole === "ignore" ? " selected" : ""}>Ignore Column</option>
            <option value="earning"${curRole === "earning" ? " selected" : ""}>Add as Custom Earning</option>
            <option value="deduction"${curRole === "deduction" ? " selected" : ""}>Add as Custom Deduction</option>
          </select>
        `;
        row.querySelector("select").addEventListener("change", (e) => {
          state.customEarnings = state.customEarnings.filter((x) => x !== h);
          state.customDeductions = state.customDeductions.filter((x) => x !== h);
          if (e.target.value === "earning") state.customEarnings.push(h);
          else if (e.target.value === "deduction") state.customDeductions.push(h);
          recomputeRecords();
          renderValidationTable();
          renderPayslipPreview();
          renderGenerationPanel();
        });
        customWrap.appendChild(row);
      });
    }
  }

  /* ---------- Render Validation Summary & Row Table ---------- */
  function renderValidationTable() {
    const total = state.parsedRecords.length;
    const validCnt = state.parsedRecords.filter((r) => r.valid && !r.excluded).length;
    const invalidCnt = state.parsedRecords.filter((r) => !r.valid && !r.excluded).length;
    const excludedCnt = state.parsedRecords.filter((r) => r.excluded).length;

    $("bpStatTotal").textContent = String(total);
    $("bpStatValid").textContent = String(validCnt);
    $("bpStatInvalid").textContent = String(invalidCnt);
    $("bpStatExcluded").textContent = String(excludedCnt);

    $("bpErrReportBtn").disabled = invalidCnt === 0;

    const tbody = $("bpValTableBody");
    tbody.innerHTML = "";

    state.parsedRecords.forEach((rec) => {
      const tr = document.createElement("tr");
      if (rec.excluded) tr.className = "is-row-excluded";
      else if (!rec.valid) tr.className = "is-row-invalid";

      const badgeHtml = rec.excluded
        ? `<span class="bp-pill is-excluded">Excluded</span>`
        : !rec.valid
          ? `<span class="bp-pill is-invalid">Invalid</span>`
          : rec.warnings.length
            ? `<span class="bp-pill is-warn">Valid (Warn)</span>`
            : `<span class="bp-pill is-valid">Valid</span>`;

      const notesHtml = [...rec.errors, ...rec.warnings].map((m) => esc(m)).join("; ") || "Ready";

      tr.innerHTML = `
        <td>${rec.rowIndex + 1}</td>
        <td><strong>${esc(rec.empId || "—")}</strong></td>
        <td>${esc(rec.empName || "(Missing Name)")}</td>
        <td>${esc(rec.department || "—")}</td>
        <td>${esc(formatMoney(rec.totalEarnings))}</td>
        <td>${esc(formatMoney(rec.totalDeductions))}</td>
        <td><strong>${esc(formatMoney(rec.netSalary))}</strong></td>
        <td>${badgeHtml}</td>
        <td style="font-size:11.5px;max-width:220px">${notesHtml}</td>
        <td>
          <div style="display:inline-flex;gap:5px">
            <button type="button" class="bp-mini-btn" style="min-height:28px;padding:0 9px;font-size:11.5px" data-edit-row="${rec.rowIndex}">Edit</button>
            <button type="button" class="bp-mini-btn" style="min-height:28px;padding:0 9px;font-size:11.5px" data-toggle-excl="${rec.rowIndex}">${rec.excluded ? "Include" : "Exclude"}</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-edit-row]").forEach((btn) => {
      btn.addEventListener("click", () => openEditRowModal(Number(btn.dataset.editRow)));
    });
    tbody.querySelectorAll("[data-toggle-excl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.toggleExcl);
        const r = state.parsedRecords[idx];
        if (!r) return;
        r.excluded = !r.excluded;
        renderValidationTable();
        renderPayslipPreview();
        renderGenerationPanel();
      });
    });
  }

  /* ---------- Inline Row Error Correction Modal ---------- */
  let editingRowIdx = null;
  function openEditRowModal(rowIndex) {
    const raw = state.rawRows[rowIndex];
    if (!raw) return;
    editingRowIdx = rowIndex;

    const dlg = $("bpEditRowDialog");
    $("bpEditRowTitle").textContent = `Edit Row #${rowIndex + 1}`;
    const formBody = $("bpEditRowFields");
    formBody.innerHTML = "";

    const editableKeys = ["empId", "empName", "designation", "department", "doj", "location", "bankLast4", "basic", "hra", "conveyance", "medical", "special", "bonus", "pf", "esi", "pt", "tds", "loan", "advance", "otherDeductions"];
    for (const k of editableKeys) {
      const col = state.mapping[k];
      if (!col) continue;
      const def = FIELD_DEFS.find((d) => d.key === k);
      const wrap = document.createElement("div");
      wrap.className = "bp-field";
      wrap.innerHTML = `
        <label for="edit_r_${k}">${esc(def.label)}</label>
        <input type="text" id="edit_r_${k}" class="bp-input" value="${esc(raw[col] ?? "")}" data-edit-col="${esc(col)}" />
      `;
      formBody.appendChild(wrap);
    }

    dlg.showModal();
  }

  /* ---------- Interactive Payslip Preview ---------- */
  function getEligibleRecords() {
    return state.parsedRecords.filter((r) => r.valid && !r.excluded);
  }

  function renderPayslipPreview() {
    const validRows = getEligibleRecords();
    const sel = $("bpPreviewSelect");
    const stage = $("bpPreviewStage");
    if (!sel || !stage) return;

    sel.innerHTML = "";
    if (!validRows.length) {
      sel.innerHTML = `<option value="">No valid employees to preview</option>`;
      $("bpPrevEmpBtn").disabled = true;
      $("bpNextEmpBtn").disabled = true;
      stage.innerHTML = `<p style="text-align:center;color:var(--muted);padding:24px;margin:0">Fix invalid rows or upload a spreadsheet to preview individual payslips.</p>`;
      return;
    }

    if (state.previewIndex >= validRows.length) state.previewIndex = 0;
    if (state.previewIndex < 0) state.previewIndex = validRows.length - 1;

    validRows.forEach((r, idx) => {
      const o = document.createElement("option");
      o.value = String(idx);
      o.textContent = `${r.empId ? `${r.empId} — ` : ""}${r.empName}`;
      sel.appendChild(o);
    });
    sel.value = String(state.previewIndex);
    $("bpPrevEmpBtn").disabled = validRows.length <= 1;
    $("bpNextEmpBtn").disabled = validRows.length <= 1;

    const rec = validRows[state.previewIndex];
    const co = state.company;
    const pr = state.payroll;
    const cu = state.customization;
    const periodLabel = `${MONTHS[pr.month]} ${pr.year}`;

    const visibleEarnings = cu.showEmptyRows ? rec.earnings : rec.earnings.filter((x) => x.cents > 0);
    const visibleDeductions = cu.showEmptyRows ? rec.deductions : rec.deductions.filter((x) => x.cents > 0);

    const earnRowsHtml = visibleEarnings.length
      ? visibleEarnings.map((e) => `<tr><td>${esc(e.label)}</td><td>${esc(formatMoney(e.amount))}</td></tr>`).join("")
      : `<tr><td colspan="2" style="color:#64748b">No earnings listed</td></tr>`;

    const dedRowsHtml = visibleDeductions.length
      ? visibleDeductions.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(formatMoney(d.amount))}</td></tr>`).join("")
      : `<tr><td colspan="2" style="color:#64748b">No deductions</td></tr>`;

    const coContact = [co.phone, co.email, co.website].filter(Boolean).join(" · ");
    const coTax = cu.showOptionalFields
      ? [co.gstin ? `GSTIN: ${co.gstin}` : "", co.pan ? `PAN: ${co.pan}` : ""].filter(Boolean).join(" · ")
      : "";

    const empInfoPairs = [
      ["Employee Name", rec.empName],
      ["Employee ID", rec.empId || "—"],
      ["Designation", rec.designation || "—"],
      ["Department", rec.department || "—"],
      ...(cu.showOptionalFields && rec.doj ? [["Date of Joining", rec.doj]] : []),
      ...(cu.showOptionalFields && rec.location ? [["Work Location", rec.location]] : []),
      ...(cu.showOptionalFields && rec.bankLast4 ? [["Bank Account", rec.bankLast4]] : []),
      ...(cu.showOptionalFields && rec.paymentMode ? [["Payment Mode", rec.paymentMode]] : []),
      ...(cu.showOptionalFields && rec.workingDays !== "" ? [["Working / Paid Days", `${rec.workingDays} / ${rec.daysWorked !== "" ? rec.daysWorked : rec.workingDays}${rec.lwp ? ` (LWP: ${rec.lwp})` : ""}`]] : []),
    ];

    stage.className = `bp-preview-stage${state.previewPrintMode ? " is-print-mode" : ""}`;
    stage.innerHTML = `
      <div class="bp-sheet${cu.template === "classic" ? " is-classic" : ""}" style="--bp-brand:${esc(cu.brandColor)};--bp-font-size:${esc(cu.fontSize)}px">
        <div class="bp-sheet-head">
          <div class="bp-sheet-brand">
            ${co.logoDataUrl ? `<img src="${co.logoDataUrl}" class="bp-sheet-logo" alt="Company logo" />` : ""}
            <div>
              <h3 class="bp-sheet-co">${esc(co.name || "Company Name")}</h3>
              ${co.address ? `<div class="bp-sheet-meta">${esc(co.address)}</div>` : ""}
              ${coContact ? `<div class="bp-sheet-meta">${esc(coContact)}</div>` : ""}
              ${coTax ? `<div class="bp-sheet-meta">${esc(coTax)}</div>` : ""}
            </div>
          </div>

          <div class="bp-sheet-title-box">
            <h4 class="bp-sheet-title">${esc(cu.heading || "PAYSLIP")}</h4>
            <div class="bp-sheet-meta"><strong>${esc(periodLabel)}</strong></div>
            <div class="bp-sheet-meta">Payslip No: <strong>${esc(rec.payslipNo)}</strong></div>
            ${pr.issueDate ? `<div class="bp-sheet-meta">Issued: ${esc(pr.issueDate)}</div>` : ""}
            ${cu.showOptionalFields && pr.financialYear ? `<div class="bp-sheet-meta">${esc(pr.financialYear)}</div>` : ""}
          </div>
        </div>

        <div class="bp-emp-grid">
          ${empInfoPairs.map(([k, v]) => `<div class="bp-emp-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}
        </div>

        <div class="bp-pay-tables${cu.tableLayout === "stacked" ? " is-stacked" : ""}">
          <table class="bp-pay-tbl">
            <thead><tr><th>Earnings</th><th>Amount</th></tr></thead>
            <tbody>
              ${earnRowsHtml}
              <tr class="bp-total-row"><td>Total Earnings</td><td>${esc(formatMoney(rec.totalEarnings))}</td></tr>
            </tbody>
          </table>

          <table class="bp-pay-tbl">
            <thead><tr><th>Deductions</th><th>Amount</th></tr></thead>
            <tbody>
              ${dedRowsHtml}
              <tr class="bp-total-row"><td>Total Deductions</td><td>${esc(formatMoney(rec.totalDeductions))}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="bp-net-box">
          <div>
            <div style="font-size:0.85em;font-weight:700;text-transform:uppercase;color:#4a5568">Net Salary Payable</div>
            <div style="font-size:0.9em;color:#0b132b;margin-top:2px"><strong>In Words:</strong> ${esc(numberToIndianWords(rec.netSalary))}</div>
          </div>
          <div class="bp-net-val">${esc(formatMoney(rec.netSalary))}</div>
        </div>

        <div class="bp-sheet-foot">
          <div>
            ${pr.paymentDate ? `<div>Payment Date: <strong>${esc(pr.paymentDate)}</strong></div>` : ""}
            ${cu.showOptionalFields && pr.referenceNo ? `<div>Payroll Ref: ${esc(pr.referenceNo)}</div>` : ""}
            <div style="margin-top:4px">${esc(cu.footerMessage || "This is a computer-generated payslip.")}</div>
          </div>
          <div class="bp-sig-area">
            ${co.stampDataUrl ? `<img src="${co.stampDataUrl}" class="bp-stamp-img" alt="Company stamp" />` : ""}
            <div style="border-top:1px solid #94a3b8;padding-top:4px;min-width:140px;font-weight:700;color:#0b132b">${esc(co.signatory || "Authorized Signatory")}</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------- PDF Rendering Engine (pdf-lib A4 Portrait — Modern & Classic) ---------- */
  function pdfTextClean(str) {
    return String(str ?? "")
      .replace(/₹/g, "Rs. ")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hexToPdfRgb(hex, rgbFn) {
    const clean = String(hex || "#056cb8").replace("#", "");
    if (clean.length !== 6) return rgbFn(0.02, 0.424, 0.722);
    return rgbFn(
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255
    );
  }

  async function renderSinglePayslipPdfBytes(rec, logoBytes, stampBytes) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 38;
    const W = PAGE_W - M * 2;
    const page = doc.addPage([PAGE_W, PAGE_H]);

    const co = state.company;
    const pr = state.payroll;
    const cu = state.customization;
    const isClassic = cu.template === "classic";
    const baseSize = Math.max(8, Math.min(11, Number(cu.fontSize) - 3.5));

    const COL_INK = rgb(0.043, 0.075, 0.169);
    const COL_BRAND = isClassic ? COL_INK : hexToPdfRgb(cu.brandColor, rgb);
    const COL_MUTED = rgb(0.32, 0.36, 0.44);
    const COL_LINE = rgb(0.82, 0.85, 0.9);
    const COL_TINT = rgb(0.96, 0.97, 0.985);
    const COL_WHITE = rgb(1, 1, 1);

    // Top Accent Bar or Classic Border
    if (isClassic) {
      page.drawRectangle({ x: M - 10, y: M - 10, width: W + 20, height: PAGE_H - (M - 10) * 2, borderColor: COL_INK, borderWidth: 1.2 });
    } else {
      page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: COL_BRAND });
    }

    let y = PAGE_H - M;
    let leftX = M;

    if (logoBytes) {
      try {
        const logoImg = await doc.embedPng(logoBytes);
        const sc = Math.min(96 / logoImg.width, 36 / logoImg.height, 1);
        page.drawImage(logoImg, { x: M, y: y - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
        leftX = M + logoImg.width * sc + 12;
      } catch (_) {}
    }

    page.drawText(pdfTextClean(co.name || "Company Name").slice(0, 44), {
      x: leftX,
      y: y - 14,
      size: 14,
      font: fontBold,
      color: COL_INK,
    });
    if (co.address) {
      page.drawText(pdfTextClean(co.address).slice(0, 62), { x: leftX, y: y - 28, size: 8, font: fontReg, color: COL_MUTED });
    }
    const contactStr = [co.phone, co.email, co.website].filter(Boolean).join(" | ");
    if (contactStr) {
      page.drawText(pdfTextClean(contactStr).slice(0, 62), { x: leftX, y: y - 39, size: 8, font: fontReg, color: COL_MUTED });
    }

    const headingTxt = pdfTextClean(cu.heading || "PAYSLIP").toUpperCase();
    const hw = fontBold.widthOfTextAtSize(headingTxt, 13);
    page.drawText(headingTxt, { x: PAGE_W - M - hw, y: y - 14, size: 13, font: fontBold, color: COL_BRAND });

    const periodTxt = `${MONTHS[pr.month]} ${pr.year}`;
    const pw = fontBold.widthOfTextAtSize(periodTxt, 10);
    page.drawText(periodTxt, { x: PAGE_W - M - pw, y: y - 28, size: 10, font: fontBold, color: COL_INK });

    const pnoTxt = `No: ${pdfTextClean(rec.payslipNo)}`;
    const pnw = fontReg.widthOfTextAtSize(pnoTxt, 8);
    page.drawText(pnoTxt, { x: PAGE_W - M - pnw, y: y - 40, size: 8, font: fontReg, color: COL_MUTED });

    y -= 54;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1.2, color: COL_LINE });
    y -= 16;

    // Employee Details Box
    const empRows = [
      ["Employee Name", rec.empName, "Employee ID", rec.empId || "-"],
      ["Designation", rec.designation || "-", "Department", rec.department || "-"],
      ["Date of Joining", rec.doj || "-", "Work Location", rec.location || "-"],
    ];
    if (cu.showOptionalFields && (rec.bankLast4 || rec.paymentMode || rec.workingDays !== "")) {
      empRows.push([
        "Bank Account",
        rec.bankLast4 || "-",
        "Payment Mode",
        rec.paymentMode || "-",
      ]);
      if (rec.workingDays !== "") {
        empRows.push([
          "Working Days",
          String(rec.workingDays),
          "Days Worked / LWP",
          `${rec.daysWorked !== "" ? rec.daysWorked : rec.workingDays} / ${rec.lwp || 0}`,
        ]);
      }
    }

    const boxH = empRows.length * 18 + 14;
    page.drawRectangle({
      x: M,
      y: y - boxH,
      width: W,
      height: boxH,
      color: isClassic ? COL_WHITE : COL_TINT,
      borderColor: COL_LINE,
      borderWidth: 0.8,
    });

    empRows.forEach((pair, rIdx) => {
      const ry = y - 16 - rIdx * 18;
      page.drawText(pdfTextClean(pair[0]) + ":", { x: M + 10, y: ry, size: 8.5, font: fontReg, color: COL_MUTED });
      page.drawText(pdfTextClean(pair[1]).slice(0, 28), { x: M + 96, y: ry, size: 8.5, font: fontBold, color: COL_INK });

      page.drawText(pdfTextClean(pair[2]) + ":", { x: M + W / 2 + 6, y: ry, size: 8.5, font: fontReg, color: COL_MUTED });
      page.drawText(pdfTextClean(pair[3]).slice(0, 26), { x: M + W / 2 + 96, y: ry, size: 8.5, font: fontBold, color: COL_INK });
    });

    y -= boxH + 18;

    // Earnings & Deductions Side-by-Side Table
    const visEarn = cu.showEmptyRows ? rec.earnings : rec.earnings.filter((x) => x.cents > 0);
    const visDed = cu.showEmptyRows ? rec.deductions : rec.deductions.filter((x) => x.cents > 0);
    const maxLen = Math.max(visEarn.length, visDed.length, 1);
    const halfW = W / 2;

    page.drawRectangle({ x: M, y: y - 22, width: W, height: 22, color: COL_BRAND });
    page.drawText("EARNINGS", { x: M + 10, y: y - 14, size: 8.5, font: fontBold, color: COL_WHITE });
    page.drawText("AMOUNT", { x: M + halfW - 50, y: y - 14, size: 8.5, font: fontBold, color: COL_WHITE });
    page.drawText("DEDUCTIONS", { x: M + halfW + 10, y: y - 14, size: 8.5, font: fontBold, color: COL_WHITE });
    page.drawText("AMOUNT", { x: PAGE_W - M - 48, y: y - 14, size: 8.5, font: fontBold, color: COL_WHITE });
    y -= 22;

    const rowH = 19;
    for (let i = 0; i < maxLen; i++) {
      if (i % 2 === 1 && !isClassic) {
        page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: COL_TINT });
      }
      const eItem = visEarn[i];
      const dItem = visDed[i];

      if (eItem) {
        page.drawText(pdfTextClean(eItem.label).slice(0, 28), { x: M + 10, y: y - 13, size: baseSize, font: fontReg, color: COL_INK });
        const ea = pdfTextClean(formatMoney(eItem.amount, true));
        const eaw = fontReg.widthOfTextAtSize(ea, baseSize);
        page.drawText(ea, { x: M + halfW - 10 - eaw, y: y - 13, size: baseSize, font: fontReg, color: COL_INK });
      }

      if (dItem) {
        page.drawText(pdfTextClean(dItem.label).slice(0, 28), { x: M + halfW + 10, y: y - 13, size: baseSize, font: fontReg, color: COL_INK });
        const da = pdfTextClean(formatMoney(dItem.amount, true));
        const daw = fontReg.widthOfTextAtSize(da, baseSize);
        page.drawText(da, { x: PAGE_W - M - 10 - daw, y: y - 13, size: baseSize, font: fontReg, color: COL_INK });
      }

      page.drawLine({ start: { x: M + halfW, y }, end: { x: M + halfW, y: y - rowH }, thickness: 0.6, color: COL_LINE });
      y -= rowH;
      page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: COL_LINE });
    }

    // Totals Row
    page.drawRectangle({ x: M, y: y - 22, width: W, height: 22, color: COL_TINT, borderColor: COL_LINE, borderWidth: 0.8 });
    page.drawText("Total Earnings", { x: M + 10, y: y - 15, size: 9, font: fontBold, color: COL_INK });
    const totE = pdfTextClean(formatMoney(rec.totalEarnings, true));
    page.drawText(totE, { x: M + halfW - 10 - fontBold.widthOfTextAtSize(totE, 9), y: y - 15, size: 9, font: fontBold, color: COL_INK });

    page.drawText("Total Deductions", { x: M + halfW + 10, y: y - 15, size: 9, font: fontBold, color: COL_INK });
    const totD = pdfTextClean(formatMoney(rec.totalDeductions, true));
    page.drawText(totD, { x: PAGE_W - M - 10 - fontBold.widthOfTextAtSize(totD, 9), y: y - 15, size: 9, font: fontBold, color: COL_INK });

    y -= 42;

    // Net Salary Payable Box
    page.drawRectangle({ x: M, y: y - 50, width: W, height: 50, color: COL_TINT, borderColor: COL_BRAND, borderWidth: 1.4 });
    page.drawText("NET SALARY PAYABLE", { x: M + 12, y: y - 17, size: 8.5, font: fontBold, color: COL_MUTED });
    page.drawText(pdfTextClean(`In Words: ${numberToIndianWords(rec.netSalary)}`).slice(0, 74), {
      x: M + 12,
      y: y - 34,
      size: 8.5,
      font: fontBold,
      color: COL_INK,
    });

    const netStr = pdfTextClean(formatMoney(rec.netSalary, true));
    const netW = fontBold.widthOfTextAtSize(netStr, 15);
    page.drawText(netStr, { x: PAGE_W - M - 14 - netW, y: y - 28, size: 15, font: fontBold, color: COL_BRAND });

    y -= 76;

    // Signatory, Optional Stamp & Footer
    if (stampBytes) {
      try {
        const stImg = await doc.embedPng(stampBytes);
        const sc = Math.min(72 / stImg.width, 38 / stImg.height, 1);
        page.drawImage(stImg, { x: PAGE_W - M - stImg.width * sc - 10, y: y - 6, width: stImg.width * sc, height: stImg.height * sc });
      } catch (_) {}
    }

    const sigStr = pdfTextClean(co.signatory || "Authorized Signatory");
    page.drawLine({ start: { x: PAGE_W - M - 165, y: y - 12 }, end: { x: PAGE_W - M, y: y - 12 }, thickness: 0.8, color: COL_INK });
    page.drawText(sigStr, { x: PAGE_W - M - fontBold.widthOfTextAtSize(sigStr, 8.5), y: y - 25, size: 8.5, font: fontBold, color: COL_INK });

    if (pr.paymentDate) {
      page.drawText(`Payment Date: ${pdfTextClean(pr.paymentDate)}`, { x: M, y: y - 12, size: 8.5, font: fontReg, color: COL_MUTED });
    }
    if (cu.showOptionalFields && pr.referenceNo) {
      page.drawText(`Payroll Ref: ${pdfTextClean(pr.referenceNo)}`, { x: M, y: y - 24, size: 8.5, font: fontReg, color: COL_MUTED });
    }

    page.drawText(pdfTextClean(cu.footerMessage || "This is a computer-generated payslip."), {
      x: M,
      y: M + 8,
      size: 8,
      font: fontReg,
      color: COL_MUTED,
    });

    return await doc.save();
  }

  /* ---------- Chunked Bulk Generation (Never Freezes UI) ---------- */
  async function generateAllPayslips(retryOnlyFailed = false) {
    if (state.isGenerating) return;
    if (!window.PDFLib) {
      toast("PDF generation library (pdf-lib) failed to load.", "error");
      return;
    }

    const eligible = getEligibleRecords();
    if (!eligible.length) {
      toast("No valid employee records available to generate.", "error");
      return;
    }

    state.isGenerating = true;
    const targetRecords = retryOnlyFailed
      ? eligible.filter((r) => state.generatedPdfs.some((g) => g.rowIndex === r.rowIndex && g.status === "failed"))
      : eligible;

    if (!retryOnlyFailed) {
      revokeAllBlobUrls();
    }

    $("bpGenerateBtn").disabled = true;
    $("bpProgressBox").hidden = false;
    $("bpDownloadsWrap").hidden = true;

    const logoBytes = state.company.logoDataUrl ? await (await fetchDataUrlBytes(state.company.logoDataUrl)) : null;
    const stampBytes = state.company.stampDataUrl ? await (await fetchDataUrlBytes(state.company.stampDataUrl)) : null;

    const monthName = MONTHS[state.payroll.month];
    const yearStr = state.payroll.year;
    let completed = 0;

    for (let i = 0; i < targetRecords.length; i++) {
      const rec = targetRecords[i];
      const pct = Math.round(((i) / targetRecords.length) * 100);
      $("bpProgressText").textContent = `Generating payslip ${i + 1} of ${targetRecords.length}: ${rec.empName}`;
      $("bpProgressCount").textContent = `${completed} / ${targetRecords.length} completed`;
      $("bpProgressFill").style.width = `${pct}%`;

      const safeId = sanitizeFilenamePart(rec.empId || rec.empName);
      const filename = `Payslip_${safeId}_${monthName}_${yearStr}.pdf`;

      try {
        const bytes = await renderSinglePayslipPdfBytes(rec, logoBytes, stampBytes);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const entry = {
          rowIndex: rec.rowIndex,
          empId: rec.empId,
          empName: rec.empName,
          payslipNo: rec.payslipNo,
          filename,
          bytes,
          url,
          netSalary: rec.netSalary,
          status: "done",
          error: "",
        };

        const existingIdx = state.generatedPdfs.findIndex((g) => g.rowIndex === rec.rowIndex);
        if (existingIdx >= 0) {
          if (state.generatedPdfs[existingIdx].url) URL.revokeObjectURL(state.generatedPdfs[existingIdx].url);
          state.generatedPdfs[existingIdx] = entry;
        } else {
          state.generatedPdfs.push(entry);
        }
        completed++;
      } catch (err) {
        const failEntry = {
          rowIndex: rec.rowIndex,
          empId: rec.empId,
          empName: rec.empName,
          payslipNo: rec.payslipNo,
          filename,
          bytes: null,
          url: null,
          netSalary: rec.netSalary,
          status: "failed",
          error: err?.message || "PDF rendering failed",
        };
        const existingIdx = state.generatedPdfs.findIndex((g) => g.rowIndex === rec.rowIndex);
        if (existingIdx >= 0) state.generatedPdfs[existingIdx] = failEntry;
        else state.generatedPdfs.push(failEntry);
      }

      // Yield to browser main thread every 3 payslips so UI stays silky smooth even on 100+ employees
      if (i % 3 === 2) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    $("bpProgressFill").style.width = "100%";
    $("bpProgressCount").textContent = `${completed} / ${targetRecords.length} completed`;
    const failedCount = state.generatedPdfs.filter((g) => g.status === "failed").length;
    $("bpProgressText").textContent = failedCount
      ? `Finished with ${failedCount} failed payslip(s). You can retry failed items below.`
      : `Successfully generated all ${state.generatedPdfs.length} payslips!`;

    state.isGenerating = false;
    $("bpGenerateBtn").disabled = false;
    renderGenerationPanel();
    updateStepIndicators();
    toast(failedCount ? `Generated with ${failedCount} failure(s).` : `Generated ${completed} payslip PDFs.`);
  }

  function fetchDataUrlBytes(dataUrl) {
    try {
      const base64 = dataUrl.split(",")[1];
      const bin = atob(base64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (_) {
      return null;
    }
  }

  /* ---------- Download ZIP, Combined PDF & Summary CSV ---------- */
  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAllAsZip() {
    const doneItems = state.generatedPdfs.filter((g) => g.status === "done" && g.bytes);
    if (!doneItems.length) return;
    if (!window.JSZip) {
      toast("ZIP packaging library (JSZip) failed to load.", "error");
      return;
    }

    const btn = $("bpDlZipBtn");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Building ZIP...";

    try {
      const folderName = `OpenSign_Payslips_${MONTHS[state.payroll.month]}_${state.payroll.year}`;
      const zip = new window.JSZip();
      const folder = zip.folder(folderName);
      const used = new Set();

      for (const item of doneItems) {
        let name = item.filename;
        if (used.has(name.toLowerCase())) {
          name = name.replace(/\.pdf$/i, `_${item.rowIndex + 1}.pdf`);
        }
        used.add(name.toLowerCase());
        folder.file(name, item.bytes);
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      if (state.zipBlobUrl) URL.revokeObjectURL(state.zipBlobUrl);
      state.zipBlobUrl = URL.createObjectURL(blob);
      triggerDownload(state.zipBlobUrl, `${folderName}.zip`);
      toast(`Downloaded ${folderName}.zip`);
    } catch (err) {
      toast(err?.message || "ZIP generation failed.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function downloadCombinedPdf() {
    const doneItems = state.generatedPdfs.filter((g) => g.status === "done" && g.bytes);
    if (!doneItems.length || !window.PDFLib) return;

    const btn = $("bpDlCombinedBtn");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Combining PDFs...";

    try {
      const { PDFDocument } = window.PDFLib;
      const merged = await PDFDocument.create();
      for (const item of doneItems) {
        const single = await PDFDocument.load(item.bytes);
        const copied = await merged.copyPages(single, single.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      if (state.combinedPdfUrl) URL.revokeObjectURL(state.combinedPdfUrl);
      state.combinedPdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const fname = `OpenSign_Combined_Payslips_${MONTHS[state.payroll.month]}_${state.payroll.year}.pdf`;
      triggerDownload(state.combinedPdfUrl, fname);
      toast(`Downloaded ${fname}`);
    } catch (err) {
      toast(err?.message || "Combined PDF generation failed.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function downloadSalarySummaryCsv() {
    const valid = getEligibleRecords();
    if (!valid.length) return;
    const csvEsc = (v) => (/[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
    const rows = [
      ["Payslip Number", "Employee ID", "Employee Name", "Department", "Designation", "Gross Earnings", "Total Deductions", "Net Salary"],
      ...valid.map((r) => [
        r.payslipNo,
        r.empId || "",
        r.empName,
        r.department || "",
        r.designation || "",
        r.totalEarnings.toFixed(2),
        r.totalDeductions.toFixed(2),
        r.netSalary.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `OpenSign_Salary_Summary_${MONTHS[state.payroll.month]}_${state.payroll.year}.csv`);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Downloaded salary summary CSV.");
  }

  function downloadErrorReportCsv() {
    const bad = state.parsedRecords.filter((r) => !r.valid && !r.excluded);
    if (!bad.length) return;
    const csvEsc = (v) => (/[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
    const rows = [
      ["Row Number", "Employee ID", "Employee Name", "Validation Errors"],
      ...bad.map((r) => [r.rowIndex + 1, r.empId || "", r.empName || "", r.errors.join("; ")]),
    ];
    const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "OpenSign_Payslip_Validation_Errors.csv");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Downloaded validation error report.");
  }

  /* ---------- Render Step 5 Generation & Download Panel ---------- */
  function renderGenerationPanel() {
    const eligible = getEligibleRecords();
    const invalidCnt = state.parsedRecords.filter((r) => !r.valid && !r.excluded).length;

    $("bpGenSummaryText").textContent = `Uploaded: ${state.parsedRecords.length} · Valid & ready: ${eligible.length} · Invalid: ${invalidCnt}`;
    $("bpGenerateBtn").disabled = state.isGenerating || eligible.length === 0;
    $("bpGenerateBtn").textContent = `Generate All Payslips (${eligible.length})`;

    const doneItems = state.generatedPdfs.filter((g) => g.status === "done");
    const failedItems = state.generatedPdfs.filter((g) => g.status === "failed");

    $("bpDownloadsWrap").hidden = state.generatedPdfs.length === 0;
    $("bpRetryFailedBtn").hidden = failedItems.length === 0;
    $("bpDlZipBtn").disabled = doneItems.length === 0;
    $("bpDlCombinedBtn").disabled = doneItems.length === 0;

    const tbody = $("bpGenTableBody");
    tbody.innerHTML = "";
    state.generatedPdfs.forEach((g) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${esc(g.payslipNo)}</strong></td>
        <td>${esc(g.empId || "—")}</td>
        <td>${esc(g.empName)}</td>
        <td><strong>${esc(formatMoney(g.netSalary))}</strong></td>
        <td>${g.status === "done" ? `<span class="bp-pill is-valid">Generated</span>` : `<span class="bp-pill is-invalid">Failed: ${esc(g.error)}</span>`}</td>
        <td>
          ${g.status === "done" ? `<a class="bp-mini-btn" style="min-height:28px;padding:0 10px;font-size:12px;text-decoration:none" href="${g.url}" download="${esc(g.filename)}">Download PDF</a>` : "—"}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function updateStepIndicators() {
    $("bpStepPill1")?.classList.toggle("is-done", Boolean(state.company.name.trim()));
    $("bpStepPill2")?.classList.toggle("is-done", Boolean(state.payroll.year));
    $("bpStepPill3")?.classList.toggle("is-done", state.rawRows.length > 0);
    $("bpStepPill4")?.classList.toggle("is-done", getEligibleRecords().length > 0);
    $("bpStepPill5")?.classList.toggle("is-done", state.generatedPdfs.some((g) => g.status === "done"));
  }

  /* ---------- Image Upload Helper (Logo & Stamp) ---------- */
  function handleImageUpload(file, maxW, maxH, onReady) {
    if (!file) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name || "")) {
      toast("Upload a PNG, JPG, or WebP image.", "error");
      return;
    }
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      c.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/png");
      c.width = 0;
      c.height = 0;
      URL.revokeObjectURL(objUrl);
      onReady(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      toast("Unable to read image file.", "error");
    };
    img.src = objUrl;
  }

  /* ---------- Sync Form Controls & Initialize ---------- */
  function syncAllInputs() {
    $("bpCoName").value = state.company.name;
    $("bpCoAddress").value = state.company.address;
    $("bpCoEmail").value = state.company.email;
    $("bpCoPhone").value = state.company.phone;
    $("bpCoGstin").value = state.company.gstin;
    $("bpCoPan").value = state.company.pan;
    $("bpCoWebsite").value = state.company.website;
    $("bpCoSignatory").value = state.company.signatory;

    $("bpPayMonth").value = String(state.payroll.month);
    $("bpPayYear").value = String(state.payroll.year);
    $("bpIssueDate").value = state.payroll.issueDate;
    $("bpPaymentDate").value = state.payroll.paymentDate;
    $("bpCurrency").value = state.payroll.currency;
    $("bpFinYear").value = state.payroll.financialYear;
    $("bpPayRef").value = state.payroll.referenceNo;
    $("bpNumPrefix").value = state.payroll.prefix;
    $("bpNumFormat").value = state.payroll.numFormat;

    $("bpTplSelect").value = state.customization.template;
    $("bpBrandPicker").value = state.customization.brandColor;
    $("bpBrandHex").value = state.customization.brandColor;
    $("bpHeadingInput").value = state.customization.heading;
    $("bpFontSizeSelect").value = state.customization.fontSize;
    $("bpTableLayoutSelect").value = state.customization.tableLayout;
    $("bpNumLocaleSelect").value = state.customization.numberFormat;
    $("bpFooterMsgInput").value = state.customization.footerMessage;
    $("bpShowOptCheck").checked = state.customization.showOptionalFields;
    $("bpShowEmptyCheck").checked = state.customization.showEmptyRows;
    $("bpOverrideNegCheck").checked = state.customization.allowNegativeNetOverride;

    $("bpLogoThumb").hidden = !state.company.logoDataUrl;
    $("bpRemoveLogoBtn").hidden = !state.company.logoDataUrl;
    $("bpStampThumb").hidden = !state.company.stampDataUrl;
    $("bpRemoveStampBtn").hidden = !state.company.stampDataUrl;
  }

  function init() {
    const mSel = $("bpPayMonth");
    MONTHS.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = m;
      mSel.appendChild(o);
    });

    // Bind Step 1 Company Inputs
    const bindCo = (id, key) => {
      $(id)?.addEventListener("input", (e) => {
        state.company[key] = e.target.value;
        renderPayslipPreview();
        updateStepIndicators();
      });
    };
    bindCo("bpCoName", "name");
    bindCo("bpCoAddress", "address");
    bindCo("bpCoEmail", "email");
    bindCo("bpCoPhone", "phone");
    bindCo("bpCoGstin", "gstin");
    bindCo("bpCoPan", "pan");
    bindCo("bpCoWebsite", "website");
    bindCo("bpCoSignatory", "signatory");

    $("bpLogoInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      handleImageUpload(f, 360, 150, (url) => {
        state.company.logoDataUrl = url;
        $("bpLogoThumb").src = url;
        $("bpLogoThumb").hidden = false;
        $("bpRemoveLogoBtn").hidden = false;
        renderPayslipPreview();
        toast("Company logo uploaded.");
      });
    });
    $("bpRemoveLogoBtn")?.addEventListener("click", () => {
      state.company.logoDataUrl = null;
      $("bpLogoThumb").hidden = true;
      $("bpRemoveLogoBtn").hidden = true;
      renderPayslipPreview();
    });

    $("bpStampInput")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      handleImageUpload(f, 240, 120, (url) => {
        state.company.stampDataUrl = url;
        $("bpStampThumb").src = url;
        $("bpStampThumb").hidden = false;
        $("bpRemoveStampBtn").hidden = false;
        renderPayslipPreview();
        toast("Company stamp uploaded.");
      });
    });
    $("bpRemoveStampBtn")?.addEventListener("click", () => {
      state.company.stampDataUrl = null;
      $("bpStampThumb").hidden = true;
      $("bpRemoveStampBtn").hidden = true;
      renderPayslipPreview();
    });

    // Bind Step 2 Payroll & Customization
    const refreshAfterPayrollChange = () => {
      if (state.rawRows.length) {
        recomputeRecords();
        renderValidationTable();
        renderPayslipPreview();
        renderGenerationPanel();
      }
      updateStepIndicators();
    };

    mSel.addEventListener("change", (e) => {
      state.payroll.month = parseInt(e.target.value, 10) || 0;
      refreshAfterPayrollChange();
    });
    $("bpPayYear").addEventListener("change", (e) => {
      state.payroll.year = parseInt(e.target.value, 10) || now.getFullYear();
      refreshAfterPayrollChange();
    });
    $("bpIssueDate").addEventListener("change", (e) => {
      state.payroll.issueDate = e.target.value;
      renderPayslipPreview();
    });
    $("bpPaymentDate").addEventListener("change", (e) => {
      state.payroll.paymentDate = e.target.value;
      renderPayslipPreview();
    });
    $("bpCurrency").addEventListener("change", (e) => {
      state.payroll.currency = e.target.value;
      refreshAfterPayrollChange();
    });
    $("bpFinYear").addEventListener("input", (e) => {
      state.payroll.financialYear = e.target.value;
      renderPayslipPreview();
    });
    $("bpPayRef").addEventListener("input", (e) => {
      state.payroll.referenceNo = e.target.value;
      renderPayslipPreview();
    });
    $("bpNumPrefix").addEventListener("input", (e) => {
      state.payroll.prefix = e.target.value;
      refreshAfterPayrollChange();
    });
    $("bpNumFormat").addEventListener("change", (e) => {
      state.payroll.numFormat = e.target.value;
      refreshAfterPayrollChange();
    });

    $("bpTplSelect").addEventListener("change", (e) => {
      state.customization.template = e.target.value;
      renderPayslipPreview();
    });
    $("bpBrandPicker").addEventListener("input", (e) => {
      state.customization.brandColor = e.target.value;
      $("bpBrandHex").value = e.target.value;
      renderPayslipPreview();
    });
    $("bpBrandHex").addEventListener("input", (e) => {
      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value.trim())) {
        state.customization.brandColor = e.target.value.trim();
        $("bpBrandPicker").value = state.customization.brandColor;
        renderPayslipPreview();
      }
    });
    $("bpHeadingInput").addEventListener("input", (e) => {
      state.customization.heading = e.target.value;
      renderPayslipPreview();
    });
    $("bpFontSizeSelect").addEventListener("change", (e) => {
      state.customization.fontSize = e.target.value;
      renderPayslipPreview();
    });
    $("bpTableLayoutSelect").addEventListener("change", (e) => {
      state.customization.tableLayout = e.target.value;
      renderPayslipPreview();
    });
    $("bpNumLocaleSelect").addEventListener("change", (e) => {
      state.customization.numberFormat = e.target.value;
      refreshAfterPayrollChange();
    });
    $("bpFooterMsgInput").addEventListener("input", (e) => {
      state.customization.footerMessage = e.target.value;
      renderPayslipPreview();
    });
    $("bpShowOptCheck").addEventListener("change", (e) => {
      state.customization.showOptionalFields = e.target.checked;
      renderPayslipPreview();
    });
    $("bpShowEmptyCheck").addEventListener("change", (e) => {
      state.customization.showEmptyRows = e.target.checked;
      renderPayslipPreview();
    });
    $("bpOverrideNegCheck").addEventListener("change", (e) => {
      state.customization.allowNegativeNetOverride = e.target.checked;
      refreshAfterPayrollChange();
    });

    // Step 3 Upload, Drag & Drop, Template Download, Sample Load
    const fileInput = $("bpFileInput");
    const dropzone = $("bpDropzone");
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) handleSpreadsheetFile(f);
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("is-over");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-over");
      const f = e.dataTransfer?.files?.[0];
      if (f) handleSpreadsheetFile(f);
    });

    $("bpDownloadTplBtn").addEventListener("click", downloadExcelTemplate);
    $("bpDownloadTplSecBtn")?.addEventListener("click", downloadExcelTemplate);
    $("bpLoadSampleBtn").addEventListener("click", loadSampleDataset);
    $("bpReplaceFileBtn").addEventListener("click", () => fileInput.click());

    // Step 4 Preview & Row Edit Controls
    $("bpErrReportBtn").addEventListener("click", downloadErrorReportCsv);
    $("bpPrevEmpBtn").addEventListener("click", () => {
      state.previewIndex--;
      renderPayslipPreview();
    });
    $("bpNextEmpBtn").addEventListener("click", () => {
      state.previewIndex++;
      renderPayslipPreview();
    });
    $("bpPreviewSelect").addEventListener("change", (e) => {
      state.previewIndex = parseInt(e.target.value, 10) || 0;
      renderPayslipPreview();
    });
    $("bpTogglePrintPrevBtn").addEventListener("click", () => {
      state.previewPrintMode = !state.previewPrintMode;
      $("bpTogglePrintPrevBtn").textContent = state.previewPrintMode ? "Desktop Preview" : "Print Preview";
      renderPayslipPreview();
    });

    $("bpSaveEditRowBtn").addEventListener("click", () => {
      if (editingRowIdx === null) return;
      const raw = state.rawRows[editingRowIdx];
      $("bpEditRowFields").querySelectorAll("[data-edit-col]").forEach((inp) => {
        raw[inp.dataset.editCol] = inp.value;
      });
      $("bpEditRowDialog").close();
      recomputeRecords();
      renderValidationTable();
      renderPayslipPreview();
      renderGenerationPanel();
      toast(`Updated Row #${editingRowIdx + 1}.`);
    });
    $("bpEditRowCancel").addEventListener("click", () => $("bpEditRowDialog").close());
    $("bpEditRowCloseTop").addEventListener("click", () => $("bpEditRowDialog").close());

    // Step 5 Generate & Download Actions
    $("bpGenerateBtn").addEventListener("click", () => generateAllPayslips(false));
    $("bpRetryFailedBtn").addEventListener("click", () => generateAllPayslips(true));
    $("bpDlZipBtn").addEventListener("click", downloadAllAsZip);
    $("bpDlCombinedBtn").addEventListener("click", downloadCombinedPdf);
    $("bpDlSummaryCsvBtn").addEventListener("click", downloadSalarySummaryCsv);

    // Reset with Confirmation
    $("bpResetAllBtn").addEventListener("click", async () => {
      const ok = await confirmAction(
        "Reset Bulk Payslip Generator",
        "Clear all uploaded employee salary data, generated PDFs, and company details from browser memory?"
      );
      if (!ok) return;
      revokeAllBlobUrls();
      state = createDefaultState();
      syncAllInputs();
      $("bpLoadedFileBar").hidden = true;
      $("step4").hidden = true;
      $("step5").hidden = true;
      $("bpProgressBox").hidden = true;
      $("bpDownloadsWrap").hidden = true;
      updateStepIndicators();
      toast("Bulk Payslip Generator cleared from memory.");
    });

    syncAllInputs();
    updateStepIndicators();
  }

  init();
})();
