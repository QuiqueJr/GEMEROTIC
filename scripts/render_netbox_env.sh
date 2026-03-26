#!/usr/bin/env bash

set -euo pipefail

# Genera archivos .local.env válidos para NetBox sin exponer secretos reales.
# Se usa sobre todo en CI y en entornos efímeros de validación.

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_dir="${project_root}/docker/netbox/env"

force_write="false"
if [[ "${1:-}" == "--force" ]]; then
  force_write="true"
fi

write_file() {
  local target_path="$1"
  local content="$2"

  if [[ -f "${target_path}" && "${force_write}" != "true" ]]; then
    echo "Refusing to overwrite existing file: ${target_path}" >&2
    echo "Use --force to replace generated NetBox env files." >&2
    exit 1
  fi

  printf '%s\n' "${content}" > "${target_path}"
}

api_token_pepper="${API_TOKEN_PEPPER:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
secret_key="${NETBOX_SECRET_KEY:-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}"
postgres_password="${POSTGRES_PASSWORD:-netbox-postgres-password}"
redis_password="${REDIS_PASSWORD:-netbox-redis-password}"
redis_cache_password="${REDIS_CACHE_PASSWORD:-netbox-redis-cache-password}"
rate_limit_password="${RATE_LIMIT_REDIS_PASSWORD:-gemerotic-rate-limit-password}"
superuser_password="${SUPERUSER_PASSWORD:-netbox-admin-password}"
superuser_api_token="${SUPERUSER_API_TOKEN:-ci-netbox-admin-token}"
netbox_host_port="${NETBOX_HOST_PORT:-8080}"

mkdir -p "${env_dir}"

write_file "${env_dir}/postgres.local.env" "$(cat <<EOF
POSTGRES_DB=netbox
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_USER=netbox
EOF
)"

write_file "${env_dir}/redis.local.env" "$(cat <<EOF
REDIS_PASSWORD=${redis_password}
EOF
)"

write_file "${env_dir}/redis-cache.local.env" "$(cat <<EOF
REDIS_PASSWORD=${redis_cache_password}
EOF
)"

write_file "${env_dir}/rate-limit.local.env" "$(cat <<EOF
REDIS_PASSWORD=${rate_limit_password}
EOF
)"

write_file "${env_dir}/netbox.local.env" "$(cat <<EOF
ALLOWED_HOSTS=localhost 127.0.0.1 netbox
API_TOKEN_PEPPER_1=${api_token_pepper}
CENSUS_REPORTING_ENABLED=false
CORS_ORIGIN_ALLOW_ALL=false
CORS_ORIGIN_WHITELIST=http://localhost:3000 http://127.0.0.1:3000 http://localhost:5173 http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS=http://localhost:${netbox_host_port} http://127.0.0.1:${netbox_host_port}
DB_HOST=postgres
DB_NAME=netbox
DB_PASSWORD=${postgres_password}
DB_USER=netbox
DEBUG=false
EMAIL_FROM=netbox@gemerotic.local
EMAIL_PASSWORD=
EMAIL_PORT=25
EMAIL_SERVER=localhost
EMAIL_SSL_CERTFILE=
EMAIL_SSL_KEYFILE=
EMAIL_TIMEOUT=5
EMAIL_USERNAME=netbox
EMAIL_USE_SSL=false
EMAIL_USE_TLS=false
GRAPHQL_ENABLED=true
LOGIN_REQUIRED=true
METRICS_ENABLED=false
REDIS_CACHE_DATABASE=1
REDIS_CACHE_HOST=redis-cache
REDIS_CACHE_INSECURE_SKIP_TLS_VERIFY=false
REDIS_CACHE_PASSWORD=${redis_cache_password}
REDIS_CACHE_SSL=false
REDIS_DATABASE=0
REDIS_HOST=redis
REDIS_INSECURE_SKIP_TLS_VERIFY=false
REDIS_PASSWORD=${redis_password}
REDIS_SSL=false
SECRET_KEY=${secret_key}
SKIP_SUPERUSER=false
SUPERUSER_API_TOKEN=${superuser_api_token}
SUPERUSER_EMAIL=admin@gemerotic.local
SUPERUSER_NAME=gemerotic-admin
SUPERUSER_PASSWORD=${superuser_password}
WEBHOOKS_ENABLED=true
EOF
)"

echo "Generated NetBox env files in ${env_dir}"
