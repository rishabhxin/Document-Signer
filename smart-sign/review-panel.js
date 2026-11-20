(function (root) {
  "use strict";
  const NS = (root.OpenSignSmartSign = root.OpenSignSmartSign || {});

  const TYPE_LABELS = {
    signature: "Signature",
    name: "Name",
    date: "Date",
    initials: "Initials",
  };

  class ReviewPanel {
    constructor(callbacks) {
      this.cb = callbacks;
      this.root = document.createElement("div");
      this.root.id = "smartSignUi";
      document.body.appendChild(this.root);

      this.mode = "hidden";
      this.listOpen = false;
      this.addMenuOpen = false;
      this.fillOpen = false;
      this.approvedInfo = {
        name: "",
        initials: "",
        date: new Date().toLocaleDateString("en-GB"),
        approved: false,
      };
    }

    hide() {
      this.mode = "hidden";
      this.listOpen = false;
      this.addMenuOpen = false;
      this.fillOpen = false;
      this.root.innerHTML = "";
    }

    showProgress(message, progress = 0.1) {
      if (this.mode !== "progress") {
        this.mode = "progress";
        this.root.innerHTML = `
          <div class="ss-progress" role="status" aria-live="polite">
            <span class="ss-spinner" aria-hidden="true"></span>
            <div class="ss-progress-copy">
              <span class="ss-progress-msg" id="ssProgMsg"></span>
              <div class="ss-progress-bar"><div class="ss-progress-fill" id="ssProgFill"></div></div>
            </div>
            <button type="button" class="ss-btn ghost" id="ssCancelProg">Cancel</button>
          </div>
        `;
        this.root.querySelector("#ssCancelProg").onclick = () => this.cb.onCancelAnalysis?.();
      }

      const msgEl = this.root.querySelector("#ssProgMsg");
      const fillEl = this.root.querySelector("#ssProgFill");
      if (msgEl && message) msgEl.textContent = message;
      if (fillEl) fillEl.style.width = `${Math.max(4, Math.min(100, Math.round(progress * 100)))}%`;
    }

    renderReview(fields, selectedId, addingType) {
      this.mode = "review";
      const counts = { total: fields.length, signature: 0, name: 0, date: 0, initials: 0, review: 0 };
      for (const f of fields) {
        if (counts[f.type] !== undefined) counts[f.type]++;
        if (f.confidence < 85) counts.review++;
      }

      this.root.innerHTML = `
        <div class="ss-bar" role="region" aria-label="Smart Sign review">
          <div class="ss-summary">
            <span class="ss-summary-title">${counts.total} detected</span>
            <span class="ss-chip">Sig: ${counts.signature}</span>
            <span class="ss-chip">Name: ${counts.name}</span>
            <span class="ss-chip">Date: ${counts.date}</span>
            <span class="ss-chip">Initials: ${counts.initials}</span>
            ${counts.review > 0 ? `<span class="ss-chip is-warn">${counts.review} to review</span>` : ""}
          </div>
          <div class="ss-actions">
            <button type="button" class="ss-btn primary" id="ssConfirmAll" ${counts.total === 0 ? "disabled" : ""}>Confirm All</button>
            <button type="button" class="ss-btn ${this.listOpen ? "active" : ""}" id="ssToggleList">Review Fields</button>
            <button type="button" class="ss-btn danger" id="ssRemoveSel" ${selectedId ? "" : "disabled"}>Remove Selected</button>
            <button type="button" class="ss-btn ${this.addMenuOpen || addingType ? "active" : ""}" id="ssAddMissing">
              ${addingType ? `Placing ${TYPE_LABELS[addingType]}...` : "Add Missing Field"}
            </button>
            <button type="button" class="ss-btn ghost" id="ssCancelReview">Cancel</button>
          </div>
        </div>
      `;

      if (this.listOpen) {
        const pop = document.createElement("div");
        pop.className = "ss-popover";
        const ul = document.createElement("ul");
        ul.className = "ss-list";

        if (!fields.length) {
          ul.innerHTML = `<li class="ss-list-item"><span>No fields detected. Use "Add Missing Field" or cancel to sign manually.</span></li>`;
        } else {
          for (const f of fields) {
            const li = document.createElement("li");
            li.className = `ss-list-item ${f.id === selectedId ? "selected" : ""}`;
            const lvl = f.confidence >= 85 ? "high" : "medium";
            const signer = f.signer && f.signer !== "Signer 1" ? ` · ${f.signer}` : "";

            const meta = document.createElement("div");
            meta.className = "ss-list-meta";
            const typeSpan = document.createElement("span");
            typeSpan.className = "ss-list-type";
            typeSpan.textContent = TYPE_LABELS[f.type] || f.type;
            const subSpan = document.createElement("span");
            subSpan.className = "ss-list-sub";
            subSpan.textContent = `Page ${f.page + 1}${signer}`;
            meta.append(typeSpan, subSpan);

            const pill = document.createElement("span");
            pill.className = `ss-conf-pill ${lvl}`;
            pill.textContent = `${f.confidence}%${lvl === "medium" ? " · Review" : ""}`;

            li.append(meta, pill);
            li.onclick = () => this.cb.onSelectFromList?.(f.id);
            ul.appendChild(li);
          }
        }
        pop.appendChild(ul);
        this.root.appendChild(pop);
      }

      if (this.addMenuOpen) {
        const pop = document.createElement("div");
        pop.className = "ss-popover";
        pop.innerHTML = `
          <div class="ss-actions" style="justify-content:center;padding:4px">
            <button type="button" class="ss-btn" data-add-type="signature">+ Signature</button>
            <button type="button" class="ss-btn" data-add-type="name">+ Name</button>
            <button type="button" class="ss-btn" data-add-type="date">+ Date</button>
            <button type="button" class="ss-btn" data-add-type="initials">+ Initials</button>
          </div>
        `;
        pop.querySelectorAll("[data-add-type]").forEach((btn) => {
          btn.onclick = () => {
            this.addMenuOpen = false;
            this.cb.onStartAddField?.(btn.dataset.addType);
          };
        });
        this.root.appendChild(pop);
      }

      this.root.querySelector("#ssConfirmAll").onclick = () => this.cb.onConfirmAll?.();
      this.root.querySelector("#ssToggleList").onclick = () => {
        this.addMenuOpen = false;
        this.listOpen = !this.listOpen;
        this.renderReview(fields, selectedId, addingType);
      };
      this.root.querySelector("#ssRemoveSel").onclick = () => this.cb.onRemoveSelected?.();
      this.root.querySelector("#ssAddMissing").onclick = () => {
        if (addingType) {
          this.cb.onStartAddField?.(null);
          return;
        }
        this.listOpen = false;
        this.addMenuOpen = !this.addMenuOpen;
        this.renderReview(fields, selectedId, addingType);
      };
      this.root.querySelector("#ssCancelReview").onclick = () => this.cb.onCancelReview?.();
    }

    renderGuided(fields, activeId) {
      this.mode = "guided";
      const remaining = fields.filter((f) => f.status !== "completed");
      const completed = fields.length - remaining.length;
      const active = remaining.find((f) => f.id === activeId) || remaining[0] || null;
      const hasTextFields = remaining.some((f) => f.type === "name" || f.type === "date" || f.type === "initials");

      this.root.innerHTML = `
        <div class="ss-bar" role="region" aria-label="Smart Sign guided signing">
          <div class="ss-summary">
            <span class="ss-summary-title">${completed} / ${fields.length} completed</span>
            ${
              active
                ? `<span class="ss-chip">Next: ${TYPE_LABELS[active.type]} · Page ${active.page + 1}</span>`
                : `<span class="ss-chip">All fields completed</span>`
            }
          </div>
          <div class="ss-actions">
            ${
              remaining.length > 0
                ? `<button type="button" class="ss-btn primary" id="ssNextField">Next Field →</button>`
                : ""
            }
            ${
              hasTextFields
                ? `<button type="button" class="ss-btn ${this.fillOpen ? "active" : ""}" id="ssFillDetails">Your Details</button>`
                : ""
            }
            <button type="button" class="ss-btn ghost" id="ssDoneGuided">${remaining.length ? "Exit Guide" : "Done"}</button>
          </div>
        </div>
      `;

      if (this.fillOpen && hasTextFields) {
        const pop = document.createElement("div");
        pop.className = "ss-popover";
        pop.innerHTML = `
          <form class="ss-fill-form" id="ssFillForm">
            <label>Full Name (used only when you approve)
              <input type="text" name="name" value="${this.escapeAttr(this.approvedInfo.name)}" placeholder="e.g. Aarav Sharma" />
            </label>
            <label>Initials
              <input type="text" name="initials" value="${this.escapeAttr(this.approvedInfo.initials)}" placeholder="e.g. AS" maxlength="6" />
            </label>
            <label>Date
              <input type="text" name="date" value="${this.escapeAttr(this.approvedInfo.date)}" placeholder="DD/MM/YYYY" />
            </label>
            <div class="ss-actions" style="justify-content:flex-end">
              <button type="button" class="ss-btn ghost" id="ssCloseFill">Cancel</button>
              <button type="submit" class="ss-btn primary">Approve &amp; Fill Text Fields</button>
            </div>
          </form>
        `;
        this.root.appendChild(pop);

        pop.querySelector("#ssCloseFill").onclick = () => {
          this.fillOpen = false;
          this.renderGuided(fields, activeId);
        };
        pop.querySelector("#ssFillForm").onsubmit = (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          this.approvedInfo = {
            name: String(fd.get("name") || "").trim(),
            initials: String(fd.get("initials") || "").trim(),
            date: String(fd.get("date") || "").trim(),
            approved: true,
          };
          this.fillOpen = false;
          this.cb.onApproveDetails?.(this.approvedInfo);
        };
      }

      const nextBtn = this.root.querySelector("#ssNextField");
      if (nextBtn) nextBtn.onclick = () => this.cb.onNextField?.();

      const fillBtn = this.root.querySelector("#ssFillDetails");
      if (fillBtn) {
        fillBtn.onclick = () => {
          this.fillOpen = !this.fillOpen;
          this.renderGuided(fields, activeId);
        };
      }

      this.root.querySelector("#ssDoneGuided").onclick = () => this.cb.onExitGuided?.();
    }

    getApprovedInfo() {
      return this.approvedInfo;
    }

    escapeAttr(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }

  NS.ReviewPanel = ReviewPanel;
})(typeof self !== "undefined" ? self : window);
