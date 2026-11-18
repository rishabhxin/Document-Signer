(() => {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const SCALE = 1.4;
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");

  let pdfBytes = null; // original file bytes
  let fileName = "document.pdf";
  let signatureDataUrl = null; // PNG data URL
  let armed = null; // 'sig' | 'text' | 'date' | null
  let items = []; // placed elements
  let nextId = 1;

  const buttons = [
    "sigBtn",
    "addSigBtn",
    "addTextBtn",
    "addDateBtn",
    "downloadBtn",
  ].map($);
  const setEnabled = (on) => buttons.forEach((b) => (b.disabled = !on));

  /* ---------- Load & render PDF ---------- */
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileName = file.name;
    pdfBytes = new Uint8Array(await file.arrayBuffer());
    items = [];
    pagesEl.innerHTML = "";
    $("hint").textContent =
      'Create a signature, click "Place signature", then click on the page.';
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: SCALE });
      const wrap = document.createElement("div");
      wrap.className = "page";
      wrap.dataset.page = i - 1;
      wrap.style.width = vp.width + "px";
      wrap.style.height = vp.height + "px";
      const canvas = document.createElement("canvas");
      canvas.className = "render";
      canvas.width = vp.width;
      canvas.height = vp.height;
      wrap.appendChild(canvas);
      pagesEl.appendChild(wrap);
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: vp,
      }).promise;
      wrap.addEventListener("click", (ev) => onPageClick(ev, wrap));
    }
    setEnabled(true);
    $("addSigBtn").disabled = !signatureDataUrl;
  });

  /* ---------- Arming placement ---------- */
  function arm(kind) {
    armed = armed === kind ? null : kind;
    ["addSigBtn", "addTextBtn", "addDateBtn"].forEach((id) =>
      $(id).classList.remove("armed"),
    );
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.toggle("placing", !!armed));
    if (armed)
      $(
        { sig: "addSigBtn", text: "addTextBtn", date: "addDateBtn" }[armed],
      ).classList.add("armed");
  }
  $("addSigBtn").onclick = () => arm("sig");
  $("addTextBtn").onclick = () => arm("text");
  $("addDateBtn").onclick = () => arm("date");

  function onPageClick(ev, wrap) {
    if (!armed || ev.target.closest(".item")) return;
    const rect = wrap.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const kind = armed;
    const item = { id: nextId++, page: +wrap.dataset.page, kind, x, y };
    if (kind === "sig") {
      item.w = 180;
      item.h = 60;
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
    item.x = Math.max(0, x - item.w / 2);
    item.y = Math.max(0, y - item.h / 2);
    items.push(item);
    mountItem(item, wrap);
    arm(null);
  }

  /* ---------- Draggable / resizable items ---------- */
  function mountItem(item, wrap) {
    const el = document.createElement("div");
    el.className = "item";
    const inner = document.createElement("div");
    inner.style.cssText = "width:100%;height:100%";
    if (item.kind === "sig") {
      const img = document.createElement("img");
      img.src = item.data;
      inner.appendChild(img);
    } else {
      const t = document.createElement("div");
      t.className = "txt";
      t.contentEditable = "true";
      t.textContent = item.text;
      t.addEventListener("input", () => (item.text = t.textContent));
      t.addEventListener("pointerdown", (e) => e.stopPropagation());
      inner.appendChild(t);
    }
    el.appendChild(inner);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.onclick = (e) => {
      e.stopPropagation();
      items = items.filter((i) => i.id !== item.id);
      el.remove();
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
      if (item.kind !== "sig")
        el.querySelector(".txt").style.fontSize = item.h * 0.6 + "px";
    };
    place();

    const startDrag = (e, mode) => {
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX,
        sy = e.clientY;
      const o = { x: item.x, y: item.y, w: item.w, h: item.h };
      const pw = wrap.clientWidth,
        ph = wrap.clientHeight;
      const move = (ev) => {
        const dx = ev.clientX - sx,
          dy = ev.clientY - sy;
        if (mode === "move") {
          item.x = Math.min(Math.max(0, o.x + dx), pw - item.w);
          item.y = Math.min(Math.max(0, o.y + dy), ph - item.h);
        } else {
          item.w = Math.max(30, Math.min(o.w + dx, pw - item.x));
          item.h = Math.max(16, Math.min(o.h + dy, ph - item.y));
        }
        place();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    el.addEventListener("pointerdown", (e) => startDrag(e, "move"));
    rz.addEventListener("pointerdown", (e) => startDrag(e, "resize"));
  }

  /* ---------- Signature dialog ---------- */
  const dlg = $("sigDialog");
  const pad = $("pad");
  const pctx = pad.getContext("2d");
  let activeTab = "draw";
  let drawing = false,
    drewAnything = false;

  $("sigBtn").onclick = () => dlg.showModal();
  $("cancelSig").onclick = () => dlg.close();

  dlg.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      activeTab = b.dataset.tab;
      dlg
        .querySelectorAll(".tabs button")
        .forEach((x) => x.classList.toggle("active", x === b));
      ["draw", "type", "image"].forEach((t) =>
        $("tab-" + t).classList.toggle("hidden", t !== activeTab),
      );
    }),
  );

  const pos = (e) => {
    const r = pad.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * pad.width) / r.width,
      y: ((e.clientY - r.top) * pad.height) / r.height,
    };
  };
  pctx.lineWidth = 3;
  pctx.lineCap = "round";
  pctx.lineJoin = "round";
  pctx.strokeStyle = "#111";
  pad.addEventListener("pointerdown", (e) => {
    drawing = true;
    drewAnything = true;
    pad.setPointerCapture(e.pointerId);
    const p = pos(e);
    pctx.beginPath();
    pctx.moveTo(p.x, p.y);
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    pctx.lineTo(p.x, p.y);
    pctx.stroke();
  });
  ["pointerup", "pointerleave"].forEach((ev) =>
    pad.addEventListener(ev, () => (drawing = false)),
  );
  $("clearPad").onclick = () => {
    pctx.clearRect(0, 0, pad.width, pad.height);
    drewAnything = false;
  };

  const typedPreview = $("typedPreview");
  $("typedName").addEventListener("input", (e) => {
    const c = typedPreview.getContext("2d");
    c.clearRect(0, 0, typedPreview.width, typedPreview.height);
    c.fillStyle = "#111";
    c.font = 'italic 64px "Brush Script MT", "Segoe Script", cursive';
    c.textBaseline = "middle";
    c.fillText(
      e.target.value,
      20,
      typedPreview.height / 2,
      typedPreview.width - 40,
    );
  });

  const imgPreview = $("imgPreview");
  $("sigImage").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = imgPreview.getContext("2d");
      c.clearRect(0, 0, imgPreview.width, imgPreview.height);
      const r = Math.min(
        imgPreview.width / img.width,
        imgPreview.height / img.height,
      );
      c.drawImage(img, 0, 0, img.width * r, img.height * r);
    };
    img.src = URL.createObjectURL(f);
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
    out
      .getContext("2d")
      .drawImage(
        canvas,
        minX,
        minY,
        out.width,
        out.height,
        0,
        0,
        out.width,
        out.height,
      );
    return out.toDataURL("image/png");
  };

  $("saveSig").onclick = () => {
    const src = { draw: pad, type: typedPreview, image: imgPreview }[activeTab];
    const url = trim(src);
    if (!url) {
      alert("Please provide a signature first.");
      return;
    }
    signatureDataUrl = url;
    $("addSigBtn").disabled = !pdfBytes;
    dlg.close();
    if (pdfBytes) arm("sig");
  };

  /* ---------- Export ---------- */
  $("downloadBtn").onclick = async () => {
    if (!items.length) {
      alert("Place at least one signature or field first.");
      return;
    }
    const doc = await PDFDocument.load(pdfBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    for (const it of items) {
      const page = pages[it.page];
      const { height } = page.getSize();
      const x = it.x / SCALE,
        w = it.w / SCALE,
        h = it.h / SCALE;
      const y = height - it.y / SCALE - h;
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
  };
})();
