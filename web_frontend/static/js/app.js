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
      appState.numSubjects = null;
      appState.freeAfternoonEnabled = true;
      appState.wedFree = true;
      appState.dayNames = [];
      appState.subjectNames = [];
      appState.freeAfternoonDay = 3;
      appState.seedEnabled = false;
      appState.seed = null;
      appState.professorNames = [];
      appState.classNames = [];
      appState.hourNames = [];
      appState.subjectClassHours = [];
      appState.hoursMatrix = null;
      appState.classTeachers = [];
      appState.availability = null;
      appState.preferences = [];
      appState.subjectAssignments = [];
      appState.subjectDailyMax = [];
      appState._assignmentsHasDeficit = false;
      appState.aggregateHoursRule = true;
      appState.singleTeacherRule = true;
      appState.generateBothWeeks = false;
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
    const preferencesContainer = document.getElementById("preferences-container");
    const dailyMaxContainer = document.getElementById("daily-max-container");
    const ruleAggregateChk = document.getElementById("rule-aggregate-hours");
    const ruleSingleTeacherChk = document.getElementById("rule-single-teacher");
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
    const themeLightBtn = document.getElementById("theme-light");
    const themeDarkBtn = document.getElementById("theme-dark");
    const freeAfternoonYesBtn = document.getElementById("free-afternoon-yes");
    const freeAfternoonNoBtn = document.getElementById("free-afternoon-no");
    const freeAfternoonInput = document.getElementById("free_afternoon_day");
    const seedLockBtn = document.getElementById("seed-lock");
    const seedInput = document.getElementById("seed-value");
    const modeGreedyBtn = document.getElementById("mode-greedy");
    const modeMipBtn = document.getElementById("mode-mip");
    const loadingBar = document.getElementById("loading-bar");
    const loadingBarInner = document.getElementById("loading-bar-inner");
    const loadingBarLabel = document.getElementById("loading-bar-label");
    const nomenclatureProfList = document.getElementById("nomenclature-professors");
    const nomenclatureClassList = document.getElementById("nomenclature-classes");
    const nomenclatureSubjectList = document.getElementById("nomenclature-subjects");
    const nomenclatureDayList = document.getElementById("nomenclature-days");
    const nomenclatureHourList = document.getElementById("nomenclature-hours");
    const assignmentsContainer = document.getElementById("assignments-container");
    const assignmentsInfo = document.getElementById("assignments-info");
    const assignmentsWarning = document.getElementById("assignments-warning");
    const subjectHoursContainer = document.getElementById("subject-hours-container");
    let loadingTimer = null;
    let loadingStart = 0;
    let loadingTargetMs = 0;
    let pendingResetStep = null;

    const THEME_STORAGE_KEY = "weeklyPlannerTheme";

    function applyTheme(next) {
      const theme = next === "light" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", theme);
      if (themeLightBtn) {
        const isLight = theme === "light";
        themeLightBtn.classList.toggle("active", isLight);
        themeLightBtn.setAttribute("aria-pressed", isLight ? "true" : "false");
      }
      if (themeDarkBtn) {
        const isDark = theme === "dark";
        themeDarkBtn.classList.toggle("active", isDark);
        themeDarkBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
      }
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (e) {
        // ignore storage issues (private mode, etc.)
      }
    }

    function detectInitialTheme() {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark") return stored;
      } catch (e) {
        // ignore
      }
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
      return document.documentElement.getAttribute("data-theme") || "dark";
    }

    applyTheme(detectInitialTheme());

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
      if (step === 2) {
        buildNomenclatureFields();
      }
      if (step === 3) {
        buildSubjectHoursTable();
        renderAssignmentCoverage();
      }
      if (step === 4) {
        buildAssignmentsUI();
        renderAssignmentCoverage();
      }
      if (step === 5) {
        buildDailyMaxTable();
      }
      if (step === 6) {
        buildPreferencesTable();
      }
      if (step === 7) {
        buildAvailabilityTable();
      }
      if (step === 8) {
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
      const okSubjects = validateNumberField("num_subjects", 0);
      if (!(okDays && okMorning && okAfternoon && okProf && okClass && okSubjects)) {
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
      const numSubjects = parseInt(
        document.getElementById("num_subjects").value,
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

      appState.days = days;
      appState.morningHours = morningHours;
      appState.afternoonHours = afternoonHours;
      appState.dailyHours = dailyHours;
      appState.lastMorningHour = lastMorningHour;
      appState.numProf = numProf;
      appState.numClass = numClass;
      appState.numSubjects = numSubjects;
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
      // I nomi vengono raccolti allo step 2
      appState.dayNames = appState.dayNames || [];
      appState.professorNames = appState.professorNames || [];
      appState.classNames = appState.classNames || [];
      appState.hourNames = appState.hourNames || [];
      appState.subjectNames = appState.subjectNames || [];

      return true;
    }

    // ---- STEP 2: NOMENCLATURA DINAMICA ---------------------------
    function buildNomenclatureFields() {
      const builders = [
        {
          container: nomenclatureProfList,
          count: appState.numProf,
          values: appState.professorNames,
          prefix: "Prof",
          type: "professor",
        },
        {
          container: nomenclatureClassList,
          count: appState.numClass,
          values: appState.classNames,
          prefix: "Classe",
          type: "class",
        },
        {
          container: nomenclatureSubjectList,
          count: appState.numSubjects,
          values: appState.subjectNames,
          prefix: "Materia",
          type: "subject",
        },
        {
          container: nomenclatureDayList,
          count: appState.days,
          values: appState.dayNames,
          prefix: "Giorno",
          type: "day",
        },
        {
          container: nomenclatureHourList,
          count: appState.dailyHours,
          values: appState.hourNames,
          prefix: "Ora",
          type: "hour",
        },
      ];

      builders.forEach((b) => {
        if (!b.container) return;
        b.container.innerHTML = "";
        if (!b.count) return;
        for (let i = 0; i < b.count; i++) {
          const wrap = document.createElement("div");
          wrap.className = "naming-row";
          const label = document.createElement("label");
          label.className = "field-label";
          label.textContent = `${b.prefix} ${i + 1}`;
          const input = document.createElement("input");
          input.className = "input";
          input.type = "text";
          input.value = (b.values && b.values[i]) || "";
          input.placeholder = `${b.prefix} ${i + 1}`;
          input.setAttribute("data-nomenclature-type", b.type);
          input.setAttribute("data-index", i);
          wrap.appendChild(label);
          wrap.appendChild(input);
          b.container.appendChild(wrap);
        }
      });

      // Aggiungi listener di persistenza dopo aver costruito gli input
      wireNomenclaturePersistence();
    }

    function collectNomenclatureData() {
      syncNomenclatureFromDOM();
      return true;
    }

    // ---- STEP 3: ASSEGNAZIONE ORE/MATERIE -------------------------
    function ensureAssignmentsShape() {
      if (appState.numProf == null) return;
      if (!Array.isArray(appState.subjectAssignments)) {
        appState.subjectAssignments = [];
      }
      while (appState.subjectAssignments.length < appState.numProf) {
        appState.subjectAssignments.push({
          totalHours: 0,
          subjects: [{ subjectIndex: null, hours: null }],
        });
      }
      if (appState.subjectAssignments.length > appState.numProf) {
        appState.subjectAssignments = appState.subjectAssignments.slice(
          0,
          appState.numProf
        );
      }
      appState.subjectAssignments = appState.subjectAssignments.map((a) => ({
        totalHours: a?.totalHours || 0,
        subjects:
          Array.isArray(a?.subjects) && a.subjects.length
            ? a.subjects.map((s) => ({
                subjectIndex:
                  typeof s.subjectIndex === "number"
                    ? s.subjectIndex
                    : s.subjectIndex == null
                    ? null
                    : parseInt(s.subjectIndex, 10) || null,
                hours:
                  s?.hours == null || s.hours === ""
                    ? null
                    : parseInt(s.hours, 10) || null,
              }))
            : [{ subjectIndex: null, hours: null }],
      }));
    }

    function buildAssignmentsUI() {
      if (!assignmentsContainer) return;
      ensureAssignmentsShape();
      assignmentsContainer.innerHTML = "";
      const subjectOptions =
        appState.subjectNames && appState.subjectNames.length
          ? appState.subjectNames
          : Array.from({ length: appState.numSubjects || 0 }, (_, i) => `Materia ${i + 1}`);
      const profNames =
        appState.professorNames && appState.professorNames.length
          ? appState.professorNames
          : Array.from({ length: appState.numProf || 0 }, (_, i) => `Prof ${i + 1}`);

        const createRow = (p, slot, showRemove) => {
          const row = document.createElement("div");
          row.className = "assign-row";
          row.dataset.profIndex = String(p);
          row.dataset.slotIndex = String(slot);

          const select = document.createElement("select");
          select.className = "input";
          select.dataset.profIndex = String(p);
          select.dataset.slotIndex = String(slot);

        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "Seleziona materia";
        select.appendChild(emptyOpt);

        subjectOptions.forEach((name, idx) => {
          const opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = name || `Materia ${idx + 1}`;
          select.appendChild(opt);
        });

        const saved = appState.subjectAssignments?.[p]?.subjects?.[slot];
        if (saved && saved.subjectIndex != null) {
          select.value = String(saved.subjectIndex);
        }

        const hoursInput = document.createElement("input");
        hoursInput.type = "number";
        hoursInput.min = "0";
        hoursInput.className = "input assign-hours";
        hoursInput.placeholder = "Ore totali";
        hoursInput.dataset.profIndex = String(p);
        hoursInput.dataset.slotIndex = String(slot);
        hoursInput.value =
          saved && saved.hours != null && saved.hours !== ""
            ? String(saved.hours)
            : "";

          const inputsWrap = document.createElement("div");
          inputsWrap.className = "assign-inputs";
          inputsWrap.appendChild(select);
          inputsWrap.appendChild(hoursInput);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "btn btn-danger-outline assign-remove";
          removeBtn.textContent = "−";
          removeBtn.title = "Rimuovi materia";
          removeBtn.addEventListener("click", () => {
            const subjects = appState.subjectAssignments[p].subjects;
            if (subjects.length > 1) {
              subjects.splice(slot, 1);
              buildAssignmentsUI();
          } else {
            subjects[0] = { subjectIndex: null, hours: null };
            buildAssignmentsUI();
          }
        });

          row.appendChild(inputsWrap);
          const actions = document.createElement("div");
          actions.className = "assign-row-actions";
          if (showRemove) {
            actions.appendChild(removeBtn);
          }
          inputsWrap.appendChild(actions);
          row.appendChild(inputsWrap);
          return row;
        };

      for (let p = 0; p < (appState.numProf || 0); p++) {
        const card = document.createElement("div");
        card.className = "assign-card";

        const header = document.createElement("div");
        header.className = "assign-card-header";
        const title = document.createElement("div");
        title.className = "assign-card-title";
        title.textContent = profNames[p] || `Prof ${p + 1}`;
        const total = document.createElement("div");
        total.className = "assign-total";
        const currentTotal =
          appState.subjectAssignments?.[p]?.subjects?.reduce(
            (s, entry) => s + (parseInt(entry?.hours, 10) || 0),
            0
          ) || 0;
        total.textContent = `Totale ore: ${currentTotal}`;
        total.id = `assign-total-${p}`;

        header.appendChild(title);
        header.appendChild(total);
        card.appendChild(header);

        const rowsWrap = document.createElement("div");
        rowsWrap.className = "assign-rows";

        const subjects =
          appState.subjectAssignments?.[p]?.subjects?.length > 0
            ? appState.subjectAssignments[p].subjects
            : [{ subjectIndex: null, hours: null }];

        subjects.forEach((_, slot) => {
          rowsWrap.appendChild(createRow(p, slot, subjects.length > 1));
        });

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn btn-ghost assign-add";
        addBtn.textContent = "+ Aggiungi materia";
        addBtn.addEventListener("click", () => {
          appState.subjectAssignments[p].subjects.push({
            subjectIndex: null,
            hours: null,
          });
          buildAssignmentsUI();
        });

        const addWrap = document.createElement("div");
        addWrap.className = "assign-add-row";
        addWrap.appendChild(addBtn);

        card.appendChild(rowsWrap);
        card.appendChild(addWrap);
        assignmentsContainer.appendChild(card);
      }

      assignmentsContainer
        .querySelectorAll("select, input.assign-hours")
        .forEach((el) => {
          el.addEventListener("change", updateTotals);
          el.addEventListener("input", updateTotals);
        });

      wireAssignmentsPersistence();
    }

    function updateTotals() {
      if (!appState.numProf) return;
      const snapshot = [];
      for (let p = 0; p < appState.numProf; p++) {
        let tot = 0;
        const subjects = [];
        const rows = assignmentsContainer?.querySelectorAll(
          `.assign-row[data-prof-index='${p}']`
        );
        rows?.forEach((row) => {
          const slot = parseInt(row.dataset.slotIndex, 10);
          const sel = row.querySelector("select");
          const hrsEl = row.querySelector("input.assign-hours");
          const selVal = sel ? sel.value : "";
          const hrsVal = hrsEl ? parseInt(hrsEl.value, 10) : NaN;
          if (!selVal) return;
          if (!isNaN(hrsVal)) {
            tot += hrsVal;
            subjects.push({ subjectIndex: parseInt(selVal, 10), hours: hrsVal });
          }
          if (appState.subjectAssignments?.[p]?.subjects?.[slot]) {
            appState.subjectAssignments[p].subjects[slot] = {
              subjectIndex: selVal ? parseInt(selVal, 10) : null,
              hours: isNaN(hrsVal) ? null : hrsVal,
            };
          }
        });
        snapshot.push({ totalHours: tot, subjects });
        const totalEl = document.getElementById(`assign-total-${p}`);
        if (totalEl) totalEl.textContent = `Totale ore: ${tot}`;
      }
      appState.subjectAssignments = snapshot;
      renderAssignmentCoverage();
      persistLocal();
      updateUrl();
    }

    function collectAssignmentsData() {
      syncAssignmentsFromDOM();
      ensureAssignmentsShape();
      console.log("[collectAssignmentsData] appState.subjectAssignments:", JSON.stringify(appState.subjectAssignments));
      
      if (!appState.numProf || !appState.numSubjects) {
        appState.subjectAssignments = [];
        return true;
      }

      // Validazione: ogni professore deve avere almeno una materia
      const hasEmpty = (appState.subjectAssignments || []).some(
        (assign) => !assign.subjects || assign.subjects.length === 0
      );

      console.log("[collectAssignmentsData] Validation - hasEmpty:", hasEmpty);

      if (hasEmpty) {
        alert("Aggiungi almeno una materia a ogni professore.");
        return false;
      }

      renderAssignmentCoverage();
      return true;
    }

    function renderAssignmentCoverage() {
      if (!assignmentsInfo) return;
      ensureSubjectHoursShape();
      const subjectNames =
        appState.subjectNames && appState.subjectNames.length
          ? appState.subjectNames
          : Array.from({ length: appState.numSubjects || 0 }, (_, i) => `Materia ${i + 1}`);
      const requiredA = [];
      const requiredB = [];
      for (let s = 0; s < (appState.numSubjects || 0); s++) {
        const row = appState.subjectClassHours?.[s] || {};
        if (row.altWeeks) {
          requiredA.push(
            (row.hoursA || []).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)
          );
          requiredB.push(
            (row.hoursB || []).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)
          );
        } else {
          const base = (row.hours || []).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
          requiredA.push(base);
          requiredB.push(base);
        }
      }
      const covered = Array.from({ length: appState.numSubjects || 0 }, () => 0);
      (appState.subjectAssignments || []).forEach((assign) => {
        assign.subjects?.forEach((s) => {
          if (
            typeof s.subjectIndex === "number" &&
            s.subjectIndex >= 0 &&
            s.subjectIndex < covered.length
          ) {
            covered[s.subjectIndex] += parseInt(s.hours, 10) || 0;
          }
        });
      });

      assignmentsInfo.innerHTML = "";
      let hasDeficit = false;
      for (let i = 0; i < (appState.numSubjects || 0); i++) {
        const card = document.createElement("div");
        card.className = "coverage-item";
        const needA = requiredA[i] || 0;
        const needB = requiredB[i] || 0;
        const have = covered[i] || 0;
        const deficitA = needA > 0 && have < needA;
        const deficitB = needB > 0 && have < needB;
        if (deficitA || deficitB) {
          card.classList.add("danger");
          hasDeficit = true;
        }
        const title = document.createElement("div");
        title.className = "coverage-title";
        title.textContent = subjectNames[i] || `Materia ${i + 1}`;
        const val = document.createElement("div");
        val.className = "coverage-value";
        if (needA === needB) {
          val.textContent = `${have} / ${needA || 0} ore`;
        } else {
          val.innerHTML = `A: ${have} / ${needA || 0} ore<br>B: ${have} / ${needB || 0} ore`;
        }
        card.appendChild(title);
        card.appendChild(val);
        assignmentsInfo.appendChild(card);
      }
      if (assignmentsWarning) {
        assignmentsWarning.style.display = hasDeficit ? "block" : "none";
        assignmentsWarning.textContent = hasDeficit
          ? "Copri tutte le ore richieste per procedere."
          : "";
      }
      appState._assignmentsHasDeficit = hasDeficit;
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
      thTotal.className = "total-header";
      headRowH.appendChild(thTotal);

      const thClassTeacher = document.createElement("th");
      thClassTeacher.innerHTML = "Docente<br>di classe";
      thClassTeacher.className = "class-teacher-header";
      headRowH.appendChild(thClassTeacher);

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

        const tdClassTeacher = document.createElement("td");
        tdClassTeacher.className = "class-teacher-cell";
        const ctToggle = document.createElement("input");
        ctToggle.type = "checkbox";
        ctToggle.dataset.profIndex = p;
        ctToggle.dataset.classTeacher = "true";
        ctToggle.setAttribute(
          "aria-label",
          `Segna ${profNames[p]} come docente di classe`
        );
        tdClassTeacher.appendChild(ctToggle);
        row.appendChild(tdClassTeacher);

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
      prefillClassTeacherFlags();
      updateAllHTotals();
      addMatrixKeyboardNavigation();
      wireHoursLiveSync();
    }

    function getAvailabilityRows() {
      const profNames = appState.professorNames || [];
      const rows = [];
      const numProf = appState.numProf || 0;
      for (let p = 0; p < numProf; p++) {
        rows.push({
          key: `p-${p}`,
          profIndex: p,
          label: profNames[p] || `Prof ${p + 1}`,
        });
      }
      return rows;
    }

    function buildPreferencesTable() {
      if (!preferencesContainer) return;
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const profNames = appState.professorNames || [];
      const classNames =
        appState.classNames && appState.classNames.length
          ? appState.classNames
          : Array.from({ length: numClass }, (_, i) => `Classe ${i + 1}`);

      if (ruleSingleTeacherChk) {
        ruleSingleTeacherChk.checked = !!appState.singleTeacherRule;
        ruleSingleTeacherChk.onchange = () => {
          appState.singleTeacherRule = !!ruleSingleTeacherChk.checked;
          persistLocal();
          updateUrl();
        };
      }

      // init state
      if (
        !Array.isArray(appState.preferences) ||
        appState.preferences.length !== numProf
      ) {
        appState.preferences = Array.from({ length: numProf }, () =>
          Array.from({ length: numClass }, () => false)
        );
      } else {
        for (let p = 0; p < numProf; p++) {
          if (
            !Array.isArray(appState.preferences[p]) ||
            appState.preferences[p].length !== numClass
          ) {
            appState.preferences[p] = Array.from(
              { length: numClass },
              () => false
            );
          }
        }
      }

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const empty = document.createElement("th");
      empty.textContent = "";
      headRow.appendChild(empty);
      classNames.forEach((c) => {
        const th = document.createElement("th");
        th.textContent = c || "Classe";
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (let p = 0; p < numProf; p++) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = profNames[p] || `Prof ${p + 1}`;
        row.appendChild(th);
        for (let c = 0; c < numClass; c++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.dataset.profIndex = p;
          input.dataset.classIndex = c;
          input.dataset.prefType = "professor_class";
          input.checked = !!appState.preferences[p][c];
          td.appendChild(input);
          row.appendChild(td);
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);

      preferencesContainer.innerHTML = "";
      preferencesContainer.appendChild(table);

      preferencesContainer.querySelectorAll("input[type='checkbox']").forEach((el) => {
          el.addEventListener("change", (e) => {
            const p = parseInt(e.target.dataset.profIndex, 10);
            const c = parseInt(e.target.dataset.classIndex, 10);
            appState.preferences[p][c] = !!e.target.checked;
            persistLocal();
            updateUrl();
          });
        const td = el.closest("td");
        if (td) {
          td.addEventListener("click", () => {
            el.checked = !el.checked;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }
      });

      wirePreferencesPersistence();
    }

    function collectPreferencesData() {
      syncPreferencesFromDOM();
      appState.singleTeacherRule = ruleSingleTeacherChk
        ? !!ruleSingleTeacherChk.checked
        : appState.singleTeacherRule;
      if (ruleSingleTeacherChk) {
        ruleSingleTeacherChk.checked = !!appState.singleTeacherRule;
      }
      return true;
    }

    function normalizeAvailability(raw, rowsCount, days) {
      const result = [];
      for (let r = 0; r < rowsCount; r++) {
        const row = [];
        for (let d = 0; d < days; d++) {
          const cell = raw?.[r]?.[d];
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

    function buildAvailabilityTable() {
      const days = appState.days;
      const rows = getAvailabilityRows();

      ensureStep2StateArrays();

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
      rows.forEach((rowDef, idx) => {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = rowDef.label;
        row.appendChild(th);

        const tdPerc = document.createElement("td");
        tdPerc.className = "availability-perc";
        tdPerc.dataset.rowIndex = idx;
        tdPerc.textContent = "0%";
        row.appendChild(tdPerc);

        for (let d = 0; d < days; d++) {
          DAY_PARTS.forEach((_, partIdx) => {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = true;
            input.dataset.rowIndex = idx;
            input.dataset.dayIndex = d;
            input.dataset.part = partIdx;
            td.appendChild(input);
            row.appendChild(td);
          });
        }
        tbodyA.appendChild(row);
      });
      tableA.appendChild(tbodyA);

      availabilityContainer.innerHTML = "";
      availabilityContainer.appendChild(tableA);
      prefillAvailabilityFromState();
      updateAllAvailabilityPerc();
      wireAvailabilityLiveSync();
    }

    // Initialize and keep step 2 state arrays sized properly
    function ensureStep2StateArrays() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const days = appState.days || 0;
      const availRows = getAvailabilityRows().length;

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
      if (
        !Array.isArray(appState.classTeachers) ||
        appState.classTeachers.length !== numProf
      ) {
        appState.classTeachers = Array.from({ length: numProf }, () => false);
      } else {
        appState.classTeachers = appState.classTeachers.map((v, idx) =>
          idx < numProf ? !!v : false
        );
      }
      appState.availability = normalizeAvailability(
        appState.availability,
        availRows,
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

    function prefillClassTeacherFlags() {
      const numProf = appState.numProf || 0;
      for (let p = 0; p < numProf; p++) {
        const input = matrixContainer.querySelector(
          `input[data-class-teacher='true'][data-prof-index='${p}']`
        );
        if (!input) continue;
        const v = !!appState.classTeachers?.[p];
        input.checked = v;
      }
    }

    function prefillAvailabilityFromState() {
      const rows = getAvailabilityRows();
      const days = appState.days || 0;
      if (!Array.isArray(appState.availability)) return;
      for (let r = 0; r < rows.length; r++) {
        for (let d = 0; d < days; d++) {
          DAY_PARTS.forEach((_, partIndex) => {
            const input = availabilityContainer.querySelector(
              `input[data-row-index='${r}'][data-day-index='${d}'][data-part='${partIndex}']`
            );
            if (!input) return;
            const v = !!appState.availability[r]?.[d]?.[partIndex];
            input.checked = v;
          });
        }
      }
      updateAllAvailabilityPerc();
    }

    function computeAvailabilityPerc(r) {
      const days = appState.days || 0;
      let checked = 0;
      for (let d = 0; d < days; d++) {
        const dayArr = appState.availability?.[r]?.[d];
        if (Array.isArray(dayArr)) {
          dayArr.forEach((val) => {
            if (val) checked += 1;
          });
        }
      }
      return checked * 10; // +10% per spunta
    }

    function updateAvailabilityPerc(r) {
      const cell = availabilityContainer.querySelector(
        `td.availability-perc[data-row-index='${r}']`
      );
      if (!cell) return;
      const perc = computeAvailabilityPerc(r);
      cell.textContent = `${perc}%`;
    }

    function updateAllAvailabilityPerc() {
      const rows = getAvailabilityRows();
      for (let r = 0; r < rows.length; r++) {
        updateAvailabilityPerc(r);
      }
    }

    function aggregateAvailabilityForPayload() {
      const rows = getAvailabilityRows();
      const numProf = appState.numProf || 0;
      const days = appState.days || 0;
      if (!rows.length || !Array.isArray(appState.availability)) return null;
      const agg = Array.from({ length: numProf }, () =>
        Array.from({ length: days }, () => [false, false])
      );
      rows.forEach((row, idx) => {
        const p = row.profIndex;
        if (p == null || p < 0 || p >= numProf) return;
        for (let d = 0; d < days; d++) {
          const cell = appState.availability?.[idx]?.[d];
          if (!Array.isArray(cell)) continue;
          for (let part = 0; part < 2; part++) {
            if (cell[part]) agg[p][d][part] = true;
          }
        }
      });
      return agg;
    }

    function wireHoursLiveSync() {
      if (!matrixContainer) return;
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
      matrixContainer
        .querySelectorAll("input[type='checkbox'][data-class-teacher='true']")
        .forEach((el) => {
          el.addEventListener("change", (e) => {
            const p = parseInt(e.target.dataset.profIndex, 10);
            if (!Array.isArray(appState.classTeachers)) return;
            appState.classTeachers[p] = !!e.target.checked;
          });
          const td = el.closest("td");
          if (td) {
            td.addEventListener("click", (evt) => {
              if (evt.target === el) return;
              el.checked = !el.checked;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            });
          }
        });
    }

    function wireAvailabilityLiveSync() {
      // Availability checkboxes live-sync
      availabilityContainer
        .querySelectorAll("input[type='checkbox']")
        .forEach((el) => {
          el.addEventListener("change", (e) => {
            const p = parseInt(e.target.dataset.rowIndex, 10);
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
      const classTeachers = [];
      for (let p = 0; p < numProf; p++) {
        const toggle = matrixContainer.querySelector(
          `input[data-class-teacher='true'][data-prof-index='${p}']`
        );
        classTeachers.push(!!toggle?.checked);
      }
      appState.classTeachers = classTeachers;

      return true;
    }

    function collectAvailabilityData() {
      syncAvailabilityFromDOM();
      const rows = getAvailabilityRows();
      
      if (!Array.isArray(appState.availability) || appState.availability.length === 0) {
        alert("La matrice disponibilità non è stata creata.");
        return false;
      }
      return true;
    }

    // Metodo predefinito: ottimale (mip)
    function setMethod(method = "mip") {
      appState.method = method || "mip";
      updateModeUI();
    }

    function updateModeUI() {
      const method = appState.method || "mip";
      if (modeGreedyBtn) {
        const active = method === "greedy";
        modeGreedyBtn.classList.toggle("active", active);
        modeGreedyBtn.setAttribute("aria-pressed", active ? "true" : "false");
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
      const method = appState.method || "mip";
      
      // Se è greedy, stima veloce (5 secondi)
      if (method === "greedy") {
        return 5000;
      }

      // Se è MIP, stima più complessa
      let totalHours = 0;
      
      // Calcola ore totali da assegnare
      if (appState.subjectClassHours && Array.isArray(appState.subjectClassHours)) {
        // Modalità materie
        for (const row of appState.subjectClassHours) {
          if (row.altWeeks) {
            // Se ha settimane A/B, conta sia A che B
            const hoursA = (row.hoursA || []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
            const hoursB = (row.hoursB || []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
            totalHours += hoursA + hoursB;
          } else {
            const baseHours = (row.hours || []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
            totalHours += baseHours;
          }
        }
      } else if (Array.isArray(appState.hoursMatrix) && p > 0) {
        // Modalità legacy (matrice prof-classe)
        const totals = appState.hoursMatrix.map((row) =>
          row.reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
        );
        totalHours = totals.reduce((s, v) => s + v, 0);
      }

      // Numero di settimane (A e B)
      const hasWeekB = appState.subjectClassHours && 
                       Array.isArray(appState.subjectClassHours) &&
                       appState.subjectClassHours.some(row => !!row.altWeeks);
      const weekMultiplier = hasWeekB ? 2 : 1;

      // Numero di soggetti (materie o prof)
      const numSubjects = appState.numSubjects || p;

      // Stima MIP: base 30 secondi, aumenta con complessità
      // Fattori: giorni, ore/giorno, prof, classi, materie, total hours, settimane
      const baseMs = 30000;
      const complexity = (d / 2.5) * (h / 5) * (p / 2) * (c / 2) * (numSubjects / 3) * (1 + totalHours / 100);
      const estimateMs = baseMs + complexity * 500;
      
      return estimateMs * weekMultiplier;
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
      loadingTargetMs = Math.max(800, totalMs * 0.85);
      setProgress(appState.method === "mip" ? 4 : 6);
      if (loadingTimer) clearInterval(loadingTimer);
      loadingTimer = setInterval(() => {
        const elapsed = Date.now() - loadingStart;
        const projected = (elapsed / loadingTargetMs) * 99;
        setProgress(Math.min(99, projected));
      }, 250);
      return setProgress;
    }

    // ---- PAYLOAD & API CALLS ---------------------------------------
    // ===== SISTEMA ROBUSTO DI RACCOLTA DATI =====
    
    /**
     * Sincronizza tutti i dati dal DOM verso appState.
     * Deve essere chiamato PRIMA di raccogliere qualsiasi dato.
     */
    function syncAllDataFromDOM() {
      console.log(">>> syncAllDataFromDOM INIZIATO <<<");
      
      // Step 1: dati iniziali
      const days = parseInt(document.getElementById("days")?.value || 0, 10);
      const morningHours = parseInt(document.getElementById("morning_hours")?.value || 0, 10);
      const afternoonHours = parseInt(document.getElementById("afternoon_hours")?.value || 0, 10);
      const numProf = parseInt(document.getElementById("num_professors")?.value || 0, 10);
      const numClass = parseInt(document.getElementById("num_classes")?.value || 0, 10);
      const numSubjects = parseInt(document.getElementById("num_subjects")?.value || 0, 10);

      console.log("Step 1 - Dati iniziali:", { days, morningHours, afternoonHours, numProf, numClass, numSubjects });

      appState.days = days;
      appState.morningHours = morningHours;
      appState.afternoonHours = afternoonHours;
      appState.dailyHours = morningHours + afternoonHours;
      appState.lastMorningHour = morningHours;
      appState.numProf = numProf;
      appState.numClass = numClass;
      appState.numSubjects = numSubjects;

      // Step 2: nomenclatura
      console.log(">>> Sync Step 2 - Nomenclatura");
      syncNomenclatureFromDOM();

      // Step 3: ore materie/classi
      // NON sincronizziamo dal DOM perché onSubjectHoursChange() sta già salvando in appState in tempo reale
      console.log(">>> Sync Step 3 - Subject Hours (skipped - managed by onSubjectHoursChange)");
      ensureSubjectHoursShape(); // Solo normalizza, non svuota

      // Step 4: assegnazioni
      console.log(">>> Sync Step 4 - Assignments");
      syncAssignmentsFromDOM();

      // Step 5: limiti giornalieri
      console.log(">>> Sync Step 5 - Daily Max");
      syncDailyMaxFromDOM();

      // Step 6: preferenze
      console.log(">>> Sync Step 6 - Preferences");
      syncPreferencesFromDOM();

      // Step 7: disponibilità
      console.log(">>> Sync Step 7 - Availability");
      syncAvailabilityFromDOM();
      
      console.log(">>> syncAllDataFromDOM COMPLETATO, appState.subjectClassHours:", appState.subjectClassHours);
    }

    // ===== PERSISTENZA ROBUSTA DEI DATI =====
    
    /**
     * Salva un valore di input nel localStorage
     */
    function saveInputValue(inputId, value) {
      const key = `input_${inputId}`;
      localStorage.setItem(key, value);
      console.log(`[PERSIST] ${key} = ${value}`);
    }

    /**
     * Carica un valore dal localStorage
     */
    function loadInputValue(inputId, defaultValue = "") {
      const key = `input_${inputId}`;
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    }

    /**
     * Attacca listener a un input per salvare automaticamente
     */
    function wireInputPersistence(inputId) {
      const input = document.getElementById(inputId);
      if (!input) return;
      
      // Carica il valore salvato
      input.value = loadInputValue(inputId, input.value || "");
      
      // Salva quando cambia
      input.addEventListener("input", () => {
        saveInputValue(inputId, input.value);
        persistLocal();
        updateUrl();
      });
      
      input.addEventListener("change", () => {
        saveInputValue(inputId, input.value);
        persistLocal();
        updateUrl();
      });
    }

    /**
     * Attacca listener a tutti gli input di nomenclatura per salvarli in tempo reale
     */
    function wireNomenclaturePersistence() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const numSubjects = appState.numSubjects || 0;
      const numDays = appState.days || 0;
      const numHours = appState.dailyHours || 0;

      // Professori
      for (let i = 0; i < numProf; i++) {
        const input = document.querySelector(
          `input[data-nomenclature-type="professor"][data-index="${i}"]`
        );
        if (input) {
          input.value = loadInputValue(`prof_${i}`, input.value || "");
          input.addEventListener("input", (e) => {
            saveInputValue(`prof_${i}`, e.target.value);
            appState.professorNames[i] = e.target.value || `Prof ${i + 1}`;
            persistLocal();
            updateUrl();
          });
        }
      }

      // Classi
      for (let i = 0; i < numClass; i++) {
        const input = document.querySelector(
          `input[data-nomenclature-type="class"][data-index="${i}"]`
        );
        if (input) {
          input.value = loadInputValue(`class_${i}`, input.value || "");
          input.addEventListener("input", (e) => {
            saveInputValue(`class_${i}`, e.target.value);
            appState.classNames[i] = e.target.value || `Classe ${i + 1}`;
            persistLocal();
            updateUrl();
          });
        }
      }

      // Materie
      for (let i = 0; i < numSubjects; i++) {
        const input = document.querySelector(
          `input[data-nomenclature-type="subject"][data-index="${i}"]`
        );
        if (input) {
          input.value = loadInputValue(`subject_${i}`, input.value || "");
          input.addEventListener("input", (e) => {
            saveInputValue(`subject_${i}`, e.target.value);
            appState.subjectNames[i] = e.target.value || `Materia ${i + 1}`;
            persistLocal();
            updateUrl();
          });
        }
      }

      // Giorni
      for (let i = 0; i < numDays; i++) {
        const input = document.querySelector(
          `input[data-nomenclature-type="day"][data-index="${i}"]`
        );
        if (input) {
          input.value = loadInputValue(`day_${i}`, input.value || "");
          input.addEventListener("input", (e) => {
            saveInputValue(`day_${i}`, e.target.value);
            appState.dayNames[i] = e.target.value || `Giorno ${i + 1}`;
            persistLocal();
            updateUrl();
          });
        }
      }

      // Ore
      for (let i = 0; i < numHours; i++) {
        const input = document.querySelector(
          `input[data-nomenclature-type="hour"][data-index="${i}"]`
        );
        if (input) {
          input.value = loadInputValue(`hour_${i}`, input.value || "");
          input.addEventListener("input", (e) => {
            saveInputValue(`hour_${i}`, e.target.value);
            appState.hourNames[i] = e.target.value || `Ora ${i + 1}`;
            persistLocal();
            updateUrl();
          });
        }
      }

      console.log("[NOMENCLATURE] Persistence wired");
    }

    /**
     * Sincronizza nomenclatura (nomi) dal DOM e dall'appState
     */
    function syncNomenclatureFromDOM() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const numSubjects = appState.numSubjects || 0;

      // Professori
      appState.professorNames = Array.from(
        { length: numProf },
        (_, i) => {
          const input = document.querySelector(
            `input[data-nomenclature-type="professor"][data-index="${i}"]`
          );
          return input?.value?.trim() || `Prof ${i + 1}`;
        }
      );

      // Classi
      appState.classNames = Array.from(
        { length: numClass },
        (_, i) => {
          const input = document.querySelector(
            `input[data-nomenclature-type="class"][data-index="${i}"]`
          );
          return input?.value?.trim() || `Classe ${i + 1}`;
        }
      );

      // Materie
      appState.subjectNames = Array.from(
        { length: numSubjects },
        (_, i) => {
          const input = document.querySelector(
            `input[data-nomenclature-type="subject"][data-index="${i}"]`
          );
          return input?.value?.trim() || `Materia ${i + 1}`;
        }
      );

      // Giorni
      appState.dayNames = Array.from(
        { length: appState.days || 0 },
        (_, i) => {
          const input = document.querySelector(
            `input[data-nomenclature-type="day"][data-index="${i}"]`
          );
          return input?.value?.trim() || `Giorno ${i + 1}`;
        }
      );

      // Ore
      appState.hourNames = Array.from(
        { length: appState.dailyHours || 0 },
        (_, i) => {
          const input = document.querySelector(
            `input[data-nomenclature-type="hour"][data-index="${i}"]`
          );
          return input?.value?.trim() || `Ora ${i + 1}`;
        }
      );

      console.log("[NOMENCLATURE] Synced from DOM");
    }

    /**
     * Attacca listener a tutti gli input di ore/materie per salvarli in tempo reale
     */
    function wireSubjectHoursPersistence() {
      const inputs = document.querySelectorAll(
        'input[data-subjIndex][data-classIndex][data-week]'
      );
      inputs.forEach((input) => {
        // Listener per salvare in appState quando cambia
        input.addEventListener("input", (e) => {
          console.log(`[SUBJECT HOURS] ${e.target.dataset.subjIndex}_${e.target.dataset.classIndex}_${e.target.dataset.week} = ${e.target.value}`);
          onSubjectHoursChange(e);
        });

        input.addEventListener("change", (e) => {
          onSubjectHoursChange(e);
        });
      });

      console.log("[SUBJECT HOURS] Persistence wired");
    }

    /**
     * Attacca listener a tutti gli input di assegnazioni
     */
    function wireAssignmentsPersistence() {
      const inputs = document.querySelectorAll(
        'input[data-profIndex][data-slotIndex]'
      );
      inputs.forEach((input) => {
        const pi = input.getAttribute("data-profIndex");
        const si = input.getAttribute("data-slotIndex");
        const key = `assignment_${pi}_${si}`;

        // Carica il valore salvato
        const saved = localStorage.getItem(key);
        if (saved !== null) {
          input.value = saved;
        }

        // Salva quando cambia
        input.addEventListener("input", (e) => {
          localStorage.setItem(key, e.target.value);
          console.log(`[PERSIST] ${key} = ${e.target.value}`);
          persistLocal();
          updateUrl();
        });

        input.addEventListener("change", (e) => {
          localStorage.setItem(key, e.target.value);
          persistLocal();
          updateUrl();
        });
      });

      console.log("[ASSIGNMENTS] Persistence wired");
    }

    /**
     * Attacca listener a tutti gli input di limiti orari giornalieri
     */
    function wireDailyMaxPersistence() {
      const inputs = document.querySelectorAll(
        'input[data-subjIndex][data-classIndex]:not([data-week])'
      );
      inputs.forEach((input) => {
        const si = input.getAttribute("data-subjIndex");
        const ci = input.getAttribute("data-classIndex");
        const key = `dailymax_${si}_${ci}`;

        // Carica il valore salvato
        const saved = localStorage.getItem(key);
        if (saved !== null) {
          input.value = saved;
        }

        // Salva quando cambia
        input.addEventListener("input", (e) => {
          localStorage.setItem(key, e.target.value);
          console.log(`[PERSIST] ${key} = ${e.target.value}`);
          persistLocal();
          updateUrl();
        });

        input.addEventListener("change", (e) => {
          localStorage.setItem(key, e.target.value);
          persistLocal();
          updateUrl();
        });
      });

      console.log("[DAILY MAX] Persistence wired");
    }

    /**
     * Attacca listener a tutti gli input di preferenze
     */
    function wirePreferencesPersistence() {
      const inputs = document.querySelectorAll(
        'input[type="checkbox"][data-prefType]'
      );
      inputs.forEach((input) => {
        const prefType = input.getAttribute("data-prefType");
        const pi = input.getAttribute("data-profIndex");
        const ci = input.getAttribute("data-classIndex");
        const di = input.getAttribute("data-dayIndex");
        const hi = input.getAttribute("data-hourIndex");
        
        const key = `pref_${prefType}_${pi}_${ci}_${di}_${hi}`;

        // Carica il valore salvato
        const saved = localStorage.getItem(key);
        if (saved !== null) {
          input.checked = saved === "true";
        }

        // Salva quando cambia
        input.addEventListener("change", (e) => {
          localStorage.setItem(key, e.target.checked ? "true" : "false");
          console.log(`[PERSIST] ${key} = ${e.target.checked}`);
          persistLocal();
          updateUrl();
        });
      });

      console.log("[PREFERENCES] Persistence wired");
    }

    /**
     * Sincronizza ore materie/classi dal DOM
     */
    function syncSubjectHoursFromDOM() {
      const numSubjects = appState.numSubjects || 0;
      const numClass = appState.numClass || 0;

      console.log(`[syncSubjectHours] numSubjects=${numSubjects}, numClass=${numClass}, containerExists=${!!subjectHoursContainer}`);

      if (!subjectHoursContainer || numSubjects === 0 || numClass === 0) {
        appState.subjectClassHours = [];
        return;
      }

      appState.subjectClassHours = Array.from(
        { length: numSubjects },
        (_, s) => {
          const abCheckbox = subjectHoursContainer.querySelector(
            `input[type="checkbox"][data-subjIndex="${s}"]`
          );
          const altWeeks = !!abCheckbox?.checked;

          const hours = Array.from({ length: numClass }, (_, c) => {
            // Selettore semplificato: cerca qualsiasi input number con questi attributi
            const inputs = subjectHoursContainer.querySelectorAll(
              `input[type="number"][data-subjIndex="${s}"][data-classIndex="${c}"]`
            );
            // Prendi il primo che non ha week="A" o week="B"
            let value = 0;
            for (let inp of inputs) {
              if (!inp.dataset.week || inp.dataset.week === "single") {
                value = parseInt(inp.value || 0, 10);
                break;
              }
            }
            return value;
          });

          const hoursA = Array.from({ length: numClass }, (_, c) => {
            const input = subjectHoursContainer.querySelector(
              `input[type="number"][data-subjIndex="${s}"][data-classIndex="${c}"][data-week="A"]`
            );
            return parseInt(input?.value || 0, 10);
          });

          const hoursB = Array.from({ length: numClass }, (_, c) => {
            const input = subjectHoursContainer.querySelector(
              `input[type="number"][data-subjIndex="${s}"][data-classIndex="${c}"][data-week="B"]`
            );
            return parseInt(input?.value || 0, 10);
          });

          console.log(`  Subject ${s}: altWeeks=${altWeeks}, hours=${JSON.stringify(hours)}`);
          return { altWeeks, hours, hoursA, hoursB };
        }
      );
    }

    /**
     * Sincronizza assegnazioni dal DOM
     */
    function syncAssignmentsFromDOM() {
      const numProf = appState.numProf || 0;
      const assignments = [];

      console.log("[syncAssignmentsFromDOM] Starting, numProf=" + numProf);

      for (let p = 0; p < numProf; p++) {
        const subjects = [];
        let totalHours = 0;

        // Trova tutte le righe di assegnazione per questo professore
        const allRows = assignmentsContainer?.querySelectorAll(".assign-row");
        const rows = Array.from(allRows || []).filter((row) => {
          const profIdx = parseInt(row.dataset.profIndex, 10);
          return profIdx === p;
        });

        console.log(`[syncAssignmentsFromDOM] Prof ${p}: found ${rows.length} rows`);

        if (!rows || rows.length === 0) {
          assignments.push({ totalHours: 0, subjects: [] });
          continue;
        }

        rows.forEach((row) => {
          const select = row.querySelector("select");
          const input = row.querySelector("input.assign-hours");

          const subjIdx = select?.value ? parseInt(select.value, 10) : -1;
          const hours = input?.value ? parseInt(input.value, 10) : 0;

          console.log(`[syncAssignmentsFromDOM] Prof ${p}: subjIdx=${subjIdx}, hours=${hours}`);

          if (subjIdx >= 0 && hours > 0) {
            subjects.push({ subjectIndex: subjIdx, hours });
            totalHours += hours;
          }
        });

        assignments.push({ totalHours, subjects });
      }

      appState.subjectAssignments = assignments;
      console.log("[syncAssignmentsFromDOM] Final assignments:", JSON.stringify(appState.subjectAssignments));
    }

    /**
     * Sincronizza limiti giornalieri dal DOM
     */
    function syncDailyMaxFromDOM() {
      const numSubjects = appState.numSubjects || 0;
      const numClass = appState.numClass || 0;

      appState.subjectDailyMax = Array.from(
        { length: numSubjects },
        (_, s) =>
          Array.from({ length: numClass }, (_, c) => {
            const input = dailyMaxContainer?.querySelector(
              `input[type="number"][data-subjIndex="${s}"][data-classIndex="${c}"]`
            );
            return Math.max(1, parseInt(input?.value || 2, 10));
          })
      );
    }

    /**
     * Sincronizza preferenze dal DOM
     */
    function syncPreferencesFromDOM() {
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;

      appState.preferences = Array.from(
        { length: numProf },
        (_, p) =>
          Array.from({ length: numClass }, (_, c) => {
            const input = preferencesContainer?.querySelector(
              `input[type="checkbox"][data-profIndex="${p}"][data-classIndex="${c}"]`
            );
            return !!input?.checked;
          })
      );
    }

    /**
     * Sincronizza disponibilità dal DOM
     */
    function syncAvailabilityFromDOM() {
      const rows = getAvailabilityRows().length;
      const days = appState.days || 0;

      appState.availability = Array.from(
        { length: rows },
        (_, r) =>
          Array.from({ length: days }, (_, d) =>
            Array.from({ length: 2 }, (_, part) => {
              const input = availabilityContainer?.querySelector(
                `input[data-row-index='${r}'][data-day-index='${d}'][data-part='${part}']`
              );
              return !!input?.checked;
            })
          )
      );
    }

    /**
     * Raccoglie e valida tutti i dati, costruendo il payload finale.
     * Questo è l'unico punto di raccolta dati per generatePlan().
     */
    function buildPayload() {
      // 1. SINCRONIZZA tutti i dati dal DOM a appState
      try {
        syncAllDataFromDOM();
      } catch (err) {
        console.error("Errore nella sincronizzazione dei dati:", err);
        return null;
      }

      console.log("[buildPayload] Stato dopo sincronizzazione:", {
        numSubjects: appState.numSubjects,
        numProf: appState.numProf,
        numClass: appState.numClass,
        subjectClassHours: appState.subjectClassHours,
        subjectAssignments: appState.subjectAssignments,
        subjectDailyMax: appState.subjectDailyMax,
      });

      // 2. VALIDAZIONI CRITICHE
      if (
        appState.days == null ||
        appState.dailyHours == null ||
        appState.numProf == null ||
        appState.numClass == null
      ) {
        alert("Completa prima i passi 1 e 2.");
        return null;
      }

      if (!appState.numSubjects || appState.numSubjects <= 0) {
        alert("Inserisci almeno una materia (passo 1) prima di generare.");
        return null;
      }

      // Verifica che ogni professore abbia almeno una assegnazione
      const hasDeficit = (appState.subjectAssignments || []).some(
        (assign) => !assign.subjects || assign.subjects.length === 0
      );
      if (hasDeficit) {
        alert(
          "Ogni professore deve avere almeno una materia assegnata (passo 4)."
        );
        return null;
      }

      // Verifica che le ore assegnate coprano le ore richieste
      const totalRequired = (appState.subjectClassHours || []).reduce(
        (sum, row) => {
          if (row.altWeeks) {
            return (
              sum +
              (row.hoursA || []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
            );
          }
          return sum + (row.hours || []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
        },
        0
      );

      const totalAssigned = (appState.subjectAssignments || []).reduce(
        (sum, assign) => sum + (assign.totalHours || 0),
        0
      );

      console.log("[buildPayload] Calcolo ore:", { totalRequired, totalAssigned });

      if (totalAssigned < totalRequired) {
        alert(
          `Ore assegnate (${totalAssigned}) < ore richieste (${totalRequired}). ` +
            "Aggiungi più ore nel passo 4."
        );
        return null;
      }

      // 3. NORMALIZZA strutture dati
      ensureSubjectHoursShape();
      ensureDailyMaxShape();
      ensureStep2StateArrays();

      // 4. COSTRUISCI il payload
      const hoursMatrix = Array.from({ length: appState.numProf || 0 }, (_, p) =>
        Array.from({ length: appState.numClass || 0 }, (_, c) => {
          const v = appState.hoursMatrix?.[p]?.[c];
          return isNaN(parseInt(v, 10)) ? 0 : parseInt(v, 10);
        })
      );

      const subjectNamesPayload =
        appState.subjectNames && appState.subjectNames.length === appState.numSubjects
          ? appState.subjectNames
          : Array.from(
              { length: appState.numSubjects || 0 },
              (_, i) => `Materia ${i + 1}`
            );

      const availabilityPayload = aggregateAvailabilityForPayload();

      const finalPayload = {
        days: appState.days,
        daily_hours: appState.dailyHours,
        class_names: appState.classNames,
        professor_names: appState.professorNames,
        class_teachers: appState.classTeachers || [],
        hours_matrix: hoursMatrix,
        availability: availabilityPayload || appState.availability || null,
        subject_names: subjectNamesPayload,
        subject_class_hours: appState.subjectClassHours || [],
        subject_assignments: appState.subjectAssignments || [],
        subject_daily_max: appState.subjectDailyMax || [],
        preferences: appState.preferences || [],
        generate_both_weeks: appState.generateBothWeeks || false,
        aggregate_hours_rule: appState.aggregateHoursRule !== false,
        single_teacher_rule: appState.singleTeacherRule !== false,
        wednesday_afternoon_free: appState.wedFree || false,
        free_afternoon_day: appState.freeAfternoonDay || 3,
        last_morning_hour: appState.lastMorningHour || 3,
        method: appState.method || "mip",
        seed: appState.seedEnabled ? appState.seed : undefined,
        hour_names:
          appState.hourNames && appState.hourNames.length
            ? appState.hourNames
            : undefined,
      };

      console.log("[buildPayload] Payload finale:", finalPayload);
      return finalPayload;
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
      console.log(">>> GENERA PIANO CLICCATO <<<");
      
      const payload = buildPayload();
      
      console.log(">>> buildPayload completato, payload:", payload);
      
      if (!payload) {
        console.log(">>> PAYLOAD NULL O FALSO");
        errorMessage.style.display = "block";
        if (!errorMessage.textContent) {
          errorMessage.textContent =
            "Completa tutti i passi prima di generare il piano.";
        }
        return;
      }

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
        console.log("Invio payload al backend:", payload);
        
        const res = await fetch("/api/generate-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        console.log("Risposta dal backend:", data);

        if (!data.ok) {
          console.error("Generation failed", data);
          const details =
            Array.isArray(data.errors) && data.errors.length
              ? " Dettagli: " + data.errors.join(" | ")
              : "";
          errorMessage.style.display = "block";
          const baseMsg = data.message || "Impossibile generare un piano.";
          errorMessage.textContent = baseMsg + details;
          return;
        }

        const nonZero = data.non_zero_total || 0;
        const nonZeroB = data.non_zero_week_b || 0;
        console.debug("Plan generated", {
          usingSubjectPlanner: data.using_subject_planner,
          totalRequired: data.total_required,
          nonZeroA: nonZero,
          nonZeroB: nonZeroB,
        });
        if (nonZero === 0 && (!data.plan_week_b || nonZeroB === 0)) {
          errorMessage.style.display = "block";
          errorMessage.textContent =
            "Piano vuoto ricevuto: controlla ore per materia/classe e assegnazioni.";
          return;
        }

        appState.lastPlanResponse = data;

        renderPreviews(data);
      } catch (err) {
        console.error("Errore durante la generazione:", err);
        errorMessage.style.display = "block";
        errorMessage.textContent = "Errore di rete o server: " + err.message;
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

    async function downloadPdfWeek(endpoint, filename, weekIndex) {
      const payloadWithPlan = {
        ...appState.lastPayload,
        plan: appState.lastPlanResponse.plan,
        plan_week_b: appState.lastPlanResponse.plan_week_b,
        subject_plan: appState.lastPlanResponse.subject_plan || null,
        subject_plan_week_b: appState.lastPlanResponse.subject_plan_week_b || null,
      };

      const res = await fetch(`${endpoint}?week_index=${weekIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadWithPlan),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function downloadPdf(endpoint, baseFilename) {
      if (!appState.lastPayload || !appState.lastPlanResponse?.plan) {
        alert('Prima genera almeno un piano. Clicca su "Genera piano".');
        return;
      }

      try {
        const hasBoth = !!appState.lastPlanResponse.plan_week_b;
        const ext = ".pdf";
        const name = baseFilename.replace(ext, "");

        if (hasBoth) {
          await downloadPdfWeek(endpoint, `${name}_Settimana_A${ext}`, 0);
          await downloadPdfWeek(endpoint, `${name}_Settimana_B${ext}`, 1);
        } else {
          await downloadPdfWeek(endpoint, baseFilename, 0);
        }
      } catch (err) {
        console.error(err);
        alert("Errore di rete durante il download del PDF.");
      }
    }

    async function downloadExcel(endpoint, baseFilename) {
      if (!appState.lastPayload || !appState.lastPlanResponse?.plan) {
        alert('Prima genera almeno un piano. Clicca su "Genera piano".');
        return;
      }

      try {
        const hasBoth = !!appState.lastPlanResponse.plan_week_b;
        const ext = ".xlsx";
        const name = baseFilename.replace(ext, "");

        if (hasBoth) {
          await downloadPdfWeek(endpoint, `${name}_Settimana_A${ext}`, 0);
          await downloadPdfWeek(endpoint, `${name}_Settimana_B${ext}`, 1);
        } else {
          await downloadPdfWeek(endpoint, baseFilename, 0);
        }
      } catch (err) {
        console.error(err);
        alert("Errore di rete durante il download dell'Excel.");
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

    function getNomenclatureDataRaw() {
      return {
        professor_names: appState.professorNames || [],
        class_names: appState.classNames || [],
        subject_names: appState.subjectNames || [],
        day_names: appState.dayNames || [],
        hour_names: appState.hourNames || [],
      };
    }

    function loadNomenclatureFromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      const { professor_names, class_names, subject_names, day_names, hour_names } = obj;
      const checkLen = (arr, expected) =>
        Array.isArray(arr) && arr.length === expected;
      if (appState.numProf && !checkLen(professor_names, appState.numProf)) {
        alert("Numero di nomi professori non coerente.");
        return;
      }
      if (appState.numClass && !checkLen(class_names, appState.numClass)) {
        alert("Numero di nomi classi non coerente.");
        return;
      }
      if (appState.numSubjects && !checkLen(subject_names, appState.numSubjects)) {
        alert("Numero di nomi materie non coerente.");
        return;
      }
      if (appState.days && !checkLen(day_names, appState.days)) {
        alert("Numero di nomi giorni non coerente.");
        return;
      }
      if (appState.dailyHours && !checkLen(hour_names, appState.dailyHours)) {
        alert("Numero di nomi ore non coerente.");
        return;
      }
      appState.professorNames = Array.isArray(professor_names)
        ? professor_names
        : appState.professorNames;
      appState.classNames = Array.isArray(class_names)
        ? class_names
        : appState.classNames;
      appState.subjectNames = Array.isArray(subject_names)
        ? subject_names
        : appState.subjectNames;
      appState.dayNames = Array.isArray(day_names) ? day_names : appState.dayNames;
      appState.hourNames = Array.isArray(hour_names) ? hour_names : appState.hourNames;
      buildNomenclatureFields();
      persistLocal();
      updateUrl();
    }

    function getAssignmentsDataRaw() {
      // Garantisce che lo stato sia aggiornato
      collectAssignmentsData();
      return {
        assignments: appState.subjectAssignments || [],
      };
    }

    function loadAssignmentsFromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      if (!Array.isArray(obj.assignments)) {
        alert("JSON non valido: manca assignments.");
        return;
      }
      if (appState.numProf && obj.assignments.length !== appState.numProf) {
        alert("Numero di docenti nelle assegnazioni non coerente.");
        return;
      }
      const normalized = obj.assignments.map((a) => ({
        totalHours: a?.totalHours || 0,
        subjects: Array.isArray(a?.subjects)
          ? a.subjects
              .filter(
                (s) =>
                  s &&
                  typeof s.subjectIndex === "number" &&
                  !isNaN(parseInt(s.subjectIndex, 10)) &&
                  s.subjectIndex >= 0 &&
                  s.subjectIndex < (appState.numSubjects || 0) &&
                  typeof s.hours === "number" &&
                  s.hours > 0
              )
              .map((s) => ({
                subjectIndex: parseInt(s.subjectIndex, 10),
                hours: parseInt(s.hours, 10),
              }))
          : [],
      }));
      appState.subjectAssignments = normalized;
      buildAssignmentsUI();
      updateTotals();
      renderAssignmentCoverage();
      persistLocal();
      updateUrl();
    }

    // ---- STEP 4: ORE PER MATERIA/CLASSE ---------------------------
    function ensureSubjectHoursShape() {
      if (appState.numSubjects == null || appState.numClass == null) return;
      if (!Array.isArray(appState.subjectClassHours)) {
        appState.subjectClassHours = [];
      }
      while (appState.subjectClassHours.length < appState.numSubjects) {
        appState.subjectClassHours.push({
          altWeeks: false,
          hours: Array.from({ length: appState.numClass }, () => 0),
          hoursA: Array.from({ length: appState.numClass }, () => 0),
          hoursB: Array.from({ length: appState.numClass }, () => 0),
        });
      }
      if (appState.subjectClassHours.length > appState.numSubjects) {
        appState.subjectClassHours = appState.subjectClassHours.slice(
          0,
          appState.numSubjects
        );
      }
      // Align lengths per subject
      appState.subjectClassHours = appState.subjectClassHours.map((row) => {
        const normalize = (arr) =>
          Array.from({ length: appState.numClass }, (_, i) => parseInt(arr?.[i], 10) || 0);
        return {
          altWeeks: !!row.altWeeks,
          hours: normalize(row.hours || []),
          hoursA: normalize(row.hoursA || []),
          hoursB: normalize(row.hoursB || []),
        };
      });
    }

    function recomputeGenerateBothWeeks() {
      appState.generateBothWeeks = Array.isArray(appState.subjectClassHours)
        ? appState.subjectClassHours.some((row) => row?.altWeeks)
        : false;
    }

    function computeSubjectAvailability() {
      const totals = Array.from({ length: appState.numSubjects || 0 }, () => 0);
      if (!Array.isArray(appState.subjectAssignments)) return totals;
      appState.subjectAssignments.forEach((assignment) => {
        assignment.subjects?.forEach((s) => {
          if (
            typeof s.subjectIndex === "number" &&
            s.subjectIndex >= 0 &&
            s.subjectIndex < totals.length
          ) {
            totals[s.subjectIndex] += parseInt(s.hours, 10) || 0;
          }
        });
      });
      return totals;
    }

    function buildSubjectHoursTable() {
      if (!subjectHoursContainer) return;
      ensureSubjectHoursShape();
      recomputeGenerateBothWeeks();
      subjectHoursContainer.innerHTML = "";
      const classNames =
        appState.classNames && appState.classNames.length
          ? appState.classNames
          : Array.from({ length: appState.numClass || 0 }, (_, i) => `Classe ${i + 1}`);
      const subjectNames =
        appState.subjectNames && appState.subjectNames.length
          ? appState.subjectNames
          : Array.from({ length: appState.numSubjects || 0 }, (_, i) => `Materia ${i + 1}`);

      const table = document.createElement("table");
      table.className = "daily-max-table subject-hours-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const emptyTh = document.createElement("th");
      emptyTh.className = "subject-sticky";
      headRow.appendChild(emptyTh);
      const abTh = document.createElement("th");
      abTh.textContent = "Settimana A/B";
      headRow.appendChild(abTh);
      const totalTh = document.createElement("th");
      totalTh.className = "subject-total-head";
      totalTh.textContent = "Totale";
      headRow.appendChild(totalTh);
      classNames.forEach((c) => {
        const th = document.createElement("th");
        th.textContent = c || "Classe";
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      for (let sIdx = 0; sIdx < (appState.numSubjects || 0); sIdx++) {
        const subjRow = appState.subjectClassHours[sIdx];
        const row = document.createElement("tr");

        const labelCell = document.createElement("th");
        labelCell.className = "subject-sticky";
        labelCell.textContent = subjectNames[sIdx] || `Materia ${sIdx + 1}`;
        const assignedSingle = subjRow.hours.reduce(
          (s, v) => s + (parseInt(v, 10) || 0),
          0
        );
        const assignedA = subjRow.hoursA.reduce(
          (s, v) => s + (parseInt(v, 10) || 0),
          0
        );
        const assignedB = subjRow.hoursB.reduce(
          (s, v) => s + (parseInt(v, 10) || 0),
          0
        );

        row.appendChild(labelCell);

        const abCell = document.createElement("td");
        abCell.className = "ab-toggle-cell";
        const abCheckbox = document.createElement("input");
        abCheckbox.type = "checkbox";
        abCheckbox.dataset.subjIndex = String(sIdx);
        abCheckbox.checked = !!subjRow.altWeeks;
        abCell.appendChild(abCheckbox);
        row.appendChild(abCell);

        const ratioCell = document.createElement("td");
        ratioCell.className = "subject-total-cell";
        ratioCell.dataset.subjIndex = String(sIdx);
        if (subjRow.altWeeks) {
          const aDiv = document.createElement("div");
          const bDiv = document.createElement("div");
          aDiv.className = "total-ab-line";
          bDiv.className = "total-ab-line";
          aDiv.textContent = `A: ${assignedA}`;
          bDiv.textContent = `B: ${assignedB}`;
          ratioCell.appendChild(aDiv);
          ratioCell.appendChild(bDiv);
        } else {
          ratioCell.textContent = `${assignedSingle}`;
        }
        row.appendChild(ratioCell);

        for (let cIdx = 0; cIdx < (appState.numClass || 0); cIdx++) {
          const cell = document.createElement("td");
          const inner = document.createElement("div");
          inner.className = "subject-cell-wrap";
          if (subjRow.altWeeks) {
            const wrap = document.createElement("div");
            wrap.className = "ab-inputs";
            const inputA = document.createElement("input");
            inputA.type = "number";
            inputA.min = "0";
            inputA.className = "input";
            inputA.placeholder = "Ore A";
            inputA.value =
              subjRow.hoursA[cIdx] != null && subjRow.hoursA[cIdx] !== "" && subjRow.hoursA[cIdx] !== 0
                ? String(subjRow.hoursA[cIdx])
                : "";
            inputA.dataset.subjIndex = String(sIdx);
            inputA.dataset.classIndex = String(cIdx);
            inputA.dataset.week = "A";

            const inputB = document.createElement("input");
            inputB.type = "number";
            inputB.min = "0";
            inputB.className = "input";
            inputB.placeholder = "Ore B";
            inputB.value =
              subjRow.hoursB[cIdx] != null && subjRow.hoursB[cIdx] !== "" && subjRow.hoursB[cIdx] !== 0
                ? String(subjRow.hoursB[cIdx])
                : "";
            inputB.dataset.subjIndex = String(sIdx);
            inputB.dataset.classIndex = String(cIdx);
            inputB.dataset.week = "B";

            wrap.appendChild(inputA);
            wrap.appendChild(inputB);
            inner.appendChild(wrap);
          } else {
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.className = "input";
            input.placeholder = "Ore";
            input.value =
              subjRow.hours[cIdx] != null && subjRow.hours[cIdx] !== "" && subjRow.hours[cIdx] !== 0
                ? String(subjRow.hours[cIdx])
                : "";
            input.dataset.subjIndex = String(sIdx);
            input.dataset.classIndex = String(cIdx);
            input.dataset.week = "single";
            inner.appendChild(input);
          }

          cell.appendChild(inner);
          row.appendChild(cell);
        }

        tbody.appendChild(row);
      }

      table.appendChild(tbody);
      subjectHoursContainer.appendChild(table);

      subjectHoursContainer
        .querySelectorAll("input[type='number'], input[type='checkbox']")
        .forEach((el) => {
          el.addEventListener("input", onSubjectHoursChange);
          el.addEventListener("change", onSubjectHoursChange);
        });

      addSubjectHoursKeyboardNavigation();
      wireSubjectHoursPersistence();
    }

    function refreshSubjectTotals() {
      const availability = computeSubjectAvailability();
      const subjects = appState.subjectClassHours || [];
      subjects.forEach((subjRow, sIdx) => {
        const cell = subjectHoursContainer.querySelector(
          `td.subject-total-cell[data-subj-index='${sIdx}']`
        );
        if (!cell) return;
        const assignedSingle = subjRow.hours.reduce(
          (s, v) => s + (parseInt(v, 10) || 0),
          0
        );
        if (subjRow.altWeeks) {
          const assignedA = subjRow.hoursA.reduce(
            (s, v) => s + (parseInt(v, 10) || 0),
            0
          );
          const assignedB = subjRow.hoursB.reduce(
            (s, v) => s + (parseInt(v, 10) || 0),
            0
          );
          cell.innerHTML = "";
          const aDiv = document.createElement("div");
          const bDiv = document.createElement("div");
          aDiv.className = "total-ab-line";
          bDiv.className = "total-ab-line";
          aDiv.textContent = `A: ${assignedA}`;
          bDiv.textContent = `B: ${assignedB}`;
          cell.appendChild(aDiv);
          cell.appendChild(bDiv);
        } else {
          cell.textContent = `${assignedSingle}`;
        }
      });
    }

    function addSubjectHoursKeyboardNavigation() {
      const inputs = Array.from(
        subjectHoursContainer.querySelectorAll("input[type='number']")
      );
      const colOf = (el) => {
        const s = parseInt(el.dataset.subjIndex, 10);
        const c = parseInt(el.dataset.classIndex, 10);
        if (isNaN(s) || isNaN(c)) return null;
        const alt = appState.subjectClassHours?.[s]?.altWeeks;
        const week = el.dataset.week;
        if (!alt) return c;
        return c * 2 + (week === "B" ? 1 : 0);
      };

      const coords = inputs
        .map((el) => {
          const row = parseInt(el.dataset.subjIndex, 10);
          const col = colOf(el);
          return { el, row, col };
        })
        .filter((o) => !isNaN(o.row) && o.col != null);

      const focusNext = (current, dir) => {
        const curr = coords.find((c) => c.el === current);
        if (!curr) return;
        if (dir === "left" || dir === "right") {
          const sameRow = coords
            .filter((c) => c.row === curr.row)
            .sort((a, b) => a.col - b.col);
          const currentIdx = sameRow.findIndex((c) => c.el === current);
          if (currentIdx === -1) return;
          const nextIdx =
            dir === "right" ? currentIdx + 1 : currentIdx - 1;
          if (sameRow[nextIdx]) sameRow[nextIdx].el.focus();
        } else {
          const sameCol = coords
            .filter((c) => c.col === curr.col)
            .sort((a, b) => a.row - b.row);
          const currentIdx = sameCol.findIndex((c) => c.el === current);
          if (currentIdx === -1) return;
          const nextIdx =
            dir === "down" ? currentIdx + 1 : currentIdx - 1;
          if (sameCol[nextIdx]) sameCol[nextIdx].el.focus();
        }
      };

      inputs.forEach((el) => {
        el.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            focusNext(e.target, "right");
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            focusNext(e.target, "left");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusNext(e.target, "down");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusNext(e.target, "up");
          }
        });
      });
    }

    function onSubjectHoursChange(e) {
      const target = e.target;
      ensureSubjectHoursShape();
      if (target.type === "checkbox" && target.dataset.subjIndex != null) {
        const idx = parseInt(target.dataset.subjIndex, 10);
        const row = appState.subjectClassHours[idx];
        const nextAlt = !!target.checked;
        const wasAlt = !!row.altWeeks;
        if (nextAlt && !wasAlt) {
          row.hoursA = Array.from(
            { length: appState.numClass || 0 },
            (_, i) => parseInt(row.hours?.[i], 10) || 0
          );
          row.hoursB = Array.from({ length: appState.numClass || 0 }, () => 0);
        } else if (!nextAlt && wasAlt) {
          row.hours = Array.from({ length: appState.numClass || 0 }, (_, i) => {
            const a = parseInt(row.hoursA?.[i], 10) || 0;
            const b = parseInt(row.hoursB?.[i], 10) || 0;
            return a + b;
          });
        }
        row.altWeeks = nextAlt;
        buildSubjectHoursTable();
        refreshSubjectTotals();
        renderAssignmentCoverage();
        persistLocal();
        updateUrl();
        return;
      }
      if (target.dataset && target.dataset.subjIndex != null) {
        const sIdx = parseInt(target.dataset.subjIndex, 10);
        const cIdx = parseInt(target.dataset.classIndex, 10);
        const week = target.dataset.week;
        const val = parseInt(target.value, 10);
        if (week === "A") {
          appState.subjectClassHours[sIdx].hoursA[cIdx] = isNaN(val) ? 0 : val;
        } else if (week === "B") {
          appState.subjectClassHours[sIdx].hoursB[cIdx] = isNaN(val) ? 0 : val;
        } else {
          appState.subjectClassHours[sIdx].hours[cIdx] = isNaN(val) ? 0 : val;
        }
        refreshSubjectTotals();
        renderAssignmentCoverage();
        persistLocal();
        updateUrl();
      }
    }

    function collectSubjectHoursData() {
      // NON sincronizziamo dal DOM perché onSubjectHoursChange() sta già salvando in appState in tempo reale
      // Questo evita di azzerare i dati quando vengono sincronizzati dal DOM
      ensureSubjectHoursShape(); // Solo normalizza senza svuotare
      recomputeGenerateBothWeeks();
      persistLocal();
      updateUrl();
      return true;
    }

    // ---- STEP 5: LIMITE ORE GIORNALIERE ---------------------------
    function ensureDailyMaxShape() {
      if (appState.numSubjects == null || appState.numClass == null) return;
      const defaultVal = 2;
      if (!Array.isArray(appState.subjectDailyMax)) {
        appState.subjectDailyMax = [];
      }
      while (appState.subjectDailyMax.length < appState.numSubjects) {
        appState.subjectDailyMax.push(
          Array.from({ length: appState.numClass }, () => defaultVal)
        );
      }
      if (appState.subjectDailyMax.length > appState.numSubjects) {
        appState.subjectDailyMax = appState.subjectDailyMax.slice(
          0,
          appState.numSubjects
        );
      }
      appState.subjectDailyMax = appState.subjectDailyMax.map((row) =>
        Array.from(
          { length: appState.numClass },
          (_, i) => parseInt(row?.[i], 10) || defaultVal
        )
      );
      if (typeof appState.aggregateHoursRule !== "boolean") {
        appState.aggregateHoursRule = true;
      }
      if (typeof appState.singleTeacherRule !== "boolean") {
        appState.singleTeacherRule = true;
      }
    }

    function buildDailyMaxTable() {
      if (!dailyMaxContainer) return;
      ensureDailyMaxShape();
      dailyMaxContainer.innerHTML = "";
      const classNames =
        appState.classNames && appState.classNames.length
          ? appState.classNames
          : Array.from({ length: appState.numClass || 0 }, (_, i) => `Classe ${i + 1}`);
      const subjectNames =
        appState.subjectNames && appState.subjectNames.length
          ? appState.subjectNames
          : Array.from({ length: appState.numSubjects || 0 }, (_, i) => `Materia ${i + 1}`);

      const table = document.createElement("table");
      table.className = "daily-max-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const emptyTh = document.createElement("th");
      emptyTh.textContent = "";
      headRow.appendChild(emptyTh);
      classNames.forEach((c) => {
        const th = document.createElement("th");
        th.textContent = c || "Classe";
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (let sIdx = 0; sIdx < (appState.numSubjects || 0); sIdx++) {
        const row = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = subjectNames[sIdx] || `Materia ${sIdx + 1}`;
        row.appendChild(th);
        for (let cIdx = 0; cIdx < (appState.numClass || 0); cIdx++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.type = "number";
          input.min = "1";
          input.className = "input";
          input.value =
            appState.subjectDailyMax?.[sIdx]?.[cIdx] != null
              ? String(appState.subjectDailyMax[sIdx][cIdx])
              : "";
          input.placeholder = "2";
          input.dataset.subjIndex = String(sIdx);
          input.dataset.classIndex = String(cIdx);
          td.appendChild(input);
          row.appendChild(td);
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      dailyMaxContainer.appendChild(table);

      dailyMaxContainer
        .querySelectorAll("input[type='number']")
        .forEach((el) => {
          el.addEventListener("input", (e) => {
            const s = parseInt(e.target.dataset.subjIndex, 10);
            const c = parseInt(e.target.dataset.classIndex, 10);
            const v = parseInt(e.target.value, 10);
            if (!isNaN(s) && !isNaN(c)) {
              appState.subjectDailyMax[s][c] = isNaN(v) ? 2 : Math.max(1, v);
              persistLocal();
              updateUrl();
            }
          });
        });

      wireDailyMaxPersistence();

      if (ruleAggregateChk) {
        ruleAggregateChk.checked = !!appState.aggregateHoursRule;
        ruleAggregateChk.onchange = () => {
          appState.aggregateHoursRule = !!ruleAggregateChk.checked;
          persistLocal();
          updateUrl();
        };
      }
    }

    function collectDailyMaxData() {
      syncDailyMaxFromDOM();
      ensureDailyMaxShape();
      appState.aggregateHoursRule = ruleAggregateChk
        ? !!ruleAggregateChk.checked
        : true;
      return true;
    }

    function getSubjectHoursDataRaw() {
      collectSubjectHoursData();
      return {
        subject_hours:
          appState.subjectClassHours?.map((row) => ({
            altWeeks: !!row.altWeeks,
            hours: Array.isArray(row.hours)
              ? row.hours.map((v) => parseInt(v, 10) || 0)
              : [],
            hoursA: Array.isArray(row.hoursA)
              ? row.hoursA.map((v) => parseInt(v, 10) || 0)
              : [],
            hoursB: Array.isArray(row.hoursB)
              ? row.hoursB.map((v) => parseInt(v, 10) || 0)
              : [],
          })) || [],
      };
    }

    function loadSubjectHoursFromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      if (!Array.isArray(obj.subject_hours)) {
        alert("JSON non valido: manca subject_hours.");
        return;
      }
      if (appState.numSubjects && obj.subject_hours.length !== appState.numSubjects) {
        alert("Numero di materie non coerente con i dati iniziali.");
        return;
      }
      const normalized = obj.subject_hours.map((row) => {
        const normArr = (arr) =>
          Array.from(
            { length: appState.numClass || 0 },
            (_, i) => parseInt(arr?.[i], 10) || 0
          );
        return {
          altWeeks: !!row.altWeeks,
          hours: normArr(row.hours || []),
          hoursA: normArr(row.hoursA || []),
          hoursB: normArr(row.hoursB || []),
        };
      });
      appState.subjectClassHours = normalized;
      buildSubjectHoursTable();
      refreshSubjectTotals();
      renderAssignmentCoverage();
      persistLocal();
      updateUrl();
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
      const num_subjects =
        parseInt(document.getElementById("num_subjects").value, 10) || 0;
      const free_afternoon_enabled = appState.freeAfternoonEnabled !== false;
      const free_afternoon_day = free_afternoon_enabled
        ? parseInt(document.getElementById("free_afternoon_day").value, 10) || 0
        : null;

      return {
        days,
        morning_hours,
        afternoon_hours,
        num_professors,
        num_classes,
        num_subjects,
        wednesday_afternoon_free:
          free_afternoon_enabled && free_afternoon_day === 3,
        free_afternoon_day,
        free_afternoon_enabled,
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
      if (obj.num_subjects != null)
        document.getElementById("num_subjects").value = obj.num_subjects;
      if (obj.free_afternoon_day != null)
        document.getElementById("free_afternoon_day").value =
          obj.free_afternoon_day;
      else if (obj.wednesday_afternoon_free === true)
        document.getElementById("free_afternoon_day").value = 3;

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
    }

    function getStep2DataRaw() {
      const H = [];
      const numProf = appState.numProf || 0;
      const numClass = appState.numClass || 0;
      const classTeachers = [];

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
        const toggle = matrixContainer.querySelector(
          `input[data-class-teacher='true'][data-prof-index='${p}']`
        );
        classTeachers.push(!!toggle?.checked);
      }

      return {
        num_professors: numProf,
        num_classes: numClass,
        hours_matrix: H,
        class_teachers: classTeachers,
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
      appState.classTeachers = Array.isArray(obj.class_teachers)
        ? obj.class_teachers.map((v, idx) =>
            idx < numProf ? !!v : false
          )
        : Array.from({ length: numProf }, () => false);
      updateAllHTotals();
      prefillClassTeacherFlags();
    }

    function getStep3DataRaw() {
      const availability = [];
      const rows = getAvailabilityRows();
      const days = appState.days || 0;

      for (let r = 0; r < rows.length; r++) {
        const row = [];
        for (let d = 0; d < days; d++) {
          const parts = [];
          for (let partIdx = 0; partIdx < DAY_PARTS.length; partIdx++) {
            const input = availabilityContainer.querySelector(
              `input[data-row-index='${r}'][data-day-index='${d}'][data-part='${partIdx}']`
            );
            parts.push(input ? !!input.checked : true);
          }
          row.push(parts);
        }
        availability.push(row);
      }

      return {
        num_professors: rows.length,
        days,
        availability,
      };
    }

    function loadStep3FromJson(obj) {
      if (typeof obj !== "object" || obj === null) return;
      const rows = getAvailabilityRows();
      const days = appState.days;

      if (!Array.isArray(obj.availability)) {
        alert("JSON non valido: manca availability.");
        return;
      }
      if (obj.num_professors !== rows.length || obj.days !== days) {
        alert(
          "Le dimensioni del JSON disponibilità non corrispondono ai parametri correnti. Modifica i dati iniziali e ricrea la tabella, poi riprova."
        );
        return;
      }

      const normalized = normalizeAvailability(obj.availability, rows.length, days);
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
      const labels = Array.isArray(data.week_labels) ? data.week_labels : [];
      const planEntries = [];
      if (data.plan) {
        planEntries.push({ label: labels[0] || "Settimana A", plan: data.plan, subjectPlan: data.subject_plan || null });
      }
      if (data.plan_week_b) {
        planEntries.push({ label: labels[1] || "Settimana B", plan: data.plan_week_b, subjectPlan: data.subject_plan_week_b || null });
      }
      if (!planEntries.length) return;

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

      function renderSinglePlan(planMatrix, label, subjectPlan) {
        const profFrag = document.createDocumentFragment();
        const classFrag = document.createDocumentFragment();
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
          sub.textContent = label || "";

          const right = document.createElement("div");
          right.style.marginLeft = "auto";
          const holes = (() => {
            let total = 0;
            for (let d = 0; d < days; d++) {
              const busy = [];
              for (let h = 0; h < hours; h++) {
                let assigned = false;
                for (let c = 0; c < numClass; c++) {
                  if (planMatrix[d][h][c] === p + 1) {
                    assigned = true;
                    break;
                  }
                }
                busy.push(assigned);
              }
              total += countHolesInBoolArray(busy);
            }
            return total;
          })();
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
                if (planMatrix[d][h][c] === p + 1) {
                  let ctext = classNames[c];
                  if (subjectPlan && subjectPlan[d] && subjectPlan[d][h] && subjectPlan[d][h][c] > 0) {
                    const sid = subjectPlan[d][h][c];
                    const sname = (appState.subjectNames && appState.subjectNames[sid - 1]) ? appState.subjectNames[sid - 1] : ("Mat " + sid);
                    ctext = classNames[c] + " (" + sname + ")";
                  }
                  classesHere.push(ctext);
                }
              }
              td.textContent = classesHere.length ? classesHere.join(", ") : "–";
              row.appendChild(td);
            }
            tbody.appendChild(row);
          }
          table.appendChild(tbody);
          card.appendChild(table);

          profFrag.appendChild(card);
        }

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
          sub.textContent = label || "";

          const right = document.createElement("div");
          right.style.marginLeft = "auto";
          const holes = (() => {
            let total = 0;
            for (let d = 0; d < days; d++) {
              const busy = [];
              for (let h = 0; h < hours; h++) {
                busy.push(planMatrix[d][h][c] !== 0);
              }
              total += countHolesInBoolArray(busy);
            }
            return total;
          })();
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
              const profId = planMatrix[d][h][c];
              if (profId === 0) {
                td.textContent = "–";
              } else {
                const pname = profNames[profId - 1];
                if (subjectPlan && subjectPlan[d] && subjectPlan[d][h] && subjectPlan[d][h][c] > 0) {
                  const sid = subjectPlan[d][h][c];
                  const sname = (appState.subjectNames && appState.subjectNames[sid - 1]) ? appState.subjectNames[sid - 1] : ("Mat " + sid);
                  td.innerHTML = "<span class=\"cell-subject\">" + sname + "</span><span class=\"cell-prof\">" + pname + "</span>";
                } else {
                  td.textContent = pname;
                }
              }
              row.appendChild(td);
            }
            tbody.appendChild(row);
          }
          table.appendChild(tbody);
          card.appendChild(table);

          classFrag.appendChild(card);
        }
        return { profFrag, classFrag };
      }

      previewProfessors.innerHTML = "";
      previewClasses.innerHTML = "";
      planEntries.forEach((entry, idx) => {
        const weekLabel = entry.label || `Piano ${idx + 1}`;

        const profSection = document.createElement("div");
        profSection.className = "preview-week-section";
        const profTitle = document.createElement("div");
        profTitle.className = "preview-week-title";
        profTitle.textContent = weekLabel;
        profSection.appendChild(profTitle);

        const classSection = document.createElement("div");
        classSection.className = "preview-week-section";
        const classTitle = document.createElement("div");
        classTitle.className = "preview-week-title";
        classTitle.textContent = weekLabel;
        classSection.appendChild(classTitle);

        const rendered = renderSinglePlan(entry.plan, weekLabel, entry.subjectPlan);
        profSection.appendChild(rendered.profFrag);
        classSection.appendChild(rendered.classFrag);

        previewProfessors.appendChild(profSection);
        previewClasses.appendChild(classSection);
      });
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

      const items = [
        { label: "Giorni", value: appState.days },
        {
          label: "Pomeriggio libero",
          value:
            appState.freeAfternoonEnabled &&
            (appState.afternoonHours || 0) > 0 &&
            appState.freeAfternoonDay
              ? (() => {
                  const full = dayLabelAt(appState.freeAfternoonDay - 1) || "";
                  const short =
                    full.length >= 3 ? full.slice(0, 3) : full;
                  return `Si, ${short}`;
                })()
              : "No",
        },
        { label: "Professori", value: `${appState.numProf}` },
        { label: "Classi", value: `${appState.numClass}` },
        { label: "Materie", value: `${appState.numSubjects ?? 0}` },
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
    themeLightBtn?.addEventListener("click", () => applyTheme("light"));
    themeDarkBtn?.addEventListener("click", () => applyTheme("dark"));

    freeAfternoonYesBtn?.addEventListener("click", () => {
      setFreeAfternoonEnabled(true);
    });

    freeAfternoonNoBtn?.addEventListener("click", () => {
      setFreeAfternoonEnabled(false);
    });

    document.getElementById("to-step-2").addEventListener("click", () => {
      if (!collectStep1Data()) return;
      buildNomenclatureFields();
      showStep(2);
    });

    document.getElementById("to-step-3").addEventListener("click", () => {
      if (!collectNomenclatureData()) return;
      buildSubjectHoursTable();
      showStep(3);
    });

    document.getElementById("back-to-1").addEventListener("click", () => {
      showStep(1);
    });

    document.getElementById("back-to-2").addEventListener("click", () => {
      showStep(2);
    });

    document.getElementById("to-step-4").addEventListener("click", () => {
      if (!collectSubjectHoursData()) return;
      buildAssignmentsUI();
      showStep(4);
    });

    document.getElementById("back-to-3").addEventListener("click", () => {
      showStep(3);
    });

    document.getElementById("to-step-5").addEventListener("click", () => {
      if (!collectAssignmentsData()) return;
      if (appState._assignmentsHasDeficit) {
        alert("Copri tutte le ore richieste prima di procedere.");
        return;
      }
      buildDailyMaxTable();
      showStep(5);
    });

    document.getElementById("back-to-4").addEventListener("click", () => {
      showStep(4);
    });

    document.getElementById("to-step-6").addEventListener("click", () => {
      if (!collectDailyMaxData()) return;
      buildPreferencesTable();
      showStep(6);
    });

    document.getElementById("back-to-5").addEventListener("click", () => {
      showStep(5);
    });

    document.getElementById("to-step-7").addEventListener("click", () => {
      collectPreferencesData();
      buildAvailabilityTable();
      showStep(7);
    });

    document.getElementById("back-to-6").addEventListener("click", () => {
      showStep(6);
    });

    document.getElementById("to-step-8").addEventListener("click", () => {
      if (!collectAvailabilityData()) return;
      showStep(8);
    });

    document.getElementById("back-to-7").addEventListener("click", () => {
      showStep(7);
    });

    // Reset per pagina
    function resetStep1() {
      document.getElementById("days").value = 5;
      document.getElementById("morning_hours").value = "";
      document.getElementById("afternoon_hours").value = "";
      document.getElementById("num_professors").value = "";
      document.getElementById("num_classes").value = "";
      document.getElementById("num_subjects").value = "0";
      const fadEl = document.getElementById("free_afternoon_day");
      if (fadEl) fadEl.value = 3;
      appState.freeAfternoonEnabled = true;
      appState.freeAfternoonDay = 3;
      appState.wedFree = true;
      [
        "days",
        "morning_hours",
        "afternoon_hours",
        "num_professors",
        "num_classes",
        "num_subjects",
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
      appState.professorNames = Array.from(
        { length: appState.numProf },
        () => ""
      );
      appState.classNames = Array.from(
        { length: appState.numClass },
        () => ""
      );
      appState.subjectNames = Array.from(
        { length: appState.numSubjects || 0 },
        () => ""
      );
      appState.dayNames = Array.from({ length: appState.days }, () => "");
      appState.hourNames = Array.from(
        { length: appState.dailyHours || 0 },
        () => ""
      );
      buildNomenclatureFields();
    }

    function resetStep3() {
      if (appState.numSubjects == null || appState.numClass == null) return;
      appState.generateBothWeeks = false;
      appState.subjectClassHours = Array.from(
        { length: appState.numSubjects },
        () => ({
          altWeeks: false,
          hours: Array.from({ length: appState.numClass }, () => 0),
          hoursA: Array.from({ length: appState.numClass }, () => 0),
          hoursB: Array.from({ length: appState.numClass }, () => 0),
        })
      );
      buildSubjectHoursTable();
    }

    function resetStep4() {
      if (appState.numProf == null) return;
      appState.subjectAssignments = Array.from(
        { length: appState.numProf },
        () => ({
          totalHours: 0,
          subjects: [{ subjectIndex: null, hours: null }],
        })
      );
      buildAssignmentsUI();
    }

    function resetStep5() {
      if (appState.numSubjects == null || appState.numClass == null) return;
      appState.subjectDailyMax = Array.from(
        { length: appState.numSubjects },
        () => Array.from({ length: appState.numClass }, () => 2)
      );
      appState.aggregateHoursRule = true;
      appState.singleTeacherRule = true;
      buildDailyMaxTable();
    }

    function resetStep6() {
      if (appState.numProf == null || appState.numClass == null) return;
      appState.singleTeacherRule = true;
      appState.preferences = Array.from({ length: appState.numProf }, () =>
        Array.from({ length: appState.numClass }, () => false)
      );
      buildPreferencesTable();
    }

    function resetStep7() {
      if (
        appState.days == null
      )
        return;
      const rows = getAvailabilityRows().length;
      appState.availability = Array.from({ length: rows }, () =>
        Array.from({ length: appState.days }, () => [true, true])
      );
      buildAvailabilityTable();
    }

    function resetStep8() {
      // Reset stato visuale e preview
      errorMessage.style.display = "none";
      errorMessage.textContent = "";
      previewProfessors.innerHTML = `
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-card-title">Nessun piano ancora generato</div>
          </div>
          <div class="preview-card-sub">Premi <strong>"Genera piano"</strong> per vedere qui i dettagli per ogni docente.</div>
        </div>`;
      previewClasses.innerHTML = `
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-card-title">Nessun piano ancora generato</div>
          </div>
          <div class="preview-card-sub">Dopo la generazione, qui troverai gli orari dettagliati per ogni classe.</div>
        </div>`;
      setMethod("mip");
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
    document
      .getElementById("reset-step-5")
      ?.addEventListener("click", () => openResetConfirm(5));
    document
      .getElementById("reset-step-6")
      ?.addEventListener("click", () => openResetConfirm(6));
    document
      .getElementById("reset-step-7")
      ?.addEventListener("click", () => openResetConfirm(7));
    document
      .getElementById("reset-step-8")
      ?.addEventListener("click", () => openResetConfirm(8));
    document
      .getElementById("reset-step-7")
      ?.addEventListener("click", () => openResetConfirm(7));

    resetConfirmBtn?.addEventListener("click", () => {
      if (pendingResetStep === 1) resetStep1();
      else if (pendingResetStep === 2) resetStep2();
      else if (pendingResetStep === 3) resetStep3();
      else if (pendingResetStep === 4) resetStep4();
      else if (pendingResetStep === 5) resetStep5();
      else if (pendingResetStep === 6) resetStep6();
      else if (pendingResetStep === 7) resetStep7();
      else if (pendingResetStep === 8) resetStep8();
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

    const genBtn = document.getElementById("generate-plan-btn");
    console.log(">>> Attaching generatePlan listener to button:", genBtn);
    if (genBtn) {
      genBtn.addEventListener("click", generatePlan);
      console.log(">>> Listener attached successfully");
    } else {
      console.error(">>> ERROR: generate-plan-btn NOT FOUND!");
    }

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

    document
      .getElementById("download-classes-excel-btn")
      .addEventListener("click", () =>
        downloadExcel("/api/classes-excel", "Piano_classi.xlsx")
      );

    document
      .getElementById("download-professors-excel-btn")
      .addEventListener("click", () =>
        downloadExcel("/api/professors-excel", "Piano_professori.xlsx")
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

    // Step 2 (nomenclatura) save/load JSON
    document
      .getElementById("download-nomenclature-json")
      ?.addEventListener("click", () => {
        const data = getNomenclatureDataRaw();
        downloadJSON(data, "nomenclatura.json");
      });
    document
      .getElementById("upload-nomenclature-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-nomenclature-json").click()
      );
    document
      .getElementById("upload-nomenclature-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadNomenclatureFromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // Step 3 (assegnazioni) save/load JSON
    document
      .getElementById("download-assignments-json")
      ?.addEventListener("click", () => {
        const data = getAssignmentsDataRaw();
        downloadJSON(data, "assegnazioni.json");
      });
    document
      .getElementById("upload-assignments-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-assignments-json").click()
      );
    document
      .getElementById("upload-assignments-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadAssignmentsFromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // Step 4 save/load JSON (ore materia/classe)
    document
      .getElementById("download-subject-hours-json")
      ?.addEventListener("click", () => {
        const data = getSubjectHoursDataRaw();
        downloadJSON(data, "ore_materie_classi.json");
      });
    document
      .getElementById("upload-subject-hours-json-btn")
      ?.addEventListener("click", () =>
        document.getElementById("upload-subject-hours-json").click()
      );
    document
      .getElementById("upload-subject-hours-json")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          const obj = JSON.parse(text);
          loadSubjectHoursFromJson(obj);
        } catch (err) {
          alert("File JSON non valido.");
        } finally {
          e.target.value = "";
        }
      });

    // Step 5 save/load JSON (disponibilità)
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
    setMethod("mip");
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
      // Sincronizza dal DOM prima di serializzare
      try {
        syncAllDataFromDOM();
      } catch (e) {
        console.warn("Errore nella sincronizzazione durante serializzazione:", e);
      }
      
      recomputeGenerateBothWeeks();
      return {
        currentStep,
        days: appState.days,
        morningHours: appState.morningHours,
        afternoonHours: appState.afternoonHours,
        dailyHours: appState.dailyHours,
        lastMorningHour: appState.lastMorningHour,
        numProf: appState.numProf,
        numClass: appState.numClass,
        numSubjects: appState.numSubjects,
        freeAfternoonDay: appState.freeAfternoonDay,
        dayNames: appState.dayNames,
        professorNames: appState.professorNames,
        classNames: appState.classNames,
        subjectNames: appState.subjectNames,
        hourNames: appState.hourNames,
        subjectAssignments: appState.subjectAssignments,
        subjectClassHours: appState.subjectClassHours,
        hoursMatrix: appState.hoursMatrix,
        classTeachers: appState.classTeachers,
        availability: appState.availability,
        preferences: appState.preferences,
        subjectDailyMax: appState.subjectDailyMax,
        aggregateHoursRule: appState.aggregateHoursRule,
        singleTeacherRule: appState.singleTeacherRule,
        method: appState.method,
        seedEnabled: appState.seedEnabled,
        seed: appState.seed,
        generateBothWeeks: appState.generateBothWeeks,
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
      if (obj.numSubjects != null)
        document.getElementById("num_subjects").value = obj.numSubjects || "";
      if (obj.freeAfternoonDay != null)
        document.getElementById("free_afternoon_day").value =
          obj.freeAfternoonDay;

      // Push into appState and rebuild tables if needed
      appState.days = obj.days;
      appState.morningHours = obj.morningHours;
      appState.afternoonHours = obj.afternoonHours;
      appState.dailyHours = obj.dailyHours;
      appState.lastMorningHour = obj.lastMorningHour;
      appState.numProf = obj.numProf;
      appState.numClass = obj.numClass;
      appState.numSubjects = obj.numSubjects;
      appState.freeAfternoonDay = obj.freeAfternoonDay;
      appState.dayNames = Array.isArray(obj.dayNames) ? obj.dayNames : [];
      appState.professorNames = Array.isArray(obj.professorNames)
        ? obj.professorNames
        : [];
      appState.classNames = Array.isArray(obj.classNames)
        ? obj.classNames
        : [];
      appState.subjectNames = Array.isArray(obj.subjectNames)
        ? obj.subjectNames
        : [];
      appState.hourNames = Array.isArray(obj.hourNames) ? obj.hourNames : [];
      appState.subjectClassHours = Array.isArray(obj.subjectClassHours)
        ? obj.subjectClassHours
        : [];
      appState.subjectAssignments = Array.isArray(obj.subjectAssignments)
        ? obj.subjectAssignments
        : [];
      appState.hoursMatrix = Array.isArray(obj.hoursMatrix)
        ? obj.hoursMatrix
        : null;
      appState.classTeachers = Array.isArray(obj.classTeachers)
        ? obj.classTeachers
        : [];
      appState.availability = Array.isArray(obj.availability)
        ? obj.availability
        : null;
      appState.preferences = Array.isArray(obj.preferences)
        ? obj.preferences
        : [];
      appState.subjectDailyMax = Array.isArray(obj.subjectDailyMax)
        ? obj.subjectDailyMax
        : [];
      appState.aggregateHoursRule =
        typeof obj.aggregateHoursRule === "boolean"
          ? obj.aggregateHoursRule
          : true;
      appState.singleTeacherRule =
        typeof obj.singleTeacherRule === "boolean"
          ? obj.singleTeacherRule
          : true;
      appState.seedEnabled = !!obj.seedEnabled;
      appState.seed = typeof obj.seed === "number" ? obj.seed : null;
      appState.method = obj.method || "mip";
      if (appState.seedEnabled && appState.seed == null) {
        appState.seed = Math.floor(Math.random() * 10_000_000);
      }

      // Rebuild tables if we have dimensions
      if (appState.numProf && appState.days) {
        buildNomenclatureFields();
        buildAssignmentsUI();
      }
      if (appState.numSubjects && appState.numClass) {
        buildSubjectHoursTable();
      }
      if (appState.numSubjects && appState.numClass) {
        buildDailyMaxTable();
      }
      if (appState.numSubjects && appState.numClass) {
        buildDailyMaxTable();
      }
      if (appState.numProf && appState.numClass) {
        buildPreferencesTable();
      }
      if (appState.numProf && appState.numClass && appState.days) {
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
        resetStep2();
        resetStep3();
        resetStep4();
        resetStep5();
        resetStep6();
        resetStep7();
        resetStep8();
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
      "num_subjects",
      "free_afternoon_day",
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

    function navigateToStep(step) {
      const target = parseInt(step, 10);
      if (!target || target < 1 || target > 8 || target === currentStep) return;
      if (target === 1) {
        wrappedShowStep(1);
        return;
      }
      if (target === 2) {
        if (!collectStep1Data()) return;
        buildNomenclatureFields();
        wrappedShowStep(2);
        return;
      }
      if (target === 3) {
        if (!collectStep1Data()) return;
        buildNomenclatureFields();
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        wrappedShowStep(3);
        return;
      }
      if (target === 4) {
        if (!collectStep1Data()) return;
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        if (!collectSubjectHoursData()) return;
        buildAssignmentsUI();
        wrappedShowStep(4);
        return;
      }
      if (target === 5) {
        if (!collectStep1Data()) return;
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        if (!collectSubjectHoursData()) return;
        if (!collectAssignmentsData()) return;
        if (appState._assignmentsHasDeficit) {
          alert("Copri tutte le ore richieste prima di procedere.");
          return;
        }
        buildDailyMaxTable();
        wrappedShowStep(5);
        return;
      }
      if (target === 6) {
        if (!collectStep1Data()) return;
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        if (!collectSubjectHoursData()) return;
        if (!collectAssignmentsData()) return;
        buildDailyMaxTable();
        if (!collectDailyMaxData()) return;
        buildPreferencesTable();
        wrappedShowStep(6);
        return;
      }
      if (target === 7) {
        if (!collectStep1Data()) return;
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        if (!collectSubjectHoursData()) return;
        if (!collectAssignmentsData()) return;
        buildDailyMaxTable();
        if (!collectDailyMaxData()) return;
        buildPreferencesTable();
        collectPreferencesData();
        buildAvailabilityTable();
        if (!collectAvailabilityData()) return;
        wrappedShowStep(7);
        return;
      }
      if (target === 8) {
        if (!collectStep1Data()) return;
        if (!collectNomenclatureData()) return;
        buildSubjectHoursTable();
        if (!collectSubjectHoursData()) return;
        if (!collectAssignmentsData()) return;
        buildDailyMaxTable();
        if (!collectDailyMaxData()) return;
        buildPreferencesTable();
        collectPreferencesData();
        buildAvailabilityTable();
        if (!collectAvailabilityData()) return;
        wrappedShowStep(8);
      }
    }
    // Override navigation listeners to use wrappedShowStep
    document.getElementById("to-step-2").onclick = () => {
      if (!collectStep1Data()) return;
      buildNomenclatureFields();
      wrappedShowStep(2);
    };
    document.getElementById("back-to-1").onclick = () => {
      wrappedShowStep(1);
    };
    document.getElementById("to-step-3").onclick = () => {
      if (!collectNomenclatureData()) return;
      buildSubjectHoursTable();
      wrappedShowStep(3);
    };
    document.getElementById("back-to-2").onclick = () => {
      wrappedShowStep(2);
    };
    document.getElementById("to-step-4").onclick = () => {
      if (!collectSubjectHoursData()) return;
      buildAssignmentsUI();
      wrappedShowStep(4);
    };
    document.getElementById("back-to-3").onclick = () => {
      wrappedShowStep(3);
    };
    document.getElementById("to-step-5").onclick = () => {
      if (!collectAssignmentsData()) return;
      if (appState._assignmentsHasDeficit) {
        alert("Copri tutte le ore richieste prima di procedere.");
        return;
      }
      buildDailyMaxTable();
      wrappedShowStep(5);
    };
    document.getElementById("back-to-4").onclick = () => {
      wrappedShowStep(4);
    };
    document.getElementById("to-step-6").onclick = () => {
      if (!collectDailyMaxData()) return;
      buildPreferencesTable();
      wrappedShowStep(6);
    };
    document.getElementById("back-to-5").onclick = () => {
      wrappedShowStep(5);
    };
    document.getElementById("to-step-7").onclick = () => {
      collectPreferencesData();
      buildAvailabilityTable();
      wrappedShowStep(7);
    };
    document.getElementById("back-to-6").onclick = () => {
      wrappedShowStep(6);
    };
    document.getElementById("to-step-8").onclick = () => {
      if (!collectAvailabilityData()) return;
      wrappedShowStep(8);
    };
    document.getElementById("back-to-7").onclick = () => {
      wrappedShowStep(7);
    };

    document.querySelectorAll(".stepper-item").forEach((el) => {
      el.addEventListener("click", () => {
        const step = el.getAttribute("data-step");
        navigateToStep(step);
      });
    });

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
      matrixContainer
        .querySelectorAll("input[type='checkbox'][data-class-teacher='true']")
        .forEach((el) =>
          el.addEventListener("change", () => {
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

    if (modeGreedyBtn) {
      modeGreedyBtn.addEventListener("click", () => {
        appState.method = "greedy";
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
      renderAssignmentCoverage();
      persistLocal();
      updateUrl();
    };
    const origReset4 = resetStep4;
    resetStep4 = function () {
      origReset4();
      renderAssignmentCoverage();
      persistLocal();
      updateUrl();
    };
    const origReset5 = resetStep5;
    resetStep5 = function () {
      origReset5();
      persistLocal();
      updateUrl();
    };
    const origReset6 = resetStep6;
    resetStep6 = function () {
      origReset6();
      persistLocal();
      updateUrl();
    };
    const origReset7 = resetStep7;
    resetStep7 = function () {
      origReset7();
      persistLocal();
      updateUrl();
    };
    const origReset8 = resetStep8;
    resetStep8 = function () {
      origReset8();
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
  console.log(">>> DOMContentLoaded: app.js caricato!");
  const app = new WeeklyPlannerApp();
  console.log(">>> WeeklyPlannerApp creato, calling init()...");
  app.init();
  console.log(">>> WeeklyPlannerApp.init() completato!");
});
