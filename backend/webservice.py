# -*- coding: utf-8 -*-
"""
Gestion des interactions avec le WebService SOAP MeteoVision
"""
import zeep
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET
import logging

logger = logging.getLogger(__name__)


class WebServiceError(Exception):
    """Exception personnalisée pour les erreurs WebService"""
    pass


class MeteoVisionClient:
    """Client pour interagir avec le WebService MeteoVision"""
    
    ERROR_MESSAGES = {
        -1: "Erreur de connexion/login",
        -2: "Argument inconnu",
        -4: "Station non trouvée",
        -5: "Pas de données disponibles",
        -15: "Aucune donnée disponible"
    }
    
    def __init__(self, wsdl_url, login, password, identifier):
        """
        Initialise le client WebService
        
        Args:
            wsdl_url: URL du WSDL
            login: Login d'authentification
            password: Mot de passe
            identifier: Identifiant client
        """
        self.wsdl_url = wsdl_url
        self.login = login
        self.password = password
        self.identifier = identifier
        self.client = None
        self.connected = False
        
    def connect(self):
        """Établit la connexion au WebService"""
        try:
            logger.info(f"Connexion au WebService: {self.wsdl_url}")
            self.client = zeep.Client(wsdl=self.wsdl_url)
            
            connection = self.client.service.OpenConnection(
                self.login, 
                self.password, 
                self.identifier
            )
            
            if connection.body.OpenConnectionResult in [True, "1", 1]:
                self.connected = True
                logger.info("Connexion WebService réussie")
                return True
            else:
                raise WebServiceError(
                    f"Échec de connexion. Statut: {connection.body.OpenConnectionResult}"
                )
                
        except Exception as e:
            logger.error(f"Erreur de connexion WebService: {str(e)}")
            raise WebServiceError(f"Impossible de se connecter: {str(e)}")
    
    def get_version(self):
        """Récupère la version du WebService"""
        if not self.connected:
            raise WebServiceError("Non connecté au WebService")
        
        try:
            version = self.client.service.GetVersion()
            version_str = str(version.body.GetVersionResult)
            
            if "Error:" in version_str:
                raise WebServiceError(f"Erreur version: {version_str}")
            
            return version_str
        except Exception as e:
            logger.error(f"Erreur GetVersion: {str(e)}")
            return "Unknown"
    
    def get_first_recorded_date(self, station, granularity):
        """
        Récupère la première date enregistrée pour une station
        
        Args:
            station: ID de la station (ex: "CI_BINGERVILLE")
            granularity: Granularité (U, X, H, J, D)
            
        Returns:
            datetime: Première date disponible
        """
        if not self.connected:
            raise WebServiceError("Non connecté au WebService")
        
        try:
            result = self.client.service.GetFirstRecordedDate(station, granularity)
            date_str = str(result.body.GetFirstRecordedDateResult)
            
            if "Error:" in date_str:
                error_code = self._extract_error_code(date_str)
                error_msg = self.ERROR_MESSAGES.get(error_code, "Erreur inconnue")
                raise WebServiceError(f"{error_msg} (code: {error_code})")
            
            return datetime.strptime(date_str, '%Y%m%d%H%M')
            
        except ValueError as e:
            raise WebServiceError(f"Format de date invalide: {date_str}")
        except Exception as e:
            logger.error(f"Erreur GetFirstRecordedDate pour {station}: {str(e)}")
            raise
    
    def get_block_sorted_value(self, station, params, granularity, start_date, end_date):
        """
        Récupère un bloc de données triées
        
        Args:
            station: ID de la station
            params: Liste des paramètres (ex: ["Temp._inst", "Cum._pluie"])
            granularity: Granularité
            start_date: Date de début (datetime)
            end_date: Date de fin (datetime)
            
        Returns:
            list: Liste de dictionnaires avec les données
        """
        if not self.connected:
            raise WebServiceError("Non connecté au WebService")
        
        try:
            # Convertir les paramètres en string
            params_str = ','.join(params)
            
            # Formater les dates
            start_str = start_date.strftime('%Y%m%d%H%M')
            end_str = end_date.strftime('%Y%m%d%H%M')
            
            logger.info(f"Récupération données {station} de {start_str} à {end_str}")
            
            result = self.client.service.GetBlockSortedValue(
                station,
                params_str,
                granularity,
                start_str,
                end_str,
                "ASC"
            )
            
            xml_data = result.body.GetBlockSortedValueResult
            
            # Vérifier les erreurs
            if "Error:" in xml_data:
                error_code = self._extract_error_code(xml_data)
                
                # -5 = pas de données (pas une vraie erreur)
                if error_code == -5:
                    logger.info(f"Pas de données pour {station} entre {start_str} et {end_str}")
                    return []
                
                error_msg = self.ERROR_MESSAGES.get(error_code, "Erreur inconnue")
                raise WebServiceError(f"{error_msg} (code: {error_code})")
            
            # Parser le XML
            return self._parse_xml_data(xml_data, params)
            
        except WebServiceError:
            raise
        except Exception as e:
            logger.error(f"Erreur GetBlockSortedValue: {str(e)}")
            raise WebServiceError(f"Erreur récupération données: {str(e)}")
    
    def _extract_error_code(self, error_string):
        """Extrait le code d'erreur d'une chaîne 'Error:X'"""
        try:
            return int(error_string.split("Error:")[1].strip())
        except:
            return -999
    
    def _parse_xml_data(self, xml_string, params):
        """
        Parse les données XML retournées par le WebService
        
        Returns:
            list: [{timestamp: datetime, param1: value, param2: value, ...}, ...]
        """
        try:
            root = ET.fromstring(xml_string)
            data_list = []
            
            for line_data in root.findall('LINEDATA'):
                raw_values = line_data.text.split(',')
                
                # Nettoyer les espaces
                values = [v.strip() for v in raw_values]
                
                # Timestamp
                timestamp = datetime.strptime(values[0], '%Y%m%d%H%M')
                
                # Créer le dictionnaire de données
                data_point = {'timestamp': timestamp}
                
                for i, param in enumerate(params):
                    value = values[i + 1] if i + 1 < len(values) else ""
                    data_point[param] = value if value else None
                
                data_list.append(data_point)
            
            return data_list
            
        except Exception as e:
            logger.error(f"Erreur parsing XML: {str(e)}")
            raise WebServiceError(f"Erreur parsing données: {str(e)}")
    
    def close(self):
        """Ferme la connexion (si nécessaire)"""
        self.connected = False
        logger.info("Connexion WebService fermée")
