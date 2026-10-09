#!/usr/bin/env bash
# Usage: scripts/deploy.sh infra|site|functions|web|all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi

LOCATION="${LOCATION:-koreacentral}"
SWA_LOCATION="${SWA_LOCATION:-eastasia}"
APP_NAME="${APP_NAME:-airport}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-main}"
SWA_CLI_VERSION="2.0.10"

require_azure() {
  : "${RG:?Set RG to your resource group (environment or .env)}"
  if [[ -n "${SUBSCRIPTION:-}" ]]; then az account set --subscription "$SUBSCRIPTION"; fi
}

out() {
  az deployment group show -g "$RG" -n "$DEPLOYMENT_NAME" --query "properties.outputs.$1.value" -o tsv
}

retry() {
  local n=0
  until "$@"; do
    n=$((n+1))
    [[ $n -ge 8 ]] && return 1
    echo "Retry $n after deployment/permission propagation..."
    sleep 20
  done
}

infra() {
  require_azure
  : "${DATA_GO_KR_KEY:?Set DATA_GO_KR_KEY}"
  : "${ALERT_EMAIL:?Set ALERT_EMAIL}"
  [[ "$APP_NAME" =~ ^[a-z][a-z0-9]{2,8}$ ]] || { echo "APP_NAME must be 3-9 lowercase alphanumeric characters" >&2; return 1; }
  az group create -n "$RG" -l "$LOCATION" -o none
  local me budget_start
  me="${DEPLOYER_PRINCIPAL_ID:-$(az ad signed-in-user show --query id -o tsv)}"
  budget_start="$(az consumption budget list -g "$RG" --query "[?name=='budget-$APP_NAME'].timePeriod.startDate | [0]" -o tsv | cut -c1-10)"
  local params=(-p "dataGoKrKey=$DATA_GO_KR_KEY" "alertEmail=$ALERT_EMAIL"
    "appName=$APP_NAME" "location=$LOCATION" "swaLocation=$SWA_LOCATION"
    "webDomain=${WEB_DOMAIN:-}" "deployerPrincipalId=$me" "deployerPrincipalType=${DEPLOYER_PRINCIPAL_TYPE:-User}")
  if [[ -n "$budget_start" ]]; then params+=(-p "budgetStartDate=$budget_start"); fi
  az deployment group what-if -g "$RG" -n "$DEPLOYMENT_NAME" -f "$ROOT/infra/main.bicep" "${params[@]}"
  retry az deployment group create -g "$RG" -n "$DEPLOYMENT_NAME" -f "$ROOT/infra/main.bicep" "${params[@]}" -o none
  echo "Infrastructure deployment completed."
}

site() {
  require_azure
  local sa
  sa="$(out storageAccountName)"
  retry az storage blob service-properties update --account-name "$sa" --auth-mode login \
    --static-website --index-document index.html --404-document index.html -o none
  echo "Public data website enabled."
}

functions() {
  require_azure
  local app
  app="$(out functionAppName)"
  (cd "$ROOT/functions" && retry func azure functionapp publish "$app" --python)
}

swa_cli() {
  if [[ "$(uname -s)-$(uname -m)" == "Darwin-arm64" ]] && ! arch -x86_64 /usr/bin/env true 2>/dev/null; then
    docker run --rm --platform linux/amd64 -e SWA_CLI_DEPLOYMENT_TOKEN -e DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 \
      -v "$1:/app" node:22 \
      npx -y "@azure/static-web-apps-cli@$SWA_CLI_VERSION" deploy /app --env production
  else
    npx -y "@azure/static-web-apps-cli@$SWA_CLI_VERSION" deploy "$1" --env production
  fi
}

web() {
  if [[ -z "${SWA_CLI_DEPLOYMENT_TOKEN:-}" ]]; then
    require_azure
    local swa host
    swa="$(out swaName)"
    host="$(out swaHostname)"
    DATA_BASE_URL="${DATA_BASE_URL:-$(out dataBaseUrl)}"
    PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://${WEB_DOMAIN:-$host}/}"
    SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list -n "$swa" -g "$RG" --query properties.apiKey -o tsv)"
  fi
  : "${DATA_BASE_URL:?Set DATA_BASE_URL to the public data directory URL}"
  : "${PUBLIC_SITE_URL:?Set PUBLIC_SITE_URL to your website root URL}"
  export DATA_BASE_URL PUBLIC_SITE_URL SWA_CLI_DEPLOYMENT_TOKEN
  local build
  build="$(mktemp -d)"
  trap "rm -rf '$build'" RETURN
  node "$ROOT/scripts/build-web.mjs" "$build"
  swa_cli "$build"
  unset SWA_CLI_DEPLOYMENT_TOKEN
  echo "Web deployment completed. Data and infrastructure were not modified."
}

case "${1:-web}" in
  infra) infra ;;
  site) site ;;
  functions) functions ;;
  web) web ;;
  all) infra; site; functions; web ;;
  *) echo "Usage: $0 infra|site|functions|web|all" >&2; exit 2 ;;
esac
