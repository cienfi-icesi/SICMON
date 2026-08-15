/* ============================================================================
   campo-fotos.js — Campo de soportes fotográficos.

   Toma fotos con la cámara del celular (o las elige de la galería), las
   COMPRIME en el propio dispositivo y las guarda dentro de la encuesta, para
   que viajen con ella al receptor de CIENFI, que las deja en Google Drive con
   el identificador de la encuesta.

   POR QUÉ SE COMPRIME AQUÍ
   Una foto de celular pesa 3 a 8 MB. Sin comprimir, cuatro fotos reventarían
   el almacenamiento local del navegador (~5 MB) y el envío tardaría minutos
   con señal de campo. Reducidas a 1280 px de lado mayor y JPEG al 80 % pesan
   150 a 400 KB, más que suficientes como evidencia, y el envío sigue siendo
   ligero.

   QUÉ SE GUARDA en respuestas[campo.id]: una lista de
     { nombre, mime, tam, datos }   ← datos = imagen en base64, ya comprimida
   y, cuando el receptor la ha guardado en Drive:
     { ..., url, drive_id }         ← escritos por la capa de sincronización.

   Se apoya en window.CODIGOS y en el estilo del resto de campos (styles.css).
   ========================================================================== */
(function () {
  'use strict';

  var LADO_MAX = 1280;      // px del lado mayor tras comprimir
  var CALIDAD = 0.8;        // JPEG
  var MAX_POR_DEFECTO = 10; // fotos por campo si el esquema no dice otra cosa
  /* Tope de bytes de foto por encuesta. Se guardan en base64 (×1,33) dentro
     del JSON único del almacén, que en Safari/iOS ronda los 2,5 M de
     caracteres: 1,5 MB de imagen ≈ 2 M de caracteres deja margen para las
     demás encuestas. A 1280 px y JPEG 80 % caben 5-8 fotos. */
  var TAM_MAX_TOTAL = 1.5 * 1024 * 1024;

  /* El almacén del navegador es UNO para todas las encuestas del equipo
     (~5 MB en la mayoría de navegadores). Antes de aceptar fotos nuevas se
     mide cuánto ocupa ya, y si con las nuevas se pasaría del presupuesto,
     se rechazan con un aviso claro en vez de dejar que el guardado falle. */
  var PRESUPUESTO_ALMACEN = 2.2 * 1024 * 1024 * 2; // ~2,2 M chars UTF-16 (Safari es el más estrecho)

  function ocupacionAlmacen() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || '').length) * 2; // UTF-16
      }
    } catch (e) { /* sin acceso: no se limita */ }
    return total;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function bytesDeBase64(b64) {
    // 4 caracteres base64 = 3 bytes; el relleno '=' resta.
    var s = String(b64 || '');
    var relleno = (s.match(/=+$/) || [''])[0].length;
    return Math.floor(s.length * 3 / 4) - relleno;
  }

  function legible(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** Lee un archivo de imagen, lo reduce y devuelve {nombre, mime, tam, datos}. */
  function comprimir(archivo) {
    return new Promise(function (resolver, rechazar) {
      var lector = new FileReader();
      lector.onerror = function () { rechazar(new Error('No se pudo leer la imagen.')); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { rechazar(new Error('El archivo no es una imagen válida.')); };
        img.onload = function () {
          var ancho = img.naturalWidth || img.width;
          var alto = img.naturalHeight || img.height;
          var factor = Math.min(1, LADO_MAX / Math.max(ancho, alto));
          var lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(ancho * factor));
          lienzo.height = Math.max(1, Math.round(alto * factor));
          var ctx = lienzo.getContext('2d');
          // Fondo blanco: los PNG con transparencia no quedan negros al pasar a JPEG.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);

          var dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD);
          var b64 = dataUrl.split(',')[1] || '';
          var base = String(archivo.name || 'foto').replace(/\.[^.]+$/, '');
          resolver({
            nombre: base + '.jpg',
            mime: 'image/jpeg',
            tam: bytesDeBase64(b64),
            datos: b64
          });
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  /** HTML del campo. `valores` es el contenedor de respuestas de la encuesta. */
  function render(campo, valores) {
    var lista = Array.isArray(valores[campo.id]) ? valores[campo.id] : [];
    var maximo = campo.maximo || MAX_POR_DEFECTO;
    var total = lista.reduce(function (a, f) { return a + (f.tam || 0); }, 0);

    var miniaturas = lista.map(function (f, i) {
      // Vista previa: bytes locales si los hay; si no, la miniatura de Drive
      // (uc?export=view sirve la imagen directa, no la página de Drive).
      var src = f.datos ? 'data:' + (f.mime || 'image/jpeg') + ';base64,' + f.datos
        : (f.drive_id ? 'https://drive.google.com/uc?export=view&id=' + esc(f.drive_id) : '');
      return '<figure class="foto-item">' +
        (src ? '<img src="' + esc(src) + '" alt="' + esc(f.nombre) + '" loading="lazy" />' : '<div class="foto-vacia">Sin vista previa</div>') +
        '<figcaption>' +
          '<span class="foto-nombre">' + esc(f.nombre) + '</span>' +
          '<span class="foto-meta">' + legible(f.tam || 0) +
            (f.url
              ? ' · <a href="' + esc(f.url) + '" target="_blank" rel="noopener">En Drive</a>' +
                (f.compartida === false ? ' <span title="Drive no permitió compartir el enlace: solo abre con acceso a la carpeta de CIENFI">(acceso restringido)</span>' : '')
              : ' · pendiente de envío') +
          '</span>' +
        '</figcaption>' +
        '<button type="button" class="btn btn-peligro-linea foto-quitar" ' +
          'data-fotos-quitar="' + esc(campo.id) + '" data-indice="' + i + '" ' +
          'aria-label="Quitar ' + esc(f.nombre) + '">Quitar</button>' +
      '</figure>';
    }).join('');

    var lleno = lista.length >= maximo;
    var idInput = 'fotos_' + campo.id;
    return '<div class="fotos" data-fotos="' + esc(campo.id) + '">' +
      '<div class="fotos-acciones">' +
        '<label class="btn btn-primario-linea btn-archivo' + (lleno ? ' deshabilitado' : '') + '">' +
          '📷 Tomar o elegir fotos' +
          '<input id="' + idInput + '" type="file" accept="image/*" multiple ' +
            'data-fotos-input="' + esc(campo.id) + '"' + (lleno ? ' disabled' : '') + ' />' +
        '</label>' +
        '<span class="hint">' + lista.length + ' de ' + maximo + ' · ' + legible(total) + '</span>' +
      '</div>' +
      '<div class="fotos-estado hint" id="' + idInput + '_estado"></div>' +
      (lista.length ? '<div class="fotos-lista">' + miniaturas + '</div>' : '') +
    '</div>';
  }

  /**
   * Procesa los archivos elegidos: comprime, respeta el tope y agrega al
   * contenedor. Llama a `alTerminar()` cuando ya se puede guardar y redibujar.
   * Devuelve una promesa con un mensaje para el usuario.
   */
  function agregar(campo, valores, archivos, alProgreso) {
    var lista = Array.isArray(valores[campo.id]) ? valores[campo.id].slice() : [];
    var maximo = campo.maximo || MAX_POR_DEFECTO;
    var total = lista.reduce(function (a, f) { return a + (f.tam || 0); }, 0);
    var pendientes = Array.prototype.slice.call(archivos || []);
    var agregadas = 0;
    var omitidas = [];

    var cadena = Promise.resolve();
    pendientes.forEach(function (archivo, i) {
      cadena = cadena.then(function () {
        if (lista.length >= maximo) { omitidas.push(archivo.name + ' (tope de ' + maximo + ')'); return; }
        if (!/^image\//.test(archivo.type || '')) { omitidas.push(archivo.name + ' (no es imagen)'); return; }
        if (alProgreso) alProgreso('Procesando ' + (i + 1) + ' de ' + pendientes.length + '…');
        return comprimir(archivo).then(function (foto) {
          if (total + foto.tam > TAM_MAX_TOTAL) {
            omitidas.push(archivo.name + ' (se superaría el tamaño máximo por encuesta)');
            return;
          }
          // base64 en UTF-16 dentro del JSON: ~2.7 bytes de almacén por byte de imagen.
          if (ocupacionAlmacen() + foto.tam * 2.7 > PRESUPUESTO_ALMACEN) {
            omitidas.push(archivo.name + ' (el almacenamiento de este equipo está casi lleno: ' +
              'envíe las encuestas pendientes o descargue el respaldo antes de agregar más fotos)');
            return;
          }
          total += foto.tam;
          lista.push(foto);
          agregadas++;
        }).catch(function (e) {
          omitidas.push(archivo.name + ' (' + (e.message || 'error') + ')');
        });
      });
    });

    return cadena.then(function () {
      valores[campo.id] = lista;
      var msg = agregadas + ' foto(s) agregada(s).';
      if (omitidas.length) msg += ' No se agregaron: ' + omitidas.join('; ') + '.';
      return { agregadas: agregadas, omitidas: omitidas, mensaje: msg };
    });
  }

  function quitar(campo, valores, indice) {
    var lista = Array.isArray(valores[campo.id]) ? valores[campo.id].slice() : [];
    lista.splice(indice, 1);
    valores[campo.id] = lista;
  }

  /** Para exportar: solo nombres y enlaces, nunca los bytes. */
  function resumenParaExportar(lista) {
    if (!Array.isArray(lista) || !lista.length) return { nombres: '', enlaces: '', cantidad: 0 };
    return {
      nombres: lista.map(function (f) { return f.nombre; }).join(' | '),
      enlaces: lista.map(function (f) { return f.url || ''; }).filter(Boolean).join(' | '),
      cantidad: lista.length
    };
  }

  window.CampoFotos = {
    render: render,
    agregar: agregar,
    quitar: quitar,
    resumenParaExportar: resumenParaExportar,
    LADO_MAX: LADO_MAX,
    TAM_MAX_TOTAL: TAM_MAX_TOTAL
  };
})();
