(() => {
  "use strict";

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const SCALE = 1.4;
  const MAX_BYTES = 50 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  let pdfBytes = null;
  let fileName = "document.pdf";
  let lastSignedBlobUrl = null;
  let lastSignedName = "document-signed.pdf";
  let signatureDataUrl = null;
  let sigSize = { w: 3, h: 1 };
  let armed = null; // 'sig' | 'text' | 'date' | null
  let items = [];
  let nextId = 1;
  let selectedId = null;
  let loading = false;
  let pageEls = [];
  const nodes = new Map();

  const editorBtns = ["sigBtn", "addSigBtn", "addTextBtn", "addDateBtn", "smartSignBtn", "downloadBtn"].map($).filter(Boolean);
  const setEnabled = (on) => editorBtns.forEach((b) => (b.disabled = !on));

  /* ---------- Views, Toast & Modals ---------- */
  const views = {
    home: $("homeView"),
    processing: $("processView"),
    editor: $("editorView"),
  };

  function setView(name) {
    document.body.dataset.view = name;
    for (const [key, el] of Object.entries(views)) {
      const show = key === name;
      el.hidden = !show;
      if (show) {
        el.classList.remove("enter");
        void el.offsetWidth;
        el.classList.add("enter");
      }
    }
    window.scrollTo(0, 0);
    views[name].querySelector("[data-focus]")?.focus({ preventScroll: true });
  }

  let toastTimer;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.dataset.kind = kind || "";
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
  }

  function closeDlg(d) {
    return new Promise((resolve) => {
      if (!d.open) return resolve();
      if (reduceMotion.matches) {
        d.close();
        return resolve();
      }
      d.classList.add("closing");
      const done = () => {
        if (!d.classList.contains("closing")) return;
        d.classList.remove("closing");
        d.close();
        resolve();
      };
      d.addEventListener("animationend", done, { once: true });
      setTimeout(done, 300);
    });
  }

  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDlg(d);
    })
  );

  /* ---------- Processing Status ---------- */
  const statusEl = $("processStatus");
  const detailEl = $("processDetail");

  function setStatus(text, detail) {
    if (text != null && statusEl.textContent !== text) {
      statusEl.textContent = text;
      statusEl.classList.remove("swap");
      void statusEl.offsetWidth;
      statusEl.classList.add("swap");
    }
    if (detail != null) detailEl.textContent = detail;
  }

  const fmtSize = (b) =>
    b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

  /* ---------- Contextual Guidance ---------- */
  function updateHint() {
    const verb = coarse.matches ? "Tap" : "Click";
    let msg = "";
    if (pdfBytes) {
      if (armed) {
        const label = { sig: "signature", text: "text", date: "date" }[armed];
        msg = `${verb} anywhere on the page to place your ${label}.`;
      } else if (!items.length) {
        msg = signatureDataUrl
          ? "Select Place signature, or add text or a date."
          : "Select Create signature to begin.";
      }
    }
    $("hint").textContent = msg;
  }

  /* ---------- Load & Render PDF ---------- */
  const isPdfFile = (f) => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));

  function closeDocument() {
    window.dispatchEvent(new CustomEvent("opensign:document-closed"));
    pdfBytes = null;
    items = [];
    nodes.clear();
    pageEls = [];
    pagesEl.innerHTML = "";
    selectedId = null;
    arm(null);
    select(null);
    setEnabled(false);
    $("pager").hidden = true;
    if (lastSignedBlobUrl) {
      URL.revokeObjectURL(lastSignedBlobUrl);
      lastSignedBlobUrl = null;
    }
  }

  async function loadFile(file) {
    if (!file || loading) return;
    if (!isPdfFile(file)) {
      return toast("Please choose a valid PDF file (.pdf).", "error");
    }
    if (file.size > MAX_BYTES) {
      return toast("File exceeds the 50 MB limit.", "error");
    }

    loading = true;
    const dz = $("dropzone");
    dz.classList.add("is-reacting");
    if (!reduceMotion.matches) await sleep(180);
    dz.classList.remove("is-reacting");

    closeDocument();
    setView("processing");
    setStatus("Opening your document...", `${file.name} · ${fmtSize(file.size)}`);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!reduceMotion.matches) await sleep(220);

      setStatus("Preparing your pages...", `${file.name} · ${fmtSize(file.size)}`);
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(null, `${file.name} · Page ${i} of ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });
        const gutter = window.innerWidth < 640 ? 24 : 96;
        const availableWidth = Math.max(280, document.documentElement.clientWidth - gutter);
        const pageScale = Math.min(SCALE, availableWidth / baseViewport.width);
        const vp = page.getViewport({ scale: pageScale });

        const wrap = document.createElement("div");
        wrap.dataset.scale = pageScale;
        wrap.dataset.baseW = baseViewport.width;
        wrap.dataset.baseH = baseViewport.height;
        wrap.className = "page";
        wrap.dataset.page = i - 1;
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", `Page ${i} of ${pdf.numPages}`);
        wrap.style.width = vp.width + "px";
        wrap.style.height = vp.height + "px";

        const canvas = document.createElement("canvas");
        canvas.className = "render";
        const outputScale = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.ceil(vp.width * outputScale);
        canvas.height = Math.ceil(vp.height * outputScale);
        canvas.style.width = vp.width + "px";
        canvas.style.height = vp.height + "px";

        wrap.appendChild(canvas);
        pagesEl.appendChild(wrap);
        pageEls.push(wrap);

        await page.render({
          canvasContext: canvas.getContext("2d", { alpha: false }),
          viewport: vp,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;

        wrap.addEventListener("click", (ev) => onPageClick(ev, wrap));
      }

      pdfBytes = bytes;
      fileName = file.name;
      items = [];
      setEnabled(true);
      $("addSigBtn").disabled = !signatureDataUrl;
      $("docName").textContent = file.name;
      $("docPages").textContent = pdf.numPages === 1 ? "1 page" : `${pdf.numPages} pages`;
      pdf.destroy?.();

      setStatus("Ready to sign.", `${file.name} · ${pdf.numPages === 1 ? "1 page" : `${pdf.numPages} pages`}`);
      if (!reduceMotion.matches) await sleep(340);

      setView("editor");
      updateHint();
      initPager();
      window.dispatchEvent(
        new CustomEvent("opensign:document-loaded", {
          detail: { fileName: file.name, pageCount: pageEls.length },
        })
      );
    } catch (err) {
      console.error(err);
      closeDocument();
      setView("home");
      toast(
        err && err.name === "PasswordException"
          ? "This PDF is password-protected. Please unlock it and try again."
          : "Unable to open this PDF. The file may be corrupted or unsupported.",
        "error"
      );
    } finally {
      loading = false;
    }
  }

  $("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    loadFile(file);
  });

  /* ---------- Drag and Drop ---------- */
  const dz = $("dropzone");
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  let dzDepth = 0;

  dz.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    dzDepth++;
    dz.classList.add("is-over");
  });

  dz.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dzDepth = Math.max(0, dzDepth - 1);
    if (!dzDepth) dz.classList.remove("is-over");
  });

  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = document.body.dataset.view === "home" ? "copy" : "none";
  });

  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dzDepth = 0;
    dz.classList.remove("is-over");
    if (document.body.dataset.view !== "home") return;
    const files = Array.from(e.dataTransfer.files);
    loadFile(files.find(isPdfFile) || files[0]);
  });

  /* ---------- Multi-page Navigation ---------- */
  let currentPage = 0;

  function updatePager() {
    if (!pageEls.length) return;
    const line = window.innerHeight * 0.4;
    let cur = 0;
    for (let i = 0; i < pageEls.length; i++) {
      if (pageEls[i].getBoundingClientRect().top <= line) cur = i;
      else break;
    }
    currentPage = cur;
    $("pageCount").textContent = `${cur + 1} / ${pageEls.length}`;
    $("pagePrev").disabled = cur === 0;
    $("pageNext").disabled = cur === pageEls.length - 1;
  }

  function initPager() {
    $("pager").hidden = pageEls.length < 2;
    updatePager();
  }

  let pagerTick = false;
  window.addEventListener(
    "scroll",
    () => {
      if (pagerTick || document.body.dataset.view !== "editor") return;
      pagerTick = true;
      requestAnimationFrame(() => {
        pagerTick = false;
        updatePager();
      });
    },
    { passive: true }
  );

  const goToPage = (i) =>
    pageEls[clamp(i, 0, pageEls.length - 1)]?.scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
      block: "start",
    });

  $("pagePrev").onclick = () => goToPage(currentPage - 1);
  $("pageNext").onclick = () => goToPage(currentPage + 1);

  /* ---------- Tool Selection & Active States ---------- */
  const armMap = { sig: "addSigBtn", text: "addTextBtn", date: "addDateBtn" };

  function arm(kind) {
    armed = armed === kind ? null : kind;
    Object.values(armMap).forEach((id) => {
      $(id).classList.remove("armed");
      $(id).setAttribute("aria-pressed", "false");
    });
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("placing", !!armed));
    if (armed) {
      $(armMap[armed]).classList.add("armed");
      $(armMap[armed]).setAttribute("aria-pressed", "true");
    }
    updateHint();
  }

  $("addSigBtn").onclick = () => arm("sig");
  $("addTextBtn").onclick = () => arm("text");
  $("addDateBtn").onclick = () => arm("date");

  function select(id) {
    selectedId = id;
    nodes.forEach((n, k) => n.el.classList.toggle("selected", k === id));
    const delBtn = $("deleteBtn");
    delBtn.hidden = id == null;
    delBtn.disabled = id == null;
  }

  function removeItem(id) {
    items = items.filter((i) => i.id !== id);
    const n = nodes.get(id);
    nodes.delete(id);
    if (n) {
      n.el.classList.add("leaving");
      setTimeout(() => n.el.remove(), reduceMotion.matches ? 0 : 160);
    }
    if (selectedId === id) select(null);
    updateHint();
  }

  $("deleteBtn").onclick = () => selectedId != null && removeItem(selectedId);

  function onPageClick(ev, wrap) {
    if (ev.target.closest(".item")) return;
    if (!armed) {
      select(null);
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const kind = armed;
    const pw = wrap.clientWidth;
    const ph = wrap.clientHeight;

    const item = {
      id: nextId++,
      page: +wrap.dataset.page,
      scale: +wrap.dataset.scale,
      kind,
      x,
      y,
    };

    if (kind === "sig") {
      item.ratio = sigSize.w / sigSize.h;
      item.w = Math.min(180, pw * 0.5);
      item.h = item.w / item.ratio;
      if (item.h > 90) {
        item.h = 90;
        item.w = item.h * item.ratio;
      }
      item.data = signatureDataUrl;
    } else if (kind === "date") {
      item.w = 140;
      item.h = 28;
      item.text = new Date().toLocaleDateString("en-GB");
    } else {
      item.w = 200;
      item.h = 28;
      item.text = "Text";
    }

    item.x = clamp(x - item.w / 2, 0, pw - item.w);
    item.y = clamp(y - item.h / 2, 0, ph - item.h);
    items.push(item);
    mountItem(item, wrap);
    arm(null);
    select(item.id);

    if (kind === "text") {
      const t = nodes.get(item.id).el.querySelector(".txt");
      t.focus();
      document.getSelection().selectAllChildren(t);
    }
  }

  /* ---------- Interactive Placed Elements (Move, Resize, Edit, Delete) ---------- */
  function mountItem(item, wrap) {
    const el = document.createElement("div");
    el.className = "item";
    el.tabIndex = 0;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", { sig: "Signature", text: "Text", date: "Date" }[item.kind]);

    const inner = document.createElement("div");
    inner.style.cssText = "width:100%;height:100%";
    let txt = null;

    if (item.kind === "sig") {
      const img = document.createElement("img");
      img.src = item.data;
      img.alt = "";
      inner.appendChild(img);
    } else {
      txt = document.createElement("div");
      txt.className = "txt";
      txt.contentEditable = "true";
      txt.spellcheck = false;
      txt.setAttribute("role", "textbox");
      txt.setAttribute("aria-label", item.kind === "date" ? "Date text" : "Text");
      txt.textContent = item.text;
      txt.addEventListener("input", () => (item.text = txt.textContent));
      txt.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          txt.blur();
        }
      });
      txt.addEventListener("paste", (e) => {
        e.preventDefault();
        const s = (e.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ");
        document.execCommand("insertText", false, s);
      });
      inner.appendChild(txt);
    }

    el.appendChild(inner);

    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", "Delete element");
    del.onclick = (e) => {
      e.stopPropagation();
      removeItem(item.id);
    };

    const rz = document.createElement("div");
    rz.className = "rz";
    el.append(del, rz);
    wrap.appendChild(el);

    const place = () => {
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
      el.style.width = item.w + "px";
      el.style.height = item.h + "px";
      if (item.kind !== "sig") {
        el.querySelector(".txt").style.fontSize = item.h * 0.6 + "px";
      }
    };
    place();
    nodes.set(item.id, { el, place });

    const startDrag = (e, mode) => {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      select(item.id);

      const sx = e.clientX;
      const sy = e.clientY;
      const o = { x: item.x, y: item.y, w: item.w, h: item.h };
      const pw = wrap.clientWidth;
      const ph = wrap.clientHeight;
      let moved = false;

      const move = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;

        if (mode === "move") {
          item.x = clamp(o.x + dx, 0, pw - item.w);
          item.y = clamp(o.y + dy, 0, ph - item.h);
        } else if (item.kind === "sig") {
          let w = Math.max(40, Math.min(o.w + dx, pw - item.x));
          let h = w / item.ratio;
          if (item.y + h > ph) {
            h = ph - item.y;
            w = h * item.ratio;
          }
          item.w = w;
          item.h = h;
        } else {
          item.w = Math.max(30, Math.min(o.w + dx, pw - item.x));
          item.h = Math.max(16, Math.min(o.h + dy, ph - item.y));
        }
        place();
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (mode === "move" && !moved && txt && e.target.closest?.(".txt")) {
          txt.focus();
          document.getSelection().selectAllChildren(txt);
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".del")) return;
      if (txt && document.activeElement === txt && e.target.closest(".txt")) {
        e.stopPropagation();
        return;
      }
      startDrag(e, "move");
    });

    rz.addEventListener("pointerdown", (e) => startDrag(e, "resize"));
    el.addEventListener("focus", () => select(item.id));
  }

  /* ---------- Keyboard Controls ---------- */
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.view !== "editor" || document.querySelector("dialog[open]")) return;
    const editing = e.target.closest?.('[contenteditable="true"], input, textarea');

    if (e.key === "Escape") {
      if (editing) e.target.blur();
      else if (armed) arm(null);
      else select(null);
      return;
    }

    if (editing || selectedId == null) return;
    const item = items.find((i) => i.id === selectedId);
    const n = nodes.get(selectedId);
    if (!item || !n) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeItem(selectedId);
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];

    if (!delta) return;
    e.preventDefault();
    const wrap = n.el.parentElement;
    item.x = clamp(item.x + delta[0], 0, wrap.clientWidth - item.w);
    item.y = clamp(item.y + delta[1], 0, wrap.clientHeight - item.h);
    n.place();
  });

  /* ---------- Signature Creation Modal ---------- */
  const dlg = $("sigDialog");
  const pad = $("pad");
  const pctx = pad.getContext("2d");
  const typedPreview = $("typedPreview");
  const imgPreview = $("imgPreview");

  let activeTab = "draw";
  let drawing = false;
  const strokes = [];
  let hasImage = false;
  let typedFont = 0;
  let typedReady = false;
  let typedToken = 0;

  const FONTS = [
    { name: "Dancing Script", weight: 600 },
    { name: "Caveat", weight: 600 },
    { name: "Sacramento", weight: 400 },
    { name: "Homemade Apple", weight: 400 },
  ];

  function updateSave() {
    const ok = {
      draw: strokes.length > 0,
      type: typedReady,
      image: hasImage,
    }[activeTab];
    $("saveSig").disabled = !ok;
  }

  $("sigBtn").onclick = () => {
    dlg.showModal();
    updateSave();
  };
  $("cancelSig").onclick = () => closeDlg(dlg);
  $("cancelSigTop").onclick = () => closeDlg(dlg);

  let downOnBackdrop = false;
  dlg.addEventListener("pointerdown", (e) => (downOnBackdrop = e.target === dlg));
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg && downOnBackdrop) closeDlg(dlg);
  });

  const tabBtns = Array.from(dlg.querySelectorAll(".tabs button"));

  function showTab(name) {
    activeTab = name;
    tabBtns.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    ["draw", "type", "image"].forEach((t) => $("tab-" + t).classList.toggle("hidden", t !== name));
    updateSave();
    if (name === "type") $("typedName").focus({ preventScroll: true });
  }

  tabBtns.forEach((b, i) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const nb = tabBtns[(i + d + tabBtns.length) % tabBtns.length];
      nb.focus();
      showTab(nb.dataset.tab);
    });
  });

  // --- Method 1: Draw
  const INK = "#141413";
  pctx.lineWidth = 4.5;
  pctx.lineCap = "round";
  pctx.lineJoin = "round";
  pctx.strokeStyle = INK;
  pctx.fillStyle = INK;

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pos = (e) => {
    const r = pad.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * pad.width) / r.width,
      y: ((e.clientY - r.top) * pad.height) / r.height,
    };
  };

  function drawStroke(pts) {
    if (pts.length === 1) {
      pctx.beginPath();
      pctx.arc(pts[0].x, pts[0].y, pctx.lineWidth / 2, 0, Math.PI * 2);
      pctx.fill();
      return;
    }
    pctx.beginPath();
    pctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      pctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    const last = pts[pts.length - 1];
    pctx.lineTo(last.x, last.y);
    pctx.stroke();
  }

  function drawTail(pts) {
    const n = pts.length;
    pctx.beginPath();
    if (n === 2) {
      pctx.moveTo(pts[0].x, pts[0].y);
      pctx.lineTo(pts[1].x, pts[1].y);
    } else {
      const a = mid(pts[n - 3], pts[n - 2]);
      const b = mid(pts[n - 2], pts[n - 1]);
      pctx.moveTo(a.x, a.y);
      pctx.quadraticCurveTo(pts[n - 2].x, pts[n - 2].y, b.x, b.y);
    }
    pctx.stroke();
  }

  function redrawPad() {
    pctx.clearRect(0, 0, pad.width, pad.height);
    strokes.forEach(drawStroke);
  }

  pad.addEventListener("pointerdown", (e) => {
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    const s = [pos(e)];
    strokes.push(s);
    drawStroke(s);
    updateSave();
  });

  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const s = strokes[strokes.length - 1];
    const p = pos(e);
    const l = s[s.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) < 1.5) return;
    s.push(p);
    drawTail(s);
  });

  const endDraw = () => {
    if (!drawing) return;
    drawing = false;
    redrawPad();
  };
  ["pointerup", "pointercancel"].forEach((ev) => pad.addEventListener(ev, endDraw));

  // --- Method 2: Type
  const fontList = $("fontList");
  FONTS.forEach((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "font-opt";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === 0));
    b.style.fontFamily = `"${f.name}", cursive`;
    b.style.fontWeight = f.weight;
    b.textContent = "Your signature";
    b.addEventListener("click", () => {
      typedFont = i;
      fontList
        .querySelectorAll(".font-opt")
        .forEach((x, j) => x.setAttribute("aria-checked", String(j === i)));
      renderTyped();
    });
    fontList.appendChild(b);
  });

  async function renderTyped() {
    const text = $("typedName").value;
    const token = ++typedToken;
    const c = typedPreview.getContext("2d");
    fontList.querySelectorAll(".font-opt").forEach((x) => (x.textContent = text.trim() || "Your signature"));

    if (!text.trim()) {
      c.clearRect(0, 0, typedPreview.width, typedPreview.height);
      typedReady = false;
      updateSave();
      return;
    }

    const f = FONTS[typedFont];
    try {
      await document.fonts.load(`${f.weight} 64px "${f.name}"`, text);
    } catch (_) {}
    if (token !== typedToken) return;

    const maxW = typedPreview.width - 60;
    let size = 120;
    const fontStr = (s) => `${f.weight} ${s}px "${f.name}", "Brush Script MT", "Segoe Script", cursive`;
    c.font = fontStr(size);
    const w = c.measureText(text).width;
    if (w > maxW) size = Math.max(24, Math.floor((size * maxW) / w));

    c.clearRect(0, 0, typedPreview.width, typedPreview.height);
    c.font = fontStr(size);
    c.fillStyle = INK;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, typedPreview.width / 2, typedPreview.height / 2);
    typedReady = true;
    updateSave();
  }
  $("typedName").addEventListener("input", renderTyped);

  // --- Method 3: Upload Image
  $("sigImage").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;

    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const c = imgPreview.getContext("2d");
      c.clearRect(0, 0, imgPreview.width, imgPreview.height);
      const r = Math.min(imgPreview.width / img.width, imgPreview.height / img.height);
      const w = img.width * r;
      const h = img.height * r;
      c.drawImage(img, (imgPreview.width - w) / 2, (imgPreview.height - h) / 2, w, h);

      // Remove near-white paper backgrounds from uploaded photos so signatures blend cleanly onto PDFs
      const imgData = c.getImageData(0, 0, imgPreview.width, imgPreview.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
          data[i + 3] = 0;
        }
      }
      c.putImageData(imgData, 0, 0);

      hasImage = true;
      URL.revokeObjectURL(url);
      updateSave();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("Unable to read that image file.", "error");
    };
    img.src = url;
  });

  // Single Clear action for active signature method
  $("clearSig").onclick = () => {
    if (activeTab === "draw") {
      strokes.length = 0;
      redrawPad();
    } else if (activeTab === "type") {
      $("typedName").value = "";
      renderTyped();
    } else if (activeTab === "image") {
      imgPreview.getContext("2d").clearRect(0, 0, imgPreview.width, imgPreview.height);
      hasImage = false;
    }
    updateSave();
  };

  const trim = (canvas) => {
    const c = canvas.getContext("2d");
    const { width: w, height: h } = canvas;
    const d = c.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return null;

    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  };

  $("saveSig").onclick = async () => {
    const src = { draw: pad, type: typedPreview, image: imgPreview }[activeTab];
    const out = trim(src);
    if (!out) {
      toast("Please create or upload a signature first.", "error");
      return;
    }

    signatureDataUrl = out.toDataURL("image/png");
    sigSize = { w: out.width, h: out.height };
    $("addSigBtn").disabled = !pdfBytes;

    const thumb = $("sigThumb");
    thumb.src = signatureDataUrl;
    thumb.hidden = false;
    $("addSigBtn").classList.add("has-sig");

    await closeDlg(dlg);
    const handledBySmartSign = window.__openSignBridge?.notifySignatureSaved?.();
    if (pdfBytes && !handledBySmartSign) {
      if (armed !== "sig") arm("sig");
      else updateHint();
    }
  };

  /* ---------- Navigation & Leave Confirmation ---------- */
  const leaveDlg = $("leaveDialog");

  function goHome() {
    closeDocument();
    setView("home");
  }

  document.querySelectorAll("[data-nav='home']").forEach((a) =>
    a.addEventListener("click", (e) => {
      const view = document.body.dataset.view;
      if (view === "processing") {
        e.preventDefault();
        return;
      }
      if (view === "home") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
        return;
      }
      e.preventDefault();
      if (!items.length) return goHome();
      leaveDlg.showModal();
    })
  );

  $("leaveCancel").onclick = () => closeDlg(leaveDlg);
  $("leaveConfirm").onclick = async () => {
    await closeDlg(leaveDlg);
    goHome();
  };

  window.addEventListener("beforeunload", (e) => {
    if (items.length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- Export & Satisfying Download Experience ---------- */
  const dlBtn = $("downloadBtn");
  const downloadDlg = $("downloadDialog");

  function setDl(state, label) {
    dlBtn.dataset.state = state;
    $("dlLabel").textContent = label;
  }

  function triggerBlobDownload(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  dlBtn.onclick = async () => {
    if (!items.length) {
      toast("Place a signature, text, or date on your document first.");
      return;
    }
    if (dlBtn.dataset.state === "busy") return;

    setDl("busy", "Preparing...");
    try {
      const doc = await PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();

      const mapper = window.__openSignCoordMapper;
      for (const it of items) {
        const page = pages[it.page];
        const wrap = pageEls[it.page];

        if (mapper && wrap) {
          const placed = mapper.domRectToPdfLib(it, page, wrap.clientWidth, wrap.clientHeight, PDFLib.degrees);
          if (it.kind === "sig") {
            const png = await doc.embedPng(it.data);
            page.drawImage(png, {
              x: placed.x,
              y: placed.y,
              width: placed.width,
              height: placed.height,
              rotate: placed.rotate,
            });
          } else {
            page.drawText(it.text || "", {
              x: placed.textX,
              y: placed.textY,
              size: placed.fontSize,
              font,
              color: rgb(0, 0, 0),
              rotate: placed.rotate,
            });
          }
          continue;
        }

        const { height } = page.getSize();
        const pageScale = it.scale || SCALE;
        const x = it.x / pageScale;
        const w = it.w / pageScale;
        const h = it.h / pageScale;
        const y = height - it.y / pageScale - h;

        if (it.kind === "sig") {
          const png = await doc.embedPng(it.data);
          page.drawImage(png, { x, y, width: w, height: h });
        } else {
          const size = h * 0.6;
          page.drawText(it.text || "", {
            x: x + 2,
            y: y + h * 0.28,
            size,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }

      const out = await doc.save();
      const blob = new Blob([out], { type: "application/pdf" });

      if (lastSignedBlobUrl) URL.revokeObjectURL(lastSignedBlobUrl);
      lastSignedBlobUrl = URL.createObjectURL(blob);
      lastSignedName = fileName.replace(/\.pdf$/i, "") + "-signed.pdf";

      triggerBlobDownload(lastSignedBlobUrl, lastSignedName);

      setDl("done", "Downloaded");
      $("dlFileName").textContent = lastSignedName;
      downloadDlg.showModal();
      setTimeout(() => setDl("idle", "Download"), 2000);
    } catch (err) {
      console.error(err);
      setDl("idle", "Download");
      toast("Couldn't generate the PDF. Try using standard letters and numbers in text fields.", "error");
    }
  };

  $("continueEditingBtn").onclick = () => closeDlg(downloadDlg);
  $("downloadAgainBtn").onclick = () => {
    if (lastSignedBlobUrl) triggerBlobDownload(lastSignedBlobUrl, lastSignedName);
  };

  /* ---------- Responsive Page Reflow on Viewport Resize / Orientation Change ---------- */
  let resizeRaf = null;
  function reflowPages() {
    if (!pageEls.length) return;
    const gutter = window.innerWidth < 640 ? 20 : window.innerWidth < 1024 ? 48 : 96;
    const availableWidth = Math.max(260, document.documentElement.clientWidth - gutter);

    for (const wrap of pageEls) {
      const baseW = parseFloat(wrap.dataset.baseW);
      const baseH = parseFloat(wrap.dataset.baseH);
      if (!baseW || !baseH) continue;

      const oldW = parseFloat(wrap.style.width) || wrap.clientWidth;
      const newScale = Math.min(SCALE, availableWidth / baseW);
      const newW = baseW * newScale;
      const newH = baseH * newScale;

      if (Math.abs(newW - oldW) < 0.5) continue;

      const ratio = oldW > 0 ? newW / oldW : 1;
      const pageIdx = +wrap.dataset.page;

      wrap.dataset.scale = newScale;
      wrap.style.width = newW + "px";
      wrap.style.height = newH + "px";

      const canvas = wrap.querySelector("canvas.render");
      if (canvas) {
        canvas.style.width = newW + "px";
        canvas.style.height = newH + "px";
      }

      for (const it of items) {
        if (it.page !== pageIdx) continue;
        it.x *= ratio;
        it.y *= ratio;
        it.w *= ratio;
        it.h *= ratio;
        it.scale = newScale;
        nodes.get(it.id)?.place();
      }
    }
    updatePager();
  }

  window.addEventListener(
    "resize",
    () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        reflowPages();
      });
    },
    { passive: true }
  );

  /* ---------- Internal Smart Sign Integration Bridge ---------- */
  let sigSavedHook = null;

  window.__openSignBridge = {
    getPdfBytes: () => pdfBytes,
    getFileName: () => fileName,
    getPageEls: () => pageEls,
    getSignatureDataUrl: () => signatureDataUrl,
    getSigSize: () => ({ ...sigSize }),
    getItemsCount: () => items.length,
    goToPage,
    toast,
    updateHint,
    clearSelection: () => {
      arm(null);
      select(null);
    },
    openSignatureModal: (onSaved) => {
      sigSavedHook = typeof onSaved === "function" ? onSaved : null;
      dlg.showModal();
      updateSave();
    },
    notifySignatureSaved: () => {
      if (!sigSavedHook) return false;
      const fn = sigSavedHook;
      sigSavedHook = null;
      fn();
      return true;
    },
    placeFieldItem: ({ page, kind, x, y, w, h, text, focusText = false }) => {
      const wrap = pageEls[page];
      if (!wrap) return null;
      const pw = wrap.clientWidth;
      const ph = wrap.clientHeight;
      const item = {
        id: nextId++,
        page,
        scale: +wrap.dataset.scale || SCALE,
        kind,
        x: clamp(x, 0, Math.max(0, pw - w)),
        y: clamp(y, 0, Math.max(0, ph - h)),
        w,
        h,
      };

      if (kind === "sig") {
        if (!signatureDataUrl) return null;
        item.ratio = sigSize.w / sigSize.h;
        let fitW = w;
        let fitH = fitW / item.ratio;
        if (fitH > h) {
          fitH = h;
          fitW = fitH * item.ratio;
        }
        item.w = Math.max(40, fitW);
        item.h = item.w / item.ratio;
        item.x = clamp(x + (w - item.w) / 2, 0, Math.max(0, pw - item.w));
        item.y = clamp(y + (h - item.h), 0, Math.max(0, ph - item.h));
        item.data = signatureDataUrl;
      } else {
        item.w = Math.max(40, Math.min(w, pw));
        item.h = Math.max(18, Math.min(h, ph));
        item.text = text != null ? text : "";
      }

      items.push(item);
      mountItem(item, wrap);
      arm(null);
      select(item.id);
      updateHint();

      if (focusText && kind !== "sig") {
        const t = nodes.get(item.id)?.el.querySelector(".txt");
        if (t) {
          t.focus();
          document.getSelection()?.selectAllChildren(t);
        }
      }
      return item;
    },
  };

  /* ---------- Preload Signature from Signature Generator (if present) ---------- */
  try {
    const saved = sessionStorage.getItem("opensign:generatedSignature");
    if (saved) {
      sessionStorage.removeItem("opensign:generatedSignature");
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:image/png")) {
        signatureDataUrl = parsed.dataUrl;
        sigSize = { w: parsed.w || 3, h: parsed.h || 1 };
        const thumb = $("sigThumb");
        if (thumb) {
          thumb.src = signatureDataUrl;
          thumb.hidden = false;
        }
        $("addSigBtn")?.classList.add("has-sig");
        toast("Your generated signature is ready — upload a PDF to place it.");
      }
    }
  } catch (_) {}
})();
