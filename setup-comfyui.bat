@echo off
setlocal enabledelayedexpansion

set PYTHON_EXE=python\python.exe
set COMFY_DIR=comfyui
set GGUF_DIR=comfyui\custom_nodes\ComfyUI-GGUF

:: Check Python exists
if not exist "%PYTHON_EXE%" (
  echo Python not found at %PYTHON_EXE%
  exit /b 1
)

:: Clone ComfyUI if missing
if not exist "%COMFY_DIR%" (
  echo Cloning ComfyUI...
  git clone https://github.com/comfyanonymous/ComfyUI "%COMFY_DIR%"
)

:: Upgrade pip
echo Upgrading pip...
"%PYTHON_EXE%" -m pip install --upgrade pip

:: Install ComfyUI requirements
echo Installing ComfyUI requirements...
"%PYTHON_EXE%" -m pip install -r "%COMFY_DIR%\requirements.txt"

:: Clone GGUF node if missing
if not exist "%GGUF_DIR%" (
  echo Cloning GGUF node...
  git clone https://github.com/city96/ComfyUI-GGUF "%GGUF_DIR%"
)

:: Install GGUF requirements
echo Installing GGUF requirements...
"%PYTHON_EXE%" -m pip install -r "%GGUF_DIR%\requirements.txt"

echo Setup complete.
pause