#!/bin/bash

# Script d'arrêt de l'application Météo CI

echo "🛑 Arrêt de l'application Météo CI..."

# Arrêt des processus
pkill -f "python.*app.py" 2>/dev/null
pkill -f "http.server 8000" 2>/dev/null

sleep 1

echo "✅ Application arrêtée"
