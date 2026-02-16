// frontend/js/map.js

// Gestionnaire de carte (Leaflet)
const MapManager = (function () {
    let map = null;
    let markersLayer = null;
    let stationMarkers = {}; // {stationId: marker}

    // Icônes différentes pour urbain/rural
    const urbanIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        shadowSize: [41, 41]
    });

    const ruralIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        shadowSize: [41, 41],
        className: "marker-rural"
    });

    function initMap(stations) {
        if (map) {
            return;
        }

        // Centre approximatif de la Côte d'Ivoire
        map = L.map("map").setView([7.54, -5.55], 6);

        // Tuiles OpenStreetMap
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap contributors"
        }).addTo(map);

        markersLayer = L.layerGroup().addTo(map);

        addStations(stations);
    }

    function addStations(stations) {
        markersLayer.clearLayers();
        stationMarkers = {};

        stations.forEach((s) => {
            if (!s.coordinates || s.coordinates.length !== 2) return;

            const lat = s.coordinates[0];
            const lon = s.coordinates[1];

            const icon = s.type === "urbaine" ? urbanIcon : ruralIcon;

            const marker = L.marker([lat, lon], { icon })
                .bindPopup(`<strong>${s.label}</strong><br>${s.region || ""}`)
                .addTo(markersLayer);

            stationMarkers[s.id] = marker;
        });

        // Ajuster la vue si on a des stations
        const ids = Object.keys(stationMarkers);
        if (ids.length > 0) {
            const group = L.featureGroup(ids.map((id) => stationMarkers[id]));
            map.fitBounds(group.getBounds().pad(0.2));
        }
    }

    // Met en surbrillance les stations sélectionnées
    function highlightSelectedStations(selectedIds) {
        Object.entries(stationMarkers).forEach(([id, marker]) => {
            if (selectedIds.includes(id)) {
                marker.setOpacity(1.0);
            } else {
                marker.setOpacity(0.4);
            }
        });
    }

    // Centre la carte sur une station
    function focusOnStation(stationId) {
        const marker = stationMarkers[stationId];
        if (marker && map) {
            map.setView(marker.getLatLng(), 10);
            marker.openPopup();
        }
    }

    return {
        initMap,
        highlightSelectedStations,
        focusOnStation
    };
})();
