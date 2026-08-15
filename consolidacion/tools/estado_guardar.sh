#!/usr/bin/env bash
##============================================================================##
# estado_guardar.sh  —  Devuelve la base al repositorio privado de estado
#------------------------------------------------------------------------------#
# Ultimo paso de una corrida en GitHub Actions, el reverso de
# tools/estado_descargar.sh:
#
#   data/db/base_oficial.sqlite  ->  cifrar  ->  repositorio privado
#
# Cada corrida deja un commit, asi que el historial del repositorio de estado ES
# la cadena de respaldos: para volver a como estaba la base ayer a las 3 de la
# tarde se saca ese commit y se descifra.
#
# Se ejecuta desde consolidacion/ :  bash tools/estado_guardar.sh
#
# Mismas variables de entorno que estado_descargar.sh; ESTADO_TOKEN necesita
# aqui permiso de ESCRITURA sobre el repositorio de estado.
##============================================================================##

set -euo pipefail

RUTA_DB="${SICMON_RUTA_DB:-data/db/base_oficial.sqlite}"
ARCHIVO="${ESTADO_ARCHIVO:-base_oficial.sqlite.enc}"

if [ -z "${ESTADO_REPO:-}" ]; then
  echo "estado: ESTADO_REPO sin definir; la base se queda en el disco ($RUTA_DB)"
  exit 0
fi
: "${ESTADO_CLAVE:?estado: falta ESTADO_CLAVE}"
## el token solo hace falta contra GitHub; un repositorio local no lo pide
case "$ESTADO_REPO" in
  /*|*://*) : ;;
  *) : "${ESTADO_TOKEN:?estado: falta ESTADO_TOKEN}" ;;
esac

if [ ! -f "$RUTA_DB" ]; then
  echo "estado: no hay base en $RUTA_DB; no se sube nada" >&2
  exit 1
fi

## La ruta se vuelve ABSOLUTA aqui, antes de cualquier cd. Mas abajo el script
## entra al clon del repositorio de estado y desde ahi vuelve a leer la base
## para sacarle el hash: con la ruta relativa por defecto
## (data/db/base_oficial.sqlite) eso fallaba con "No such file or directory".
## En las pruebas nunca se vio porque SICMON_RUTA_DB llegaba absoluta.
RUTA_DB="$(cd "$(dirname "$RUTA_DB")" && pwd)/$(basename "$RUTA_DB")"

TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

## misma regla que en estado_descargar.sh: "owner/nombre" arma la direccion de
## GitHub; una direccion completa o una ruta absoluta se usa tal cual
if [ "${ESTADO_REPO#/}" != "$ESTADO_REPO" ] || [ "${ESTADO_REPO#*://}" != "$ESTADO_REPO" ]; then
  URL_ESTADO="$ESTADO_REPO"
else
  URL_ESTADO="https://x-access-token:${ESTADO_TOKEN}@github.com/${ESTADO_REPO}.git"
fi

git clone --depth 1 --quiet "$URL_ESTADO" "$TEMPORAL/estado"

openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$RUTA_DB" -out "$TEMPORAL/estado/$ARCHIVO" -pass env:ESTADO_CLAVE

cd "$TEMPORAL/estado"
git config user.email "pipeline@sicmon.local"
git config user.name  "SICMON pipeline"

## Sin cambios no se hace commit. Ojo: el cifrado lleva sal aleatoria, asi que
## el archivo cifrado cambia SIEMPRE aunque la base sea identica, y `git status`
## nunca lo veria limpio. Por eso se compara la base en claro por hash, y no el
## archivo que git tiene delante.
##
## Sin esto, un cron cada 30 minutos deja 48 commits diarios de un binario de
## varios MB aunque no haya llegado una sola encuesta nueva.
HASH_NUEVO="$(openssl dgst -sha256 -r < "$RUTA_DB" | cut -d' ' -f1)"
HASH_VIEJO="$(cat .hash_base 2>/dev/null || echo '')"

if [ "$HASH_NUEVO" = "$HASH_VIEJO" ]; then
  echo "estado: la base no cambio en esta corrida; no se sube nada"
  exit 0
fi

echo "$HASH_NUEVO" > .hash_base
git add "$ARCHIVO" .hash_base
git commit --quiet -m "estado: corrida $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

## Reintento simple. La causa normal de un rechazo es que otra corrida subio
## primero; como el workflow tiene un grupo de concurrencia eso no deberia pasar,
## pero una corrida manual lanzada a mano si puede solaparse con el cron.
## Se rehace el clon en vez de hacer rebase: son binarios, un rebase no sabe
## fusionarlos y lo correcto es que gane la base de esta corrida, que es la que
## acaba de procesar lo mas reciente.
for intento in 1 2 3; do
  if git push --quiet origin HEAD 2>/dev/null; then
    echo "estado: base guardada en ${ESTADO_REPO}/${ARCHIVO}"
    exit 0
  fi
  echo "estado: el push fue rechazado (intento $intento de 3); se reintenta sobre la punta actual"
  sleep $((intento * 5))
  git fetch --quiet --depth 1 origin
  git reset --quiet --soft origin/HEAD 2>/dev/null || git reset --quiet --soft FETCH_HEAD
  git commit --quiet --amend -m "estado: corrida $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
done

echo "estado: no se pudo subir la base despues de 3 intentos." >&2
exit 1
