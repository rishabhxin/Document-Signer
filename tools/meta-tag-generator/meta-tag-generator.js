(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const TITLE_MAX_GUIDE = 70;
  const DESC_MIN_GUIDE = 50;
  const DESC_MAX_GUIDE = 160;
  const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1.0";
  const DEFAULT_THEME_COLOR = "#ffffff";
  const DEFAULT_REFERRER = "strict-origin-when-cross-origin";
  const DOWNLOAD_FILENAME = "opensign-meta-tags.html";

  const titleInput = $("mtPageTitle");
  const titleCountEl = $("mtTitleCount");
  const titleHintEl = $("mtTitleHint");

  const descInput = $("mtMetaDesc");
  const descCountEl = $("mtDescCount");
  const descHintEl = $("mtDescHint");

  const pageUrlInput = $("mtPageUrl");
  const pageUrlHintEl = $("mtPageUrlHint");
  const authorInput = $("mtAuthor");
  const siteNameInput = $("mtSiteName");
  const langSelect = $("mtLanguage");
  const customLangWrap = $("mtCustomLangWrap");
  const customLangInput = $("mtCustomLang");

  const syncCanonicalCheck = $("mtSyncCanonical");
  const canonicalInput = $("mtCanonicalUrl");
  const canonicalHintEl = $("mtCanonicalHint");
  const robotChecks = Array.from(document.querySelectorAll("[data-robot]"));
  const robotsPreviewBadge = $("mtRobotsBadge");
  const themeColorPicker = $("mtThemeColorPicker");
  const themeColorHex = $("mtThemeColorHex");
  const themeColorHint = $("mtThemeColorHint");
  const referrerSelect = $("mtReferrerPolicy");
  const viewportInput = $("mtViewport");

  const syncOgTitleCheck = $("mtSyncOgTitle");
  const syncOgDescCheck = $("mtSyncOgDesc");
  const ogTitleInput = $("mtOgTitle");
  const ogDescInput = $("mtOgDesc");
  const ogImageInput = $("mtOgImage");
  const ogImageHint = $("mtOgImageHint");
  const ogUrlInput = $("mtOgUrl");
  const ogTypeSelect = $("mtOgType");
  const ogSiteNameInput = $("mtOgSiteName");
  const ogLocaleInput = $("mtOgLocale");

  const syncTwTitleCheck = $("mtSyncTwTitle");
  const syncTwDescCheck = $("mtSyncTwDesc");
  const twCardSelect = $("mtTwCard");
  const twTitleInput = $("mtTwTitle");
  const twDescInput = $("mtTwDesc");
  const twImageInput = $("mtTwImage");
  const twImageHint = $("mtTwImageHint");
  const twSiteInput = $("mtTwSite");
  const twCreatorInput = $("mtTwCreator");

  const serpTabBtns = Array.from(document.querySelectorAll("[data-serp-view]"));
  const serpCard = $("mtSerpCard");
  const serpFavicon = $("mtSerpFavicon");
  const serpSiteName = $("mtSerpSiteName");
  const serpUrl = $("mtSerpUrl");
  const serpTitle = $("mtSerpTitle");
  const serpDesc = $("mtSerpDesc");

  const socialTabBtns = Array.from(document.querySelectorAll("[data-social-view]"));
  const ogPreviewPane = $("mtOgPreviewPane");
  const twPreviewPane = $("mtTwPreviewPane");

  const ogPrevImg = $("mtOgPrevImg");
  const ogPrevPlaceholder = $("mtOgPrevPlaceholder");
  const ogPrevDomain = $("mtOgPrevDomain");
  const ogPrevTitle = $("mtOgPrevTitle");
  const ogPrevDesc = $("mtOgPrevDesc");

  const twCardEl = $("mtTwCardPreview");
  const twPrevImg = $("mtTwPrevImg");
  const twPrevPlaceholder = $("mtTwPrevPlaceholder");
  const twPrevDomain = $("mtTwPrevDomain");
  const twPrevTitle = $("mtTwPrevTitle");
  const twPrevDesc = $("mtTwPrevDesc");

  const codeModeBtns = Array.from(document.querySelectorAll("[data-code-mode]"));
  const codeOutputEl = $("mtCodeOutput");
  const copyHtmlBtn = $("mtCopyHtmlBtn");
  const selectAllBtn = $("mtSelectAllBtn");
  const downloadHtmlBtn = $("mtDownloadHtmlBtn");
  const sampleBtn = $("mtSampleBtn");
  const resetTopBtn = $("mtResetTopBtn");
  const resetCodeBtn = $("mtResetCodeBtn");
  const checklistEl = $("mtChecklist");

  if (!titleInput || !descInput || !codeOutputEl) return;

  let codeMode = "full";
  let lastGeneratedRawHtml = "";

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

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function cleanSingleLine(str) {
    return String(str || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
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
        return { valid: false, empty: false, url: null, reason: "Enter a complete domain name (e.g. https://www.example.com)." };
      }
      return { valid: true, empty: false, url: parsed };
    } catch (_) {
      return { valid: false, empty: false, url: null, reason: "Enter a valid URL starting with https:// or http://." };
    }
  }

  function normalizeHexColor(raw) {
    const s = String(raw || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    }
    return null;
  }

  function normalizeTwitterHandle(raw) {
    const s = cleanSingleLine(raw).replace(/\s+/g, "");
    if (!s) return "";
    return s.startsWith("@") ? s : `@${s}`;
  }

  function formatSerpBreadcrumb(parsedUrl) {
    if (!parsedUrl) return "https://www.example.com › page";
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const segments = parsedUrl.pathname
      .split("/")
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);
    if (!segments.length) return origin;
    return `${origin} › ${segments.join(" › ")}`;
  }

  function enforceRobotsConsistency(changedBox) {
    const map = {};
    robotChecks.forEach((cb) => (map[cb.dataset.robot] = cb));

    if (changedBox) {
      const key = changedBox.dataset.robot;
      if (key === "index" && changedBox.checked && map.noindex) map.noindex.checked = false;
      if (key === "noindex" && changedBox.checked && map.index) map.index.checked = false;
      if (key === "follow" && changedBox.checked && map.nofollow) map.nofollow.checked = false;
      if (key === "nofollow" && changedBox.checked && map.follow) map.follow.checked = false;
    }

    const active = robotChecks.filter((cb) => cb.checked).map((cb) => cb.dataset.robot);
    const content = active.join(", ");
    if (robotsPreviewBadge) {
      robotsPreviewBadge.textContent = content || "Default (none set)";
    }
    return content;
  }

  function applyAutoSync() {
    const rawTitle = cleanSingleLine(titleInput.value);
    const rawDesc = cleanSingleLine(descInput.value);
    const pageUrlCheck = validateHttpUrl(pageUrlInput.value);

    if (syncCanonicalCheck?.checked && canonicalInput) {
      canonicalInput.value = pageUrlCheck.valid ? pageUrlCheck.url.href : pageUrlInput.value.trim();
    }
    if (syncOgTitleCheck?.checked && ogTitleInput) ogTitleInput.value = rawTitle;
    if (syncOgDescCheck?.checked && ogDescInput) ogDescInput.value = rawDesc;
    if (syncTwTitleCheck?.checked && twTitleInput) twTitleInput.value = rawTitle;
    if (syncTwDescCheck?.checked && twDescInput) twDescInput.value = rawDesc;
  }

  function collectMetadataState() {
    const title = cleanSingleLine(titleInput.value);
    const description = cleanSingleLine(descInput.value);
    const pageUrlRes = validateHttpUrl(pageUrlInput.value);
    const author = cleanSingleLine(authorInput.value);
    const siteName = cleanSingleLine(siteNameInput.value);
    const langVal = langSelect.value === "other" ? cleanSingleLine(customLangInput.value) : langSelect.value;

    const canonicalRaw = syncCanonicalCheck?.checked ? pageUrlInput.value : canonicalInput.value;
    const canonicalRes = validateHttpUrl(canonicalRaw);

    const robots = enforceRobotsConsistency(null);
    const validHex = normalizeHexColor(themeColorHex.value);
    const referrer = referrerSelect.value;
    const viewport = cleanSingleLine(viewportInput.value);

    const ogTitle = cleanSingleLine(ogTitleInput.value);
    const ogDesc = cleanSingleLine(ogDescInput.value);
    const ogImgRes = validateHttpUrl(ogImageInput.value);
    const ogUrlRaw = ogUrlInput.value.trim() || (canonicalRes.valid ? canonicalRes.url.href : pageUrlRes.valid ? pageUrlRes.url.href : "");
    const ogUrlRes = validateHttpUrl(ogUrlRaw);
    const ogType = ogTypeSelect.value || "website";
    const ogSiteName = cleanSingleLine(ogSiteNameInput.value) || siteName;
    const ogLocale = cleanSingleLine(ogLocaleInput.value);

    const twCard = twCardSelect.value || "summary_large_image";
    const twTitle = cleanSingleLine(twTitleInput.value);
    const twDesc = cleanSingleLine(twDescInput.value);
    const twImgRaw = twImageInput.value.trim() || (ogImgRes.valid ? ogImgRes.url.href : "");
    const twImgRes = validateHttpUrl(twImgRaw);
    const twSite = normalizeTwitterHandle(twSiteInput.value);
    const twCreator = normalizeTwitterHandle(twCreatorInput.value);

    return {
      title, description, pageUrlRes, author, siteName, langVal,
      canonicalRes, robots, validHex, referrer, viewport,
      ogTitle, ogDesc, ogImgRes, ogUrlRes, ogType, ogSiteName, ogLocale,
      twCard, twTitle, twDesc, twImgRes, twSite, twCreator,
    };
  }

  function buildHtmlOutput(meta, includeHeadWrapper) {
    const indent = includeHeadWrapper ? "    " : "";
    const lines = [];

    if (includeHeadWrapper) {
      lines.push("<head>");
      lines.push(`${indent}<meta charset="UTF-8">`);
    }

    if (meta.viewport) lines.push(`${indent}<meta name="viewport" content="${escapeHtml(meta.viewport)}">`);
    if (meta.title) lines.push(`${indent}<title>${escapeHtml(meta.title)}</title>`);
    if (meta.description) lines.push(`${indent}<meta name="description" content="${escapeHtml(meta.description)}">`);
    if (meta.author) lines.push(`${indent}<meta name="author" content="${escapeHtml(meta.author)}">`);
    if (meta.langVal) lines.push(`${indent}<meta http-equiv="content-language" content="${escapeHtml(meta.langVal)}">`);
    if (meta.canonicalRes.valid) lines.push(`${indent}<link rel="canonical" href="${escapeHtml(meta.canonicalRes.url.href)}">`);
    if (meta.robots) lines.push(`${indent}<meta name="robots" content="${escapeHtml(meta.robots)}">`);
    if (meta.referrer) lines.push(`${indent}<meta name="referrer" content="${escapeHtml(meta.referrer)}">`);
    if (meta.validHex) lines.push(`${indent}<meta name="theme-color" content="${escapeHtml(meta.validHex)}">`);

    const ogLines = [];
    if (meta.ogTitle) ogLines.push(`${indent}<meta property="og:title" content="${escapeHtml(meta.ogTitle)}">`);
    if (meta.ogDesc) ogLines.push(`${indent}<meta property="og:description" content="${escapeHtml(meta.ogDesc)}">`);
    if (meta.ogImgRes.valid) ogLines.push(`${indent}<meta property="og:image" content="${escapeHtml(meta.ogImgRes.url.href)}">`);
    if (meta.ogUrlRes.valid) ogLines.push(`${indent}<meta property="og:url" content="${escapeHtml(meta.ogUrlRes.url.href)}">`);
    if (meta.ogType && (meta.ogTitle || meta.ogDesc || meta.ogImgRes.valid || meta.ogUrlRes.valid)) {
      ogLines.push(`${indent}<meta property="og:type" content="${escapeHtml(meta.ogType)}">`);
    }
    if (meta.ogSiteName) ogLines.push(`${indent}<meta property="og:site_name" content="${escapeHtml(meta.ogSiteName)}">`);
    if (meta.ogLocale) ogLines.push(`${indent}<meta property="og:locale" content="${escapeHtml(meta.ogLocale)}">`);

    if (ogLines.length) {
      lines.push("");
      lines.push(`${indent}<!-- Open Graph -->`);
      lines.push(...ogLines);
    }

    const twLines = [];
    if (meta.twCard && (meta.twTitle || meta.twDesc || meta.twImgRes.valid || meta.twSite || meta.twCreator)) {
      twLines.push(`${indent}<meta name="twitter:card" content="${escapeHtml(meta.twCard)}">`);
    }
    if (meta.twTitle) twLines.push(`${indent}<meta name="twitter:title" content="${escapeHtml(meta.twTitle)}">`);
    if (meta.twDesc) twLines.push(`${indent}<meta name="twitter:description" content="${escapeHtml(meta.twDesc)}">`);
    if (meta.twImgRes.valid) twLines.push(`${indent}<meta name="twitter:image" content="${escapeHtml(meta.twImgRes.url.href)}">`);
    if (meta.twSite) twLines.push(`${indent}<meta name="twitter:site" content="${escapeHtml(meta.twSite)}">`);
    if (meta.twCreator) twLines.push(`${indent}<meta name="twitter:creator" content="${escapeHtml(meta.twCreator)}">`);

    if (twLines.length) {
      lines.push("");
      lines.push(`${indent}<!-- Twitter/X -->`);
      lines.push(...twLines);
    }

    if (includeHeadWrapper) lines.push("</head>");
    return lines.join("\n");
  }

  function renderSyntaxHighlightedHtml(rawCode) {
    const lines = rawCode.split("\n");
    const htmlLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";

      if (trimmed.startsWith("<!--") && trimmed.endsWith("-->")) {
        return `<span class="tok-comment">${escapeHtml(line)}</span>`;
      }

      const titleMatch = line.match(/^(\s*)<title>(.*?)<\/title>$/);
      if (titleMatch) {
        return `${escapeHtml(titleMatch[1])}<span class="tok-punct">&lt;</span><span class="tok-tag">title</span><span class="tok-punct">&gt;</span><span class="tok-text">${escapeHtml(titleMatch[2])}</span><span class="tok-punct">&lt;/</span><span class="tok-tag">title</span><span class="tok-punct">&gt;</span>`;
      }

      if (trimmed === "<head>" || trimmed === "</head>") {
        const leading = escapeHtml(line.slice(0, line.indexOf("<")));
        const slash = trimmed.startsWith("</") ? "&lt;/" : "&lt;";
        return `${leading}<span class="tok-punct">${slash}</span><span class="tok-tag">head</span><span class="tok-punct">&gt;</span>`;
      }

      const tagMatch = line.match(/^(\s*)<([a-zA-Z0-9-]+)(.*?)>$/);
      if (tagMatch) {
        const leading = escapeHtml(tagMatch[1]);
        const tagName = escapeHtml(tagMatch[2]);
        const attrPart = tagMatch[3];
        const highlightedAttrs = attrPart.replace(
          /\s+([a-zA-Z0-9:-]+)=\x22([^\x22]*)\x22/g,
          (_, attrName, attrVal) =>
            ` <span class="tok-attr">${escapeHtml(attrName)}</span><span class="tok-punct">=</span><span class="tok-val">"${escapeHtml(attrVal)}"</span>`
        );
        return `${leading}<span class="tok-punct">&lt;</span><span class="tok-tag">${tagName}</span>${highlightedAttrs}<span class="tok-punct">&gt;</span>`;
      }

      return escapeHtml(line);
    });

    codeOutputEl.innerHTML = htmlLines.join("\n");
  }

  function updateCountersAndHints(meta) {
    const tLen = meta.title.length;
    titleCountEl.textContent = `${tLen} / ${TITLE_MAX_GUIDE}`;
    titleCountEl.className = "mt-counter";
    titleHintEl.className = "mt-hint";
    if (tLen === 0) {
      titleHintEl.textContent = "Recommended editing guideline: up to 60–70 characters (Google may adjust display length by device).";
    } else if (tLen > TITLE_MAX_GUIDE) {
      titleCountEl.classList.add("is-warn");
      titleHintEl.classList.add("is-warn");
      titleHintEl.textContent = `Title is ${tLen} characters (above the ${TITLE_MAX_GUIDE}-character guideline) and may be truncated or rewritten in search results.`;
    } else {
      titleCountEl.classList.add("is-good");
      titleHintEl.textContent = "Good title length within the 70-character editing guideline.";
    }

    const dLen = meta.description.length;
    descCountEl.textContent = `${dLen} / ${DESC_MAX_GUIDE}`;
    descCountEl.className = "mt-counter";
    descHintEl.className = "mt-hint";
    if (dLen === 0) {
      descHintEl.textContent = "Recommended editing guideline: 120–160 characters. Search engines may generate dynamic snippets.";
    } else if (dLen < DESC_MIN_GUIDE) {
      descCountEl.classList.add("is-warn");
      descHintEl.classList.add("is-warn");
      descHintEl.textContent = `Description is short (${dLen} characters). Consider adding more context (guideline: 120–160 characters).`;
    } else if (dLen > DESC_MAX_GUIDE) {
      descCountEl.classList.add("is-warn");
      descHintEl.classList.add("is-warn");
      descHintEl.textContent = `Description is ${dLen} characters (above the ${DESC_MAX_GUIDE}-character guideline) and may be shortened in search snippets.`;
    } else {
      descCountEl.classList.add("is-good");
      descHintEl.textContent = "Good description length within the 160-character editing guideline.";
    }

    pageUrlInput.classList.toggle("is-invalid", !meta.pageUrlRes.empty && !meta.pageUrlRes.valid);
    if (!meta.pageUrlRes.empty && !meta.pageUrlRes.valid) {
      pageUrlHintEl.className = "mt-hint is-error";
      pageUrlHintEl.textContent = meta.pageUrlRes.reason;
    } else {
      pageUrlHintEl.className = "mt-hint";
      pageUrlHintEl.textContent = "Used for canonical URL and social metadata links when valid.";
    }

    canonicalInput.classList.toggle("is-invalid", !meta.canonicalRes.empty && !meta.canonicalRes.valid);
    if (!meta.canonicalRes.empty && !meta.canonicalRes.valid) {
      canonicalHintEl.className = "mt-hint is-error";
      canonicalHintEl.textContent = meta.canonicalRes.reason;
    } else {
      canonicalHintEl.className = "mt-hint";
      canonicalHintEl.textContent = "Helps search engines identify the preferred version of a page.";
    }

    const rawHex = themeColorHex.value.trim();
    themeColorHex.classList.toggle("is-invalid", rawHex.length > 0 && !meta.validHex);
    if (rawHex.length > 0 && !meta.validHex) {
      themeColorHint.className = "mt-hint is-error";
      themeColorHint.textContent = "Enter a valid 6-digit HEX color (e.g. #ffffff or #4c00ff).";
    } else {
      themeColorHint.className = "mt-hint";
      themeColorHint.textContent = "Sets browser toolbar accent color on supported mobile devices.";
    }

    ogImageInput.classList.toggle("is-invalid", !meta.ogImgRes.empty && !meta.ogImgRes.valid);
    ogImageHint.className = !meta.ogImgRes.empty && !meta.ogImgRes.valid ? "mt-hint is-error" : "mt-hint";
    ogImageHint.textContent =
      !meta.ogImgRes.empty && !meta.ogImgRes.valid
        ? meta.ogImgRes.reason
        : "Recommended 1200 × 630 px image URL (https://...) for rich link previews.";

    const rawTwImgCheck = validateHttpUrl(twImageInput.value.trim());
    twImageInput.classList.toggle("is-invalid", !rawTwImgCheck.empty && !rawTwImgCheck.valid);
    twImageHint.className = !rawTwImgCheck.empty && !rawTwImgCheck.valid ? "mt-hint is-error" : "mt-hint";
    twImageHint.textContent =
      !rawTwImgCheck.empty && !rawTwImgCheck.valid
        ? rawTwImgCheck.reason
        : "Leave blank to reuse the Open Graph image URL automatically.";
  }

  function syncPreviewImage(imgEl, placeholderEl, url) {
    if (!imgEl || !placeholderEl) return;
    if (!url) {
      imgEl.hidden = true;
      imgEl.removeAttribute("src");
      placeholderEl.hidden = false;
      return;
    }
    if (imgEl.dataset.loadedUrl !== url) {
      imgEl.dataset.loadedUrl = url;
      imgEl.onload = () => {
        imgEl.hidden = false;
        placeholderEl.hidden = true;
      };
      imgEl.onerror = () => {
        imgEl.hidden = true;
        placeholderEl.hidden = false;
      };
      imgEl.src = url;
    }
  }

  function updateSerpAndSocialPreviews(meta) {
    const parsedUrl = meta.canonicalRes.valid ? meta.canonicalRes.url : meta.pageUrlRes.valid ? meta.pageUrlRes.url : null;
    const domain = parsedUrl ? parsedUrl.host : "www.example.com";
    const siteDisplay = meta.siteName || domain;

    if (serpFavicon) serpFavicon.textContent = siteDisplay.charAt(0).toUpperCase() || "W";
    if (serpSiteName) serpSiteName.textContent = siteDisplay;
    if (serpUrl) serpUrl.textContent = formatSerpBreadcrumb(parsedUrl);
    if (serpTitle) serpTitle.textContent = meta.title || "Your SEO Page Title Appears Here";
    if (serpDesc) {
      serpDesc.textContent =
        meta.description ||
        "Enter a clear, helpful meta description to preview how your page title and snippet may appear in search results.";
    }

    if (ogPrevDomain) ogPrevDomain.textContent = domain.toUpperCase();
    if (ogPrevTitle) ogPrevTitle.textContent = meta.ogTitle || meta.title || "Your Open Graph Title";
    if (ogPrevDesc) {
      ogPrevDesc.textContent =
        meta.ogDesc || meta.description || "Social sharing description preview for Facebook, LinkedIn, and messaging apps.";
    }
    syncPreviewImage(ogPrevImg, ogPrevPlaceholder, meta.ogImgRes.valid ? meta.ogImgRes.url.href : "");

    if (twCardEl) twCardEl.classList.toggle("is-summary", meta.twCard === "summary");
    if (twPrevDomain) twPrevDomain.textContent = domain;
    if (twPrevTitle) twPrevTitle.textContent = meta.twTitle || meta.title || "Your Twitter / X Card Title";
    if (twPrevDesc) {
      twPrevDesc.textContent =
        meta.twDesc || meta.description || "Preview of how your link card appears when shared on X (Twitter).";
    }
    syncPreviewImage(twPrevImg, twPrevPlaceholder, meta.twImgRes.valid ? meta.twImgRes.url.href : "");
  }

  function renderSeoChecklist(meta) {
    if (!checklistEl) return;

    const checks = [
      { label: "1. SEO page title is present", status: meta.title ? "complete" : "missing", text: meta.title ? "Complete" : "Missing" },
      { label: "2. Meta description is present", status: meta.description ? "complete" : "missing", text: meta.description ? "Complete" : "Missing" },
      {
        label: "3. Page URL is valid",
        status: meta.pageUrlRes.valid ? "complete" : meta.pageUrlRes.empty ? "missing" : "attention",
        text: meta.pageUrlRes.valid ? "Complete" : meta.pageUrlRes.empty ? "Missing" : "Needs Attention",
      },
      {
        label: "4. Canonical URL is valid",
        status: meta.canonicalRes.valid ? "complete" : meta.canonicalRes.empty ? "missing" : "attention",
        text: meta.canonicalRes.valid ? "Complete" : meta.canonicalRes.empty ? "Missing" : "Needs Attention",
      },
      {
        label: "5. Title length within 70-character guideline",
        status: !meta.title ? "missing" : meta.title.length <= TITLE_MAX_GUIDE ? "complete" : "attention",
        text: !meta.title ? "Missing" : meta.title.length <= TITLE_MAX_GUIDE ? "Complete" : "Needs Attention",
      },
      {
        label: "6. Description length within 50–160 character guideline",
        status: !meta.description
          ? "missing"
          : meta.description.length >= DESC_MIN_GUIDE && meta.description.length <= DESC_MAX_GUIDE
            ? "complete"
            : "attention",
        text: !meta.description
          ? "Missing"
          : meta.description.length >= DESC_MIN_GUIDE && meta.description.length <= DESC_MAX_GUIDE
            ? "Complete"
            : "Needs Attention",
      },
      {
        label: "7. Open Graph image URL is valid",
        status: meta.ogImgRes.valid ? "complete" : meta.ogImgRes.empty ? "missing" : "attention",
        text: meta.ogImgRes.valid ? "Complete" : meta.ogImgRes.empty ? "Missing" : "Needs Attention",
      },
      { label: "8. Twitter/X card type is selected", status: meta.twCard ? "complete" : "missing", text: meta.twCard ? "Complete" : "Missing" },
      { label: "9. Robots directive is configured", status: meta.robots ? "complete" : "missing", text: meta.robots ? "Complete" : "Missing" },
    ];

    checklistEl.innerHTML = "";
    for (const item of checks) {
      const li = document.createElement("li");
      li.className = "mt-check-item";
      const spanLbl = document.createElement("span");
      spanLbl.textContent = item.label;
      const badge = document.createElement("span");
      badge.className = `mt-check-badge is-${item.status}`;
      badge.textContent = item.text;
      li.append(spanLbl, badge);
      checklistEl.appendChild(li);
    }
  }

  function refreshAll() {
    applyAutoSync();
    const meta = collectMetadataState();
    updateCountersAndHints(meta);
    updateSerpAndSocialPreviews(meta);
    lastGeneratedRawHtml = buildHtmlOutput(meta, codeMode === "full");
    renderSyntaxHighlightedHtml(lastGeneratedRawHtml);
    renderSeoChecklist(meta);
  }

  [titleInput, descInput, pageUrlInput, authorInput, siteNameInput, customLangInput].forEach((el) => {
    el?.addEventListener("input", refreshAll);
  });

  langSelect?.addEventListener("change", () => {
    if (customLangWrap) customLangWrap.hidden = langSelect.value !== "other";
    refreshAll();
  });

  syncCanonicalCheck?.addEventListener("change", refreshAll);
  canonicalInput?.addEventListener("input", () => {
    if (syncCanonicalCheck?.checked) syncCanonicalCheck.checked = false;
    refreshAll();
  });

  robotChecks.forEach((cb) => {
    cb.addEventListener("change", () => {
      enforceRobotsConsistency(cb);
      refreshAll();
    });
  });

  themeColorPicker?.addEventListener("input", () => {
    themeColorHex.value = themeColorPicker.value;
    refreshAll();
  });
  themeColorHex?.addEventListener("input", () => {
    const valid = normalizeHexColor(themeColorHex.value);
    if (valid && themeColorPicker) themeColorPicker.value = valid;
    refreshAll();
  });

  referrerSelect?.addEventListener("change", refreshAll);
  viewportInput?.addEventListener("input", refreshAll);

  syncOgTitleCheck?.addEventListener("change", refreshAll);
  syncOgDescCheck?.addEventListener("change", refreshAll);
  syncTwTitleCheck?.addEventListener("change", refreshAll);
  syncTwDescCheck?.addEventListener("change", refreshAll);

  ogTitleInput?.addEventListener("input", () => {
    if (syncOgTitleCheck?.checked) syncOgTitleCheck.checked = false;
    refreshAll();
  });
  ogDescInput?.addEventListener("input", () => {
    if (syncOgDescCheck?.checked) syncOgDescCheck.checked = false;
    refreshAll();
  });
  twTitleInput?.addEventListener("input", () => {
    if (syncTwTitleCheck?.checked) syncTwTitleCheck.checked = false;
    refreshAll();
  });
  twDescInput?.addEventListener("input", () => {
    if (syncTwDescCheck?.checked) syncTwDescCheck.checked = false;
    refreshAll();
  });

  [ogImageInput, ogUrlInput, ogSiteNameInput, ogLocaleInput, twImageInput, twSiteInput, twCreatorInput].forEach((el) => {
    el?.addEventListener("input", refreshAll);
  });
  ogTypeSelect?.addEventListener("change", refreshAll);
  twCardSelect?.addEventListener("change", refreshAll);

  serpTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.serpView;
      serpTabBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      if (serpCard) serpCard.classList.toggle("is-mobile", view === "mobile");
    });
  });

  socialTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.socialView;
      socialTabBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      if (ogPreviewPane) ogPreviewPane.hidden = target !== "og";
      if (twPreviewPane) twPreviewPane.hidden = target !== "twitter";
    });
  });

  codeModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      codeMode = btn.dataset.codeMode || "full";
      codeModeBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      refreshAll();
    });
  });

  copyHtmlBtn?.addEventListener("click", async () => {
    if (!lastGeneratedRawHtml) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(lastGeneratedRawHtml);
      } else {
        const ta = document.createElement("textarea");
        ta.value = lastGeneratedRawHtml;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      const origText = copyHtmlBtn.textContent;
      copyHtmlBtn.textContent = "Copied!";
      toast("HTML meta tags copied to clipboard.");
      setTimeout(() => {
        copyHtmlBtn.textContent = origText;
      }, 1800);
    } catch (_) {
      toast("Unable to copy HTML code.", "error");
    }
  });

  selectAllBtn?.addEventListener("click", () => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(codeOutputEl);
    sel.removeAllRanges();
    sel.addRange(range);
    toast("Selected all generated HTML code.");
  });

  downloadHtmlBtn?.addEventListener("click", () => {
    if (!lastGeneratedRawHtml) return;
    const blob = new Blob([lastGeneratedRawHtml + "\n"], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = DOWNLOAD_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Downloaded ${DOWNLOAD_FILENAME}`);
  });

  sampleBtn?.addEventListener("click", () => {
    titleInput.value = "Free Meta Tag Generator – Create SEO Tags Online | Open Sign";
    descInput.value =
      "Generate free SEO meta tags online with Open Sign. Create meta titles, descriptions, canonical URLs, robots tags and Open Graph metadata. Copy HTML instantly.";
    pageUrlInput.value = "https://www.opensign.in/tools/meta-tag-generator/";
    authorInput.value = "Open Sign Team";
    siteNameInput.value = "Open Sign";
    langSelect.value = "en";
    if (customLangWrap) customLangWrap.hidden = true;
    customLangInput.value = "";

    if (syncCanonicalCheck) syncCanonicalCheck.checked = true;
    robotChecks.forEach((cb) => {
      const k = cb.dataset.robot;
      cb.checked = k === "index" || k === "follow";
    });
    themeColorPicker.value = "#4c00ff";
    themeColorHex.value = "#4c00ff";
    referrerSelect.value = DEFAULT_REFERRER;
    viewportInput.value = DEFAULT_VIEWPORT;

    if (syncOgTitleCheck) syncOgTitleCheck.checked = true;
    if (syncOgDescCheck) syncOgDescCheck.checked = true;
    ogImageInput.value = "https://www.opensign.in/assets/open%20sign%20logo.png";
    ogUrlInput.value = "";
    ogTypeSelect.value = "website";
    ogSiteNameInput.value = "Open Sign";
    ogLocaleInput.value = "en_IN";

    if (syncTwTitleCheck) syncTwTitleCheck.checked = true;
    if (syncTwDescCheck) syncTwDescCheck.checked = true;
    twCardSelect.value = "summary_large_image";
    twImageInput.value = "";
    twSiteInput.value = "@opensign_in";
    twCreatorInput.value = "@opensign_in";

    refreshAll();
    toast("Loaded sample SEO & social metadata.");
  });

  function resetGenerator() {
    titleInput.value = "";
    descInput.value = "";
    pageUrlInput.value = "";
    authorInput.value = "";
    siteNameInput.value = "";
    langSelect.value = "en";
    if (customLangWrap) customLangWrap.hidden = true;
    customLangInput.value = "";

    if (syncCanonicalCheck) syncCanonicalCheck.checked = true;
    canonicalInput.value = "";

    robotChecks.forEach((cb) => {
      const k = cb.dataset.robot;
      cb.checked = k === "index" || k === "follow";
    });

    themeColorPicker.value = DEFAULT_THEME_COLOR;
    themeColorHex.value = DEFAULT_THEME_COLOR;
    referrerSelect.value = DEFAULT_REFERRER;
    viewportInput.value = DEFAULT_VIEWPORT;

    if (syncOgTitleCheck) syncOgTitleCheck.checked = true;
    if (syncOgDescCheck) syncOgDescCheck.checked = true;
    ogTitleInput.value = "";
    ogDescInput.value = "";
    ogImageInput.value = "";
    ogUrlInput.value = "";
    ogTypeSelect.value = "website";
    ogSiteNameInput.value = "";
    ogLocaleInput.value = "";

    if (syncTwTitleCheck) syncTwTitleCheck.checked = true;
    if (syncTwDescCheck) syncTwDescCheck.checked = true;
    twCardSelect.value = "summary_large_image";
    twTitleInput.value = "";
    twDescInput.value = "";
    twImageInput.value = "";
    twSiteInput.value = "";
    twCreatorInput.value = "";

    refreshAll();
    toast("Meta Tag Generator reset to defaults.");
  }

  resetTopBtn?.addEventListener("click", resetGenerator);
  resetCodeBtn?.addEventListener("click", resetGenerator);

  refreshAll();
})();
