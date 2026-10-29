@echo off
title NEXUS API Studio - Intelligent API Tester ^& Collection Analyzer
cd /d "%~dp0"
echo Starting NEXUS API Studio on http://localhost:4080 ...
start "" "http://localhost:4080"
npm run dev
pause

