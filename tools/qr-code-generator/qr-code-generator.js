(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Enable full UTF-8 byte encoding in qrcode-generator for international text, vCards & emojis
  if (window.qrcode && window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs["UTF-8"]) {
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
  }

  const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB max logo size
  const ALLOWED_LOGO_RE = /\.(png|jpe?g|webp)$/i;
  const PNG_FILENAME = "opensign-qr-code.png";
  const SVG_FILENAME = "opensign-qr-code.svg";
  const JPG_FILENAME = "opensign-qr-code.jpg";

  const STYLE_PRESETS = [
    { id: "classic", name: "Classic Black & White", fg: "#000000", bg: "#ffffff" },
    { id: "blue", name: "Professional Blue", fg: "#1652f0", bg: "#ffffff" },
    { id: "green", name: "Business Green", fg: "#0f766e", bg: "#ffffff" },
    { id: "dark", name: "Minimal Dark", fg: "#130032", bg: "#f8f3f0" },
    { id: "brand", name: "Custom Brand Colors", fg: "#4c00ff", bg: "#ffffff" },
  ];

  // DOM References
  const typeBtns = Array.from(document.querySelectorAll(".qr-type-btn"));
  const formPanels = Array.from(document.querySelectorAll("[data-qr-panel]"));

  // Type 1: Website URL
  const urlInput = $("qrUrlInput");
  const urlCampaignInput = $("qrUrlCampaign");
  const urlParamsInput = $("qrUrlParams");
  const urlHintEl = $("qrUrlHint");
  const copyOrigUrlBtn = $("qrCopyOrigUrlBtn");

  // Type 2: Plain Text
  const textInput = $("qrTextInput");
  const textCountEl = $("qrTextCount");

  // Type 3: Wi-Fi
  const wifiSsidInput = $("qrWifiSsid");
  const wifiPassInput = $("qrWifiPass");
  const wifiPassToggle = $("qrWifiPassToggle");
  const wifiSecSelect = $("qrWifiSec");
  const wifiHiddenCheck = $("qrWifiHidden");

  // Type 4: Email
  const emailAddrInput = $("qrEmailAddr");
  const emailSubjInput = $("qrEmailSubj");
  const emailBodyInput = $("qrEmailBody");
  const emailHintEl = $("qrEmailHint");

  // Type 5: Phone
  const phoneCodeInput = $("qrPhoneCode");
  const phoneNumInput = $("qrPhoneNum");
  const phoneHintEl = $("qrPhoneHint");

  // Type 6: SMS
  const smsCodeInput = $("qrSmsCode");
  const smsNumInput = $("qrSmsNum");
  const smsBodyInput = $("qrSmsBody");
  const smsHintEl = $("qrSmsHint");

  // Type 7: Contact / vCard 3.0
  const vcFirstInput = $("qrVcFirst");
  const vcLastInput = $("qrVcLast");
  const vcOrgInput = $("qrVcOrg");
  const vcTitleInput = $("qrVcTitle");
  const vcPhoneInput = $("qrVcPhone");
  const vcEmailInput = $("qrVcEmail");
  const vcUrlInput = $("qrVcUrl");
  const vcStreetInput = $("qrVcStreet");
  const vcCityInput = $("qrVcCity");
  const vcStateInput = $("qrVcState");
  const vcZipInput = $("qrVcZip");
  const vcCountryInput = $("qrVcCountry");

  // Type 8: WhatsApp
  const waNumInput = $("qrWaNum");
  const waMsgInput = $("qrWaMsg");
  const waHintEl = $("qrWaHint");

  // Type 9: Location
  const locLatInput = $("qrLocLat");
  const locLngInput = $("qrLocLng");
  const locNameInput = $("qrLocName");
  const locHintEl = $("qrLocHint");

  // Customization
  const presetBtns = Array.from(document.querySelectorAll(".qr-preset-btn"));
  const fgPicker = $("qrFgPicker");
  const fgHexInput = $("qrFgHex");
  const bgPicker = $("qrBgPicker");
  const bgHexInput = $("qrBgHex");
  const sizeSelect = $("qrSizeSelect");
  const customSizeWrap = $("qrCustomSizeWrap");
  const customSizeInput = $("qrCustomSizeInput");
  const eccSelect = $("qrEccSelect");
  const marginSelect = $("qrMarginSelect");

  // Logo Integration
  const logoInput = $("qrLogoInput");
  const logoThumb = $("qrLogoThumb");
  const logoPh = $("qrLogoPh");
  const logoFileNameEl = $("qrLogoFileName");
  const removeLogoBtn = $("qrRemoveLogoBtn");
  const logoOptionsWrap = $("qrLogoOptionsWrap");
  const logoScaleRange = $("qrLogoScale");
  const logoScaleVal = $("qrLogoScaleVal");
  const logoBgSelect = $("qrLogoBgSelect");

  // Export Settings & Preview
  const transparentPngCheck = $("qrTransparentPng");
  const jpgQualitySelect = $("qrJpgQuality");
  const previewCanvas = $("qrPreviewCanvas");
  const badgeTypeEl = $("qrBadgeType");
  const badgeDimsEl = $("qrBadgeDims");
  const badgeEccEl = $("qrBadgeEcc");
  const payloadPreviewEl = $("qrPayloadPreview");
  const copyPayloadBtn = $("qrCopyPayloadBtn");

  // Download & Reset Buttons
  const dlPngBtn = $("qrDlPngBtn");
  const dlSvgBtn = $("qrDlSvgBtn");
  const dlJpgBtn = $("qrDlJpgBtn");
  const resetPreviewBtn = $("qrResetPreviewBtn");
  const resetTopBtn = $("qrResetTopBtn");

  // Validation & Scan-Back
  const valTypeEl = $("qrValType");
  const valCharsEl = $("qrValChars");
  const valDimsEl = $("qrValDims");
  const valEccEl = $("qrValEcc");
  const valLogoEl = $("qrValLogo");
  const warningsListEl = $("qrWarningsList");
  const verifyScanBtn = $("qrVerifyScanBtn");
  const scanResultEl = $("qrScanResult");

  if (!previewCanvas || !typeBtns.length) return;

  // Strictly volatile in-memory state (never persisted to web storage or uploaded)
  let activeType = "url";
  let fgColor = "#000000";
  let bgColor = "#ffffff";
  let eccLevel = "M";
  let marginModules = 4;
  let logoDataUrl = null;
  let logoImageObj = null;
  let logoScalePct = 20;
  let logoBgMode = "white"; // 'white' | 'transparent'
  let lastPayload = "";
  let lastModuleCount = 0;

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

  /* ---------- Escaping & Validation Helpers ---------- */
  function escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function escapeWifiField(str) {
    // Standard ZXing / Wi-Fi QR escaping for \, ;, ,, ", :
    return String(str || "").replace(/([\\;,"':])/g, "\\$1");
  }

  function escapeVcardValue(str) {
    return String(str || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function normalizeHex(raw) {
    const s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    }
    return null;
  }

  function hexToRgb(hex) {
    const clean = (normalizeHex(hex) || "#000000").slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function relativeLuminance({ r, g, b }) {
    const toLin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }

  function contrastRatio(fgHex, bgHex) {
    const l1 = relativeLuminance(hexToRgb(fgHex));
    const l2 = relativeLuminance(hexToRgb(bgHex));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return {
      ratio: (lighter + 0.05) / (darker + 0.05),
      fgLum: l1,
      bgLum: l2,
    };
  }

  function validateHttpUrl(raw) {
    const val = String(raw || "").trim();
    if (!val) return { valid: false, empty: true, url: null };
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false, empty: false, url: null, reason: "Only http:// or https:// URLs are supported." };
      }
      if (!parsed.hostname || !parsed.hostname.includes(".")) {
        return { valid: false, empty: false, url: null, reason: "Enter a complete domain (e.g. https://www.example.com)." };
      }
      return { valid: true, empty: false, url: parsed };
    } catch (_) {
      return { valid: false, empty: false, url: null, reason: "Enter a valid URL starting with https:// or http://." };
    }
  }

  function getOutputSizePx() {
    if (sizeSelect?.value === "custom") {
      const val = Math.floor(Number(customSizeInput?.value) || 1024);
      return Math.max(128, Math.min(4096, val));
    }
    return parseInt(sizeSelect?.value || "1024", 10) || 1024;
  }

  /* ---------- Build Payload for Each of the 9 QR Types ---------- */
  function buildQrPayload() {
    const warnings = [];
    let valid = true;
    let payload = "";
    let typeLabel = "Website URL";

    if (activeType === "url") {
      typeLabel = "Website URL";
      const rawUrl = urlInput.value.trim();
      const check = validateHttpUrl(rawUrl);
      urlInput.classList.toggle("is-invalid", !check.empty && !check.valid);

      if (!check.empty && !check.valid) {
        urlHintEl.className = "qr-hint is-error";
        urlHintEl.textContent = check.reason;
        valid = false;
      } else {
        urlHintEl.className = "qr-hint";
        urlHintEl.textContent = "Generates a static QR code pointing directly to your URL.";
      }

      const baseUrlObj = check.valid ? new URL(check.url.href) : new URL("https://www.example.com");
      const campaign = urlCampaignInput.value.trim();
      const extraParams = urlParamsInput.value.trim().replace(/^[?&]+/, "");

      if (campaign && !baseUrlObj.searchParams.has("utm_campaign")) {
        baseUrlObj.searchParams.set("utm_campaign", campaign);
      }
      if (extraParams) {
        const sp = new URLSearchParams(extraParams);
        for (const [k, v] of sp.entries()) {
          if (k) baseUrlObj.searchParams.set(k, v);
        }
      }
      payload = baseUrlObj.toString();
      if (check.empty) {
        // Show live sample URL until user types their own
        valid = true;
      }
    } else if (activeType === "text") {
      typeLabel = "Plain Text";
      const txt = textInput.value;
      if (textCountEl) textCountEl.textContent = `${txt.length} chars`;
      payload = txt.trim() ? txt : "Hello from Open Sign QR Code Generator";
    } else if (activeType === "wifi") {
      typeLabel = "Wi-Fi Network";
      const ssid = wifiSsidInput.value.trim();
      const pass = wifiPassInput.value;
      const sec = wifiSecSelect.value || "WPA";
      const hidden = wifiHiddenCheck.checked ? "true" : "false";

      if (!ssid) {
        valid = false;
        warnings.push("Enter a Wi-Fi Network Name (SSID) to generate a valid Wi-Fi QR code.");
      }
      const safeSsid = escapeWifiField(ssid || "MyWiFiNetwork");
      const safePass = escapeWifiField(pass);
      if (sec === "nopass" || !pass) {
        payload = `WIFI:T:${sec === "nopass" ? "nopass" : sec};S:${safeSsid};H:${hidden};;`;
      } else {
        payload = `WIFI:T:${sec};S:${safeSsid};P:${safePass};H:${hidden};;`;
      }
    } else if (activeType === "email") {
      typeLabel = "Email (mailto)";
      const addr = emailAddrInput.value.trim();
      const subj = emailSubjInput.value.trim();
      const body = emailBodyInput.value.trim();
      const emailOk = !addr || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);

      emailAddrInput.classList.toggle("is-invalid", !emailOk);
      if (!emailOk) {
        emailHintEl.className = "qr-hint is-error";
        emailHintEl.textContent = "Please enter a valid email address (e.g. hello@example.com).";
        valid = false;
      } else {
        emailHintEl.className = "qr-hint";
        emailHintEl.textContent = "Opens the user's default email app pre-filled with recipient, subject, and message.";
      }

      const targetAddr = addr || "hello@example.com";
      const queryParts = [];
      if (subj) queryParts.push(`subject=${encodeURIComponent(subj)}`);
      if (body) queryParts.push(`body=${encodeURIComponent(body)}`);
      payload = `mailto:${targetAddr}${queryParts.length ? `?${queryParts.join("&")}` : ""}`;
    } else if (activeType === "phone") {
      typeLabel = "Phone Call (tel)";
      const code = phoneCodeInput.value.trim().replace(/[^\d+]/g, "");
      const num = phoneNumInput.value.trim().replace(/[\s()-]+/g, "");
      const combined = `${code}${num}`;
      const phoneOk = !num || /^\+?\d{5,15}$/.test(combined);

      phoneNumInput.classList.toggle("is-invalid", !phoneOk);
      if (!phoneOk) {
        phoneHintEl.className = "qr-hint is-error";
        phoneHintEl.textContent = "Enter 5 to 15 digits (include country code like +91 or +1).";
        valid = false;
      } else {
        phoneHintEl.className = "qr-hint";
        phoneHintEl.textContent = "Prompts mobile phones to dial the encoded number.";
      }

      payload = `tel:${num ? combined : "+911234567890"}`;
    } else if (activeType === "sms") {
      typeLabel = "SMS Message";
      const code = smsCodeInput.value.trim().replace(/[^\d+]/g, "");
      const num = smsNumInput.value.trim().replace(/[\s()-]+/g, "");
      const msg = smsBodyInput.value.trim();
      const combined = `${code}${num}`;
      const smsOk = !num || /^\+?\d{5,15}$/.test(combined);

      smsNumInput.classList.toggle("is-invalid", !smsOk);
      if (!smsOk) {
        smsHintEl.className = "qr-hint is-error";
        smsHintEl.textContent = "Enter a valid phone number with 5 to 15 digits.";
        valid = false;
      } else {
        smsHintEl.className = "qr-hint";
        smsHintEl.textContent = "Opens the SMS messaging app with the recipient and predefined text.";
      }

      const targetNum = num ? combined : "+911234567890";
      payload = msg ? `SMSTO:${targetNum}:${msg}` : `SMSTO:${targetNum}`;
    } else if (activeType === "vcard") {
      typeLabel = "Contact / vCard 3.0";
      const first = vcFirstInput.value.trim();
      const last = vcLastInput.value.trim();
      const org = vcOrgInput.value.trim();
      const title = vcTitleInput.value.trim();
      const phone = vcPhoneInput.value.trim();
      const email = vcEmailInput.value.trim();
      const site = vcUrlInput.value.trim();
      const street = vcStreetInput.value.trim();
      const city = vcCityInput.value.trim();
      const state = vcStateInput.value.trim();
      const zip = vcZipInput.value.trim();
      const country = vcCountryInput.value.trim();

      const fullName = [first, last].filter(Boolean).join(" ") || "Alex Morgan";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeVcardValue(last)};${escapeVcardValue(first)};;;`,
        `FN:${escapeVcardValue(fullName)}`,
      ];
      if (org) lines.push(`ORG:${escapeVcardValue(org)}`);
      if (title) lines.push(`TITLE:${escapeVcardValue(title)}`);
      if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${escapeVcardValue(phone)}`);
      if (email) lines.push(`EMAIL;TYPE=PREF,INTERNET:${escapeVcardValue(email)}`);
      if (site) lines.push(`URL:${escapeVcardValue(site)}`);
      if (street || city || state || zip || country) {
        lines.push(
          `ADR;TYPE=WORK:;;${escapeVcardValue(street)};${escapeVcardValue(city)};${escapeVcardValue(state)};${escapeVcardValue(zip)};${escapeVcardValue(country)}`
        );
      }
      lines.push("END:VCARD");
      payload = lines.join("\n");
    } else if (activeType === "whatsapp") {
      typeLabel = "WhatsApp Click-to-Chat";
      const digits = waNumInput.value.trim().replace(/[^\d]/g, "");
      const msg = waMsgInput.value.trim();
      const waOk = !waNumInput.value.trim() || (digits.length >= 7 && digits.length <= 15);

      waNumInput.classList.toggle("is-invalid", !waOk);
      if (!waOk) {
        waHintEl.className = "qr-hint is-error";
        waHintEl.textContent = "Include country code without + or spaces (7 to 15 digits, e.g. 911234567890).";
        valid = false;
      } else {
        waHintEl.className = "qr-hint";
        waHintEl.textContent = "Include country code (e.g. 91 for India, 1 for US) without leading + or zeros.";
      }

      const targetDigits = digits || "911234567890";
      payload = msg
        ? `https://wa.me/${targetDigits}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/${targetDigits}`;
    } else if (activeType === "location") {
      typeLabel = "Geographic Location (geo)";
      const latRaw = locLatInput.value.trim();
      const lngRaw = locLngInput.value.trim();
      const locName = locNameInput.value.trim();

      const lat = latRaw === "" ? 19.076 : Number(latRaw);
      const lng = lngRaw === "" ? 72.8777 : Number(lngRaw);
      const coordsOk =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;

      locLatInput.classList.toggle("is-invalid", latRaw !== "" && (!Number.isFinite(lat) || lat < -90 || lat > 90));
      locLngInput.classList.toggle("is-invalid", lngRaw !== "" && (!Number.isFinite(lng) || lng < -180 || lng > 180));

      if (!coordsOk) {
        locHintEl.className = "qr-hint is-error";
        locHintEl.textContent = "Latitude must be between -90 and 90, and Longitude between -180 and 180.";
        valid = false;
      } else {
        locHintEl.className = "qr-hint";
        locHintEl.textContent = "Opens coordinates in Apple Maps, Google Maps, or device map apps.";
      }

      const latStr = coordsOk ? String(lat) : "19.0760";
      const lngStr = coordsOk ? String(lng) : "72.8777";
      payload = locName
        ? `geo:${latStr},${lngStr}?q=${latStr},${lngStr}(${encodeURIComponent(locName)})`
        : `geo:${latStr},${lngStr}`;
    }

    return { valid, payload, typeLabel, warnings };
  }

  /* ---------- Render QR Code onto Any Canvas (Preview, PNG, JPG, Scan Verification) ---------- */
  function renderQrToCanvas(targetCanvas, qrObj, sizePx, options) {
    const count = qrObj.getModuleCount();
    const quiet = options.marginModules;
    const totalModules = count + quiet * 2;
    const cellSize = sizePx / totalModules;

    targetCanvas.width = sizePx;
    targetCanvas.height = sizePx;
    const ctx = targetCanvas.getContext("2d", { alpha: true });
    ctx.clearRect(0, 0, sizePx, sizePx);

    if (!options.transparentBg) {
      ctx.fillStyle = options.bgColor;
      ctx.fillRect(0, 0, sizePx, sizePx);
    }

    ctx.fillStyle = options.fgColor;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qrObj.isDark(r, c)) {
          const x = Math.floor((c + quiet) * cellSize);
          const y = Math.floor((r + quiet) * cellSize);
          const w = Math.ceil((c + quiet + 1) * cellSize) - x;
          const h = Math.ceil((r + quiet + 1) * cellSize) - y;
          ctx.fillRect(x, y, w, h);
        }
      }
    }

    // Center Logo Placement within Safe Module Limits
    if (options.logoImg && options.logoImg.complete && options.logoImg.naturalWidth > 0) {
      const codeAreaPx = count * cellSize;
      const maxLogoBox = codeAreaPx * (options.logoScalePct / 100);
      const ratio = Math.min(
        maxLogoBox / options.logoImg.naturalWidth,
        maxLogoBox / options.logoImg.naturalHeight
      );
      const drawW = options.logoImg.naturalWidth * ratio;
      const drawH = options.logoImg.naturalHeight * ratio;
      const pad = Math.max(4, cellSize * 0.8);
      const boxW = drawW + pad * 2;
      const boxH = drawH + pad * 2;
      const boxX = (sizePx - boxW) / 2;
      const boxY = (sizePx - boxH) / 2;

      if (options.logoBgMode === "white") {
        ctx.fillStyle = "#ffffff";
        const rad = Math.min(12, boxW * 0.14);
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, rad);
        ctx.fill();
      }

      ctx.drawImage(options.logoImg, (sizePx - drawW) / 2, (sizePx - drawH) / 2, drawW, drawH);
    }
  }

  /* ---------- Build Sanitized Vector SVG String ---------- */
  function buildVectorSvgString(qrObj, sizePx, options) {
    const count = qrObj.getModuleCount();
    const quiet = options.marginModules;
    const totalModules = count + quiet * 2;

    const rects = [];
    for (let r = 0; r < count; r++) {
      let runStart = -1;
      for (let c = 0; c <= count; c++) {
        const dark = c < count && qrObj.isDark(r, c);
        if (dark && runStart === -1) {
          runStart = c;
        } else if (!dark && runStart !== -1) {
          rects.push(
            `<rect x="${runStart + quiet}" y="${r + quiet}" width="${c - runStart}" height="1"/>`
          );
          runStart = -1;
        }
      }
    }

    let logoSvgSnippet = "";
    if (options.logoDataUrl && options.logoImg && options.logoImg.naturalWidth > 0) {
      const logoFrac = options.logoScalePct / 100;
      const maxLogoMod = count * logoFrac;
      const ratio = Math.min(
        maxLogoMod / options.logoImg.naturalWidth,
        maxLogoMod / options.logoImg.naturalHeight
      );
      const lw = options.logoImg.naturalWidth * ratio;
      const lh = options.logoImg.naturalHeight * ratio;
      const padMod = 0.8;
      const bw = lw + padMod * 2;
      const bh = lh + padMod * 2;
      const bx = (totalModules - bw) / 2;
      const by = (totalModules - bh) / 2;
      const lx = (totalModules - lw) / 2;
      const ly = (totalModules - lh) / 2;

      const bgRect =
        options.logoBgMode === "white"
          ? `<rect x="${bx.toFixed(3)}" y="${by.toFixed(3)}" width="${bw.toFixed(3)}" height="${bh.toFixed(3)}" rx="${(bw * 0.14).toFixed(3)}" fill="#ffffff"/>`
          : "";
      // Safe data-URI check before embedding inside SVG <image>
      if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(options.logoDataUrl)) {
        logoSvgSnippet = `${bgRect}<image href="${escapeXml(options.logoDataUrl)}" x="${lx.toFixed(3)}" y="${ly.toFixed(3)}" width="${lw.toFixed(3)}" height="${lh.toFixed(3)}" preserveAspectRatio="xMidYMid meet"/>`;
      }
    }

    const bgElement = options.transparentBg
      ? ""
      : `<rect width="${totalModules}" height="${totalModules}" fill="${escapeXml(options.bgColor)}"/>`;

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">`,
      bgElement,
      `<g fill="${escapeXml(options.fgColor)}">${rects.join("")}</g>`,
      logoSvgSnippet,
      `</svg>`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /* ---------- Master Update & Validation Cycle ---------- */
  function refreshQr() {
    if (typeof window.qrcode !== "function") return;

    const built = buildQrPayload();
    const outSize = getOutputSizePx();
    const transparentBg = Boolean(transparentPngCheck?.checked);
    const activeEcc = logoDataUrl && (eccLevel === "L" || eccLevel === "M") ? "H" : eccLevel;
    if (logoDataUrl && eccSelect && eccSelect.value !== "H") {
      eccLevel = "H";
      eccSelect.value = "H";
    }

    const warnings = [...built.warnings];

    // Contrast & inverted-color checks
    const { ratio, fgLum, bgLum } = contrastRatio(fgColor, bgColor);
    if (ratio < 3.0) {
      warnings.push(
        `Low color contrast (${ratio.toFixed(2)}:1). Use a darker foreground and lighter background (at least 3:1) for reliable scanning.`
      );
    } else if (fgLum > bgLum) {
      warnings.push(
        "Foreground color is lighter than background color. Many older QR scanners struggle with inverted colors."
      );
    }

    if (marginModules === 0) {
      warnings.push(
        "Quiet zone is set to 0 modules. Most QR scanners require a clear margin around the code to detect finder patterns."
      );
    }

    if (transparentBg) {
      warnings.push(
        "Transparent background is enabled for PNG/SVG. Ensure the surface you print or place it on provides high contrast."
      );
    }

    if (logoDataUrl) {
      if (logoScalePct > 22) {
        warnings.push(
          `Center logo covers ${logoScalePct}% of the QR width. Large logos reduce scan reliability—test across multiple scanners before printing.`
        );
      } else {
        warnings.push(
          "Center logo added (Error Correction automatically set to High). Test with multiple QR scanners before printing."
        );
      }
    }

    if (built.payload.length > 320) {
      warnings.push(
        `Long payload (${built.payload.length} characters) increases QR module density and requires a larger print size.`
      );
    }

    // Generate QR matrix
    let qrObj = null;
    try {
      qrObj = window.qrcode(0, activeEcc);
      qrObj.addData(built.payload);
      qrObj.make();
      lastModuleCount = qrObj.getModuleCount();
      lastPayload = built.payload;

      if (lastModuleCount >= 53) {
        warnings.push(
          `High QR density (${lastModuleCount}×${lastModuleCount} modules). Keep text concise or increase output size for easier mobile scanning.`
        );
      }

      renderQrToCanvas(previewCanvas, qrObj, 560, {
        fgColor,
        bgColor,
        marginModules,
        transparentBg,
        logoImg: logoImageObj,
        logoScalePct,
        logoBgMode,
      });
    } catch (_) {
      warnings.push("Content is too long for the selected error correction level. Shorten the text or lower error correction.");
    }

    // Update Preview Badges & Validation Telemetry
    if (badgeTypeEl) badgeTypeEl.textContent = built.typeLabel;
    if (badgeDimsEl) badgeDimsEl.textContent = `${outSize} × ${outSize} px`;
    if (badgeEccEl) badgeEccEl.textContent = `ECC: ${activeEcc}`;
    if (payloadPreviewEl) payloadPreviewEl.textContent = built.payload;

    if (valTypeEl) valTypeEl.textContent = built.typeLabel;
    if (valCharsEl) valCharsEl.textContent = `${built.payload.length} chars (${lastModuleCount}×${lastModuleCount})`;
    if (valDimsEl) valDimsEl.textContent = `${outSize} × ${outSize} px`;
    if (valEccEl) valEccEl.textContent = `${activeEcc} (${{ L: "Low 7%", M: "Medium 15%", Q: "Quartile 25%", H: "High 30%" }[activeEcc]})`;
    if (valLogoEl) valLogoEl.textContent = logoDataUrl ? `Active (${logoScalePct}%)` : "None";

    if (scanResultEl) {
      scanResultEl.textContent = "Not yet tested";
      scanResultEl.dataset.status = "";
    }

    if (warningsListEl) {
      warningsListEl.innerHTML = "";
      if (warnings.length === 0) {
        warningsListEl.hidden = true;
      } else {
        warningsListEl.hidden = false;
        warnings.forEach((w) => {
          const li = document.createElement("li");
          li.textContent = w;
          warningsListEl.appendChild(li);
        });
      }
    }

    const canExport = Boolean(qrObj && built.valid);
    if (dlPngBtn) dlPngBtn.disabled = !canExport;
    if (dlSvgBtn) dlSvgBtn.disabled = !canExport;
    if (dlJpgBtn) dlJpgBtn.disabled = !canExport;
  }

  /* ---------- Local Scan-Back Verification (jsQR Decoder) ---------- */
  function verifyScanLocally() {
    if (!lastPayload || typeof window.qrcode !== "function") return;
    if (typeof window.jsQR !== "function") {
      if (scanResultEl) {
        scanResultEl.textContent = "Local decoder library unavailable.";
        scanResultEl.dataset.status = "fail";
      }
      return;
    }

    try {
      const qrObj = window.qrcode(0, eccLevel);
      qrObj.addData(lastPayload);
      qrObj.make();

      const testCanvas = document.createElement("canvas");
      const testSize = 512;
      // Always render with solid background when testing scanability
      renderQrToCanvas(testCanvas, qrObj, testSize, {
        fgColor,
        bgColor,
        marginModules: Math.max(2, marginModules),
        transparentBg: false,
        logoImg: logoImageObj,
        logoScalePct,
        logoBgMode,
      });

      const ctx = testCanvas.getContext("2d", { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, testSize, testSize);
      const decoded = window.jsQR(imgData.data, testSize, testSize, {
        inversionAttempts: "attemptBoth",
      });

      testCanvas.width = 0;
      testCanvas.height = 0;

      if (decoded && decoded.data === lastPayload) {
        scanResultEl.textContent = "Verified: Decoded payload matches input";
        scanResultEl.dataset.status = "pass";
        toast("Local scan verification passed!");
      } else if (decoded) {
        scanResultEl.textContent = "Mismatch: Decoded payload differed from input";
        scanResultEl.dataset.status = "fail";
      } else {
        scanResultEl.textContent = "Decode failed: Try higher contrast, smaller logo, or larger margin";
        scanResultEl.dataset.status = "fail";
        toast("Local scan check could not decode the QR image.", "error");
      }
    } catch (_) {
      if (scanResultEl) {
        scanResultEl.textContent = "Verification error";
        scanResultEl.dataset.status = "fail";
      }
    }
  }

  /* ---------- Export Downloads (PNG, SVG, JPG) ---------- */
  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  dlPngBtn?.addEventListener("click", () => {
    if (!lastPayload) return;
    const size = getOutputSizePx();
    const qrObj = window.qrcode(0, eccLevel);
    qrObj.addData(lastPayload);
    qrObj.make();

    const exportCanvas = document.createElement("canvas");
    renderQrToCanvas(exportCanvas, qrObj, size, {
      fgColor,
      bgColor,
      marginModules,
      transparentBg: Boolean(transparentPngCheck?.checked),
      logoImg: logoImageObj,
      logoScalePct,
      logoBgMode,
    });

    exportCanvas.toBlob((blob) => {
      exportCanvas.width = 0;
      exportCanvas.height = 0;
      if (!blob) return toast("PNG export failed.", "error");
      triggerBlobDownload(blob, PNG_FILENAME);
      toast(`Downloaded ${PNG_FILENAME} (${size}×${size} px)`);
    }, "image/png");
  });

  dlSvgBtn?.addEventListener("click", () => {
    if (!lastPayload) return;
    const size = getOutputSizePx();
    const qrObj = window.qrcode(0, eccLevel);
    qrObj.addData(lastPayload);
    qrObj.make();

    const svgStr = buildVectorSvgString(qrObj, size, {
      fgColor,
      bgColor,
      marginModules,
      transparentBg: Boolean(transparentPngCheck?.checked),
      logoDataUrl,
      logoImg: logoImageObj,
      logoScalePct,
      logoBgMode,
    });

    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    triggerBlobDownload(blob, SVG_FILENAME);
    toast(`Downloaded ${SVG_FILENAME}`);
  });

  dlJpgBtn?.addEventListener("click", () => {
    if (!lastPayload) return;
    const size = getOutputSizePx();
    const q = parseFloat(jpgQualitySelect?.value || "0.92") || 0.92;
    const qrObj = window.qrcode(0, eccLevel);
    qrObj.addData(lastPayload);
    qrObj.make();

    const exportCanvas = document.createElement("canvas");
    // JPG does not support transparency; always use solid background (white if transparent PNG was checked)
    renderQrToCanvas(exportCanvas, qrObj, size, {
      fgColor,
      bgColor: transparentPngCheck?.checked ? "#ffffff" : bgColor,
      marginModules,
      transparentBg: false,
      logoImg: logoImageObj,
      logoScalePct,
      logoBgMode,
    });

    exportCanvas.toBlob(
      (blob) => {
        exportCanvas.width = 0;
        exportCanvas.height = 0;
        if (!blob) return toast("JPG export failed.", "error");
        triggerBlobDownload(blob, JPG_FILENAME);
        toast(`Downloaded ${JPG_FILENAME} (${size}×${size} px)`);
      },
      "image/jpeg",
      q
    );
  });

  /* ---------- Logo Upload & Sanitization ---------- */
  logoInput?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    if (!ALLOWED_LOGO_RE.test(f.name || "")) {
      toast("Please upload a PNG, JPG, or WebP logo file.", "error");
      return;
    }
    if (f.size > MAX_LOGO_BYTES) {
      toast("Logo image must be smaller than 2 MB.", "error");
      return;
    }

    const objUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // Re-encode onto an offscreen canvas to strip any non-image metadata and produce a clean PNG data URL
      const maxDim = 512;
      const ratio = Math.min(1, maxDim / img.naturalWidth, maxDim / img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      c.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const cleanDataUrl = c.toDataURL("image/png");
      c.width = 0;
      c.height = 0;
      URL.revokeObjectURL(objUrl);

      const cleanImg = new Image();
      cleanImg.onload = () => {
        logoDataUrl = cleanDataUrl;
        logoImageObj = cleanImg;
        if (logoThumb) {
          logoThumb.src = cleanDataUrl;
          logoThumb.hidden = false;
        }
        if (logoPh) logoPh.hidden = true;
        if (logoFileNameEl) logoFileNameEl.textContent = f.name;
        if (removeLogoBtn) removeLogoBtn.hidden = false;
        if (logoOptionsWrap) logoOptionsWrap.hidden = false;
        refreshQr();
        toast("Center logo added (Error Correction upgraded to High).");
      };
      cleanImg.src = cleanDataUrl;
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      toast("Unable to read the selected logo image.", "error");
    };
    img.src = objUrl;
  });

  function clearLogo() {
    logoDataUrl = null;
    logoImageObj = null;
    if (logoThumb) {
      logoThumb.hidden = true;
      logoThumb.removeAttribute("src");
    }
    if (logoPh) logoPh.hidden = false;
    if (logoFileNameEl) logoFileNameEl.textContent = "Upload PNG, JPG or WebP logo";
    if (removeLogoBtn) removeLogoBtn.hidden = true;
    if (logoOptionsWrap) logoOptionsWrap.hidden = true;
  }

  removeLogoBtn?.addEventListener("click", () => {
    clearLogo();
    refreshQr();
    toast("Logo removed.");
  });

  logoScaleRange?.addEventListener("input", () => {
    logoScalePct = parseInt(logoScaleRange.value, 10) || 20;
    if (logoScaleVal) logoScaleVal.textContent = `${logoScalePct}%`;
    refreshQr();
  });

  logoBgSelect?.addEventListener("change", () => {
    logoBgMode = logoBgSelect.value || "white";
    refreshQr();
  });

  /* ---------- Type Switching, Presets, Copy & Reset ---------- */
  function setQrType(nextType) {
    activeType = nextType;
    typeBtns.forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.qrType === nextType));
    });
    formPanels.forEach((p) => {
      p.hidden = p.dataset.qrPanel !== nextType;
    });
    refreshQr();
  }

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setQrType(btn.dataset.qrType));
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = STYLE_PRESETS.find((p) => p.id === btn.dataset.preset);
      if (!preset) return;
      fgColor = preset.fg;
      bgColor = preset.bg;
      if (fgPicker) fgPicker.value = fgColor;
      if (fgHexInput) fgHexInput.value = fgColor;
      if (bgPicker) bgPicker.value = bgColor;
      if (bgHexInput) bgHexInput.value = bgColor;
      presetBtns.forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      refreshQr();
    });
  });

  fgPicker?.addEventListener("input", () => {
    fgColor = fgPicker.value;
    if (fgHexInput) fgHexInput.value = fgColor;
    presetBtns.forEach((b) => b.setAttribute("aria-checked", "false"));
    refreshQr();
  });
  fgHexInput?.addEventListener("input", () => {
    const valid = normalizeHex(fgHexInput.value);
    fgHexInput.classList.toggle("is-invalid", fgHexInput.value.trim().length > 0 && !valid);
    if (valid) {
      fgColor = valid;
      if (fgPicker) fgPicker.value = valid;
      presetBtns.forEach((b) => b.setAttribute("aria-checked", "false"));
      refreshQr();
    }
  });

  bgPicker?.addEventListener("input", () => {
    bgColor = bgPicker.value;
    if (bgHexInput) bgHexInput.value = bgColor;
    presetBtns.forEach((b) => b.setAttribute("aria-checked", "false"));
    refreshQr();
  });
  bgHexInput?.addEventListener("input", () => {
    const valid = normalizeHex(bgHexInput.value);
    bgHexInput.classList.toggle("is-invalid", bgHexInput.value.trim().length > 0 && !valid);
    if (valid) {
      bgColor = valid;
      if (bgPicker) bgPicker.value = valid;
      presetBtns.forEach((b) => b.setAttribute("aria-checked", "false"));
      refreshQr();
    }
  });

  sizeSelect?.addEventListener("change", () => {
    if (customSizeWrap) customSizeWrap.hidden = sizeSelect.value !== "custom";
    refreshQr();
  });
  customSizeInput?.addEventListener("input", refreshQr);

  eccSelect?.addEventListener("change", () => {
    eccLevel = eccSelect.value || "M";
    refreshQr();
  });

  marginSelect?.addEventListener("change", () => {
    marginModules = parseInt(marginSelect.value, 10);
    if (Number.isNaN(marginModules)) marginModules = 4;
    refreshQr();
  });

  transparentPngCheck?.addEventListener("change", refreshQr);

  wifiPassToggle?.addEventListener("click", () => {
    if (!wifiPassInput) return;
    const isHidden = wifiPassInput.type === "password";
    wifiPassInput.type = isHidden ? "text" : "password";
    wifiPassToggle.textContent = isHidden ? "Hide" : "Show";
  });

  async function copyText(str, successMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
      } else {
        const ta = document.createElement("textarea");
        ta.value = str;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast(successMsg);
    } catch (_) {
      toast("Unable to copy text.", "error");
    }
  }

  copyOrigUrlBtn?.addEventListener("click", () => {
    const orig = urlInput?.value.trim() || "https://www.example.com";
    copyText(orig, "Original URL copied to clipboard.");
  });

  copyPayloadBtn?.addEventListener("click", () => {
    if (lastPayload) copyText(lastPayload, "Encoded QR payload copied to clipboard.");
  });

  verifyScanBtn?.addEventListener("click", verifyScanLocally);

  function resetAll() {
    // Reset all 9 form groups
    [
      urlInput, urlCampaignInput, urlParamsInput, textInput,
      wifiSsidInput, wifiPassInput, emailAddrInput, emailSubjInput, emailBodyInput,
      phoneNumInput, smsNumInput, smsBodyInput,
      vcFirstInput, vcLastInput, vcOrgInput, vcTitleInput, vcPhoneInput, vcEmailInput,
      vcUrlInput, vcStreetInput, vcCityInput, vcStateInput, vcZipInput, vcCountryInput,
      waNumInput, waMsgInput, locLatInput, locLngInput, locNameInput,
    ].forEach((el) => {
      if (el) {
        el.value = "";
        el.classList.remove("is-invalid");
      }
    });

    if (phoneCodeInput) phoneCodeInput.value = "+91";
    if (smsCodeInput) smsCodeInput.value = "+91";
    if (wifiSecSelect) wifiSecSelect.value = "WPA";
    if (wifiHiddenCheck) wifiHiddenCheck.checked = false;
    if (wifiPassInput) wifiPassInput.type = "password";
    if (wifiPassToggle) wifiPassToggle.textContent = "Show";

    // Reset appearance, dimensions, error correction & logo
    fgColor = "#000000";
    bgColor = "#ffffff";
    if (fgPicker) fgPicker.value = fgColor;
    if (fgHexInput) {
      fgHexInput.value = fgColor;
      fgHexInput.classList.remove("is-invalid");
    }
    if (bgPicker) bgPicker.value = bgColor;
    if (bgHexInput) {
      bgHexInput.value = bgColor;
      bgHexInput.classList.remove("is-invalid");
    }
    presetBtns.forEach((b, idx) => b.setAttribute("aria-checked", String(idx === 0)));

    if (sizeSelect) sizeSelect.value = "1024";
    if (customSizeWrap) customSizeWrap.hidden = true;
    eccLevel = "M";
    if (eccSelect) eccSelect.value = "M";
    marginModules = 4;
    if (marginSelect) marginSelect.value = "4";
    if (transparentPngCheck) transparentPngCheck.checked = false;
    if (jpgQualitySelect) jpgQualitySelect.value = "0.92";

    clearLogo();
    setQrType("url");
    toast("QR Code Generator reset.");
  }

  resetTopBtn?.addEventListener("click", resetAll);
  resetPreviewBtn?.addEventListener("click", resetAll);

  // Bind live updates across all inputs
  [
    urlInput, urlCampaignInput, urlParamsInput, textInput,
    wifiSsidInput, wifiPassInput, emailAddrInput, emailSubjInput, emailBodyInput,
    phoneCodeInput, phoneNumInput, smsCodeInput, smsNumInput, smsBodyInput,
    vcFirstInput, vcLastInput, vcOrgInput, vcTitleInput, vcPhoneInput, vcEmailInput,
    vcUrlInput, vcStreetInput, vcCityInput, vcStateInput, vcZipInput, vcCountryInput,
    waNumInput, waMsgInput, locLatInput, locLngInput, locNameInput,
  ].forEach((el) => {
    el?.addEventListener("input", refreshQr);
  });

  wifiSecSelect?.addEventListener("change", refreshQr);
  wifiHiddenCheck?.addEventListener("change", refreshQr);

  // Initial render
  setQrType("url");
})();
