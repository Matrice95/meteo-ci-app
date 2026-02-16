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

        async getParameters() {
            return getJSON(`${API_BASE_URL}/api/parameters`);
        },

        async getStations() {
            return getJSON(`${API_BASE_URL}/api/stations`);
        },

        async getAvailability(stations, granularity) {
            const body = { stations, granularity };
            const res = await postJSON(`${API_BASE_URL}/api/stations/availability`, body);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur disponibilité stations");
            }
            return res.json();
        },

        async estimateDownload(stations, params, startDate, endDate, granularity) {
            const body = { stations, params, start_date: startDate, end_date: endDate, granularity };
            const res = await postJSON(`${API_BASE_URL}/api/estimate`, body);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Erreur estimation");
            }
            return res.json();
        },

        async downloadData(stations, params, startDate, endDate, granularity) {
            const body = { stations, params, start_date: startDate, end_date: endDate, granularity };
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
        }
    };
})();
