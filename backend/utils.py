# -*- coding: utf-8 -*-
"""
Fonctions utilitaires
"""
from datetime import datetime, timedelta
import csv
import io
import logging

logger = logging.getLogger(__name__)


def estimate_data_volume(start_date, end_date, granularity, num_stations, num_params):
    """
    Estime le volume de données à télécharger
    
    Returns:
        dict: {rows: int, size_kb: int, size_mb: float}
    """
    delta = end_date - start_date
    
    # Calculer le nombre de points selon la granularité
    if granularity == 'U':  # Minutes
        points_per_station = delta.total_seconds() / 60
    elif granularity == 'X':  # 6 minutes
        points_per_station = delta.total_seconds() / (6 * 60)
    elif granularity == 'H':  # Heures
        points_per_station = delta.days * 24 + delta.seconds / 3600
    elif granularity in ['J', 'D']:  # Jours
        points_per_station = delta.days
    else:
        points_per_station = delta.days * 24  # Par défaut horaire
    
    total_rows = int(points_per_station * num_stations)
    
    # Estimation: ~50 bytes par valeur + overhead
    bytes_per_row = 20 + (num_params * 10)  # timestamp + colonnes
    size_bytes = total_rows * bytes_per_row
    size_kb = size_bytes / 1024
    size_mb = size_kb / 1024
    
    return {
        'rows': total_rows,
        'size_kb': int(size_kb),
        'size_mb': round(size_mb, 2)
    }


def generate_csv_from_data(data_by_station, params, default_value="-99999"):
    """
    Génère un CSV en mémoire à partir des données
    
    Args:
        data_by_station: {station_id: [data_points], ...}
        params: Liste des paramètres
        default_value: Valeur par défaut pour données manquantes
        
    Returns:
        io.StringIO: Buffer contenant le CSV
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    header = ['Station', 'Date', 'Heure'] + params
    writer.writerow(header)
    
    # Trier les stations par ordre alphabétique pour une meilleure organisation
    sorted_stations = sorted(data_by_station.keys())
    
    # Données organisées par station
    for station_id in sorted_stations:
        data_points = data_by_station[station_id]
        station_label = station_id.replace('CI_', '')
        
        # Trier les données par timestamp pour chaque station
        sorted_points = sorted(data_points, key=lambda x: x['timestamp'])
        
        for point in sorted_points:
            row = [
                station_label,
                point['timestamp'].strftime('%Y-%m-%d'),
                point['timestamp'].strftime('%H:%M')
            ]
            
            # Ajouter les valeurs des paramètres
            for param in params:
                value = point.get(param)
                row.append(value if value is not None else default_value)
            
            writer.writerow(row)
    
    output.seek(0)
    return output


def split_date_range(start_date, end_date, max_days):
    """
    Divise une période en blocs de X jours maximum
    
    Returns:
        list: [(start1, end1), (start2, end2), ...]
    """
    blocks = []
    current_start = start_date
    
    while current_start < end_date:
        current_end = min(current_start + timedelta(days=max_days), end_date)
        blocks.append((current_start, current_end))
        current_start = current_end
    
    return blocks


def validate_date_range(start_date_str, end_date_str, first_available_date):
    """
    Valide une plage de dates
    
    Returns:
        tuple: (start_date, end_date, error_message)
    """
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        
        # Vérifications
        if start_date > end_date:
            return None, None, "La date de début doit être avant la date de fin"
        
        if start_date < first_available_date:
            return None, None, f"La date de début ne peut pas être avant {first_available_date.strftime('%Y-%m-%d')}"
        
        if end_date > datetime.now():
            return None, None, "La date de fin ne peut pas être dans le futur"
        
        return start_date, end_date, None
        
    except ValueError as e:
        return None, None, f"Format de date invalide: {str(e)}"


def format_duration(days):
    """
    Formate une durée en années/mois/jours
    
    Returns:
        str: "2 ans 3 mois" ou "45 jours"
    """
    if days < 30:
        return f"{days} jour{'s' if days > 1 else ''}"
    
    years = days // 365
    remaining_days = days % 365
    months = remaining_days // 30
    
    parts = []
    if years > 0:
        parts.append(f"{years} an{'s' if years > 1 else ''}")
    if months > 0:
        parts.append(f"{months} mois")
    
    return ' '.join(parts) if parts else f"{days} jours"
