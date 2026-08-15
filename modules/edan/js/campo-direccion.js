/* ============================================================================
   campo-direccion.js — Campo compuesto de dirección con georreferenciación.

   Reemplaza el campo de texto libre por casillas estructuradas con la
   nomenclatura colombiana, arma sola la dirección completa y permite ubicar
   la vivienda en un mapa.

   POR QUÉ ASÍ:

   · Mapa con Leaflet + OpenStreetMap. Google Maps quedó descartado: exige
     clave de API y facturación, y la regla 1 del proyecto prohíbe usar APIs
     pagas de Google Maps. Leaflet está alojado dentro del proyecto
     (assets/leaflet/), no en un CDN, para que la aplicación siga cargando sin
     internet. Los mosaicos del mapa sí requieren conexión; cuando no la hay,
     el botón de ubicación actual sigue funcionando porque el GPS del
     dispositivo no depende de internet.

   · Las tres fuentes de coordenadas quedan diferenciadas en
     fuente_georreferenciacion: GPS, MAPA o GEOCODIFICACION.

   · La geocodificación NUNCA reemplaza la dirección declarada: el texto que
     devuelve el servicio se guarda aparte, en direccion_geocodificada.

   · La geocodificación es una acción explícita del usuario, con botón. No se
     dispara sola al escribir: cada consulta envía la dirección a un servicio
     externo (Nominatim, de OpenStreetMap) y eso no debe ocurrir sin que la
     persona lo decida.

   · Los campos que no correspondan quedan vacíos. Elegir "Casa" no inventa
     datos de conjunto, y si se cambia de conjunto a casa, los campos de
     conjunto se limpian en lugar de quedar como basura arrastrada.
   ========================================================================== */
(function () {
  'use strict';

  /* Vista de respaldo cuando el formulario aún no tiene municipio: el Valle
     del Cauca completo, para que se vea que falta elegirlo. NO se abre en
     Cali por defecto: el mapa se centra en el municipio elegido (ver
     contexto.centro, que viene del catálogo oficial js/municipios-valle.js). */
  var CENTRO_VALLE = [3.95, -76.35];
  var ZOOM_DEPARTAMENTO = 8;
  var ZOOM_CIUDAD = 12;
  var ZOOM_PUNTO = 17;

  /* La búsqueda de direcciones se ACOTA a la caja del municipio elegido: una
     «Calle 5 # 38-20» existe en decenas de ciudades del país, y sin este
     límite el buscador devolvía la de otra ciudad. La caja de cada municipio
     sale del Marco Geoestadístico Nacional del DANE (js/municipios-valle.js);
     cualquier resultado fuera de ella se descarta. */
  function cajaActiva() {
    var c = window.CampoDireccion && window.CampoDireccion.contexto;
    return (c && c.caja) ? c.caja : null;
  }
  function centroActivo() {
    var c = window.CampoDireccion && window.CampoDireccion.contexto;
    return (c && c.centro) ? c.centro : null;
  }
  function nombreMunicipioActivo() {
    var c = window.CampoDireccion && window.CampoDireccion.contexto;
    return (c && c.municipioNombre) ? c.municipioNombre : '';
  }
  /* Recomendación única cuando la búsqueda no da la dirección exacta (regla
     acordada 2026-08-15): primero «Usar mi ubicación actual» si se está en el
     sitio; si no, marcar el punto tocando el mapa. Todos los mensajes de
     «no encontrada / no exacta» la usan tal cual, para que en campo siempre
     se lea lo mismo. */
  var RECOMENDACION = 'Use <strong>«Usar mi ubicación actual»</strong> si está en el sitio; ' +
    'si no, <strong>toque el mapa</strong> sobre el predio para marcar el punto.';

  function dentroDeCaja(lat, lon, caja) {
    return lat >= caja.sur && lat <= caja.norte && lon >= caja.oeste && lon <= caja.este;
  }

  /* Nombre largo del tipo de vía, que es como aparece en el mapa base
     (OpenStreetMap). Al buscador se le habla en su idioma. */
  var VIA_LARGA = {
    'Cra': 'Carrera', 'Cll': 'Calle', 'Av': 'Avenida', 'Dg': 'Diagonal',
    'Tv': 'Transversal', 'Av Cra': 'Avenida Carrera', 'Av Cll': 'Avenida Calle',
    'Cir': 'Circular', 'Aut': 'Autopista', 'Km': 'Kilómetro', 'Mz': 'Manzana'
  };

  /* Tipos de vía. Lista ampliable: agregar aquí una línea basta, no hay que
     tocar ninguna otra parte de la aplicación. */
  var TIPOS_VIA = [
    { valor: 'Cra', etiqueta: 'Cra — Carrera' },
    { valor: 'Cll', etiqueta: 'Cll — Calle' },
    { valor: 'Av', etiqueta: 'Av — Avenida' },
    { valor: 'Dg', etiqueta: 'Dg — Diagonal' },
    { valor: 'Tv', etiqueta: 'Tv — Transversal' },
    { valor: 'Av Cra', etiqueta: 'Av Cra — Avenida Carrera' },
    { valor: 'Av Cll', etiqueta: 'Av Cll — Avenida Calle' },
    { valor: 'Cir', etiqueta: 'Cir — Circular' },
    { valor: 'Aut', etiqueta: 'Aut — Autopista' },
    { valor: 'Km', etiqueta: 'Km — Kilómetro' },
    { valor: 'Mz', etiqueta: 'Mz — Manzana' }
  ];

  var SUFIJOS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* Subcampos que se almacenan y se exportan. El orden es el de las columnas
     del CSV. "derivado" marca los que calcula la aplicación. */
  var SUBCAMPOS = [
    { id: 'tipo_via', etiqueta: 'Tipo de vía' },
    { id: 'numero_via', etiqueta: 'Número de la vía' },
    { id: 'sufijo_via', etiqueta: 'Sufijo de la vía' },
    { id: 'sufijo_via_otro', etiqueta: 'Sufijo de la vía (otro)' },
    { id: 'numero_generador', etiqueta: 'Número generador o cruce' },
    { id: 'sufijo_generador', etiqueta: 'Letra o sufijo del generador' },
    { id: 'sufijo_generador_otro', etiqueta: 'Letra o sufijo del generador (otro)' },
    { id: 'placa_inmueble', etiqueta: 'Placa del inmueble' },
    { id: 'tipo_inmueble', etiqueta: 'Tipo de inmueble' },
    { id: 'nombre_conjunto', etiqueta: 'Nombre del conjunto' },
    { id: 'tipo_unidad', etiqueta: 'Tipo de unidad' },
    { id: 'numero_unidad', etiqueta: 'Número de apartamento o casa' },
    { id: 'torre_bloque', etiqueta: 'Torre o bloque' },
    { id: 'direccion_completa', etiqueta: 'Dirección completa', derivado: true },
    { id: 'latitud', etiqueta: 'Latitud', derivado: true },
    { id: 'longitud', etiqueta: 'Longitud', derivado: true },
    { id: 'sistema_coordenadas', etiqueta: 'Sistema de coordenadas', derivado: true },
    { id: 'fuente_georreferenciacion', etiqueta: 'Fuente de la georreferenciación', derivado: true },
    { id: 'precision_gps_m', etiqueta: 'Precisión del GPS (m)', derivado: true },
    { id: 'direccion_geocodificada', etiqueta: 'Dirección devuelta por geocodificación', derivado: true },
    { id: 'precision_geocodificacion', etiqueta: 'Precisión de la búsqueda (predio / cruce / vía)', derivado: true },
    { id: 'fecha_georreferenciacion', etiqueta: 'Fecha de la georreferenciación', derivado: true },
    { id: 'ubicacion_confirmada', etiqueta: '¿El diligenciador confirmó la ubicación?', derivado: true },
    { id: 'fecha_confirmacion_ubicacion', etiqueta: 'Fecha de confirmación de la ubicación', derivado: true }
  ];

  /* Prefijos de vía que puede devolver el servicio de mapas, del más
     específico al más general: "Avenida Carrera" debe reconocerse antes que
     "Avenida". Se comparan sin tildes y en minúscula. */
  var PREFIJOS_VIA = [
    { re: /^av(enida)?\.?\s*(cra|carrera|kra|kr)\b\.?/, valor: 'Av Cra' },
    { re: /^av(enida)?\.?\s*(cll|calle|cl)\b\.?/, valor: 'Av Cll' },
    { re: /^(cra|carrera|kra|kr|cr)\b\.?/, valor: 'Cra' },
    { re: /^(cll|calle|clle|cl)\b\.?/, valor: 'Cll' },
    { re: /^(av|avenida)\b\.?/, valor: 'Av' },
    { re: /^(dg|diagonal|diag)\b\.?/, valor: 'Dg' },
    { re: /^(tv|transversal|trans|tr)\b\.?/, valor: 'Tv' },
    { re: /^(cir|circular)\b\.?/, valor: 'Cir' },
    { re: /^(aut|autopista)\b\.?/, valor: 'Aut' },
    { re: /^(km|kilometro)\b\.?/, valor: 'Km' },
    { re: /^(mz|manzana)\b\.?/, valor: 'Mz' }
  ];

  // Campos que solo tienen sentido cuando el inmueble está en un conjunto.
  var CAMPOS_CONJUNTO = ['nombre_conjunto', 'tipo_unidad', 'numero_unidad', 'torre_bloque'];

  // --- Estado del widget montado -------------------------------------------
  var mapa = null;
  var marcador = null;
  var contenedorActual = null;
  var valoresActual = null;
  var alCambiarActual = null;   // guardado diferido, en cada tecla
  var guardarYaActual = null;   // guardado inmediato, al confirmar
  var ultimaGeocodificacion = 0;
  var temporizadorInverso = null;
  var propuestaPendiente = null;

  // ==========================================================================
  //  COMPOSICIÓN DE LA DIRECCIÓN
  // ==========================================================================

  function limpio(v) {
    return String(v === undefined || v === null ? '' : v).trim();
  }

  /**
   * Sufijo efectivo: el escogido de la lista, o el escrito en "Otro".
   * Una letra suelta se pega al número ("15A"); una palabra va separada
   * ("22 Oeste", "9 Bis"), que es como se escribe en Colombia.
   */
  function sufijoEfectivo(valores) {
    var s = limpio(valores.sufijo_via);
    var texto = '';
    if (s === 'Otro') texto = limpio(valores.sufijo_via_otro);
    else if (s !== 'Ninguno') texto = s;
    if (!texto) return '';
    return texto.length === 1 ? texto.toUpperCase() : ' ' + texto;
  }

  /* Igual que sufijoEfectivo pero para el número generador: el «E» de
     «# 4E-64». Una letra va pegada al número (así la escribe la nomenclatura
     y así la nombra el mapa base: «Carrera 4E»); un sufijo largo (Bis, Oeste…)
     va separado por espacio. */
  function sufijoGeneradorEfectivo(valores) {
    var s = limpio(valores.sufijo_generador);
    var texto = '';
    if (s === 'Otro') texto = limpio(valores.sufijo_generador_otro);
    else if (s && s !== 'Ninguno') texto = s;
    if (!texto) return '';
    return texto.length === 1 ? texto.toUpperCase() : ' ' + texto;
  }

  /**
   * Arma la dirección completa a partir de los componentes.
   * Tolera que falten piezas: no produce restos como "# -" ni comas sueltas.
   */
  function componer(valores) {
    valores = valores || {};
    var via = [limpio(valores.tipo_via), limpio(valores.numero_via) + sufijoEfectivo(valores)]
      .filter(function (x) { return x; }).join(' ').trim();

    var generador = limpio(valores.numero_generador);
    if (generador) generador += sufijoGeneradorEfectivo(valores);
    var placa = limpio(valores.placa_inmueble);
    var cruce = '';
    if (generador && placa) cruce = '# ' + generador + '-' + placa;
    else if (generador) cruce = '# ' + generador;
    else if (placa) cruce = '# -' + placa;

    var base = [via, cruce].filter(function (x) { return x; }).join(' ').trim();

    var partes = base ? [base] : [];
    var tipo = limpio(valores.tipo_inmueble);

    if (tipo === 'Casa') {
      partes.push('Casa');
    } else if (tipo === 'Conjunto residencial') {
      if (limpio(valores.nombre_conjunto)) partes.push(limpio(valores.nombre_conjunto));
      if (limpio(valores.torre_bloque)) partes.push(limpio(valores.torre_bloque));
      var unidad = [limpio(valores.tipo_unidad), limpio(valores.numero_unidad)]
        .filter(function (x) { return x; }).join(' ');
      if (unidad) partes.push(unidad);
    }

    return partes.join(', ');
  }

  // ==========================================================================
  //  LECTURA DE LA DIRECCIÓN QUE DEVUELVE EL MAPA
  // ==========================================================================

  function sinTildes(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /**
   * Interpreta el nombre de vía que devuelve el servicio de mapas
   * ("Carrera 38", "Calle 15A", "Avenida Carrera 6N") y lo reparte en las
   * casillas. Lo que no se puede interpretar se deja vacío: nunca se inventa.
   */
  function parsearVia(texto) {
    var t = sinTildes(texto);
    if (!t) return null;

    var tipo = '';
    for (var i = 0; i < PREFIJOS_VIA.length; i++) {
      if (PREFIJOS_VIA[i].re.test(t)) {
        tipo = PREFIJOS_VIA[i].valor;
        t = t.replace(PREFIJOS_VIA[i].re, '').trim();
        break;
      }
    }
    if (!tipo) return null;   // vía con nombre propio: no encaja en las casillas

    var m = t.match(/^(\d+)\s*([a-z]+)?/);
    if (!m) return { tipo_via: tipo, numero_via: '', sufijo_via: 'Ninguno', sufijo_via_otro: '' };

    var crudo = m[2] || '';
    var esLetraSimple = crudo.length === 1 && SUFIJOS.indexOf(crudo.toUpperCase()) !== -1;
    // Una palabra ("oeste", "bis") se guarda con inicial mayúscula, no en
    // versalitas, porque se muestra tal cual dentro de la dirección.
    var sufijoTexto = esLetraSimple
      ? crudo.toUpperCase()
      : (crudo ? crudo.charAt(0).toUpperCase() + crudo.slice(1) : '');

    return {
      tipo_via: tipo,
      numero_via: m[1],
      sufijo_via: sufijoTexto ? (esLetraSimple ? sufijoTexto : 'Otro') : 'Ninguno',
      sufijo_via_otro: (sufijoTexto && !esLetraSimple) ? sufijoTexto : ''
    };
  }

  /**
   * Reparte el número de casa. En Colombia suele venir como "38-104", que
   * corresponde a número generador y placa.
   */
  function parsearNumeroCasa(texto) {
    var t = String(texto || '').replace(/\s+/g, '').trim();
    if (!t) return null;
    var m = t.match(/^(\d+)([a-zA-Z]?)-(\d+[a-zA-Z]?)$/);
    if (m) {
      var r = { numero_generador: m[1], placa_inmueble: m[3], sufijo_generador: 'Ninguno', sufijo_generador_otro: '' };
      if (m[2]) {
        var letra = m[2].toUpperCase();
        if (SUFIJOS.indexOf(letra) !== -1) r.sufijo_generador = letra;
        else { r.sufijo_generador = 'Otro'; r.sufijo_generador_otro = letra; }
      }
      return r;
    }
    if (/^\d+[a-zA-Z]?$/.test(t)) return { numero_generador: '', placa_inmueble: t };
    return null;
  }

  /** Componentes de dirección que puede rellenar la lectura del mapa. */
  var CAMPOS_RELLENABLES = ['tipo_via', 'numero_via', 'sufijo_via', 'sufijo_via_otro',
    'numero_generador', 'sufijo_generador', 'sufijo_generador_otro', 'placa_inmueble'];

  /** ¿El usuario ya escribió algo en las casillas de la vía? */
  function hayDireccionEscrita(valores) {
    return CAMPOS_RELLENABLES.some(function (c) {
      var v = limpio(valores[c]);
      return v && v !== 'Ninguno';
    });
  }

  // ==========================================================================
  //  RENDER
  // ==========================================================================

  function esc(t) {
    return String(t === undefined || t === null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function opcionesSelect(lista, seleccionado, placeholder) {
    var html = '<option value="">' + esc(placeholder) + '</option>';
    lista.forEach(function (op) {
      var valor = typeof op === 'string' ? op : op.valor;
      var etiqueta = typeof op === 'string' ? op : op.etiqueta;
      html += '<option value="' + esc(valor) + '"' +
        (String(seleccionado) === String(valor) ? ' selected' : '') + '>' +
        esc(etiqueta) + '</option>';
    });
    return html;
  }

  /** Código de la pregunta (V019, V020…) para mostrarlo junto a la casilla. */
  function codigoSub(id) {
    var form = (window.CampoDireccion && window.CampoDireccion.contexto &&
                window.CampoDireccion.contexto.formulario) || 'vivienda';
    var c = window.CODIGOS ? window.CODIGOS.de(form, id) : '';
    return c ? '<span class="codigo-pregunta">' + esc(c) + '</span>' : '';
  }

  function campoTexto(id, etiqueta, valores, opciones) {
    opciones = opciones || {};
    return '<div class="dir-campo' + (opciones.clase ? ' ' + opciones.clase : '') + '">' +
      '<label for="dir_' + id + '">' + codigoSub(id) + esc(etiqueta) + '</label>' +
      '<input id="dir_' + id + '" type="text" data-subcampo="' + id + '"' +
        ' value="' + esc(valores[id] || '') + '"' +
        (opciones.inputmode ? ' inputmode="' + opciones.inputmode + '"' : '') +
        (opciones.placeholder ? ' placeholder="' + esc(opciones.placeholder) + '"' : '') +
      ' /></div>';
  }

  /** Bloque de complemento: depende del tipo de inmueble escogido. */
  function renderComplemento(valores) {
    var tipo = limpio(valores.tipo_inmueble);

    if (tipo === 'Casa') {
      return '<p class="dir-nota-ok">Con «Casa» la dirección queda completa: no se piden ' +
        'apartamento, torre, bloque ni nombre de conjunto.</p>';
    }

    if (tipo !== 'Conjunto residencial') {
      return '<p class="dir-nota">Escoja el tipo de inmueble para continuar.</p>';
    }

    return '<div class="dir-rejilla">' +
      campoTexto('nombre_conjunto', 'Nombre del conjunto residencial', valores,
        { clase: 'dir-ancho-total', placeholder: 'Ej.: Conjunto Residencial Los Almendros' }) +
      '<div class="dir-campo">' +
        '<label>' + codigoSub('tipo_unidad') + 'Tipo de unidad</label>' +
        '<div class="dir-opciones">' +
          ['Apartamento', 'Casa'].map(function (op) {
            var marcada = limpio(valores.tipo_unidad) === op;
            return '<label class="opcion' + (marcada ? ' marcada' : '') + '">' +
              '<input type="radio" name="dir_tipo_unidad" data-subcampo="tipo_unidad"' +
                ' value="' + esc(op) + '"' + (marcada ? ' checked' : '') + ' />' +
              '<span>' + esc(op) + '</span></label>';
          }).join('') +
        '</div>' +
      '</div>' +
      campoTexto('numero_unidad', 'Número de apartamento o casa', valores,
        { inputmode: 'numeric', placeholder: 'Ej.: 401' }) +
      campoTexto('torre_bloque', 'Torre o bloque (opcional)', valores,
        { placeholder: 'Ej.: Torre 2' }) +
    '</div>';
  }

  /** HTML completo del campo. */
  function render(campo, valores) {
    valores = valores || {};

    return '<div class="campo-direccion" data-direccion="' + esc(campo.id) + '">' +

      '<div class="dir-rejilla dir-via">' + filaVia(valores) + '</div>' +

      '<div class="dir-vista-previa">' +
        '<span class="dir-vista-titulo">' + codigoSub('direccion_completa') + 'Dirección construida</span>' +
        '<strong id="dir-vista-texto">' + (esc(componer(valores)) || '—') + '</strong>' +
      '</div>' +

      '<div class="dir-bloque">' +
        '<label class="dir-pregunta">' + codigoSub('tipo_inmueble') + '¿Qué tipo de vivienda o inmueble es?</label>' +
        '<div class="dir-opciones dir-opciones-tipo">' +
          ['Casa', 'Conjunto residencial'].map(function (op) {
            var marcada = limpio(valores.tipo_inmueble) === op;
            return '<label class="opcion' + (marcada ? ' marcada' : '') + '">' +
              '<input type="radio" name="dir_tipo_inmueble" data-subcampo="tipo_inmueble"' +
                ' value="' + esc(op) + '"' + (marcada ? ' checked' : '') + ' />' +
              '<span>' + esc(op) + '</span></label>';
          }).join('') +
        '</div>' +
        '<div id="dir-complemento" class="dir-complemento">' + renderComplemento(valores) + '</div>' +
      '</div>' +

      renderBloqueMapa(valores) +
    '</div>';
  }

  function renderBloqueMapa(valores) {
    return '<div class="dir-bloque dir-geo">' +
      '<label class="dir-pregunta">' + codigoSub('latitud') + 'Ubicación de la vivienda en el mapa</label>' +
      '<p class="dir-ayuda">Toque el mapa para marcar el punto, o use el botón de ' +
        'ubicación actual si está parado frente a la vivienda. El punto se puede arrastrar ' +
        'para corregirlo.</p>' +

      '<div class="dir-geo-botones">' +
        '<button type="button" class="btn btn-primario" data-geo="gps">📍 Usar mi ubicación actual</button>' +
        '<button type="button" class="btn btn-secundario" data-geo="buscar">🔎 Buscar la dirección en el mapa</button>' +
        '<button type="button" class="btn btn-peligro-linea" data-geo="limpiar">Quitar ubicación</button>' +
      '</div>' +

      '<div class="dir-mapa-caja">' +
        '<div id="dir-mapa" class="dir-mapa"></div>' +
        '<div id="dir-mapa-velo" class="dir-mapa-velo oculto">' +
          '<span>Toque para mover el mapa</span>' +
        '</div>' +
      '</div>' +
      '<button type="button" id="dir-bloquear-mapa" class="btn btn-secundario dir-bloquear oculto" data-geo="bloquear">' +
        'Bloquear el mapa para poder desplazar la página</button>' +

      '<p id="dir-geo-estado" class="dir-geo-estado">' + textoEstado(valores) + '</p>' +

      // Aparece cuando la lectura del mapa propone una dirección distinta de
      // la ya escrita: la decisión de reemplazarla es del diligenciador.
      '<div id="dir-sugerencia" class="dir-sugerencia oculto"></div>' +

      '<button type="button" id="dir-confirmar" class="btn ' +
        (limpio(valores.ubicacion_confirmada) === 'Sí' ? 'btn-secundario' : 'btn-primario') +
        ' dir-confirmar" data-geo="confirmar">' +
        (limpio(valores.ubicacion_confirmada) === 'Sí'
          ? '✓ Ubicación confirmada y guardada'
          : 'Confirmar ubicación') +
      '</button>' +
    '</div>';
  }

  function textoEstado(valores) {
    if (!valores.latitud || !valores.longitud) {
      return 'Sin ubicación registrada. Este dato es opcional: la encuesta se puede ' +
        'finalizar sin él.';
    }
    var fuentes = {
      GPS: 'ubicación del dispositivo (GPS)',
      MAPA: 'punto seleccionado en el mapa',
      GEOCODIFICACION: 'geocodificación de la dirección'
    };
    var txt = 'Ubicación registrada: <strong>' + esc(valores.latitud) + ', ' +
      esc(valores.longitud) + '</strong> (EPSG:4326). Fuente: ' +
      esc(fuentes[valores.fuente_georreferenciacion] || valores.fuente_georreferenciacion) + '.';
    if (valores.precision_gps_m) txt += ' Precisión aproximada: ' + esc(valores.precision_gps_m) + ' m.';
    txt += limpio(valores.ubicacion_confirmada) === 'Sí'
      ? ' <strong class="dir-confirmada-marca">Confirmada.</strong>'
      : ' <span class="dir-pendiente-marca">Falta confirmarla.</span>';
    if (valores.direccion_geocodificada) {
      txt += '<br /><span class="dir-geocodificada">El servicio devolvió: ' +
        esc(valores.direccion_geocodificada) + '</span>';
    }
    return txt;
  }

  // ==========================================================================
  //  MONTAJE: eventos y mapa
  // ==========================================================================

  function montar(contenedor, campo, valores, callbacks) {
    desmontar();
    contenedorActual = contenedor.querySelector('[data-direccion="' + campo.id + '"]');
    if (!contenedorActual) return;
    valoresActual = valores;
    callbacks = callbacks || {};
    alCambiarActual = callbacks.alCambiar || null;
    guardarYaActual = callbacks.guardarYa || callbacks.alCambiar || null;

    contenedorActual.addEventListener('input', alEditar);
    contenedorActual.addEventListener('change', alEditar);
    contenedorActual.addEventListener('click', alPulsar);

    iniciarMapa();
  }

  function desmontar() {
    clearTimeout(temporizadorInverso);
    if (mapa) {
      try { mapa.remove(); } catch (e) { /* ya estaba destruido */ }
    }
    mapa = null;
    marcador = null;
    contenedorActual = null;
    valoresActual = null;
    alCambiarActual = null;
    guardarYaActual = null;
    propuestaPendiente = null;
  }

  function guardar() {
    valoresActual.direccion_completa = componer(valoresActual);
    var vista = contenedorActual.querySelector('#dir-vista-texto');
    if (vista) vista.textContent = valoresActual.direccion_completa || '—';
    if (alCambiarActual) alCambiarActual();
  }

  function alEditar(evento) {
    var control = evento.target;
    var sub = control.getAttribute && control.getAttribute('data-subcampo');
    if (!sub) return;

    // Radios y casillas disparan input y change: se atiende solo change.
    if ((control.type === 'radio' || control.type === 'checkbox') && evento.type === 'input') return;

    valoresActual[sub] = control.value;

    if (sub === 'tipo_inmueble') {
      // Al cambiar de tipo se limpian los campos que dejan de aplicar, para no
      // arrastrar datos de un conjunto en una casa.
      if (control.value !== 'Conjunto residencial') {
        CAMPOS_CONJUNTO.forEach(function (c) { valoresActual[c] = ''; });
      }
      redibujarComplemento();
      marcarOpciones(contenedorActual.querySelector('.dir-opciones-tipo'));
    }

    if (sub === 'tipo_unidad') {
      marcarOpciones(control.closest('.dir-opciones'));
    }

    // Mostrar u ocultar el campo de sufijo "Otro" sin rehacer todo el widget.
    if (sub === 'sufijo_via') {
      if (control.value !== 'Otro') valoresActual.sufijo_via_otro = '';
      redibujarVia();
    }
    if (sub === 'sufijo_generador') {
      if (control.value !== 'Otro') valoresActual.sufijo_generador_otro = '';
      redibujarVia();
    }

    guardar();
  }

  function marcarOpciones(caja) {
    if (!caja) return;
    caja.querySelectorAll('.opcion').forEach(function (etiqueta) {
      var input = etiqueta.querySelector('input');
      etiqueta.classList.toggle('marcada', !!(input && input.checked));
    });
  }

  function redibujarComplemento() {
    var caja = contenedorActual.querySelector('#dir-complemento');
    if (caja) caja.innerHTML = renderComplemento(valoresActual);
  }

  /** Redibuja solo la fila de la vía (para aparecer/ocultar el sufijo "Otro"). */
  function redibujarVia() {
    var caja = contenedorActual.querySelector('.dir-via');
    if (!caja) return;
    var activo = document.activeElement;
    var idActivo = activo && activo.id;
    caja.outerHTML = '<div class="dir-rejilla dir-via">' + filaVia(valoresActual) + '</div>';
    // Devolver el foco donde estaba, para no interrumpir el diligenciamiento.
    if (idActivo) {
      var reenfocar = contenedorActual.querySelector('#' + idActivo);
      if (reenfocar) reenfocar.focus();
    }
  }

  function filaVia(valores) {
    var sufijoEsOtro = limpio(valores.sufijo_via) === 'Otro';
    return '<div class="dir-campo">' +
        '<label for="dir_tipo_via">' + codigoSub('tipo_via') + 'Tipo de vía</label>' +
        '<select id="dir_tipo_via" data-subcampo="tipo_via">' +
          opcionesSelect(TIPOS_VIA, valores.tipo_via, 'Seleccione…') +
        '</select>' +
      '</div>' +
      campoTexto('numero_via', 'Número de la vía', valores,
        { inputmode: 'numeric', placeholder: 'Ej.: 15' }) +
      '<div class="dir-campo">' +
        '<label for="dir_sufijo_via">' + codigoSub('sufijo_via') + 'Letra o sufijo</label>' +
        '<select id="dir_sufijo_via" data-subcampo="sufijo_via">' +
          opcionesSelect(['Ninguno'].concat(SUFIJOS).concat(['Otro']),
            valores.sufijo_via || 'Ninguno', 'Ninguno') +
        '</select>' +
      '</div>' +
      (sufijoEsOtro
        ? campoTexto('sufijo_via_otro', 'Sufijo (¿cuál?)', valores, { placeholder: 'Ej.: Bis' })
        : '') +
      campoTexto('numero_generador', 'Número generador o cruce  (#)', valores,
        { inputmode: 'numeric', placeholder: 'Ej.: 4' }) +
      '<div class="dir-campo">' +
        '<label for="dir_sufijo_generador">' + codigoSub('sufijo_generador') + 'Letra del generador</label>' +
        '<select id="dir_sufijo_generador" data-subcampo="sufijo_generador">' +
          opcionesSelect(['Ninguno'].concat(SUFIJOS).concat(['Otro']),
            valores.sufijo_generador || 'Ninguno', 'Ninguno') +
        '</select>' +
      '</div>' +
      (limpio(valores.sufijo_generador) === 'Otro'
        ? campoTexto('sufijo_generador_otro', 'Sufijo del generador (¿cuál?)', valores, { placeholder: 'Ej.: Bis' })
        : '') +
      campoTexto('placa_inmueble', 'Placa del inmueble  (–)', valores,
        { inputmode: 'numeric', placeholder: 'Ej.: 50' });
  }

  // ==========================================================================
  //  MAPA
  // ==========================================================================

  function hayLeaflet() { return typeof window.L !== 'undefined'; }

  function esTactil() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  function iniciarMapa() {
    var caja = contenedorActual.querySelector('#dir-mapa');
    if (!caja) return;

    if (!hayLeaflet()) {
      caja.innerHTML = '<div class="dir-mapa-error">No se pudo cargar el componente de mapa. ' +
        'Puede registrar la ubicación con el botón «Usar mi ubicación actual», que no ' +
        'depende del mapa.</div>';
      return;
    }

    var lat = parseFloat(valoresActual.latitud);
    var lon = parseFloat(valoresActual.longitud);
    var tienePunto = !isNaN(lat) && !isNaN(lon);

    var centroInicial = centroActivo();
    mapa = window.L.map(caja, {
      center: tienePunto ? [lat, lon] : (centroInicial || CENTRO_VALLE),
      zoom: tienePunto ? ZOOM_PUNTO : (centroInicial ? ZOOM_CIUDAD : ZOOM_DEPARTAMENTO),
      // La rueda del ratón no debe secuestrar el desplazamiento de la página.
      scrollWheelZoom: false,
      zoomControl: true
    });

    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© colaboradores de OpenStreetMap'
    }).addTo(mapa);

    // Aviso si los mosaicos no cargan (sin conexión o servidor no disponible).
    var erroresMosaico = 0;
    mapa.on('tileerror', function () {
      erroresMosaico++;
      if (erroresMosaico === 6) {
        estado('No se pudieron cargar las imágenes del mapa: puede que no haya conexión. ' +
          'El botón «Usar mi ubicación actual» sigue funcionando porque el GPS no necesita internet.');
      }
    });

    if (tienePunto) ponerMarcador(lat, lon, false);

    mapa.on('click', function (e) {
      fijarCoordenadas(e.latlng.lat, e.latlng.lng, 'MAPA', null);
    });

    /* En pantalla táctil el mapa arranca bloqueado: si no, al intentar
       desplazar la página el dedo arrastra el mapa y la encuesta se queda
       atrapada. Se activa tocando el velo y se vuelve a bloquear con el botón. */
    if (esTactil()) {
      mapa.dragging.disable();
      contenedorActual.querySelector('#dir-mapa-velo').classList.remove('oculto');
    }

    // El mapa se dibuja dentro de un contenedor que acaba de aparecer:
    // hay que recalcular su tamaño una vez el navegador aplique el diseño.
    setTimeout(function () { if (mapa) mapa.invalidateSize(); }, 120);
  }

  function activarMapaTactil() {
    if (!mapa) return;
    mapa.dragging.enable();
    contenedorActual.querySelector('#dir-mapa-velo').classList.add('oculto');
    contenedorActual.querySelector('#dir-bloquear-mapa').classList.remove('oculto');
  }

  function bloquearMapaTactil() {
    if (!mapa) return;
    mapa.dragging.disable();
    contenedorActual.querySelector('#dir-mapa-velo').classList.remove('oculto');
    contenedorActual.querySelector('#dir-bloquear-mapa').classList.add('oculto');
  }

  function ponerMarcador(lat, lon, centrar) {
    if (!mapa) return;
    if (marcador) {
      marcador.setLatLng([lat, lon]);
    } else {
      marcador = window.L.marker([lat, lon], { draggable: true }).addTo(mapa);
      marcador.on('dragend', function () {
        var p = marcador.getLatLng();
        fijarCoordenadas(p.lat, p.lng, 'MAPA', null);
      });
    }
    if (centrar) mapa.setView([lat, lon], Math.max(mapa.getZoom(), ZOOM_PUNTO));
  }

  /** Registra coordenadas y su procedencia. Redondea a 6 decimales (~11 cm). */
  function fijarCoordenadas(lat, lon, fuente, precision, textoGeocodificado) {
    valoresActual.latitud = Number(lat).toFixed(6);
    valoresActual.longitud = Number(lon).toFixed(6);
    valoresActual.sistema_coordenadas = 'EPSG:4326';
    valoresActual.fuente_georreferenciacion = fuente;
    valoresActual.precision_gps_m = (precision === null || precision === undefined)
      ? '' : String(Math.round(precision));
    valoresActual.fecha_georreferenciacion = new Date().toISOString();
    if (textoGeocodificado !== undefined) {
      valoresActual.direccion_geocodificada = textoGeocodificado || '';
    }
    // La precisión de la búsqueda solo describe puntos que vinieron de ella.
    // Si el usuario movió el marcador o usó el GPS, el punto ya es suyo.
    if (fuente !== 'GEOCODIFICACION') valoresActual.precision_geocodificacion = '';
    // Si el punto cambia, la confirmación anterior deja de valer.
    valoresActual.ubicacion_confirmada = '';
    valoresActual.fecha_confirmacion_ubicacion = '';
    refrescarBotonConfirmar();

    ponerMarcador(lat, lon, true);
    var cajaMun = cajaActiva();
    var fueraDelMunicipio = cajaMun && !dentroDeCaja(Number(lat), Number(lon), cajaMun);
    estado(textoEstado(valoresActual) + (fueraDelMunicipio
      ? '<br><strong>Atención:</strong> el punto queda fuera del municipio elegido (' +
        esc(nombreMunicipioActivo()) + '). Verifique el municipio del formulario o la ubicación.'
      : ''));
    guardar();

    // La dirección se lee del mapa solo cuando el punto lo puso el usuario
    // (GPS o mapa). Si vino de buscar la dirección, ya la tenemos escrita.
    if (fuente !== 'GEOCODIFICACION') pedirDireccionDelMapa(lat, lon);
  }

  /**
   * Geocodificación inversa: pregunta al servicio qué dirección corresponde al
   * punto marcado y llena las casillas.
   *
   * Si las casillas están vacías las llena directamente. Si el diligenciador
   * ya escribió una dirección, NO la pisa: muestra la propuesta con un botón,
   * porque la dirección declarada en campo manda sobre la del servicio.
   */
  function pedirDireccionDelMapa(lat, lon) {
    clearTimeout(temporizadorInverso);
    // Espera a que el usuario deje de mover el punto: una consulta por segundo.
    temporizadorInverso = setTimeout(function () {
      var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1' +
        '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);

      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (datos) {
          if (!datos || !datos.address) return;
          valoresActual.direccion_geocodificada = datos.display_name || '';

          var propuesta = {};
          var via = parsearVia(datos.address.road);
          if (via) Object.keys(via).forEach(function (k) { propuesta[k] = via[k]; });
          var casa = parsearNumeroCasa(datos.address.house_number);
          if (casa) Object.keys(casa).forEach(function (k) { propuesta[k] = casa[k]; });

          if (!Object.keys(propuesta).length) {
            estado(textoEstado(valoresActual) +
              '<br /><span class="dir-geocodificada">El mapa no devolvió una dirección con ' +
              'nomenclatura reconocible para este punto. Diligencie las casillas a mano.</span>');
            guardar();
            return;
          }

          if (hayDireccionEscrita(valoresActual)) {
            mostrarSugerencia(propuesta);
          } else {
            aplicarPropuesta(propuesta);
          }
          estado(textoEstado(valoresActual));
          guardar();
        })
        .catch(function () {
          // Sin conexión al servicio: las coordenadas ya quedaron guardadas,
          // que es lo importante. La dirección se escribe a mano.
        });
    }, 900);
  }

  function aplicarPropuesta(propuesta) {
    CAMPOS_RELLENABLES.forEach(function (c) {
      if (propuesta[c] !== undefined) valoresActual[c] = propuesta[c];
    });
    redibujarVia();
    ocultarSugerencia();
    guardar();
  }

  function mostrarSugerencia(propuesta) {
    propuestaPendiente = propuesta;
    var texto = componer(Object.assign({}, valoresActual, propuesta,
      { tipo_inmueble: '', nombre_conjunto: '', torre_bloque: '', numero_unidad: '' }));
    var caja = contenedorActual.querySelector('#dir-sugerencia');
    if (!caja) return;
    caja.innerHTML = '<p>Según el mapa, este punto corresponde a <strong>' + esc(texto) +
      '</strong>. Su dirección escrita es <strong>' + esc(componer(valoresActual)) + '</strong>.</p>' +
      '<div class="dir-sugerencia-botones">' +
        '<button type="button" class="btn btn-primario-linea" data-geo="usar-sugerencia">' +
          'Usar la dirección del mapa</button>' +
        '<button type="button" class="btn btn-secundario" data-geo="descartar-sugerencia">' +
          'Conservar la que escribí</button>' +
      '</div>';
    caja.classList.remove('oculto');
  }

  function ocultarSugerencia() {
    propuestaPendiente = null;
    var caja = contenedorActual && contenedorActual.querySelector('#dir-sugerencia');
    if (caja) { caja.innerHTML = ''; caja.classList.add('oculto'); }
  }

  /**
   * Confirma la ubicación y fuerza el guardado inmediato, sin esperar al
   * guardado automático diferido.
   */
  function confirmarUbicacion() {
    if (!valoresActual.latitud || !valoresActual.longitud) {
      estado('Todavía no hay ubicación que confirmar. Marque el punto en el mapa ' +
        'o use el botón de ubicación actual.');
      return;
    }
    valoresActual.ubicacion_confirmada = 'Sí';
    valoresActual.fecha_confirmacion_ubicacion = new Date().toISOString();
    refrescarBotonConfirmar();
    estado(textoEstado(valoresActual));
    valoresActual.direccion_completa = componer(valoresActual);
    if (guardarYaActual) guardarYaActual();   // escritura inmediata en disco
  }

  function refrescarBotonConfirmar() {
    var boton = contenedorActual && contenedorActual.querySelector('#dir-confirmar');
    if (!boton) return;
    var confirmada = limpio(valoresActual.ubicacion_confirmada) === 'Sí';
    boton.textContent = confirmada ? '✓ Ubicación confirmada y guardada' : 'Confirmar ubicación';
    boton.className = 'btn ' + (confirmada ? 'btn-secundario' : 'btn-primario') + ' dir-confirmar';
  }

  function estado(html) {
    var p = contenedorActual && contenedorActual.querySelector('#dir-geo-estado');
    if (p) p.innerHTML = html;
  }

  // --- Botones ---------------------------------------------------------------

  function alPulsar(evento) {
    var boton = evento.target.closest('[data-geo]');
    var velo = evento.target.closest('#dir-mapa-velo');
    if (velo) { activarMapaTactil(); return; }
    if (!boton) return;

    var accion = boton.getAttribute('data-geo');
    if (accion === 'gps') usarUbicacionActual();
    else if (accion === 'buscar') geocodificar();
    else if (accion === 'limpiar') limpiarUbicacion();
    else if (accion === 'bloquear') bloquearMapaTactil();
    else if (accion === 'confirmar') confirmarUbicacion();
    else if (accion === 'usar-sugerencia') { if (propuestaPendiente) aplicarPropuesta(propuestaPendiente); }
    else if (accion === 'descartar-sugerencia') ocultarSugerencia();
  }

  function usarUbicacionActual() {
    if (!navigator.geolocation) {
      estado('Este dispositivo o navegador no permite obtener la ubicación.');
      return;
    }
    estado('Obteniendo la ubicación del dispositivo…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        fijarCoordenadas(pos.coords.latitude, pos.coords.longitude, 'GPS', pos.coords.accuracy);
      },
      function (err) {
        var mensajes = {
          1: 'No se concedió permiso de ubicación. Actívelo en los ajustes del navegador ' +
             'y vuelva a intentarlo, o marque el punto tocando el mapa.',
          2: 'No fue posible determinar la ubicación. Salga a un lugar despejado e intente ' +
             'de nuevo, o marque el punto tocando el mapa.',
          3: 'La ubicación tardó demasiado. Intente de nuevo o marque el punto en el mapa.'
        };
        estado(mensajes[err.code] || ('No se pudo obtener la ubicación: ' + esc(err.message)));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  /**
   * Geocodifica la dirección declarada usando Nominatim (OpenStreetMap).
   * Es una acción explícita: manda la dirección a un servicio externo.
   * La respuesta NO sobrescribe la dirección declarada.
   */
  /**
   * Búsqueda de la dirección escrita en el mapa base.
   *
   * POR QUÉ NO SE LE PIDE «LA DIRECCIÓN» AL BUSCADOR
   * El mapa base (OpenStreetMap) tiene las VÍAS de Cali pero no la placa de
   * cada predio (el «38-20»), y su buscador NO sabe resolver cruces («Calle 5
   * con Carrera 38» devuelve la Calle 5 entera, o una Carrera 38 cualquiera
   * —hay varias, al norte y al sur del río—). Pedir la dirección como texto
   * era lo que mandaba el punto a kilómetros, o a otra ciudad.
   *
   * CÓMO SE HACE AQUÍ
   *   1. Se piden por separado la GEOMETRÍA de la vía («Calle 5», todos sus
   *      tramos) y la de la vía generadora («Carrera 38», todos sus tramos),
   *      siempre acotadas a la caja de Cali.
   *   2. Se calcula el CRUCE: el par de tramos que se intersecan (o el punto
   *      donde más se acercan, si el mapa no los dibuja tocándose).
   *   3. Con la placa («20» en 38-20) se avanza esa distancia en metros desde
   *      el cruce, a lo largo de la vía, en el sentido en que crece la
   *      numeración: la placa es aproximadamente la distancia en metros
   *      desde la vía generadora, pero el SENTIDO en que crece depende de la
   *      nomenclatura de cada municipio; por eso este paso solo se aplica en
   *      municipios calibrados (hoy Cali). Eso deja el punto a la altura del
   *      predio — precisión de decenas de metros, no de kilómetros.
   *   4. Si solo hay vía (sin generador), se centra el mapa en la vía y se
   *      avisa que el punto es aproximado.
   * En todos los casos se dice en pantalla qué tan fino fue el acierto y se
   * guarda en precision_geocodificacion (predio / cruce / via). El marcador
   * queda arrastrable para el ajuste final, y el GPS en sitio sigue siendo la
   * mejor fuente.
   */
  function geocodificar() {
    var base = componer(valoresActual);
    if (!base) {
      estado('Escriba primero la dirección para poder buscarla.');
      return;
    }
    var ahora = Date.now();
    if (ahora - ultimaGeocodificacion < 1500) {
      estado('Espere un momento antes de volver a buscar.');
      return;
    }
    ultimaGeocodificacion = ahora;

    var ctx = window.CampoDireccion.contexto || {};
    var municipio = ctx.municipio || '';
    var cajaMun = ctx.caja || null;
    if (!municipio || !cajaMun) {
      // Sin municipio no hay a qué acotar la búsqueda: no se adivina uno.
      estado('Elija primero el <strong>municipio</strong> en el formulario: la búsqueda de la ' +
        'dirección se acota al municipio elegido. Mientras tanto: ' + RECOMENDACION);
      return;
    }
    var nombreMun = ctx.municipioNombre || municipio;

    var tipo = limpio(valoresActual.tipo_via);
    var numero = limpio(valoresActual.numero_via) + sufijoEfectivo(valoresActual);
    var generador = limpio(valoresActual.numero_generador);
    if (generador) generador += sufijoGeneradorEfectivo(valoresActual);
    var placa = parseInt(limpio(valoresActual.placa_inmueble), 10);
    var viaLarga = VIA_LARGA[tipo] || tipo;
    var cruzada = /^Cll|Calle/i.test(tipo) ? 'Carrera' : /^Cra|Carrera/i.test(tipo) ? 'Calle' : '';

    if (!viaLarga || !numero) {
      // Sin vía reconocible (Km, Mz, texto suelto): búsqueda libre acotada.
      estado('Buscando en el mapa…');
      buscarVia(base + ', ' + municipio, municipio, cajaMun, true).then(function (tramos) {
        if (!tramos.length) { sinResultado(); return; }
        var p = tramos[0].puntos[0];
        fijar(p[1], p[0], 'via', tramos[0].nombre, base);
      }).catch(fallo);
      return;
    }

    estado('Buscando la vía en el mapa…');
    var nombreVia = viaLarga + ' ' + numero;
    var nombreGen = cruzada && generador ? cruzada + ' ' + generador : '';

    buscarVia(nombreVia, municipio, cajaMun, false).then(function (tramosVia) {
      if (!tramosVia.length) { sinResultado(); return; }
      if (!nombreGen) {
        // Solo la vía. Si es única (o casi), se marca; si tiene muchos tramos
        // repartidos por la ciudad, marcar uno al azar engaña más que ayuda.
        var t = masCentral(tramosVia);
        var p = t.puntos[Math.floor(t.puntos.length / 2)];
        if (tramosVia.length <= 3) {
          fijar(p[1], p[0], 'via', t.nombre, nombreVia);
        } else {
          if (mapa) mapa.setView([p[1], p[0]], 14);
          estado('<strong>No se encontró la dirección exacta.</strong> La vía <strong>' + esc(nombreVia) + '</strong> tiene ' +
            tramosVia.length + ' tramos por ' + esc(nombreMun) + '; escriba el número generador (el cruce) para ubicarla. ' +
            RECOMENDACION);
        }
        return;
      }
      estado('Buscando el cruce con ' + esc(nombreGen) + '…');
      return esperar(1100).then(function () { return buscarVia(nombreGen, municipio, cajaMun, false); })
        .then(function (tramosGen) {
          if (!tramosGen.length) {
            // La generadora no está en el mapa base: no hay cómo saber en qué
            // tramo de la vía cae. Se avisa y NO se marca un punto que puede
            // estar a kilómetros; el mapa se centra en la vía para orientar.
            var t2 = masCentral(tramosVia);
            var p2 = t2.puntos[Math.floor(t2.puntos.length / 2)];
            if (mapa) mapa.setView([p2[1], p2[0]], 14);
            estado('<strong>No se encontró la dirección exacta.</strong> Está la vía <strong>' + esc(nombreVia) +
              '</strong> pero no la generadora <strong>' + esc(nombreGen) + '</strong> en el mapa base, y esa vía tiene ' +
              tramosVia.length + ' tramos por ' + esc(nombreMun) + ': no se puede saber en cuál cae la dirección. ' +
              RECOMENDACION);
            return;
          }
          var cruce = mejorCruce(tramosVia, tramosGen);
          if (!cruce) {
            /* Las dos vías existen pero el mapa base no las dibuja
               encontrándose (pasa en zonas de parcelaciones, como Pance).
               El mejor punto es el tramo de la vía MÁS CERCANO a la
               generadora: eso ubica al menos la zona correcta. Tomar el tramo
               «principal» sería un error: la Calle 18 tiene 23 tramos por
               toda la ciudad y el más largo puede estar a 12 km. */
          var cercano = tramoMasCercano(tramosVia, tramosGen);
          fijar(cercano.punto[1], cercano.punto[0], 'via', cercano.tramo.nombre,
            nombreVia + ' cerca de ' + nombreGen);
            return;
          }
          var punto = cruce.punto;
          /* Para subir a PREDIO el cruce tiene que ser una intersección real
             (o casi: ≤ 60 m, tolerancia de dibujo del mapa base). Si las dos
             vías existen pero el mapa no las dibuja encontrándose (la Carrera
             4E de Buga no llega a la Calle 5 en OSM), el «cruce» es solo el
             punto de máximo acercamiento y puede estar a cientos de metros:
             sirve para centrar el mapa, no para registrar una coordenada. */
          var cruceFirme = cruce.d <= 60;
          if (isNaN(placa) || placa <= 0 || !cruceFirme) {
            fijar(punto[1], punto[0], 'cruce', cruce.tramoVia.nombre, nombreVia + ' con ' + nombreGen);
            return;
          }
          /* Avanzar la placa (≈ metros) desde el cruce a lo largo de la vía, en
             el sentido en que crece la numeración de las generadoras. Ese
             SENTIDO se MIDE en el mapa: se busca la generadora vecina (la
             siguiente, o si no está la anterior) y se mira a qué lado del
             cruce cae. Vale para cualquier municipio cuyas vías estén en el
             mapa base. Si la vecina no aparece, se usa la regla escrita de la
             ciudad solo donde está verificada (Cali); en los demás casos la
             búsqueda se queda en el cruce y no registra coordenada. */
          estado('Midiendo hacia dónde crece la numeración…');
          return medirSentido(cruce, cruzada, generador, municipio, cajaMun, tramosVia).then(function (med) {
            var nivel = 'cruce';
            var sentido = null;
            var metrosAvance = placa;
            if (med) {
              sentido = med.sentido;
              /* La placa no debería pasar del largo de la cuadra; si lo pasa
                 (numeración irregular), se deja el punto dentro de la cuadra
                 en vez de saltar a la siguiente. */
              if (med.haciaSiguiente && placa > med.largoCuadra) metrosAvance = med.largoCuadra * 0.98;
            } else if (ctx.nomenclaturaCalibrada) {
              sentido = cruce.sentido;
            }
            if (sentido !== null) {
              var avanzado = avanzarPorVia(cruce.tramoVia.puntos, punto, metrosAvance, sentido);
              if (avanzado) { punto = avanzado; nivel = 'predio'; }
            }
            fijar(punto[1], punto[0], nivel, cruce.tramoVia.nombre, nombreVia + ' con ' + nombreGen,
              med ? 'Sentido de la numeración medido en el mapa con ' + med.vecino + '.'
                  : (nivel === 'predio' ? 'Sentido según la regla de nomenclatura de la ciudad.' : ''));
          });
        });
    }).catch(fallo);

    // ---- helpers de esta búsqueda ----
    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function fallo() {
      estado('<strong>No fue posible consultar el servicio de mapas</strong> (puede que no haya conexión). ' +
        RECOMENDACION);
    }
    function sinResultado() {
      estado('<strong>No se encontró la dirección</strong> dentro de ' + esc(nombreMun) +
        ' (revise el tipo y el número de la vía). ' + RECOMENDACION);
    }
    /* REGLA (decisión del equipo, 2026-08-15): la búsqueda SOLO registra una
       coordenada cuando llega a nivel de PREDIO (cruce hallado + placa). Si
       apenas ubica el cruce o la vía, NO se marca ningún punto: una
       coordenada aproximada que parece exacta es peor que ninguna. En ese
       caso se orienta el mapa a la zona y se pide marcar tocando el mapa o
       usar la ubicación actual. */
    function fijar(lat, lon, nivel, nombreDevuelto, buscado, nota) {
      if (nivel === 'predio') {
        fijarCoordenadas(lat, lon, 'GEOCODIFICACION', null, nombreDevuelto);
        valoresActual.precision_geocodificacion = nivel;
        guardar();
        if (mapa) mapa.setView([lat, lon], 18);
        estado(textoEstado(valoresActual) +
          '<br>Punto estimado <strong>a la altura del predio</strong> a partir del cruce y la placa. ' +
          (nota ? esc(nota) + ' ' : '') +
          'Verifique en el mapa; si no coincide, use «Usar mi ubicación actual» o arrastre el marcador. Luego confirme.');
        return;
      }
      /* Sin coordenada nueva. Un punto que había puesto una BÚSQUEDA anterior
         ya no corresponde a lo que se acaba de buscar: se borra. Pero un punto
         del GPS o marcado a mano es dato del diligenciador y NO se toca: solo
         se avisa que se conserva. */
      var fuentePrevia = valoresActual.fuente_georreferenciacion;
      var teniaPuntoPropio = !!(valoresActual.latitud && valoresActual.longitud) &&
        fuentePrevia && fuentePrevia !== 'GEOCODIFICACION';
      if (!teniaPuntoPropio) limpiarUbicacion();
      if (mapa && !teniaPuntoPropio) mapa.setView([lat, lon], nivel === 'cruce' ? 17 : 15);
      var razon = nivel === 'cruce'
        ? 'Solo se ubicó el <strong>cruce de las dos vías</strong>.'
        : 'Solo se ubicó la zona de la vía <strong>' + esc(buscado) + '</strong> ' +
          '(el mapa base no tiene la numeración de las casas).';
      if (teniaPuntoPropio) {
        estado(textoEstado(valoresActual) +
          '<br><strong>La búsqueda no encontró la dirección exacta</strong> (' + razon.replace(/<[^>]+>/g, '') + ') ' +
          'y por eso <strong>se conserva el punto que ya tenía</strong>. Si quiere reubicarlo: ' + RECOMENDACION);
        return;
      }
      estado('<strong>No se encontró la dirección exacta; no se registró ninguna coordenada.</strong> ' + razon +
        ' El mapa quedó centrado en esa zona. ' + RECOMENDACION);
    }
  }

  /**
   * Geometría de todos los tramos de una vía dentro del municipio:
   * [{nombre, puntos:[[lon,lat],…]}]. La caja del municipio acota la consulta
   * (viewbox+bounded) Y filtra la respuesta: las dos cosas leen el mismo
   * parámetro para que nunca se desincronicen.
   */
  function buscarVia(nombre, municipio, caja, libre) {
    var comunes = '&format=jsonv2&limit=50&polygon_geojson=1&countrycodes=co' +
      '&viewbox=' + caja.oeste + ',' + caja.norte + ',' + caja.este + ',' + caja.sur +
      '&bounded=1';
    var url = libre
      ? 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(nombre) + comunes
      : 'https://nominatim.openstreetmap.org/search?street=' + encodeURIComponent(nombre) +
        '&city=' + encodeURIComponent(municipio) + comunes;
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('respuesta ' + r.status); return r.json(); })
      .then(function (datos) {
        /* El servicio devuelve también vecinos parecidos: pedir «Carrera 4D»
           trae 32 tramos de OTRAS carreras. Cuando se busca una vía por su
           nombre, solo cuentan los resultados que se llaman EXACTAMENTE así;
           si no hay ninguno, la vía no está en el mapa base y se dice (no se
           acepta una parecida: eso es lo que mandaba el punto a otra parte).
           La búsqueda libre (texto suelto) sí se deja difusa. */
        if (!libre) {
          var pedido = sinTildes(nombre).replace(/\s+/g, ' ');
          datos = (datos || []).filter(function (d) {
            return sinTildes(d.name || '').replace(/\s+/g, ' ') === pedido;
          });
        }

        var tramos = [];
        (datos || []).forEach(function (d) {
          if (!d.geojson) {
            if (d.lat && d.lon) tramos.push({ nombre: d.display_name, puntos: [[parseFloat(d.lon), parseFloat(d.lat)]] });
            return;
          }
          var g = d.geojson;
          var lineas = g.type === 'LineString' ? [g.coordinates]
            : g.type === 'MultiLineString' ? g.coordinates
            : g.type === 'Point' ? [[g.coordinates]] : [];
          lineas.forEach(function (l) {
            if (l && l.length) tramos.push({ nombre: d.display_name, puntos: l });
          });
        });
        // Solo lo que cae dentro del municipio elegido.
        return tramos.filter(function (t) {
          return t.puntos.some(function (p) { return dentroDeCaja(p[1], p[0], caja); });
        });
      });
  }

  /**
   * Mide en el mapa hacia dónde crece la numeración de las generadoras a lo
   * largo de la vía del cruce.
   *
   * Idea: si la dirección es «Calle 5 # 4E-64», la placa 64 son ~64 m desde la
   * Carrera 4E en dirección a la Carrera 5. Así que se busca la Carrera 5
   * (la vecina siguiente), se halla su cruce con el MISMO tramo de la Calle 5,
   * y se compara a qué lado del cruce original cae. Si la 5 no está en el
   * mapa, se prueba con la anterior (la 4 si el generador tenía letra, si no
   * la 3) y se invierte la lectura. Devuelve {sentido, largoCuadra,
   * haciaSiguiente, vecino} o null si no se pudo medir.
   *
   * Es una medición LOCAL, con la geometría real de ese municipio: no depende
   * de saber la regla de nomenclatura de cada ciudad.
   */
  function medirSentido(cruce, cruzada, generadorTexto, municipio, caja, tramosVia) {
    var m = String(generadorTexto || '').match(/^(\d+)\s*(.*)$/);
    if (!m || !cruzada) return Promise.resolve(null);
    var base = parseInt(m[1], 10);
    var sufijo = (m[2] || '').trim();            // «E», «Bis», «Oeste» o vacío
    var pega = function (num) { return num + (sufijo ? (sufijo.length === 1 ? sufijo : ' ' + sufijo) : ''); };
    var pts = cruce.tramoVia.puntos;
    var diag = { generador: generadorTexto, dCruceBase: Math.round(cruce.d), intentos: [] };
    window.CampoDireccion.ultimaMedicion = diag;

    /* La letra de una generadora tiene DOS lecturas según la ciudad:
       - intermedia (Cali: la Carrera 41B está entre la 41 y la 42) → sus
         vecinas son la 42 y la 41 sin letra;
       - de sector (Buga: la Carrera 4E es «4 Este», otro eje de numeración)
         → sus vecinas son la 5E y la 3E.
       No se supone cuál aplica: se prueban ambas y gana la primera vecina que
       quede a distancia de cuadra (15–500 m). Sin letra: la siguiente y la
       anterior. */
    var candidatos = [];
    if (sufijo) {
      candidatos.push({ nombre: pega(base + 1), haciaSiguiente: true });
      if (base - 1 >= 1) candidatos.push({ nombre: pega(base - 1), haciaSiguiente: false });
      candidatos.push({ nombre: String(base + 1), haciaSiguiente: true });
      candidatos.push({ nombre: String(base), haciaSiguiente: false });
    } else {
      candidatos.push({ nombre: String(base + 1), haciaSiguiente: true });
      if (base - 1 >= 1) candidatos.push({ nombre: String(base - 1), haciaSiguiente: false });
    }

    /* Dirección de la vía en el cruce (tangente del tramo, en el sentido en
       que crece el índice de sus vértices). Sirve para decidir hacia qué lado
       cae la vecina aunque su cruce esté en OTRO tramo de la misma vía: el
       mapa base parte las calles en tramos cortos y la vecina rara vez cae en
       el mismo. */
    var i0 = Math.min(cruce.iVia, pts.length - 2);
    var a = pts[i0], b = pts[i0 + 1];
    if (!a || !b) return Promise.resolve(null);
    var kx = 111320 * Math.cos(a[1] * Math.PI / 180), ky = 110540;
    var tx = (b[0] - a[0]) * kx, ty = (b[1] - a[1]) * ky;

    function probar(numVecino, haciaSiguiente) {
      var nombreVecino = cruzada + ' ' + numVecino;     // numVecino ya trae letra/sufijo si aplica
      return esperarMs(1100)
        .then(function () { return buscarVia(nombreVecino, municipio, caja, false); })
        .then(function (tramosVec) {
          var reg = { vecino: nombreVecino, tramos: tramosVec.length };
          diag.intentos.push(reg);
          if (!tramosVec.length) return null;
          // Cruce de la vecina con CUALQUIER tramo de la vía, el más cercano al cruce original.
          var c2 = mejorCruce(tramosVia, tramosVec);
          if (!c2) { reg.motivo = 'sin cruce'; return null; }
          var largo = metros(c2.punto, cruce.punto);
          reg.dCruce = Math.round(c2.d); reg.largo = Math.round(largo);
          if (c2.d > 150) { reg.motivo = 'cruce lejano'; return null; }
          if (largo < 15 || largo > 500) { reg.motivo = 'largo fuera de rango'; return null; }   // una cuadra
          var vx = (c2.punto[0] - cruce.punto[0]) * kx, vy = (c2.punto[1] - cruce.punto[1]) * ky;
          var haciaIndice = (vx * tx + vy * ty) > 0;
          var creceHaciaIndice = haciaSiguiente ? haciaIndice : !haciaIndice;
          reg.ok = true;
          return { sentido: creceHaciaIndice ? 1 : -1, largoCuadra: largo,
                   haciaSiguiente: haciaSiguiente, vecino: nombreVecino };
        })
        .catch(function (e) { diag.intentos.push({ vecino: nombreVecino, error: String(e) }); return null; });
    }

    // Se prueban en orden y se para en la primera vecina plausible.
    var cadena = Promise.resolve(null);
    candidatos.forEach(function (c) {
      cadena = cadena.then(function (r) { return r ? r : probar(c.nombre, c.haciaSiguiente); });
    });
    return cadena;
  }

  function esperarMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Metros aproximados entre dos [lon,lat] (equirectangular; suficiente en una ciudad). */
  function metros(a, b) {
    var kx = 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    var ky = 110540;
    var dx = (a[0] - b[0]) * kx, dy = (a[1] - b[1]) * ky;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Tramo de `tramosVia` más cercano a cualquier tramo de `tramosGen`, y el punto de acercamiento. */
  function tramoMasCercano(tramosVia, tramosGen) {
    var mejor = null;
    tramosVia.forEach(function (tv) {
      tramosGen.forEach(function (tg) {
        tv.puntos.forEach(function (pv) {
          tg.puntos.forEach(function (pg) {
            var d = metros(pv, pg);
            if (!mejor || d < mejor.d) mejor = { d: d, tramo: tv, punto: pv };
          });
        });
      });
    });
    return mejor;
  }

  /** El tramo con más puntos (proxy del principal). */
  function masCentral(tramos) {
    return tramos.slice().sort(function (a, b) { return b.puntos.length - a.puntos.length; })[0];
  }

  /**
   * Punto donde dos polilíneas se cruzan o más se acercan. Devuelve
   * { punto:[lon,lat], tramoVia, tramoGen, sentido } o null si están a más
   * de 120 m (entonces no es un cruce real).
   */
  function mejorCruce(tramosVia, tramosGen) {
    var mejor = null;
    var segundoMejor = null;   // distancia del segundo mejor par de TRAMOS (para medir ambigüedad)
    tramosVia.forEach(function (tv) {
      tramosGen.forEach(function (tg) {
        for (var i = 0; i < tv.puntos.length - 1 || (tv.puntos.length === 1 && i === 0); i++) {
          var a1 = tv.puntos[i], a2 = tv.puntos[Math.min(i + 1, tv.puntos.length - 1)];
          for (var j = 0; j < tg.puntos.length - 1 || (tg.puntos.length === 1 && j === 0); j++) {
            var b1 = tg.puntos[j], b2 = tg.puntos[Math.min(j + 1, tg.puntos.length - 1)];
            var inter = interseccion(a1, a2, b1, b2);
            var punto, d;
            if (inter) { punto = inter; d = 0; }
            else {
              // Distancia mínima entre los dos segmentos: probar los 4 extremos.
              var c = [
                [proyectar(a1, b1, b2), a1], [proyectar(a2, b1, b2), a2],
                [proyectar(b1, a1, a2), b1], [proyectar(b2, a1, a2), b2]
              ];
              c.forEach(function (par) {
                var dd = metros(par[0], par[1]);
                if (d === undefined || dd < d) { d = dd; punto = par[0]; }
              });
            }
            if (!mejor || d < mejor.d) {
              // El anterior mejor pasa a segundo solo si era de OTRO par de tramos.
              if (mejor && (mejor.tramoVia !== tv || mejor.tramoGen !== tg)) segundoMejor = mejor.d;
              mejor = { d: d, punto: punto, tramoVia: tv, tramoGen: tg, iVia: i };
            } else if (mejor && (mejor.tramoVia !== tv || mejor.tramoGen !== tg) &&
                       (segundoMejor === null || d < segundoMejor)) {
              segundoMejor = d;
            }
          }
        }
      });
    });
    /* Tolerancia: los tramos de OSM no siempre se dibujan tocándose y traen
       pocos vértices, así que el cruce real cae entre vértices. Hasta 400 m se
       acepta como cruce. Entre 400 y 900 m se acepta SOLO si el par es
       inequívoco (ningún otro par de tramos queda a menos del doble): es el
       caso de zonas de parcelaciones, donde las vías existen pero el mapa
       las dibuja sin encontrarse. Más allá, no es un cruce. */
    if (!mejor) return null;
    if (mejor.d > 900) return null;
    if (mejor.d > 400 && !(mejor.d * 2 < (segundoMejor || Infinity))) return null;
    mejor.sentido = sentidoDeNumeracion(mejor.tramoVia, mejor.punto);
    return mejor;
  }

  /** Intersección de segmentos a1-a2 y b1-b2 en [lon,lat], o null. */
  function interseccion(a1, a2, b1, b2) {
    var d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
    if (Math.abs(d) < 1e-12) return null;
    var t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
    var u = ((b1[0] - a1[0]) * (a2[1] - a1[1]) - (b1[1] - a1[1]) * (a2[0] - a1[0])) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
  }

  /** Proyección del punto p sobre el segmento a-b (recortada al segmento). */
  function proyectar(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return a;
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return [a[0] + t * dx, a[1] + t * dy];
  }

  /**
   * RESPALDO (solo se usa si medirSentido no encuentra la generadora vecina y
   * el municipio está marcado como calibrado): en qué sentido crece la
   * numeración de las generadoras a lo largo de la vía según la regla ESCRITA
   * de la nomenclatura de Cali: las carreras aumentan hacia el
   * SUR-OCCIDENTE al alejarse del río Cali, y las calles hacia el sur. Aquí se
   * usa la aproximación: para una CALLE, las carreras crecen hacia el
   * sur-oeste (lat↓, lon↓); para una CARRERA, las calles crecen hacia el sur
   * (lat↓). Devuelve +1 si el índice creciente del tramo va en ese sentido,
   * -1 si va al revés.
   */
  function sentidoDeNumeracion(tramo, punto) {
    var pts = tramo.puntos;
    if (pts.length < 2) return 1;
    var a = pts[0], b = pts[pts.length - 1];
    var esCalle = /calle/i.test(tramo.nombre) && !/carrera/i.test(tramo.nombre.split(',')[0]);
    var haciaSur = b[1] < a[1];
    var haciaOeste = b[0] < a[0];
    if (esCalle) return (haciaSur || haciaOeste) ? 1 : -1;
    return haciaSur ? 1 : -1;
  }

  /** Avanza `metrosAvance` a lo largo de la polilínea desde `desde`, en `sentido`. */
  function avanzarPorVia(pts, desde, metrosAvance, sentido) {
    if (pts.length < 2) return null;
    // Índice del vértice más cercano al punto de partida.
    var k = 0, dk = Infinity;
    pts.forEach(function (p, i) { var d = metros(p, desde); if (d < dk) { dk = d; k = i; } });
    var restante = metrosAvance;
    var actual = desde;
    var i = k;
    var paso = sentido >= 0 ? 1 : -1;
    // Primer tramo: desde el punto de partida hacia el siguiente vértice.
    var siguiente = pts[i + paso];
    if (!siguiente) { paso = -paso; siguiente = pts[i + paso]; if (!siguiente) return null; }
    while (siguiente) {
      var d = metros(actual, siguiente);
      if (d >= restante) {
        var f = d === 0 ? 0 : restante / d;
        return [actual[0] + (siguiente[0] - actual[0]) * f, actual[1] + (siguiente[1] - actual[1]) * f];
      }
      restante -= d;
      actual = siguiente;
      i += paso;
      siguiente = pts[i + paso];
    }
    return actual;   // se acabó la vía: el extremo
  }

  function limpiarUbicacion() {
    clearTimeout(temporizadorInverso);
    ['latitud', 'longitud', 'sistema_coordenadas', 'fuente_georreferenciacion',
     'precision_gps_m', 'direccion_geocodificada', 'precision_geocodificacion',
     'fecha_georreferenciacion', 'ubicacion_confirmada', 'fecha_confirmacion_ubicacion']
      .forEach(function (c) { valoresActual[c] = ''; });
    if (marcador && mapa) { mapa.removeLayer(marcador); marcador = null; }
    ocultarSugerencia();
    refrescarBotonConfirmar();
    estado(textoEstado(valoresActual));
    guardar();
  }

  // ==========================================================================
  //  API
  // ==========================================================================

  window.CampoDireccion = {
    SUBCAMPOS: SUBCAMPOS,
    TIPOS_VIA: TIPOS_VIA,
    contexto: {},          // municipio/departamento para la geocodificación
    render: render,
    montar: montar,
    desmontar: desmontar,
    componer: componer,
    /**
     * El formulario cambió de municipio: se toma el contexto nuevo y, si la
     * encuesta todavía no tiene punto, el mapa se recentra en su cabecera.
     * Un punto ya marcado NO se mueve: es dato del diligenciador.
     */
    actualizarContexto: function (ctx) {
      window.CampoDireccion.contexto = ctx || {};
      if (!mapa) return;
      var lat = parseFloat(valoresActual.latitud), lon = parseFloat(valoresActual.longitud);
      var tienePunto = !isNaN(lat) && !isNaN(lon);
      if (!tienePunto) {
        if (ctx && ctx.centro) mapa.setView(ctx.centro, ZOOM_CIUDAD);
        else mapa.setView(CENTRO_VALLE, ZOOM_DEPARTAMENTO);
        estado(textoEstado(valoresActual));
      } else if (ctx && ctx.caja && !dentroDeCaja(lat, lon, ctx.caja)) {
        estado(textoEstado(valoresActual) + '<br><strong>Atención:</strong> el punto marcado queda fuera de ' +
          esc(ctx.municipioNombre || 'el municipio elegido') + '. Verifique el municipio o la ubicación.');
      }
    },
    // Se exponen porque encierran las reglas de nomenclatura colombiana:
    // conviene poder probarlas y reutilizarlas sin abrir el widget.
    parsearVia: parsearVia,
    parsearNumeroCasa: parsearNumeroCasa,
    /** Columnas que aporta este campo al CSV, en orden. */
    columnas: function () {
      return SUBCAMPOS.map(function (s) { return s.id; });
    }
  };
})();
