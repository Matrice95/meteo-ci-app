# -*- coding: utf-8 -*-
"""
API Flask pour l'application Météo CI
"""
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime, timedelta
import logging
import traceback
import io

from config import Config
from webservice import MeteoVisionClient, WebServiceError
from utils import (
    estimate_data_volume,
    generate_csv_from_data,
    split_date_range,
    validate_date_range,
    format_duration
)

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('../logs/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialisation Flask
app = Flask(__name__)
app.config.from_object(Config)
CORS(app, origins=Config.CORS_ORIGINS)

# Instance globale du client WebService (réutilisable)
ws_client = None


def get_ws_client():
    """Récupère ou crée une instance du client WebService"""
    global ws_client
    
    if ws_client is None or not ws_client.connected:
        try:
            ws_client = MeteoVisionClient(
                Config.WSDL_URL,
                Config.WS_LOGIN,
                Config.WS_PASSWORD,
                Config.WS_ID
            )
            ws_client.connect()
        except WebServiceError as e:
            logger.error(f"Tentative URL backup: {Config.WSDL_URL_BACKUP}")
            # Essayer l'URL de backup
            ws_client = MeteoVisionClient(
                Config.WSDL_URL_BACKUP,
                Config.WS_LOGIN,
                Config.WS_PASSWORD,
                Config.WS_ID
            )
            ws_client.connect()
    
    return ws_client


# ============================================
# ROUTES API
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Vérification de l'état de l'API"""
    try:
        client = get_ws_client()
        version = client.get_version()
        
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.now().isoformat(),
            'webservice_version': version,
            'webservice_connected': client.connected
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500


@app.route('/api/parameters', methods=['GET'])
def get_parameters():
    """Retourne la liste des paramètres disponibles organisés par catégorie"""
    return jsonify({
        'status': 'success',
        'data': Config.PARAMETERS
    })


@app.route('/api/stations', methods=['GET'])
def get_stations():
    """Retourne la liste des stations avec leurs métadonnées"""
    try:
        # Charger depuis le fichier JSON
        import json
        with open('../data/stations.json', 'r', encoding='utf-8') as f:
            stations = json.load(f)
        
        return jsonify({
            'status': 'success',
            'data': stations
        })
    except FileNotFoundError:
        logger.error("Fichier stations.json non trouvé")
        return jsonify({
            'status': 'error',
            'message': 'Fichier stations.json non trouvé'
        }), 500
    except Exception as e:
        logger.error(f"Erreur get_stations: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/stations/availability', methods=['POST'])
def get_stations_availability():
    """
    Récupère la disponibilité des données pour les stations sélectionnées
    
    Body JSON:
    {
        "stations": ["CI_BINGERVILLE", "CI_ABOBO-MAIRIE"],
        "granularity": "H"
    }
    
    Response:
    {
        "status": "success",
        "data": {
            "CI_BINGERVILLE": {
                "first_date": "2018-03-15T00:00:00",
                "last_date": "2026-02-13T11:00:00",
                "days_count": 2891,
                "duration_formatted": "7 ans 11 mois",
                "label": "BINGERVILLE",
                "has_data": true
            },
            ...
        }
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'stations' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Paramètre "stations" requis'
            }), 400
        
        stations = data['stations']
        granularity = data.get('granularity', 'H')
        
        if not isinstance(stations, list) or len(stations) == 0:
            return jsonify({
                'status': 'error',
                'message': 'Le paramètre "stations" doit être une liste non vide'
            }), 400
        
        # Connexion au WebService
        client = get_ws_client()
        
        result = {}
        now = datetime.now()
        
        for station in stations:
            try:
                logger.info(f"Récupération disponibilité pour {station}")
                
                # Récupérer la première date
                first_date = client.get_first_recorded_date(station, granularity)
                
                # Calculer la durée
                days_count = (now - first_date).days
                
                result[station] = {
                    'first_date': first_date.isoformat(),
                    'last_date': now.isoformat(),
                    'days_count': days_count,
                    'duration_formatted': format_duration(days_count),
                    'label': station.replace('CI_', ''),
                    'has_data': True,
                    'granularity': granularity
                }
                
            except WebServiceError as e:
                logger.warning(f"Erreur pour {station}: {str(e)}")
                result[station] = {
                    'has_data': False,
                    'error': str(e),
                    'label': station.replace('CI_', '')
                }
            except Exception as e:
                logger.error(f"Erreur inattendue pour {station}: {str(e)}")
                result[station] = {
                    'has_data': False,
                    'error': 'Erreur interne',
                    'label': station.replace('CI_', '')
                }
        
        return jsonify({
            'status': 'success',
            'data': result
        })
        
    except Exception as e:
        logger.error(f"Erreur get_stations_availability: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/estimate', methods=['POST'])
def estimate_download():
    """
    Estime le volume de données à télécharger
    
    Body JSON:
    {
        "stations": ["CI_BINGERVILLE"],
        "params": ["Temp._inst", "Cum._pluie"],
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "granularity": "H"
    }
    
    Response:
    {
        "status": "success",
        "data": {
            "rows": 8760,
            "size_kb": 450,
            "size_mb": 0.44
        }
    }
    """
    try:
        data = request.get_json()
        
        # Validation
        required = ['stations', 'params', 'start_date', 'end_date']
        for field in required:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'Paramètre "{field}" requis'
                }), 400
        
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d')
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d')
        granularity = data.get('granularity', 'H')
        
        num_stations = len(data['stations'])
        num_params = len(data['params'])
        
        # Estimation
        estimate = estimate_data_volume(
            start_date,
            end_date,
            granularity,
            num_stations,
            num_params
        )
        
        return jsonify({
            'status': 'success',
            'data': estimate
        })
        
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': f'Format de date invalide: {str(e)}'
        }), 400
    except Exception as e:
        logger.error(f"Erreur estimate_download: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/download', methods=['POST'])
def download_data():
    """
    Génère et télécharge un fichier CSV avec les données
    
    Body JSON:
    {
        "stations": ["CI_BINGERVILLE", "CI_ABOBO-MAIRIE"],
        "params": ["Temp._inst", "Cum._pluie"],
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "granularity": "H"
    }
    
    Response: Fichier CSV en téléchargement
    """
    try:
        data = request.get_json()
        
        # Validation des paramètres
        required = ['stations', 'params', 'start_date', 'end_date']
        for field in required:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'Paramètre "{field}" requis'
                }), 400
        
        stations = data['stations']
        params = data['params']
        granularity = data.get('granularity', 'H')
        
        # Validation des dates
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d')
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d')
        
        if start_date >= end_date:
            return jsonify({
                'status': 'error',
                'message': 'La date de début doit être avant la date de fin'
            }), 400
        
        logger.info(f"Téléchargement demandé: {len(stations)} station(s), {len(params)} param(s), {start_date} à {end_date}")
        
        # Connexion WebService
        client = get_ws_client()
        
        # Limite de jours par requête selon granularité
        max_days = Config.GRANULARITY_LIMITS.get(granularity, 180)
        
        # Stocker les données par station
        data_by_station = {}
        
        # Récupérer les données pour chaque station
        for station in stations:
            logger.info(f"Traitement de {station}")
            data_by_station[station] = []
            
            # Diviser la période en blocs
            date_blocks = split_date_range(start_date, end_date, max_days)
            
            for block_start, block_end in date_blocks:
                try:
                    logger.info(f"{station}: récupération {block_start} à {block_end}")
                    
                    block_data = client.get_block_sorted_value(
                        station,
                        params,
                        granularity,
                        block_start,
                        block_end
                    )
                    
                    data_by_station[station].extend(block_data)
                    logger.info(f"{station}: {len(block_data)} lignes récupérées")
                    
                except WebServiceError as e:
                    logger.warning(f"Erreur bloc {station} ({block_start}-{block_end}): {str(e)}")
                    continue
        
        # Vérifier si on a des données
        total_rows = sum(len(data_by_station[s]) for s in data_by_station)
        
        if total_rows == 0:
            return jsonify({
                'status': 'error',
                'message': 'Aucune donnée disponible pour la période sélectionnée'
            }), 404
        
        logger.info(f"Total de {total_rows} lignes à exporter")
        
        # Générer le CSV
        csv_buffer = generate_csv_from_data(
            data_by_station,
            params,
            Config.DEFAULT_VALUE
        )
        
        # Nom du fichier
        stations_str = '-'.join([s.replace('CI_', '') for s in stations])
        filename = f"meteo_{stations_str}_{start_date.strftime('%Y%m%d')}-{end_date.strftime('%Y%m%d')}.csv"
        
        # Convertir en bytes
        csv_bytes = io.BytesIO(csv_buffer.getvalue().encode('utf-8'))
        
        logger.info(f"Fichier généré: {filename} ({total_rows} lignes)")
        
        return send_file(
            csv_bytes,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
        
    except ValueError as e:
        logger.error(f"Erreur validation: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erreur de validation: {str(e)}'
        }), 400
    except WebServiceError as e:
        logger.error(f"Erreur WebService: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erreur WebService: {str(e)}'
        }), 500
    except Exception as e:
        logger.error(f"Erreur download_data: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': 'Erreur interne du serveur'
        }), 500


@app.route('/api/test-connection', methods=['GET'])
def test_connection():
    """Test la connexion au WebService"""
    try:
        client = get_ws_client()
        version = client.get_version()
        
        return jsonify({
            'status': 'success',
            'message': 'Connexion réussie',
            'version': version,
            'url': client.wsdl_url
        })
    except Exception as e:
        logger.error(f"Test connexion échoué: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


# ============================================
# GESTION DES ERREURS
# ============================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'status': 'error',
        'message': 'Route non trouvée'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Erreur 500: {str(error)}")
    return jsonify({
        'status': 'error',
        'message': 'Erreur interne du serveur'
    }), 500


# ============================================
# POINT D'ENTRÉE
# ============================================

if __name__ == '__main__':
    logger.info("Démarrage de l'application Flask")
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
