#!/usr/bin/env bash
set -euo pipefail
root=${1:?Diretorio de deploy ausente}
sha=${2:?Commit ausente}
[[ "$root" =~ ^/[a-zA-Z0-9/_-]+$ && "$root" != / ]]
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
test -s "$root/.env"
mkdir -p "$root/releases"
exec 9>"$root/deploy.lock"
flock -w 900 9
release="$root/releases/$sha"
if [[ ! -d "$release" ]]; then
  staging=$(mktemp -d "$root/releases/.incoming.XXXXXXXX")
  tar -xzf "$HOME/backend-$sha.tgz" -C "$staging"
  test -s "$staging/compose.production.yml"
  mv "$staging" "$release"
fi
previous=$(readlink -f "$root/current" || true)
compose() {
  RELEASE_SHA="$sha" docker compose --env-file "$root/.env" -f "$release/compose.production.yml" "$@"
}
compose config --quiet
compose build api
if ! compose up -d --wait --wait-timeout 180; then
  if [[ -n "$previous" && -f "$previous/compose.production.yml" ]]; then
    RELEASE_SHA="$(basename "$previous")" docker compose --env-file "$root/.env" -f "$previous/compose.production.yml" up -d --wait --wait-timeout 180
  fi
  echo 'Deploy falhou; verifique os containers e a release anterior.' >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3000/health
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:3000/health/ready
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
echo "Backend publicado: $sha"
