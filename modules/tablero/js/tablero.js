/* ============================================================
   Tablero de control — lógica y gráficos
   CIENFI · Universidad Icesi · Alcaldía de Santiago de Cali
   ------------------------------------------------------------
   Los datos llegan en window.TABLERO (js/datos_tablero.js, que
   regenera pipeline/05_exportar_tablero.R en cada corrida).
   Todo se agrega y filtra aquí, en el navegador.

   Arquitectura de vistas:
     Resumen | Territorio | Personas | Viviendas | Necesidades |
     Calidad de datos
   Los componentes que aparecen en más de una vista (mapa,
   pirámide, habitabilidad, daño, ayudas, situaciones) reciben un
   prefijo de contenedor: r- (resumen), t- (territorio),
   p- (personas), v- (viviendas), n- (necesidades).

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

/* comuna y periodo: aplican a cualquier registro que los tenga */
function pasaGeneral(f) {
  if (estado.comuna && String(f.comuna) !== estado.comuna) return false;
  if (estado.desde && (!f.fecha || f.fecha < estado.desde)) return false;
  if (estado.hasta && (!f.fecha || f.fecha > estado.hasta)) return false;
  return true;
}

function personas() {
  return D.personas.filter((p) => {
    if (!pasaGeneral(p)) return false;
    if (estado.etario   && p.grupo_etario    !== estado.etario) return false;
    if (estado.inmueble && p.estado_inmueble !== estado.inmueble) return false;
    if (estado.ayuda    && p[estado.ayuda]   !== 'Sí') return false;
    return true;
  });
}

/* las viviendas con el nivel de daño buscado en cualquiera de sus elementos */
function idsConDanio() {
  return new Set(D.danio.filter((d) => d.nivel === estado.danio).map((d) => d.id_encuesta));
}

function viviendas() {
  const conDanio = estado.danio ? idsConDanio() : null;
  return D.viviendas.filter((v) => {
    if (!pasaGeneral(v)) return false;
    if (estado.evacuacion && v.requiere_evacuacion !== estado.evacuacion) return false;
    if (conDanio && !conDanio.has(v.id_encuesta)) return false;
    return true;
  });
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

/* barras horizontales; color fijo o función por fila (para acentos semánticos) */
function barrasH(cont, filas, color, unidad) {
  if (!filas.length) { vacio(cont, SIN_REGISTROS); return; }

  const ancho = anchoDe(cont);
  const izq = margenEtiquetas(filas, ancho), der = 52;
  const altoBarra = 22, sep = 12, arriba = 8;
  const alto = arriba + filas.length * (altoBarra + sep);
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const util = ancho - izq - der;
  const colorDe = typeof color === 'function' ? color : () => color;

  let s = '';
  filas.forEach((f, i) => {
    const y = arriba + i * (altoBarra + sep);
    const medio = y + altoBarra / 2;
    const w = Math.max(1, (f.valor / max) * util);
    s += texto(izq - 12, medio, esc(f.etiqueta), 'g-etiqueta', 'end');
    s += `<rect x="${izq}" y="${y}" width="${w}" height="${altoBarra}" rx="3"` +
         ` fill="${colorDe(f)}" class="g-barra"><title>${esc(f.etiqueta)}: ${cantidad(f.valor, unidad)}</title></rect>`;
    s += texto(izq + w + 10, medio, fmt(f.valor), 'g-valor');
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
function lineas(cont, fechas, series, unidad) {
  if (!fechas.length) { vacio(cont, SIN_REGISTROS); return; }
  if (fechas.length === 1) {
    const partes = series.map((s) => cantidad(s.valores[0], s.unidad));
    cont.innerHTML = `<p class="vacio">1 fecha de registro disponible (${esc(fechas[0])}): ` +
                     `${esc(partes.join(' y '))}. La serie se dibujará cuando existan más fechas.</p>`;
    return;
  }

  const ancho = anchoDe(cont);
  const izq = 46, der = 18, arriba = 34, abajo = 34, alto = 240;
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

function pintarIndicadores() {
  const per = personas(), viv = viviendas();
  const hogares = hogaresUnicos(per).size;
  const evac = viv.filter((v) => v.requiere_evacuacion === 'Sí').length;
  const geo = viv.filter((v) => v.latitud != null && v.longitud != null).length;
  const conVivienda = per.filter((p) => p.match_status && p.match_status.startsWith('matched')).length;
  const salud = per.filter((p) => p.estado_salud === REQUIERE_ATENCION).length;
  const comunas = new Set(per.concat(viv).map((f) => f.comuna).filter((c) => c != null)).size;

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

  $('kpi-salud').textContent = fmt(salud);
  $('kpi-salud-meta').textContent = `${pct(salud, per.length)} de las personas registradas`;

  $('kpi-comunas').textContent = fmt(comunas);
  $('kpi-comunas-meta').textContent = 'de las 22 comunas del perímetro urbano';
  /* el universo filtrado lo escribe pintarUniverso(), que además declara el
     alcance de cada filtro */
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

  lineas($('g-serie'), fechas, series, 'registros');
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
const MAX_TAPADO = 0.20;              // 20% de marcas ocultas detrás de otra

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
function encuadre(anchoMax, altoMax, foco) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  foco.forEach((f) => f.geometry.coordinates[0].forEach(([x, y]) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }));
  const margen = (x1 - x0) * 0.04;
  x0 -= margen; x1 += margen; y0 -= margen; y1 += margen;

  const razon = (y1 - y0) / (x1 - x0);
  const ancho = Math.min(anchoMax, altoMax / razon);
  const alto = Math.round(ancho * razon);
  const escala = ancho / (x1 - x0);
  const proyectar = ([lon, lat]) => [(lon - x0) * escala, (y1 - lat) * escala];
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
                                              acercado ? foco : COMUNAS);

  /* se proyecta primero, para poder medir el solapamiento en píxeles */
  const viv = viviendas().filter((v) => v.latitud != null && v.longitud != null);
  const puntos = viv.map((v) => ({ v, xy: proyectar([v.longitud, v.latitud]) }));

  let radio = null;
  for (const cand of RADIOS) {
    if (!puntos.length || tapadas(puntos.map((p) => p.xy), cand) <= MAX_TAPADO) { radio = cand; break; }
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

  /* sombreado por personas afectadas; las 22 comunas se dibujan siempre,
     tengan registros o no: es el mapa de la ciudad, no el de los datos */
  const porComunaPer = contar(personas().filter((p) => p.comuna != null), 'comuna');
  const clases = clasesSombreado([...porComunaPer.values()]);

  COMUNAS.forEach((f) => {
    const num = f.properties.numero;
    const n = porComunaPer.get(num) || 0;
    const activa = estado.comuna === String(num) ? ' m-comuna--activa' : '';
    s += `<path d="${trazo(f.geometry.coordinates[0], proyectar)}" class="m-comuna${activa}"` +
         ` fill="${colorClase(n, clases)}" data-comuna="${num}" tabindex="0" role="button">` +
         `<title>${esc(f.properties.nombre)}: ${n ? cantidad(n, PERSONAS) : 'sin registros'}</title></path>`;
  });

  if (!agrupado) {
    COMUNAS.forEach((f) => {
      const [x, y] = centroide(f.geometry.coordinates[0], proyectar);
      /* sobre los dos tonos más oscuros el número se pierde: va en blanco */
      const oscuro = RAMPA.indexOf(colorClase(porComunaPer.get(f.properties.numero) || 0, clases)) >= 3;
      s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"` +
           ` class="m-etiqueta${oscuro ? ' m-etiqueta--sobre' : ''}">${f.properties.numero}</text>`;
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

  cont.querySelectorAll('[data-comuna]').forEach((el) => {
    el.addEventListener('click', () => seleccionarComuna(el.dataset.comuna));
  });

  const todas = viviendas();
  const ubicadas = todas.filter((v) => v.comuna != null).length;
  const sinUbicar = todas.length - ubicadas;
  $(`${pfx}-cobertura`).textContent = (ubicadas === todas.length
    ? `${cantidad(todas.length, VIVIENDAS)} del periodo, ${todas.length === 1 ? 'ubicada' : 'todas ubicadas'} en una comuna. `
    : `${fmt(ubicadas)} de ${cantidad(todas.length, VIVIENDAS)} ubicadas en una comuna. ` +
      `${cantidad(sinUbicar, VIVIENDAS)} sin coordenadas o fuera del perímetro urbano. `) +
    (acercado ? `Mapa acercado a la Comuna ${estado.comuna}; haga clic en ella para volver a la ciudad. ` : '') +
    (agrupado ? 'A esta densidad las marcas se taparían entre sí, así que el mapa cuenta por comuna.' : '');

  $(`${pfx}-f-mapa`).innerHTML = pie('viviendas') +
    ' Cartografía: OpenStreetMap (© colaboradores de OpenStreetMap, ODbL), límites administrativos' +
    ' simplificados. Sistema de referencia: EPSG:4326.';
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
  pintar();   /* los SVG se dibujan al ancho del panel: hay que rehacerlos al mostrarlos */
}

/* se pinta solo la vista visible: los contenedores ocultos no tienen ancho */
function pintar() {
  pintarUniverso();
  pintarIndicadores();

  if (vistaActiva === 'resumen') {
    pintarMapa('r', 620);
    pintarTablaComunas('r');
    pintarPiramide('r');
    pintarHogares();
    pintarHabitabilidad('r');
    pintarDanio('r');
    pintarAyudas('r');
    pintarSituaciones('r');
    pintarSerie();
  }
  if (vistaActiva === 'territorio') {
    pintarMapa('t', 720);
    pintarTablaComunas('t');
  }
  if (vistaActiva === 'personas') {
    pintarPiramide('p');
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
    $(id).addEventListener('change', () => { estado[clave] = $(id).value; pintar(); });
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

  $('btn-limpiar').addEventListener('click', () => {
    Object.keys(CONTROLES).forEach((id) => { estado[CONTROLES[id]] = ''; $(id).value = ''; });
    pintar();
  });

  /* los gráficos se dibujan al ancho real del panel: rehacerlos al redimensionar */
  let espera;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(pintar, 150);
  });

  pintar();
}

document.addEventListener('DOMContentLoaded', iniciar);

})();
