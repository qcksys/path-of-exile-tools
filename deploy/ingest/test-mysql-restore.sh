#!/usr/bin/env bash
# Loads a dump from backups/mysql into a throwaway MySQL container and compares every table's row
# count with the counts MySQL Shell recorded at the snapshot. Usage: test-mysql-restore.sh <dump name>
set -euo pipefail
name=${1:?dump name}
cd ~/poe-ingest
scratch=data/mysql-restore-test
work=$(mktemp -d /dev/shm/restore-test.XXXXXX)
cleanup() { docker rm -f mysql-restore-test >/dev/null 2>&1 || true; rm -rf "$work" "$scratch"; }
trap cleanup EXIT
mkdir "$scratch"
python3 -c 'import secrets; print(secrets.token_hex(16), end="")' > "$work/password"
chmod 644 "$work/password"
docker run -d --name mysql-restore-test --network poe-ingest-dev_default --user 1000:1000 \
  --memory 3g -v "$PWD/$scratch:/var/lib/mysql" -v "$work:/secrets:ro" \
  -e MYSQL_ROOT_PASSWORD_FILE=/secrets/password mysql:8.4 \
  --skip-log-bin --innodb-buffer-pool-size=1G --innodb-flush-log-at-trx-commit=2 \
  --local-infile=1 --skip-name-resolve >/dev/null
for _ in $(seq 60); do
  docker logs mysql-restore-test 2>&1 | grep -q "ready for connections.*port: 3306" && break
  sleep 5
done
start=$(date +%s)
docker run --rm -i --network poe-ingest-dev_default --user 1000:1000 --env HOME=/tmp \
  -v "$PWD/backups/mysql:/dump:ro" mysql:8.4 \
  mysqlsh --uri mysql://root@mysql-restore-test:3306 --passwords-from-stdin --js \
  --execute "util.loadDump('/dump/$name', {threads: 4, progressFile: ''})" < "$work/password" 2>&1 \
  | grep -vi password | tail -4
echo "loaded in $(( $(date +%s) - start )) s"
docker exec -i mysql-restore-test sh -c 'MYSQL_PWD="$(cat /secrets/password)" mysql -uroot -N poeboats -e "
  select table_name from information_schema.tables where table_schema = database() and table_type = \"BASE TABLE\"" ' \
  | while read -r table; do
      rows=$(docker exec mysql-restore-test sh -c "MYSQL_PWD=\"\$(cat /secrets/password)\" mysql -uroot -N poeboats -e 'select count(*) from \`$table\`'" < /dev/null)
      printf '%s %s\n' "$table" "$rows"
    done > "$work/restored"
python3 - "backups/mysql/$name/@.done.json" "$work/restored" <<'PY'
import json, sys
expected = json.load(open(sys.argv[1]))["tableRows"]["poeboats"]
restored = dict(line.split() for line in open(sys.argv[2]))
mismatches = [t for t in expected if int(restored.get(t, -1)) != expected[t]]
print(f"tables {len(expected)}, rows {sum(expected.values())}, mismatches {len(mismatches)}")
for t in mismatches:
    print(f"  {t}: dump {expected[t]}, restored {restored.get(t)}")
PY
