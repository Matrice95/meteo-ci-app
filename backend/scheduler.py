# -*- coding: utf-8 -*-
"""
Planificateur multi-tâches pour le téléchargement automatique des données météo.
Chaque tâche est configurable : réseau, stations, paramètres, granularité, période, horaire.
"""
import os
import json
import uuid
import threading
import logging
from datetime import datetime, timedelta

from config import Config
from utils import generate_csv_from_data

logger = logging.getLogger(__name__)

SCHEDULED_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'scheduled')
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'scheduler_state.json')


def _ensure_dirs():
    os.makedirs(SCHEDULED_DATA_DIR, exist_ok=True)


class MeteoScheduler:
    """Gestionnaire multi-tâches de téléchargements planifiés."""

    def __init__(self, providers):
        self.providers = providers
        self._tasks = {}          # id → task dict
        self._timers = {}         # id → threading.Timer
        self._lock = threading.Lock()
        _ensure_dirs()
        self._load_state()

    # ─── Persistence ─────────────────────────────────────

    def _load_state(self):
        """Charge les tâches depuis le fichier JSON."""
        try:
            if not os.path.exists(STATE_FILE):
                return
            with open(STATE_FILE, 'r') as f:
                raw = json.load(f)
            # Migration depuis l'ancien format mono-tâche
            if isinstance(raw, dict) and 'tasks' not in raw:
                logger.info("Scheduler: migration ancien format → multi-tâches")
                self._tasks = {}
                self._save_state()
                return
            for t in raw.get('tasks', []):
                self._tasks[t['id']] = t
            # Ré-armer les tâches actives
            for tid, task in self._tasks.items():
                if task.get('active'):
                    self._arm_timer(tid)
            active = sum(1 for t in self._tasks.values() if t.get('active'))
            logger.info(f"Scheduler: {len(self._tasks)} tâche(s) chargée(s), {active} active(s)")
        except Exception as e:
            logger.error(f"Scheduler: erreur chargement état: {e}")
            self._tasks = {}

    def _save_state(self):
        """Sauvegarde toutes les tâches dans le fichier JSON."""
        try:
            with open(STATE_FILE, 'w') as f:
                json.dump({'tasks': list(self._tasks.values())}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Scheduler: erreur sauvegarde: {e}")

    # ─── Lecture ─────────────────────────────────────────

    def get_summary(self):
        """Retourne un résumé global."""
        active = sum(1 for t in self._tasks.values() if t.get('active'))
        return {
            'total_count': len(self._tasks),
            'active_count': active,
            'server_time_utc': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
        }

    def get_all_tasks(self):
        """Retourne toutes les tâches enrichies."""
        tasks = []
        for tid in self._tasks:
            tasks.append(self._enrich_task(tid))
        # Trier : actives d'abord, puis par nom
        tasks.sort(key=lambda t: (not t.get('active', False), t.get('name', '')))
        summary = self.get_summary()
        summary['tasks'] = tasks
        return summary

    def get_task(self, task_id):
        """Retourne une tâche enrichie ou None."""
        if task_id not in self._tasks:
            return None
        return self._enrich_task(task_id)

    def _enrich_task(self, task_id):
        """Ajoute next_run à une tâche."""
        task = self._tasks.get(task_id)
        if not task:
            return None
        enriched = dict(task)
        if task.get('active'):
            nrt = self._next_run_time(task)
            now = datetime.utcnow()
            enriched['next_run'] = nrt.isoformat()
            if nrt.date() == now.date():
                enriched['next_run_display'] = f"Aujourd'hui à {nrt.strftime('%H:%M')} GMT"
            else:
                enriched['next_run_display'] = f"Demain à {nrt.strftime('%H:%M')} GMT"
        else:
            enriched['next_run'] = None
            enriched['next_run_display'] = None
        return enriched

    # ─── CRUD ────────────────────────────────────────────

    def create_task(self, data):
        """Crée une nouvelle tâche planifiée."""
        with self._lock:
            task_id = str(uuid.uuid4())[:8]
            task = {
                'id': task_id,
                'name': data.get('name', 'Tâche sans nom').strip(),
                'station_type': data.get('station_type', 'pulsonic'),
                'stations': data.get('stations', []),
                'granularity': data.get('granularity', 'H'),
                'params': data.get('params', []),
                'period_days': int(data.get('period_days', 1)),
                'hour': int(data.get('hour', 6)),
                'minute': int(data.get('minute', 0)),
                'active': False,
                'last_run': None,
                'last_status': None,
                'last_message': None,
                'last_file': None,
                'run_count': 0,
                'created_at': datetime.utcnow().isoformat(),
            }
            self._tasks[task_id] = task
            self._save_state()
            logger.info(f"Scheduler: tâche créée '{task['name']}' ({task_id})")
            return task

    def update_task(self, task_id, data):
        """Met à jour une tâche existante."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            updatable = ['name', 'station_type', 'stations', 'granularity', 'params', 'period_days', 'hour', 'minute']
            for key in updatable:
                if key in data:
                    task[key] = data[key]
            task['hour'] = int(task['hour'])
            task['minute'] = int(task['minute'])
            task['period_days'] = int(task['period_days'])
            if isinstance(task.get('name'), str):
                task['name'] = task['name'].strip()
            if task.get('active'):
                self._arm_timer(task_id)
            self._save_state()
            logger.info(f"Scheduler: tâche mise à jour '{task['name']}' ({task_id})")
            return task

    def delete_task(self, task_id):
        """Supprime une tâche."""
        with self._lock:
            if task_id not in self._tasks:
                return False
            if task_id in self._timers:
                self._timers[task_id].cancel()
                del self._timers[task_id]
            name = self._tasks[task_id].get('name', task_id)
            del self._tasks[task_id]
            self._save_state()
            logger.info(f"Scheduler: tâche supprimée '{name}' ({task_id})")
            return True

    def toggle_task(self, task_id, active):
        """Active ou désactive une tâche."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            task['active'] = bool(active)
            if active:
                self._arm_timer(task_id)
                logger.info(f"Scheduler: '{task['name']}' activée → {task['hour']:02d}:{task['minute']:02d} GMT")
            else:
                if task_id in self._timers:
                    self._timers[task_id].cancel()
                    del self._timers[task_id]
                logger.info(f"Scheduler: '{task['name']}' désactivée")
            self._save_state()
            return task

    # ─── Timer ───────────────────────────────────────────

    def _next_run_time(self, task):
        now = datetime.utcnow()
        target = now.replace(hour=task['hour'], minute=task['minute'], second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        return target

    def _arm_timer(self, task_id):
        if task_id in self._timers:
            self._timers[task_id].cancel()
        task = self._tasks.get(task_id)
        if not task:
            return
        delay = (self._next_run_time(task) - datetime.utcnow()).total_seconds()
        timer = threading.Timer(delay, self._on_trigger, args=[task_id])
        timer.daemon = True
        timer.start()
        self._timers[task_id] = timer
        logger.info(f"Scheduler [{task['name']}]: armé dans {delay:.0f}s ({self._next_run_time(task).strftime('%Y-%m-%d %H:%M')} UTC)")

    def _on_trigger(self, task_id):
        task = self._tasks.get(task_id)
        if not task:
            return
        logger.info(f"Scheduler [{task['name']}]: déclenchement automatique")
        try:
            self._run_download(task)
            task['run_count'] = task.get('run_count', 0) + 1
        except Exception as e:
            logger.error(f"Scheduler [{task['name']}]: erreur: {e}")
            task['last_status'] = 'error'
            task['last_message'] = str(e)
        finally:
            task['last_run'] = datetime.utcnow().isoformat()
            self._save_state()
            if task.get('active'):
                self._arm_timer(task_id)
                logger.info(f"Scheduler [{task['name']}]: ré-armé (run_count={task.get('run_count', 0)})")

    # ─── Téléchargement ─────────────────────────────────

    def _run_download(self, task):
        provider = self.providers.get(task['station_type'])
        if not provider:
            raise RuntimeError(f"Provider '{task['station_type']}' introuvable")

        station_ids = task.get('stations', [])
        if not station_ids:
            raise RuntimeError("Aucune station configurée dans cette tâche")

        params = task.get('params', [])
        if not params:
            raise RuntimeError("Aucun paramètre configuré dans cette tâche")

        now = datetime.utcnow()
        period_days = task.get('period_days', 1)
        start_date = (now - timedelta(days=period_days)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        granularity = task.get('granularity', 'H')

        logger.info(f"Scheduler [{task['name']}]: {len(station_ids)} stations, {len(params)} params, {granularity}, {period_days}j")

        data_by_station = provider.download_data(station_ids, params, start_date, end_date, granularity)
        total_rows = sum(len(rows) for rows in data_by_station.values())

        if total_rows == 0:
            task['last_status'] = 'warning'
            task['last_message'] = 'Aucune donnée récupérée'
            task['last_file'] = None
            logger.warning(f"Scheduler [{task['name']}]: aucune donnée")
            return

        csv_buffer = generate_csv_from_data(data_by_station, params, Config.DEFAULT_VALUE)

        date_str = now.strftime('%Y%m%d_%H%M')
        safe_name = ''.join(c if c.isalnum() or c in '-_' else '_' for c in task.get('name', 'task'))[:30]
        filename = f"auto_{safe_name}_{date_str}.csv"
        filepath = os.path.join(SCHEDULED_DATA_DIR, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(csv_buffer.getvalue())

        task['last_status'] = 'success'
        task['last_message'] = f"{total_rows} lignes, {len(station_ids)} stations"
        task['last_file'] = filename
        logger.info(f"Scheduler [{task['name']}]: → {filepath} ({total_rows} lignes)")

    # ─── Exécution manuelle ──────────────────────────────

    def run_task_now(self, task_id):
        task = self._tasks.get(task_id)
        if not task:
            return None
        t = threading.Thread(target=self._manual_run, args=[task_id], daemon=True)
        t.start()
        return f"Tâche '{task['name']}' lancée en arrière-plan"

    def _manual_run(self, task_id):
        task = self._tasks.get(task_id)
        if not task:
            return
        try:
            self._run_download(task)
            task['run_count'] = task.get('run_count', 0) + 1
        except Exception as e:
            logger.error(f"Scheduler [{task['name']}] run_now: {e}")
            task['last_status'] = 'error'
            task['last_message'] = str(e)
        finally:
            task['last_run'] = datetime.utcnow().isoformat()
            self._save_state()
