/* ============================================================
   Tablero de control — lógica y gráficos · VARIANTE v2
   CIENFI · Universidad Icesi · Alcaldía de Santiago de Cali
   ------------------------------------------------------------
   Copia de tablero.js con una sola diferencia de fondo: el
   Resumen es una PORTADA, no una repetición del tablero.

   En tablero.js el Resumen dibujaba, en tamaño completo, ocho
   paneles que ya existían en las otras cuatro pestañas. Aquí
   el Resumen muestra cuatro cifras titulares y cuatro puertas
   de entrada —una por pestaña— con el dato principal de cada
   una y una miniatura de su gráfico. Quien quiera el detalle
   entra a la pestaña; el Resumen orienta, no agota.

   Qué se movió respecto de tablero.js:
     · hogares por tamaño   Resumen -> Personas (es un atributo
                            de las personas registradas)
     · evolución            sección entera -> franja al pie del
                            Resumen (no tiene pestaña propia)
     · salud y comunas      dejaron de ser KPI sueltos: son el
                            dato de las puertas de Personas y
                            Territorio
   Esta es la versión que quedó: index.html apunta aquí. La
   anterior sigue en tablero.js, servida por index_v1.html, que no
   está enlazado desde ninguna parte.
   ------------------------------------------------------------
   Los datos llegan en window.TABLERO (js/datos_tablero.js, que
   regenera pipeline/05_exportar_tablero.R en cada corrida).
   Todo se agrega y filtra aquí, en el navegador.

   Arquitectura de vistas:
     Resumen | Territorio | Personas | Viviendas | Necesidades
   Los componentes que aparecen en más de una vista (mapa,
   pirámide, habitabilidad, daño, ayudas, situaciones) reciben un
   prefijo de contenedor: t- (territorio), p- (personas),
   v- (viviendas), n- (necesidades). Las puertas del resumen
   usan pt-, pp-, pv- y pn-.

   Gráficos en SVG propio, sin librerías externas: el aplicativo
   debe funcionar con doble clic y sin conexión.

   Niveles de observación (¡no mezclar!):
     personas   una fila por persona canónica
     hogares    id_encuesta únicos dentro de personas
     viviendas  una fila por inspección canónica
     danio      una fila por elemento evaluado × vivienda
   ============================================================ */

(function () {
'use strict';

/* ------------------------------------------------------------
   Saneamiento de la codificación de los datos
   ------------------------------------------------------------
   El exportador escribe a veces los acentos como los bytes UTF-8
   en texto plano: "18-59 a<c3><b1>os" en lugar de "18-59 años".
   Cuando eso pasa, las categorías dejan de coincidir con las
   listas de orden del tablero y los conteos salen en cero.

   Aquí se reparan al cargar. La corrección de fondo va en el
   exportador (05_exportar_tablero.R, en el repositorio del
   pipeline); esto deja al tablero a salvo mientras tanto y no
   estorba cuando el dato llega bien.
   ------------------------------------------------------------ */
function repararTexto(s) {
  if (typeof s !== 'string' || s.indexOf('<') === -1) return s;
  return s.replace(/(?:<[0-9a-f]{2}>)+/g, (grupo) => {
    const bytes = (grupo.match(/[0-9a-f]{2}/g) || []).map((h) => parseInt(h, 16));
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (e) {
      return grupo;                 /* no era UTF-8: se deja como venía */
    }
  });
}

function repararDatos(nodo) {
  if (Array.isArray(nodo)) return nodo.map(repararDatos);
  if (nodo && typeof nodo === 'object') {
    Object.keys(nodo).forEach((k) => { nodo[k] = repararDatos(nodo[k]); });
    return nodo;
  }
  return repararTexto(nodo);
}

const D = repararDatos(window.TABLERO);

/* paleta secundaria de datos — máximo cinco */
const COLOR = {
  d1: '#1F3A8F', d2: '#395CE0', d3: '#7A93F0', d4: '#0E7C86', d5: '#C0562F'
};
/* colores semánticos (solo cuando el significado coincide con la categoría real) */
const SEMAFORO = { verde: '#147A3D', ambar: '#8A6D1F', rojo: '#B3261E' };

/* orden fijo de las categorías ordinales */
const ORDEN_ETARIO = ['0-5 años', '6-17 años', '18-59 años', '60 años o más'];
const NOMBRE_ETARIO = {
  '0-5 años': 'Primera infancia', '6-17 años': 'Niños y adolescentes',
  '18-59 años': 'Adultos', '60 años o más': 'Personas mayores'
};
const ORDEN_NIVEL  = ['Leve', 'Moderado', 'Severo', 'Colapso total'];
const COLOR_NIVEL  = { 'Leve': COLOR.d3, 'Moderado': COLOR.d2,
                       'Severo': COLOR.d1, 'Colapso total': COLOR.d5 };
/* estado del inmueble: categorías reales de la base con acento semántico */
const COLOR_INMUEBLE = { 'Habitable': SEMAFORO.verde, 'No habitable': SEMAFORO.ambar,
                         'Destruida': SEMAFORO.rojo };
/* de menos a más grave; lo que no esté aquí se ordena al final */
const ORDEN_INMUEBLE = ['Habitable', 'No habitable', 'Destruida'];
const REQUIERE_ATENCION = 'Requiere asistencia médica';

const PERSONAS  = ['persona', 'personas'];
const VIVIENDAS = ['vivienda', 'viviendas'];
const HOGARES   = ['hogar', 'hogares'];

const FUENTE = 'Fuente: base oficial consolidada de afectaciones, CIENFI · Universidad Icesi · Alcaldía de Santiago de Cali.';

/* ============================================================
   1. Utilidades
   ============================================================ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function contar(filas, campo) {
  const mapa = new Map();
  filas.forEach((f) => {
    const v = f[campo];
    if (v == null || v === '') return;
    mapa.set(v, (mapa.get(v) || 0) + 1);
  });
  return mapa;
}

/* convierte un Map en las filas que consumen los gráficos */
function aFilas(mapa, orden) {
  let filas = [...mapa].map(([etiqueta, valor]) => ({ etiqueta, valor }));
  if (orden) filas.sort((a, b) => orden.indexOf(a.etiqueta) - orden.indexOf(b.etiqueta));
  else filas.sort((a, b) => b.valor - a.valor);
  return filas;
}

function fmt(n) { return n.toLocaleString('es-CO'); }

/* la unidad puede venir como par [singular, plural] para no rotular "1 hogares" */
function cantidad(n, unidad) {
  const u = Array.isArray(unidad) ? (n === 1 ? unidad[0] : unidad[1]) : unidad;
  return `${fmt(n)} ${u}`;
}

function periodoTexto() {
  const d = estado.desde, h = estado.hasta;
  if (!d && !h) return 'periodo completo';
  if (d && h) return `${d} a ${h}`;
  return d ? `desde ${d}` : `hasta ${h}`;
}

function pie(unidad) {
  return `${FUENTE} Unidad: ${unidad}. Periodo: ${periodoTexto()}. ` +
         `Corte: ${D.actualizado || 'sin corrida registrada'}.`;
}

function vacio(cont, mensaje) {
  cont.innerHTML = `<p class="vacio">${esc(mensaje)}</p>`;
}

const SIN_REGISTROS = 'Sin registros para los filtros seleccionados.';

/* ============================================================
   2. Filtros — única fuente de verdad del universo mostrado
   ============================================================ */

/* Tres bloques de filtros, por el universo al que aplican:
     generales  comuna y periodo — personas y viviendas comparten ambos
     personas   grupo de edad, estado del inmueble, ayuda solicitada
     viviendas  evacuación y nivel de daño
   La base NO enlaza cada persona con una ficha de vivienda concreta (solo
   sabe si el hogar quedó enlazado, no con cuál en el nivel del tablero), así
   que un filtro de personas no puede filtrar viviendas sin inventar esa
   relación. Por eso cada filtro declara su alcance en el texto de universo. */
const estado = {
  comuna: '', desde: '', hasta: '',
  etario: '', inmueble: '', ayuda: '',
  evacuacion: '', danio: ''
};

/* campos 0/1 de ayuda humanitaria: valor del selector -> campo real */
const CAMPOS_AYUDA = {
  ahe_alimentaria:    'AHE alimentaria',
  ahe_no_alimentaria: 'AHE no alimentaria',
  mat_rehab_vivienda: 'Material de rehabilitación',
  sub_arriendo:       'Subsidio de arriendo'
};

/* El periodo va aparte de la comuna porque el resumen que sale al pasar el
   cursor por el mapa necesita contar UNA comuna cualquiera con todos los demás
   filtros puestos: si el predicado incluyera la comuna seleccionada, al tener
   la 17 activa el resumen de la 18 daría cero. */
function pasaPeriodo(f) {
  if (estado.desde && (!f.fecha || f.fecha < estado.desde)) return false;
  if (estado.hasta && (!f.fecha || f.fecha > estado.hasta)) return false;
  return true;
}

/* comuna y periodo: aplican a cualquier registro que los tenga */
function pasaGeneral(f) {
  if (estado.comuna && String(f.comuna) !== estado.comuna) return false;
  return pasaPeriodo(f);
}

/* filtros propios de cada universo, sin los generales */
function cumplePersona(p) {
  if (estado.etario   && p.grupo_etario    !== estado.etario) return false;
  if (estado.inmueble && p.estado_inmueble !== estado.inmueble) return false;
  if (estado.ayuda    && p[estado.ayuda]   !== 'Sí') return false;
  return true;
}

function cumpleVivienda(v, conDanio) {
  if (estado.evacuacion && v.requiere_evacuacion !== estado.evacuacion) return false;
  if (conDanio && !conDanio.has(v.id_encuesta)) return false;
  return true;
}

function personas() {
  return D.personas.filter((p) => pasaGeneral(p) && cumplePersona(p));
}

/* las viviendas con el nivel de daño buscado en cualquiera de sus elementos */
function idsConDanio() {
  return new Set(D.danio.filter((d) => d.nivel === estado.danio).map((d) => d.id_encuesta));
}

function viviendas() {
  const conDanio = estado.danio ? idsConDanio() : null;
  return D.viviendas.filter((v) => pasaGeneral(v) && cumpleVivienda(v, conDanio));
}

function revisar() { return D.revisar.filter(pasaGeneral); }

/* el daño se filtra por las viviendas que quedaron vigentes tras el filtro */
function danio() {
  const vivas = new Set(viviendas().map((v) => v.id_encuesta));
  return D.danio.filter((d) => vivas.has(d.id_encuesta));
}

/* frase única que declara sobre qué se está contando y con qué alcance */
function pintarUniverso() {
  const per = personas(), viv = viviendas();
  const partes = [];
  if (estado.comuna) partes.push(`Comuna ${estado.comuna}`);
  if (estado.desde || estado.hasta) partes.push(periodoTexto());

  const dePersonas = [];
  if (estado.etario)   dePersonas.push(estado.etario);
  if (estado.inmueble) dePersonas.push(`inmueble ${estado.inmueble.toLowerCase()}`);
  if (estado.ayuda)    dePersonas.push(`solicita ${CAMPOS_AYUDA[estado.ayuda].toLowerCase()}`);

  const deViviendas = [];
  if (estado.evacuacion) deViviendas.push(`evacuación: ${estado.evacuacion.toLowerCase()}`);
  if (estado.danio)      deViviendas.push(`daño ${estado.danio.toLowerCase()}`);

  let texto = `Mostrando <b>${cantidad(per.length, PERSONAS)}</b> en ` +
              `<b>${cantidad(hogaresUnicos(per).size, HOGARES)}</b> y ` +
              `<b>${cantidad(viv.length, VIVIENDAS)}</b>`;
  texto += partes.length ? ` · ${esc(partes.join(' · '))}` : ' · toda la ciudad, periodo completo';
  if (dePersonas.length) {
    texto += ` · <span class="alcance">personas: ${esc(dePersonas.join(', '))}</span>`;
  }
  if (deViviendas.length) {
    texto += ` · <span class="alcance">viviendas: ${esc(deViviendas.join(', '))}</span>`;
  }
  if (dePersonas.length && deViviendas.length === 0 && viv.length) {
    texto += '. Los filtros de personas no alteran el conteo de viviendas.';
  } else if (deViviendas.length && dePersonas.length === 0 && per.length) {
    texto += '. Los filtros de viviendas no alteran el conteo de personas.';
  }
  $('universo').innerHTML = texto;
}

/* hogares = encuestas de familia únicas dentro de las personas filtradas */
function hogaresUnicos(per) {
  return new Set((per || personas()).map((p) => p.id_encuesta));
}

/* ============================================================
   3. Primitivas SVG
   ------------------------------------------------------------
   El viewBox usa el ancho real del contenedor, no un ancho fijo:
   así el SVG se dibuja 1:1 y el texto conserva su tamaño en px
   sea cual sea el ancho del panel.
   ============================================================ */

function anchoDe(cont) {
  const w = cont.clientWidth || cont.parentElement.clientWidth || 640;
  return Math.max(320, Math.round(w));
}

function svg(ancho, alto, contenido) {
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img">${contenido}</svg>`;
}

function texto(x, y, s, clase, ancla) {
  return `<text x="${x}" y="${y}" class="${clase}" text-anchor="${ancla || 'start'}"` +
         ` dominant-baseline="middle">${s}</text>`;
}

/* margen izquierdo suficiente para la etiqueta más larga, sin comerse el gráfico */
function margenEtiquetas(filas, ancho) {
  const largo = Math.max(...filas.map((f) => String(f.etiqueta).length));
  return Math.round(Math.min(ancho * 0.38, Math.max(96, largo * 6.7 + 14)));
}

/* barras horizontales; color fijo o función por fila (para acentos semánticos).
   `mini` dibuja la misma barra en escala reducida, para las miniaturas de las
   puertas del resumen: mismo gráfico, no uno distinto. */
function barrasH(cont, filas, color, unidad, mini) {
  if (!filas.length) { vacio(cont, SIN_REGISTROS); return; }

  const ancho = anchoDe(cont);
  const izq = margenEtiquetas(filas, ancho), der = mini ? 42 : 52;
  const altoBarra = mini ? 15 : 22, sep = mini ? 8 : 12, arriba = mini ? 4 : 8;
  const alto = arriba + filas.length * (altoBarra + sep);
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const util = ancho - izq - der;
  const colorDe = typeof color === 'function' ? color : () => color;
  const cEti = mini ? 'g-etiqueta g-etiqueta--mini' : 'g-etiqueta';
  const cVal = mini ? 'g-valor g-valor--mini' : 'g-valor';

  let s = '';
  filas.forEach((f, i) => {
    const y = arriba + i * (altoBarra + sep);
    const medio = y + altoBarra / 2;
    const w = Math.max(1, (f.valor / max) * util);
    s += texto(izq - (mini ? 9 : 12), medio, esc(f.etiqueta), cEti, 'end');
    s += `<rect x="${izq}" y="${y}" width="${w}" height="${altoBarra}" rx="3"` +
         ` fill="${colorDe(f)}" class="g-barra"><title>${esc(f.etiqueta)}: ${cantidad(f.valor, unidad)}</title></rect>`;
    s += texto(izq + w + (mini ? 8 : 10), medio, fmt(f.valor), cVal);
  });
  cont.innerHTML = svg(ancho, alto, s);
}

/* pirámide poblacional: dos series espejadas sobre un eje central */
/* Tope "redondo" del eje: 1, 2, 5 × 10^n. Con muestras pequeñas devuelve el
   propio máximo, porque redondear 3 personas hasta 10 aplasta la pirámide y
   hace parecer que no hay nadie. */
function topeEje(max) {
  if (max <= 5) return Math.max(1, max);
  const exp  = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / exp;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * exp;
}

/* marcas del eje: con pocos casos, una por unidad; con muchos, cuatro tramos */
function marcasEje(tope) {
  if (tope <= 5) return Array.from({ length: tope + 1 }, (_, i) => i);
  return [0, tope / 4, tope / 2, (tope * 3) / 4, tope].map(Math.round)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function piramide(cont, rangos, izqDatos, derDatos, nombreIzq, nombreDer) {
  const todos = rangos.flatMap((r) => [izqDatos.get(r) || 0, derDatos.get(r) || 0]);
  if (!todos.some((n) => n > 0)) { vacio(cont, SIN_REGISTROS); return; }

  const totalIzq = [...izqDatos.values()].reduce((a, b) => a + b, 0);
  const totalDer = [...derDatos.values()].reduce((a, b) => a + b, 0);

  const ancho  = anchoDe(cont);
  /* columna central fija para las edades: así las barras de ambos lados
     arrancan del mismo sitio y la pirámide se lee simétrica */
  const etiquetaAncho = 54, hueco = etiquetaAncho / 2;
  const centro   = ancho / 2;
  const altoBarra = 18, sep = 6;
  const cabecera = 30, ejeAlto = 30, arriba = cabecera + 6;
  const alto = arriba + rangos.length * (altoBarra + sep) + ejeAlto;
  const baseY = arriba + rangos.length * (altoBarra + sep);

  const max   = Math.max(...todos);
  const tope  = topeEje(max);
  const util  = centro - hueco - 42;                 /* espacio de barra por lado */
  const escalaX = (n) => (n / tope) * util;

  /* --- cabecera: nombre y total de cada lado --- */
  let s = texto(centro - hueco - util, cabecera - 14, `${esc(nombreIzq)} · ${fmt(totalIzq)}`,
                'g-serie-nombre', 'start');
  s += texto(centro + hueco + util, cabecera - 14, `${esc(nombreDer)} · ${fmt(totalDer)}`,
             'g-serie-nombre', 'end');

  /* --- rejilla vertical y marcas del eje, simétricas --- */
  marcasEje(tope).forEach((v) => {
    [-1, 1].forEach((dir) => {
      if (v === 0 && dir === 1) return;              /* el cero se dibuja una vez */
      const x = centro + dir * (hueco + escalaX(v));
      s += `<line x1="${x}" y1="${arriba - 4}" x2="${x}" y2="${baseY}" class="g-rejilla"/>`;
      s += texto(x, baseY + 14, fmt(v), 'g-valor', 'middle');
    });
  });

  /* --- barras --- */
  rangos.forEach((r, i) => {
    const y = arriba + (rangos.length - 1 - i) * (altoBarra + sep);
    const medio = y + altoBarra / 2;

    /* franja de fondo alterna: guía la vista a lo ancho sin añadir líneas */
    if (i % 2 === 0) {
      s += `<rect x="${centro - hueco - util}" y="${y - sep / 2}" width="${2 * (hueco + util)}"` +
           ` height="${altoBarra + sep}" class="g-franja"/>`;
    }
    s += texto(centro, medio, esc(r), 'g-edad', 'middle');

    [[izqDatos.get(r) || 0, -1, COLOR.d2, nombreIzq], [derDatos.get(r) || 0, 1, COLOR.d4, nombreDer]]
      .forEach(([n, dir, color, nombre]) => {
        if (n === 0) return;
        const w = Math.max(2, escalaX(n));
        const base = centro + dir * hueco;
        const x = dir < 0 ? base - w : base;
        s += `<rect x="${x}" y="${y}" width="${w}" height="${altoBarra}" fill="${color}"` +
             ` class="g-barra"><title>${esc(nombre)}, ${esc(r)} años: ${cantidad(n, PERSONAS)}</title></rect>`;
        s += texto(dir < 0 ? x - 7 : x + w + 7, medio, fmt(n), 'g-valor', dir < 0 ? 'end' : 'start');
      });
  });

  /* --- eje base y línea central --- */
  s += `<line x1="${centro - hueco - util}" y1="${baseY}" x2="${centro + hueco + util}" y2="${baseY}" class="g-eje"/>`;
  s += `<line x1="${centro}" y1="${arriba - 4}" x2="${centro}" y2="${baseY}" class="g-eje"/>`;
  s += texto(centro, baseY + 27, 'personas', 'g-etiqueta', 'middle');

  cont.innerHTML = svg(ancho, alto, s);
}

/* matriz elemento × nivel de daño: celdas sombreadas por conteo */
function matriz(cont, filas, columnas, coloresCol, unidad) {
  if (!filas.length) { vacio(cont, SIN_REGISTROS); return; }

  const ancho = anchoDe(cont);
  const izq = margenEtiquetas(filas, ancho), arriba = 30;
  const altoCelda = 34, sepFila = 6;
  const utilX = ancho - izq - 10;
  const anchoCelda = utilX / columnas.length;
  const alto = arriba + filas.length * (altoCelda + sepFila);
  const max = Math.max(1, ...filas.flatMap((f) => columnas.map((c) => f.valores[c] || 0)));

  let s = '';
  columnas.forEach((c, j) => {
    s += texto(izq + j * anchoCelda + anchoCelda / 2, 12, esc(c), 'g-etiqueta', 'middle');
  });
  filas.forEach((f, i) => {
    const y = arriba + i * (altoCelda + sepFila);
    const medio = y + altoCelda / 2;
    s += texto(izq - 12, medio, esc(f.etiqueta), 'g-etiqueta', 'end');
    columnas.forEach((c, j) => {
      const n = f.valores[c] || 0;
      const x = izq + j * anchoCelda;
      if (!n) {
        s += `<rect x="${x}" y="${y}" width="${anchoCelda}" height="${altoCelda}" rx="4"` +
             ` fill="#F7F8FA" class="g-celda"/>`;
        return;
      }
      const opacidad = 0.18 + 0.72 * (n / max);
      s += `<rect x="${x}" y="${y}" width="${anchoCelda}" height="${altoCelda}" rx="4"` +
           ` fill="${coloresCol[c]}" fill-opacity="${opacidad.toFixed(2)}" class="g-celda g-barra">` +
           `<title>${esc(f.etiqueta)} · ${esc(c)}: ${cantidad(n, unidad)}</title></rect>`;
      s += texto(x + anchoCelda / 2, medio, fmt(n),
                 `g-celda-num`, 'middle');
    });
  });
  cont.innerHTML = svg(ancho, alto, s);
}

/* serie temporal acumulada: una línea por serie; con una sola fecha no se
   dibuja una falsa tendencia, se declara el punto disponible */
/* `altoPedido` permite la versión franja del resumen: la misma serie, con la
   altura de un renglón alto en vez de la de un panel entero */
function lineas(cont, fechas, series, unidad, altoPedido) {
  if (!fechas.length) { vacio(cont, SIN_REGISTROS); return; }
  if (fechas.length === 1) {
    const partes = series.map((s) => cantidad(s.valores[0], s.unidad));
    cont.innerHTML = `<p class="vacio">1 fecha de registro disponible (${esc(fechas[0])}): ` +
                     `${esc(partes.join(' y '))}. La serie se dibujará cuando existan más fechas.</p>`;
    return;
  }

  const alto = altoPedido || 240;
  const ancho = anchoDe(cont);
  const izq = 46, der = 18, arriba = altoPedido ? 16 : 34, abajo = altoPedido ? 28 : 34;
  const utilX = ancho - izq - der, utilY = alto - arriba - abajo;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const px = (i) => izq + (i / (fechas.length - 1)) * utilX;
  const py = (v) => arriba + utilY - (v / max) * utilY;

  let s = texto(0, 12, esc(unidad), 'g-etiqueta');

  [0, Math.round(max / 2), max].forEach((v) => {
    const y = py(v);
    s += `<line x1="${izq}" y1="${y}" x2="${ancho - der}" y2="${y}" class="g-rejilla"/>`;
    s += texto(izq - 10, y, fmt(v), 'g-valor', 'end');
  });

  const marcas = [...new Set([0, Math.floor((fechas.length - 1) / 2), fechas.length - 1])];
  marcas.forEach((i) => {
    s += texto(px(i), alto - abajo + 20, esc(fechas[i]), 'g-etiqueta',
               i === 0 ? 'start' : (i === fechas.length - 1 ? 'end' : 'middle'));
  });

  series.forEach((serie) => {
    const d = serie.valores.map((v, i) => `${i ? 'L' : 'M'}${px(i)} ${py(v)}`).join(' ');
    s += `<path d="${d}" fill="none" stroke="${serie.color}" stroke-width="2"` +
         ` stroke-linejoin="round" stroke-linecap="round"/>`;
    serie.valores.forEach((v, i) => {
      s += `<circle cx="${px(i)}" cy="${py(v)}" r="3" fill="${serie.color}">` +
           `<title>${esc(fechas[i])} · ${esc(serie.nombre)}: ${fmt(v)}</title></circle>`;
    });
  });
  cont.innerHTML = svg(ancho, alto, s);
}

function leyenda(cont, items) {
  cont.innerHTML = items.map((i) =>
    `<span class="leyenda__item"><span class="leyenda__marca" style="background:${i.color}"></span>${esc(i.nombre)}</span>`
  ).join('');
}

/* franja de indicadores compactos (grupos etarios, lectura de hogares) */
function franja(cont, items) {
  cont.innerHTML = items.map((i) =>
    `<div class="etario"><p class="etario__cifra">${fmt(i.cifra)}</p>` +
    `<p class="etario__rango">${esc(i.rango)}</p>` +
    `<p class="etario__nombre">${esc(i.nombre)}</p></div>`
  ).join('');
}

/* ============================================================
   4. Indicadores principales
   ============================================================ */

/* Cuatro cifras, no seis: las que un no técnico repite de memoria. Las dos que
   se quitaron no se perdieron — personas que requieren atención médica es
   ahora la lectura de la puerta de Personas, y comunas con registros la de
   Territorio, donde cada una significa algo. */
function pintarIndicadores() {
  const per = personas(), viv = viviendas();
  const hogares = hogaresUnicos(per).size;
  const evac = viv.filter((v) => v.requiere_evacuacion === 'Sí').length;
  const geo = viv.filter((v) => v.latitud != null && v.longitud != null).length;
  const conVivienda = per.filter((p) => p.match_status && p.match_status.startsWith('matched')).length;

  const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '—';

  $('kpi-personas').textContent = fmt(per.length);
  $('kpi-personas-meta').textContent = `${pct(conVivienda, per.length)} con vivienda asociada`;

  $('kpi-familias').textContent = fmt(hogares);
  $('kpi-familias-meta').textContent = hogares
    ? `${(per.length / hogares).toFixed(1)} personas por hogar` : '';

  $('kpi-viviendas').textContent = fmt(viv.length);
  $('kpi-viviendas-meta').textContent = `${fmt(geo)} de ${fmt(viv.length)} georreferenciadas`;

  $('kpi-evacuacion').textContent = fmt(evac);
  $('kpi-evacuacion-meta').textContent = `${pct(evac, viv.length)} de las viviendas inspeccionadas`;
  /* el universo filtrado lo escribe pintarUniverso(), que además declara el
     alcance de cada filtro */
}

/* ============================================================
   4b. Portada — una puerta de entrada por pestaña
   ------------------------------------------------------------
   Cada puerta responde tres cosas y nada más: una cifra, una
   frase que la sitúa y una miniatura del gráfico que hay
   detrás. Todas leen del mismo universo filtrado que el resto
   del tablero, así que la portada reacciona a los filtros
   igual que las pestañas.
   ============================================================ */

const PCT = (a, b) => b ? Math.round((a / b) * 100) + '%' : '—';

/* --- Territorio: dónde está concentrado --- */
function puertaTerritorio() {
  const per = personas(), viv = viviendas();
  const comunas = new Set(per.concat(viv).map((f) => f.comuna).filter((c) => c != null));

  $('pt-cifra').textContent = comunas.size ? `${fmt(comunas.size)} de 22` : '—';

  const porComuna = contar(per.filter((p) => p.comuna != null), 'comuna');
  const filas = aFilas(porComuna).slice(0, 5)
                  .map((f) => ({ etiqueta: `Comuna ${f.etiqueta}`, valor: f.valor }));

  $('pt-lectura').textContent = filas.length
    ? `${filas[0].etiqueta} concentra ${PCT(filas[0].valor, per.length)} de las personas registradas. ` +
      `Aquí se ven las cinco primeras.`
    : 'Ninguna comuna con registros para los filtros seleccionados.';

  barrasH($('pt-mini'), filas, COLOR.d2, PERSONAS, true);
}

/* --- Personas: quiénes están afectados --- */
function puertaPersonas() {
  const per = personas();
  const etario = contar(per, 'grupo_etario');
  /* los dos extremos de la vida son los que condicionan la atención */
  const vulnerables = (etario.get('0-5 años') || 0) + (etario.get('6-17 años') || 0) +
                      (etario.get('60 años o más') || 0);
  const salud = per.filter((p) => p.estado_salud === REQUIERE_ATENCION).length;

  $('pp-cifra').textContent = fmt(vulnerables);
  $('pp-lectura').textContent =
    `Menores de edad y adultos mayores, ${PCT(vulnerables, per.length)} del total. ` +
    `${fmt(salud)} ${salud === 1 ? 'persona requiere' : 'personas requieren'} asistencia médica.`;

  const filas = ORDEN_ETARIO.map((g) => ({ etiqueta: g, valor: etario.get(g) || 0 }))
                            .filter((f) => f.valor > 0);
  barrasH($('pp-mini'), filas, COLOR.d4, PERSONAS, true);
}

/* --- Viviendas: en qué estado quedaron --- */
/* Una vivienda se cuenta por su peor elemento: si la cubierta está en colapso,
   la vivienda es de colapso aunque los muros estén leves. Contar por elemento
   —como hace el panel de la pestaña— multiplicaría cada vivienda por el número
   de elementos evaluados, y aquí la unidad tiene que ser la vivienda. */
function puertaViviendas() {
  const peor = new Map();
  danio().forEach((d) => {
    const actual = peor.get(d.id_encuesta);
    if (actual == null || ORDEN_NIVEL.indexOf(d.nivel) > ORDEN_NIVEL.indexOf(actual)) {
      peor.set(d.id_encuesta, d.nivel);
    }
  });

  const graves = [...peor.values()]
    .filter((n) => n === 'Severo' || n === 'Colapso total').length;

  $('pv-cifra').textContent = fmt(graves);
  $('pv-lectura').textContent = peor.size
    ? `Viviendas con daño severo o colapso en algún elemento, ` +
      `${PCT(graves, peor.size)} de las ${fmt(peor.size)} con inspección diligenciada.`
    : 'Ninguna vivienda con nivel de daño diligenciado para los filtros seleccionados.';

  const conteo = new Map();
  peor.forEach((n) => conteo.set(n, (conteo.get(n) || 0) + 1));
  barrasH($('pv-mini'), aFilas(conteo, ORDEN_NIVEL),
          (f) => COLOR_NIVEL[f.etiqueta] || COLOR.d1, VIVIENDAS, true);
}

/* --- Necesidades: qué están pidiendo --- */
function puertaNecesidades() {
  const per = personas();
  const ayudas = [['ahe_alimentaria', 'AHE alimentaria'],
                  ['ahe_no_alimentaria', 'AHE no alimentaria'],
                  ['mat_rehab_vivienda', 'Material de rehabilitación'],
                  ['sub_arriendo', 'Subsidio de arriendo']];
  const filas = ayudas.map(([campo, etiqueta]) => ({
    etiqueta, valor: per.filter((p) => p[campo] === 'Sí').length
  })).sort((a, b) => b.valor - a.valor);

  /* una persona puede pedir varias ayudas: el total no es la suma de las barras */
  const alMenosUna = per.filter((p) => ayudas.some(([c]) => p[c] === 'Sí')).length;

  $('pn-cifra').textContent = fmt(alMenosUna);
  $('pn-lectura').textContent = filas[0] && filas[0].valor
    ? `Personas que solicitan al menos una ayuda, ${PCT(alMenosUna, per.length)} del total. ` +
      `La más pedida es ${filas[0].etiqueta.toLowerCase()}.`
    : 'Ninguna ayuda solicitada para los filtros seleccionados.';

  barrasH($('pn-mini'), filas.filter((f) => f.valor > 0), COLOR.d3, PERSONAS, true);
}

function pintarPuertas() {
  puertaTerritorio();
  puertaPersonas();
  puertaViviendas();
  puertaNecesidades();
}

/* ============================================================
   5. Personas y hogares
   ============================================================ */

function pintarPiramide(pfx) {
  const per = personas();
  const orden = [...new Set(D.personas.map((p) => p.rango_edad))].filter(Boolean)
                  .sort((a, b) => parseInt(a) - parseInt(b));
  /* rangos contiguos entre el menor y el mayor observados: sin huecos, la
     pirámide se lee como una distribución y no como categorías sueltas */
  const todos = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39',
                 '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'];
  const rangos = orden.length
    ? todos.slice(todos.indexOf(orden[0]), todos.indexOf(orden[orden.length - 1]) + 1)
    : [];

  const hombres = contar(per.filter((p) => p.genero === 'Masculino'), 'rango_edad');
  const mujeres = contar(per.filter((p) => p.genero === 'Femenino'), 'rango_edad');

  piramide($(`${pfx}-piramide`), rangos, hombres, mujeres, 'Hombres', 'Mujeres');
  leyenda($(`${pfx}-l-piramide`), [{ nombre: 'Hombres', color: COLOR.d2 },
                                   { nombre: 'Mujeres', color: COLOR.d4 }]);

  /* grupos etarios como apoyo compacto de la pirámide, no como tarjetas */
  const etario = contar(per, 'grupo_etario');
  franja($(`${pfx}-etarios`), ORDEN_ETARIO.map((g) => ({
    cifra: etario.get(g) || 0,
    rango: g.replace(' años', '').replace(' o más', '+'),
    nombre: NOMBRE_ETARIO[g]
  })));

  $(`${pfx}-f-piramide`).innerHTML = pie('personas');
}

/* el tamaño del hogar se cuenta sobre las personas canónicas, no sobre el
   n_personas declarado: así coincide con el resto de las cifras del tablero */
function pintarHogares() {
  const porHogar = new Map();
  personas().forEach((p) => porHogar.set(p.id_encuesta, (porHogar.get(p.id_encuesta) || 0) + 1));

  const etiqueta = (n) => (n >= 5 ? '5 o más personas' : `${n} ${n === 1 ? 'persona' : 'personas'}`);
  const orden = ['1 persona', '2 personas', '3 personas', '4 personas', '5 o más personas'];

  const conteo = new Map();
  porHogar.forEach((n) => {
    const e = etiqueta(n);
    conteo.set(e, (conteo.get(e) || 0) + 1);
  });

  barrasH($('g-hogares'), aFilas(conteo, orden), COLOR.d4, HOGARES);

  /* lectura operacional derivada de la misma distribución */
  const tam = [...porHogar.values()];
  franja($('g-hogares-lectura'), [
    { cifra: tam.filter((n) => n <= 2).length, rango: 'Pequeños', nombre: '1 a 2 personas' },
    { cifra: tam.filter((n) => n === 3 || n === 4).length, rango: 'Medianos', nombre: '3 a 4 personas' },
    { cifra: tam.filter((n) => n >= 5).length, rango: 'Grandes', nombre: '5 o más personas' }
  ]);

  $('f-hogares').innerHTML = pie('hogares') +
    ' El tamaño es el número de personas registradas en el hogar, descontando los repetidos.';
}

/* ============================================================
   6. Viviendas
   ============================================================ */

function pintarHabitabilidad(pfx) {
  const filas = aFilas(contar(personas(), 'estado_inmueble'));
  barrasH($(`${pfx}-habitabilidad`), filas,
          (f) => COLOR_INMUEBLE[f.etiqueta] || COLOR.d1, PERSONAS);
  $(`${pfx}-f-habitabilidad`).innerHTML = pie('personas') +
    ' Categorías tal como las registra el formulario.';
}

function pintarDanio(pfx) {
  const porElemento = new Map();
  danio().forEach((d) => {
    if (!porElemento.has(d.elemento)) porElemento.set(d.elemento, {});
    const v = porElemento.get(d.elemento);
    v[d.nivel] = (v[d.nivel] || 0) + 1;
  });
  const filas = [];
  porElemento.forEach((valores, etiqueta) => filas.push({ etiqueta, valores }));
  filas.sort((a, b) => Object.values(b.valores).reduce((x, y) => x + y, 0)
                     - Object.values(a.valores).reduce((x, y) => x + y, 0));

  matriz($(`${pfx}-danio`), filas, ORDEN_NIVEL, COLOR_NIVEL, VIVIENDAS);
  $(`${pfx}-f-danio`).innerHTML = pie('viviendas') +
    ' Solo aparecen los elementos con nivel de daño diligenciado en la inspección.';
}

function pintarSistema() {
  barrasH($('g-sistema'), aFilas(contar(viviendas(), 'sistema_constructivo')), COLOR.d1, VIVIENDAS);
  $('f-sistema').innerHTML = pie('viviendas');
}

/* ============================================================
   7. Necesidades y salud
   ============================================================ */

function pintarAyudas(pfx) {
  const per = personas();
  const ayudas = [['ahe_alimentaria', 'AHE alimentaria'],
                  ['ahe_no_alimentaria', 'AHE no alimentaria'],
                  ['mat_rehab_vivienda', 'Material de rehabilitación'],
                  ['sub_arriendo', 'Subsidio de arriendo']];
  const filas = ayudas.map(([campo, etiqueta]) => ({
    etiqueta, valor: per.filter((p) => p[campo] === 'Sí').length
  })).sort((a, b) => b.valor - a.valor);

  barrasH($(`${pfx}-ayudas`), filas, COLOR.d4, PERSONAS);
  $(`${pfx}-f-ayudas`).innerHTML = pie('personas que solicitan la ayuda');
}

function pintarSalud() {
  const per = personas();
  barrasH($('g-salud'), aFilas(contar(per, 'estado_salud')),
          (f) => f.etiqueta === REQUIERE_ATENCION ? SEMAFORO.rojo : COLOR.d3, PERSONAS);
  $('f-salud').innerHTML = pie('personas');

  barrasH($('g-afiliacion'), aFilas(contar(per, 'afiliacion_salud')), COLOR.d3, PERSONAS);
  $('f-afiliacion').innerHTML = pie('personas');
}

/* conteos objetivos: qué requiere atención según los datos, sin etiquetas de
   prioridad — la regla institucional de priorización aún no existe */
function pintarSituaciones(pfx) {
  const per = personas(), viv = viviendas();

  const evac = viv.filter((v) => v.requiere_evacuacion === 'Sí').length;
  const salud = per.filter((p) => p.estado_salud === REQUIERE_ATENCION).length;
  const grave = new Set(danio()
    .filter((d) => d.nivel === 'Severo' || d.nivel === 'Colapso total')
    .map((d) => d.id_encuesta)).size;
  const hogares = new Map();
  per.forEach((p) => { if (!hogares.has(p.id_encuesta)) hogares.set(p.id_encuesta, p.match_status); });
  const sinVivienda = [...hogares.values()].filter((m) => m === 'no_match').length;
  const ambiguos = [...hogares.values()].filter((m) => m === 'ambiguous').length;

  const items = [
    { n: evac, clase: 'situacion--critica', texto: 'Viviendas que requieren evacuación',
      detalle: 'Marcadas en la inspección técnica.' },
    { n: salud, clase: 'situacion--critica', texto: 'Personas que requieren asistencia médica',
      detalle: 'Estado de salud reportado en el registro.' },
    { n: grave, clase: 'situacion--media', texto: 'Viviendas con daño severo o colapso en algún elemento',
      detalle: 'Al menos un elemento estructural en nivel Severo o Colapso total.' },
    { n: sinVivienda, clase: 'situacion--media', texto: 'Hogares sin vivienda asociada',
      detalle: 'Verificar antes de asignar ayudas. Detalle en Calidad de datos.' },
    { n: ambiguos, clase: 'situacion--media', texto: 'Hogares con asociación ambigua de vivienda',
      detalle: 'Más de una ficha posible. Detalle en Calidad de datos.' }
  ];

  $(`${pfx}-situaciones`).innerHTML = items.map((i) =>
    `<div class="situacion ${i.n ? i.clase : ''}">` +
    `<span class="situacion__cifra">${fmt(i.n)}</span>` +
    `<span class="situacion__texto">${esc(i.texto)}<br/>` +
    `<span class="situacion__detalle">${esc(i.detalle)}</span></span></div>`
  ).join('');

  $(`${pfx}-f-situaciones`).innerHTML = pie('conteos sobre la base filtrada');
}

/* ============================================================
   8. Evolución
   ============================================================ */

function pintarSerie() {
  const per = personas(), viv = viviendas();
  const fechas = [...new Set([...per, ...viv].map((f) => f.fecha).filter(Boolean))].sort();

  const acumular = (filas) => {
    let a = 0;
    return fechas.map((f) => { a += filas.filter((x) => x.fecha === f).length; return a; });
  };
  const series = [{ nombre: 'Personas', color: COLOR.d2, unidad: PERSONAS, valores: acumular(per) },
                  { nombre: 'Viviendas', color: COLOR.d4, unidad: VIVIENDAS, valores: acumular(viv) }];

  /* franja, no panel: la evolución acompaña al resumen, no lo protagoniza */
  lineas($('g-serie'), fechas, series, 'registros', 110);
  leyenda($('l-serie'), series.map((s) => ({ nombre: s.nombre, color: s.color })));
  $('f-serie').innerHTML = pie('registros acumulados') +
    ' La fecha es la de última actualización del registro, no la de la visita.';
}

/* ============================================================
   10. Mapa
   ------------------------------------------------------------
   Cartografía de referencia en js/cali-geo.js (OpenStreetMap,
   ODbL, simplificada). La comuna de cada registro se resuelve
   aquí, en el navegador, por punto-en-polígono sobre su
   latitud y longitud: la base no trae el dato de comuna.
   ============================================================ */

/* Cuándo el mapa deja de dibujar una marca por vivienda y cuenta por comuna.
   No se decide por número de registros: se mide el solapamiento real de las
   marcas ya proyectadas y se toma el radio más grande que lo mantenga bajo el
   límite; si ni el más pequeño alcanza, se agrupa. */
const RADIOS     = [4.5, 3.5, 2.5];   // px; por debajo de 2.5 la marca no se ve
/* con una comuna seleccionada el mapa está acercado y hay menos marcas: caben
   más grandes, que era justo lo que no se veía en el mapa de ciudad */
const RADIOS_FOCO = [7, 5.5, 4.5, 3.5];
const MAX_TAPADO = 0.20;              // 20% de marcas ocultas detrás de otra
/* Dentro de una comuna el mapa no agrupa mientras las marcas sean pocas.
   Agrupar ahí era contraproducente: el conteo ya está en la tarjeta y en la
   tabla, y lo que se viene a ver al entrar a una comuna es dónde cayó cada
   vivienda. Si dos quedan a cuarenta metros se rozan, pero el borde blanco
   las sigue distinguiendo. */
const SIN_AGRUPAR_HASTA = 80;

function tapadas(puntos, r) {
  const lado = 2 * r;
  const celdas = new Map();
  puntos.forEach(([x, y]) => {
    const k = `${Math.floor(x / lado)}:${Math.floor(y / lado)}`;
    celdas.set(k, (celdas.get(k) || 0) + 1);
  });
  let ocultas = 0;
  celdas.forEach((n) => { if (n > 1) ocultas += n - 1; });
  return ocultas / puntos.length;
}

/* No hay escala de intensidad por comuna: sombrear el mapa según lo
   encuestado se lee como «aquí el daño fue peor», y mientras el barrido
   esté incompleto ese mensaje es falso. El mapa ubica; la tabla cuenta. */

/* ray casting sobre el anillo exterior del polígono */
function enPoligono(lon, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const COMUNAS   = window.CALI_GEO.features.filter((f) => f.properties.tipo === 'comuna');
const MUNICIPIO = window.CALI_GEO.features.filter((f) => f.properties.tipo === 'municipio');

function comunaDe(lat, lon) {
  if (lat == null || lon == null) return null;
  const f = COMUNAS.find((c) => enPoligono(lon, lat, c.geometry.coordinates[0]));
  return f ? f.properties.numero : null;
}

/* se resuelve una sola vez al cargar: no cambia con los filtros */
function asignarComunas() {
  D.personas.forEach((p) => { p.comuna = comunaDe(p.latitud, p.longitud); });
  D.viviendas.forEach((v) => { v.comuna = comunaDe(v.latitud, v.longitud); });
  D.duplicados.forEach((d) => { d.comuna = comunaDe(d.latitud, d.longitud); });
}

/* los repetidos solo se filtran por comuna: su fecha es la de deteccion,
   no la del trabajo de campo, y no tienen secretaria asociada */
function duplicados() {
  if (!estado.comuna) return D.duplicados;
  return D.duplicados.filter((d) => String(d.comuna) === estado.comuna);
}

/* El encuadre se ajusta a las comunas, no al municipio; con una comuna
   seleccionada se acerca a ella. Lo que queda fuera lo recorta el SVG. */
function caja(rasgos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rasgos.forEach((f) => f.geometry.coordinates[0].forEach(([x, y]) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }));
  return { x0, y0, x1, y1 };
}

/* Encuadre del mapa.
   ------------------------------------------------------------
   Sin foco, la ciudad completa. Con foco —una comuna seleccionada— NO se
   encuadra la comuna sola: eso la dejaba flotando como una mancha sin
   referencia, imposible de situar. Se acerca a ella conservando el entorno
   alrededor, con la misma proporción del lienzo (así el panel no cambia de
   forma al seleccionar) y sin salirse de los límites de la ciudad. Lo que
   señala cuál es la comuna es el contraste, no el recorte. */
function encuadre(anchoMax, altoMax, todas, foco) {
  const c = caja(todas);
  const margen = (c.x1 - c.x0) * 0.04;
  const X0 = c.x0 - margen, X1 = c.x1 + margen;
  const Y0 = c.y0 - margen, Y1 = c.y1 + margen;

  const razon = (Y1 - Y0) / (X1 - X0);
  const ancho = Math.min(anchoMax, altoMax / razon);
  const alto = Math.round(ancho * razon);

  let vx0 = X0, vx1 = X1, vy0 = Y0, vy1 = Y1;

  if (foco && foco.length) {
    const f = caja(foco);
    const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;

    /* la ventana es el mayor de: la comuna con aire alrededor, o un tercio
       largo de la ciudad — el tope evita que una comuna diminuta dispare un
       acercamiento tan fuerte que se pierda toda referencia */
    let w = Math.max((f.x1 - f.x0) * 2.0, (X1 - X0) * 0.30);
    let h = w * razon;
    if (h < (f.y1 - f.y0) * 1.7) { h = (f.y1 - f.y0) * 1.7; w = h / razon; }

    /* nunca más grande que la ciudad, ni desplazada fuera de ella */
    w = Math.min(w, X1 - X0); h = Math.min(h, Y1 - Y0);
    vx0 = Math.min(Math.max(cx - w / 2, X0), X1 - w); vx1 = vx0 + w;
    vy0 = Math.min(Math.max(cy - h / 2, Y0), Y1 - h); vy1 = vy0 + h;
  }

  const escala = ancho / (vx1 - vx0);
  const proyectar = ([lon, lat]) => [(lon - vx0) * escala, (vy1 - lat) * escala];
  return { proyectar, ancho: Math.round(ancho), alto };
}

/* centroide de area, para poner el numero de la comuna donde se lee bien */
function centroide(anillo, proyectar) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    const f = xj * yi - xi * yj;
    a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
  }
  if (!a) return proyectar(anillo[0]);
  return proyectar([cx / (3 * a), cy / (3 * a)]);
}

function trazo(anillo, proyectar) {
  return anillo.map((c, i) => `${i ? 'L' : 'M'}${proyectar(c).map((n) => n.toFixed(1)).join(' ')}`).join('') + 'Z';
}

/* pinta una instancia del mapa; pfx identifica los contenedores de la vista */
/* ------------------------------------------------------------
   Sombreado por comuna (coropleta)
   ------------------------------------------------------------
   Rampa secuencial de un solo tono: el color codifica CUÁNTAS
   personas se han registrado en la comuna, no la gravedad del
   daño. Mientras el barrido esté incompleto son cosas distintas,
   y así queda dicho en la nota al pie del mapa.

   Los cortes se calculan sobre los datos, no fijos: la leyenda
   se lee igual con 60 personas que con 6.000.
   ------------------------------------------------------------ */
const RAMPA = ['#E8ECFB', '#C3CDF6', '#93A6EF', '#5C77E6', '#2743B8'];
const SIN_DATO = '#FFFFFF';

/* paso "redondo" para que los cortes de la leyenda sean legibles */
function pasoRedondo(v) {
  if (v <= 1) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

/* devuelve los topes de cada clase: [t1, t2, t3, t4, t5] */
function clasesSombreado(valores) {
  const max = Math.max(0, ...valores);
  if (max <= 0) return [];
  /* con pocas comunas ocupadas no hace falta estirar cinco clases */
  const n = Math.min(RAMPA.length, Math.max(1, max));
  const paso = pasoRedondo(Math.ceil(max / n));
  return Array.from({ length: n }, (_, i) => paso * (i + 1));
}

function colorClase(n, clases) {
  if (!n || !clases.length) return SIN_DATO;
  const i = clases.findIndex((tope) => n <= tope);
  return RAMPA[i === -1 ? clases.length - 1 : i];
}

/* leyenda que va superpuesta sobre el mapa */
function leyendaMapa(clases, hayEvacuacion, hayRepetidas) {
  let h = '<p class="mapa-leyenda__titulo">Personas afectadas</p>';
  if (clases.length) {
    clases.forEach((tope, i) => {
      const desde = i === 0 ? 1 : clases[i - 1] + 1;
      const etiqueta = i === clases.length - 1 && tope > desde
        ? `más de ${fmt(clases[i - 1] || 0)}` : (desde === tope ? fmt(tope) : `${fmt(desde)} – ${fmt(tope)}`);
      h += `<div class="mapa-leyenda__fila"><span class="mapa-leyenda__caja" ` +
           `style="background:${RAMPA[i]}"></span>${etiqueta}</div>`;
    });
  }
  h += `<div class="mapa-leyenda__fila"><span class="mapa-leyenda__caja" ` +
       `style="background:${SIN_DATO}"></span>Sin registros</div>`;

  h += '<p class="mapa-leyenda__titulo">Marcas</p>';
  h += '<div class="mapa-leyenda__fila"><span class="mapa-leyenda__punto"></span>Vivienda</div>';
  if (hayEvacuacion) {
    h += '<div class="mapa-leyenda__fila"><span class="mapa-leyenda__triangulo"></span>Evacuación</div>';
  }
  if (hayRepetidas) {
    h += '<div class="mapa-leyenda__fila"><span class="mapa-leyenda__punto mapa-leyenda__punto--repetida"></span>' +
         'Repetida</div>';
  }
  return h;
}

function pintarMapa(pfx, anchoTope) {
  const cont = $(`${pfx}-mapa`);

  const foco = COMUNAS.filter((f) => String(f.properties.numero) === estado.comuna);
  const acercado = foco.length > 0;
  const { proyectar, ancho, alto } = encuadre(Math.min(anchoTope, anchoDe(cont)), 680,
                                              COMUNAS, acercado ? foco : null);

  /* se proyecta primero, para poder medir el solapamiento en píxeles */
  const viv = viviendas().filter((v) => v.latitud != null && v.longitud != null);
  const puntos = viv.map((v) => ({ v, xy: proyectar([v.longitud, v.latitud]) }));

  const escalaRadios = acercado ? RADIOS_FOCO : RADIOS;
  let radio = null;
  for (const cand of escalaRadios) {
    if (!puntos.length || tapadas(puntos.map((p) => p.xy), cand) <= MAX_TAPADO) { radio = cand; break; }
  }
  /* dentro de una comuna con pocas marcas se dibujan igual, en el radio más
     pequeño, en vez de colapsar en un círculo con un número */
  if (radio === null && acercado && puntos.length <= SIN_AGRUPAR_HASTA) {
    radio = escalaRadios[escalaRadios.length - 1];
  }
  const agrupado = radio === null;

  /* qué viviendas del mapa tienen otra encuesta apuntando a ellas */
  const repetidas = new Set(D.duplicados.filter((d) => d.tabla === 'viviendas')
                                        .map((d) => d.id_canonico));

  let s = MUNICIPIO.map((f) => `<path d="${trazo(f.geometry.coordinates[0], proyectar)}" class="m-municipio"/>`).join('');

  /* Silueta del área urbana: se traza cada comuna con una línea gruesa ANTES
     de rellenarlas. Como los rellenos son opacos y las comunas son contiguas,
     cada una tapa la mitad interior de la línea de su vecina; solo sobrevive
     el borde que no colinda con nadie, es decir el contorno de la ciudad.
     Evita tener que calcular la unión de los 22 polígonos. */
  COMUNAS.forEach((f) => {
    s += `<path d="${trazo(f.geometry.coordinates[0], proyectar)}" class="m-silueta"/>`;
  });

  /* Sombreado por personas afectadas; las 22 comunas se dibujan siempre,
     tengan registros o no: es el mapa de la ciudad, no el de los datos.
     Se cuenta SIN el filtro de comuna a propósito: si no, al seleccionar una
     las otras 21 se vaciaban y el mapa perdía justamente el contexto que
     permite entender dónde queda la seleccionada. Al elegir comuna cambia el
     énfasis, no los colores. */
  const perMapa = D.personas.filter((p) => p.comuna != null && pasaPeriodo(p) && cumplePersona(p));
  const porComunaPer = contar(perMapa, 'comuna');
  const clases = clasesSombreado([...porComunaPer.values()]);

  /* halo de la comuna activa, debajo de los rellenos */
  if (acercado) {
    s += `<path d="${trazo(foco[0].geometry.coordinates[0], proyectar)}" class="m-halo"/>`;
  }

  COMUNAS.forEach((f) => {
    const num = f.properties.numero;
    const n = porComunaPer.get(num) || 0;
    const esActiva = estado.comuna === String(num);
    const clase = 'm-comuna' + (esActiva ? ' m-comuna--activa' : (acercado ? ' m-comuna--apagada' : ''));
    /* sin <title>: el resumen lo da la tarjeta flotante, y el tooltip nativo
       del navegador aparecería encima de ella */
    s += `<path d="${trazo(f.geometry.coordinates[0], proyectar)}" class="${clase}"` +
         ` fill="${colorClase(n, clases)}" data-comuna="${num}" data-nombre="${esc(f.properties.nombre)}"` +
         ` tabindex="0" role="button" aria-label="${esc(f.properties.nombre)}: ` +
         `${n ? cantidad(n, PERSONAS) : 'sin registros'}"/>`;
  });

  if (!agrupado) {
    COMUNAS.forEach((f) => {
      const [x, y] = centroide(f.geometry.coordinates[0], proyectar);
      /* sobre los dos tonos más oscuros el número se pierde: va en blanco */
      const oscuro = RAMPA.indexOf(colorClase(porComunaPer.get(f.properties.numero) || 0, clases)) >= 3;
      const apagada = acercado && estado.comuna !== String(f.properties.numero);
      s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"` +
           ` class="m-etiqueta${oscuro ? ' m-etiqueta--sobre' : ''}${apagada ? ' m-etiqueta--apagada' : ''}">` +
           `${f.properties.numero}</text>`;
    });
  }

  if (!agrupado) {
    puntos.forEach(({ v, xy }) => {
      const [x, y] = xy;
      const rep = repetidas.has(v.id_encuesta);
      const clase = `m-punto${rep ? ' m-punto--repetida' : ''}`;
      const aviso = rep ? ' · registrada dos veces, por verificar' : '';
      if (v.requiere_evacuacion === 'Sí') {
        /* triángulo: el estado no se distingue solo por color */
        const a = radio * 1.35;
        s += `<path d="M${x} ${y - a}L${x + a} ${y + a * 0.72}L${x - a} ${y + a * 0.72}Z" fill="${COLOR.d5}" class="${clase}">` +
             `<title>${esc(v.id_encuesta)} — requiere evacuación${aviso}</title></path>`;
      } else {
        s += `<circle cx="${x}" cy="${y}" r="${radio}" fill="${COLOR.d2}" class="${clase}">` +
             `<title>${esc(v.id_encuesta)} — no requiere evacuación${aviso}</title></circle>`;
      }
    });

  } else {
    /* las marcas se taparían entre sí: se cuenta por comuna en un círculo de
       área proporcional. No es una coropleta: se dibuja el conteo donde está. */
    const porComuna = new Map();
    puntos.forEach(({ v }) => {
      if (v.comuna == null) return;
      const c = porComuna.get(v.comuna) || { n: 0, evacuar: 0, repetidas: 0 };
      c.n++;
      if (v.requiere_evacuacion === 'Sí') c.evacuar++;
      if (repetidas.has(v.id_encuesta)) c.repetidas++;
      porComuna.set(v.comuna, c);
    });
    const maxN = Math.max(1, ...[...porComuna.values()].map((c) => c.n));

    COMUNAS.forEach((f) => {
      const c = porComuna.get(f.properties.numero);
      if (!c) return;
      const [x, y] = centroide(f.geometry.coordinates[0], proyectar);
      const r = 5 + Math.sqrt(c.n / maxN) * 20;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${COLOR.d2}"` +
           ` fill-opacity="0.75" class="m-punto${c.repetidas ? ' m-punto--repetida' : ''}">` +
           `<title>${esc(f.properties.nombre)}: ${cantidad(c.n, VIVIENDAS)}, ` +
           `${fmt(c.evacuar)} requieren evacuación` +
           `${c.repetidas ? `, ${fmt(c.repetidas)} registradas dos veces` : ''}</title></circle>`;
      s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"` +
           ` class="m-etiqueta m-etiqueta--sobre">${fmt(c.n)}</text>`;
    });

  }

  $(`${pfx}-l-mapa`).innerHTML = leyendaMapa(
    clases,
    viv.some((v) => v.requiere_evacuacion === 'Sí'),
    viv.some((v) => repetidas.has(v.id_encuesta)));

  cont.innerHTML = `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img"` +
                   ` aria-label="Mapa de Santiago de Cali con la ubicación de las viviendas inspeccionadas">${s}</svg>`;

  /* --- interacción: resumen al pasar el cursor, filtro al hacer clic --- */
  const tarjeta = $(`${pfx}-tarjeta`);
  const envoltorio = cont.parentElement;

  const ocultarTarjeta = () => {
    if (!tarjeta) return;
    tarjeta.classList.add('oculto');
    tarjeta.setAttribute('aria-hidden', 'true');
  };

  cont.querySelectorAll('[data-comuna]').forEach((el) => {
    el.addEventListener('click', () => { ocultarTarjeta(); seleccionarComuna(el.dataset.comuna); });

    if (!tarjeta) return;
    el.addEventListener('mouseenter', (e) => {
      tarjeta.innerHTML = contenidoTarjeta(Number(el.dataset.comuna), el.dataset.nombre);
      tarjeta.classList.remove('oculto');
      tarjeta.setAttribute('aria-hidden', 'false');
      moverTarjeta(tarjeta, envoltorio, e);
    });
    el.addEventListener('mousemove', (e) => moverTarjeta(tarjeta, envoltorio, e));
    el.addEventListener('mouseleave', ocultarTarjeta);
    /* con teclado no hay cursor que seguir: la tarjeta va a una esquina fija */
    el.addEventListener('focus', () => {
      tarjeta.innerHTML = contenidoTarjeta(Number(el.dataset.comuna), el.dataset.nombre);
      tarjeta.classList.remove('oculto');
      tarjeta.setAttribute('aria-hidden', 'false');
      tarjeta.style.left = ''; tarjeta.style.top = '';
      tarjeta.style.right = '10px'; tarjeta.style.bottom = '10px';
    });
    el.addEventListener('blur', () => {
      tarjeta.style.right = ''; tarjeta.style.bottom = '';
      ocultarTarjeta();
    });
  });

  const todas = viviendas();
  const ubicadas = todas.filter((v) => v.comuna != null).length;
  const sinUbicar = todas.length - ubicadas;
  $(`${pfx}-cobertura`).textContent = (ubicadas === todas.length
    ? `${cantidad(todas.length, VIVIENDAS)} del periodo, ${todas.length === 1 ? 'ubicada' : 'todas ubicadas'} en una comuna. `
    : `${fmt(ubicadas)} de ${cantidad(todas.length, VIVIENDAS)} ubicadas en una comuna. ` +
      `${cantidad(sinUbicar, VIVIENDAS)} sin coordenadas o fuera del perímetro urbano. `) +
    (acercado ? `Comuna ${estado.comuna} destacada, con las vecinas alrededor como referencia; ` +
                `haga clic en ella para volver a la ciudad completa. ` : '') +
    (agrupado ? 'A esta densidad las marcas se taparían entre sí, así que el mapa cuenta por comuna.' : '');

  $(`${pfx}-f-mapa`).innerHTML = pie('viviendas') +
    ' Cartografía: OpenStreetMap (© colaboradores de OpenStreetMap, ODbL), límites administrativos' +
    ' simplificados. Sistema de referencia: EPSG:4326.';
}

/* ============================================================
   10b. Resumen de una comuna (tarjeta al pasar el cursor)
   ------------------------------------------------------------
   Se cuenta con todos los filtros activos MENOS el de comuna: la
   tarjeta habla de la comuna que está bajo el cursor, no de la
   que esté seleccionada.
   ============================================================ */

function resumenComuna(num) {
  const per = D.personas.filter((p) => p.comuna === num && pasaPeriodo(p) && cumplePersona(p));
  const conDanio = estado.danio ? idsConDanio() : null;
  const viv = D.viviendas.filter((v) => v.comuna === num && pasaPeriodo(v) && cumpleVivienda(v, conDanio));

  const ids = new Set(viv.map((v) => v.id_encuesta));
  const graves = new Set(D.danio
    .filter((d) => ids.has(d.id_encuesta) && (d.nivel === 'Severo' || d.nivel === 'Colapso total'))
    .map((d) => d.id_encuesta)).size;

  return {
    numero: num,
    personas: per.length,
    hogares: new Set(per.map((p) => p.id_encuesta)).size,
    viviendas: viv.length,
    evacuacion: viv.filter((v) => v.requiere_evacuacion === 'Sí').length,
    salud: per.filter((p) => p.estado_salud === REQUIERE_ATENCION).length,
    graves,
    inmueble: contar(per, 'estado_inmueble')
  };
}

/* barra apilada de una línea: la tarjeta pregunta por proporción, no por
   magnitud, y tres barras sueltas ocuparían más de lo que cabe */
function apilada(mapa, orden, colores) {
  const filas = orden.map((k) => ({ etiqueta: k, valor: mapa.get(k) || 0 }))
                     .filter((f) => f.valor > 0);
  const total = filas.reduce((a, f) => a + f.valor, 0);
  if (!total) return '';

  const tramos = filas.map((f) =>
    `<span class="mt__tramo" style="width:${(f.valor / total) * 100}%;` +
    `background:${colores[f.etiqueta] || COLOR.d1}"></span>`).join('');

  const leyenda = filas.map((f) =>
    `<span class="mt__fila"><span class="mt__punto" style="background:${colores[f.etiqueta] || COLOR.d1}"></span>` +
    `${esc(f.etiqueta)}<b>${fmt(f.valor)}</b></span>`).join('');

  return `<div class="mt__apilada">${tramos}</div><div class="mt__leyenda">${leyenda}</div>`;
}

function contenidoTarjeta(num, nombre) {
  const r = resumenComuna(num);
  const cabecera = `<p class="mt__titulo">${esc(nombre)}</p>`;

  if (!r.personas && !r.viviendas) {
    return cabecera + '<p class="mt__vacio">Sin registros para los filtros seleccionados.</p>';
  }

  const celda = (n, e, alerta) =>
    `<div class="mt__celda${alerta && n ? ' mt__celda--alerta' : ''}">` +
    `<span class="mt__n">${fmt(n)}</span><span class="mt__e">${e}</span></div>`;

  let h = cabecera + '<div class="mt__cifras">' +
    celda(r.personas, 'Personas') +
    celda(r.hogares, 'Hogares') +
    celda(r.viviendas, 'Viviendas') +
    celda(r.evacuacion, 'Evacuación', true) +
    '</div>';

  const composicion = apilada(r.inmueble, ORDEN_INMUEBLE, COLOR_INMUEBLE);
  if (composicion) {
    h += `<div class="mt__seccion"><p class="mt__rotulo">Estado del inmueble reportado</p>${composicion}</div>`;
  }

  /* las dos cifras que obligan a actuar, solo si existen */
  const avisos = [];
  if (r.salud)  avisos.push(`${cantidad(r.salud, PERSONAS)} ${r.salud === 1 ? 'requiere' : 'requieren'} asistencia médica`);
  if (r.graves) avisos.push(`${cantidad(r.graves, VIVIENDAS)} con daño severo o colapso`);

  h += `<p class="mt__pie">${avisos.length ? esc(avisos.join(' · ')) + '. ' : ''}` +
       `${estado.comuna === String(num) ? 'Clic para quitar la selección.' : 'Clic para filtrar el tablero por ella.'}</p>`;
  return h;
}

/* la tarjeta sigue al cursor dentro del panel, y se voltea de lado o hacia
   arriba cuando no cabría: nunca debe salirse del mapa */
function moverTarjeta(tarjeta, envoltorio, evento) {
  const caja = envoltorio.getBoundingClientRect();
  const x = evento.clientX - caja.left, y = evento.clientY - caja.top;
  const ancho = tarjeta.offsetWidth, alto = tarjeta.offsetHeight;
  const sep = 16;

  let izq = x + sep;
  if (izq + ancho > caja.width) izq = Math.max(0, x - sep - ancho);
  let arriba = y + sep;
  if (arriba + alto > caja.height) arriba = Math.max(0, y - sep - alto);

  tarjeta.style.left = `${Math.round(izq)}px`;
  tarjeta.style.top  = `${Math.round(arriba)}px`;
}

/* ranking de comunas: el color ordena la lectura, la tabla da el dato */
function pintarTablaComunas(pfx) {
  const per = personas(), viv = viviendas();
  const hogaresDe = (n) => new Set(per.filter((p) => p.comuna === n).map((p) => p.id_encuesta)).size;
  const filas = COMUNAS.map((f) => {
    const n = f.properties.numero;
    return {
      numero: n,
      personas: per.filter((p) => p.comuna === n).length,
      hogares: hogaresDe(n),
      viviendas: viv.filter((v) => v.comuna === n).length,
      evacuacion: viv.filter((v) => v.comuna === n && v.requiere_evacuacion === 'Sí').length
    };
  }).filter((f) => f.personas || f.viviendas)
    .sort((a, b) => b.personas - a.personas || b.viviendas - a.viviendas || a.numero - b.numero);

  const cuerpo = filas.map((f) =>
    `<tr data-fila-comuna="${f.numero}" class="${estado.comuna === String(f.numero) ? 'fila--activa' : ''}">` +
    `<td>Comuna ${f.numero}</td>` +
    `<td style="text-align:right">${fmt(f.personas)}</td>` +
    `<td style="text-align:right">${fmt(f.hogares)}</td>` +
    `<td style="text-align:right">${fmt(f.viviendas)}</td>` +
    `<td style="text-align:right">${f.evacuacion ? fmt(f.evacuacion) : '—'}</td></tr>`).join('');

  const tabla = $(`${pfx}-tabla-comunas`);
  tabla.innerHTML =
    '<thead><tr><th>Comuna</th><th style="text-align:right">Personas</th>' +
    '<th style="text-align:right">Hogares</th>' +
    '<th style="text-align:right">Viviendas</th><th style="text-align:right">Evacuar</th></tr></thead>' +
    `<tbody>${cuerpo || '<tr><td colspan="5">Ninguna comuna con registros para los filtros seleccionados.</td></tr>'}</tbody>`;

  tabla.querySelectorAll('[data-fila-comuna]').forEach((tr) => {
    tr.addEventListener('click', () => seleccionarComuna(tr.dataset.filaComuna));
  });
}

/* un clic sobre la misma comuna quita la selección; el selector se sincroniza */
function seleccionarComuna(num) {
  estado.comuna = estado.comuna === String(num) ? '' : String(num);
  $('f-comuna').value = estado.comuna;
  pintar();
}

/* ============================================================
   11. Navegación y orquestación
   ============================================================ */

const VISTAS = ['resumen', 'territorio', 'personas', 'viviendas', 'necesidades'];
let vistaActiva = 'resumen';

function mostrarVista(nombre) {
  vistaActiva = nombre;
  VISTAS.forEach((v) => $(`vista-${v}`).classList.toggle('oculto', v !== nombre));
  document.querySelectorAll('.nav__enlace[data-vista]').forEach((n) =>
    n.classList.toggle('nav__enlace--activo', n.dataset.vista === nombre));
  ajustarFiltros();
  pintar();   /* los SVG se dibujan al ancho del panel: hay que rehacerlos al mostrarlos */
}

/* Los filtros específicos pertenecen a la pestaña que filtran, así que en el
   Resumen sobran. Pero un filtro puesto y escondido es peor que un filtro de
   más: si el grupo tiene algo activo se muestra igual, en cualquier vista. */
function ajustarFiltros() {
  const grupos = {
    'filtros-personas':  ['etario', 'inmueble', 'ayuda'],
    'filtros-viviendas': ['evacuacion', 'danio']
  };
  Object.entries(grupos).forEach(([id, claves]) => {
    const activo = claves.some((c) => estado[c]);
    $(id).classList.toggle('oculto', vistaActiva === 'resumen' && !activo);
  });
}

/* se pinta solo la vista visible: los contenedores ocultos no tienen ancho */
function pintar() {
  pintarUniverso();
  pintarIndicadores();

  if (vistaActiva === 'resumen') {
    pintarPuertas();
    pintarSerie();
  }
  if (vistaActiva === 'territorio') {
    pintarMapa('t', 720);
    pintarTablaComunas('t');
  }
  if (vistaActiva === 'personas') {
    pintarPiramide('p');
    pintarHogares();
    pintarSalud();
  }
  if (vistaActiva === 'viviendas') {
    pintarHabitabilidad('v');
    pintarSistema();
    pintarDanio('v');
  }
  if (vistaActiva === 'necesidades') {
    pintarAyudas('n');
    pintarSituaciones('n');
  }
}

/* ============================================================
   12. Arranque
   ============================================================ */

function iniciar() {
  asignarComunas();

  $('actualizado').textContent = D.actualizado ? `· Corte ${D.actualizado}` : '';
  $('pie-actualizado').textContent = D.actualizado ? `Corte ${D.actualizado}` : '';

  /* Aviso de base simulada. La marca la escribe el pipeline dentro del propio
     volcado (05_exportar_tablero.R), así que acompaña al archivo se copie a
     donde se copie. Un tablero de emergencia que muestre cifras inventadas sin
     decirlo es peor que un tablero vacío. */
  if (D.simulado) $('aviso-simulado').classList.remove('oculto');

  /* rango de fechas disponible */
  const fechas = D.personas.map((p) => p.fecha).filter(Boolean).sort();
  if (fechas.length) {
    $('f-desde').min = $('f-hasta').min = fechas[0];
    $('f-desde').max = $('f-hasta').max = fechas[fechas.length - 1];
  }

  /* Cada selector se llena con las categorías que EXISTEN en la base, no con
     una lista fija: si mañana aparece una categoría nueva, se ofrece sola. */
  function llenarSelector(id, valores, etiquetar) {
    const sel = $(id);
    valores.forEach((v) => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = etiquetar ? etiquetar(v) : String(v);
      sel.appendChild(o);
    });
    return sel;
  }

  /* comunas que efectivamente tienen registros, en orden numérico */
  const conRegistros = [...new Set(D.personas.concat(D.viviendas).map((f) => f.comuna))]
                         .filter((n) => n != null).sort((a, b) => a - b);
  llenarSelector('f-comuna', conRegistros, (n) => `Comuna ${n}`);

  /* grupo de edad en su orden natural, no alfabético */
  const etarios = ORDEN_ETARIO.filter((g) => D.personas.some((p) => p.grupo_etario === g));
  llenarSelector('f-etario', etarios);

  /* estado del inmueble: las categorías reales del formulario */
  const inmuebles = [...new Set(D.personas.map((p) => p.estado_inmueble).filter(Boolean))]
                      .sort((a, b) => (ORDEN_INMUEBLE.indexOf(a) + 1 || 99) -
                                      (ORDEN_INMUEBLE.indexOf(b) + 1 || 99));
  llenarSelector('f-inmueble', inmuebles);

  /* solo se ofrecen las ayudas que alguien haya solicitado */
  const ayudas = Object.keys(CAMPOS_AYUDA).filter((c) => D.personas.some((p) => p[c] === 'Sí'));
  llenarSelector('f-ayuda', ayudas, (c) => CAMPOS_AYUDA[c]);

  const evacuaciones = [...new Set(D.viviendas.map((v) => v.requiere_evacuacion).filter(Boolean))].sort();
  llenarSelector('f-evacuacion', evacuaciones, (v) => v === 'Sí' ? 'Sí, requiere' : 'No requiere');

  const niveles = ORDEN_NIVEL.filter((n) => D.danio.some((d) => d.nivel === n));
  llenarSelector('f-danio', niveles);

  /* un solo cableado para todos los selectores: id del control -> clave de estado */
  const CONTROLES = {
    'f-comuna': 'comuna', 'f-desde': 'desde', 'f-hasta': 'hasta',
    'f-etario': 'etario', 'f-inmueble': 'inmueble', 'f-ayuda': 'ayuda',
    'f-evacuacion': 'evacuacion', 'f-danio': 'danio'
  };
  Object.entries(CONTROLES).forEach(([id, clave]) => {
    $(id).addEventListener('change', () => {
      estado[clave] = $(id).value;
      ajustarFiltros();
      pintar();
    });
  });

  /* Solo los enlaces que declaran una vista cambian de pestana. La barra
     lleva ademas el regreso al portal, que es un enlace normal: sin acotar
     el selector, ese clic caia aqui, se le quitaba la navegacion y se
     llamaba mostrarVista(undefined), que esconde las cinco vistas. */
  document.querySelectorAll('.nav__enlace[data-vista]').forEach((enlace) => {
    enlace.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarVista(enlace.dataset.vista);
    });
  });

  /* las puertas del resumen son el atajo a su pestaña: la tarjeta entera es
     el área de clic, y responde a Enter y Espacio por ser role="button" */
  document.querySelectorAll('[data-ir]').forEach((puerta) => {
    const abrir = () => mostrarVista(puerta.dataset.ir);
    puerta.addEventListener('click', abrir);
    puerta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });

  $('btn-limpiar').addEventListener('click', () => {
    Object.keys(CONTROLES).forEach((id) => { estado[CONTROLES[id]] = ''; $(id).value = ''; });
    ajustarFiltros();
    pintar();
  });

  /* los gráficos se dibujan al ancho real del panel: rehacerlos al redimensionar */
  let espera;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(pintar, 150);
  });

  ajustarFiltros();
  pintar();
}

document.addEventListener('DOMContentLoaded', iniciar);

})();
