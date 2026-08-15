#!/usr/bin/env bash
##============================================================================##
# purgar_historial.sh  —  Borra del historial de git lo que nunca debió entrar
#------------------------------------------------------------------------------#
# ESTE SCRIPT REESCRIBE LA HISTORIA DEL REPOSITORIO. No lo corra sin haber leído
# lo de abajo. No se ejecuta solo ni forma parte de ninguna corrida automática.
#
# QUÉ PROBLEMA RESUELVE
# `git rm --cached` saca un archivo del commit siguiente, pero no de los
# anteriores: el token y la base con cédulas siguen descargables desde cualquier
# commit viejo mientras el repositorio sea público. Esto los borra de todos.
#
# ANTES DE CORRERLO — EN ESTE ORDEN
#
#   1. ROTE EL TOKEN. En el Apps Script: Configuración del proyecto →
#      Propiedades del script → TOKEN_EXPORTACION → cadena nueva. Actualice
#      consolidacion/.secrets/token_exportacion.txt y el secret
#      TOKEN_EXPORTACION del repositorio en GitHub.
#
#      Esto es lo único que de verdad cierra la puerta. El token estuvo público
#      y hay que darlo por conocido: GitHub sirve los commits por su hash aunque
#      no aparezcan en ninguna rama, y buscadores y réplicas pueden tener copia.
#      Si solo puede hacer un paso de esta lista, que sea este.
#
#   2. Avise a todo el que tenga un clon. Después de esto, los clones viejos NO
#      se pueden sincronizar: hay que borrarlos y volver a clonar. Un `git pull`
#      sobre un clon viejo reintroduce los commits borrados.
#
#   3. Deje un respaldo del repositorio completo fuera de esta carpeta:
#        git clone --mirror . ../SICMON-respaldo.git
#
# CÓMO CORRERLO
#   pip install git-filter-repo      (o brew install git-filter-repo)
#   bash consolidacion/tools/purgar_historial.sh
#
# El script reescribe la historia LOCAL y se detiene. La subida queda en sus
# manos, a propósito, y es un solo comando que él mismo le imprime al final.
##============================================================================##

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Falta git-filter-repo. Instálelo con:  pip install git-filter-repo" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin confirmar. Haga commit o guárdelos antes de reescribir la historia." >&2
  exit 1
fi

## Rutas a borrar de TODOS los commits. Son las mismas que hoy están en
## .gitignore; la lista está aquí escrita a mano y no leída del .gitignore
## porque borrar historia a partir de un archivo que alguien puede editar sin
## darse cuenta es demasiado fácil de convertir en un accidente.
RUTAS=(
  "consolidacion/.secrets"
  "consolidacion/data/db"
  "consolidacion/data/entrada"
  "consolidacion/data/salida"
  "consolidacion/data/pruebas"
  "consolidacion/logs"
  "consolidacion/.Rproj.user"
  "modules/consulta/js/datos.js"
  "modules/consulta/descargas"
  "modules/tablero/js/datos_tablero.js"
)

echo "Se van a borrar del historial completo:"
printf '  %s\n' "${RUTAS[@]}"
echo
read -r -p "¿Rotó ya el TOKEN_EXPORTACION en el Apps Script? (escriba SI) " respuesta
[ "$respuesta" = "SI" ] || { echo "Rote el token primero. Es el paso que de verdad importa."; exit 1; }

ARGUMENTOS=()
for ruta in "${RUTAS[@]}"; do ARGUMENTOS+=(--path "$ruta"); done

git filter-repo --invert-paths "${ARGUMENTOS[@]}" --force

cat <<'FIN'

Historia reescrita en local. Compruebe antes de subir:

  bash consolidacion/tools/verificar_publico.sh
  git log --all --diff-filter=A --name-only -- 'consolidacion/.secrets/*' '*.sqlite'
      (no debe imprimir nada)

git-filter-repo quita el remoto a propósito. Para subir:

  git remote add origin https://github.com/cienfi-icesi/SICMON.git
  git push --force --all origin
  git push --force --tags origin

Después de subir, en GitHub: Settings → Branches, revise que la protección de
main no bloquee el force-push, y pida a Soporte de GitHub que limpie la caché
de los commits sueltos si quiere cerrar también esa vía.

Recuerde: todo clon anterior a esta reescritura hay que borrarlo y volver a
clonar. Un pull desde uno viejo devuelve los commits borrados.
FIN
