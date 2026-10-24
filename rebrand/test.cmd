@echo off
rem Runs the overlay unit tests from the rebrand directory (bun test must not
rem run from the repository root; bunfig rebrand/test root would break).
cd /d "%~dp0"
bun test
