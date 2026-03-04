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
from webservice import WebServiceError
from utils import generate_csv_from_data
from scheduler import MeteoScheduler

# Import des providers
from providers.base_provider import BaseStationProvider
from providers.pulsonic_provider import PulsonicProvider
from providers.campbell_provider import CampbellProvider

def parse_flexible_date(date_str, end_of_day=False):
    """
    Parse une date en format flexible:
    - 'YYYY-MM-DD HH:MM' → datetime avec heure
    - 'YYYY-MM-DD'       → datetime à 00:00 (ou 23:59 si end_of_day=True)
    """
    date_str = date_str.strip()
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(date_str, fmt)
            # Si format sans heure et end_of_day, mettre à 23:59
            if fmt == '%Y-%m-%d' and end_of_day:
                dt = dt.replace(hour=23, minute=59)
            return dt
        except ValueError:
            continue
    raise ValueError(f"Format de date non reconnu: {date_str}")


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

# Registry des providers par type de station
PROVIDERS = {
    "pulsonic": PulsonicProvider(),
    "campbell": CampbellProvider()
}

# Planificateur de téléchargement automatique
# En mode debug, Flask lance 2 process : on ne crée le scheduler que dans l'enfant
import os as _os
if _os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
    scheduler = MeteoScheduler(PROVIDERS)
else:
    scheduler = None


def get_provider(station_type: str) -> BaseStationProvider:
    """
    Récupère le provider approprié selon le type de station.
    
    Args:
        station_type: Type de station ('pulsonic', 'campbell', etc.)
        
    Returns:
        BaseStationProvider: Instance du provider
        
    Raises:
        ValueError: Si le type de station est inconnu
    """
    if not station_type:
        # Valeur par défaut pour compatibilité
        station_type = "pulsonic"
    
    provider = PROVIDERS.get(station_type.lower())
    if not provider:
        raise ValueError(f"Type de station inconnu: {station_type}")
    
    return provider


# ============================================
# ROUTES API
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Vérification de l'état de l'API"""
    try:
        # Test de connexion avec le provider par défaut (Pulsonic)
        provider = get_provider("pulsonic")
        
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.now().isoformat(),
            'providers': list(PROVIDERS.keys())
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500


@app.route('/api/station-types', methods=['GET'])
def get_station_types():
    """Retourne la liste des types de stations disponibles"""
    try:
        types = []
        for station_type, provider in PROVIDERS.items():
            types.append({
                'id': station_type,
                'label': station_type.capitalize(),
                'icon': '📡' if station_type == 'pulsonic' else '🔧'
            })
        
        return jsonify({
            'status': 'success',
            'data': types
        })
    except Exception as e:
        logger.error(f"Erreur get_station_types: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/parameters', methods=['GET'])
def get_parameters():
    """Retourne la liste des paramètres disponibles selon le type de station"""
    try:
        station_type = request.args.get('station_type', 'pulsonic')
        provider = get_provider(station_type)
        parameters = provider.get_parameters()
        
        return jsonify({
            'status': 'success',
            'data': parameters
        })
    except ValueError as e:
        logger.error(f"Type de station invalide: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Erreur get_parameters: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/stations', methods=['GET'])
def get_stations():
    """Retourne la liste des stations selon le type"""
    try:
        station_type = request.args.get('station_type', 'pulsonic')
        provider = get_provider(station_type)
        stations = provider.get_stations()
        
        return jsonify({
            'status': 'success',
            'data': {
                'stations': stations,
                'station_type': station_type
            }
        })
    except ValueError as e:
        logger.error(f"Type de station invalide: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400
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
        "station_type": "pulsonic",
        "stations": ["CI_BINGERVILLE", "CI_ABOBO-MAIRIE"],
        "granularity": "H"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'stations' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Paramètre "stations" requis'
            }), 400
        
        station_type = data.get('station_type', 'pulsonic')
        stations = data['stations']
        granularity = data.get('granularity', 'H')
        
        if not isinstance(stations, list) or len(stations) == 0:
            return jsonify({
                'status': 'error',
                'message': 'Le paramètre "stations" doit être une liste non vide'
            }), 400
        
        # Utiliser le provider approprié
        provider = get_provider(station_type)
        result = provider.get_availability(stations, granularity)
        
        return jsonify({
            'status': 'success',
            'data': result
        })
        
    except ValueError as e:
        logger.error(f"Type de station invalide: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400
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
        "station_type": "pulsonic",
        "stations": ["CI_BINGERVILLE"],
        "params": ["Temp._inst", "Cum._pluie"],
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "granularity": "H"
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
        
        station_type = data.get('station_type', 'pulsonic')
        start_date = parse_flexible_date(data['start_date'])
        end_date = parse_flexible_date(data['end_date'], end_of_day=True)
        granularity = data.get('granularity', 'H')
        
        # Utiliser le provider approprié
        provider = get_provider(station_type)
        estimate = provider.estimate_download(
            data['stations'],
            data['params'],
            start_date,
            end_date,
            granularity
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
        "station_type": "pulsonic",
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
        
        station_type = data.get('station_type', 'pulsonic')
        stations = data['stations']
        params = data['params']
        granularity = data.get('granularity', 'H')
        
        # Validation des dates
        start_date = parse_flexible_date(data['start_date'])
        end_date = parse_flexible_date(data['end_date'], end_of_day=True)
        
        if start_date > end_date:
            return jsonify({
                'status': 'error',
                'message': 'La date de début doit être avant la date de fin'
            }), 400
        
        logger.info(f"Téléchargement {station_type}: {len(stations)} station(s), {len(params)} param(s), {start_date} à {end_date}")
        
        # Utiliser le provider approprié
        provider = get_provider(station_type)
        data_by_station = provider.download_data(
            stations,
            params,
            start_date,
            end_date,
            granularity
        )
        
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
        filename = f"meteo_{station_type}_{stations_str}_{start_date.strftime('%Y%m%d')}-{end_date.strftime('%Y%m%d')}.csv"
        
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
        provider = get_provider('pulsonic')
        stations = provider.get_stations()
        
        return jsonify({
            'status': 'success',
            'message': 'Connexion réussie',
            'stations_count': len(stations)
        })
    except Exception as e:
        logger.error(f"Test connexion échoué: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


# ============================================
# ROUTES SCHEDULER (multi-tâches)
# ============================================

@app.route('/api/scheduler/tasks', methods=['GET'])
def scheduler_list_tasks():
    """Liste toutes les tâches planifiées avec résumé."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        return jsonify({'status': 'success', 'data': scheduler.get_all_tasks()})
    except Exception as e:
        logger.error(f"Erreur scheduler_list: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/scheduler/tasks', methods=['POST'])
def scheduler_create_task():
    """Crée une nouvelle tâche planifiée."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        body = request.get_json() or {}
        if not body.get('name'):
            return jsonify({'status': 'error', 'message': 'Le nom de la tâche est requis'}), 400
        if not body.get('stations'):
            return jsonify({'status': 'error', 'message': 'Sélectionnez au moins une station'}), 400
        if not body.get('params'):
            return jsonify({'status': 'error', 'message': 'Sélectionnez au moins un paramètre'}), 400
        task = scheduler.create_task(body)
        return jsonify({
            'status': 'success',
            'data': scheduler.get_task(task['id']),
            'message': f"Tâche « {task['name']} » créée avec succès"
        })
    except Exception as e:
        logger.error(f"Erreur scheduler_create: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/scheduler/tasks/<task_id>', methods=['PUT'])
def scheduler_update_task(task_id):
    """Met à jour une tâche existante."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        body = request.get_json() or {}
        task = scheduler.update_task(task_id, body)
        if not task:
            return jsonify({'status': 'error', 'message': 'Tâche introuvable'}), 404
        return jsonify({
            'status': 'success',
            'data': scheduler.get_task(task_id),
            'message': f"Tâche « {task['name']} » mise à jour"
        })
    except Exception as e:
        logger.error(f"Erreur scheduler_update: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/scheduler/tasks/<task_id>', methods=['DELETE'])
def scheduler_delete_task(task_id):
    """Supprime une tâche planifiée."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        ok = scheduler.delete_task(task_id)
        if not ok:
            return jsonify({'status': 'error', 'message': 'Tâche introuvable'}), 404
        return jsonify({'status': 'success', 'message': 'Tâche supprimée'})
    except Exception as e:
        logger.error(f"Erreur scheduler_delete: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/scheduler/tasks/<task_id>/toggle', methods=['POST'])
def scheduler_toggle_task(task_id):
    """Active ou désactive une tâche."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        body = request.get_json() or {}
        active = body.get('active', True)
        task = scheduler.toggle_task(task_id, active)
        if not task:
            return jsonify({'status': 'error', 'message': 'Tâche introuvable'}), 404
        state = 'activée' if active else 'désactivée'
        enriched = scheduler.get_task(task_id)
        msg = f"Tâche « {task['name']} » {state}"
        if active and enriched.get('next_run_display'):
            msg += f" — prochain : {enriched['next_run_display']}"
        return jsonify({'status': 'success', 'data': enriched, 'message': msg})
    except Exception as e:
        logger.error(f"Erreur scheduler_toggle: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/scheduler/tasks/<task_id>/run-now', methods=['POST'])
def scheduler_run_task_now(task_id):
    """Exécute une tâche immédiatement."""
    try:
        if scheduler is None:
            return jsonify({'status': 'error', 'message': 'Scheduler non initialisé'}), 503
        msg = scheduler.run_task_now(task_id)
        if not msg:
            return jsonify({'status': 'error', 'message': 'Tâche introuvable'}), 404
        return jsonify({'status': 'success', 'message': msg})
    except Exception as e:
        logger.error(f"Erreur scheduler_run_now: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


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
