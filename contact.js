(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const form = $("ctForm");
  const nameInput = $("ctName");
  const emailInput = $("ctEmail");
  const phoneInput = $("ctPhone");
  const companyInput = $("ctCompany");
  const msgInput = $("ctMessage");
  const charCountEl = $("ctCharCount");
  const topicBtns = Array.from(document.querySelectorAll(".ct-topic-btn"));
  const submitBtn = $("ctSubmitBtn");
  const successBox = $("ctSuccessBox");
  const ticketMetaEl = $("ctTicketMeta");
  const sendAnotherBtn = $("ctSendAnotherBtn");
  const openMailClientLink = $("ctMailtoFallback");

  const errName = $("ctErrName");
  const errEmail = $("ctErrEmail");
  const errMsg = $("ctErrMessage");

  let selectedTopic = "General Inquiry";

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

  /* ---------- Copy Email / Phone Buttons ---------- */
  document.querySelectorAll("[data-copy-text]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copyText || "";
      const label = btn.dataset.copyLabel || "Text";
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        toast(`${label} copied to clipboard.`);
      } catch (_) {
        toast(`Unable to copy ${label.toLowerCase()}.`, "error");
      }
    });
  });

  /* ---------- Topic Pills ---------- */
  topicBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedTopic = btn.dataset.topic || "General Inquiry";
      topicBtns.forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    });
  });

  /* ---------- Live Character Counter ---------- */
  function updateCharCount() {
    if (!msgInput || !charCountEl) return;
    const len = msgInput.value.length;
    charCountEl.textContent = `${len} / 1500`;
  }
  msgInput?.addEventListener("input", () => {
    updateCharCount();
    if (errMsg && msgInput.value.trim().length >= 10) {
      errMsg.textContent = "";
      msgInput.classList.remove("is-invalid");
    }
  });

  nameInput?.addEventListener("input", () => {
    if (errName && nameInput.value.trim().length >= 2) {
      errName.textContent = "";
      nameInput.classList.remove("is-invalid");
    }
  });

  emailInput?.addEventListener("input", () => {
    if (errEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) {
      errEmail.textContent = "";
      emailInput.classList.remove("is-invalid");
    }
  });

  /* ---------- Validation & Submission ---------- */
  function validateForm() {
    let valid = true;

    const nameVal = (nameInput?.value || "").trim();
    if (nameVal.length < 2) {
      if (errName) errName.textContent = "Please enter your full name.";
      nameInput?.classList.add("is-invalid");
      valid = false;
    } else {
      if (errName) errName.textContent = "";
      nameInput?.classList.remove("is-invalid");
    }

    const emailVal = (emailInput?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      if (errEmail) errEmail.textContent = "Please enter a valid work or personal email address.";
      emailInput?.classList.add("is-invalid");
      valid = false;
    } else {
      if (errEmail) errEmail.textContent = "";
      emailInput?.classList.remove("is-invalid");
    }

    const msgVal = (msgInput?.value || "").trim();
    if (msgVal.length < 10) {
      if (errMsg) errMsg.textContent = "Please enter a brief message (at least 10 characters).";
      msgInput?.classList.add("is-invalid");
      valid = false;
    } else {
      if (errMsg) errMsg.textContent = "";
      msgInput?.classList.remove("is-invalid");
    }

    return valid;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const nameVal = nameInput.value.trim();
    const emailVal = emailInput.value.trim();
    const phoneVal = (phoneInput?.value || "").trim();
    const companyVal = (companyInput?.value || "").trim();
    const msgVal = msgInput.value.trim();

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = "Sending message...";

    await new Promise((r) => setTimeout(r, 320));

    const refId = `OS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const subject = encodeURIComponent(`[Open Sign · ${selectedTopic}] Inquiry from ${nameVal}`);
    const bodyLines = [
      `Reference: ${refId}`,
      `Topic: ${selectedTopic}`,
      `Name: ${nameVal}`,
      `Email: ${emailVal}`,
      phoneVal ? `Phone: ${phoneVal}` : "",
      companyVal ? `Company: ${companyVal}` : "",
      "",
      msgVal,
    ]
      .filter(Boolean)
      .join("\n");

    if (openMailClientLink) {
      openMailClientLink.href = `mailto:support@opensign.in?subject=${subject}&body=${encodeURIComponent(bodyLines)}`;
    }

    if (ticketMetaEl) {
      ticketMetaEl.innerHTML = "";
      const rows = [
        ["Reference ID", refId],
        ["Topic", selectedTopic],
        ["From", `${nameVal} (${emailVal})`],
        ...(companyVal ? [["Organization", companyVal]] : []),
        ...(phoneVal ? [["Phone", phoneVal]] : []),
      ];
      for (const [k, v] of rows) {
        const div = document.createElement("div");
        const b = document.createElement("strong");
        b.textContent = `${k}: `;
        div.append(b, document.createTextNode(v));
        ticketMetaEl.appendChild(div);
      }
    }

    form.hidden = true;
    successBox.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
    toast("Your inquiry has been prepared.");
  });

  sendAnotherBtn?.addEventListener("click", () => {
    form.reset();
    selectedTopic = "General Inquiry";
    topicBtns.forEach((b, idx) => b.setAttribute("aria-checked", String(idx === 0)));
    updateCharCount();
    successBox.hidden = true;
    form.hidden = false;
    nameInput?.focus();
  });

  updateCharCount();
})();
