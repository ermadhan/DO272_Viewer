@echo off
echo ========================================================
echo  Starting DO-272 Spatial FastAPI Backend on Windows
echo ========================================================

:: Check Python installation
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not found in PATH. Please install Python 3.10+ from python.org.
    pause
    exit /b 1
)

:: Create virtual environment if missing
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate virtual environment
call venv\Scripts\activate

:: Install dependencies
echo Installing requirements...
pip install -r requirements.txt

:: Set default PostgreSQL connection or fallback to SQLite
set POSTGRES_URL=postgresql://postgres:postgrespassword@localhost:5432/do272_aerodromes

echo Starting FastAPI server at http://127.0.0.1:8000
python main.py

pause
