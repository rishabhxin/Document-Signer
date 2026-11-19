(() => {
  "use strict";
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const SCALE = 1.4;
  const MAX_BYTES = 50 * 1024 * 1024; // keep in sync with the "up to 50 MB" copy
  const MIN_PROCESS_MS = 700; // lets the processing animation register on fast files
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  let pdfBytes = null; // original file bytes
  let fileName = "document.pdf";
  let signatureDataUrl = null; // PNG data URL
  let sigSize = { w: 3, h: 1 }; // pixel size of the trimmed signature
  let armed = null; // 'sig' | 'text' | 'date' | null
  let items = []; // placed elements
  let nextId = 1;
  let selectedId = null;
  let loading = false;
  let pageEls = [];
  const nodes = new Map(); // item id -> { el, place }

  const buttons = ["sigBtn", "addSigBtn", "addTextBtn", "addDateBtn", "downloadBtn"].map($);
  const setEnabled = (on) => buttons.forEach((b) => (b.disabled = !on));

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  const themeBtn = $("themeToggle");
  themeBtn.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  themeBtn.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    themeBtn.setAttribute("aria-pressed", String(next === "dark"));
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute("content", next === "dark" ? "#121110" : "#f5f2eb");
    try { localStorage.setItem("opensign-theme", next); } catch (_) {}
  });

  /* ---------- Views, toast, dialogs ---------- */
  const views = { home: $("homeView"), processing: $("processView"), editor: $("editorView") };
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
      if (reduceMotion.matches) { d.close(); return resolve(); }
      d.classList.add("closing");
      const done = () => {
        if (!d.classList.contains("closing")) return;
        d.classList.remove("closing");
        d.close();
        resolve();
      };
      d.addEventListener("animationend", done, { once: true });
      setTimeout(done, 400);
    });
  }
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDlg(d);
    }),
  );

  /* ---------- Processing status ---------- */
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
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

  /* ---------- Hint ---------- */
  function updateHint() {
    const verb = coarse.matches ? "Tap" : "Click";
    let msg = "";
    if (pdfBytes) {
      if (armed) {
        const what = { sig: "signature", text: "text", date: "date" }[armed];
        msg = `${verb} on the page to place your ${what}.`;
      } else if (!items.length) {
        msg = signatureDataUrl
          ? "Place your signature, or add text or a date."
          : "Start by creating your signature.";
      }
    }
    $("hint").textContent = msg;
  }

  /* ---------- Load & render PDF ---------- */
  const isPdfFile = (f) => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));

  function closeDocument() {
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
  }

  async function loadFile(file) {
    if (!file || loading) return;
    if (!isPdfFile(file)) return toast("That doesn't look like a PDF. Please choose a .pdf file.", "error");
    if (file.size > MAX_BYTES) return toast("That file is larger than 50 MB.", "error");

    loading = true;
    const started = performance.now();
    closeDocument();
    setView("processing");
    setStatus("Receiving your document...", `${file.name} · ${fmtSize(file.size)}`);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setStatus("Preparing your pages...");
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(null, `${file.name} · page ${i} of ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        // Fit PDF pages to the available screen width on phones.
        const baseViewport = page.getViewport({ scale: 1 });
        const gutter = window.innerWidth < 640 ? 28 : 96;
        const availableWidth = Math.max(280, document.documentElement.clientWidth - gutter);
        const pageScale = Math.min(SCALE, availableWidth / baseViewport.width);
        const vp = page.getViewport({ scale: pageScale });
        const wrap = document.createElement("div");
        wrap.dataset.scale = pageScale;
        wrap.className = "page";
        wrap.dataset.page = i - 1;
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", `Page ${i} of ${pdf.numPages}`);
        wrap.style.width = vp.width + "px";
        wrap.style.height = vp.height + "px";
        const canvas = document.createElement("canvas");
        canvas.className = "render";

        // Render at the device's pixel density so text stays sharp on high-DPI screens.
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

      setStatus("Almost ready...", `${file.name} · ${fmtSize(file.size)}`);
      pdfBytes = bytes;
      fileName = file.name;
      items = [];
      setEnabled(true);
      $("addSigBtn").disabled = !signatureDataUrl;
      $("deleteBtn").disabled = true;
      $("docName").textContent = file.name;
      $("docPages").textContent = pdf.numPages === 1 ? "1 page" : `${pdf.numPages} pages`;
      pdf.destroy?.();

      const wait = reduceMotion.matches ? 0 : MIN_PROCESS_MS - (performance.now() - started);
      if (wait > 0) await sleep(wait);

      setView("editor");
      updateHint();
      initPager();
    } catch (err) {
      console.error(err);
      closeDocument();
      setView("home");
      toast(
        err && err.name === "PasswordException"
          ? "This PDF is password-protected. Remove the password and try again."
          : "We couldn't read that PDF. It may be damaged or unsupported.",
        "error",
      );
    } finally {
      loading = false;
    }
  }

  $("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // allow picking the same file again
    loadFile(file);
  });

  /* ---------- Drag and drop ---------- */
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
  // Stop the browser from navigating to a PDF dropped anywhere; accept drops on the home view.
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

  /* ---------- Page navigation ---------- */
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
    { passive: true },
  );
  const goToPage = (i) =>
    pageEls[clamp(i, 0, pageEls.length - 1)]?.scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
      block: "start",
    });
  $("pagePrev").onclick = () => goToPage(currentPage - 1);
  $("pageNext").onclick = () => goToPage(currentPage + 1);

  /* ---------- Arming placement ---------- */
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
    $("deleteBtn").disabled = id == null;
  }
  function removeItem(id) {
    items = items.filter((i) => i.id !== id);
    const n = nodes.get(id);
    nodes.delete(id);
    if (n) {
      n.el.classList.add("leaving");
      setTimeout(() => n.el.remove(), reduceMotion.matches ? 0 : 170);
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
    const pw = wrap.clientWidth,
      ph = wrap.clientHeight;
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

  /* ---------- Draggable / resizable items ---------- */
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
    del.setAttribute("aria-label", "Delete");
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
      if (item.kind !== "sig") el.querySelector(".txt").style.fontSize = item.h * 0.6 + "px";
    };
    place();
    nodes.set(item.id, { el, place });

    const startDrag = (e, mode) => {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      select(item.id);
      const sx = e.clientX,
        sy = e.clientY;
      const o = { x: item.x, y: item.y, w: item.w, h: item.h };
      const pw = wrap.clientWidth,
        ph = wrap.clientHeight;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - sx,
          dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (mode === "move") {
          item.x = clamp(o.x + dx, 0, pw - item.w);
          item.y = clamp(o.y + dy, 0, ph - item.h);
        } else if (item.kind === "sig") {
          // keep the signature's aspect ratio so the export matches the preview
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
        // a plain click on text/date starts editing
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
      // while a text field is being edited, let the caret behave normally
      if (txt && document.activeElement === txt && e.target.closest(".txt")) {
        e.stopPropagation();
        return;
      }
      startDrag(e, "move");
    });
    rz.addEventListener("pointerdown", (e) => startDrag(e, "resize"));
    el.addEventListener("focus", () => select(item.id));
  }

  // Keyboard: Esc, Delete, arrow-key nudging
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
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const wrap = n.el.parentElement;
    item.x = clamp(item.x + d[0], 0, wrap.clientWidth - item.w);
    item.y = clamp(item.y + d[1], 0, wrap.clientHeight - item.h);
    n.place();
  });

  /* ---------- Signature dialog ---------- */
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

  const openSig = () => {
    dlg.showModal();
    updateSave();
  };
  $("sigBtn").onclick = openSig;
  $("cancelSig").onclick = () => closeDlg(dlg);
  $("cancelSigTop").onclick = () => closeDlg(dlg);
  // Close on backdrop click, but not when a drawing stroke merely ends outside the dialog.
  let downOnBackdrop = false;
  dlg.addEventListener("pointerdown", (e) => (downOnBackdrop = e.target === dlg));
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg && downOnBackdrop) closeDlg(dlg);
  });

  const tabBtns = Array.from(dlg.querySelectorAll(".tabs button"));
  function showTab(name) {
    activeTab = name;
    tabBtns.forEach((x) => {
      const on = x.dataset.tab === name;
      x.classList.toggle("active", on);
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
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

  // --- Draw: smoothed strokes with undo
  const INK = "#111";
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
  $("undoPad").onclick = () => {
    strokes.pop();
    redrawPad();
    updateSave();
  };
  $("clearPad").onclick = () => {
    strokes.length = 0;
    redrawPad();
    updateSave();
  };

  // --- Type: handwriting fonts
  const fontList = $("fontList");
  FONTS.forEach((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "font-opt";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === 0));
    b.style.fontFamily = `"${f.name}", cursive`;
    b.style.fontWeight = f.weight;
    b.textContent = "Your name";
    b.addEventListener("click", () => {
      typedFont = i;
      fontList.querySelectorAll(".font-opt").forEach((x, j) => x.setAttribute("aria-checked", String(j === i)));
      renderTyped();
    });
    fontList.appendChild(b);
  });

  async function renderTyped() {
    const text = $("typedName").value;
    const token = ++typedToken;
    const c = typedPreview.getContext("2d");
    fontList.querySelectorAll(".font-opt").forEach((x) => (x.textContent = text.trim() || "Your name"));
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
    if (token !== typedToken) return; // a newer render superseded this one
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

  // --- Upload
  $("sigImage").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const c = imgPreview.getContext("2d");
      c.clearRect(0, 0, imgPreview.width, imgPreview.height);
      const r = Math.min(imgPreview.width / img.width, imgPreview.height / img.height);
      const w = img.width * r,
        h = img.height * r;
      c.drawImage(img, (imgPreview.width - w) / 2, (imgPreview.height - h) / 2, w, h);
      hasImage = true;
      URL.revokeObjectURL(url);
      updateSave();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("That image couldn't be read.", "error");
    };
    img.src = url;
  });

  const trim = (canvas) => {
    // crop transparent margins so the placed box fits the ink
    const c = canvas.getContext("2d");
    const { width: w, height: h } = canvas;
    const d = c.getImageData(0, 0, w, h).data;
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
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
      toast("Please provide a signature first.", "error");
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
    if (pdfBytes) {
      if (armed !== "sig") arm("sig");
      else updateHint();
    }
  };

  /* ---------- Leave / go home ---------- */
  const leaveDlg = $("leaveDialog");
  function goHome(thenAbout) {
    closeDocument();
    setView("home");
    if (thenAbout) $("about").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
  }
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.addEventListener("click", (e) => {
      const view = document.body.dataset.view;
      const about = a.dataset.nav === "about";
      if (view === "processing") {
        e.preventDefault();
        return;
      }
      if (view === "home") {
        if (!about) {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
        }
        return; // About: native anchor scroll
      }
      e.preventDefault();
      if (!items.length) return goHome(about);
      leaveDlg.dataset.about = about ? "1" : "";
      leaveDlg.showModal();
    }),
  );
  $("leaveCancel").onclick = () => closeDlg(leaveDlg);
  $("leaveConfirm").onclick = async () => {
    const about = !!leaveDlg.dataset.about;
    await closeDlg(leaveDlg);
    goHome(about);
  };
  window.addEventListener("beforeunload", (e) => {
    if (items.length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- Export ---------- */
  const dlBtn = $("downloadBtn");
  function setDl(state, label) {
    dlBtn.dataset.state = state;
    $("dlLabel").textContent = label;
  }
  dlBtn.onclick = async () => {
    if (!items.length) {
      toast("Place at least one signature or field first.");
      return;
    }
    if (dlBtn.dataset.state === "busy") return;
    setDl("busy", "Preparing...");
    try {
      const doc = await PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();

      for (const it of items) {
        const page = pages[it.page];
        const { height } = page.getSize();
        const pageScale = it.scale || SCALE;
        const x = it.x / pageScale,
          w = it.w / pageScale,
          h = it.h / pageScale;
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
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName.replace(/\.pdf$/i, "") + "-signed.pdf";
      a.click();
      URL.revokeObjectURL(a.href);

      setDl("done", "Saved");
      toast("Your signed PDF is ready.");
      setTimeout(() => setDl("idle", "Download"), 2400);
    } catch (err) {
      console.error(err);
      setDl("idle", "Download");
      toast("Couldn't create the PDF. If you typed special characters, try plain letters and numbers.", "error");
    }
  };
})();
