# -*- coding: utf-8 -*-
"""
Configuration de l'application
"""
import os
from datetime import timedelta

class Config:
    """Configuration principale"""
    
    # WebService SOAP
    WSDL_URL = "http://www.pulsoweb.eu/WEBSMETEOVISION_WEB/WebSMeteoVision.awws?wsdl"
    WSDL_URL_BACKUP = "http://sodexam.pulsoweb.eu/WEBSMETEOVISION_WEB/awws/WebSMeteoVision.awws?wsdl"
    
    WS_LOGIN = "WebS01510c"
    WS_PASSWORD = "7Aw2ITLoxd8"
    WS_ID = "01510"
    
    # Valeur par défaut pour données manquantes
    DEFAULT_VALUE = "-99999"
    
    # Limites de requêtes par granularité (en jours)
    GRANULARITY_LIMITS = {
        'U': 7,      # Minutes
        'X': 31,     # 6 minutes
        'H': 180,    # Heures
        'J': 365,    # Jours
        'D': 365     # Jours
    }
    
    # Format de date
    DATE_FORMAT_INPUT = "%Y%m%d%H%M"
    DATE_FORMAT_OUTPUT = "%Y/%m/%d %H:%M"
    
    # Paramètres disponibles organisés par catégorie
    PARAMETERS = {
        "temperature": {
            "label": "🌡️ Température",
            "params": [
                {"id": "Temp._inst", "label": "Température instantanée"},
                {"id": "Temp._mini", "label": "Température minimale"},
                {"id": "Temp._maxi", "label": "Température maximale"},
                {"id": "Td", "label": "Point de rosée"},
                {"id": "T-05_inst", "label": "Température sol -5cm"},
                {"id": "T-10_inst", "label": "Température sol -10cm"},
                {"id": "T-20_inst", "label": "Température sol -20cm"},
                {"id": "T-30_inst", "label": "Température sol -30cm"},
                {"id": "T-50_inst", "label": "Température sol -50cm"},
                {"id": "T-100_inst", "label": "Température sol -100cm"}
            ]
        },
        "humidity": {
            "label": "💧 Humidité",
            "params": [
                {"id": "Hum._inst", "label": "Humidité instantanée"},
                {"id": "Hum._mini", "label": "Humidité minimale"},
                {"id": "Hum._maxi", "label": "Humidité maximale"},
                {"id": "Hum_sol10cm", "label": "Humidité sol 10cm"},
                {"id": "Hum_sol20cm", "label": "Humidité sol 20cm"},
                {"id": "Hum_sol30cm", "label": "Humidité sol 30cm"},
                {"id": "Hum_sol40cm", "label": "Humidité sol 40cm"},
                {"id": "Hum_sol100c", "label": "Humidité sol 100cm"}
            ]
        },
        "precipitation": {
            "label": "🌧️ Précipitations",
            "params": [
                {"id": "Cum._pluie", "label": "Cumul de pluie"},
                {"id": "Rr3h", "label": "Pluie 3h"},
                {"id": "Rr6h", "label": "Pluie 6h"},
                {"id": "Rr12h", "label": "Pluie 12h"},
                {"id": "Rr24h", "label": "Pluie 24h"},
                {"id": "Pluie_maxi", "label": "Intensité maximale"}
            ]
        },
        "radiation": {
            "label": "☀️ Rayonnement",
            "params": [
                {"id": "Ray._total", "label": "Rayonnement solaire total"},
                {"id": "Dure_insol", "label": "Durée d'ensoleillement"}
            ]
        },
        "wind": {
            "label": "💨 Vent",
            "params": [
                {"id": "FF_moy", "label": "Vitesse moyenne"},
                {"id": "FF_maxi", "label": "Rafale maximale"},
                {"id": "Dir._maxi", "label": "Direction maximale"},
                {"id": "Vent_passe", "label": "Vent passé"}
            ]
        },
        "pressure": {
            "label": "🌀 Pression",
            "params": [
                {"id": "Pres._inst", "label": "Pression instantanée"},
                {"id": "Pmer", "label": "Pression réduite mer"},
                {"id": "Pnmer", "label": "Pression non réduite"},
                {"id": "Pxmer", "label": "Pression max mer"}
            ]
        }
    }
    
    # Flask
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max
    
    # CORS
    CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:5500", "http://localhost:8000", "http://127.0.0.1:8000"]
