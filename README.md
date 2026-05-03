# SAC — Saintonge Access Control

[![Build & Deploy](https://img.shields.io/github/actions/workflow/status/informatique-lycee-sainte-famille/SAC/docker-publish.yml?branch=main&label=Build%20%26%20Deploy)](https://github.com/informatique-lycee-sainte-famille/SAC/actions/workflows/docker-publish.yml)
[![Quality & Security](https://img.shields.io/github/actions/workflow/status/informatique-lycee-sainte-famille/SAC/quality-security.yml?branch=main&label=Quality%20%26%20Security)](https://github.com/informatique-lycee-sainte-famille/SAC/actions/workflows/quality-security.yml)

Projet de **gestion automatisée des présences** par **NFC** destiné à l’annexe du lycée Sainte Famille Saintonge (Bordeaux), réalisé dans le cadre du **BTS CIEL – Épreuve E6 (Option Informatique et réseaux)**.

Le projet vise à remplacer les feuilles d’émargement papier par un système numérique sécurisé, fonctionnant **exclusivement sur le réseau interne (LAN)** de l’établissement.

---

## 🎯 Objectifs du projet

- Automatiser la validation de présence des élèves
- Garantir un horodatage fiable et traçable
- Réduire les risques de fraude
- Respecter les contraintes de **sécurité** et de **RGPD**
- Centraliser et exploiter les données de présence

---

## 🧩 Architecture générale

Le système SAC repose sur une architecture **client / serveur** interne :

- **Frontend** :  
  Application **PWA (Progressive Web App)** accessible sur mobile et navigateur  
  → Scan NFC, consultation des informations utilisateur

- **Backend** :  
  API REST développée en **Node.js**  
  → Gestion des présences, utilisateurs, salles, logs

- **Base de données** :  
  Stockage des données (élèves, scans, emplois du temps, journaux)

- **Infrastructure** :  
  Serveur interne virtualisé (VM + Docker), **aucune exposition Internet**

---

## 🔐 Sécurité & conformité

- Accès strictement limité au **LAN de l’établissement**
- Authentification via **Office 365 / Entra ID (OAuth2 / OIDC)**
- Aucune donnée personnelle exposée à l’extérieur
- Journalisation des actions (logs)
- Conception conforme aux principes du **RGPD**

---

## 🔗 Intégrations

- **Office 365 / Entra ID**  
  → Authentification et récupération du profil utilisateur

- **EcoleDirecte**  
  → Synchronisation des feuilles d’appel et des données de présence  
  (via compte BOT)

---

## 🛠️ Technologies utilisées

- **Frontend** : HTML, CSS, JavaScript (PWA)
- **Backend** : Node.js, API REST
- **Base de données** : PostgreSQL (ORM Prisma)
- **Infrastructure** : Docker, VM Debian, Nginx
- **Authentification** : OAuth2 / OIDC
- **Documentation API** : Swagger

---

## ⚙️ Variables utiles

- `DEBUG=VERBOSE` : tous les logs backend, y compris `console.debug`.
- `DEBUG=INFO` : logs applicatifs classiques (`console.log`, `console.info`) et avertissements.
- `DEBUG=WARNING` : uniquement avertissements et erreurs.
- `DEBUG=PRODUCTION` : uniquement erreurs serveur.
- `BUSINESS_LOG_RETENTION_DAYS=30` : durée de conservation des logs métier en base avant purge automatique.
- `ED_PHOTO_CACHE_DELAY_MS=5000` : délai entre deux téléchargements de photos élèves EcoleDirecte.
- `ED_PHOTO_CACHE_DAILY_LIMIT=500` : nombre maximum de photos élèves traitées par le cache nocturne.
- `ED_PHOTO_CACHE_TIMEOUT_MS=15000` : timeout réseau par photo EcoleDirecte.
- `ED_PHOTO_COOKIE=OGEC_ED_CAS=...; TOKEN_ED_CAS_0=...` : cookie transmis aux requêtes de photos ED.
- `ED_PHOTO_OGEC_ED_CAS=...` et `ED_PHOTO_TOKEN_ED_CAS_0=...` : alternative à `ED_PHOTO_COOKIE`.
- `ASSETLINKS_SITE=https://sac.example.tld` : domaine publié dans `/.well-known/assetlinks.json`.
  Si absent, SAC utilise `EXTERNAL_DOMAIN`, puis les headers proxy `X-Forwarded-Proto` / `X-Forwarded-Host`.
- `SESSION_DURATION_DAYS=180` : durée de validité des sessions utilisateur en jours (par défaut 180 jours, soit 6 mois).

---

## 📋 Organisation du projet

Le suivi du projet est réalisé via **GitHub Issues** et **GitHub Projects (Kanban)**.

👉 **Tableau Kanban du projet** :  
🔗 https://github.com/orgs/informatique-lycee-sainte-famille/projects/2/views/1

Les issues sont structurées par :
- sous-systèmes (backend, frontend, base de données…),
- fonctionnalités,
- sécurité, RGPD, tests et documentation.

---

## 👤 Auteur

- **Téo Lormont**  
  BTS CIEL – Option Informatique et réseaux  
  Lycée Sainte Famille Saintonge

---

## 📚 Contexte pédagogique

Ce projet est réalisé dans le cadre de l’épreuve :

**E6 – Valorisation de la donnée et cybersécurité**  
BTS CIEL – Session 2026

Il sert de support à :
- l’évaluation des compétences techniques,
- la documentation,
- la soutenance finale.
