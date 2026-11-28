(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const STATUS_CODES = ["P", "A", "L", "H", "WO", "HD", "WFH", "OD"];

  const DEFAULT_STATUS_LABELS = {
    P: "Present",
    A: "Absent",
    L: "Leave",
    H: "Holiday",
    WO: "Weekly Off",
    HD: "Half Day",
    WFH: "Work From Home",
    OD: "On Duty",
  };

  const TEMPLATES = {
    corporate: {
      id: "corporate",
      name: "Corporate Attendance Sheet",
      entitySingular: "Employee",
      entityPlural: "Employees",
      idLabel: "Employee ID",
      deptLabel: "Department",
      roleLabel: "Designation",
      managerLabel: "HR Manager Name",
      weeklyOffs: [0, 6], // Sun, Sat
      countLeaveAsPresent: false,
      defaultOrg: {
        name: "Acme Technologies Pvt. Ltd.",
        department: "Human Resources & Operations",
        branch: "Mumbai HQ",
        hrManager: "Meera Nair",
      },
      sampleEntities: [
        { uid: "emp_1", empId: "EMP-101", name: "Rahul Sharma", department: "Engineering", designation: "Senior Developer", joiningDate: "2024-03-12", status: "Active", contact: "+91 98201 11223" },
        { uid: "emp_2", empId: "EMP-102", name: "Priya Deshmukh", department: "Product & Design", designation: "Product Designer", joiningDate: "2024-06-01", status: "Active", contact: "+91 98201 22334" },
        { uid: "emp_3", empId: "EMP-103", name: "Amit Kulkarni", department: "Engineering", designation: "QA Engineer", joiningDate: "2025-01-15", status: "Active", contact: "+91 98201 33445" },
        { uid: "emp_4", empId: "EMP-104", name: "Sneha Joshi", department: "Human Resources", designation: "HR Executive", joiningDate: "2023-11-20", status: "Active", contact: "+91 98201 44556" },
      ],
    },
    small_business: {
      id: "small_business",
      name: "Small Business Attendance Sheet",
      entitySingular: "Staff Member",
      entityPlural: "Staff Members",
      idLabel: "Staff ID (Optional)",
      deptLabel: "Team / Department",
      roleLabel: "Role",
      managerLabel: "Manager / Owner Name",
      weeklyOffs: [0], // Sun only
      countLeaveAsPresent: false,
      defaultOrg: {
        name: "StudioCraft Retail & Design",
        department: "Store Operations",
        branch: "Bandra West Store",
        hrManager: "Vikram Mehta",
      },
      sampleEntities: [
        { uid: "emp_1", empId: "ST-01", name: "Karan Verma", department: "Sales", designation: "Store Lead", joiningDate: "2024-04-10", status: "Active", contact: "+91 98111 10001" },
        { uid: "emp_2", empId: "ST-02", name: "Neha Gupta", department: "Operations", designation: "Inventory Coordinator", joiningDate: "2024-08-18", status: "Active", contact: "+91 98111 10002" },
        { uid: "emp_3", empId: "", name: "Rohan Das", department: "Support", designation: "Customer Associate", joiningDate: "2025-02-01", status: "Active", contact: "+91 98111 10003" },
      ],
    },
    school: {
      id: "school",
      name: "School / Student Attendance Sheet",
      entitySingular: "Student",
      entityPlural: "Students",
      idLabel: "Roll No. (Optional)",
      deptLabel: "Class / Section",
      roleLabel: "House / Stream",
      managerLabel: "Class Teacher / Principal",
      weeklyOffs: [0], // Sun only
      countLeaveAsPresent: false,
      defaultOrg: {
        name: "Sunrise Public High School",
        department: "Grade 10 — Section A",
        branch: "Main Campus",
        hrManager: "Mrs. Kavita Rao",
      },
      sampleEntities: [
        { uid: "emp_1", empId: "10A-01", name: "Aarav Patel", department: "Grade 10-A", designation: "Science", joiningDate: "2026-06-15", status: "Active", contact: "+91 98222 20001" },
        { uid: "emp_2", empId: "10A-02", name: "Ananya Iyer", department: "Grade 10-A", designation: "Science", joiningDate: "2026-06-15", status: "Active", contact: "+91 98222 20002" },
        { uid: "emp_3", empId: "10A-03", name: "Kabir Singh", department: "Grade 10-A", designation: "Commerce", joiningDate: "2026-06-15", status: "Active", contact: "+91 98222 20003" },
        { uid: "emp_4", empId: "10A-04", name: "Diya Menon", department: "Grade 10-A", designation: "Arts", joiningDate: "2026-06-15", status: "Active", contact: "+91 98222 20004" },
      ],
    },
  };

  // IndexedDB Configuration
  const IDB_NAME = "OpenSignAttendanceDB";
  const IDB_VERSION = 1;
  const IDB_STORE = "attendanceWorkspace";
  const IDB_KEY = "activeSheetV1";

  const now = new Date();
  let state = createDefaultState("corporate", now.getFullYear(), now.getMonth());
  let undoStack = [];
  let searchQuery = "";
  let filterDept = "";
  let filterStatus = "";
  let sortMode = "default"; // 'default' | 'name_asc' | 'name_desc' | 'id_asc'
  let mobileViewMode = "cards"; // 'cards' | 'grid'
  let selectedEmployeeUids = new Set();
  let activeCellContext = null; // { uid, day }
  let editingEmployeeUid = null;
  let pendingAttendanceCsvRows = [];

  function createDefaultState(templateId, year, month) {
    const tpl = TEMPLATES[templateId] || TEMPLATES.corporate;
    const employees = tpl.sampleEntities.map((e) => ({ ...e }));
    const monthKey = formatMonthKey(year, month);
    const holidays = [
      {
        id: "hol_1",
        name: "Foundation / Organization Holiday",
        date: `${year}-${String(month + 1).padStart(2, "0")}-15`,
        type: "Company Holiday",
        description: "Scheduled organization holiday",
      },
    ];

    const records = { [monthKey]: {} };
    const notes = { [monthKey]: {} };

    // Populate clean initial attendance for sample team so dashboard & charts immediately work
    const daysInM = getDaysInMonth(year, month);
    const holDay = 15;
    employees.forEach((emp, eIdx) => {
      records[monthKey][emp.uid] = {};
      for (let d = 1; d <= daysInM; d++) {
        const dow = new Date(year, month, d).getDay();
        if (tpl.weeklyOffs.includes(dow)) {
          records[monthKey][emp.uid][d] = "WO";
        } else if (d === holDay) {
          records[monthKey][emp.uid][d] = "H";
        } else if (d <= Math.min(daysInM, 18)) {
          if (eIdx === 0 && d === 3) records[monthKey][emp.uid][d] = "A";
          else if (eIdx === 1 && d === 2) records[monthKey][emp.uid][d] = "L";
          else if (eIdx === 2 && d === 3) records[monthKey][emp.uid][d] = "HD";
          else if (eIdx === 3 && d === 6) records[monthKey][emp.uid][d] = "WFH";
          else records[monthKey][emp.uid][d] = "P";
        }
      }
    });

    return {
      templateId: tpl.id,
      year,
      month, // 0-indexed (0 = Jan, 11 = Dec)
      org: {
        name: tpl.defaultOrg.name,
        logoDataUrl: null,
        address: "Senapati Bapat Marg, Lower Parel, Mumbai 400013",
        phone: "+91 22 4890 6200",
        email: "hr@example.com",
        department: tpl.defaultOrg.department,
        branch: tpl.defaultOrg.branch,
        hrManager: tpl.defaultOrg.hrManager,
      },
      weeklyOffs: [...tpl.weeklyOffs],
      countLeaveAsPresent: tpl.countLeaveAsPresent,
      includeNotesInExport: false,
      statusLabels: { ...DEFAULT_STATUS_LABELS },
      employees,
      holidays,
      records, // { 'YYYY-MM': { [uid]: { [day]: 'P' | ... } } }
      notes,   // { 'YYYY-MM': { [uid]: { [day]: 'Medical leave' } } }
    };
  }

  /* ---------- Date & Calendar Helpers ---------- */
  function formatMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }

  function getDaysInMonth(year, month) {
    // Handles 28-day, 29-day leap February, 30-day, and 31-day months accurately
    return new Date(year, month + 1, 0).getDate();
  }

  function getWeekdayIndex(year, month, day) {
    return new Date(year, month, day).getDay();
  }

  function toIsoDate(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getMonthRecords() {
    const mk = formatMonthKey(state.year, state.month);
    if (!state.records[mk]) state.records[mk] = {};
    return state.records[mk];
  }

  function getMonthNotes() {
    const mk = formatMonthKey(state.year, state.month);
    if (!state.notes[mk]) state.notes[mk] = {};
    return state.notes[mk];
  }

  function getHolidaysForCurrentMonth() {
    const prefix = formatMonthKey(state.year, state.month) + "-";
    const map = new Map();
    for (const h of state.holidays) {
      if (h.date && h.date.startsWith(prefix)) {
        const dayNum = parseInt(h.date.slice(8, 10), 10);
        if (dayNum >= 1 && dayNum <= 31) map.set(dayNum, h);
      }
    }
    return map;
  }

  /* ---------- IndexedDB Local Storage Engine ---------- */
  function openAttendanceDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  let saveTimer = null;
  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const db = await openAttendanceDb();
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(state)), IDB_KEY);
        tx.oncomplete = () => db.close();
      } catch (_) {
        // Silent in-memory fallback if storage is restricted
      }
    }, 260);
  }

  async function loadPersistedState() {
    try {
      const db = await openAttendanceDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      });
    } catch (_) {
      return null;
    }
  }

  /* ---------- Undo Stack ---------- */
  function pushUndoSnapshot() {
    undoStack.push({
      year: state.year,
      month: state.month,
      records: JSON.parse(JSON.stringify(state.records)),
      notes: JSON.parse(JSON.stringify(state.notes)),
      employees: JSON.parse(JSON.stringify(state.employees)),
      holidays: JSON.parse(JSON.stringify(state.holidays)),
    });
    if (undoStack.length > 25) undoStack.shift();
    updateUndoButton();
  }

  function performUndo() {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    state.year = prev.year;
    state.month = prev.month;
    state.records = prev.records;
    state.notes = prev.notes;
    state.employees = prev.employees;
    state.holidays = prev.holidays;
    updateUndoButton();
    schedulePersist();
    renderAll();
    toast("Reverted last change.");
  }

  function updateUndoButton() {
    const btn = $("atUndoBtn");
    if (btn) btn.disabled = undoStack.length === 0;
  }

  /* ---------- Toast & Confirm Dialog ---------- */
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

  function confirmAction(title, message) {
    const dlg = $("atConfirmDialog");
    if (!dlg) return Promise.resolve(window.confirm(message));
    $("atConfirmTitle").textContent = title;
    $("atConfirmMsg").textContent = message;
    return new Promise((resolve) => {
      const okBtn = $("atConfirmOk");
      const cancelBtn = $("atConfirmCancel");
      const closeTop = $("atConfirmCloseTop");

      const cleanup = (ans) => {
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        closeTop.removeEventListener("click", onCancel);
        if (dlg.open) dlg.close();
        resolve(ans);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      closeTop.addEventListener("click", onCancel);
      dlg.showModal();
    });
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;")
      .replace(/\x27/g, "&#39;");
  }

  /* ---------- Core Attendance Calculation Engine ---------- */
  function calculateEmployeeSummary(empUid) {
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const monthRec = getMonthRecords()[empUid] || {};
    const holidayMap = getHolidaysForCurrentMonth();

    let present = 0;
    let absent = 0;
    let leave = 0;
    let halfDay = 0;
    let wfh = 0;
    let onDuty = 0;
    let weeklyOffs = 0;
    let holidays = 0;
    let unmarked = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const code = monthRec[d] || "";
      if (code === "P") present++;
      else if (code === "A") absent++;
      else if (code === "L") leave++;
      else if (code === "HD") halfDay++;
      else if (code === "WFH") wfh++;
      else if (code === "OD") onDuty++;
      else if (code === "WO") weeklyOffs++;
      else if (code === "H") holidays++;
      else {
        unmarked++;
        // If unmarked, check if date is a scheduled weekly off or holiday for eligible working day exclusion
        const dow = getWeekdayIndex(state.year, state.month, d);
        if (state.weeklyOffs.includes(dow)) weeklyOffs++;
        else if (holidayMap.has(d)) holidays++;
      }
    }

    const eligibleWorkingDays = Math.max(0, daysInMonth - weeklyOffs - holidays);
    const leaveCredit = state.countLeaveAsPresent ? leave * 1 : 0;
    const countedPresentDays = present + wfh + onDuty + halfDay * 0.5 + leaveCredit;
    const attendancePct =
      eligibleWorkingDays > 0
        ? Math.min(100, Math.round((countedPresentDays / eligibleWorkingDays) * 1000) / 10)
        : 0;

    return {
      daysInMonth,
      eligibleWorkingDays,
      present,
      absent,
      leave,
      halfDay,
      wfh,
      onDuty,
      weeklyOffs,
      holidays,
      unmarked,
      countedPresentDays,
      attendancePct,
    };
  }

  /* ---------- Filtered & Sorted Employees ---------- */
  function getFilteredEmployees() {
    const q = searchQuery.trim().toLowerCase();
    const monthRec = getMonthRecords();

    let list = state.employees.filter((emp) => {
      if (filterDept && (emp.department || "") !== filterDept) return false;
      if (q) {
        const hay = `${emp.name} ${emp.empId || ""} ${emp.department || ""} ${emp.designation || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus) {
        const empDays = monthRec[emp.uid] || {};
        const hasStatus = Object.values(empDays).includes(filterStatus);
        if (!hasStatus) return false;
      }
      return true;
    });

    if (sortMode === "name_asc") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "name_desc") {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === "id_asc") {
      list = [...list].sort((a, b) => (a.empId || "").localeCompare(b.empId || ""));
    }

    return list;
  }

  /* ---------- Render Summary KPI Cards & Live Charts ---------- */
  function renderDashboardSummary() {
    const totalEmps = state.employees.length;
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const today = new Date();
    const refDay =
      today.getFullYear() === state.year && today.getMonth() === state.month
        ? today.getDate()
        : 1;

    const monthRec = getMonthRecords();
    let presentRef = 0;
    let absentRef = 0;
    let leaveRef = 0;
    let pctSum = 0;

    const distCounts = { P: 0, WFH: 0, OD: 0, HD: 0, L: 0, A: 0 };
    const deptStats = new Map();
    const dailyPresent = new Array(daysInMonth).fill(0);

    for (const emp of state.employees) {
      const sum = calculateEmployeeSummary(emp.uid);
      pctSum += sum.attendancePct;

      const dayCode = (monthRec[emp.uid] || {})[refDay] || "";
      if (dayCode === "P" || dayCode === "WFH" || dayCode === "OD" || dayCode === "HD") presentRef++;
      else if (dayCode === "A") absentRef++;
      else if (dayCode === "L") leaveRef++;

      distCounts.P += sum.present;
      distCounts.WFH += sum.wfh;
      distCounts.OD += sum.onDuty;
      distCounts.HD += sum.halfDay;
      distCounts.L += sum.leave;
      distCounts.A += sum.absent;

      const dept = emp.department?.trim() || "General";
      if (!deptStats.has(dept)) deptStats.set(dept, { totalPct: 0, count: 0 });
      const dObj = deptStats.get(dept);
      dObj.totalPct += sum.attendancePct;
      dObj.count += 1;

      const empRec = monthRec[emp.uid] || {};
      for (let d = 1; d <= daysInMonth; d++) {
        const c = empRec[d];
        if (c === "P" || c === "WFH" || c === "OD") dailyPresent[d - 1] += 1;
        else if (c === "HD") dailyPresent[d - 1] += 0.5;
      }
    }

    const avgPct = totalEmps > 0 ? Math.round((pctSum / totalEmps) * 10) / 10 : 0;

    $("kpiTotalEmp").textContent = String(totalEmps);
    $("kpiPresentToday").textContent = String(presentRef);
    $("kpiAbsentToday").textContent = String(absentRef);
    $("kpiLeaveToday").textContent = String(leaveRef);
    $("kpiAvgRate").textContent = `${avgPct.toFixed(1)}%`;
    $("kpiRefDateSub").textContent = `Day ${refDay} (${MONTHS[state.month].slice(0, 3)} ${refDay})`;

    // 1. Department Breakdown Bars
    const deptContainer = $("atDeptBreakdown");
    deptContainer.innerHTML = "";
    if (deptStats.size === 0) {
      deptContainer.innerHTML = `<p style="margin:0;font-size:13px;color:var(--muted)">Add employees to see department attendance rates.</p>`;
    } else {
      for (const [deptName, info] of deptStats.entries()) {
        const rate = Math.round((info.totalPct / info.count) * 10) / 10;
        const item = document.createElement("div");
        item.className = "at-bar-item";
        item.innerHTML = `
          <div class="at-bar-meta">
            <span>${esc(deptName)} (${info.count})</span>
            <strong>${rate.toFixed(1)}%</strong>
          </div>
          <div class="at-bar-track"><div class="at-bar-fill" style="width:${Math.min(100, rate)}%"></div></div>
        `;
        deptContainer.appendChild(item);
      }
    }

    // 2. Attendance Distribution Visual (SVG Donut + Legend)
    const distContainer = $("atDistChart");
    const totalMarked = Object.values(distCounts).reduce((a, b) => a + b, 0);
    if (totalMarked === 0) {
      distContainer.innerHTML = `<p style="margin:0;font-size:13px;color:var(--muted)">Mark daily statuses in the grid to view distribution.</p>`;
    } else {
      const slices = [
        { label: "Present", val: distCounts.P, color: "#15803d" },
        { label: "WFH / OD", val: distCounts.WFH + distCounts.OD, color: "#4c00ff" },
        { label: "Half Day", val: distCounts.HD, color: "#0369a1" },
        { label: "Leave", val: distCounts.L, color: "#d97706" },
        { label: "Absent", val: distCounts.A, color: "#d92d20" },
      ].filter((s) => s.val > 0);

      let offset = 0;
      const radius = 36;
      const circ = 2 * Math.PI * radius;
      const circles = slices
        .map((sl) => {
          const dash = (sl.val / totalMarked) * circ;
          const el = `<circle cx="48" cy="48" r="${radius}" fill="none" stroke="${sl.color}" stroke-width="14" stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" />`;
          offset += dash;
          return el;
        })
        .join("");

      const legendHtml = slices
        .map(
          (sl) =>
            `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px">
              <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:${sl.color}"></span>${sl.label}</span>
              <strong>${sl.val}</strong>
            </div>`
        )
        .join("");

      distContainer.innerHTML = `
        <div class="at-donut-wrap">
          <svg width="96" height="96" viewBox="0 0 96 96" style="transform:rotate(-90deg);flex:none" aria-label="Attendance status distribution chart">
            ${circles}
          </svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:5px">${legendHtml}</div>
        </div>
      `;
    }

    // 3. Daily Attendance Trend Bar Chart
    const trendContainer = $("atTrendChart");
    const maxDaily = Math.max(1, totalEmps);
    const barsHtml = dailyPresent
      .map((cnt, idx) => {
        const hPct = Math.round((cnt / maxDaily) * 100);
        return `<div class="at-trend-col" style="height:${Math.max(4, hPct)}%" title="Day ${idx + 1}: ${cnt} counted present"></div>`;
      })
      .join("");
    trendContainer.innerHTML = `
      <div class="at-trend-bars" role="img" aria-label="Daily attendance trend for ${MONTHS[state.month]} ${state.year}">
        ${barsHtml}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px">
        <span>Day 1</span>
        <span>Day ${Math.ceil(daysInMonth / 2)}</span>
        <span>Day ${daysInMonth}</span>
      </div>
    `;
  }

  /* ---------- Render Employee Directory Table & Department Filter ---------- */
  function renderEmployeeDirectory() {
    const tbody = $("atEmpTableBody");
    const deptSelect = $("atFilterDept");
    const tpl = TEMPLATES[state.templateId] || TEMPLATES.corporate;

    // Sync department dropdown options
    const depts = Array.from(new Set(state.employees.map((e) => (e.department || "").trim()).filter(Boolean))).sort();
    const prevDept = deptSelect.value;
    deptSelect.innerHTML = `<option value="">All ${tpl.deptLabel}s</option>`;
    for (const d of depts) {
      const o = document.createElement("option");
      o.value = d;
      o.textContent = d;
      deptSelect.appendChild(o);
    }
    if (depts.includes(prevDept)) deptSelect.value = prevDept;

    const list = getFilteredEmployees();
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:18px">No matching ${tpl.entityPlural.toLowerCase()} found. Add one above or clear filters.</td></tr>`;
      return;
    }

    for (const emp of list) {
      const tr = document.createElement("tr");
      const checked = selectedEmployeeUids.has(emp.uid);
      tr.innerHTML = `
        <td><input type="checkbox" data-emp-select="${esc(emp.uid)}" ${checked ? "checked" : ""} aria-label="Select ${esc(emp.name)}" /></td>
        <td><strong>${esc(emp.empId || "—")}</strong></td>
        <td><button type="button" class="at-emp-link" data-open-indiv="${esc(emp.uid)}">${esc(emp.name)}</button></td>
        <td>${esc(emp.department || "—")}</td>
        <td>${esc(emp.designation || "—")}</td>
        <td><span class="at-status-tag">${esc(emp.status || "Active")}</span></td>
        <td>
          <div style="display:inline-flex;gap:6px">
            <button type="button" class="at-mini-btn" style="min-height:28px;padding:0 9px;font-size:12px" data-edit-emp="${esc(emp.uid)}">Edit</button>
            <button type="button" class="at-mini-btn danger" style="min-height:28px;padding:0 9px;font-size:12px" data-del-emp="${esc(emp.uid)}">Remove</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Bind table actions
    tbody.querySelectorAll("[data-emp-select]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const uid = cb.dataset.empSelect;
        if (cb.checked) selectedEmployeeUids.add(uid);
        else selectedEmployeeUids.delete(uid);
        updateBulkSelectedLabel();
      });
    });

    tbody.querySelectorAll("[data-open-indiv]").forEach((btn) => {
      btn.addEventListener("click", () => openIndividualReport(btn.dataset.openIndiv));
    });

    tbody.querySelectorAll("[data-edit-emp]").forEach((btn) => {
      btn.addEventListener("click", () => openEditEmployeeModal(btn.dataset.editEmp));
    });

    tbody.querySelectorAll("[data-del-emp]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.delEmp;
        const emp = state.employees.find((e) => e.uid === uid);
        if (!emp) return;
        const ok = await confirmAction(
          `Remove ${tpl.entitySingular}`,
          `Remove "${emp.name}" and their attendance records from this sheet?`
        );
        if (!ok) return;
        pushUndoSnapshot();
        state.employees = state.employees.filter((e) => e.uid !== uid);
        selectedEmployeeUids.delete(uid);
        schedulePersist();
        renderAll();
        toast(`Removed ${emp.name}.`);
      });
    });
  }

  function updateBulkSelectedLabel() {
    const lbl = $("atBulkSelCount");
    if (lbl) lbl.textContent = `${selectedEmployeeUids.size} selected`;
  }

  /* ---------- Render Holidays Table ---------- */
  function renderHolidaysList() {
    const tbody = $("atHolidaysBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const sorted = [...state.holidays].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:14px">No holidays configured yet. Add organization holidays above.</td></tr>`;
      return;
    }

    for (const h of sorted) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${esc(h.name)}</strong></td>
        <td>${esc(h.date)}</td>
        <td>${esc(h.type || "Company Holiday")}</td>
        <td>${esc(h.description || "—")}</td>
        <td>
          <button type="button" class="at-mini-btn danger" style="min-height:28px;padding:0 9px;font-size:12px" data-del-hol="${esc(h.id)}">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("[data-del-hol]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.delHol;
        pushUndoSnapshot();
        state.holidays = state.holidays.filter((h) => h.id !== id);
        schedulePersist();
        renderAll();
        toast("Holiday removed.");
      });
    });
  }

  /* ---------- Render Main Monthly Attendance Matrix & Mobile Card View ---------- */
  function renderAttendanceMatrix() {
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const holidayMap = getHolidaysForCurrentMonth();
    const monthRec = getMonthRecords();
    const monthNotes = getMonthNotes();
    const employees = getFilteredEmployees();
    const tpl = TEMPLATES[state.templateId] || TEMPLATES.corporate;

    $("atMonthHeading").textContent = `${MONTHS[state.month]} ${state.year} (${daysInMonth} days)`;
    $("atMonthSelect").value = String(state.month);
    $("atYearInput").value = String(state.year);

    // Sync bulk day dropdown
    const bulkDaySel = $("atBulkDaySelect");
    const prevDay = parseInt(bulkDaySel.value || "1", 10);
    bulkDaySel.innerHTML = "";
    for (let d = 1; d <= daysInMonth; d++) {
      const wk = WEEKDAYS_SHORT[getWeekdayIndex(state.year, state.month, d)];
      const opt = document.createElement("option");
      opt.value = String(d);
      opt.textContent = `Day ${d} (${wk})`;
      bulkDaySel.appendChild(opt);
    }
    bulkDaySel.value = String(prevDay >= 1 && prevDay <= daysInMonth ? prevDay : 1);

    // Build Table Header
    const thead = $("atMatrixHead");
    let headHtml = `<tr>
      <th class="at-sticky-emp">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span>${esc(tpl.entitySingular)}</span>
          <span style="font-size:10px;opacity:0.75">Click name for report</span>
        </div>
      </th>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dow = getWeekdayIndex(state.year, state.month, d);
      const wk = WEEKDAYS_SHORT[dow];
      const isWo = state.weeklyOffs.includes(dow);
      const hol = holidayMap.get(d);
      const cls = hol ? "is-holiday-col" : isWo ? "is-weekoff-col" : "";
      const titleAttr = hol ? ` title="Holiday: ${esc(hol.name)}"` : isWo ? ` title="Weekly Off (${wk})"` : "";
      headHtml += `<th class="${cls}"${titleAttr}><span class="at-day-num">${d}</span><span class="at-day-wk">${wk}</span></th>`;
    }

    headHtml += `
      <th class="at-sum-th" title="Present">P</th>
      <th class="at-sum-th" title="Absent">A</th>
      <th class="at-sum-th" title="Leave">L</th>
      <th class="at-sum-th" title="Half Day">HD</th>
      <th class="at-sum-th" title="Work From Home">WFH</th>
      <th class="at-sum-th" title="On Duty">OD</th>
      <th class="at-sum-th" title="Attendance Percentage">Att %</th>
    </tr>`;
    thead.innerHTML = headHtml;

    // Build Table Body
    const tbody = $("atMatrixBody");
    tbody.innerHTML = "";

    if (!employees.length) {
      tbody.innerHTML = `<tr><td colspan="${daysInMonth + 8}" style="padding:24px;text-align:center;color:var(--muted)">No ${tpl.entityPlural.toLowerCase()} to display. Add ${tpl.entityPlural.toLowerCase()} in the Employee Management section above.</td></tr>`;
    } else {
      for (const emp of employees) {
        const empRec = monthRec[emp.uid] || {};
        const empNotes = monthNotes[emp.uid] || {};
        const sum = calculateEmployeeSummary(emp.uid);

        const tr = document.createElement("tr");
        let rowHtml = `
          <td class="at-sticky-emp">
            <div class="at-emp-cell-inner">
              <div class="at-emp-cell-meta">
                <button type="button" class="at-emp-link" data-open-indiv="${esc(emp.uid)}">${esc(emp.name)}</button>
                <span class="at-emp-sub">${esc([emp.empId, emp.department].filter(Boolean).join(" · ") || tpl.entitySingular)}</span>
              </div>
              <button type="button" class="at-mini-btn" style="min-height:26px;padding:0 7px;font-size:11px" data-row-fill="${esc(emp.uid)}" title="Mark all working days Present">All P</button>
            </div>
          </td>`;

        for (let d = 1; d <= daysInMonth; d++) {
          const dow = getWeekdayIndex(state.year, state.month, d);
          const isWo = state.weeklyOffs.includes(dow);
          const hol = holidayMap.get(d);
          const colCls = hol ? "is-holiday-col" : isWo ? "is-weekoff-col" : "";
          const code = empRec[d] || "";
          const noteTxt = empNotes[d] || "";
          const badgeCls = code ? `st-${code}` : "st-NONE";
          const tip = [
            `${emp.name} — ${MONTHS[state.month]} ${d}, ${state.year}`,
            code ? `Status: ${state.statusLabels[code] || code}` : "Unmarked (click to mark)",
            hol ? `Holiday: ${hol.name}` : "",
            noteTxt ? `Note: ${noteTxt}` : "",
          ]
            .filter(Boolean)
            .join(" | ");

          rowHtml += `
            <td class="at-day-cell ${colCls}">
              <button
                type="button"
                class="at-cell-btn ${badgeCls}${noteTxt ? " has-note" : ""}"
                data-uid="${esc(emp.uid)}"
                data-day="${d}"
                title="${esc(tip)}"
                aria-label="${esc(tip)}"
              >${code || "·"}</button>
            </td>`;
        }

        rowHtml += `
          <td class="at-sum-td">${sum.present}</td>
          <td class="at-sum-td">${sum.absent}</td>
          <td class="at-sum-td">${sum.leave}</td>
          <td class="at-sum-td">${sum.halfDay}</td>
          <td class="at-sum-td">${sum.wfh}</td>
          <td class="at-sum-td">${sum.onDuty}</td>
          <td class="at-sum-td is-pct">${sum.attendancePct.toFixed(1)}%</td>
        `;
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
      }
    }

    // Bind cell clicks & row fill buttons
    tbody.querySelectorAll(".at-cell-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openCellEditorModal(btn.dataset.uid, Number(btn.dataset.day));
      });
    });

    tbody.querySelectorAll("[data-open-indiv]").forEach((btn) => {
      btn.addEventListener("click", () => openIndividualReport(btn.dataset.openIndiv));
    });

    tbody.querySelectorAll("[data-row-fill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.rowFill;
        pushUndoSnapshot();
        const rec = getMonthRecords();
        if (!rec[uid]) rec[uid] = {};
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = getWeekdayIndex(state.year, state.month, d);
          if (holidayMap.has(d)) rec[uid][d] = "H";
          else if (state.weeklyOffs.includes(dow)) rec[uid][d] = "WO";
          else rec[uid][d] = "P";
        }
        schedulePersist();
        renderAll();
        toast("Marked all working days Present for employee.");
      });
    });

    // Render Mobile Employee-by-Employee Cards
    renderMobileEmployeeCards(employees, daysInMonth, holidayMap, monthRec, monthNotes);
  }

  function renderMobileEmployeeCards(employees, daysInMonth, holidayMap, monthRec, monthNotes) {
    const wrap = $("atMobileCards");
    if (!wrap) return;
    wrap.innerHTML = "";

    for (const emp of employees) {
      const empRec = monthRec[emp.uid] || {};
      const empNotes = monthNotes[emp.uid] || {};
      const sum = calculateEmployeeSummary(emp.uid);

      const card = document.createElement("article");
      card.className = "at-mob-emp-card";

      let pillsHtml = "";
      for (let d = 1; d <= daysInMonth; d++) {
        const code = empRec[d] || "";
        const badgeCls = code ? `st-${code}` : "st-NONE";
        const noteMark = empNotes[d] ? "•" : "";
        pillsHtml += `
          <button type="button" class="at-mob-day-pill ${badgeCls}" data-uid="${esc(emp.uid)}" data-day="${d}">
            <span style="font-size:9.5px;opacity:0.75">${d}${noteMark}</span>
            <span>${code || "·"}</span>
          </button>`;
      }

      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>
            <button type="button" class="at-emp-link" data-open-indiv="${esc(emp.uid)}">${esc(emp.name)}</button>
            <div style="font-size:12px;color:var(--muted)">${esc([emp.empId, emp.department].filter(Boolean).join(" · "))}</div>
          </div>
          <span class="st-badge st-WFH" style="padding:0 10px;font-size:12px">${sum.attendancePct.toFixed(1)}%</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--muted)">
          <span>P: <strong style="color:var(--ink)">${sum.present}</strong></span>
          <span>A: <strong style="color:var(--ink)">${sum.absent}</strong></span>
          <span>L: <strong style="color:var(--ink)">${sum.leave}</strong></span>
          <span>HD: <strong style="color:var(--ink)">${sum.halfDay}</strong></span>
          <span>WFH: <strong style="color:var(--ink)">${sum.wfh}</strong></span>
        </div>
        <div class="at-mob-days-grid">${pillsHtml}</div>
      `;
      wrap.appendChild(card);
    }

    wrap.querySelectorAll(".at-mob-day-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        openCellEditorModal(btn.dataset.uid, Number(btn.dataset.day));
      });
    });

    wrap.querySelectorAll("[data-open-indiv]").forEach((btn) => {
      btn.addEventListener("click", () => openIndividualReport(btn.dataset.openIndiv));
    });
  }

  /* ---------- Cell Status & Private Note Modal ---------- */
  function openCellEditorModal(uid, day) {
    const dlg = $("atCellDialog");
    const emp = state.employees.find((e) => e.uid === uid);
    if (!dlg || !emp) return;

    activeCellContext = { uid, day };
    const wk = WEEKDAYS_SHORT[getWeekdayIndex(state.year, state.month, day)];
    $("atCellDlgTitle").textContent = `${emp.name} — ${MONTHS[state.month]} ${day}, ${state.year} (${wk})`;

    const currentCode = (getMonthRecords()[uid] || {})[day] || "";
    const currentNote = (getMonthNotes()[uid] || {})[day] || "";
    $("atCellNoteInput").value = currentNote;

    const btnGrid = $("atCellStatusBtns");
    btnGrid.innerHTML = "";
    STATUS_CODES.forEach((code) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `at-mini-btn st-${code}`;
      b.style.justifyContent = "flex-start";
      b.style.fontWeight = "700";
      b.textContent = `${code} — ${state.statusLabels[code] || code}`;
      if (code === currentCode) b.style.boxShadow = "0 0 0 2.5px var(--accent)";
      b.addEventListener("click", () => {
        applyCellUpdate(uid, day, code, $("atCellNoteInput").value);
        dlg.close();
      });
      btnGrid.appendChild(b);
    });

    dlg.showModal();
  }

  function applyCellUpdate(uid, day, code, noteStr) {
    pushUndoSnapshot();
    const rec = getMonthRecords();
    const notes = getMonthNotes();
    if (!rec[uid]) rec[uid] = {};
    if (!notes[uid]) notes[uid] = {};

    if (code) rec[uid][day] = code;
    else delete rec[uid][day];

    const cleanNote = noteStr.trim();
    if (cleanNote) notes[uid][day] = cleanNote;
    else delete notes[uid][day];

    schedulePersist();
    renderAll();
  }

  /* ---------- Individual Employee Attendance Report Modal ---------- */
  function openIndividualReport(uid) {
    const dlg = $("atIndivDialog");
    const emp = state.employees.find((e) => e.uid === uid);
    if (!dlg || !emp) return;

    const sum = calculateEmployeeSummary(uid);
    const daysInMonth = sum.daysInMonth;
    const empRec = getMonthRecords()[uid] || {};
    const empNotes = getMonthNotes()[uid] || {};

    $("atIndivName").textContent = emp.name;
    $("atIndivMeta").textContent = [
      emp.empId ? `ID: ${emp.empId}` : "",
      emp.department ? `Dept: ${emp.department}` : "",
      emp.designation ? `Role: ${emp.designation}` : "",
      `${MONTHS[state.month]} ${state.year}`,
    ]
      .filter(Boolean)
      .join(" · ");

    $("atIndivStats").innerHTML = `
      <div class="at-val-stat"><span>Eligible Working Days</span><strong>${sum.eligibleWorkingDays}</strong></div>
      <div class="at-val-stat"><span>Present (P)</span><strong>${sum.present}</strong></div>
      <div class="at-val-stat"><span>Absent (A)</span><strong>${sum.absent}</strong></div>
      <div class="at-val-stat"><span>Leave (L)</span><strong>${sum.leave}</strong></div>
      <div class="at-val-stat"><span>Half Day (HD)</span><strong>${sum.halfDay}</strong></div>
      <div class="at-val-stat"><span>WFH / On Duty</span><strong>${sum.wfh} / ${sum.onDuty}</strong></div>
      <div class="at-val-stat"><span>Weekly Off / Holiday</span><strong>${sum.weeklyOffs} / ${sum.holidays}</strong></div>
      <div class="at-val-stat"><span>Attendance %</span><strong style="color:var(--accent)">${sum.attendancePct.toFixed(1)}%</strong></div>
    `;

    const cal = $("atIndivCal");
    cal.innerHTML = "";
    for (let d = 1; d <= daysInMonth; d++) {
      const code = empRec[d] || "";
      const wk = WEEKDAYS_SHORT[getWeekdayIndex(state.year, state.month, d)];
      const cell = document.createElement("div");
      cell.className = `at-indiv-day ${code ? `st-${code}` : "st-NONE"}`;
      cell.innerHTML = `<div>${d} ${wk}</div><div style="font-size:12px;margin-top:2px">${code || "—"}</div>`;
      if (empNotes[d]) cell.title = empNotes[d];
      cal.appendChild(cell);
    }

    const noteEntries = Object.entries(empNotes).filter(([, txt]) => txt);
    const notesBox = $("atIndivNotesBox");
    if (noteEntries.length) {
      notesBox.hidden = false;
      notesBox.innerHTML =
        `<strong>Recorded Notes:</strong> ` +
        noteEntries.map(([d, txt]) => `Day ${d}: ${esc(txt)}`).join(" | ");
    } else {
      notesBox.hidden = true;
    }

    $("atIndivPdfBtn").onclick = () => exportPdfReport([emp]);
    $("atIndivPrintBtn").onclick = () => window.print();
    dlg.showModal();
  }

  /* ---------- Edit Employee Modal ---------- */
  function openEditEmployeeModal(uid) {
    const dlg = $("atEditEmpDialog");
    const emp = state.employees.find((e) => e.uid === uid);
    if (!dlg || !emp) return;

    editingEmployeeUid = uid;
    $("atEditEmpId").value = emp.empId || "";
    $("atEditEmpName").value = emp.name || "";
    $("atEditEmpDept").value = emp.department || "";
    $("atEditEmpRole").value = emp.designation || "";
    $("atEditEmpJoin").value = emp.joiningDate || "";
    $("atEditEmpStatus").value = emp.status || "Active";
    $("atEditEmpPhone").value = emp.contact || "";
    dlg.showModal();
  }

  /* ---------- Excel Export (SheetJS .xlsx — 3 Sheets) ---------- */
  function exportExcelWorkbook() {
    if (!window.XLSX) {
      toast("Excel export library (SheetJS) failed to load.", "error");
      return;
    }

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const monthRec = getMonthRecords();
    const monthNotes = getMonthNotes();
    const employees = getFilteredEmployees();
    const monthTitle = `${MONTHS[state.month]} ${state.year}`;

    // Sheet 1: Monthly Attendance
    const s1Rows = [
      [state.org.name || "Organization Attendance Register"],
      [
        `Period: ${monthTitle}`,
        `Department: ${state.org.department || "All"}`,
        `Branch: ${state.org.branch || "-"}`,
        `HR Manager: ${state.org.hrManager || "-"}`,
      ],
      [],
    ];

    const dayHeaders = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const wk = WEEKDAYS_SHORT[getWeekdayIndex(state.year, state.month, d)];
      dayHeaders.push(`${d} (${wk})`);
    }
    const s1Header = [
      "Employee ID",
      "Employee Name",
      "Department",
      "Designation",
      ...dayHeaders,
      "Present",
      "Absent",
      "Leave",
      "Half Day",
      "WFH",
      "On Duty",
      "Weekly Off",
      "Holiday",
      "Eligible Days",
      "Attendance %",
      ...(state.includeNotesInExport ? ["Notes"] : []),
    ];
    s1Rows.push(s1Header);

    for (const emp of employees) {
      const rec = monthRec[emp.uid] || {};
      const sum = calculateEmployeeSummary(emp.uid);
      const dayCells = [];
      for (let d = 1; d <= daysInMonth; d++) dayCells.push(rec[d] || "");

      const row = [
        emp.empId || "",
        emp.name,
        emp.department || "",
        emp.designation || "",
        ...dayCells,
        sum.present,
        sum.absent,
        sum.leave,
        sum.halfDay,
        sum.wfh,
        sum.onDuty,
        sum.weeklyOffs,
        sum.holidays,
        sum.eligibleWorkingDays,
        `${sum.attendancePct.toFixed(1)}%`,
      ];
      if (state.includeNotesInExport) {
        const nMap = monthNotes[emp.uid] || {};
        const nStr = Object.entries(nMap)
          .filter(([, v]) => v)
          .map(([d, v]) => `Day ${d}: ${v}`)
          .join("; ");
        row.push(nStr);
      }
      s1Rows.push(row);
    }

    const ws1 = XLSX.utils.aoa_to_sheet(s1Rows);
    ws1["!freeze"] = { xSplit: 2, ySplit: 4 };
    ws1["!cols"] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      ...Array(daysInMonth).fill({ wch: 7 }),
      { wch: 9 },
      { wch: 9 },
      { wch: 9 },
      { wch: 10 },
      { wch: 8 },
      { wch: 9 },
      { wch: 11 },
      { wch: 9 },
      { wch: 13 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Monthly Attendance");

    // Sheet 2: Employee Summary
    const s2Rows = [
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Designation",
        "Joining Date",
        "Status",
        "Present Days",
        "Absent Days",
        "Leave Days",
        "Half Days",
        "WFH Days",
        "On Duty Days",
        "Eligible Working Days",
        "Counted Present Days",
        "Attendance %",
      ],
      ...employees.map((emp) => {
        const sum = calculateEmployeeSummary(emp.uid);
        return [
          emp.empId || "",
          emp.name,
          emp.department || "",
          emp.designation || "",
          emp.joiningDate || "",
          emp.status || "Active",
          sum.present,
          sum.absent,
          sum.leave,
          sum.halfDay,
          sum.wfh,
          sum.onDuty,
          sum.eligibleWorkingDays,
          sum.countedPresentDays,
          `${sum.attendancePct.toFixed(1)}%`,
        ];
      }),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
    ws2["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws2["!cols"] = [
      { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
      { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 13 },
      { wch: 18 }, { wch: 18 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Employee Summary");

    // Sheet 3: Holiday List
    const s3Rows = [
      ["Holiday Name", "Holiday Date", "Holiday Type", "Description"],
      ...state.holidays.map((h) => [h.name, h.date, h.type || "Company Holiday", h.description || ""]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(s3Rows);
    ws3["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws3["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Holiday List");

    XLSX.writeFile(wb, "opensign-attendance-sheet.xlsx");
    toast("Exported opensign-attendance-sheet.xlsx");
  }

  /* ---------- PDF Export (pdf-lib A4 Landscape Multi-Page Report) ---------- */
  function sanitizePdf(str) {
    return String(str || "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function exportPdfReport(subsetEmployees = null) {
    if (!window.PDFLib) {
      toast("PDF library (pdf-lib) failed to load.", "error");
      return;
    }

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const employees = subsetEmployees || getFilteredEmployees();
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const monthRec = getMonthRecords();
    const monthTitle = `${MONTHS[state.month]} ${state.year}`;

    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    // A4 Landscape
    const PAGE_W = 841.89;
    const PAGE_H = 595.28;
    const M = 28;
    const W = PAGE_W - M * 2;

    const COL_INK = rgb(0.075, 0, 0.196);
    const COL_ACCENT = rgb(0.298, 0, 1);
    const COL_MUTED = rgb(0.35, 0.31, 0.43);
    const COL_LINE = rgb(0.84, 0.82, 0.9);
    const COL_TINT = rgb(0.965, 0.955, 0.985);
    const COL_WHITE = rgb(1, 1, 1);

    let logoImg = null;
    if (state.org.logoDataUrl) {
      try {
        logoImg = await doc.embedPng(state.org.logoDataUrl);
      } catch (_) {}
    }

    const nameColW = 128;
    const sumColsW = 152; // P, A, L, HD, WFH, %
    const daysAreaW = W - nameColW - sumColsW;
    const dayColW = daysAreaW / daysInMonth;

    const drawHeader = (page) => {
      let topY = PAGE_H - M;
      let textX = M;
      if (logoImg) {
        const sc = Math.min(72 / logoImg.width, 32 / logoImg.height, 1);
        const lw = logoImg.width * sc;
        const lh = logoImg.height * sc;
        page.drawImage(logoImg, { x: M, y: topY - lh, width: lw, height: lh });
        textX = M + lw + 10;
      }

      page.drawText(sanitizePdf(state.org.name || "Organization Attendance Report"), {
        x: textX,
        y: topY - 13,
        size: 13,
        font: fontBold,
        color: COL_INK,
      });

      const subInfo = [
        state.org.address,
        state.org.department ? `Dept: ${state.org.department}` : "",
        state.org.branch ? `Branch: ${state.org.branch}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      if (subInfo) {
        page.drawText(sanitizePdf(subInfo).slice(0, 110), {
          x: textX,
          y: topY - 26,
          size: 8,
          font: fontReg,
          color: COL_MUTED,
        });
      }

      const titleRight = sanitizePdf(`ATTENDANCE REGISTER — ${monthTitle.toUpperCase()}`);
      const tw = fontBold.widthOfTextAtSize(titleRight, 11);
      page.drawText(titleRight, { x: PAGE_W - M - tw, y: topY - 14, size: 11, font: fontBold, color: COL_ACCENT });

      const genStr = `Generated: ${new Date().toLocaleDateString("en-GB")}`;
      const gw = fontReg.widthOfTextAtSize(genStr, 8);
      page.drawText(genStr, { x: PAGE_W - M - gw, y: topY - 26, size: 8, font: fontReg, color: COL_MUTED });

      const tableTop = topY - 40;
      page.drawRectangle({ x: M, y: tableTop - 22, width: W, height: 22, color: COL_INK });
      page.drawText("Employee", { x: M + 6, y: tableTop - 15, size: 8, font: fontBold, color: COL_WHITE });

      for (let d = 1; d <= daysInMonth; d++) {
        const cx = M + nameColW + (d - 1) * dayColW + dayColW / 2;
        const ds = String(d);
        const dw = fontBold.widthOfTextAtSize(ds, 6.8);
        page.drawText(ds, { x: cx - dw / 2, y: tableTop - 10, size: 6.8, font: fontBold, color: COL_WHITE });
        const wk = WEEKDAYS_SHORT[getWeekdayIndex(state.year, state.month, d)].slice(0, 2);
        const ww = fontReg.widthOfTextAtSize(wk, 5.5);
        page.drawText(wk, { x: cx - ww / 2, y: tableTop - 18, size: 5.5, font: fontReg, color: rgb(0.8, 0.76, 0.95) });
      }

      const sumHeaders = ["P", "A", "L", "HD", "WFH", "Att%"];
      const eachSumW = sumColsW / sumHeaders.length;
      sumHeaders.forEach((sh, idx) => {
        const sx = M + nameColW + daysAreaW + idx * eachSumW + eachSumW / 2;
        const sw = fontBold.widthOfTextAtSize(sh, 7);
        page.drawText(sh, { x: sx - sw / 2, y: tableTop - 15, size: 7, font: fontBold, color: COL_WHITE });
      });

      return tableTop - 22;
    };

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = drawHeader(page);
    const rowH = 19;

    employees.forEach((emp, rowIdx) => {
      if (y - rowH < M + 62) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = drawHeader(page);
      }

      if (rowIdx % 2 === 1) {
        page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: COL_TINT });
      }

      const label = sanitizePdf(emp.empId ? `${emp.empId} ${emp.name}` : emp.name).slice(0, 24);
      page.drawText(label, { x: M + 5, y: y - 13, size: 7.5, font: fontBold, color: COL_INK });

      const rec = monthRec[emp.uid] || {};
      for (let d = 1; d <= daysInMonth; d++) {
        const code = rec[d] || "-";
        const cx = M + nameColW + (d - 1) * dayColW + dayColW / 2;
        const cw = fontReg.widthOfTextAtSize(code, 6.2);
        const col =
          code === "A"
            ? rgb(0.7, 0.14, 0.1)
            : code === "P" || code === "WFH"
              ? rgb(0.08, 0.5, 0.24)
              : code === "H"
                ? COL_ACCENT
                : COL_INK;
        page.drawText(code, { x: cx - cw / 2, y: y - 13, size: 6.2, font: code === "-" ? fontReg : fontBold, color: col });
      }

      const sum = calculateEmployeeSummary(emp.uid);
      const sumVals = [
        String(sum.present),
        String(sum.absent),
        String(sum.leave),
        String(sum.halfDay),
        String(sum.wfh),
        `${sum.attendancePct.toFixed(0)}%`,
      ];
      const eachSumW = sumColsW / sumVals.length;
      sumVals.forEach((sv, idx) => {
        const sx = M + nameColW + daysAreaW + idx * eachSumW + eachSumW / 2;
        const sw = fontBold.widthOfTextAtSize(sv, 7.2);
        page.drawText(sv, {
          x: sx - sw / 2,
          y: y - 13,
          size: 7.2,
          font: fontBold,
          color: idx === 5 ? COL_ACCENT : COL_INK,
        });
      });

      y -= rowH;
      page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: COL_LINE });
    });

    // Status Legend & HR Signature Footer on Last Page
    if (y - 54 < M) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M - 20;
    }
    const legendText =
      "Legend: P = Present | A = Absent | L = Leave | H = Holiday | WO = Weekly Off | HD = Half Day | WFH = Work From Home | OD = On Duty";
    page.drawText(legendText, { x: M, y: M + 36, size: 7.5, font: fontReg, color: COL_MUTED });

    const sigLabel = sanitizePdf(state.org.hrManager ? `Authorized Signatory: ${state.org.hrManager}` : "HR / Authorized Signature");
    const sigW = fontBold.widthOfTextAtSize(sigLabel, 8.5);
    page.drawLine({ start: { x: PAGE_W - M - 160, y: M + 32 }, end: { x: PAGE_W - M, y: M + 32 }, thickness: 0.8, color: COL_INK });
    page.drawText(sigLabel, { x: PAGE_W - M - sigW, y: M + 20, size: 8.5, font: fontBold, color: COL_INK });

    const pages = doc.getPages();
    pages.forEach((p, idx) => {
      p.drawText(`Generated with Open Sign  |  Page ${idx + 1} of ${pages.length}`, {
        x: M,
        y: 12,
        size: 7.5,
        font: fontReg,
        color: COL_MUTED,
      });
    });

    const bytes = await doc.save();
    const fname =
      subsetEmployees && subsetEmployees.length === 1
        ? `opensign-attendance-${subsetEmployees[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`
        : "opensign-attendance-report.pdf";
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), fname);
    toast(`Downloaded ${fname}`);
  }

  /* ---------- CSV Export & CSV Import Parsers ---------- */
  function csvEscape(val) {
    const s = String(val ?? "");
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportAttendanceCsv() {
    const daysInMonth = getDaysInMonth(state.year, state.month);
    const monthRec = getMonthRecords();
    const monthNotes = getMonthNotes();
    const employees = getFilteredEmployees();

    const dayCols = [];
    for (let d = 1; d <= daysInMonth; d++) dayCols.push(toIsoDate(state.year, state.month, d));

    const rows = [
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Designation",
        ...dayCols,
        "Present",
        "Absent",
        "Leave",
        "Half Day",
        "WFH",
        "On Duty",
        "Attendance %",
        ...(state.includeNotesInExport ? ["Notes"] : []),
      ],
    ];

    for (const emp of employees) {
      const rec = monthRec[emp.uid] || {};
      const sum = calculateEmployeeSummary(emp.uid);
      const cells = [];
      for (let d = 1; d <= daysInMonth; d++) cells.push(rec[d] || "");
      const row = [
        emp.empId || "",
        emp.name,
        emp.department || "",
        emp.designation || "",
        ...cells,
        sum.present,
        sum.absent,
        sum.leave,
        sum.halfDay,
        sum.wfh,
        sum.onDuty,
        `${sum.attendancePct.toFixed(1)}%`,
      ];
      if (state.includeNotesInExport) {
        const nMap = monthNotes[emp.uid] || {};
        row.push(
          Object.entries(nMap)
            .filter(([, v]) => v)
            .map(([d, v]) => `Day ${d}: ${v}`)
            .join("; ")
        );
      }
      rows.push(row);
    }

    const csvText = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8" }), "opensign-attendance-data.csv");
    toast("Exported opensign-attendance-data.csv");
  }

  function parseCsvRows(text) {
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);

    return lines.map((line) => {
      const cols = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cols.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      return cols;
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Sync Organization Inputs & Master Render ---------- */
  function syncOrgInputsFromState() {
    $("atOrgName").value = state.org.name || "";
    $("atOrgDept").value = state.org.department || "";
    $("atOrgBranch").value = state.org.branch || "";
    $("atOrgHr").value = state.org.hrManager || "";
    $("atOrgPhone").value = state.org.phone || "";
    $("atOrgEmail").value = state.org.email || "";
    $("atOrgAddress").value = state.org.address || "";

    const thumb = $("atOrgLogoThumb");
    const rmBtn = $("atRemoveOrgLogoBtn");
    if (state.org.logoDataUrl) {
      thumb.src = state.org.logoDataUrl;
      thumb.hidden = false;
      rmBtn.hidden = false;
    } else {
      thumb.hidden = true;
      rmBtn.hidden = true;
    }

    // Header preview box
    $("atHpOrgName").textContent = state.org.name || "Organization Name";
    $("atHpOrgMeta").textContent = [state.org.address, state.org.phone, state.org.email].filter(Boolean).join(" · ");
    $("atHpPeriod").textContent = `${MONTHS[state.month]} ${state.year}`;
    $("atHpDept").textContent = [state.org.department, state.org.branch].filter(Boolean).join(" · ");
    const hpLogo = $("atHpLogo");
    if (state.org.logoDataUrl) {
      hpLogo.src = state.org.logoDataUrl;
      hpLogo.hidden = false;
    } else {
      hpLogo.hidden = true;
    }

    // Weekly Off Checkboxes
    document.querySelectorAll("[data-weekoff]").forEach((cb) => {
      cb.checked = state.weeklyOffs.includes(Number(cb.dataset.weekoff));
    });

    $("atCountLeaveCheck").checked = Boolean(state.countLeaveAsPresent);
    $("atIncludeNotesCheck").checked = Boolean(state.includeNotesInExport);

    // Template pills
    document.querySelectorAll(".at-tpl-btn").forEach((btn) => {
      btn.setAttribute("aria-checked", String(btn.dataset.tpl === state.templateId));
    });
  }

  function renderAll() {
    syncOrgInputsFromState();
    renderDashboardSummary();
    renderEmployeeDirectory();
    renderHolidaysList();
    renderAttendanceMatrix();
    updateBulkSelectedLabel();
    updateUndoButton();
  }

  /* ---------- Event Wiring ---------- */
  function init() {
    // Populate Month dropdown
    const monthSel = $("atMonthSelect");
    MONTHS.forEach((m, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = m;
      monthSel.appendChild(opt);
    });

    monthSel.addEventListener("change", () => {
      state.month = parseInt(monthSel.value, 10) || 0;
      schedulePersist();
      renderAll();
    });

    $("atYearInput").addEventListener("change", (e) => {
      const yr = Math.max(2000, Math.min(2100, parseInt(e.target.value, 10) || now.getFullYear()));
      state.year = yr;
      schedulePersist();
      renderAll();
    });

    $("atPrevMonthBtn").addEventListener("click", () => {
      if (state.month === 0) {
        state.month = 11;
        state.year -= 1;
      } else {
        state.month -= 1;
      }
      schedulePersist();
      renderAll();
    });

    $("atNextMonthBtn").addEventListener("click", () => {
      if (state.month === 11) {
        state.month = 0;
        state.year += 1;
      } else {
        state.month += 1;
      }
      schedulePersist();
      renderAll();
    });

    $("atCurrMonthBtn").addEventListener("click", () => {
      const d = new Date();
      state.year = d.getFullYear();
      state.month = d.getMonth();
      schedulePersist();
      renderAll();
    });

    // Template Switcher
    document.querySelectorAll(".at-tpl-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextTpl = btn.dataset.tpl;
        if (!nextTpl || nextTpl === state.templateId) return;
        const ok = await confirmAction(
          "Switch Attendance Template",
          `Load the "${TEMPLATES[nextTpl].name}" template? This will replace current sample rows with template defaults.`
        );
        if (!ok) return;
        pushUndoSnapshot();
        state = createDefaultState(nextTpl, state.year, state.month);
        selectedEmployeeUids.clear();
        schedulePersist();
        renderAll();
        toast(`Loaded ${TEMPLATES[nextTpl].name}.`);
      });
    });

    // Organization Inputs
    const bindOrg = (id, key) => {
      $(id)?.addEventListener("input", (e) => {
        state.org[key] = e.target.value;
        syncOrgInputsFromState();
        schedulePersist();
      });
    };
    bindOrg("atOrgName", "name");
    bindOrg("atOrgDept", "department");
    bindOrg("atOrgBranch", "branch");
    bindOrg("atOrgHr", "hrManager");
    bindOrg("atOrgPhone", "phone");
    bindOrg("atOrgEmail", "email");
    bindOrg("atOrgAddress", "address");

    // Toggle Report Header Preview
    $("atToggleHeaderPrevBtn").addEventListener("click", () => {
      const box = $("atHeaderPreviewBox");
      box.hidden = !box.hidden;
    });

    // Company Logo Upload
    $("atOrgLogoInput").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const objUrl = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, 320 / img.width, 140 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * ratio));
        c.height = Math.max(1, Math.round(img.height * ratio));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        state.org.logoDataUrl = c.toDataURL("image/png");
        URL.revokeObjectURL(objUrl);
        schedulePersist();
        syncOrgInputsFromState();
        toast("Organization logo uploaded.");
      };
      img.src = objUrl;
    });

    $("atRemoveOrgLogoBtn").addEventListener("click", () => {
      state.org.logoDataUrl = null;
      schedulePersist();
      syncOrgInputsFromState();
    });

    // Add Employee Form
    $("atAddEmpForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const empId = $("atNewEmpId").value.trim();
      const name = $("atNewEmpName").value.trim();
      const department = $("atNewEmpDept").value.trim();
      const designation = $("atNewEmpRole").value.trim();
      const joiningDate = $("atNewEmpJoin").value;
      const status = $("atNewEmpStatus").value;
      const contact = $("atNewEmpPhone").value.trim();

      if (!name) {
        toast("Please enter an employee or student name.", "error");
        $("atNewEmpName").focus();
        return;
      }

      if (empId && state.employees.some((x) => (x.empId || "").toLowerCase() === empId.toLowerCase())) {
        toast(`Duplicate ID "${empId}" already exists. Use a unique ID or leave ID blank.`, "error");
        $("atNewEmpId").focus();
        return;
      }

      pushUndoSnapshot();
      state.employees.push({
        uid: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        empId,
        name,
        department,
        designation,
        joiningDate,
        status,
        contact,
      });

      e.target.reset();
      schedulePersist();
      renderAll();
      toast(`Added ${name}.`);
    });

    // Edit Employee Save
    $("atSaveEditEmpBtn").addEventListener("click", () => {
      const emp = state.employees.find((e) => e.uid === editingEmployeeUid);
      if (!emp) return;
      const newId = $("atEditEmpId").value.trim();
      const newName = $("atEditEmpName").value.trim();
      if (!newName) {
        toast("Name cannot be empty.", "error");
        return;
      }
      if (
        newId &&
        state.employees.some((x) => x.uid !== emp.uid && (x.empId || "").toLowerCase() === newId.toLowerCase())
      ) {
        toast(`Duplicate ID "${newId}" already exists.`, "error");
        return;
      }
      pushUndoSnapshot();
      emp.empId = newId;
      emp.name = newName;
      emp.department = $("atEditEmpDept").value.trim();
      emp.designation = $("atEditEmpRole").value.trim();
      emp.joiningDate = $("atEditEmpJoin").value;
      emp.status = $("atEditEmpStatus").value;
      emp.contact = $("atEditEmpPhone").value.trim();

      $("atEditEmpDialog").close();
      schedulePersist();
      renderAll();
      toast(`Updated ${emp.name}.`);
    });
    $("atEditEmpCancel").addEventListener("click", () => $("atEditEmpDialog").close());
    $("atEditEmpCloseTop").addEventListener("click", () => $("atEditEmpDialog").close());

    // Search, Filter & Sort Controls
    $("atSearchEmp").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderEmployeeDirectory();
      renderAttendanceMatrix();
    });
    $("atFilterDept").addEventListener("change", (e) => {
      filterDept = e.target.value;
      renderEmployeeDirectory();
      renderAttendanceMatrix();
    });
    $("atFilterStatus").addEventListener("change", (e) => {
      filterStatus = e.target.value;
      renderEmployeeDirectory();
      renderAttendanceMatrix();
    });
    $("atSortEmp").addEventListener("change", (e) => {
      sortMode = e.target.value;
      renderEmployeeDirectory();
      renderAttendanceMatrix();
    });

    // Select All Employees Checkbox in Directory
    $("atSelectAllEmps").addEventListener("change", (e) => {
      const visible = getFilteredEmployees();
      if (e.target.checked) visible.forEach((emp) => selectedEmployeeUids.add(emp.uid));
      else visible.forEach((emp) => selectedEmployeeUids.delete(emp.uid));
      renderEmployeeDirectory();
      updateBulkSelectedLabel();
    });

    // Sample Employee CSV Download + Bulk Employee CSV Import & Export
    $("atSampleEmpCsvBtn").addEventListener("click", () => {
      const sample = [
        "Employee ID,Employee Name,Department,Designation,Joining Date,Employment Status,Contact Number",
        "EMP-201,Neha Kapoor,Marketing,Growth Manager,2025-04-01,Active,+91 98111 22334",
        "EMP-202,Siddharth Rao,Engineering,Backend Developer,2025-07-15,Active,+91 98111 55667",
      ].join("\n");
      downloadBlob(new Blob([sample], { type: "text/csv;charset=utf-8" }), "opensign-employees-sample.csv");
    });

    $("atExportEmpCsvBtn").addEventListener("click", () => {
      const rows = [
        ["Employee ID", "Employee Name", "Department", "Designation", "Joining Date", "Employment Status", "Contact Number"],
        ...state.employees.map((e) => [
          e.empId || "",
          e.name,
          e.department || "",
          e.designation || "",
          e.joiningDate || "",
          e.status || "Active",
          e.contact || "",
        ]),
      ];
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "opensign-employees.csv");
    });

    $("atImportEmpCsvInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const rows = parseCsvRows(await f.text());
      if (rows.length < 2) {
        toast("CSV file has no employee rows.", "error");
        return;
      }
      pushUndoSnapshot();
      let added = 0;
      let skipped = 0;
      for (let i = 1; i < rows.length; i++) {
        const [empId = "", name = "", department = "", designation = "", joiningDate = "", status = "Active", contact = ""] = rows[i];
        if (!name.trim()) {
          skipped++;
          continue;
        }
        if (empId.trim() && state.employees.some((x) => (x.empId || "").toLowerCase() === empId.trim().toLowerCase())) {
          skipped++;
          continue;
        }
        state.employees.push({
          uid: `emp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
          empId: empId.trim(),
          name: name.trim(),
          department: department.trim(),
          designation: designation.trim(),
          joiningDate: joiningDate.trim(),
          status: status.trim() || "Active",
          contact: contact.trim(),
        });
        added++;
      }
      schedulePersist();
      renderAll();
      toast(`Imported ${added} employees${skipped ? ` (${skipped} skipped due to missing name or duplicate ID)` : ""}.`);
    });

    // Weekly Offs & Leave Counting Rule
    document.querySelectorAll("[data-weekoff]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const dIdx = Number(cb.dataset.weekoff);
        if (cb.checked && !state.weeklyOffs.includes(dIdx)) state.weeklyOffs.push(dIdx);
        else if (!cb.checked) state.weeklyOffs = state.weeklyOffs.filter((x) => x !== dIdx);
        schedulePersist();
        renderAll();
      });
    });

    $("atCountLeaveCheck").addEventListener("change", (e) => {
      state.countLeaveAsPresent = e.target.checked;
      schedulePersist();
      renderAll();
    });

    $("atIncludeNotesCheck").addEventListener("change", (e) => {
      state.includeNotesInExport = e.target.checked;
      schedulePersist();
    });

    // Bulk Operations
    $("atBulkMarkPresentBtn").addEventListener("click", () => {
      const day = parseInt($("atBulkDaySelect").value, 10);
      if (!day) return;
      pushUndoSnapshot();
      const rec = getMonthRecords();
      for (const emp of getFilteredEmployees()) {
        if (!rec[emp.uid]) rec[emp.uid] = {};
        rec[emp.uid][day] = "P";
      }
      schedulePersist();
      renderAll();
      toast(`Marked all visible employees Present on Day ${day}.`);
    });

    $("atBulkWeekOffBtn").addEventListener("click", () => {
      const daysInMonth = getDaysInMonth(state.year, state.month);
      pushUndoSnapshot();
      const rec = getMonthRecords();
      for (const emp of state.employees) {
        if (!rec[emp.uid]) rec[emp.uid] = {};
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = getWeekdayIndex(state.year, state.month, d);
          if (state.weeklyOffs.includes(dow)) rec[emp.uid][d] = "WO";
        }
      }
      schedulePersist();
      renderAll();
      toast("Applied weekly offs across the entire month.");
    });

    $("atBulkApplyHolidaysBtn").addEventListener("click", () => {
      const holMap = getHolidaysForCurrentMonth();
      if (!holMap.size) {
        toast("No holidays fall in the selected month. Add holidays in Holiday Management first.", "error");
        return;
      }
      pushUndoSnapshot();
      const rec = getMonthRecords();
      for (const emp of state.employees) {
        if (!rec[emp.uid]) rec[emp.uid] = {};
        for (const [dayNum] of holMap.entries()) {
          rec[emp.uid][dayNum] = "H";
        }
      }
      schedulePersist();
      renderAll();
      toast(`Applied ${holMap.size} holiday(s) to the calendar.`);
    });

    $("atBulkSelectedApplyBtn").addEventListener("click", () => {
      if (!selectedEmployeeUids.size) {
        toast("Select one or more employees using the checkboxes in Employee Management first.", "error");
        return;
      }
      const day = parseInt($("atBulkDaySelect").value, 10);
      const code = $("atBulkStatusSelect").value;
      if (!day || !code) return;
      pushUndoSnapshot();
      const rec = getMonthRecords();
      for (const uid of selectedEmployeeUids) {
        if (!rec[uid]) rec[uid] = {};
        rec[uid][day] = code;
      }
      schedulePersist();
      renderAll();
      toast(`Applied ${code} to ${selectedEmployeeUids.size} selected employee(s) on Day ${day}.`);
    });

    // Holiday Management
    $("atAddHolidayForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("atHolName").value.trim();
      const date = $("atHolDate").value;
      const type = $("atHolType").value;
      const description = $("atHolDesc").value.trim();
      if (!name || !date) {
        toast("Enter both holiday name and date.", "error");
        return;
      }
      pushUndoSnapshot();
      state.holidays.push({
        id: `hol_${Date.now()}`,
        name,
        date,
        type,
        description,
      });
      e.target.reset();
      schedulePersist();
      renderAll();
      toast(`Added holiday "${name}".`);
    });

    $("atSampleHolCsvBtn").addEventListener("click", () => {
      const sample = [
        "Holiday Name,Date,Holiday Type,Description",
        `Republic Day,${state.year}-01-26,National Holiday,National public holiday`,
        `Independence Day,${state.year}-08-15,National Holiday,National public holiday`,
        `Gandhi Jayanti,${state.year}-10-02,National Holiday,National public holiday`,
      ].join("\n");
      downloadBlob(new Blob([sample], { type: "text/csv;charset=utf-8" }), "opensign-holidays-sample.csv");
    });

    $("atImportHolCsvInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const rows = parseCsvRows(await f.text());
      if (rows.length < 2) return;
      pushUndoSnapshot();
      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const [name = "", date = "", type = "Company Holiday", description = ""] = rows[i];
        if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) continue;
        state.holidays.push({
          id: `hol_${Date.now()}_${i}`,
          name: name.trim(),
          date: date.trim(),
          type: type.trim() || "Company Holiday",
          description: description.trim(),
        });
        count++;
      }
      schedulePersist();
      renderAll();
      toast(`Imported ${count} holiday(s).`);
    });

    // Historical Attendance CSV Import with Preview Modal
    $("atSampleAttCsvBtn").addEventListener("click", () => {
      const mk = formatMonthKey(state.year, state.month);
      const firstEmpId = state.employees[0]?.empId || "EMP-101";
      const sample = [
        "Employee ID,Date,Status,Note",
        `${firstEmpId},${mk}-01,P,On time`,
        `${firstEmpId},${mk}-02,WFH,Remote sprint`,
        `${firstEmpId},${mk}-03,HD,Half day leave`,
      ].join("\n");
      downloadBlob(new Blob([sample], { type: "text/csv;charset=utf-8" }), "opensign-attendance-import-sample.csv");
    });

    $("atImportAttCsvInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const rows = parseCsvRows(await f.text());
      if (rows.length < 2) {
        toast("Attendance CSV is empty.", "error");
        return;
      }

      pendingAttendanceCsvRows = [];
      const tbody = $("atCsvPreviewBody");
      tbody.innerHTML = "";

      for (let i = 1; i < rows.length; i++) {
        const [empId = "", dateStr = "", statusRaw = "", note = ""] = rows[i];
        const code = statusRaw.trim().toUpperCase();
        const emp = state.employees.find((x) => (x.empId || "").toLowerCase() === empId.trim().toLowerCase());
        const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
        const codeValid = STATUS_CODES.includes(code);
        const valid = Boolean(emp && dateValid && codeValid);

        const reason = !emp
          ? `Unknown Employee ID "${empId}"`
          : !dateValid
            ? `Invalid date "${dateStr}" (use YYYY-MM-DD)`
            : !codeValid
              ? `Invalid status "${statusRaw}"`
              : "Ready";

        pendingAttendanceCsvRows.push({ valid, emp, dateStr: dateStr.trim(), code, note: note.trim() });

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(empId)}</td>
          <td>${esc(emp ? emp.name : "—")}</td>
          <td>${esc(dateStr)}</td>
          <td><strong>${esc(code)}</strong></td>
          <td style="color:${valid ? "#15803d" : "#b42318"};font-weight:700">${esc(reason)}</td>
        `;
        tbody.appendChild(tr);
      }

      $("atCsvPreviewDialog").showModal();
    });

    $("atCsvApplyBtn").addEventListener("click", () => {
      const validRows = pendingAttendanceCsvRows.filter((r) => r.valid);
      if (!validRows.length) {
        toast("No valid rows to import.", "error");
        return;
      }
      pushUndoSnapshot();
      for (const r of validRows) {
        const [yStr, mStr, dStr] = r.dateStr.split("-");
        const mk = `${yStr}-${mStr}`;
        const dayNum = parseInt(dStr, 10);
        if (!state.records[mk]) state.records[mk] = {};
        if (!state.records[mk][r.emp.uid]) state.records[mk][r.emp.uid] = {};
        state.records[mk][r.emp.uid][dayNum] = r.code;

        if (r.note) {
          if (!state.notes[mk]) state.notes[mk] = {};
          if (!state.notes[mk][r.emp.uid]) state.notes[mk][r.emp.uid] = {};
          state.notes[mk][r.emp.uid][dayNum] = r.note;
        }
      }
      $("atCsvPreviewDialog").close();
      schedulePersist();
      renderAll();
      toast(`Applied ${validRows.length} attendance record(s) from CSV.`);
    });
    $("atCsvCancelBtn").addEventListener("click", () => $("atCsvPreviewDialog").close());
    $("atCsvCloseTop").addEventListener("click", () => $("atCsvPreviewDialog").close());

    // Cell Modal Clear & Close
    $("atCellClearBtn").addEventListener("click", () => {
      if (!activeCellContext) return;
      applyCellUpdate(activeCellContext.uid, activeCellContext.day, "", "");
      $("atCellDialog").close();
    });
    $("atCellSaveNoteOnlyBtn").addEventListener("click", () => {
      if (!activeCellContext) return;
      const curCode = (getMonthRecords()[activeCellContext.uid] || {})[activeCellContext.day] || "";
      applyCellUpdate(activeCellContext.uid, activeCellContext.day, curCode, $("atCellNoteInput").value);
      $("atCellDialog").close();
    });
    $("atCellCloseTop").addEventListener("click", () => $("atCellDialog").close());

    // Individual Report Modal Close
    $("atIndivCloseTop").addEventListener("click", () => $("atIndivDialog").close());
    $("atIndivCloseBtn").addEventListener("click", () => $("atIndivDialog").close());

    // Mobile View Mode Toggle (Employee Cards vs Full Scroll Grid)
    document.querySelectorAll("[data-mob-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        mobileViewMode = btn.dataset.mobMode;
        document.querySelectorAll("[data-mob-mode]").forEach((b) => b.classList.toggle("active", b === btn));
        $("atRegisterCard").dataset.mobView = mobileViewMode;
      });
    });

    // Exports & Print
    $("atExportExcelBtn").addEventListener("click", exportExcelWorkbook);
    $("atExportPdfBtn").addEventListener("click", () => exportPdfReport(null));
    $("atExportCsvBtn").addEventListener("click", exportAttendanceCsv);
    $("atPrintBtn").addEventListener("click", () => window.print());

    // Undo & Backup / Restore / Reset
    $("atUndoBtn").addEventListener("click", performUndo);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        if (undoStack.length) {
          e.preventDefault();
          performUndo();
        }
      }
    });

    $("atBackupJsonBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      downloadBlob(blob, `opensign-attendance-backup-${formatMonthKey(state.year, state.month)}.json`);
      toast("Downloaded attendance JSON backup.");
    });

    $("atRestoreJsonInput").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if (!parsed || !Array.isArray(parsed.employees)) throw new Error("Invalid attendance backup file.");
        pushUndoSnapshot();
        state = { ...createDefaultState("corporate", now.getFullYear(), now.getMonth()), ...parsed };
        schedulePersist();
        renderAll();
        toast("Restored attendance backup.");
      } catch (err) {
        toast(err.message || "Could not restore backup.", "error");
      }
    });

    $("atClearMonthBtn").addEventListener("click", async () => {
      const ok = await confirmAction(
        "Clear Selected Month Attendance",
        `Clear all marked attendance statuses for ${MONTHS[state.month]} ${state.year}? Employee list will be kept.`
      );
      if (!ok) return;
      pushUndoSnapshot();
      const mk = formatMonthKey(state.year, state.month);
      state.records[mk] = {};
      state.notes[mk] = {};
      schedulePersist();
      renderAll();
      toast(`Cleared attendance for ${MONTHS[state.month]} ${state.year}.`);
    });

    $("atResetAllBtn").addEventListener("click", async () => {
      const ok = await confirmAction(
        "Start New Attendance Sheet",
        "Reset all organization details, employees, holidays, and attendance records back to a clean default sheet?"
      );
      if (!ok) return;
      pushUndoSnapshot();
      const d = new Date();
      state = createDefaultState("corporate", d.getFullYear(), d.getMonth());
      selectedEmployeeUids.clear();
      schedulePersist();
      renderAll();
      toast("Started a fresh attendance sheet.");
    });

    // Boot: load locally saved IndexedDB state if present
    loadPersistedState().then((saved) => {
      if (saved && Array.isArray(saved.employees)) {
        state = { ...createDefaultState("corporate", now.getFullYear(), now.getMonth()), ...saved };
      }
      renderAll();
    });
  }

  init();
})();
