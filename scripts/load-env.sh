#!/usr/bin/env bash
# Load empty placeholders from .env.example, then gitignored overlays.
# Never overwrites a non-empty value already in the process environment.
# Never prints secret values.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${line#*=}"
    if [[ "$value" == *" #"* ]]; then
      value="${value%% #*}"
    fi
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    if [[ -z "${!key:-}" ]]; then
      export "${key}=${value}"
    fi
  done < "$file"
}

load_env_file "${root}/.env.example"
load_env_file "${root}/.env"
load_env_file "${root}/.env.local"

if [[ -n "${DATABASE_URI:-}" && -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="${DATABASE_URI}"
fi
if [[ -n "${DATABASE_URL:-}" && -z "${DATABASE_URI:-}" ]]; then
  export DATABASE_URI="${DATABASE_URL}"
fi
if [[ -n "${CF_API_TOKEN:-}" && -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="FAKESECRET_o2p3q4r5s6t7u8v9w0x1"
fi
if [[ -n "${CF_ACCOUNT_ID:-}" && -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID}"
fi
