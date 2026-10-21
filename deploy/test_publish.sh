#!/usr/bin/env bash
set -euo pipefail
script=$(cd "$(dirname "$0")" && pwd)/publish.sh
fixture=$(mktemp -d /tmp/mindcheck-deploy-test-XXXXXXXX)
trap 'rm -rf -- "$fixture"' EXIT
sha=1111111111111111111111111111111111111111
root="$fixture/app"
mkdir -p "$fixture/bin" "$root/releases/$sha/prisma"
printf 'fixture\n' > "$root/.env"
printf 'name: fixture\n' > "$root/releases/$sha/compose.production.yml"
printf 'SELECT 1;\n' > "$root/releases/$sha/prisma/patches.sql"
mkdir -p "$root/releases/$sha/prisma/patches"
mv "$root/releases/$sha/prisma/patches.sql" "$root/releases/$sha/prisma/patches/001-usuario-papel.sql"
cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DEPLOY_TEST_CALLS"
if [[ "$*" == *' pg_dump '* ]]; then
  # Docker encaminha stdin ao processo: reproduz a leitura que engolia bash -s.
  cat > /dev/null
  printf 'backup fixture\n'
elif [[ "$*" == *' psql '* ]]; then
  cat > /dev/null
fi
MOCK
cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DEPLOY_TEST_CALLS"
printf '{"status":"ok"}\n'
MOCK
chmod +x "$fixture/bin/docker" "$fixture/bin/curl"
export PATH="$fixture/bin:$PATH"
export DEPLOY_TEST_CALLS="$fixture/calls"
bash -s -- "$root" "$sha" < "$script" > "$fixture/output"
test "$(readlink -f "$root/current")" = "$root/releases/$sha"
grep -q 'Backend publicado:' "$fixture/output"
grep -q 'up -d --wait --wait-timeout 180' "$fixture/calls"
grep -q '/auth/config' "$fixture/calls"
test "$(find "$root/backups" -name '*.dump' -type f -size +0c | wc -l)" -eq 1
echo 'Deploy via bash -s executa backup, patch, API, verificacoes e troca de release.'
