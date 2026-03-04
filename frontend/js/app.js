// frontend/js/app.js

document.addEventListener("DOMContentLoaded", () => {
    const connectionStatusEl = document.getElementById("connectionStatus");
    const stationsListEl = document.getElementById("stationsList");
    const searchStationEl = document.getElementById("searchStation");
    const selectAllStationsBtn = document.getElementById("selectAllStations");
    const deselectAllStationsBtn = document.getElementById("deselectAllStations");
    const selectedCountEl = document.querySelector(".selected-count");
    const filterButtons = document.querySelectorAll(".btn-filter");

    const availabilitySection = document.getElementById("availabilitySection");
    const periodSection = document.getElementById("periodSection");
    const parametersSection = document.getElementById("parametersSection");
    const downloadSection = document.getElementById("downloadSection");

    const granularitySelect = document.getElementById("granularity");
    const checkAvailabilityBtn = document.getElementById("checkAvailability");
    const availabilityResultsEl = document.getElementById("availabilityResults");

    const startDateEl = document.getElementById("startDate");
    const endDateEl = document.getElementById("endDate");
    const quickDateButtons = document.querySelectorAll(".btn-quick-date");
    const estimateInfoEl = document.getElementById("estimateInfo");

    const searchParameterEl = document.getElementById("searchParameter");
    const parametersListEl = document.getElementById("parametersList");
    const selectAllParamsBtn = document.getElementById("selectAllParams");
    const deselectAllParamsBtn = document.getElementById("deselectAllParams");
    const selectedParamsCountEl = document.querySelector(".selected-params-count");

    const summaryStationsEl = document.getElementById("summaryStations");
    const summaryPeriodEl = document.getElementById("summaryPeriod");
    const summaryParamsEl = document.getElementById("summaryParams");
    const summaryVolumeEl = document.getElementById("summaryVolume");
    const downloadBtn = document.getElementById("downloadBtn");
    const downloadProgressEl = document.getElementById("downloadProgress");
    const progressFillEl = document.getElementById("progressFill");
    const progressTextEl = document.getElementById("progressText");

    const toastEl = document.getElementById("toast");
    const toastMessageEl = document.getElementById("toastMessage");

    // État global
    let selectedStationType = 'pulsonic';  // Type de station sélectionné
    let allStations = [];           // data/stations.json
    let filteredStations = [];      // après recherche/filtre
    let selectedStationIds = [];

    let parametersByCategory = {};  // Config côté backend
    let selectedParams = [];

    let flatpickrStart = null;
    let flatpickrEnd = null;

    let availabilityData = {};      // résultat /api/stations/availability
    let lastEstimate = null;        // résultat /api/estimate

    // Initialisation générale
    try { initConnectionStatus(); } catch(e) { console.error('initConnectionStatus:', e); }
    try { initStationTypeSelection(); } catch(e) { console.error('initStationTypeSelection:', e); }
    try { initDatePickers(); } catch(e) { console.error('initDatePickers:', e); }
    try { loadStationsAndInitMap(); } catch(e) { console.error('loadStationsAndInitMap:', e); }
    try { loadParameters(); } catch(e) { console.error('loadParameters:', e); }
    try { initEventListeners(); } catch(e) { console.error('initEventListeners:', e); }
    try { initScheduler(); } catch(e) { console.error('initScheduler:', e); }

    // ---------------------------
    // Fonctions d'initialisation
    // ---------------------------

    function initStationTypeSelection() {
        const stationTypeSelect = document.getElementById('stationType');
        
        if (stationTypeSelect) {
            stationTypeSelect.addEventListener('change', (e) => {
                const type = e.target.value;
                
                // Mettre à jour le type sélectionné
                selectedStationType = type;
                
                // Recharger les stations et paramètres pour ce type
                resetSelection();
                loadStationsAndInitMap();
                loadParameters();
                
                showToast(`Type de station "${type}" sélectionné`, "success");
            });
        }
    }

    function resetSelection() {
        selectedStationIds = [];
        selectedParams = [];
        availabilityData = {};
        lastEstimate = null;
        
        // Cacher les sections suivantes
        if (availabilitySection) availabilitySection.style.display = "none";
        if (periodSection) periodSection.style.display = "none";
        if (parametersSection) parametersSection.style.display = "none";
        if (downloadSection) downloadSection.style.display = "none";
    }

    function initConnectionStatus() {
        setConnectionStatus("pending", "Connexion au WebService...");
        ApiClient.health()
            .then((res) => {
                if (res.status === "ok") {
                    setConnectionStatus("connected", "Connecté au WebService");
                } else {
                    setConnectionStatus("error", "Problème de connexion");
                }
            })
            .catch(() => {
                setConnectionStatus("error", "Impossible de contacter l'API");
            });
    }

    function setConnectionStatus(status, text) {
        connectionStatusEl.classList.remove("connected", "error");
        const icon = connectionStatusEl.querySelector("i");
        const span = connectionStatusEl.querySelector("span");

        if (status === "connected") {
            connectionStatusEl.classList.add("connected");
            icon.style.color = "#10b981";
        } else if (status === "error") {
            connectionStatusEl.classList.add("error");
            icon.style.color = "#ef4444";
        } else {
            icon.style.color = "#e5e7eb";
        }
        span.textContent = text;
    }

    function initDatePickers() {
        flatpickr.localize(flatpickr.l10ns.fr);

        flatpickrStart = flatpickr(startDateEl, {
            dateFormat: "Y-m-d H:i",
            enableTime: true,
            time_24hr: true,
            maxDate: "today",
            defaultHour: 0,
            defaultMinute: 0,
            onChange: () => onDatesChanged()
        });

        flatpickrEnd = flatpickr(endDateEl, {
            dateFormat: "Y-m-d H:i",
            enableTime: true,
            time_24hr: true,
            maxDate: "today",
            defaultHour: 23,
            defaultMinute: 59,
            onChange: () => onDatesChanged()
        });
    }

    function loadStationsAndInitMap() {
        ApiClient.getStations(selectedStationType)
            .then((res) => {
                if (res.status !== "success") {
                    throw new Error(res.message || "Erreur chargement stations");
                }
                allStations = res.data.stations || res.data || [];
                filteredStations = [...allStations];
                renderStationsList();
                MapManager.initMap(allStations);
            })
            .catch((err) => {
                showToast("Erreur lors du chargement des stations : " + err.message, "error");
            });
    }

    function loadParameters() {
        ApiClient.getParameters(selectedStationType)
            .then((res) => {
                if (res.status !== "success") {
                    throw new Error(res.message || "Erreur chargement paramètres");
                }
                parametersByCategory = res.data;
                renderParametersList();
            })
            .catch((err) => {
                showToast("Erreur lors du chargement des paramètres : " + err.message, "error");
            });
    }

    function initEventListeners() {
        // Recherche stations
        searchStationEl.addEventListener("input", () => {
            filterStations();
            renderStationsList();
        });

        // Filtres urbain/rural
        filterButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                filterButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                filterStations();
                renderStationsList();
            });
        });

        // Sélection / désélection globale stations
        selectAllStationsBtn.addEventListener("click", () => {
            selectedStationIds = filteredStations.map((s) => s.id);
            updateStationsSelectionUI();
        });

        deselectAllStationsBtn.addEventListener("click", () => {
            selectedStationIds = [];
            updateStationsSelectionUI();
        });

        // Vérification disponibilité
        checkAvailabilityBtn.addEventListener("click", onCheckAvailability);

        // Raccourcis dates
        quickDateButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const days = parseInt(btn.dataset.period, 10);
                applyQuickPeriod(days);
            });
        });

        // Recherche paramètres
        searchParameterEl.addEventListener("input", () => {
            renderParametersList();
        });

        // Sélection / désélection globale paramètres
        selectAllParamsBtn.addEventListener("click", () => {
            selectedParams = getAllParamIds();
            updateParametersSelectionUI();
        });

        deselectAllParamsBtn.addEventListener("click", () => {
            selectedParams = [];
            updateParametersSelectionUI();
        });

        // Téléchargement
        downloadBtn.addEventListener("click", onDownload);
    }

    // ---------------------------
    // Stations
    // ---------------------------

    function filterStations() {
        const search = searchStationEl.value.toLowerCase().trim();
        const activeFilter = document.querySelector(".btn-filter.active")?.dataset.filter || "all";

        filteredStations = allStations.filter((s) => {
            let ok = true;
            if (search) {
                ok =
                    s.label.toLowerCase().includes(search) ||
                    s.id.toLowerCase().includes(search) ||
                    (s.region && s.region.toLowerCase().includes(search));
            }

            if (activeFilter === "urbaine") {
                ok = ok && s.type === "urbaine";
            } else if (activeFilter === "rurale") {
                ok = ok && s.type === "rurale";
            }
            return ok;
        });
    }

    function renderStationsList() {
        stationsListEl.innerHTML = "";

        if (filteredStations.length === 0) {
            stationsListEl.innerHTML = "<p>Aucune station trouvée.</p>";
            return;
        }

        filteredStations.forEach((station) => {
            const isSelected = selectedStationIds.includes(station.id);

            const item = document.createElement("div");
            item.className = "station-item" + (isSelected ? " selected" : "");
            item.dataset.stationId = station.id;

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = isSelected;

            const info = document.createElement("div");
            info.className = "station-info";
            info.innerHTML = `
                <strong>${station.label}</strong>
                <small>${station.region || ""}</small>
            `;

            const chip = document.createElement("span");
            chip.className = "station-type " + (station.type === "urbaine" ? "urbaine" : "rurale");
            chip.textContent = station.type === "urbaine" ? "Urbain" : "Rural";

            item.appendChild(checkbox);
            item.appendChild(info);
            item.appendChild(chip);

            item.addEventListener("click", (e) => {
                if (e.target.tagName.toLowerCase() === "input") return;

                const id = station.id;
                if (selectedStationIds.includes(id)) {
                    selectedStationIds = selectedStationIds.filter((x) => x !== id);
                } else {
                    selectedStationIds.push(id);
                    MapManager.focusOnStation(id);
                }
                updateStationsSelectionUI();
            });

            checkbox.addEventListener("change", () => {
                const id = station.id;
                if (checkbox.checked) {
                    if (!selectedStationIds.includes(id)) {
                        selectedStationIds.push(id);
                        MapManager.focusOnStation(id);
                    }
                } else {
                    selectedStationIds = selectedStationIds.filter((x) => x !== id);
                }
                updateStationsSelectionUI();
            });

            stationsListEl.appendChild(item);
        });

        updateStationsSelectionUI();
    }

    function updateStationsSelectionUI() {
        // Met à jour classes et case à cocher
        const items = stationsListEl.querySelectorAll(".station-item");
        items.forEach((el) => {
            const id = el.dataset.stationId;
            const checked = selectedStationIds.includes(id);
            el.classList.toggle("selected", checked);
            const checkbox = el.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = checked;
        });

        selectedCountEl.textContent = `${selectedStationIds.length} station(s) sélectionnée(s)`;

        MapManager.highlightSelectedStations(selectedStationIds);

        // Afficher les étapes suivantes seulement s'il y a au moins une station
        const showNext = selectedStationIds.length > 0;
        availabilitySection.style.display = showNext ? "block" : "none";
        periodSection.style.display = "none";
        parametersSection.style.display = "none";
        downloadSection.style.display = "none";
        availabilityResultsEl.innerHTML = "";
        estimateInfoEl.style.display = "none";
        lastEstimate = null;
    }

    // ---------------------------
    // Disponibilité
    // ---------------------------

    function onCheckAvailability() {
        if (selectedStationIds.length === 0) {
            showToast("Sélectionnez au moins une station.", "warning");
            return;
        }

        const granularity = granularitySelect.value;
        availabilityResultsEl.innerHTML = "<p>Vérification en cours...</p>";

        ApiClient.getAvailability(selectedStationIds, granularity, selectedStationType)
            .then((res) => {
                if (res.status !== "success") {
                    throw new Error(res.message || "Erreur disponibilité");
                }
                availabilityData = res.data;
                renderAvailabilityResults();
                periodSection.style.display = "block";
                parametersSection.style.display = "block";
            })
            .catch((err) => {
                availabilityResultsEl.innerHTML = "";
                showToast("Erreur de disponibilité : " + err.message, "error");
            });
    }

    function renderAvailabilityResults() {
        availabilityResultsEl.innerHTML = "";
        const granularity = granularitySelect.value;

        Object.entries(availabilityData).forEach(([stationId, info]) => {
            const card = document.createElement("div");
            card.className = "availability-card";

            if (info.has_data) {
                card.classList.add("has-data");
                const first = new Date(info.first_date);
                const last = new Date(info.last_date);

                card.innerHTML = `
                    <h4>${info.label}</h4>
                    <div class="availability-info">
                        <p><i class="fas fa-database"></i> Données disponibles : oui</p>
                        <p><i class="fas fa-calendar-day"></i> De <strong>${first.toISOString().slice(0, 10)}</strong> à <strong>${last.toISOString().slice(0, 10)}</strong></p>
                        <p><i class="fas fa-clock"></i> Longueur de la série : <strong>${info.duration_formatted}</strong> (${info.days_count} jours)</p>
                        <p><i class="fas fa-sliders-h"></i> Granularité : <strong>${granularity}</strong></p>
                    </div>
                `;
            } else {
                card.classList.add("no-data");
                card.innerHTML = `
                    <h4>${info.label}</h4>
                    <div class="availability-info">
                        <p><i class="fas fa-database"></i> Aucune donnée disponible</p>
                        <p><i class="fas fa-exclamation-triangle"></i> ${info.error || "Erreur inconnue"}</p>
                    </div>
                `;
            }

            availabilityResultsEl.appendChild(card);
        });
    }

    // ---------------------------
    // Période + estimation
    // ---------------------------

    function applyQuickPeriod(days) {
        if (Object.keys(availabilityData).length === 0) {
            showToast("Vérifiez d'abord la disponibilité des données.", "warning");
            return;
        }

        const now = new Date();
        const end = new Date(now);

        if (days === 0) {
            // Aujourd'hui : de 00:00 à maintenant
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
            flatpickrStart.setDate(start, true);
            flatpickrEnd.setDate(end, true);
        } else {
            const start = new Date(now);
            start.setDate(now.getDate() - days + 1);
            start.setHours(0, 0, 0, 0);
            flatpickrStart.setDate(start, true);
            flatpickrEnd.setDate(end, true);
        }

        onDatesChanged();
    }

    function onDatesChanged() {
        const start = startDateEl.value;
        const end = endDateEl.value;

        if (!start || !end) {
            estimateInfoEl.style.display = "none";
            lastEstimate = null;
            return;
        }

        if (selectedStationIds.length === 0 || selectedParams.length === 0) {
            // L'estimation sera refaite plus tard quand tous les éléments seront prêts
            estimateInfoEl.style.display = "none";
            lastEstimate = null;
            return;
        }

        requestEstimate(start, end);
    }

    function requestEstimate(startDate, endDate) {
        const granularity = granularitySelect.value;

        ApiClient.estimateDownload(selectedStationIds, selectedParams, startDate, endDate, granularity, selectedStationType)
            .then((res) => {
                if (res.status !== "success") {
                    throw new Error(res.message || "Erreur estimation");
                }
                lastEstimate = res.data;
                renderEstimateInfo(startDate, endDate);
                parametersSection.style.display = "block";
            })
            .catch((err) => {
                estimateInfoEl.style.display = "none";
                lastEstimate = null;
                showToast("Erreur d'estimation : " + err.message, "error");
            });
    }

    function renderEstimateInfo(startDate, endDate) {
        if (!lastEstimate) return;

        estimateInfoEl.style.display = "block";
        estimateInfoEl.innerHTML = `
            <h4>Estimation du volume de données</h4>
            <p>Période sélectionnée : <strong>${startDate}</strong> → <strong>${endDate}</strong></p>
            <div class="estimate-grid">
                <div class="estimate-item">
                    <strong>Lignes estimées</strong>
                    <span>${lastEstimate.rows.toLocaleString("fr-FR")}</span>
                </div>
                <div class="estimate-item">
                    <strong>Taille (Ko)</strong>
                    <span>${lastEstimate.size_kb.toLocaleString("fr-FR")}</span>
                </div>
                <div class="estimate-item">
                    <strong>Taille (Mo)</strong>
                    <span>${lastEstimate.size_mb.toLocaleString("fr-FR")}</span>
                </div>
            </div>
        `;

        updateSummary();
        downloadSection.style.display = "block";
    }

    // ---------------------------
    // Paramètres
    // ---------------------------

    function getAllParamIds() {
        const ids = [];
        Object.values(parametersByCategory).forEach((cat) => {
            (cat.params || []).forEach((p) => ids.push(p.id));
        });
        return ids;
    }

    function renderParametersList() {
        parametersListEl.innerHTML = "";

        const search = searchParameterEl.value.toLowerCase().trim();

        Object.entries(parametersByCategory).forEach(([catKey, cat]) => {
            const categoryDiv = document.createElement("div");
            categoryDiv.className = "param-category";

            const header = document.createElement("div");
            header.className = "param-category-header";
            header.innerHTML = `<h4>${cat.label}</h4>`;
            categoryDiv.appendChild(header);

            const itemsContainer = document.createElement("div");
            itemsContainer.className = "param-items";

            (cat.params || []).forEach((param) => {
                const matchesSearch =
                    !search ||
                    param.id.toLowerCase().includes(search) ||
                    param.label.toLowerCase().includes(search);

                if (!matchesSearch) return;

                const isSelected = selectedParams.includes(param.id);

                const item = document.createElement("div");
                item.className = "param-item" + (isSelected ? " selected" : "");

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = isSelected;

                const label = document.createElement("label");
                label.textContent = `${param.id} — ${param.label}`;

                item.appendChild(checkbox);
                item.appendChild(label);

                item.addEventListener("click", (e) => {
                    if (e.target.tagName.toLowerCase() === "input") return;

                    toggleParam(param.id);
                });

                checkbox.addEventListener("change", () => {
                    toggleParam(param.id, checkbox.checked);
                });

                itemsContainer.appendChild(item);
            });

            if (itemsContainer.children.length > 0) {
                categoryDiv.appendChild(itemsContainer);
                parametersListEl.appendChild(categoryDiv);
            }
        });

        updateParametersSelectionUI();
    }

    function toggleParam(paramId, forceState) {
        const exists = selectedParams.includes(paramId);

        if (forceState === true || (!exists && forceState === undefined)) {
            selectedParams.push(paramId);
        } else if (forceState === false || (exists && forceState === undefined)) {
            selectedParams = selectedParams.filter((p) => p !== paramId);
        }

        updateParametersSelectionUI();

        const start = startDateEl.value;
        const end = endDateEl.value;
        if (start && end && selectedStationIds.length > 0 && selectedParams.length > 0) {
            requestEstimate(start, end);
        } else {
            // Afficher quand même la section download pour que l'utilisateur voie le bouton
            // même si l'estimation n'est pas encore disponible
            if (selectedStationIds.length > 0 && selectedParams.length > 0) {
                downloadSection.style.display = "block";
                updateSummary();
            }
        }
    }

    function updateParametersSelectionUI() {
        const items = parametersListEl.querySelectorAll(".param-item");
        items.forEach((el) => {
            const text = el.textContent || "";
            const id = text.split("—")[0].trim();
            const selected = selectedParams.includes(id);
            el.classList.toggle("selected", selected);
            const checkbox = el.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = selected;
        });

        selectedParamsCountEl.textContent = `${selectedParams.length} paramètre(s) sélectionné(s)`;

        const start = startDateEl.value;
        const end = endDateEl.value;
        if (start && end && selectedStationIds.length > 0 && selectedParams.length > 0) {
            parametersSection.style.display = "block";
            requestEstimate(start, end);
        } else {
            downloadSection.style.display = "none";
        }
    }

    // ---------------------------
    // Récapitulatif + téléchargement
    // ---------------------------

    function updateSummary() {
        // Stations
        const labels = allStations
            .filter((s) => selectedStationIds.includes(s.id))
            .map((s) => s.label);
        summaryStationsEl.textContent = labels.join(", ");

        // Période
        const start = startDateEl.value || "-";
        const end = endDateEl.value || "-";
        summaryPeriodEl.textContent = `${start} → ${end}`;

        // Paramètres
        summaryParamsEl.textContent = selectedParams.join(", ");

        // Volume
        if (lastEstimate) {
            summaryVolumeEl.textContent = `${lastEstimate.rows.toLocaleString("fr-FR")} lignes (~${lastEstimate.size_mb} Mo)`;
        } else {
            summaryVolumeEl.textContent = "-";
        }
    }

    async function onDownload() {
        if (selectedStationIds.length === 0) {
            showToast("Sélectionnez au moins une station.", "warning");
            return;
        }
        if (selectedParams.length === 0) {
            showToast("Sélectionnez au moins un paramètre.", "warning");
            return;
        }
        const start = startDateEl.value;
        const end = endDateEl.value;
        if (!start || !end) {
            showToast("Sélectionnez une période de téléchargement.", "warning");
            return;
        }

        const granularity = granularitySelect.value;

        try {
            downloadBtn.disabled = true;
            showProgress(10, "Préparation de la requête...");

            const blob = await ApiClient.downloadData(
                selectedStationIds,
                selectedParams,
                start,
                end,
                granularity,
                selectedStationType
            );

            showProgress(80, "Construction du fichier CSV...");
            const filename = buildFileName(start, end);

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showProgress(100, "Téléchargement terminé.");
            setTimeout(() => hideProgress(), 1500);
            showToast("Téléchargement terminé.", "success");
        } catch (err) {
            hideProgress();
            showToast("Erreur de téléchargement : " + err.message, "error");
        } finally {
            downloadBtn.disabled = false;
        }
    }

    function buildFileName(startDate, endDate) {
        const stationPart = selectedStationIds
            .map((id) => id.replace("CI_", ""))
            .join("-");
        const cleanStart = startDate.replace(/[-: ]/g, "").slice(0, 12);
        const cleanEnd = endDate.replace(/[-: ]/g, "").slice(0, 12);
        return `meteo_${stationPart}_${cleanStart}-${cleanEnd}.csv`;
    }

    function showProgress(percent, text) {
        downloadProgressEl.style.display = "block";
        progressFillEl.style.width = `${percent}%`;
        progressFillEl.textContent = `${percent}%`;
        progressTextEl.textContent = text;
    }

    function hideProgress() {
        downloadProgressEl.style.display = "none";
        progressFillEl.style.width = "0%";
        progressFillEl.textContent = "";
        progressTextEl.textContent = "";
    }

    // ---------------------------
    // Toasts
    // ---------------------------

    function showToast(message, type = "info") {
        toastEl.classList.remove("success", "error", "warning");
        if (type === "success") toastEl.classList.add("success");
        if (type === "error") toastEl.classList.add("error");
        if (type === "warning") toastEl.classList.add("warning");

        toastMessageEl.textContent = message;
        toastEl.classList.add("show");

        setTimeout(() => {
            toastEl.classList.remove("show");
        }, 4000);
    }


    // ---------------------------
    // Planificateur multi-tâches
    // ---------------------------

    let allTasks = [];
    let taskCountdownIntervals = {};

    // ─── État du modal ──────────────────────────────────
    let modalStep = 0;
    const MODAL_STEPS = [
        { key: 'network',  label: 'Réseau',       icon: 'fa-network-wired' },
        { key: 'stations', label: 'Stations',     icon: 'fa-map-marker-alt' },
        { key: 'period',   label: 'Période',      icon: 'fa-calendar-alt' },
        { key: 'params',   label: 'Paramètres',   icon: 'fa-sliders-h' },
        { key: 'schedule', label: 'Planification', icon: 'fa-clock' },
    ];
    let modalData = {
        name: '', station_type: 'pulsonic', stations: [],
        granularity: 'H', period_days: 1, params: [],
        hour: 6, minute: 0,
    };
    let modalStationsCache = [];
    let modalParamsCache = {};
    let editingTaskId = null;

    const GRAN_LABELS = { H: 'Horaire', J: 'Journalière', X: '6 min', U: 'Minute' };

    function initScheduler() {
        loadTasks();
        document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
        document.getElementById('modalCloseBtn').addEventListener('click', closeTaskModal);
        document.getElementById('modalPrevBtn').addEventListener('click', modalPrev);
        document.getElementById('modalNextBtn').addEventListener('click', modalNext);
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') closeTaskModal();
        });
        document.getElementById('taskList').addEventListener('click', onTaskListClick);
        document.getElementById('taskList').addEventListener('change', onTaskListChange);
        setInterval(loadTasks, 30000);
    }

    function loadTasks() {
        ApiClient.getSchedulerTasks()
            .then(res => {
                if (res.status === 'success') {
                    allTasks = res.data.tasks || [];
                    renderTaskList(res.data);
                }
            })
            .catch(err => console.warn('Scheduler tasks error:', err));
    }

    // ─── Rendu de la liste de tâches ────────────────────

    function renderTaskList(data) {
        const countEl = document.getElementById('activeTasksCount');
        const badgeEl = document.getElementById('activeTasksBadge');
        countEl.textContent = data.active_count || 0;
        badgeEl.classList.toggle('has-active', (data.active_count || 0) > 0);

        const listEl = document.getElementById('taskList');

        if (!data.tasks || data.tasks.length === 0) {
            listEl.innerHTML = `
                <div class="task-empty-state">
                    <div class="empty-icon"><i class="fas fa-calendar-plus"></i></div>
                    <h4>Aucune tâche planifiée</h4>
                    <p>Créez votre première tâche pour automatiser les téléchargements quotidiens</p>
                </div>`;
            return;
        }

        listEl.innerHTML = data.tasks.map(renderTaskCard).join('');

        // Countdown timers
        Object.values(taskCountdownIntervals).forEach(clearInterval);
        taskCountdownIntervals = {};
        data.tasks.forEach(task => {
            if (task.active && task.next_run) startTaskCountdown(task);
        });
    }

    function renderTaskCard(task) {
        const isActive = task.active;
        const netLabel = task.station_type === 'pulsonic' ? '📡 Pulsonic' : '🔧 Campbell';
        const netClass = task.station_type || 'pulsonic';

        let statusHtml = '';
        if (task.last_run) {
            const cls = task.last_status === 'success' ? 'success' : task.last_status === 'warning' ? 'warning' : 'error';
            const ico = task.last_status === 'success' ? 'fa-check-circle' : task.last_status === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle';
            const txt = task.last_status === 'success' ? 'Succès' : task.last_status === 'warning' ? 'Attention' : 'Erreur';
            statusHtml = `
                <div class="task-last-run">
                    <span class="task-status-pill ${cls}"><i class="fas ${ico}"></i> ${txt}</span>
                    <span class="task-last-detail">${task.last_message || ''}</span>
                </div>`;
        }

        let nextHtml = '';
        if (isActive && task.next_run_display) {
            nextHtml = `
                <div class="task-next-run">
                    <i class="fas fa-hourglass-half"></i> ${task.next_run_display}
                    <span class="task-countdown" id="countdown-${task.id}"></span>
                </div>`;
        }

        return `
        <div class="task-card ${isActive ? 'active' : ''}" data-task-id="${task.id}">
            <div class="task-card-top">
                <div class="task-card-info">
                    <span class="task-network-badge ${netClass}">${netLabel}</span>
                    <h4 class="task-name">${_esc(task.name)}</h4>
                </div>
                <label class="toggle-switch mini" title="${isActive ? 'Désactiver' : 'Activer'}">
                    <input type="checkbox" data-action="toggle" data-task-id="${task.id}" ${isActive ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="task-card-meta">
                <span class="meta-chip"><i class="fas fa-map-marker-alt"></i> ${(task.stations||[]).length} station(s)</span>
                <span class="meta-chip"><i class="fas fa-sliders-h"></i> ${(task.params||[]).length} param(s)</span>
                <span class="meta-chip"><i class="fas fa-clock"></i> ${GRAN_LABELS[task.granularity]||task.granularity} · ${task.period_days}j</span>
                <span class="meta-chip highlight"><i class="fas fa-bell"></i> ${String(task.hour).padStart(2,'0')}:${String(task.minute).padStart(2,'0')} GMT</span>
            </div>
            ${statusHtml || nextHtml ? `<div class="task-card-status">${statusHtml}${nextHtml}</div>` : ''}
            <div class="task-card-actions">
                <button class="btn-task-action" data-action="run-now" data-task-id="${task.id}" title="Lancer maintenant"><i class="fas fa-play"></i></button>
                <button class="btn-task-action" data-action="edit" data-task-id="${task.id}" title="Modifier"><i class="fas fa-edit"></i></button>
                <button class="btn-task-action danger" data-action="delete" data-task-id="${task.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }

    function _esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function startTaskCountdown(task) {
        const update = () => {
            const el = document.getElementById(`countdown-${task.id}`);
            if (!el) return;
            const now = new Date();
            const target = new Date(task.next_run + 'Z');
            const diff = Math.max(0, Math.floor((target - now) / 1000));
            if (diff <= 0) {
                el.textContent = '⏳ En cours...';
                setTimeout(loadTasks, 5000);
                clearInterval(taskCountdownIntervals[task.id]);
                return;
            }
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            let parts = [];
            if (h > 0) parts.push(`${h}h`);
            parts.push(`${String(m).padStart(2,'0')}min`);
            parts.push(`${String(s).padStart(2,'0')}s`);
            el.textContent = `(${parts.join(' ')})`;
        };
        update();
        taskCountdownIntervals[task.id] = setInterval(update, 1000);
    }

    // ─── Événements sur la liste ────────────────────────

    function onTaskListClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.tagName === 'INPUT') return;
        const action = btn.dataset.action;
        const taskId = btn.dataset.taskId;
        if (!taskId) return;
        switch (action) {
            case 'run-now': runTaskNow(taskId, btn); break;
            case 'edit':    openTaskModal(taskId); break;
            case 'delete':  deleteTask(taskId); break;
        }
    }

    function onTaskListChange(e) {
        const input = e.target;
        if (input.dataset.action === 'toggle') {
            toggleTask(input.dataset.taskId, input.checked, input);
        }
    }

    function toggleTask(taskId, active, inputEl) {
        ApiClient.toggleSchedulerTask(taskId, active)
            .then(res => { showToast(res.message, 'success'); loadTasks(); })
            .catch(err => { if (inputEl) inputEl.checked = !active; showToast('Erreur : ' + err.message, 'error'); });
    }

    function runTaskNow(taskId, btn) {
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        ApiClient.runSchedulerTaskNow(taskId)
            .then(res => { showToast(res.message, 'success'); setTimeout(loadTasks, 5000); setTimeout(loadTasks, 15000); })
            .catch(err => { showToast('Erreur : ' + err.message, 'error'); })
            .finally(() => { setTimeout(() => { btn.innerHTML = origHTML; btn.disabled = false; }, 3000); });
    }

    function deleteTask(taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!confirm(`Supprimer la tâche « ${task ? task.name : taskId} » ?`)) return;
        ApiClient.deleteSchedulerTask(taskId)
            .then(res => { showToast(res.message, 'success'); loadTasks(); })
            .catch(err => { showToast('Erreur : ' + err.message, 'error'); });
    }

    // ─── Modal : ouverture / fermeture ──────────────────

    function openTaskModal(taskId = null) {
        editingTaskId = taskId;
        modalStep = 0;
        if (taskId) {
            const task = allTasks.find(t => t.id === taskId);
            if (!task) return;
            modalData = {
                name: task.name || '',
                station_type: task.station_type || 'pulsonic',
                stations: [...(task.stations || [])],
                granularity: task.granularity || 'H',
                period_days: task.period_days || 1,
                params: [...(task.params || [])],
                hour: task.hour ?? 6,
                minute: task.minute ?? 0,
            };
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Modifier la tâche';
        } else {
            modalData = { name: '', station_type: 'pulsonic', stations: [], granularity: 'H', period_days: 1, params: [], hour: 6, minute: 0 };
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Nouvelle tâche planifiée';
        }
        modalStationsCache = [];
        modalParamsCache = {};
        document.getElementById('taskModal').classList.add('open');
        document.body.style.overflow = 'hidden';
        renderModalStep();
    }

    function closeTaskModal() {
        document.getElementById('taskModal').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ─── Modal : navigation ─────────────────────────────

    function renderModalStepper() {
        document.getElementById('modalStepper').innerHTML = MODAL_STEPS.map((s, i) => `
            <div class="step-indicator ${i === modalStep ? 'active' : ''} ${i < modalStep ? 'done' : ''}">
                <span class="step-dot">${i < modalStep ? '<i class="fas fa-check"></i>' : (i + 1)}</span>
                <span class="step-text">${s.label}</span>
            </div>
        `).join('<div class="step-line"></div>');
    }

    function renderModalStep() {
        renderModalStepper();
        const body = document.getElementById('modalBody');
        const prevBtn = document.getElementById('modalPrevBtn');
        const nextBtn = document.getElementById('modalNextBtn');

        prevBtn.style.display = modalStep > 0 ? '' : 'none';
        if (modalStep < MODAL_STEPS.length - 1) {
            nextBtn.innerHTML = 'Suivant <i class="fas fa-arrow-right"></i>';
            nextBtn.className = 'btn btn-primary';
        } else {
            nextBtn.innerHTML = editingTaskId
                ? '<i class="fas fa-save"></i> Enregistrer'
                : '<i class="fas fa-plus"></i> Créer la tâche';
            nextBtn.className = 'btn btn-primary btn-create';
        }

        switch (MODAL_STEPS[modalStep].key) {
            case 'network':  renderStepNetwork(body); break;
            case 'stations': renderStepStations(body); break;
            case 'period':   renderStepPeriod(body); break;
            case 'params':   renderStepParams(body); break;
            case 'schedule': renderStepSchedule(body); break;
        }
    }

    function modalNext() {
        if (!validateCurrentStep()) return;
        if (modalStep < MODAL_STEPS.length - 1) {
            modalStep++;
            renderModalStep();
        } else {
            submitTask();
        }
    }

    function modalPrev() {
        if (modalStep > 0) { modalStep--; renderModalStep(); }
    }

    function validateCurrentStep() {
        switch (MODAL_STEPS[modalStep].key) {
            case 'network':
                const nameIn = document.getElementById('taskNameInput');
                if (nameIn) modalData.name = nameIn.value.trim();
                if (!modalData.name) { showToast('Veuillez saisir un nom pour la tâche', 'warning'); return false; }
                return true;
            case 'stations':
                if (modalData.stations.length === 0) { showToast('Sélectionnez au moins une station', 'warning'); return false; }
                return true;
            case 'params':
                if (modalData.params.length === 0) { showToast('Sélectionnez au moins un paramètre', 'warning'); return false; }
                return true;
            default:
                return true;
        }
    }

    // ─── Étape 1 : Réseau ───────────────────────────────

    function renderStepNetwork(container) {
        container.innerHTML = `
            <div class="modal-step-content">
                <div class="form-group">
                    <label class="form-label"><i class="fas fa-tag"></i> Nom de la tâche</label>
                    <input type="text" id="taskNameInput" class="form-input"
                           value="${_esc(modalData.name)}"
                           placeholder="Ex : Téléchargement Pulsonic quotidien">
                    <small class="form-hint">Un nom descriptif pour identifier cette tâche</small>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fas fa-network-wired"></i> Type de réseau</label>
                    <div class="network-card-grid">
                        <div class="network-card ${modalData.station_type === 'pulsonic' ? 'selected' : ''}" data-type="pulsonic">
                            <span class="network-icon">📡</span>
                            <div class="network-info">
                                <strong>Pulsonic</strong>
                                <small>Réseau principal SODEXAM</small>
                            </div>
                            <span class="network-check"><i class="fas fa-check-circle"></i></span>
                        </div>
                        <div class="network-card disabled" data-type="campbell">
                            <span class="network-icon">🔧</span>
                            <div class="network-info">
                                <strong>Campbell</strong>
                                <small>Stations spécialisées</small>
                            </div>
                            <span class="network-badge-soon">Prochainement</span>
                        </div>
                    </div>
                </div>
            </div>`;
        container.querySelectorAll('.network-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.network-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                modalData.station_type = card.dataset.type;
                // Vider la cache des stations si le type change
                modalStationsCache = [];
                modalParamsCache = {};
                modalData.stations = [];
                modalData.params = [];
            });
        });
    }

    // ─── Étape 2 : Stations ─────────────────────────────

    function renderStepStations(container) {
        container.innerHTML = `
            <div class="modal-step-content">
                <div class="modal-step-toolbar">
                    <input type="text" id="modalSearchStation" class="search-input" placeholder="🔍 Rechercher une station...">
                    <div class="toolbar-actions">
                        <button class="btn-link" id="modalSelectAllSt">Tout sélectionner</button>
                        <button class="btn-link" id="modalDeselectAllSt">Tout désélectionner</button>
                    </div>
                    <span class="selection-badge" id="modalStCount">${modalData.stations.length} sélectionnée(s)</span>
                </div>
                <div class="modal-list-container" id="modalStList">
                    <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement des stations...</div>
                </div>
            </div>`;

        // Charger les stations
        if (modalStationsCache.length > 0 && modalStationsCache._stype === modalData.station_type) {
            renderModalStations();
        } else {
            ApiClient.getStations(modalData.station_type)
                .then(res => {
                    modalStationsCache = res.data?.stations || res.data || [];
                    modalStationsCache._stype = modalData.station_type;
                    renderModalStations();
                })
                .catch(err => {
                    const el = document.getElementById('modalStList');
                    if (el) el.innerHTML = `<p class="error-msg">Erreur : ${err.message}</p>`;
                });
        }

        document.getElementById('modalSearchStation').addEventListener('input', renderModalStations);
        document.getElementById('modalSelectAllSt').addEventListener('click', () => {
            modalData.stations = modalStationsCache.map(s => s.id);
            renderModalStations();
        });
        document.getElementById('modalDeselectAllSt').addEventListener('click', () => {
            modalData.stations = [];
            renderModalStations();
        });
    }

    function renderModalStations() {
        const search = (document.getElementById('modalSearchStation')?.value || '').toLowerCase().trim();
        const filtered = modalStationsCache.filter(s =>
            !search || s.label.toLowerCase().includes(search) || s.id.toLowerCase().includes(search) || (s.region && s.region.toLowerCase().includes(search))
        );
        const listEl = document.getElementById('modalStList');
        if (!listEl) return;

        listEl.innerHTML = filtered.map(s => {
            const checked = modalData.stations.includes(s.id);
            return `
                <div class="modal-list-item ${checked ? 'selected' : ''}" data-id="${s.id}">
                    <input type="checkbox" ${checked ? 'checked' : ''}>
                    <div class="item-info">
                        <strong>${s.label}</strong>
                        <small>${s.region || ''}</small>
                    </div>
                    <span class="item-type ${s.type || ''}">${s.type === 'urbaine' ? 'Urbain' : 'Rural'}</span>
                </div>`;
        }).join('');

        if (filtered.length === 0) {
            listEl.innerHTML = '<p class="empty-msg">Aucune station trouvée</p>';
        }

        listEl.querySelectorAll('.modal-list-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                toggleModalItem(el.dataset.id, modalData.stations, 'modalStList', 'modalStCount', 'sélectionnée(s)');
            });
            el.querySelector('input')?.addEventListener('change', () => {
                toggleModalItem(el.dataset.id, modalData.stations, 'modalStList', 'modalStCount', 'sélectionnée(s)');
            });
        });

        const countEl = document.getElementById('modalStCount');
        if (countEl) countEl.textContent = `${modalData.stations.length} sélectionnée(s)`;
    }

    function toggleModalItem(id, arr, listContainerId, countId, countSuffix) {
        const idx = arr.indexOf(id);
        if (idx >= 0) arr.splice(idx, 1);
        else arr.push(id);

        const container = document.getElementById(listContainerId);
        const item = container?.querySelector(`[data-id="${id}"]`);
        if (item) {
            const isSelected = arr.includes(id);
            item.classList.toggle('selected', isSelected);
            const cb = item.querySelector('input');
            if (cb) cb.checked = isSelected;
        }
        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = `${arr.length} ${countSuffix}`;
    }

    // ─── Étape 3 : Période ──────────────────────────────

    function renderStepPeriod(container) {
        const granOptions = [
            { value: 'H', label: 'Horaire', desc: 'Une valeur par heure' },
            { value: 'J', label: 'Journalière', desc: 'Une valeur par jour' },
            { value: 'X', label: '6 minutes', desc: 'Haute résolution' },
            { value: 'U', label: 'Minute', desc: 'Résolution maximale' },
        ];
        const periodOptions = [1, 3, 7, 15, 30];

        container.innerHTML = `
            <div class="modal-step-content">
                <div class="form-group">
                    <label class="form-label"><i class="fas fa-ruler-horizontal"></i> Granularité des données</label>
                    <div class="option-card-grid">
                        ${granOptions.map(g => `
                            <div class="option-card ${modalData.granularity === g.value ? 'selected' : ''}" data-value="${g.value}">
                                <strong>${g.label}</strong>
                                <small>${g.desc}</small>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fas fa-history"></i> Période de récupération</label>
                    <p class="form-hint">Nombre de jours précédents téléchargés à chaque exécution</p>
                    <div class="period-btn-grid">
                        ${periodOptions.map(d => `
                            <button class="period-btn ${modalData.period_days === d ? 'selected' : ''}" data-days="${d}">
                                ${d} jour${d > 1 ? 's' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>`;

        container.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                modalData.granularity = card.dataset.value;
            });
        });
        container.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                modalData.period_days = parseInt(btn.dataset.days, 10);
            });
        });
    }

    // ─── Étape 4 : Paramètres ───────────────────────────

    function renderStepParams(container) {
        container.innerHTML = `
            <div class="modal-step-content">
                <div class="modal-step-toolbar">
                    <input type="text" id="modalSearchParam" class="search-input" placeholder="🔍 Rechercher un paramètre...">
                    <div class="toolbar-actions">
                        <button class="btn-link" id="modalSelectAllPr">Tout sélectionner</button>
                        <button class="btn-link" id="modalDeselectAllPr">Tout désélectionner</button>
                    </div>
                    <span class="selection-badge" id="modalPrCount">${modalData.params.length} sélectionné(s)</span>
                </div>
                <div class="modal-list-container" id="modalPrList">
                    <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement des paramètres...</div>
                </div>
            </div>`;

        if (Object.keys(modalParamsCache).length > 0 && modalParamsCache._stype === modalData.station_type) {
            renderModalParams();
        } else {
            ApiClient.getParameters(modalData.station_type)
                .then(res => {
                    modalParamsCache = res.data || {};
                    modalParamsCache._stype = modalData.station_type;
                    renderModalParams();
                })
                .catch(err => {
                    const el = document.getElementById('modalPrList');
                    if (el) el.innerHTML = `<p class="error-msg">Erreur : ${err.message}</p>`;
                });
        }

        document.getElementById('modalSearchParam').addEventListener('input', renderModalParams);
        document.getElementById('modalSelectAllPr').addEventListener('click', () => {
            modalData.params = [];
            Object.values(modalParamsCache).forEach(cat => {
                if (cat && cat.params) cat.params.forEach(p => modalData.params.push(p.id));
            });
            renderModalParams();
        });
        document.getElementById('modalDeselectAllPr').addEventListener('click', () => {
            modalData.params = [];
            renderModalParams();
        });
    }

    function renderModalParams() {
        const search = (document.getElementById('modalSearchParam')?.value || '').toLowerCase().trim();
        const listEl = document.getElementById('modalPrList');
        if (!listEl) return;

        let html = '';
        Object.entries(modalParamsCache).forEach(([catKey, cat]) => {
            if (catKey.startsWith('_') || !cat || !cat.params) return;
            const filteredP = cat.params.filter(p =>
                !search || p.id.toLowerCase().includes(search) || p.label.toLowerCase().includes(search)
            );
            if (filteredP.length === 0) return;

            html += `<div class="modal-param-category">
                <div class="param-cat-header">${cat.label}</div>
                <div class="param-cat-items">
                    ${filteredP.map(p => {
                        const checked = modalData.params.includes(p.id);
                        return `
                            <div class="modal-list-item compact ${checked ? 'selected' : ''}" data-id="${p.id}">
                                <input type="checkbox" ${checked ? 'checked' : ''}>
                                <span class="param-id">${p.id}</span>
                                <span class="param-label">${p.label}</span>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
        });

        listEl.innerHTML = html || '<p class="empty-msg">Aucun paramètre trouvé</p>';

        listEl.querySelectorAll('.modal-list-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                toggleModalItem(el.dataset.id, modalData.params, 'modalPrList', 'modalPrCount', 'sélectionné(s)');
            });
            el.querySelector('input')?.addEventListener('change', () => {
                toggleModalItem(el.dataset.id, modalData.params, 'modalPrList', 'modalPrCount', 'sélectionné(s)');
            });
        });

        const countEl = document.getElementById('modalPrCount');
        if (countEl) countEl.textContent = `${modalData.params.length} sélectionné(s)`;
    }

    // ─── Étape 5 : Planification + Récap ────────────────

    function renderStepSchedule(container) {
        const stNames = modalStationsCache
            .filter(s => modalData.stations.includes(s.id))
            .map(s => s.label);
        const stText = stNames.length <= 3
            ? stNames.join(', ')
            : `${stNames.slice(0, 3).join(', ')} +${stNames.length - 3} autre(s)`;

        const prText = modalData.params.length <= 5
            ? modalData.params.join(', ')
            : `${modalData.params.slice(0, 5).join(', ')} +${modalData.params.length - 5}`;

        container.innerHTML = `
            <div class="modal-step-content">
                <div class="form-group">
                    <label class="form-label"><i class="fas fa-clock"></i> Heure d'exécution quotidienne (GMT)</label>
                    <div class="time-picker-group">
                        <input type="number" id="taskHourInput" min="0" max="23" value="${modalData.hour}" class="time-input">
                        <span class="time-sep">:</span>
                        <input type="number" id="taskMinuteInput" min="0" max="59" value="${String(modalData.minute).padStart(2,'0')}" step="5" class="time-input">
                        <span class="time-tz">GMT</span>
                    </div>
                    <small class="form-hint">La tâche s'exécutera chaque jour à cette heure</small>
                </div>
                <div class="task-recap-card">
                    <h4><i class="fas fa-list-check"></i> Récapitulatif</h4>
                    <div class="recap-grid">
                        <div class="recap-row"><span class="recap-label">Nom</span><span class="recap-value">${_esc(modalData.name)}</span></div>
                        <div class="recap-row"><span class="recap-label">Réseau</span><span class="recap-value">${modalData.station_type === 'pulsonic' ? '📡 Pulsonic' : '🔧 Campbell'}</span></div>
                        <div class="recap-row"><span class="recap-label">Stations</span><span class="recap-value">${modalData.stations.length} — ${_esc(stText)}</span></div>
                        <div class="recap-row"><span class="recap-label">Granularité</span><span class="recap-value">${GRAN_LABELS[modalData.granularity] || modalData.granularity}</span></div>
                        <div class="recap-row"><span class="recap-label">Période</span><span class="recap-value">${modalData.period_days} jour(s) précédent(s)</span></div>
                        <div class="recap-row"><span class="recap-label">Paramètres</span><span class="recap-value">${modalData.params.length} — ${_esc(prText)}</span></div>
                    </div>
                </div>
            </div>`;

        document.getElementById('taskHourInput').addEventListener('change', e => { modalData.hour = parseInt(e.target.value, 10) || 0; });
        document.getElementById('taskMinuteInput').addEventListener('change', e => { modalData.minute = parseInt(e.target.value, 10) || 0; });
    }

    // ─── Soumission ─────────────────────────────────────

    function submitTask() {
        const hEl = document.getElementById('taskHourInput');
        const mEl = document.getElementById('taskMinuteInput');
        if (hEl) modalData.hour = parseInt(hEl.value, 10) || 0;
        if (mEl) modalData.minute = parseInt(mEl.value, 10) || 0;

        const nextBtn = document.getElementById('modalNextBtn');
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> En cours...';

        const payload = { ...modalData };
        const promise = editingTaskId
            ? ApiClient.updateSchedulerTask(editingTaskId, payload)
            : ApiClient.createSchedulerTask(payload);

        promise
            .then(res => {
                showToast(res.message, 'success');
                closeTaskModal();
                loadTasks();
            })
            .catch(err => { showToast('Erreur : ' + err.message, 'error'); })
            .finally(() => { nextBtn.disabled = false; renderModalStep(); });
    }

});
