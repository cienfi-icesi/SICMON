/* ============================================================================
   form-afectaciones.js — Registro de afectaciones.

   FUENTE DE VERDAD: el formulario de Google «Caracterización Daños y
   Afectaciones - Evento Sísmico Cali» de la Alcaldía de Cali (capturas
   entregadas por el equipo el 2026-08-15). Las preguntas y sus opciones
   reproducen ese formulario; no se agregaron preguntas nuevas.

   Es la VISITA OFICIAL que confirma la edificación y caracteriza la
   afectación. Un registro por evento.

   ADAPTACIONES TÉCNICAS (ninguna cambia el contenido de las preguntas):
     1. «Correo electrónico» y «Nombre de la persona que diligencia» se
        rellenan con los datos de quien inició sesión (config.js) y quedan
        editables.
     2. «Dirección completa» y «Coordenadas WGS84» del formulario original
        se capturan con el mismo campo compuesto de dirección + mapa que usa
        el registro de edificaciones. Es la misma información, mejor
        capturada: la dirección queda estructurada y las coordenadas salen
        del GPS del dispositivo o del mapa, sin depender de una app externa
        («Timestamp Camera») ni de digitarlas a mano.
     3. «Suba los soportes» pasa a ser un campo de FOTOS: se toman con la
        cámara del celular o se eligen de la galería, se comprimen en el
        dispositivo y viajan con la encuesta. El receptor las guarda en Drive
        con el identificador de la encuesta y deja el enlace en la hoja.
     4. Las cantidades («EN NÚMEROS POR FAVOR») son campos numéricos: la
        aplicación no acepta letras ahí, que era lo que el formulario original
        pedía por las buenas.
     5. La casilla «Marque con una X si fue diligenciado por el grupo de
        voluntarios» se captura como Sí/No explícito, para que «no» quede
        registrado y no confundirse con «no respondió».
     6. «Consecutivo - id (solo si fue asignado)» se conserva como texto libre
        para el número que el CMGRD asigne por fuera; el identificador propio
        de la aplicación (AFE-…) se genera solo.
   ========================================================================== */
(function () {
  'use strict';

  function eq(campo, valor) { return { campo: campo, op: 'eq', valor: valor }; }

  var SI_NO = [
    { valor: 'si', etiqueta: 'Sí' },
    { valor: 'no', etiqueta: 'No' }
  ];

  window.FORM_AFECTACIONES = {
    id: 'afectaciones',
    nombre: 'Registro de afectaciones',
    nombreCorto: 'Afectaciones',
    codigoFormato: 'Caracterización de daños y afectaciones',
    titulo: 'Caracterización de daños y afectaciones — Evento sísmico Cali',
    descripcion: 'Visita oficial que confirma la edificación y caracteriza la afectación encontrada. Un registro por evento.',
    icono: '📋',
    // No comparte campos con los otros formularios: es un registro por
    // evento, no por hogar.
    camposVinculo: {},

    secciones: [
      // ================= 1. IDENTIFICACIÓN =================
      {
        id: 'afe_sec1',
        numero: '1',
        titulo: 'Identificación del reporte',
        descripcion: 'Quién reporta y a qué evento corresponde. Diligencie un registro por evento.',
        campos: [
          {
            id: 'afe_correo',
            etiqueta: 'Correo electrónico',
            tipo: 'texto',
            modo: 'correo',
            requerido: true,
            autoUsuario: 'correo',
            ayuda: 'Correo de quien diligencia el reporte.',
            ancho: 'medio'
          },
          {
            id: 'afe_consecutivo_id',
            etiqueta: 'Consecutivo - id (solo si fue asignado)',
            tipo: 'texto',
            ayuda: 'Solo si el CMGRD ya asignó un consecutivo a este evento. Si no, déjelo vacío.',
            ancho: 'medio'
          }
        ]
      },

      // ================= 2. UBICACIÓN =================
      {
        id: 'afe_sec2',
        numero: '2',
        titulo: 'Ubicación geográfica del evento',
        campos: [
          {
            id: 'afe_direccion',
            etiqueta: 'Dirección completa',
            tipo: 'direccion',
            requerido: true,
            ayuda: 'Arme la dirección con las casillas; la aplicación la escribe sola. ' +
              'Al final marque la ubicación en el mapa o use su ubicación actual: ' +
              'de ahí salen las coordenadas WGS84 (latitud y longitud).',
            ancho: 'completo'
          },
          {
            id: 'afe_nombre_edificacion',
            etiqueta: 'Nombre del edificio, centro comercial, hospital, unidad o conjunto residencial',
            tipo: 'texto',
            requerido: true,
            ayuda: 'Si aplica. En caso contrario escriba NA.',
            ancho: 'completo'
          },
          { id: 'afe_barrio', etiqueta: 'Barrio', tipo: 'texto', requerido: true, ancho: 'medio' },
          { id: 'afe_comuna', etiqueta: 'Comuna', tipo: 'texto', modo: 'numerico', requerido: true, ancho: 'medio' }
        ]
      },

      // ================= 3. AFECTACIÓN =================
      {
        id: 'afe_sec3',
        numero: '3',
        titulo: 'Descripción de la afectación o situación encontrada',
        descripcion: 'Reportar colapsos de estructuras, edificios con patologías graves, etc.',
        campos: [
          {
            tipo: 'nota',
            etiqueta: 'Ejemplos: 1) Colapso estructural de vivienda unifamiliar de 3 pisos (contando sótano). ' +
              '2) Colapso estructural parcial del Edificio Pepito, el cual contaba con 6 pisos. ' +
              '3) Riesgo estructural con posibilidad alta de colapso de la Torre 5 del Conjunto Residencial XXX ' +
              'o Edificio XXX por grietas en diferentes puntos de su mampostería.'
          },
          {
            id: 'afe_descripcion',
            etiqueta: 'Descripción completa de la situación',
            tipo: 'textarea',
            filas: 5,
            requerido: true,
            ancho: 'completo'
          },
          {
            id: 'afe_colapso',
            etiqueta: 'Colapso',
            tipo: 'unica',
            requerido: true,
            opciones: [
              { valor: 'riesgo_colapso', etiqueta: 'Riesgo de colapso' },
              { valor: 'colapsado', etiqueta: 'Colapsado' },
              { valor: 'no_aplica', etiqueta: 'No aplica (sin riesgo)' }
            ],
            ancho: 'medio'
          },
          {
            id: 'afe_requieren_evacuacion',
            etiqueta: 'Requieren evacuación',
            tipo: 'unica',
            requerido: true,
            opciones: [
              { valor: 'acompanamiento', etiqueta: 'Se requiere acompañamiento para evacuación' },
              { valor: 'si', etiqueta: 'Sí' },
              { valor: 'no', etiqueta: 'No' }
            ],
            ancho: 'medio'
          }
        ]
      },

      // ================= 4. PERSONAS =================
      {
        id: 'afe_sec4',
        numero: '4',
        titulo: 'Personas afectadas',
        descripcion: 'Digite las cantidades en números. Si no cuenta con el dato exacto, anótelo en las observaciones.',
        campos: [
          {
            id: 'afe_fallecidos',
            etiqueta: 'Cantidad de personas fallecidas',
            tipo: 'numero',
            min: 0,
            requerido: true,
            ancho: 'tercio'
          },
          {
            id: 'afe_atrapadas',
            etiqueta: 'Cantidad de personas atrapadas',
            tipo: 'numero',
            min: 0,
            requerido: true,
            ancho: 'tercio'
          },
          {
            id: 'afe_necesitan_evacuar',
            etiqueta: 'Cantidad aproximada de personas que necesitan evacuar',
            tipo: 'numero',
            min: 0,
            requerido: true,
            ayuda: 'Si al momento de la visita la edificación ya fue evacuada, anótelo en observaciones ' +
              'y ponga aquí el aproximado de personas que evacuaron (si cuenta con el dato).',
            ancho: 'tercio'
          }
        ]
      },

      // ================= 5. EDIFICACIÓN =================
      {
        id: 'afe_sec5',
        numero: '5',
        titulo: 'Edificación atendida',
        campos: [
          {
            id: 'afe_tipo_edificacion',
            etiqueta: 'Tipo de edificación atendida',
            tipo: 'texto',
            requerido: true,
            ayuda: 'Edificio, vivienda, parroquia, hospital, colegio y otros (mencionar cuál).',
            ancho: 'medio'
          },
          {
            id: 'afe_cantidad_viviendas',
            etiqueta: 'Cantidad de casas, viviendas o apartamentos caracterizados y atendidos',
            tipo: 'numero',
            min: 0,
            requerido: true,
            ancho: 'medio'
          }
        ]
      },

      // ================= 6. OBSERVACIONES Y SOPORTES =================
      {
        id: 'afe_sec6',
        numero: '6',
        titulo: 'Observaciones y soportes',
        campos: [
          {
            id: 'afe_observaciones',
            etiqueta: 'Observaciones generales',
            tipo: 'textarea',
            filas: 6,
            requerido: true,
            ayuda: 'Mencione todos los detalles relevantes que ayuden a identificar y caracterizar la situación: ' +
              'personas atrapadas, rescatadas o fallecidas si se sabe pero no hay dato concreto; ' +
              'si se necesita presencia de Policía o Ejército; evacuación inmediata de residentes; ' +
              'si todas las personas evacuaron por precaución; datos de contacto (WhatsApp, teléfonos, ' +
              'correos) de las familias o personas afectadas; y todo lo demás observado en campo.',
            ancho: 'completo'
          },
          {
            id: 'afe_fotos',
            etiqueta: 'Soportes fotográficos',
            tipo: 'fotos',
            maximo: 10,
            ayuda: 'Tome fotos con la cámara o elíjalas de la galería (hasta 10). Se guardan con el ' +
              'identificador de esta encuesta y quedan disponibles para el coordinador.',
            ancho: 'completo'
          }
        ]
      },

      // ================= 7. QUIÉN DILIGENCIA =================
      {
        id: 'afe_sec7',
        numero: '7',
        titulo: 'Persona que diligencia el reporte',
        campos: [
          {
            id: 'afe_diligencia_nombre',
            etiqueta: 'Nombre de la persona que diligencia el reporte',
            tipo: 'texto',
            requerido: true,
            autoUsuario: 'nombre',
            ancho: 'medio'
          },
          {
            id: 'afe_organismo',
            etiqueta: 'Nombre del organismo al que pertenece',
            tipo: 'texto',
            requerido: true,
            autoUsuario: 'organismo',
            ayuda: 'Si hace parte del grupo de ingenieros y arquitectos voluntarios, indíquelo en la siguiente pregunta.',
            ancho: 'medio'
          },
          {
            id: 'afe_grupo_voluntarios',
            etiqueta: '¿Este formulario fue diligenciado por el grupo de arquitectos e ingenieros voluntarios ' +
              'para la evaluación de edificaciones en riesgo de colapso?',
            tipo: 'unica',
            requerido: true,
            opciones: SI_NO,
            ancho: 'completo'
          }
        ]
      }
    ]
  };
})();
