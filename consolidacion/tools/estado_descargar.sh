#!/usr/bin/env bash
##============================================================================##
# estado_descargar.sh  —  Trae la base del repositorio privado de estado
#------------------------------------------------------------------------------#
# Primer paso de una corrida en GitHub Actions. El runner arranca vacio cada vez,
# asi que sin esto la base se crearia de cero y se perderian el historial campo a
# campo, la bitacora de duplicados y el registro de corridas: 01_ingest.R
# volveria a marcar como "insertado" todo lo que ya estaba.
#
#   repositorio privado  ->  descifrar  ->  data/db/base_oficial.sqlite
#
# La base viaja CIFRADA (AES-256, clave derivada con PBKDF2). El repositorio de
# estado ya es privado; el cifrado es la segunda cerradura, para que un token
# filtrado no equivalga a la base en claro.
#
# Se ejecuta desde consolidacion/ :  bash tools/estado_descargar.sh
#
# Variables de entorno (en GitHub Actions vienen de los secrets):
#   ESTADO_REPO     owner/nombre del repositorio privado (p. ej. cienfi-icesi/SICMON-estado)
#   ESTADO_TOKEN    token con permiso de lectura sobre ESE repositorio
#   ESTADO_CLAVE    frase de cifrado
#   ESTADO_ARCHIVO  nombre dentro del repositorio (opcional; base_oficial.sqlite.enc)
#   SICMON_RUTA_DB  destino local (opcional; data/db/base_oficial.sqlite)
#
# Sin ESTADO_REPO no hace nada y termina bien: es lo que pasa en la maquina del
# equipo, donde la base vive en el disco y no hay nada que traer.
##============================================================================##

set -euo pipefail

RUTA_DB="${SICMON_RUTA_DB:-data/db/base_oficial.sqlite}"
ARCHIVO="${ESTADO_ARCHIVO:-base_oficial.sqlite.enc}"

if [ -z "${ESTADO_REPO:-}" ]; then
  echo "estado: ESTADO_REPO sin definir; se usa la base local ($RUTA_DB)"
  exit 0
fi
: "${ESTADO_CLAVE:?estado: falta ESTADO_CLAVE}"
## el token solo hace falta contra GitHub; un repositorio local no lo pide
case "$ESTADO_REPO" in
  /*|*://*) : ;;
  *) : "${ESTADO_TOKEN:?estado: falta ESTADO_TOKEN}" ;;
esac

mkdir -p "$(dirname "$RUTA_DB")"

## --depth 1: del repositorio de estado solo interesa la ultima version. Su
## historial es el respaldo y se consulta desde GitHub cuando hace falta, no en
## cada corrida (son binarios y el clon completo crece sin limite).
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

## ESTADO_REPO normalmente es "owner/nombre" y se arma la direccion de GitHub con
## el token adentro —en la URL y no en un `git config`, para que no quede escrito
## en ningun archivo que sobreviva a la corrida—. Si en cambio trae una direccion
## completa o una ruta absoluta, se usa tal cual: es lo que permite probar todo
## esto contra un repositorio local, sin red y sin credenciales.
if [ "${ESTADO_REPO#/}" != "$ESTADO_REPO" ] || [ "${ESTADO_REPO#*://}" != "$ESTADO_REPO" ]; then
  URL_ESTADO="$ESTADO_REPO"
else
  URL_ESTADO="https://x-access-token:${ESTADO_TOKEN}@github.com/${ESTADO_REPO}.git"
fi

## El error de git se CONSERVA y se imprime. Antes iba a /dev/null y el unico
## rastro era "no se pudo clonar", que no distingue entre un repositorio que no
## existe, un token sin permiso y un nombre mal escrito: tres arreglos
## distintos. El token se borra del mensaje antes de imprimirlo —GitHub
## enmascara los secrets en el registro, pero este script tambien corre a mano,
## donde no hay quien enmascare nada.
if ! ERROR_GIT="$(git clone --depth 1 --quiet "$URL_ESTADO" "$TEMPORAL/estado" 2>&1)"; then
  echo "estado: no se pudo clonar el repositorio de estado." >&2
  echo "  git dijo: ${ERROR_GIT//${ESTADO_TOKEN:-__nada__}/[token]}" >&2
  cat >&2 <<'PISTAS'
  Las tres causas, en orden de frecuencia:
    1. ESTADO_REPO debe ser "owner/nombre" (p. ej. cienfi-icesi/SICMON-estado).
       Si lleva https:// o termina en .git, el script lo toma como direccion
       literal y clona SIN el token, de modo que un repositorio privado falla.
    2. El token no alcanza a ESE repositorio. Un token fine-grained solo llega
       a los repositorios que se le marcaron: revise que SICMON-estado este
       entre ellos, con permiso Contents: Read and write. El token que usa el
       Apps Script para el aviso NO sirve si se creo solo para SICMON.
    3. El repositorio todavia no existe. Cree uno privado y vacio; la primera
       corrida lo llena sola.
PISTAS
  exit 1
fi

CIFRADO="$TEMPORAL/estado/$ARCHIVO"

## Primera corrida contra un repositorio de estado recien creado: no hay nada
## que traer y la base se crea vacia con el esquema de db/schema.sql. Es un
## estado normal, NO un error: si aqui se fallara, el sistema no podria arrancar
## nunca.
if [ ! -f "$CIFRADO" ]; then
  echo "estado: ${ARCHIVO} no existe todavia en ${ESTADO_REPO}; se empieza con una base nueva"
  exit 0
fi

## se descifra a un archivo aparte y solo al final se mueve sobre el destino: si
## la clave esta mal, openssl falla a mitad de camino y una base a medio escribir
## en la ruta real seria peor que no tener ninguna
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -in "$CIFRADO" -out "$TEMPORAL/base.sqlite" -pass env:ESTADO_CLAVE 2>/dev/null; then
  echo "estado: no se pudo descifrar ${ARCHIVO}. La clave ESTADO_CLAVE no corresponde a la del cifrado." >&2
  exit 1
fi

## un SQLite valido empieza por la cadena "SQLite format 3". Comprobarlo aqui
## evita que una base corrupta entre al pipeline y se propague: el paso siguiente
## la abriria, fallaria a media corrida y ya habria escrito en la hoja
if [ "$(head -c 15 "$TEMPORAL/base.sqlite")" != "SQLite format 3" ]; then
  echo "estado: lo descifrado no es una base SQLite valida; se aborta antes de tocar el pipeline." >&2
  exit 1
fi

mv "$TEMPORAL/base.sqlite" "$RUTA_DB"
echo "estado: base restaurada desde ${ESTADO_REPO}/${ARCHIVO} ($(wc -c < "$RUTA_DB" | tr -d ' ') bytes)"
