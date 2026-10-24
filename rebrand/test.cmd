@echo off
rem Runs every overlay test that does not need Playwright/network.
cd /d "%~dp0"
bun scripts/run-tests.ts
