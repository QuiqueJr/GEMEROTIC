FROM docker:28-cli AS docker-cli

FROM python:3.12-slim

ARG CONTAINERLAB_VERSION=0.75.0

WORKDIR /app

# Instala herramientas externas que el Step 10 necesita dentro del runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        iproute2 \
        iputils-ping \
    && curl -fsSL \
        "https://github.com/srl-labs/containerlab/releases/download/v${CONTAINERLAB_VERSION}/containerlab_${CONTAINERLAB_VERSION}_linux_amd64.deb" \
        -o /tmp/containerlab.deb \
    && dpkg -i /tmp/containerlab.deb \
    && rm -f /tmp/containerlab.deb \
    && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

COPY requirements.txt pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir ansible-core==2.17.13 \
    && pip install --no-cache-dir -e .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
