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
    initConnectionStatus();
    initDatePickers();
    loadStationsAndInitMap();
    loadParameters();
    initEventListeners();

    // ---------------------------
    // Fonctions d'initialisation
    // ---------------------------

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
            dateFormat: "Y-m-d",
            maxDate: "today",
            onChange: () => onDatesChanged()
        });

        flatpickrEnd = flatpickr(endDateEl, {
            dateFormat: "Y-m-d",
            maxDate: "today",
            onChange: () => onDatesChanged()
        });
    }

    function loadStationsAndInitMap() {
        ApiClient.getStations()
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
        ApiClient.getParameters()
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

        ApiClient.getAvailability(selectedStationIds, granularity)
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

        // Utiliser la dernière date commune approximative = aujourd'hui
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days + 1);

        flatpickrStart.setDate(start, true);
        flatpickrEnd.setDate(end, true);

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

        ApiClient.estimateDownload(selectedStationIds, selectedParams, startDate, endDate, granularity)
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
                granularity
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
        return `meteo_${stationPart}_${startDate.replace(/-/g, "")}-${endDate.replace(/-/g, "")}.csv`;
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
});
