# -*- coding: utf-8 -*-
"""
Provider pour les stations Pulsonic (via WebService SOAP)
"""
from datetime import datetime, timedelta
from .base_provider import BaseStationProvider
from config import Config
from webservice import MeteoVisionClient, WebServiceError
from utils import estimate_data_volume, split_date_range, format_duration

import json
import os
import logging

logger = logging.getLogger(__name__)


class PulsonicProvider(BaseStationProvider):
    """Provider pour les stations de type Pulsonic"""
    
    def __init__(self):
        self.client = None
        self._stations = []
        self._load_stations()
    
    def _connect(self):
        """Établit la connexion au WebService si nécessaire"""
        if self.client is None or not self.client.connected:
            self.client = MeteoVisionClient(
                Config.WSDL_URL,
                Config.WS_LOGIN,
                Config.WS_PASSWORD,
                Config.WS_ID
            )
            self.client.connect()
    
    def _load_stations(self):
        """Charge la liste des stations Pulsonic depuis stations.json"""
        stations_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "data",
            "stations.json"
        )
        try:
            with open(stations_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Filtrer uniquement les stations Pulsonic
                self._stations = [
                    s for s in data.get("stations", [])
                    if s.get("family") == "pulsonic" or "family" not in s
                ]
        except Exception as e:
            logger.error(f"Erreur chargement stations Pulsonic: {str(e)}")
            self._stations = []
    
    def get_stations(self):
        """Retourne la liste des stations Pulsonic"""
        return self._stations
    
    def get_parameters(self):
        """Retourne les paramètres disponibles pour Pulsonic"""
        return Config.PARAMETERS
    
    def get_availability(self, stations, granularity):
        """Vérifie la disponibilité des données pour les stations Pulsonic"""
        self._connect()
        now = datetime.now()
        result = {}
        
        for station in stations:
            try:
                logger.info(f"Vérification disponibilité Pulsonic: {station}")
                first_date = self.client.get_first_recorded_date(station, granularity)
                days_count = (now - first_date).days
                
                # Trouver le label de la station
                station_obj = next((s for s in self._stations if s['id'] == station), None)
                label = station_obj['label'] if station_obj else station
                
                result[station] = {
                    "has_data": True,
                    "first_date": first_date.isoformat(),
                    "last_date": now.isoformat(),
                    "days_count": days_count,
                    "duration_formatted": format_duration(days_count),
                    "label": label
                }
            except WebServiceError as e:
                logger.warning(f"Station {station}: {str(e)}")
                result[station] = {
                    "has_data": False,
                    "error": str(e),
                    "label": station.replace("CI_", "")
                }
        
        return result
    
    def estimate_download(self, stations, params, start_date, end_date, granularity):
        """Estime le volume de données Pulsonic"""
        return estimate_data_volume(
            start_date,
            end_date,
            granularity,
            len(stations),
            len(params)
        )
    
    def download_data(self, stations, params, start_date, end_date, granularity):
        """Télécharge les données des stations Pulsonic"""
        self._connect()
        
        max_days = Config.GRANULARITY_LIMITS.get(granularity, 180)
        data_by_station = {}
        
        for station in stations:
            logger.info(f"Traitement Pulsonic: {station}")
            station_points = []
            
            # Diviser la période en blocs
            date_blocks = split_date_range(start_date, end_date, max_days)
            
            for block_start, block_end in date_blocks:
                try:
                    logger.info(f"{station}: récupération {block_start} à {block_end}")
                    
                    block_data = self.client.get_block_sorted_value(
                        station,
                        params,
                        granularity,
                        block_start,
                        block_end
                    )
                    
                    station_points.extend(block_data)
                    logger.info(f"{station}: {len(block_data)} lignes récupérées")
                    
                except WebServiceError as e:
                    logger.warning(f"Erreur bloc {station} ({block_start}-{block_end}): {str(e)}")
                    continue
            
            data_by_station[station] = station_points
        
        return data_by_station
