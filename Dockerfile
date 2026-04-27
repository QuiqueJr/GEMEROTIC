FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de dependencias
COPY requirements.txt pyproject.toml ./

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -e .

# Copiar el resto del código
COPY app ./app

# Exponer puerto FastAPI
EXPOSE 8000

# Comando para arrancar el API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
