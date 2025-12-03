class WeeklyPlannerApp {
  init() {
    // ---- STATE ------------------------------------------------------
    const appState = {};
    function resetAppState() {
      appState.days = null;
      appState.morningHours = null;
      appState.afternoonHours = null;
      appState.dailyHours = null;
      appState.lastMorningHour = null;
      appState.numProf = null;
      appState.numClass = null;
      appState.freeAfternoonEnabled = true;
      appState.wedFree = true;
      appState.dayNames = [];
      appState.freeAfternoonDay = 3;
      appState.seedEnabled = false;
      appState.seed = null;
      appState.professorNames = [];
      appState.classNames = [];
      appState.hourNames = [];
      appState.hoursMatrix = null;
      appState.availability = null;
      appState.method = "mip";
      appState.lastPlanResponse = null;
      appState.lastPayload = null;
    }
    resetAppState();

    let currentStep = 1;

    const matrixContainer = document.getElementById("matrix-container");
    const availabilityContainer = document.getElementById(
      "availability-container"
    );
    const DAY_PARTS = [
      { key: "morning", label: "Mattina" },
      { key: "afternoon", label: "Pomeriggio" },
    ];
    const previewProfessors = document.getElementById("preview-professors");
    const previewClasses = document.getElementById("preview-classes");
    const errorMessage = document.getElementById("error-message");
    const resetOverlay = document.getElementById("reset-confirm-overlay");
    const resetConfirmBtn = document.getElementById("reset-confirm");
    const resetCancelBtn = document.getElementById("reset-cancel");
    const freeAfternoonYesBtn = document.getElementById("free-afternoon-yes");
    const freeAfternoonNoBtn = document.getElementById("free-afternoon-no");
    const freeAfternoonInput = document.getElementById("free_afternoon_day");
    const seedLockBtn = document.getElementById("seed-lock");
    const seedInput = document.getElementById("seed-value");
    const modeRandomBtn = document.getElementById("mode-random");
    const modeMipBtn = document.getElementById("mode-mip");
    const loadingBar = document.getElementById("loading-bar");
    const loadingBarInner = document.getElementById("loading-bar-inner");
    const loadingBarLabel = document.getElementById("loading-bar-label");
    let loadingTimer = null;
    let loadingStart = 0;
    let loadingTarget90 = 0;
    let pendingResetStep = null;

    function openResetConfirm(step) {
      pendingResetStep = step;
      resetOverlay.style.display = "flex";
    }
    function closeResetConfirm() {
      resetOverlay.style.display = "none";
      pendingResetStep = null;
    }

    // ---- VALIDAZIONE STEP 1 --------------------------------------
    function setFieldInvalid(id, invalid, message) {
      const el = document.getElementById(id);
      const msg = document.getElementById("val-" + id);
      if (!el) return;
      if (invalid) {
        el.classList.add("invalid");
        if (msg) msg.classList.add("show");
        if (msg && message) msg.textContent = message;
      } else {
        el.classList.remove("invalid");
        if (msg) msg.classList.remove("show");
      }
    }

    function validateNumberField(id, minValue, maxValue) {
      const raw = document.getElementById(id)?.value?.trim();
      if (raw === "" || isNaN(parseInt(raw, 10))) {
        setFieldInvalid(id, true);
        return false;
      }
      const val = parseInt(raw, 10);
      if (typeof minValue === "number" && val < minValue) {
        setFieldInvalid(id, true);
        return false;
      }
      if (typeof maxValue === "number" && val > maxValue) {
        setFieldInvalid(id, true);
        return false;
      }
      setFieldInvalid(id, false);
      return true;
    }

    function clampSeed(n) {
      if (isNaN(n)) return null;
      return Math.max(0, Math.min(9_999_999, n));
    }

    function applyFreeAfternoonUI() {
      const enabled = appState.freeAfternoonEnabled !== false;
      if (freeAfternoonInput) {
        freeAfternoonInput.disabled = !enabled;
        freeAfternoonInput.classList.toggle("locked", !enabled);
        if (!enabled) {
          freeAfternoonInput.value = "";
          setFieldInvalid("free_afternoon_day", false);
          appState.freeAfternoonDay = null;
          appState.wedFree = false;
        } else if (!freeAfternoonInput.value) {
          appState.freeAfternoonDay = appState.freeAfternoonDay || 3;
          appState.wedFree = appState.freeAfternoonDay === 3;
          freeAfternoonInput.value = appState.freeAfternoonDay;
        } else {
          const val = parseInt(freeAfternoonInput.value, 10);
          if (!isNaN(val)) {
            appState.freeAfternoonDay = val;
            appState.wedFree = val === 3;
          }
        }
      }
      if (freeAfternoonYesBtn) {
        freeAfternoonYesBtn.classList.toggle("active", enabled);
        freeAfternoonYesBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
      }
      if (freeAfternoonNoBtn) {
        freeAfternoonNoBtn.classList.toggle("active", !enabled);
        freeAfternoonNoBtn.setAttribute("aria-pressed", !enabled ? "true" : "false");
      }
    }

    function setFreeAfternoonEnabled(flag) {
      appState.freeAfternoonEnabled = !!flag;
      applyFreeAfternoonUI();
    }

    function applySeedUI() {
      const locked = !!appState.seedEnabled;
      if (seedInput) {
        seedInput.disabled = locked;
        seedInput.classList.toggle("locked", locked);
        if (locked && appState.seed != null) {
          seedInput.value = appState.seed;
        }
      }
      if (seedLockBtn) {
        seedLockBtn.classList.toggle("locked", locked);
        seedLockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
        seedLockBtn.textContent = locked ? "🔒" : "🔓";
      }
    }

    function wireStep1Validation() {
      const fields = [
        { id: "days", min: 1 },
        { id: "morning_hours", min: 1 },
        { id: "afternoon_hours", min: 0 },
        { id: "num_professors", min: 1 },
        { id: "num_classes", min: 1 },
        { id: "free_afternoon_day", min: 1 },
      ];
      fields.forEach((f) => {
        const el = document.getElementById(f.id);
        if (!el) return;
        ["input", "blur"].forEach((ev) =>
          el.addEventListener(ev, () => {
            if (f.id === "free_afternoon_day" && appState.freeAfternoonEnabled === false) {
              setFieldInvalid("free_afternoon_day", false);
              return;
            }
            const max =
              f.id === "free_afternoon_day"
                ? parseInt(document.getElementById("days").value, 10) ||
                  undefined
                : undefined;
            validateNumberField(f.id, f.min, max);
          })
        );
      });
    }

    // ---- STEP HANDLING ----------------------------------------------
    function updateStepperUI() {
      const items = document.querySelectorAll(".stepper-item");
      items.forEach((item) => {
        const step = parseInt(item.getAttribute("data-step"), 10);
        item.classList.remove("active", "completed");
        if (step === currentStep) {
          item.classList.add("active");
        } else if (step < currentStep) {
          item.classList.add("completed");
        }
      });
    }

    function showStep(step) {
      currentStep = step;
      updateStepperUI();
      document.querySelectorAll(".step-container").forEach((el) => {
        el.classList.remove("active");
      });
      const el = document.getElementById(`step-${step}`);
      if (el) el.classList.add("active");
      if (step === 4) {
        renderStep3Summary();
      }
    }

    // ---- STEP 1: RACCOLTA DATI -------------------------------------
    function collectStep1Data() {
      // Validazione numerica (senza check continuo sulle nomenclature)
      const okDays = validateNumberField("days", 1);
      const okMorning = validateNumberField("morning_hours", 1);
      const okAfternoon = validateNumberField("afternoon_hours", 0);
      const okProf = validateNumberField("num_professors", 1);
      const okClass = validateNumberField("num_classes", 1);
      if (!(okDays && okMorning && okAfternoon && okProf && okClass)) {
        return false;
      }
      const days = parseInt(document.getElementById("days").value, 10);
      const morningHours = parseInt(
        document.getElementById("morning_hours").value,
        10
      );
      const afternoonHours = parseInt(
        document.getElementById("afternoon_hours").value,
        10
      );
      const numProf = parseInt(
        document.getElementById("num_professors").value,
        10
      );
      const numClass = parseInt(
        document.getElementById("num_classes").value,
        10
      );
      const freeAfternoonEnabled = appState.freeAfternoonEnabled !== false;
      const freeAfternoonDay = freeAfternoonEnabled
        ? parseInt(document.getElementById("free_afternoon_day").value, 10)
        : null;

      const dailyHours =
        (isNaN(morningHours) ? 0 : morningHours) +
        (isNaN(afternoonHours) ? 0 : afternoonHours);
      const lastMorningHour = morningHours;
      // Non servono alert: i minimi sono già verificati via validateNumberField

      // Nomi professori
      let profNamesInput = document
        .getElementById("professor_names")
        .value.trim();
      let professorNames = [];
      if (profNamesInput.length > 0) {
        professorNames = profNamesInput
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const invalid = professorNames.length !== numProf;
        setFieldInvalid(
          "professor_names",
          invalid,
          "Inserisci esattamente " + numProf + " nomi separati da virgola"
        );
        if (invalid) return false;
      } else {
        for (let i = 0; i < numProf; i++) {
          professorNames.push("Prof " + (i + 1));
        }
        setFieldInvalid("professor_names", false);
      }

      // Nomi classi
      let classNamesInput = document
        .getElementById("class_names")
        .value.trim();
      let classNames = [];
      if (classNamesInput.length > 0) {
        classNames = classNamesInput
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const invalid = classNames.length !== numClass;
        setFieldInvalid(
          "class_names",
          invalid,
          "Inserisci esattamente " + numClass + " nomi separati da virgola"
        );
        if (invalid) return false;
      } else {
        for (let i = 0; i < numClass; i++) {
          classNames.push("Classe " + (i + 1));
        }
        setFieldInvalid("class_names", false);
      }

      appState.days = days;
      appState.morningHours = morningHours;
      appState.afternoonHours = afternoonHours;
      appState.dailyHours = dailyHours;
      appState.lastMorningHour = lastMorningHour;
      appState.numProf = numProf;
      appState.numClass = numClass;
      // Giorni nominati
      const dayNamesInput = (
        document.getElementById("day_names").value || ""
      ).trim();
      let dayNames = [];
      if (dayNamesInput) {
        dayNames = dayNamesInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const invalid = dayNames.length !== days;
        setFieldInvalid(
          "day_names",
          invalid,
          "Inserisci esattamente " + days + " nomi separati da virgola"
        );
        if (invalid) return false;
      }
      else {
        setFieldInvalid("day_names", false);
      }

      // Nomi ore (opzionale) devono corrispondere al totale ore/giorno
      const hourNamesInput = (
        document.getElementById("hour_names").value || ""
      ).trim();
      let hourNames = [];
      if (hourNamesInput) {
        hourNames = hourNamesInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const invalid = hourNames.length !== dailyHours;
        setFieldInvalid(
          "hour_names",
          invalid,
          "Inserisci esattamente " + dailyHours + " orari separati da virgola"
        );
        if (invalid) return false;
      }
      else {
        setFieldInvalid("hour_names", false);
      }

      if (freeAfternoonEnabled) {
        if (
          isNaN(freeAfternoonDay) ||
          freeAfternoonDay < 1 ||
          freeAfternoonDay > days
        ) {
          setFieldInvalid("free_afternoon_day", true);
          return false;
        }
        appState.freeAfternoonDay = freeAfternoonDay;
        appState.wedFree = freeAfternoonDay === 3; // retrocompatibilità
      } else {
        setFieldInvalid("free_afternoon_day", false);
        appState.freeAfternoonDay = null;
        appState.wedFree = false;
      }
      appState.freeAfternoonEnabled = freeAfternoonEnabled;
      appState.dayNames = dayNames;
      appState.professorNames = professorNames;
      appState.classNames = classNames;
      appState.hourNames = hourNames;

      return true;
    }

    function buildHoursTable() {
      const numProf = appState.numProf;
      const numClass = appState.numClass;
      const profNames = appState.professorNames;
      const classNames = appState.classNames;

      ensureStep2StateArrays();

      // Ordine alfabetico dei docenti (preserva indici originali)
      const profOrder = Array.from({ length: numProf }, (_, i) => i).sort(
        (a, b) =>
          (profNames[a] || "").localeCompare(profNames[b] || "", "it", {
            sensitivity: "base",
          })
      );

      // --- Matrice H ---
      const tableH = document.createElement("table");

      const theadH = document.createElement("thead");
      const headRowH = document.createElement("tr");
      let thEmpty = document.createElement("th");
      thEmpty.textContent = "";
      headRowH.appendChild(thEmpty);

      const thTotal = document.createElement("th");
      thTotal.textContent = "Totale";
      headRowH.appendChild(thTotal);

      for (let c = 0; c < numClass; c++) {
        const th = document.createElement("th");
        th.textContent = classNames[c];
        headRowH.appendChild(th);
      }
      theadH.appendChild(headRowH);
      tableH.appendChild(theadH);

      const tbodyH = document.createElement("tbody");
      for (const p of profOrder) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = profNames[p];
        row.appendChild(th);

        const tdTotal = document.createElement("td");
        tdTotal.className = "total-cell";
        tdTotal.dataset.profIndex = p;
        tdTotal.textContent = "0";
        row.appendChild(tdTotal);

        for (let c = 0; c < numClass; c++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.type = "number";
          input.min = "0";
          input.style.width = "4em";
          input.className = "input";
          input.style.borderRadius = "8px";
          input.setAttribute("inputmode", "numeric");
          input.setAttribute("step", "1");
          input.dataset.profIndex = p;
          input.dataset.classIndex = c;
          td.appendChild(input);
          row.appendChild(td);
        }
        tbodyH.appendChild(row);
      }
      tableH.appendChild(tbodyH);

      matrixContainer.innerHTML = "";
      matrixContainer.appendChild(tableH);
      prefillMatrixFromState();
      updateAllHTotals();
      addMatrixKeyboardNavigation();
      wireHoursLiveSync();
    }

    function buildAvailabilityTable() {
      const numProf = appState.numProf;
      const days = appState.days;
      const profNames = appState.professorNames;

      ensureStep2StateArrays();

      const profOrder = Array.from({ length: numProf }, (_, i) => i).sort(
        (a, b) =>
          (profNames[a] || "").localeCompare(profNames[b] || "", "it", {
            sensitivity: "base",
          })
      );

      const tableA = document.createElement("table");

      const theadA = document.createElement("thead");
      const headRowTop = document.createElement("tr");
      const thHeader = document.createElement("th");
      thHeader.textContent = "";
      thHeader.rowSpan = 2;
      headRowTop.appendChild(thHeader);

      const thPerc = document.createElement("th");
      thPerc.textContent = "%";
      thPerc.rowSpan = 2;
      headRowTop.appendChild(thPerc);

      for (let d = 0; d < days; d++) {
        const th = document.createElement("th");
        th.textContent = dayLabelAt(d);
        th.colSpan = 2;
        headRowTop.appendChild(th);
      }
      theadA.appendChild(headRowTop);

      const headRowSub = document.createElement("tr");
      for (let d = 0; d < days; d++) {
        DAY_PARTS.forEach((part) => {
          const th = document.createElement("th");
          th.textContent = part.label;
          headRowSub.appendChild(th);
        });
      }
      theadA.appendChild(headRowSub);
      tableA.appendChild(theadA);

      const tbodyA = document.createElement("tbody");
      for (const p of profOrder) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = profNames[p];
        row.appendChild(th);

        const tdPerc = document.createElement("td");
        tdPerc.className = "availability-perc";
        tdPerc.dataset.profIndex = p;
        tdPerc.textContent = "0%";
        row.appendChild(tdPerc);

        for (let d = 0; d < days; d++) {
          DAY_PARTS.forEach((_, partIdx) => {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = true;
            input.dataset.profIndex = p;
            input.dataset.dayIndex = d;
            input.dataset.part = partIdx;
            td.appendChild(input);
            row.appendChild(td);
          });
        }
        tbodyA.appendChild(row);
      }
      tableA.appendChild(tbodyA);

      availabilityContainer.innerHTML = "";
      availabilityContainer.appendChild(tableA);
      prefillAvailabilityFromState();
      updateAllAvailabilityPerc();
      wireAvailabilityLiveSync();
    }

    // Initialize and keep step 2 state arrays sized properly
    function normalizeAvailability(raw, numProf, days) {
      const result = [];
      for (let p = 0; p < numProf; p++) {
        const row = [];
        for (let d = 0; d < days; d++) {
          const cell = raw?.[p]?.[d];
          if (Array.isArray(cell)) {
            const morning = cell.length > 0 ? !!cell[0] : true;
            const afternoon = cell.length > 1 ? !!cell[1] : morning;
            row.push([morning, afternoon]);
          } else if (typeof cell === "boolean") {
            row.push([cell, cell]);
          } else {
            row.push([true, true]);
          }
        }
        result.push(row);
      }
      return result;
    }

    function ensureStep2StateArrays() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const days = appState.days || 0;
      if (
        !Array.isArray(appState.hoursMatrix) ||
        appState.hoursMatrix.length !== numProf
      ) {
        appState.hoursMatrix = Array.from({ length: numProf }, () =>
          Array.from({ length: numClass }, () => 0)
        );
      } else {
        for (let p = 0; p < numProf; p++) {
          if (
            !Array.isArray(appState.hoursMatrix[p]) ||
            appState.hoursMatrix[p].length !== numClass
          ) {
            appState.hoursMatrix[p] = Array.from(
              { length: numClass },
              () => 0
            );
          }
        }
      }
      appState.availability = normalizeAvailability(
        appState.availability,
        numProf,
        days
      );
    }

    function updateHRowTotal(p) {
      const row = appState.hoursMatrix?.[p] || [];
      const total = row.reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
      const td = matrixContainer.querySelector(
        `td.total-cell[data-prof-index='${p}']`
      );
      if (td) td.textContent = String(total);
    }

    function updateAllHTotals() {
      const numProf = appState.numProf || 0;
      for (let p = 0; p < numProf; p++) {
        updateHRowTotal(p);
      }
    }

    function prefillMatrixFromState() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      if (!Array.isArray(appState.hoursMatrix)) return;
      for (let p = 0; p < numProf; p++) {
        for (let c = 0; c < numClass; c++) {
          const input = matrixContainer.querySelector(
            `input[data-prof-index='${p}'][data-class-index='${c}']`
          );
          if (!input) continue;
          const v = parseInt(appState.hoursMatrix[p]?.[c] ?? 0, 10) || 0;
          input.value = v > 0 ? String(v) : "";
        }
      }
      updateAllHTotals();
    }

    function prefillAvailabilityFromState() {
      const numProf = appState.numProf || 0;
      const days = appState.days || 0;
      if (!Array.isArray(appState.availability)) return;
      for (let p = 0; p < numProf; p++) {
        for (let d = 0; d < days; d++) {
          DAY_PARTS.forEach((_, partIndex) => {
            const input = availabilityContainer.querySelector(
              `input[data-prof-index='${p}'][data-day-index='${d}'][data-part='${partIndex}']`
            );
            if (!input) return;
            const v = !!appState.availability[p]?.[d]?.[partIndex];
            input.checked = v;
          });
        }
      }
      updateAllAvailabilityPerc();
    }

    function computeAvailabilityPerc(p) {
      const days = appState.days || 0;
      let checked = 0;
      for (let d = 0; d < days; d++) {
        const dayArr = appState.availability?.[p]?.[d];
        if (Array.isArray(dayArr)) {
          dayArr.forEach((val) => {
            if (val) checked += 1;
          });
        }
      }
      return checked * 10; // +10% per spunta
    }

    function updateAvailabilityPerc(p) {
      const cell = availabilityContainer.querySelector(
        `td.availability-perc[data-prof-index='${p}']`
      );
      if (!cell) return;
      const perc = computeAvailabilityPerc(p);
      cell.textContent = `${perc}%`;
    }

    function updateAllAvailabilityPerc() {
      const numProf = appState.numProf || 0;
      for (let p = 0; p < numProf; p++) {
        updateAvailabilityPerc(p);
      }
    }

    function wireHoursLiveSync() {
      // H matrix inputs live-sync
      matrixContainer
        .querySelectorAll("input[type='number']")
        .forEach((el) => {
          el.addEventListener("input", (e) => {
            const p = parseInt(e.target.dataset.profIndex, 10);
            const c = parseInt(e.target.dataset.classIndex, 10);
            const v = parseInt(e.target.value, 10);
            if (!Array.isArray(appState.hoursMatrix)) return;
            if (!appState.hoursMatrix[p]) return;
            appState.hoursMatrix[p][c] = isNaN(v) ? 0 : v;
            updateHRowTotal(p);
          });
        });

    }

    function wireAvailabilityLiveSync() {
      // Availability checkboxes live-sync
      availabilityContainer
        .querySelectorAll("input[type='checkbox']")
        .forEach((el) => {
          el.addEventListener("change", (e) => {
            const p = parseInt(e.target.dataset.profIndex, 10);
            const d = parseInt(e.target.dataset.dayIndex, 10);
            const part = parseInt(e.target.dataset.part, 10);
            if (!Array.isArray(appState.availability)) return;
            if (!appState.availability[p]) return;
            if (!Array.isArray(appState.availability[p][d])) return;
            appState.availability[p][d][part] = !!e.target.checked;
            updateAvailabilityPerc(p);
          });
          // rende cliccabile l'intera cella
          const td = el.closest("td");
          if (td) {
            td.addEventListener("click", () => {
              el.checked = !el.checked;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            });
          }
        });
    }

    function collectHoursData() {
      const numProf = appState.numProf;
      const numClass = appState.numClass;

      const inputsH = matrixContainer.querySelectorAll(
        "input[type='number']"
      );
      if (inputsH.length === 0) {
        alert("La matrice delle ore H non è stata creata.");
        return false;
      }

      const H = [];
      for (let p = 0; p < numProf; p++) {
        const row = [];
        for (let c = 0; c < numClass; c++) {
          const input = matrixContainer.querySelector(
            `input[data-prof-index='${p}'][data-class-index='${c}']`
          );
          if (!input) {
            alert("Errore interno nella matrice H.");
            return false;
          }
          const val = parseInt(input.value, 10) || 0;
          row.push(val);
        }
        H.push(row);
      }

      appState.hoursMatrix = H;

      return true;
    }

    function collectAvailabilityData() {
      const numProf = appState.numProf;
      const days = appState.days;

      const inputsA = availabilityContainer.querySelectorAll(
        "input[type='checkbox']"
      );
      if (inputsA.length === 0) {
        alert("La matrice disponibilità non è stata creata.");
        return false;
      }

      const availability = [];
      for (let p = 0; p < numProf; p++) {
        const row = [];
        for (let d = 0; d < days; d++) {
          const parts = [];
          for (let partIdx = 0; partIdx < DAY_PARTS.length; partIdx++) {
            const input = availabilityContainer.querySelector(
              `input[data-prof-index='${p}'][data-day-index='${d}'][data-part='${partIdx}']`
            );
            if (!input) {
              alert("Errore interno nella matrice disponibilità.");
              return false;
            }
            parts.push(!!input.checked);
          }
          row.push(parts);
        }
        availability.push(row);
      }

      appState.availability = availability;
      return true;
    }

    // Metodo fissato a 'random'
    function setMethod() {
      appState.method = "mip";
      updateModeUI();
    }

    function updateModeUI() {
      const method = appState.method || "mip";
      if (modeRandomBtn) {
        const active = method === "random";
        modeRandomBtn.classList.toggle("active", active);
        modeRandomBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (modeMipBtn) {
        const active = method === "mip";
        modeMipBtn.classList.toggle("active", active);
        modeMipBtn.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    function estimateWorkMs() {
      const d = appState.days || 0;
      const h = appState.dailyHours || 0;
      const p = appState.numProf || 0;
      const c = appState.numClass || 0;
      // Ore medie per professore (se la matrice esiste)
      let avgHoursPerProf = 0;
      if (Array.isArray(appState.hoursMatrix) && p > 0) {
        const totals = appState.hoursMatrix.map((row) =>
          row.reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
        );
        avgHoursPerProf =
          totals.reduce((s, v) => s + v, 0) / (totals.length || 1);
      }

      const complexity = (d / 2.5) * (h / 5) * (p**2) * (c**2) * (1 + avgHoursPerProf);
      // Stimatore: per MIP aumenta con dimensione e si rallenta se disponibilità è scarsa
      const factor = appState.method === "mip" ? 0.5 : 0.01;
      const estimate = complexity * factor;
      return estimate;
    }

    function startProgress() {
      if (loadingBar) loadingBar.style.display = "block";
      let progress = 0;
      const setProgress = (p) => {
        progress = Math.min(100, Math.max(0, p));
        if (loadingBarInner) loadingBarInner.style.width = progress + "%";
        if (loadingBarLabel) loadingBarLabel.textContent = Math.round(progress) + "%";
      };
      // Usa lo stimatore solo per MIP, altrimenti barra fissa a 10 secondi
      const totalMs = appState.method === "mip" ? estimateWorkMs() : 10000;
      loadingStart = Date.now();
      loadingTarget90 = Math.max(800, totalMs * 0.85);
      setProgress(appState.method === "mip" ? 4 : 6);
      if (loadingTimer) clearInterval(loadingTimer);
      loadingTimer = setInterval(() => {
        const elapsed = Date.now() - loadingStart;
        const projected = (elapsed / loadingTarget90) * 90;
        setProgress(Math.min(90, projected));
      }, 250);
      return () => setProgress;
    }

    // ---- PAYLOAD & API CALLS ---------------------------------------
    function buildPayload() {
      if (
        appState.days == null ||
        appState.dailyHours == null ||
        appState.numProf == null ||
        appState.numClass == null ||
        !appState.hoursMatrix
      ) {
        alert("Completa prima i passi 1 e 2.");
        return null;
      }

      return {
        days: appState.days,
        daily_hours: appState.dailyHours,
        class_names: appState.classNames,
        professor_names: appState.professorNames,
        hours_matrix: appState.hoursMatrix,
        availability: appState.availability,
        wednesday_afternoon_free: appState.wedFree,
        free_afternoon_day: appState.freeAfternoonDay,
        last_morning_hour: appState.lastMorningHour,
        method: appState.method || "mip",
        seed: appState.seedEnabled ? appState.seed : undefined,
        hour_names:
          appState.hourNames && appState.hourNames.length
            ? appState.hourNames
            : undefined,
      };
    }

    function resolveSeedForRun() {
      const randomSeed = () => Math.floor(Math.random() * 10_000_000);
      if (appState.seedEnabled) {
        const parsed = clampSeed(parseInt(seedInput?.value ?? "", 10));
        if (parsed !== null) {
          appState.seed = parsed;
          if (seedInput) seedInput.value = parsed;
          return parsed;
        }
        if (appState.seed != null) return clampSeed(appState.seed) ?? randomSeed();
        const newSeed = randomSeed();
        appState.seed = newSeed;
        if (seedInput) seedInput.value = newSeed;
        return newSeed;
      }
      const newSeed = randomSeed();
      appState.seed = newSeed;
      if (seedInput) seedInput.value = newSeed;
      return newSeed;
    }

    async function generatePlan() {
      const payload = buildPayload();
      if (!payload) return;

      payload.seed = resolveSeedForRun();
      applySeedUI();
      persistLocal();
      updateUrl();

      appState.lastPayload = payload;

      const generateBtn = document.getElementById("generate-plan-btn");
      if (generateBtn) generateBtn.disabled = true;
      const setProgress = startProgress();

      errorMessage.style.display = "none";
      errorMessage.textContent = "";

      try {
        const res = await fetch("/api/generate-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!data.ok) {
          errorMessage.style.display = "block";
          errorMessage.textContent =
            data.message || "Impossibile generare un piano.";
          return;
        }

        appState.lastPlanResponse = data;

        renderPreviews(data);
      } catch (err) {
        console.error(err);
        errorMessage.style.display = "block";
        errorMessage.textContent = "Errore di rete o server.";
      } finally {
        if (generateBtn) generateBtn.disabled = false;
        if (loadingTimer) clearInterval(loadingTimer);
        setProgress(100);
        setTimeout(() => {
          if (loadingBar) loadingBar.style.display = "none";
          setProgress(0);
        }, 250);
      }
    }

    async function downloadPdf(endpoint, filename) {
      if (!appState.lastPayload || !appState.lastPlanResponse?.plan) {
        alert("Prima genera almeno un piano (clicca su “Genera piano”).");
        return;
      }

      const payloadWithPlan = {
        ...appState.lastPayload,
        plan: appState.lastPlanResponse.plan,
      };

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadWithPlan),
        });

        if (!res.ok) {
          alert("Errore durante la generazione del PDF.");
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        alert("Errore di rete durante il download del PDF.");
      }
    }

    // ---- PREVIEW RENDERING -----------------------------------------
    const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    function dayLabelAt(index) {
      return (
        (appState.dayNames && appState.dayNames[index]) ||
        DAY_LABELS[index] ||
        "G" + (index + 1)
      );
    }

    // ---- JSON SAVE/LOAD UTILS -------------------------------------
    function downloadJSON(obj, filename) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    function getStep1DataRaw() {
      const days = parseInt(document.getElementById("days").value, 10) || 0;
      const morning_hours =
        parseInt(document.getElementById("morning_hours").value, 10) || 0;
      const afternoon_hours =
        parseInt(document.getElementById("afternoon_hours").value, 10) || 0;
      const num_professors =
        parseInt(document.getElementById("num_professors").value, 10) || 0;
      const num_classes =
        parseInt(document.getElementById("num_classes").value, 10) || 0;
      const free_afternoon_enabled = appState.freeAfternoonEnabled !== false;
      const free_afternoon_day = free_afternoon_enabled
        ? parseInt(document.getElementById("free_afternoon_day").value, 10) || 0
        : null;

      const profNamesStr = (
        document.getElementById("professor_names").value || ""
      ).trim();
      const classNamesStr = (
        document.getElementById("class_names").value || ""
      ).trim();
      const dayNamesStr = (
        document.getElementById("day_names").value || ""
      ).trim();
      const hourNamesStr = (
        document.getElementById("hour_names").value || ""
      ).trim();
      const professor_names = profNamesStr
        ? profNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const class_names = classNamesStr
        ? classNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const day_names = dayNamesStr
        ? dayNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const hour_names = hourNamesStr
        ? hourNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      return {
        days,
        morning_hours,
        afternoon_hours,
        num_professors,
        num_classes,
        wednesday_afternoon_free:
          free_afternoon_enabled && free_afternoon_day === 3,
        free_afternoon_day,
        free_afternoon_enabled,
        professor_names,
        class_names,
        day_names,
        hour_names,
      };
    }

    function loadStep1FromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      if (obj.days != null) document.getElementById("days").value = obj.days;
      if (obj.morning_hours != null)
        document.getElementById("morning_hours").value = obj.morning_hours;
      if (obj.afternoon_hours != null)
        document.getElementById("afternoon_hours").value =
          obj.afternoon_hours;
      if (obj.num_professors != null)
        document.getElementById("num_professors").value = obj.num_professors;
      if (obj.num_classes != null)
        document.getElementById("num_classes").value = obj.num_classes;
      if (obj.free_afternoon_day != null)
        document.getElementById("free_afternoon_day").value =
          obj.free_afternoon_day;
      else if (obj.wednesday_afternoon_free === true)
        document.getElementById("free_afternoon_day").value = 3;

      if (Array.isArray(obj.professor_names))
        document.getElementById("professor_names").value =
          obj.professor_names.join(", ");
      if (Array.isArray(obj.class_names))
        document.getElementById("class_names").value =
          obj.class_names.join(", ");
      if (Array.isArray(obj.day_names))
        document.getElementById("day_names").value = obj.day_names.join(", ");
      if (Array.isArray(obj.hour_names))
        document.getElementById("hour_names").value =
          obj.hour_names.join(", ");

      // Aggiorna stato locale coerente con i nuovi campi
      const daysVal =
        parseInt(document.getElementById("days").value, 10) || 0;
      const loadedEnabled =
        obj.free_afternoon_enabled !== false &&
        (obj.wednesday_afternoon_free !== false || obj.free_afternoon_day);
      appState.freeAfternoonEnabled = loadedEnabled;
      if (loadedEnabled) {
        const fadVal =
          parseInt(document.getElementById("free_afternoon_day").value, 10) ||
          0;
        appState.freeAfternoonDay =
          fadVal >= 1 && fadVal <= daysVal ? fadVal : 3;
        if (!document.getElementById("free_afternoon_day").value) {
          document.getElementById("free_afternoon_day").value =
            appState.freeAfternoonDay;
        }
        appState.wedFree = appState.freeAfternoonDay === 3;
      } else {
        if (freeAfternoonInput) freeAfternoonInput.value = "";
        appState.freeAfternoonDay = null;
        appState.wedFree = false;
      }
      applyFreeAfternoonUI();
      const dayNamesStr = (
        document.getElementById("day_names").value || ""
      ).trim();
      appState.dayNames = dayNamesStr
        ? dayNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const hourNamesStr = (
        document.getElementById("hour_names").value || ""
      ).trim();
      appState.hourNames = hourNamesStr
        ? hourNamesStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    }

    function getStep2DataRaw() {
      const H = [];
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;

      for (let p = 0; p < numProf; p++) {
        const row = [];
        for (let c = 0; c < numClass; c++) {
          const input = matrixContainer.querySelector(
            `input[data-prof-index='${p}'][data-class-index='${c}']`
          );
          const val = input ? parseInt(input.value, 10) || 0 : 0;
          row.push(val);
        }
        H.push(row);
      }

      return {
        num_professors: numProf,
        num_classes: numClass,
        hours_matrix: H,
      };
    }

    function loadStep2FromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      const numProf = appState.numProf;
      const numClass = appState.numClass;

      if (!Array.isArray(obj.hours_matrix)) {
        alert("JSON non valido: manca hours_matrix.");
        return;
      }
      if (
        obj.num_professors !== numProf ||
        obj.num_classes !== numClass
      ) {
        alert(
          "Le dimensioni del JSON (prof/classi) non corrispondono ai parametri correnti. Modifica i dati iniziali e ricrea la tabella, poi riprova."
        );
        return;
      }

      for (let p = 0; p < numProf; p++) {
        for (let c = 0; c < numClass; c++) {
          const v = parseInt(obj.hours_matrix[p]?.[c] ?? 0, 10) || 0;
          const input = matrixContainer.querySelector(
            `input[data-prof-index='${p}'][data-class-index='${c}']`
          );
          if (input) input.value = v > 0 ? String(v) : "";
        }
      }

      // Persist also in state
      appState.hoursMatrix = obj.hours_matrix.map((row) =>
        row.map((v) => parseInt(v, 10) || 0)
      );
      updateAllHTotals();
    }

    function getStep3DataRaw() {
      const availability = [];
      const numProf = appState.numProf || 0;
      const days = appState.days || 0;

      for (let p = 0; p < numProf; p++) {
        const row = [];
        for (let d = 0; d < days; d++) {
          const parts = [];
          for (let partIdx = 0; partIdx < DAY_PARTS.length; partIdx++) {
            const input = availabilityContainer.querySelector(
              `input[data-prof-index='${p}'][data-day-index='${d}'][data-part='${partIdx}']`
            );
            parts.push(input ? !!input.checked : true);
          }
          row.push(parts);
        }
        availability.push(row);
      }

      return {
        num_professors: numProf,
        days,
        availability,
      };
    }

    function loadStep3FromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      const numProf = appState.numProf;
      const days = appState.days;

      if (!Array.isArray(obj.availability)) {
        alert("JSON non valido: manca availability.");
        return;
      }
      if (obj.num_professors !== numProf || obj.days !== days) {
        alert(
          "Le dimensioni del JSON disponibilità non corrispondono ai parametri correnti. Modifica i dati iniziali e ricrea la tabella, poi riprova."
        );
        return;
      }

      const normalized = normalizeAvailability(
        obj.availability,
        numProf,
        days
      );
      appState.availability = normalized;
      prefillAvailabilityFromState();
    }

    // ---- Tastiera matrice H ---------------------------------------
    function addMatrixKeyboardNavigation() {
      const inputs = Array.from(
        matrixContainer.querySelectorAll("input[type='number']")
      );
      const cols = appState.numClass || 0;
      const focusIndex = (i) => {
        if (i >= 0 && i < inputs.length) inputs[i].focus();
      };
      inputs.forEach((el, idx) => {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            focusIndex(idx + 1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            focusIndex(idx + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            focusIndex(idx - 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusIndex(idx + cols);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusIndex(idx - cols);
          }
        });
      });
    }

    function renderPreviews(data) {
      const plan = data.plan; // [days][hours][classes]
      const days = data.days;
      const hours = data.daily_hours;
      const numProf = data.num_professors;
      const numClass = data.num_classes;
      const profNames = data.professor_names;
      const classNames = data.class_names;

      // Helpers to compute number of "buchi" (gaps) per prof/classe
      function countHolesInBoolArray(bools) {
        const first = bools.indexOf(true);
        const last = bools.lastIndexOf(true);
        if (first === -1 || last === -1 || first === last) return 0;
        let holes = 0;
        let inGap = false;
        for (let i = first; i <= last; i++) {
          if (!bools[i] && !inGap) {
            inGap = true;
          } else if (bools[i] && inGap) {
            holes += 1;
            inGap = false;
          }
        }
        return holes;
      }

      function countProfessorHoles(p) {
        let total = 0;
        for (let d = 0; d < days; d++) {
          const busy = [];
          for (let h = 0; h < hours; h++) {
            let assigned = false;
            for (let c = 0; c < numClass; c++) {
              if (plan[d][h][c] === p + 1) {
                assigned = true;
                break;
              }
            }
            busy.push(assigned);
          }
          total += countHolesInBoolArray(busy);
        }
        return total;
      }

      function countClassHoles(c) {
        let total = 0;
        for (let d = 0; d < days; d++) {
          const busy = [];
          for (let h = 0; h < hours; h++) {
            busy.push(plan[d][h][c] !== 0);
          }
          total += countHolesInBoolArray(busy);
        }
        return total;
      }

      let totalProfHoles = 0;
      let totalClassHoles = 0;

      // Professors preview
      previewProfessors.innerHTML = "";
      for (let p = 0; p < numProf; p++) {
        const card = document.createElement("div");
        card.className = "preview-card";

        const header = document.createElement("div");
        header.className = "preview-card-header";
        const title = document.createElement("div");
        title.className = "preview-card-title";
        title.textContent = profNames[p];

        const sub = document.createElement("div");
        sub.className = "preview-card-sub";
        sub.textContent = "";

        const right = document.createElement("div");
        right.style.marginLeft = "auto";
        const holes = countProfessorHoles(p);
        totalProfHoles += holes;
        const badge = document.createElement("span");
        badge.className = "pill-small";
        badge.textContent = `Buchi: ${holes}`;

        header.appendChild(title);
        header.appendChild(sub);
        right.appendChild(badge);
        header.appendChild(right);
        card.appendChild(header);

        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        let thEmpty = document.createElement("th");
        thEmpty.textContent = "";
        headRow.appendChild(thEmpty);

        for (let d = 0; d < days; d++) {
          const th = document.createElement("th");
          th.textContent = dayLabelAt(d);
          headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (let h = 0; h < hours; h++) {
          const row = document.createElement("tr");
          const th = document.createElement("th");
          th.textContent =
            (appState.hourNames && appState.hourNames[h]) || "Ora " + (h + 1);
          row.appendChild(th);

          for (let d = 0; d < days; d++) {
            const td = document.createElement("td");

            const classesHere = [];
            for (let c = 0; c < numClass; c++) {
              if (plan[d][h][c] === p + 1) {
                classesHere.push(classNames[c]);
              }
            }
            td.textContent = classesHere.length
              ? classesHere.join(", ")
              : "–";
            row.appendChild(td);
          }
          tbody.appendChild(row);
        }
        table.appendChild(tbody);
        card.appendChild(table);

        previewProfessors.appendChild(card);
      }

      // Classes preview
      previewClasses.innerHTML = "";
      for (let c = 0; c < numClass; c++) {
        const card = document.createElement("div");
        card.className = "preview-card";

        const header = document.createElement("div");
        header.className = "preview-card-header";
        const title = document.createElement("div");
        title.className = "preview-card-title";
        title.textContent = classNames[c];

        const sub = document.createElement("div");
        sub.className = "preview-card-sub";
        sub.textContent = "";

        const right = document.createElement("div");
        right.style.marginLeft = "auto";
        const holes = countClassHoles(c);
        totalClassHoles += holes;
        const badge = document.createElement("span");
        badge.className = "pill-small";
        badge.textContent = `Buchi: ${holes}`;

        header.appendChild(title);
        header.appendChild(sub);
        right.appendChild(badge);
        header.appendChild(right);
        card.appendChild(header);

        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        let thEmpty = document.createElement("th");
        thEmpty.textContent = "";
        headRow.appendChild(thEmpty);

        for (let d = 0; d < days; d++) {
          const th = document.createElement("th");
          th.textContent = dayLabelAt(d);
          headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (let h = 0; h < hours; h++) {
          const row = document.createElement("tr");
          const th = document.createElement("th");
          th.textContent =
            (appState.hourNames && appState.hourNames[h]) || "Ora " + (h + 1);
          row.appendChild(th);

          for (let d = 0; d < days; d++) {
            const td = document.createElement("td");
            const profId = plan[d][h][c];
            if (profId === 0) {
              td.textContent = "–";
            } else {
              td.textContent = profNames[profId - 1];
            }
            row.appendChild(td);
          }
          tbody.appendChild(row);
        }
        table.appendChild(tbody);
        card.appendChild(table);

        previewClasses.appendChild(card);
      }

      // Nessun aggiornamento score richiesto
    }

    // ---- RIEPILOGO STEP 3 ----------------------------------------
    function renderStep3Summary() {
      const wrap = document.getElementById("params-summary");
      if (!wrap) return;
      if (
        appState.days == null ||
        appState.dailyHours == null ||
        appState.numProf == null ||
        appState.numClass == null
      ) {
        wrap.innerHTML = "";
        return;
      }

      const totProfHours = appState.hoursMatrix
        ? appState.hoursMatrix.map((row) => row.reduce((a, b) => a + b, 0))
        : [];
      const totClassHours = appState.hoursMatrix
        ? appState.hoursMatrix[0].map((_, c) =>
            appState.hoursMatrix.reduce((sum, r) => sum + r[c], 0)
          )
        : [];

      const items = [
        { label: "Giorni", value: appState.days },
        appState.dayNames && appState.dayNames.length
          ? { label: "Nomi giorni", value: appState.dayNames.join(", ") }
          : null,
        {
          label: "Ore/giorno",
          value: `${appState.dailyHours} (${appState.morningHours}+${appState.afternoonHours})`,
        },
        appState.hourNames && appState.hourNames.length
          ? { label: "Nomi ore", value: appState.hourNames.join(", ") }
          : null,
        {
          label: "Pomeriggio libero",
          value:
            appState.wedFree && (appState.afternoonHours || 0) > 0
              ? "Si"
              : "No",
        },
        { label: "Professori", value: `${appState.numProf}` },
        { label: "Classi", value: `${appState.numClass}` },
      ];

      const profHoursLabel = "";
      const classHoursLabel = "";

      wrap.innerHTML =
        items
          .filter(Boolean)
          .map(
            (it) =>
              `<div class="summary-item"><span class="summary-label">${it.label}</span><span class="summary-value">${it.value}</span></div>`
          )
          .join("") +
        profHoursLabel +
        classHoursLabel;
    }

    // ---- EVENTS -----------------------------------------------------
    freeAfternoonYesBtn?.addEventListener("click", () => {
      setFreeAfternoonEnabled(true);
    });

    freeAfternoonNoBtn?.addEventListener("click", () => {
      setFreeAfternoonEnabled(false);
    });

    document.getElementById("to-step-2").addEventListener("click", () => {
      if (!collectStep1Data()) return;
      buildHoursTable();
      showStep(2);
    });

    document.getElementById("back-to-1").addEventListener("click", () => {
      collectHoursData();
      showStep(1);
    });

    document.getElementById("to-step-3").addEventListener("click", () => {
      if (!collectHoursData()) return;
      buildAvailabilityTable();
      showStep(3);
    });

    document.getElementById("back-to-2").addEventListener("click", () => {
      showStep(2);
    });

    document.getElementById("to-step-4").addEventListener("click", () => {
      if (!collectAvailabilityData()) return;
      showStep(4);
    });

    document.getElementById("back-to-3").addEventListener("click", () => {
      showStep(3);
    });

    // Reset per pagina
    function resetStep1() {
      document.getElementById("days").value = 5;
      document.getElementById("morning_hours").value = "";
      document.getElementById("afternoon_hours").value = "";
      document.getElementById("num_professors").value = "";
      document.getElementById("num_classes").value = "";
      const dayNamesEl = document.getElementById("day_names");
      if (dayNamesEl) dayNamesEl.value = "";
      const hourNamesEl = document.getElementById("hour_names");
      if (hourNamesEl) hourNamesEl.value = "";
      const fadEl = document.getElementById("free_afternoon_day");
      if (fadEl) fadEl.value = 3;
      appState.freeAfternoonEnabled = true;
      appState.freeAfternoonDay = 3;
      appState.wedFree = true;
      document.getElementById("professor_names").value = "";
      document.getElementById("class_names").value = "";
      [
        "days",
        "morning_hours",
        "afternoon_hours",
        "num_professors",
        "num_classes",
        "free_afternoon_day",
      ].forEach((id) => setFieldInvalid(id, false));
      applyFreeAfternoonUI();
    }

    function resetStep2() {
      if (
        appState.numProf == null ||
        appState.numClass == null ||
        appState.days == null
      )
        return;
      // Reset state
      appState.hoursMatrix = Array.from({ length: appState.numProf }, () =>
        Array.from({ length: appState.numClass }, () => 0)
      );
      // Ricostruisci UI coerente con reset
      buildHoursTable();
    }

    function resetStep3() {
      if (
        appState.numProf == null ||
        appState.days == null
      )
        return;
      appState.availability = Array.from({ length: appState.numProf }, () =>
        Array.from({ length: appState.days }, () => true)
      );
      buildAvailabilityTable();
    }

    function resetStep4() {
      // Reset stato visuale e preview
      errorMessage.style.display = "none";
      errorMessage.textContent = "";
      previewProfessors.innerHTML = `
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-card-title">Nessun piano ancora generato</div>
          </div>
          <div class="preview-card-sub">Premi <strong>“Genera piano”</strong> per vedere qui i dettagli per ogni docente.</div>
        </div>`;
      previewClasses.innerHTML = `
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-card-title">Nessun piano ancora generato</div>
          </div>
          <div class="preview-card-sub">Dopo la generazione, qui troverai gli orari dettagliati per ogni classe.</div>
        </div>`;
      setMethod("random");
      renderStep3Summary();
    }

    document
      .getElementById("reset-step-1")
      ?.addEventListener("click", () => openResetConfirm(1));
    document
      .getElementById("reset-step-2")
      ?.addEventListener("click", () => openResetConfirm(2));
    document
      .getElementById("reset-step-3")
      ?.addEventListener("click", () => openResetConfirm(3));
    document
      .getElementById("reset-step-4")
      ?.addEventListener("click", () => openResetConfirm(4));

    resetConfirmBtn?.addEventListener("click", () => {
      if (pendingResetStep === 1) resetStep1();
      else if (pendingResetStep === 2) resetStep2();
      else if (pendingResetStep === 3) resetStep3();
      else if (pendingResetStep === 4) resetStep4();
      closeResetConfirm();
    });
    resetCancelBtn?.addEventListener("click", closeResetConfirm);
    resetOverlay?.addEventListener("click", (e) => {
      if (e.target === resetOverlay) closeResetConfirm();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && resetOverlay.style.display === "flex") {
        closeResetConfirm();
      }
    });

    // Rimosso toggle metodo

    document
      .getElementById("generate-plan-btn")
      .addEventListener("click", generatePlan);

    document
      .getElementById("download-classes-pdf-btn")
      .addEventListener("click", () =>
        downloadPdf("/api/classes-pdf", "Piano_classi.pdf")
      );

    document
      .getElementById("download-professors-pdf-btn")
      .addEventListener("click", () =>
        downloadPdf("/api/professors-pdf", "Piano_professori.pdf")
      );

    // Step 1 save/load JSON
    document
      .getElementById("download-step1-json")
      ?.addEventListener("click", () => {
        const data = getStep1DataRaw();
        downloadJSON(data, "dati_iniziali.json");
      });
    document
      .getElementById("upload-step1-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-step1-json").click()
      );
    document
      .getElementById("upload-step1-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadStep1FromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // Step 2 save/load JSON
    document
      .getElementById("download-step2-json")
      ?.addEventListener("click", () => {
        const data = getStep2DataRaw();
        downloadJSON(data, "ore.json");
      });
    document
      .getElementById("upload-step2-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-step2-json").click()
      );
    document
      .getElementById("upload-step2-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadStep2FromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // Step 3 save/load JSON
    document
      .getElementById("download-step3-json")
      ?.addEventListener("click", () => {
        const data = getStep3DataRaw();
        downloadJSON(data, "disponibilita.json");
      });
    document
      .getElementById("upload-step3-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-step3-json").click()
      );
    document
      .getElementById("upload-step3-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadStep3FromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // init
    updateStepperUI();
    setMethod();
    wireStep1Validation();
    applySeedUI();
    applyFreeAfternoonUI();

    // ---- PERSISTENZA & CONDIVISIONE ---------------------------------
    const LS_KEY = "weeklyPlannerStateV1";

    function clearLocalState() {
      try {
        localStorage.removeItem(LS_KEY);
      } catch (e) {
        // Ignora eventuali errori (es. private mode)
      }
    }

    function serializeState() {
      return {
        currentStep,
        days: appState.days,
        morningHours: appState.morningHours,
        afternoonHours: appState.afternoonHours,
        dailyHours: appState.dailyHours,
        lastMorningHour: appState.lastMorningHour,
        numProf: appState.numProf,
        numClass: appState.numClass,
        freeAfternoonDay: appState.freeAfternoonDay,
        dayNames: appState.dayNames,
        professorNames: appState.professorNames,
        classNames: appState.classNames,
        hourNames: appState.hourNames,
        hoursMatrix: appState.hoursMatrix,
        availability: appState.availability,
        method: appState.method,
        seedEnabled: appState.seedEnabled,
        seed: appState.seed,
      };
    }

    function persistLocal() {
      try {
        const data = serializeState();
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch (e) {}
    }

    function loadLocal() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    function encodeStateForUrl(obj) {
      const json = JSON.stringify(obj);
      // Base64 URL-safe
      const b64 = btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      return b64;
    }

    function decodeStateFromUrl(str) {
      try {
        const pad =
          str.length % 4 === 0 ? str : str + "===".slice(str.length % 4);
        const b64 = pad.replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(escape(atob(b64)));
        return JSON.parse(json);
      } catch (e) {
        return null;
      }
    }

    function updateUrl() {
      const data = serializeState();
      const enc = encodeStateForUrl(data);
      const newHash = "#state=" + enc;
      if (location.hash !== newHash) {
        history.replaceState(null, "", newHash);
      }
    }

    function hydrateState(obj) {
      if (!obj) return;
      // Step 1 fields
      if (obj.days) document.getElementById("days").value = obj.days;
      if (obj.morningHours != null)
        document.getElementById("morning_hours").value =
          obj.morningHours || "";
      if (obj.afternoonHours != null)
        document.getElementById("afternoon_hours").value =
          obj.afternoonHours || "";
      if (obj.numProf != null)
        document.getElementById("num_professors").value = obj.numProf || "";
      if (obj.numClass != null)
        document.getElementById("num_classes").value = obj.numClass || "";
      if (obj.freeAfternoonDay != null)
        document.getElementById("free_afternoon_day").value =
          obj.freeAfternoonDay;
      if (Array.isArray(obj.dayNames))
        document.getElementById("day_names").value = obj.dayNames.join(", ");
      if (Array.isArray(obj.professorNames))
        document.getElementById("professor_names").value =
          obj.professorNames.join(", ");
      if (Array.isArray(obj.classNames))
        document.getElementById("class_names").value =
          obj.classNames.join(", ");
      if (Array.isArray(obj.hourNames))
        document.getElementById("hour_names").value =
          obj.hourNames.join(", ");

      // Push into appState and rebuild tables if needed
      appState.days = obj.days;
      appState.morningHours = obj.morningHours;
      appState.afternoonHours = obj.afternoonHours;
      appState.dailyHours = obj.dailyHours;
      appState.lastMorningHour = obj.lastMorningHour;
      appState.numProf = obj.numProf;
      appState.numClass = obj.numClass;
      appState.freeAfternoonDay = obj.freeAfternoonDay;
      appState.dayNames = Array.isArray(obj.dayNames) ? obj.dayNames : [];
      appState.professorNames = Array.isArray(obj.professorNames)
        ? obj.professorNames
        : [];
      appState.classNames = Array.isArray(obj.classNames)
        ? obj.classNames
        : [];
      appState.hourNames = Array.isArray(obj.hourNames) ? obj.hourNames : [];
      appState.hoursMatrix = Array.isArray(obj.hoursMatrix)
        ? obj.hoursMatrix
        : null;
      appState.availability = Array.isArray(obj.availability)
        ? obj.availability
        : null;
      appState.seedEnabled = !!obj.seedEnabled;
      appState.seed = typeof obj.seed === "number" ? obj.seed : null;
      appState.method = obj.method || "mip";
      if (appState.seedEnabled && appState.seed == null) {
        appState.seed = Math.floor(Math.random() * 10_000_000);
      }

      // Rebuild tables if we have dimensions
      if (appState.numProf && appState.numClass && appState.days) {
        buildHoursTable();
        buildAvailabilityTable();
      }
      if (seedInput && appState.seed != null) seedInput.value = appState.seed;
      applySeedUI();
      updateModeUI();
      const stepToShow = obj.currentStep || 1;
      showStep(stepToShow);
    }

    // Hydrate solo da hash condiviso; l'URL base parte sempre pulito
    (function initPersistence() {
      const hasStateHash = location.hash.startsWith("#state=");
      let hydrated = false;

      if (hasStateHash) {
        const enc = location.hash.slice("#state=".length);
        const obj = decodeStateFromUrl(enc);
        if (obj) {
          hydrateState(obj);
          hydrated = true;
        }
      }

      // Se l'URL è quello base (senza stato condiviso) riparti da zero e ripulisci hash/LS
      if (!hydrated) {
        clearLocalState();
        resetAppState();
        history.replaceState(null, "", location.pathname);
        resetStep1();
        resetStep4();
        showStep(1);
      }

      updateModeUI();
    })();

    // Persistence triggers
    [
      "days",
      "morning_hours",
      "afternoon_hours",
      "num_professors",
      "num_classes",
      "free_afternoon_day",
      "day_names",
      "professor_names",
      "class_names",
      "hour_names",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("input", () => {
          persistLocal();
          updateUrl();
        });
    });

    // Step change persist
    function wrappedShowStep(step) {
      showStep(step);
      persistLocal();
      updateUrl();
    }
    // Override navigation listeners to use wrappedShowStep
    document.getElementById("to-step-2").onclick = () => {
      if (!collectStep1Data()) return;
      buildHoursTable();
      wrappedShowStep(2);
    };
    document.getElementById("back-to-1").onclick = () => {
      collectHoursData();
      wrappedShowStep(1);
    };
    document.getElementById("to-step-3").onclick = () => {
      if (!collectHoursData()) return;
      buildAvailabilityTable();
      wrappedShowStep(3);
    };
    document.getElementById("back-to-2").onclick = () => {
      wrappedShowStep(2);
    };
    document.getElementById("to-step-4").onclick = () => {
      if (!collectAvailabilityData()) return;
      wrappedShowStep(4);
    };
    document.getElementById("back-to-3").onclick = () => {
      wrappedShowStep(3);
    };

    // Matrix & availability live sync already update appState; hook persistence
    const origWireHoursLiveSync = wireHoursLiveSync;
    wireHoursLiveSync = function () {
      origWireHoursLiveSync();
      matrixContainer.querySelectorAll("input[type='number']").forEach((el) =>
        el.addEventListener("input", () => {
          persistLocal();
          updateUrl();
        })
      );
    };
    const origWireAvailabilityLiveSync = wireAvailabilityLiveSync;
    wireAvailabilityLiveSync = function () {
      origWireAvailabilityLiveSync();
      availabilityContainer
        .querySelectorAll("input[type='checkbox']")
        .forEach((el) =>
          el.addEventListener("change", () => {
            persistLocal();
            updateUrl();
          })
        );
    };

    // Seed lock & input
    if (seedLockBtn) {
      seedLockBtn.addEventListener("click", () => {
        appState.seedEnabled = !appState.seedEnabled;
        if (appState.seedEnabled) {
          let parsed = clampSeed(parseInt(seedInput?.value ?? "", 10));
          if (parsed === null) {
            parsed = Math.floor(Math.random() * 10_000_000);
          }
          appState.seed = parsed;
          if (seedInput) seedInput.value = parsed;
        }
        applySeedUI();
        persistLocal();
        updateUrl();
      });
    }

    if (seedInput) {
      seedInput.addEventListener("input", () => {
        if (appState.seedEnabled) return; // locked: input disabled anyway
        const parsed = clampSeed(parseInt(seedInput.value, 10));
        if (parsed !== null) {
          appState.seed = parsed;
        }
        persistLocal();
        updateUrl();
      });
    }

    if (modeRandomBtn) {
      modeRandomBtn.addEventListener("click", () => {
        appState.method = "random";
        updateModeUI();
        persistLocal();
        updateUrl();
      });
    }

    if (modeMipBtn) {
      modeMipBtn.addEventListener("click", () => {
        appState.method = "mip";
        updateModeUI();
        persistLocal();
        updateUrl();
      });
    }

    // Reset persistence
    const origReset1 = resetStep1;
    resetStep1 = function () {
      origReset1();
      collectStep1Data();
      persistLocal();
      updateUrl();
    };
    const origReset2 = resetStep2;
    resetStep2 = function () {
      origReset2();
      persistLocal();
      updateUrl();
    };
    const origReset3 = resetStep3;
    resetStep3 = function () {
      origReset3();
      persistLocal();
      updateUrl();
    };

    // Share link button
    document
      .getElementById("share-link-btn")
      ?.addEventListener("click", () => {
        const data = serializeState();
        const enc = encodeStateForUrl(data);
        const url = location.origin + location.pathname + "#state=" + enc;
        navigator.clipboard
          .writeText(url)
          .then(() => {
            const btn = document.getElementById("share-link-btn");
            if (btn) {
              const old = btn.textContent;
              btn.textContent = "Link copiato!";
              setTimeout(() => (btn.textContent = old), 1800);
            }
          })
          .catch(() => {
            alert("Impossibile copiare il link negli appunti.");
          });
      });

    // Non persistiamo né aggiorniamo l'URL automaticamente all'avvio
  }
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
  const app = new WeeklyPlannerApp();
  app.init();
});
