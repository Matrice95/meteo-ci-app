#!/bin/bash

# Script de lancement de l'application Météo CI

echo "🚀 Démarrage de l'application Météo CI..."
echo ""

# Vérification du répertoire
cd "$(dirname "$0")"

# Nettoyage des processus existants
echo "🧹 Nettoyage des processus existants..."
pkill -f "python.*app.py" 2>/dev/null
pkill -f "http.server 8000" 2>/dev/null
sleep 1

# Nettoyage des fichiers cache
echo "🗑️  Nettoyage des fichiers cache..."
rm -rf backend/__pycache__ backend/providers/__pycache__

# Lancement du backend
echo ""
echo "🔧 Démarrage du backend Flask..."
cd backend
./venv/bin/python app.py > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Attendre que le backend démarre
sleep 2

# Lancement du frontend
echo "🌐 Démarrage du frontend..."
cd frontend
python3 -m http.server 8000 > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Attendre que le frontend démarre
sleep 1

echo ""
echo "✅ Application démarrée avec succès !"
echo ""
echo "📍 Backend Flask : http://127.0.0.1:5000"
echo "📍 Frontend      : http://127.0.0.1:8000"
echo ""
echo "📋 Logs disponibles dans le dossier logs/"
echo "   - Backend  : logs/backend.log"
echo "   - Frontend : logs/frontend.log"
echo ""
echo "🛑 Pour arrêter l'application : ./stop.sh"
echo ""
