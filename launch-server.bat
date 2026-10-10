@echo off
set "NODE_BIN=%~1"
set "SERVER_JS=%~2"
set "LOG_FILE=%~3"
set "CWD=%~4"

cd /d "%CWD%"
"%NODE_BIN%" "%SERVER_JS%" > "%LOG_FILE%" 2>&1
