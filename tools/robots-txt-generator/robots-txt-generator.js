(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const MAX_UPLOAD_BYTES = 500 * 1024; // 500 KB practical limit for robots.txt
  const BOT_PRESETS = [
    { value: "*", label: "All Crawlers (*)" },
    { value: "Googlebot", label: "Googlebot" },
    { value: "Googlebot-Image", label: "Googlebot-Image" },
    { value: "Googlebot-News", label: "Googlebot-News" },
    { value: "Bingbot", label: "Bingbot" },
    { value: "Yandex", label: "Yandex" },
    { value: "Baiduspider", label: "Baiduspider" },
    { value: "DuckDuckBot", label: "DuckDuckBot" },
    { value: "GPTBot", label: "GPTBot" },
    { value: "ChatGPT-User", label: "ChatGPT-User" },
    { value: "ClaudeBot", label: "ClaudeBot" },
    { value: "PerplexityBot", label: "PerplexityBot" },
    { value: "__custom__", label: "Custom User-Agent" },
  ];

  const STANDARD_DIRECTIVES = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay"]);
  const LEGACY_DIRECTIVES = new Set(["host", "clean-param", "request-rate", "visit-time"]);

  let idSeq = 1;
  const uid = (p) => `${p}_${Date.now()}_${idSeq++}`;

  const SITE_PRESETS = {
    default: {
      note: "",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Disallow", path: "/admin/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/private/", comment: "" },
            { id: uid("rule"), type: "Allow", path: "/", comment: "" },
          ],
        },
      ],
    },
    wordpress: {
      note: "WordPress starter preset loaded. Presets are starting examples—review and customize every rule for your site.",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Disallow", path: "/wp-admin/", comment: "Block WordPress admin area" },
            { id: uid("rule"), type: "Allow", path: "/wp-admin/admin-ajax.php", comment: "Allow AJAX endpoint" },
            { id: uid("rule"), type: "Disallow", path: "/*?s=", comment: "Avoid crawling internal search queries" },
          ],
        },
      ],
    },
    shopify: {
      note: "Shopify starter example loaded. Note: Shopify manages robots.txt at the platform level—to apply custom rules on a Shopify store, edit templates/robots.txt.liquid in your Shopify theme settings.",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Disallow", path: "/admin", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/cart", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/orders", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/checkouts/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/account", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/*?*sort_by=", comment: "Limit duplicate sorted collection URLs" },
          ],
        },
      ],
    },
    ecommerce: {
      note: "E-commerce starter preset loaded. Adjust cart, checkout, account, and filter paths to match your storefront URLs.",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Disallow", path: "/admin/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/cart/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/checkout/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/account/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/search", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/*?sort=", comment: "Skip duplicate sort parameter pages" },
            { id: uid("rule"), type: "Allow", path: "/", comment: "" },
          ],
        },
      ],
    },
    blog: {
      note: "Blog starter preset loaded. Customize admin, tag, or internal search paths as needed.",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Disallow", path: "/admin/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/private/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/search/", comment: "" },
            { id: uid("rule"), type: "Disallow", path: "/*?s=", comment: "" },
            { id: uid("rule"), type: "Allow", path: "/", comment: "" },
          ],
        },
      ],
    },
    custom: {
      note: "Started with a clean custom rule builder.",
      groups: () => [
        {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [
            { id: uid("rule"), type: "Allow", path: "/", comment: "" },
          ],
        },
      ],
    },
  };

  function createInitialState() {
    return {
      websiteUrl: "https://example.com",
      websiteDomain: "example.com",
      headerComment: "Robots.txt generated with Open Sign",
      sitemaps: [{ id: uid("sm"), url: "https://example.com/sitemap.xml", autoSuggested: true }],
      groups: SITE_PRESETS.default.groups(),
      hostDirective: "",
      customDirectives: [], // { id, name, value }
      activePreset: "default",
      presetNote: "",
      previewMode: "visual", // 'visual' | 'raw'
      rawText: "",
    };
  }

  let state = createInitialState();
  let lastGeneratedText = "";

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

  /* ---------- Helpers ---------- */
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  function sanitizeSingleLine(str) {
    return String(str ?? "").replace(/[\r\n]+/g, " ").trim();
  }

  function parseHttpUrl(raw) {
    const val = String(raw ?? "").trim();
    if (!val) return { valid: false, empty: true, url: null };
    try {
      const u = new URL(val);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { valid: false, empty: false, url: null, reason: "URL must start with https:// or http://" };
      }
      if (!u.hostname || !u.hostname.includes(".")) {
        return { valid: false, empty: false, url: null, reason: "Enter a complete domain name (e.g. https://example.com)" };
      }
      return { valid: true, empty: false, url: u };
    } catch (_) {
      return { valid: false, empty: false, url: null, reason: "Malformed URL format" };
    }
  }

  function effectiveBotName(group) {
    if (group.botPreset === "__custom__") {
      return sanitizeSingleLine(group.customBot);
    }
    return group.botPreset;
  }

  /* ---------- Generate Plain-Text Robots.txt ---------- */
  function generateRobotsText() {
    const lines = [];

    const commentLines = String(state.headerComment || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    commentLines.forEach((cl) => {
      lines.push(cl.startsWith("#") ? cl : `# ${cl}`);
    });

    const webCheck = parseHttpUrl(state.websiteUrl);
    if (webCheck.valid) {
      lines.push(`# Website: ${webCheck.url.origin}`);
    } else if (state.websiteDomain.trim()) {
      lines.push(`# Website: ${sanitizeSingleLine(state.websiteDomain)}`);
    }

    if (lines.length) lines.push("");

    // User-agent groups
    state.groups.forEach((grp, gIdx) => {
      const bot = effectiveBotName(grp);
      if (bot) {
        lines.push(`User-agent: ${bot}`);
      } else {
        lines.push(`# Missing User-agent in Group #${gIdx + 1}`);
      }

      grp.rules.forEach((rule) => {
        const cmt = sanitizeSingleLine(rule.comment);
        if (cmt) lines.push(`# ${cmt}`);
        const rawPath = String(rule.path ?? "").replace(/[\r\n]+/g, "").trim();
        lines.push(`${rule.type}: ${rawPath}`.trimEnd() + (rawPath === "" ? " " : ""));
      });

      if (grp.crawlDelayEnabled) {
        const delayStr = sanitizeSingleLine(grp.crawlDelay);
        lines.push(`Crawl-delay: ${delayStr}`);
      }

      lines.push("");
    });

    // Optional Legacy Host Directive
    const hostVal = sanitizeSingleLine(state.hostDirective);
    if (hostVal) {
      lines.push(`Host: ${hostVal}`);
      lines.push("");
    }

    // Optional Custom Directives
    const activeCustoms = state.customDirectives.filter((cd) => sanitizeSingleLine(cd.name) || sanitizeSingleLine(cd.value));
    if (activeCustoms.length) {
      activeCustoms.forEach((cd) => {
        const k = sanitizeSingleLine(cd.name);
        const v = sanitizeSingleLine(cd.value);
        if (k) lines.push(`${k}: ${v}`.trimEnd());
      });
      lines.push("");
    }

    // Global Sitemap Directives (outside user-agent groups, deduplicated)
    const seenSitemaps = new Set();
    state.sitemaps.forEach((sm) => {
      const u = sanitizeSingleLine(sm.url);
      if (!u) return;
      const key = u.toLowerCase();
      if (seenSitemaps.has(key)) return;
      seenSitemaps.add(key);
      lines.push(`Sitemap: ${u}`);
    });

    // Trim trailing blank lines cleanly
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines.join("\n");
  }

  /* ---------- Comprehensive Robots.txt Validator ---------- */
  function validateRobotsContent(rawText) {
    const issues = []; // { severity: 'error' | 'warning', title: string, detail: string }
    const addIssue = (severity, title, detail) => {
      issues.push({ severity, title, detail });
    };

    const lines = String(rawText || "").split(/\r?\n/);
    let hasUserAgent = false;
    let currentBot = null;
    let ruleCount = 0;
    const seenRulesPerBot = new Map(); // bot -> Map<path, Set<type>>
    const seenSitemaps = new Set();

    const webCheck = parseHttpUrl(state.websiteUrl);
    const baseHost = (webCheck.valid ? webCheck.url.hostname : state.websiteDomain.trim()).toLowerCase().replace(/^www\./, "");

    lines.forEach((rawLine, idx) => {
      const lineNo = idx + 1;
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        addIssue("error", `Line ${lineNo}: Malformed syntax`, `"${trimmed}" is missing a colon (:) separator between directive and value.`);
        return;
      }

      const rawKey = trimmed.slice(0, colonIdx).trim();
      const key = rawKey.toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (key === "user-agent") {
        if (!val) {
          addIssue("error", `Line ${lineNo}: Empty User-agent`, "Specify a crawler name such as * or Googlebot after User-agent:.");
        } else {
          hasUserAgent = true;
          currentBot = val;
          if (!seenRulesPerBot.has(currentBot.toLowerCase())) {
            seenRulesPerBot.set(currentBot.toLowerCase(), new Map());
          }
        }
        return;
      }

      if (key === "allow" || key === "disallow") {
        ruleCount++;
        if (!currentBot) {
          addIssue("error", `Line ${lineNo}: ${rawKey} before User-agent`, "Every Allow or Disallow rule must appear under a User-agent declaration.");
        }

        if (key === "disallow" && val === "") {
          addIssue("warning", `Line ${lineNo}: Empty Disallow rule`, "An empty Disallow: directive does not block crawling (it permits crawling all paths).");
        } else if (key === "allow" && val === "") {
          addIssue("warning", `Line ${lineNo}: Empty Allow rule`, "An empty Allow: directive has no effect and can be removed.");
        } else {
          if (/^https?:\/\//i.test(val)) {
            addIssue("error", `Line ${lineNo}: Full URL used as path`, `Use a relative path starting with / instead of "${val}".`);
          } else if (!val.startsWith("/")) {
            addIssue("error", `Line ${lineNo}: Invalid path "${val}"`, "Robots.txt paths must begin with a forward slash (/).");
          }
        }

        if (currentBot && val) {
          const botKey = currentBot.toLowerCase();
          const pathMap = seenRulesPerBot.get(botKey);
          if (pathMap) {
            if (!pathMap.has(val)) pathMap.set(val, new Set());
            const types = pathMap.get(val);
            if (types.has(key)) {
              addIssue("warning", `Line ${lineNo}: Duplicate rule`, `"${rawKey}: ${val}" is repeated under User-agent: ${currentBot}.`);
            }
            const opposite = key === "allow" ? "disallow" : "allow";
            if (types.has(opposite)) {
              addIssue("warning", `Line ${lineNo}: Conflicting Allow & Disallow`, `Both Allow and Disallow target "${val}" under User-agent: ${currentBot}. Most crawlers favor Allow on exact ties, but removing ambiguity is best.`);
            }
            types.add(key);
          }
        }
        return;
      }

      if (key === "crawl-delay") {
        const num = Number(val);
        if (!val || !Number.isFinite(num) || num <= 0) {
          addIssue("error", `Line ${lineNo}: Invalid Crawl-delay`, "Crawl-delay must be a positive number of seconds (e.g. 5 or 10).");
        } else {
          addIssue("warning", `Line ${lineNo}: Crawl-delay compatibility note`, "Crawl-delay is not supported by all search engines. Google does not support the Crawl-delay directive.");
        }
        return;
      }

      if (key === "sitemap") {
        const smCheck = parseHttpUrl(val);
        if (!smCheck.valid) {
          addIssue("error", `Line ${lineNo}: Invalid Sitemap URL`, `Sitemap must be a complete http(s) URL (e.g. https://example.com/sitemap.xml).`);
        } else {
          const low = val.toLowerCase();
          if (seenSitemaps.has(low)) {
            addIssue("warning", `Line ${lineNo}: Duplicate Sitemap`, `"${val}" is listed more than once.`);
          }
          seenSitemaps.add(low);

          const smHost = smCheck.url.hostname.toLowerCase().replace(/^www\./, "");
          if (baseHost && smHost && smHost !== baseHost) {
            addIssue("warning", `Line ${lineNo}: Cross-domain Sitemap`, `Sitemap domain (${smCheck.url.hostname}) differs from website domain (${baseHost}). Cross-domain sitemaps are allowed if verified, so double-check this is intentional.`);
          }
        }
        return;
      }

      if (key === "host") {
        addIssue("warning", `Line ${lineNo}: Non-standard Host directive`, "The Host directive is legacy/non-standard, not part of the Robots Exclusion Protocol, and is ignored by Google.");
        return;
      }

      if (!STANDARD_DIRECTIVES.has(key) && !LEGACY_DIRECTIVES.has(key)) {
        addIssue("warning", `Line ${lineNo}: Unsupported directive "${rawKey}"`, "This directive is not part of the standard Robots Exclusion Protocol and will be ignored by most search engine crawlers.");
      }
    });

    if (!hasUserAgent) {
      addIssue("error", "Missing User-agent declaration", "A valid robots.txt file should contain at least one User-agent: group.");
    }

    const hasError = issues.some((i) => i.severity === "error");
    const hasWarn = issues.some((i) => i.severity === "warning");
    const overallStatus = hasError ? "error" : hasWarn ? "warning" : "valid";

    return {
      overallStatus,
      issues,
      lineCount: rawText ? lines.length : 0,
      ruleCount,
    };
  }

  /* ---------- Syntax-Highlighted Preview Renderer ---------- */
  function renderCodePreview(rawText) {
    const wrap = $("rbCodeScroll");
    if (!wrap) return;
    const lines = rawText.split("\n");

    const html = lines
      .map((line, i) => {
        const num = i + 1;
        const trimmed = line.trim();
        let contentHtml = "";

        if (!trimmed) {
          contentHtml = " ";
        } else if (trimmed.startsWith("#")) {
          contentHtml = `<span class="rt-comment">${esc(line)}</span>`;
        } else {
          const ci = line.indexOf(":");
          if (ci !== -1) {
            const k = line.slice(0, ci);
            const v = line.slice(ci);
            const kl = k.trim().toLowerCase();
            const cls =
              kl === "user-agent"
                ? "rt-ua"
                : kl === "allow"
                  ? "rt-allow"
                  : kl === "disallow"
                    ? "rt-disallow"
                    : kl === "sitemap"
                      ? "rt-sitemap"
                      : kl === "crawl-delay"
                        ? "rt-delay"
                        : "rt-custom";
            contentHtml = `<span class="${cls}">${esc(k)}</span><span class="rt-val">${esc(v)}</span>`;
          } else {
            contentHtml = `<span class="rt-val">${esc(line)}</span>`;
          }
        }

        return `<div class="rb-code-line"><span class="rb-ln">${num}</span><span class="rb-lc">${contentHtml}</span></div>`;
      })
      .join("");

    wrap.innerHTML = html;
  }

  /* ---------- Render User-Agent Groups & Rules ---------- */
  function renderGroups() {
    const container = $("rbGroupsList");
    if (!container) return;
    container.innerHTML = "";

    state.groups.forEach((grp, gIdx) => {
      const card = document.createElement("article");
      card.className = "rb-group-card";

      const botOpts = BOT_PRESETS.map(
        (b) => `<option value="${esc(b.value)}"${grp.botPreset === b.value ? " selected" : ""}>${esc(b.label)}</option>`
      ).join("");

      const head = document.createElement("div");
      head.className = "rb-group-head";
      head.innerHTML = `
        <div class="rb-group-head-row">
          <div class="rb-field">
            <label for="bot_sel_${grp.id}">User-agent Group #${gIdx + 1}</label>
            <select id="bot_sel_${grp.id}" class="rb-select" data-grp-bot="${grp.id}">${botOpts}</select>
          </div>
          <div class="rb-field" id="custom_bot_wrap_${grp.id}" ${grp.botPreset === "__custom__" ? "" : "hidden"}>
            <label for="bot_cust_${grp.id}">Custom Bot Name</label>
            <input type="text" id="bot_cust_${grp.id}" class="rb-input" placeholder="e.g. Applebot, AhrefsBot" value="${esc(grp.customBot)}" data-grp-custom="${grp.id}" />
          </div>
          <button type="button" class="rb-mini-btn danger" data-del-grp="${grp.id}" ${state.groups.length <= 1 ? "disabled" : ""}>Remove Group</button>
        </div>
      `;

      head.querySelector("[data-grp-bot]").addEventListener("change", (e) => {
        grp.botPreset = e.target.value;
        renderGroups();
        refreshPreviewAndValidation();
      });

      const custInp = head.querySelector("[data-grp-custom]");
      custInp?.addEventListener("input", (e) => {
        grp.customBot = e.target.value;
        refreshPreviewAndValidation();
      });

      head.querySelector("[data-del-grp]").addEventListener("click", () => {
        if (state.groups.length <= 1) return;
        state.groups = state.groups.filter((x) => x.id !== grp.id);
        renderGroups();
        refreshPreviewAndValidation();
        toast("Removed User-agent group.");
      });

      const body = document.createElement("div");
      body.className = "rb-group-body";

      const rulesList = document.createElement("div");
      rulesList.className = "rb-rules-list";

      grp.rules.forEach((rule, rIdx) => {
        const row = document.createElement("div");
        row.className = "rb-rule-row";
        row.innerHTML = `
          <div class="rb-rule-grid">
            <select class="rb-select" aria-label="Rule type" data-rule-type="${rule.id}">
              <option value="Disallow"${rule.type === "Disallow" ? " selected" : ""}>Disallow</option>
              <option value="Allow"${rule.type === "Allow" ? " selected" : ""}>Allow</option>
            </select>
            <input type="text" class="rb-input" placeholder="/admin/ or /*?sort=" aria-label="Website path" value="${esc(rule.path)}" data-rule-path="${rule.id}" />
            <input type="text" class="rb-input" placeholder="Optional comment" aria-label="Optional rule comment" value="${esc(rule.comment)}" data-rule-cmt="${rule.id}" />
            <div class="rb-rule-actions">
              <button type="button" class="rb-icon-mini" data-rule-up="${rule.id}" title="Move rule up" ${rIdx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="rb-icon-mini" data-rule-down="${rule.id}" title="Move rule down" ${rIdx === grp.rules.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="rb-icon-mini" data-rule-dup="${rule.id}" title="Duplicate rule">⧉</button>
              <button type="button" class="rb-icon-mini danger" data-rule-del="${rule.id}" title="Remove rule">×</button>
            </div>
          </div>
        `;

        row.querySelector("[data-rule-type]").addEventListener("change", (e) => {
          rule.type = e.target.value;
          refreshPreviewAndValidation();
        });
        row.querySelector("[data-rule-path]").addEventListener("input", (e) => {
          rule.path = e.target.value;
          refreshPreviewAndValidation();
        });
        row.querySelector("[data-rule-cmt]").addEventListener("input", (e) => {
          rule.comment = e.target.value;
          refreshPreviewAndValidation();
        });

        row.querySelector("[data-rule-up]").addEventListener("click", () => {
          if (rIdx === 0) return;
          [grp.rules[rIdx - 1], grp.rules[rIdx]] = [grp.rules[rIdx], grp.rules[rIdx - 1]];
          renderGroups();
          refreshPreviewAndValidation();
        });
        row.querySelector("[data-rule-down]").addEventListener("click", () => {
          if (rIdx >= grp.rules.length - 1) return;
          [grp.rules[rIdx + 1], grp.rules[rIdx]] = [grp.rules[rIdx], grp.rules[rIdx + 1]];
          renderGroups();
          refreshPreviewAndValidation();
        });
        row.querySelector("[data-rule-dup]").addEventListener("click", () => {
          grp.rules.splice(rIdx + 1, 0, {
            id: uid("rule"),
            type: rule.type,
            path: rule.path,
            comment: rule.comment,
          });
          renderGroups();
          refreshPreviewAndValidation();
        });
        row.querySelector("[data-rule-del]").addEventListener("click", () => {
          grp.rules = grp.rules.filter((x) => x.id !== rule.id);
          renderGroups();
          refreshPreviewAndValidation();
        });

        rulesList.appendChild(row);
      });

      const foot = document.createElement("div");
      foot.className = "rb-group-foot";
      foot.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button type="button" class="rb-mini-btn" data-add-disallow="${grp.id}">+ Add Disallow</button>
          <button type="button" class="rb-mini-btn" data-add-allow="${grp.id}">+ Add Allow</button>
        </div>
        <div class="rb-delay-row">
          <label class="rb-toggle-label">
            <input type="checkbox" data-delay-chk="${grp.id}" ${grp.crawlDelayEnabled ? "checked" : ""} />
            <span>Crawl-delay (sec)</span>
          </label>
          <input type="number" class="rb-input" style="width:82px;padding:6px 9px" min="1" step="1" value="${esc(grp.crawlDelay)}" data-delay-val="${grp.id}" ${grp.crawlDelayEnabled ? "" : "disabled"} aria-label="Crawl delay in seconds" />
        </div>
      `;

      foot.querySelector("[data-add-disallow]").addEventListener("click", () => {
        grp.rules.push({ id: uid("rule"), type: "Disallow", path: "/", comment: "" });
        renderGroups();
        refreshPreviewAndValidation();
      });
      foot.querySelector("[data-add-allow]").addEventListener("click", () => {
        grp.rules.push({ id: uid("rule"), type: "Allow", path: "/", comment: "" });
        renderGroups();
        refreshPreviewAndValidation();
      });

      const delayChk = foot.querySelector("[data-delay-chk]");
      const delayVal = foot.querySelector("[data-delay-val]");
      delayChk.addEventListener("change", () => {
        grp.crawlDelayEnabled = delayChk.checked;
        delayVal.disabled = !delayChk.checked;
        refreshPreviewAndValidation();
      });
      delayVal.addEventListener("input", () => {
        grp.crawlDelay = delayVal.value;
        refreshPreviewAndValidation();
      });

      body.append(rulesList, foot);
      card.append(head, body);
      container.appendChild(card);
    });
  }

  /* ---------- Render Sitemaps & Custom Directives ---------- */
  function renderSitemaps() {
    const list = $("rbSitemapsList");
    if (!list) return;
    list.innerHTML = "";

    state.sitemaps.forEach((sm, idx) => {
      const row = document.createElement("div");
      row.className = "rb-inline-row";
      row.innerHTML = `
        <input type="url" class="rb-input" placeholder="https://example.com/sitemap.xml" aria-label="Sitemap URL ${idx + 1}" value="${esc(sm.url)}" data-sm-id="${sm.id}" />
        <button type="button" class="rb-icon-mini danger" data-del-sm="${sm.id}" title="Remove sitemap">×</button>
      `;

      row.querySelector("[data-sm-id]").addEventListener("input", (e) => {
        sm.url = e.target.value;
        sm.autoSuggested = false;
        refreshPreviewAndValidation();
      });
      row.querySelector("[data-del-sm]").addEventListener("click", () => {
        state.sitemaps = state.sitemaps.filter((x) => x.id !== sm.id);
        renderSitemaps();
        refreshPreviewAndValidation();
      });

      list.appendChild(row);
    });
  }

  function renderCustomDirectives() {
    const list = $("rbCustomDirList");
    if (!list) return;
    list.innerHTML = "";

    state.customDirectives.forEach((cd) => {
      const row = document.createElement("div");
      row.className = "rb-inline-row";
      row.innerHTML = `
        <input type="text" class="rb-input" style="max-width:190px" placeholder="Directive (e.g. Clean-param)" value="${esc(cd.name)}" data-cd-name="${cd.id}" />
        <input type="text" class="rb-input" placeholder="Value" value="${esc(cd.value)}" data-cd-val="${cd.id}" />
        <button type="button" class="rb-icon-mini danger" data-del-cd="${cd.id}" title="Remove directive">×</button>
      `;

      row.querySelector("[data-cd-name]").addEventListener("input", (e) => {
        cd.name = e.target.value;
        refreshPreviewAndValidation();
      });
      row.querySelector("[data-cd-val]").addEventListener("input", (e) => {
        cd.value = e.target.value;
        refreshPreviewAndValidation();
      });
      row.querySelector("[data-del-cd]").addEventListener("click", () => {
        state.customDirectives = state.customDirectives.filter((x) => x.id !== cd.id);
        renderCustomDirectives();
        refreshPreviewAndValidation();
      });

      list.appendChild(row);
    });
  }

  /* ---------- Parse Uploaded robots.txt Into Visual Builder ---------- */
  function parseUploadedRobotsText(text) {
    const lines = String(text || "").split(/\r?\n/);
    const groups = [];
    const sitemaps = [];
    const customDirectives = [];
    let hostDirective = "";
    let currentGroup = null;
    let pendingComment = "";

    const ensureGroup = () => {
      if (!currentGroup) {
        currentGroup = {
          id: uid("grp"),
          botPreset: "*",
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [],
        };
        groups.push(currentGroup);
      }
      return currentGroup;
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("#")) {
        pendingComment = trimmed.replace(/^#+\s*/, "");
        continue;
      }

      const ci = trimmed.indexOf(":");
      if (ci === -1) continue;
      const key = trimmed.slice(0, ci).trim().toLowerCase();
      const rawKey = trimmed.slice(0, ci).trim();
      const val = trimmed.slice(ci + 1).trim();

      if (key === "user-agent") {
        const known = BOT_PRESETS.find((b) => b.value.toLowerCase() === val.toLowerCase() && b.value !== "__custom__");
        currentGroup = {
          id: uid("grp"),
          botPreset: known ? known.value : "__custom__",
          customBot: known ? "" : val,
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [],
        };
        groups.push(currentGroup);
        pendingComment = "";
      } else if (key === "allow" || key === "disallow") {
        const g = ensureGroup();
        g.rules.push({
          id: uid("rule"),
          type: key === "allow" ? "Allow" : "Disallow",
          path: val,
          comment: pendingComment,
        });
        pendingComment = "";
      } else if (key === "crawl-delay") {
        const g = ensureGroup();
        g.crawlDelayEnabled = true;
        g.crawlDelay = val || "10";
        pendingComment = "";
      } else if (key === "sitemap") {
        sitemaps.push({ id: uid("sm"), url: val, autoSuggested: false });
        pendingComment = "";
      } else if (key === "host") {
        hostDirective = val;
        pendingComment = "";
      } else {
        customDirectives.push({ id: uid("cd"), name: rawKey, value: val });
        pendingComment = "";
      }
    }

    if (groups.length) state.groups = groups;
    if (sitemaps.length) state.sitemaps = sitemaps;
    state.hostDirective = hostDirective;
    state.customDirectives = customDirectives;
  }

  /* ---------- Refresh Preview & Validation ---------- */
  function refreshPreviewAndValidation() {
    if (state.previewMode === "visual") {
      lastGeneratedText = generateRobotsText();
      const rawEditor = $("rbRawEditor");
      if (rawEditor) rawEditor.value = lastGeneratedText;
    } else {
      lastGeneratedText = $("rbRawEditor").value;
    }

    renderCodePreview(lastGeneratedText);

    const val = validateRobotsContent(lastGeneratedText);
    $("rbLineCount").textContent = `${val.lineCount} ${val.lineCount === 1 ? "line" : "lines"}`;
    $("rbRuleCount").textContent = `${val.ruleCount} ${val.ruleCount === 1 ? "rule" : "rules"}`;

    const badge = $("rbValBadge");
    badge.dataset.state = val.overallStatus;
    badge.textContent =
      val.overallStatus === "valid"
        ? "Valid"
        : val.overallStatus === "warning"
          ? `Warning (${val.issues.length})`
          : `Error (${val.issues.filter((i) => i.severity === "error").length})`;

    const list = $("rbValList");
    list.innerHTML = "";
    if (!val.issues.length) {
      const li = document.createElement("li");
      li.className = "rb-val-item";
      li.innerHTML = `<strong>No syntax or rule issues detected</strong>Your robots.txt syntax follows standard Robots Exclusion Protocol formatting.`;
      list.appendChild(li);
    } else {
      val.issues.forEach((iss) => {
        const li = document.createElement("li");
        li.className = `rb-val-item is-${iss.severity}`;
        li.innerHTML = `<strong>${esc(iss.title)}</strong>${esc(iss.detail)}`;
        list.appendChild(li);
      });
    }

    // Website URL hint
    const webCheck = parseHttpUrl(state.websiteUrl);
    const webInput = $("rbWebsiteUrl");
    const webHint = $("rbWebsiteUrlHint");
    webInput.classList.toggle("is-invalid", !webCheck.empty && !webCheck.valid);
    if (!webCheck.empty && !webCheck.valid) {
      webHint.className = "rb-hint is-error";
      webHint.textContent = webCheck.reason;
    } else {
      webHint.className = "rb-hint";
      webHint.textContent = "Entering a website URL automatically suggests your domain and /sitemap.xml URL.";
    }

    // Preset note
    const pNote = $("rbPresetNote");
    if (state.presetNote) {
      pNote.textContent = state.presetNote;
      pNote.hidden = false;
    } else {
      pNote.hidden = true;
    }
  }

  function syncTopInputs() {
    $("rbWebsiteUrl").value = state.websiteUrl;
    $("rbWebsiteDomain").value = state.websiteDomain;
    $("rbHeaderComment").value = state.headerComment;
    $("rbHostDirective").value = state.hostDirective;
    document.querySelectorAll(".rb-preset-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === state.activePreset);
    });
  }

  function renderAll() {
    syncTopInputs();
    renderGroups();
    renderSitemaps();
    renderCustomDirectives();
    refreshPreviewAndValidation();
  }

  /* ---------- Event Wiring ---------- */
  function init() {
    // Website URL -> auto-extract domain & suggest sitemap.xml
    $("rbWebsiteUrl").addEventListener("input", (e) => {
      state.websiteUrl = e.target.value;
      const check = parseHttpUrl(state.websiteUrl);
      if (check.valid) {
        state.websiteDomain = check.url.hostname;
        $("rbWebsiteDomain").value = state.websiteDomain;
        const suggested = `${check.url.origin}/sitemap.xml`;
        if (state.sitemaps.length === 0) {
          state.sitemaps.push({ id: uid("sm"), url: suggested, autoSuggested: true });
          renderSitemaps();
        } else if (state.sitemaps[0].autoSuggested) {
          state.sitemaps[0].url = suggested;
          renderSitemaps();
        }
      }
      refreshPreviewAndValidation();
    });

    $("rbWebsiteDomain").addEventListener("input", (e) => {
      state.websiteDomain = e.target.value;
      refreshPreviewAndValidation();
    });

    $("rbHeaderComment").addEventListener("input", (e) => {
      state.headerComment = e.target.value;
      refreshPreviewAndValidation();
    });

    $("rbHostDirective").addEventListener("input", (e) => {
      state.hostDirective = e.target.value;
      refreshPreviewAndValidation();
    });

    // Quick Bot Chips: add a new dedicated group for that crawler
    document.querySelectorAll(".rb-bot-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const bot = chip.dataset.addBot;
        if (state.previewMode === "raw") setPreviewMode("visual");
        state.groups.push({
          id: uid("grp"),
          botPreset: bot === "__custom__" ? "__custom__" : bot,
          customBot: "",
          crawlDelayEnabled: false,
          crawlDelay: "10",
          rules: [{ id: uid("rule"), type: "Disallow", path: "/", comment: "" }],
        });
        renderGroups();
        refreshPreviewAndValidation();
        toast(`Added ${bot === "__custom__" ? "Custom" : bot} crawler group.`);
      });
    });

    // Add User-agent Group button
    $("rbAddGroupBtn").addEventListener("click", () => {
      if (state.previewMode === "raw") setPreviewMode("visual");
      state.groups.push({
        id: uid("grp"),
        botPreset: "Googlebot",
        customBot: "",
        crawlDelayEnabled: false,
        crawlDelay: "10",
        rules: [{ id: uid("rule"), type: "Allow", path: "/", comment: "" }],
      });
      renderGroups();
      refreshPreviewAndValidation();
    });

    // Add Sitemap button
    $("rbAddSitemapBtn").addEventListener("click", () => {
      const check = parseHttpUrl(state.websiteUrl);
      const base = check.valid ? check.url.origin : "https://example.com";
      state.sitemaps.push({ id: uid("sm"), url: `${base}/sitemap-${state.sitemaps.length + 1}.xml`, autoSuggested: false });
      renderSitemaps();
      refreshPreviewAndValidation();
    });

    // Add Custom Directive button
    $("rbAddCustomDirBtn").addEventListener("click", () => {
      state.customDirectives.push({ id: uid("cd"), name: "", value: "" });
      renderCustomDirectives();
    });

    // Platform Presets
    document.querySelectorAll(".rb-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.preset;
        const p = SITE_PRESETS[key];
        if (!p) return;
        if (state.previewMode === "raw") setPreviewMode("visual");
        state.activePreset = key;
        state.presetNote = p.note;
        state.groups = p.groups();
        renderAll();
        toast(`Loaded ${btn.textContent} preset.`);
      });
    });

    // Preview Mode Toggle (Visual Builder vs Raw Editor)
    function setPreviewMode(mode) {
      state.previewMode = mode;
      document.querySelectorAll("[data-prev-mode]").forEach((b) => {
        const on = b.dataset.prevMode === mode;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
      });
      $("rbCodeScroll").hidden = mode !== "visual";
      $("rbRawEditor").hidden = mode !== "raw";
      if (mode === "raw") {
        $("rbRawEditor").value = lastGeneratedText;
      }
      refreshPreviewAndValidation();
    }

    document.querySelectorAll("[data-prev-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setPreviewMode(btn.dataset.prevMode));
    });

    $("rbRawEditor").addEventListener("input", () => {
      state.previewMode = "raw";
      refreshPreviewAndValidation();
    });

    // Upload Existing robots.txt / .txt File (100% Local)
    $("rbUploadInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;

      if (!/\.txt$/i.test(f.name || "") && f.type && f.type !== "text/plain") {
        toast("Please upload a plain-text .txt or robots.txt file.", "error");
        return;
      }

      if (f.size > MAX_UPLOAD_BYTES) {
        toast(`"${f.name}" is larger than 500 KB. Search engines typically enforce a 500 KiB robots.txt limit.`, "error");
        return;
      }

      try {
        const ab = await f.arrayBuffer();
        const bytes = new Uint8Array(ab);
        // Detect NUL bytes indicating binary / unsupported encoding
        for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
          if (bytes[i] === 0) {
            toast("Uploaded file appears to contain binary data or unsupported encoding.", "error");
            return;
          }
        }
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        parseUploadedRobotsText(text);
        state.activePreset = "custom";
        state.presetNote = `Loaded "${f.name}" locally. Edit rules in the builder or switch to Raw Edit mode.`;
        renderAll();
        $("rbRawEditor").value = text;
        toast(`Loaded ${f.name} locally.`);
      } catch (_) {
        toast("Could not read the uploaded file.", "error");
      }
    });

    // Copy to Clipboard
    $("rbCopyBtn").addEventListener("click", async () => {
      if (!lastGeneratedText) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(lastGeneratedText);
        } else {
          const ta = document.createElement("textarea");
          ta.value = lastGeneratedText;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        const btn = $("rbCopyBtn");
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        toast("robots.txt copied to clipboard.");
        setTimeout(() => {
          btn.textContent = orig;
        }, 1800);
      } catch (_) {
        toast("Unable to copy to clipboard. Please copy from Raw Edit mode.", "error");
      }
    });

    // Download Plain-Text UTF-8 robots.txt
    $("rbDownloadBtn").addEventListener("click", () => {
      const cleanUtf8 = lastGeneratedText.replace(/\r\n/g, "\n") + "\n";
      const blob = new Blob([cleanUtf8], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "robots.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Downloaded robots.txt");
    });

    // Reset Generator
    const doReset = () => {
      state = createInitialState();
      setPreviewMode("visual");
      renderAll();
      toast("Robots.txt Generator reset.");
    };
    $("rbResetTopBtn").addEventListener("click", doReset);
    $("rbResetPreviewBtn").addEventListener("click", doReset);

    renderAll();
  }

  init();
})();
