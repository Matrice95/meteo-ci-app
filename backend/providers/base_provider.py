# -*- coding: utf-8 -*-
"""
Interface de base pour tous les providers de stations
"""
from abc import ABC, abstractmethod
from datetime import datetime


class BaseStationProvider(ABC):
    """Interface commune pour tous les types de stations"""

    @abstractmethod
    def get_stations(self):
        """
        Retourne la liste des stations de ce type.
        
        Returns:
            list: Liste de dictionnaires avec infos des stations
        """
        pass

    @abstractmethod
    def get_parameters(self):
        """
        Retourne les paramètres disponibles pour ce type de station.
        
        Returns:
            dict: Paramètres organisés par catégorie
        """
        pass

    @abstractmethod
    def get_availability(self, stations, granularity):
        """
        Retourne la disponibilité des données par station.
        
        Args:
            stations: Liste des IDs de stations
            granularity: Granularité des données (U, X, H, J, D)
            
        Returns:
            dict: {station_id: {first_date, last_date, days_count, ...}}
        """
        pass

    @abstractmethod
    def estimate_download(self, stations, params, start_date, end_date, granularity):
        """
        Estime le volume de données à télécharger.
        
        Returns:
            dict: {rows: int, size_kb: int, size_mb: float}
        """
        pass

    @abstractmethod
    def download_data(self, stations, params, start_date, end_date, granularity):
        """
        Télécharge les données pour les stations et paramètres demandés.
        
        Returns:
            dict: {station_id: [points]}
                  où point = {'timestamp': datetime, param1: val1, ...}
        """
        pass
