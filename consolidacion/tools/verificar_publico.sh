#!/usr/bin/env bash
##============================================================================##
# verificar_publico.sh  —  ¿Quedó algo sensible dentro del repositorio público?
#------------------------------------------------------------------------------#
# Este repositorio es público y GitHub Pages sirve TODO lo que esté versionado.
# El .gitignore ya lista lo que no debe entrar, pero .gitignore no aplica a lo
# que YA está rastreado: así fue como el token de extracción y la base con
# cédulas terminaron publicados aunque estuvieran «ignorados».
#
# Esta comprobación mira el índice de git, no el disco. Que un archivo exista en
# data/db/ es normal y necesario; que git lo conozca, no.
#
#   bash tools/verificar_publico.sh
#
# Devuelve 0 si todo está limpio y 1 si encontró algo. Corre en cada corrida del
# workflow y conviene correrla antes de cualquier commit.
##============================================================================##

set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

FALLOS=0
aviso() { echo "  ✗ $1"; FALLOS=$((FALLOS + 1)); }

echo "Verificación de exposición pública — $(git rev-parse --short HEAD 2>/dev/null || echo 'sin commits')"
echo

##============================================================================##
##=== 1. Rutas que nunca deben estar rastreadas                            ===##
##============================================================================##

echo "1. Rutas sensibles en el índice de git"

PATRON_RUTAS='(^|/)\.secrets/|\.sqlite($|\.)|consolidacion/data/(db|entrada|salida|pruebas)/|consolidacion/logs/|modules/consulta/js/datos\.js|modules/tablero/js/datos_tablero\.js|modules/consulta/descargas/'

ENCONTRADAS="$(git ls-files | grep -E "$PATRON_RUTAS" || true)"
if [ -n "$ENCONTRADAS" ]; then
  while IFS= read -r archivo; do aviso "rastreado: $archivo"; done <<< "$ENCONTRADAS"
  echo "    → sáquelos del índice con: git rm --cached <archivo>"
else
  echo "  ✓ ninguna"
fi
echo

##============================================================================##
##=== 2. Volcados de datos, bajo cualquier nombre                          ===##
##============================================================================##

# El chequeo de arriba va por ruta y se le escaparía una copia con otro nombre
# (datos_v2.js, respaldo.js). Este va por contenido: los dos volcados del
# pipeline empiezan por una asignación reconocible.
echo "2. Volcados window.DATOS / window.TABLERO en archivos rastreados"

VOLCADOS=""
while IFS= read -r archivo; do
  [ -f "$archivo" ] || continue
  if head -c 200 "$archivo" | grep -qE '^window\.(DATOS|TABLERO) *='; then
    VOLCADOS="${VOLCADOS}${archivo}"$'\n'
  fi
done < <(git ls-files '*.js')

if [ -n "$VOLCADOS" ]; then
  while IFS= read -r archivo; do
    [ -n "$archivo" ] && aviso "volcado de la base rastreado: $archivo"
  done <<< "$VOLCADOS"
else
  echo "  ✓ ninguno"
fi
echo

##============================================================================##
##=== 3. El token de extracción, si existe en esta máquina                 ===##
##============================================================================##

# Se busca el VALOR real, no el nombre de la variable: es la única forma de
# detectar que alguien lo pegó dentro de un .R o un .js «solo para probar».
echo "3. El token de extracción dentro de archivos rastreados"

RUTA_TOKEN="consolidacion/.secrets/token_exportacion.txt"
if [ -f "$RUTA_TOKEN" ]; then
  TOKEN="$(tr -d '[:space:]' < "$RUTA_TOKEN")"
  if [ ${#TOKEN} -ge 12 ]; then
    FUGAS="$(git grep -l -F "$TOKEN" -- . 2>/dev/null || true)"
    if [ -n "$FUGAS" ]; then
      while IFS= read -r archivo; do aviso "el token aparece en: $archivo"; done <<< "$FUGAS"
      echo "    → rote TOKEN_EXPORTACION en las Propiedades del Apps Script"
    else
      echo "  ✓ no aparece"
    fi
  else
    echo "  · el archivo del token está vacío o es demasiado corto; no se compara"
  fi
else
  echo "  · no hay token en esta máquina; nada que comparar"
fi
echo

##============================================================================##
##=== 4. Que el .gitignore siga cubriendo lo que debe                      ===##
##============================================================================##

# Que hoy no esté rastreado no basta: si alguien borra una línea del .gitignore,
# el próximo `git add -A` lo vuelve a meter sin que nadie se dé cuenta.
echo "4. Cobertura del .gitignore"

for ruta in \
  "consolidacion/.secrets/token_exportacion.txt" \
  "consolidacion/data/db/base_oficial.sqlite" \
  "consolidacion/data/salida/js/datos.js" \
  "consolidacion/logs/pipeline_20260101.log" \
  "modules/consulta/js/datos.js" \
  "modules/tablero/js/datos_tablero.js"
do
  if git check-ignore -q "$ruta"; then
    echo "  ✓ ignorado: $ruta"
  else
    aviso "NO está en .gitignore: $ruta"
  fi
done
echo

##============================================================================##
##=== Resultado                                                            ===##
##============================================================================##

if [ "$FALLOS" -eq 0 ]; then
  echo "Sin hallazgos: el repositorio público no lleva datos personales ni credenciales."
  exit 0
fi

echo "$FALLOS hallazgo(s). NO publique hasta resolverlos."
exit 1
