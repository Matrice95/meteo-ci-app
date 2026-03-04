// frontend/js/api.js

// À adapter si ton backend n'est pas sur localhost:5000
const API_BASE_URL = "http://localhost:5000";

const ApiClient = (function () {
    async function getJSON(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        return response.json();
    }

    async function postJSON(url, body) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        return response;
    }

    return {
        async health() {
            return getJSON(`${API_BASE_URL}/api/health`);
        },

        async getParameters(stationType = 'pulsonic') {
            const url = new URL(`${API_BASE_URL}/api/parameters`);
            url.searchParams.set('station_type', stationType);
            return getJSON(url.toString());
        },

        async getStations(stationType = 'pulsonic') {
            const url = new URL(`${API_BASE_URL}/api/stations`);
            url.searchParams.set('station_type', stationType);
            return getJSON(url.toString());
        },

        async getAvailability(stations, granularity, stationType = 'pulsonic') {
            const body = { stations, granularity, station_type: stationType };
            const res = await postJSON(`${API_BASE_URL}/api/stations/availability`, body);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur disponibilité stations");
            }
            return res.json();
        },

        async estimateDownload(stations, params, startDate, endDate, granularity, stationType = 'pulsonic') {
            const body = { 
                stations, 
                params, 
                start_date: startDate, 
                end_date: endDate, 
                granularity,
                station_type: stationType
            };
            const res = await postJSON(`${API_BASE_URL}/api/estimate`, body);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur estimation");
            }
            return res.json();
        },

        async downloadData(stations, params, startDate, endDate, granularity, stationType = 'pulsonic') {
            const body = { 
                stations, 
                params, 
                start_date: startDate, 
                end_date: endDate, 
                granularity,
                station_type: stationType
            };
            const response = await fetch(`${API_BASE_URL}/api/download`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text();
                let message = "Erreur lors du téléchargement";
                try {
                    const errJson = JSON.parse(errText);
                    message = errJson.message || message;
                } catch (e) {
                    // texte brut
                }
                throw new Error(message);
            }

            const blob = await response.blob();
            return blob;
        },

        // ---- Scheduler multi-tâches ----
        async getSchedulerTasks() {
            return getJSON(`${API_BASE_URL}/api/scheduler/tasks`);
        },

        async createSchedulerTask(taskData) {
            const res = await postJSON(`${API_BASE_URL}/api/scheduler/tasks`, taskData);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur création tâche");
            }
            return res.json();
        },

        async updateSchedulerTask(taskId, taskData) {
            const res = await fetch(`${API_BASE_URL}/api/scheduler/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur modification tâche");
            }
            return res.json();
        },

        async deleteSchedulerTask(taskId) {
            const res = await fetch(`${API_BASE_URL}/api/scheduler/tasks/${taskId}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur suppression tâche");
            }
            return res.json();
        },

        async toggleSchedulerTask(taskId, active) {
            const res = await postJSON(`${API_BASE_URL}/api/scheduler/tasks/${taskId}/toggle`, { active });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur basculement tâche");
            }
            return res.json();
        },

        async runSchedulerTaskNow(taskId) {
            const res = await postJSON(`${API_BASE_URL}/api/scheduler/tasks/${taskId}/run-now`, {});
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur lancement immédiat");
            }
            return res.json();
        }
    };
})();
