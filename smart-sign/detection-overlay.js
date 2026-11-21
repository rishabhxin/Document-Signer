(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const TYPE_LABELS = {
    signature: "Signature",
    name: "Name",
    date: "Date",
    initials: "Initials",
  };

  const DEFAULT_ADD_SIZES = {
    signature: { width: 0.28, height: 0.044 },
    name: { width: 0.24, height: 0.026 },
    date: { width: 0.16, height: 0.026 },
    initials: { width: 0.09, height: 0.028 },
  };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  class DetectionOverlay {
    constructor({ getPageEls, goToPage, onChange, onSelect, onSlotActivate }) {
      this.getPageEls = getPageEls;
      this.goToPage = goToPage;
      this.onChange = onChange;
      this.onSelect = onSelect;
      this.onSlotActivate = onSlotActivate;

      this.mode = "idle";
      this.fields = [];
      this.selectedId = null;
      this.addingType = null;
      this.nodes = new Map();
      this.pageClickHandlers = new Map();

      this.onResize = () => this.repositionAll();
      window.addEventListener("resize", this.onResize, { passive: true });
    }

    clear() {
      this.setAddingType(null);
      this.nodes.forEach((el) => el.remove());
      this.nodes.clear();
      this.fields = [];
      this.selectedId = null;
      this.mode = "idle";
    }

    getFields() {
      return this.fields;
    }

    getSelectedId() {
      return this.selectedId;
    }

    setReviewFields(fields) {
      this.clear();
      this.mode = "review";
      this.fields = fields.map((f) => ({ ...f }));
      for (const f of this.fields) {
        this.mountReviewNode(f);
      }
      this.onChange?.(this.fields);
    }

    setGuidedFields(confirmedFields) {
      this.clear();
      this.mode = "guided";
      this.fields = confirmedFields.map((f) => ({ ...f, status: "confirmed" }));
      for (const f of this.fields) {
        this.mountGuidedSlot(f);
      }
      this.onChange?.(this.fields);
    }

    select(id, { scroll = false } = {}) {
      this.selectedId = id;
      this.nodes.forEach((el, k) => {
        el.classList.toggle("selected", k === id);
        el.classList.toggle("active-focus", k === id);
      });
      if (scroll && id) {
        const f = this.fields.find((x) => x.id === id);
        const el = this.nodes.get(id);
        if (f) this.goToPage?.(f.page);
        if (el) {
          requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus?.({ preventScroll: true });
          });
        }
      }
      this.onSelect?.(id);
    }

    removeField(id) {
      const idx = this.fields.findIndex((f) => f.id === id);
      if (idx === -1) return;
      this.fields.splice(idx, 1);
      const el = this.nodes.get(id);
      if (el) {
        el.remove();
        this.nodes.delete(id);
      }
      if (this.selectedId === id) this.select(null);
      this.onChange?.(this.fields);
    }

    markCompleted(id) {
      const f = this.fields.find((x) => x.id === id);
      if (!f) return;
      f.status = "completed";
      const el = this.nodes.get(id);
      if (el) el.classList.add("completed");
      this.onChange?.(this.fields);
    }

    setAddingType(type) {
      const CoordinateMapper = NS.CoordinateMapper;
      this.addingType = type;
      const pages = this.getPageEls();

      this.pageClickHandlers.forEach((fn, wrap) => {
        wrap.removeEventListener("click", fn, true);
        wrap.classList.remove("ss-adding");
      });
      this.pageClickHandlers.clear();

      if (!type || this.mode !== "review") return;

      for (const wrap of pages) {
        wrap.classList.add("ss-adding");
        const handler = (ev) => {
          if (ev.target.closest(".ss-field")) return;
          ev.preventDefault();
          ev.stopPropagation();

          const rect = wrap.getBoundingClientRect();
          const px = ev.clientX - rect.left;
          const py = ev.clientY - rect.top;
          const def = DEFAULT_ADD_SIZES[type] || DEFAULT_ADD_SIZES.signature;
          const wPx = def.width * wrap.clientWidth;
          const hPx = def.height * wrap.clientHeight;
          const norm = CoordinateMapper.domToNormalized(
            { x: px - wPx / 2, y: py - hPx / 2, w: wPx, h: hPx },
            wrap
          );

          const newField = {
            id: `ss-manual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            type,
            page: +wrap.dataset.page,
            x: Number(norm.x.toFixed(4)),
            y: Number(norm.y.toFixed(4)),
            width: Number(norm.width.toFixed(4)),
            height: Number(norm.height.toFixed(4)),
            confidence: 100,
            signer: "Signer 1",
            status: "suggested",
          };

          this.fields.push(newField);
          this.mountReviewNode(newField);
          this.setAddingType(null);
          this.select(newField.id);
          this.onChange?.(this.fields);
        };

        wrap.addEventListener("click", handler, true);
        this.pageClickHandlers.set(wrap, handler);
      }
    }

    repositionAll() {
      const pages = this.getPageEls();
      for (const f of this.fields) {
        const el = this.nodes.get(f.id);
        const wrap = pages[f.page];
        if (!el || !wrap) continue;
        this.applyBoxPosition(el, f, wrap);
      }
    }

    applyBoxPosition(el, field, wrap) {
      const dom = NS.CoordinateMapper.normalizedToDom(field, wrap);
      el.style.left = dom.x + "px";
      el.style.top = dom.y + "px";
      el.style.width = dom.w + "px";
      el.style.height = dom.h + "px";
    }

    mountReviewNode(field) {
      const CoordinateMapper = NS.CoordinateMapper;
      const wrap = this.getPageEls()[field.page];
      if (!wrap) return;

      const el = document.createElement("div");
      const level = field.confidence >= 85 ? "high" : "medium";
      el.className = `ss-field conf-${level}`;
      el.tabIndex = 0;
      el.dataset.fieldId = field.id;
      el.setAttribute("role", "group");

      const tag = document.createElement("span");
      tag.className = "ss-field-tag";
      const tagMain = document.createElement("span");
      const tagConf = document.createElement("span");
      tagConf.className = "ss-field-tag-conf";
      tag.append(tagMain, tagConf);

      const updateTag = () => {
        const typeLabel = TYPE_LABELS[field.type] || field.type;
        const confText = field.confidence >= 85 ? `${field.confidence}%` : `${field.confidence}% · Review`;
        const signerText = field.signer && field.signer !== "Signer 1" ? ` · ${field.signer}` : "";
        tagMain.textContent = `${typeLabel}${signerText}`;
        tagConf.textContent = `P${field.page + 1} · ${confText}`;
        el.setAttribute("aria-label", `${typeLabel} field on page ${field.page + 1}, confidence ${field.confidence}%`);
      };
      updateTag();

      const controls = document.createElement("div");
      controls.className = "ss-field-controls";

      const selectEl = document.createElement("select");
      selectEl.className = "ss-type-select";
      selectEl.setAttribute("aria-label", "Change field type");
      for (const [val, label] of Object.entries(TYPE_LABELS)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        if (val === field.type) opt.selected = true;
        selectEl.appendChild(opt);
      }
      selectEl.addEventListener("pointerdown", (e) => e.stopPropagation());
      selectEl.addEventListener("change", () => {
        field.type = selectEl.value;
        updateTag();
        this.onChange?.(this.fields);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "ss-field-del";
      delBtn.textContent = "×";
      delBtn.setAttribute("aria-label", "Remove detected field");
      delBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeField(field.id);
      });

      controls.append(selectEl, delBtn);

      const rz = document.createElement("div");
      rz.className = "ss-field-rz";
      rz.setAttribute("aria-hidden", "true");

      el.append(tag, controls, rz);
      wrap.appendChild(el);
      this.nodes.set(field.id, el);
      this.applyBoxPosition(el, field, wrap);

      const startDrag = (e, mode) => {
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.select(field.id);

        const startX = e.clientX;
        const startY = e.clientY;
        const orig = CoordinateMapper.normalizedToDom(field, wrap);
        const pw = wrap.clientWidth;
        const ph = wrap.clientHeight;

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const next = { ...orig };

          if (mode === "move") {
            next.x = clamp(orig.x + dx, 0, pw - orig.w);
            next.y = clamp(orig.y + dy, 0, ph - orig.h);
          } else {
            next.w = clamp(orig.w + dx, 36, pw - orig.x);
            next.h = clamp(orig.h + dy, 18, ph - orig.y);
          }

          const norm = CoordinateMapper.domToNormalized(next, wrap);
          field.x = Number(norm.x.toFixed(4));
          field.y = Number(norm.y.toFixed(4));
          field.width = Number(norm.width.toFixed(4));
          field.height = Number(norm.height.toFixed(4));
          this.applyBoxPosition(el, field, wrap);
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".ss-field-controls") || e.target.closest(".ss-field-rz")) return;
        startDrag(e, "move");
      });

      rz.addEventListener("pointerdown", (e) => startDrag(e, "resize"));
      el.addEventListener("focus", () => this.select(field.id));
    }

    mountGuidedSlot(field) {
      const wrap = this.getPageEls()[field.page];
      if (!wrap) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-slot";
      btn.dataset.fieldId = field.id;
      const typeLabel = TYPE_LABELS[field.type] || field.type;
      const actionLabel =
        field.type === "signature"
          ? "Click to sign"
          : field.type === "date"
            ? "Add date"
            : field.type === "initials"
              ? "Add initials"
              : "Add name";
      const signerTag = field.signer && field.signer !== "Signer 1" ? ` (${field.signer})` : "";
      btn.textContent = `${actionLabel}${signerTag}`;
      btn.title = `${typeLabel} · Page ${field.page + 1}`;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.select(field.id);
        this.onSlotActivate?.(field);
      });

      wrap.appendChild(btn);
      this.nodes.set(field.id, btn);
      this.applyBoxPosition(btn, field, wrap);
    }
  }

  NS.DetectionOverlay = DetectionOverlay;
})(typeof self !== "undefined" ? self : window);
