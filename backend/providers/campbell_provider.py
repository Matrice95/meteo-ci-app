# -*- coding: utf-8 -*-
"""
Provider pour les stations Campbell (squelette à implémenter)
"""
from datetime import datetime
from .base_provider import BaseStationProvider
from utils import estimate_data_volume

import logging

logger = logging.getLogger(__name__)


class CampbellProvider(BaseStationProvider):
    """Provider pour les stations de type Campbell"""
    
    def __init__(self):
        # TODO: Initialiser la connexion Campbell (BD locale, API, fichiers, etc.)
        logger.info("Initialisation provider Campbell")
        self._stations = []
        self._parameters = {}
    
    def get_stations(self):
        """
        Retourne la liste des stations Campbell.
        
        TODO: Charger depuis une base de données locale, un autre JSON, ou une API Campbell
        """
        # Exemple de structure à retourner :
        return [
            {
                "id": "CAMPBELL_STATION_1",
                "name": "Station Campbell 1",
                "family": "campbell",
                "latitude": 5.3,
                "longitude": -4.0,
                "type": "urbaine"
            }
        ]
    
    def get_parameters(self):
        """
        Retourne les paramètres disponibles pour Campbell.
        
        TODO: Définir les paramètres spécifiques Campbell
        """
        # Exemple de structure (peut être différente de Pulsonic)
        return {
            "temperature": {
                "label": "🌡️ Température",
                "params": [
                    {"id": "Temp", "label": "Température air"},
                    {"id": "TempMin", "label": "Température minimale"},
                    {"id": "TempMax", "label": "Température maximale"}
                ]
            },
            "pluviometrie": {
                "label": "💧 Pluviométrie",
                "params": [
                    {"id": "Rain", "label": "Précipitation"},
                    {"id": "RainRate", "label": "Intensité pluie"}
                ]
            }
        }
    
    def get_availability(self, stations, granularity):
        """
        Vérifie la disponibilité des données Campbell.
        
        TODO: Implémenter la logique de vérification (requête BD, fichiers, etc.)
        """
        result = {}
        
        for station in stations:
            # TODO: Requête réelle pour obtenir first_date et last_date
            result[station] = {
                "has_data": False,
                "error": "Provider Campbell non implémenté",
                "label": station
            }
        
        return result
    
    def estimate_download(self, stations, params, start_date, end_date, granularity):
        """Estime le volume de données Campbell"""
        # Réutilisation de la fonction d'estimation générique
        return estimate_data_volume(
            start_date,
            end_date,
            granularity,
            len(stations),
            len(params)
        )
    
    def download_data(self, stations, params, start_date, end_date, granularity):
        """
        Télécharge les données des stations Campbell.
        
        TODO: Implémenter la récupération des données (BD, API, fichiers CSV, etc.)
        
        Returns:
            dict: {station_id: [points]}
                  Format standardisé : point = {'timestamp': datetime, param1: val1, ...}
        """
        data_by_station = {}
        
        for station in stations:
            logger.info(f"Traitement Campbell: {station}")
            # TODO: Logique de récupération spécifique Campbell
            # Exemple : requête SQL, lecture fichiers, appel API Campbell
            
            # Pour l'instant, retourne vide
            data_by_station[station] = []
        
        return data_by_station
