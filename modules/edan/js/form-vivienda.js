/* ============================================================================
   form-vivienda.js — Registro de edificaciones (formato VOL-10).
   El id interno del esquema sigue siendo 'vivienda': está guardado en las
   encuestas ya recolectadas y en la hoja de CIENFI, así que no se renombra.

   FUENTE DE VERDAD: input/formularios/vol10_viviendas.docx
   (transcripción del formato VOL-10 "Formato de inspección de viviendas
   afectadas", hoja F1 EVALUACIÓN). Las preguntas, sus opciones y su orden
   reproducen el transcript; no se agregaron ni se eliminaron preguntas.

   ADAPTACIONES TÉCNICAS (necesarias para llevar el formato de papel a una
   aplicación; ninguna cambia el contenido de las preguntas):
     1. Las firmas: en la etapa de papel se registraban como confirmación de
        que la persona firmó el formato físico. El 2026-08-15 esas casillas
        se RETIRARON (la operación pasó a ser completamente virtual) y la
        firma de registro es el nombre del responsable, que la aplicación
        escribe con los datos de la sesión.
     2. La sección 5.4 del papel es una matriz; aquí cada elemento se presenta
        como dos preguntas ("¿fue afectado?" y "nivel de daño"), tal como las
        enumera el transcript. El nivel de daño solo se pide si el elemento
        fue afectado.
     3. Departamento y Municipio vienen prellenados con Valle del Cauca y
        Santiago de Cali por ser el ámbito de esta operación; son editables.
     4. Las secciones 5 y 6 se ocultan cuando el afectado NO cumple requisitos
        y se muestra la sección 8, aplicando la instrucción del propio formato
        ("si la respuesta es negativa... pasar al numeral 8").
     5. La dirección de la vivienda (sección 2) no es un campo de texto libre
        sino un campo compuesto con la nomenclatura colombiana, que además
        permite georreferenciar el inmueble. Sigue siendo la misma pregunta
        del formato; cambia solo la forma de capturarla. Ver js/campo-direccion.js.
        Las direcciones del profesional y del propietario siguen siendo texto
        libre: son datos de contacto, no el inmueble que se inspecciona.
   ========================================================================== */
(function () {
  'use strict';

  // --- Ayudas para escribir condiciones de visibilidad ----------------------
  function eq(campo, valor) { return { campo: campo, op: 'eq', valor: valor }; }
  function inc(campo, valor) { return { campo: campo, op: 'incluye', valor: valor }; }

  var SI_NO = [
    { valor: 'si', etiqueta: 'Sí' },
    { valor: 'no', etiqueta: 'No' }
  ];

  var NIVELES_DANO = [
    { valor: 'leve', etiqueta: 'Leve' },
    { valor: 'moderado', etiqueta: 'Moderado' },
    { valor: 'severo', etiqueta: 'Severo' },
    { valor: 'colapso_total', etiqueta: 'Colapso total' }
  ];

  var NIVELES_DANO_NA = NIVELES_DANO.concat([{ valor: 'na', etiqueta: 'No aplica (N/A)' }]);

  /**
   * Construye el par de preguntas de un elemento de la sección 5.4.
   * sistema: 'mam' (mampostería) | 'mad' (madera)
   * conNA  : el transcript marca ese elemento con "(aplica N/A)"
   */
  function elementoDano(sistema, clave, nombre, conNA, condicionSistema) {
    var idAfectado = 'viv_' + sistema + '_' + clave + '_afectado';
    var idNivel = 'viv_' + sistema + '_' + clave + '_nivel';
    return [
      {
        id: idAfectado,
        etiqueta: nombre + ' — ¿El elemento fue afectado?',
        tipo: 'unica',
        opciones: SI_NO,
        visibleSi: condicionSistema,
        ancho: 'medio'
      },
      {
        id: idNivel,
        etiqueta: nombre + ' — Nivel de daño',
        tipo: 'unica',
        opciones: conNA ? NIVELES_DANO_NA : NIVELES_DANO,
        visibleSi: { todos: [condicionSistema, eq(idAfectado, 'si')] },
        ayudaNivelDano: { sistema: sistema === 'mam' ? 'mamposteria' : 'madera', elemento: clave },
        ancho: 'medio'
      }
    ];
  }

  var esMamposteria = eq('viv_sistema_constructivo', 'mamposteria');
  var esMadera = eq('viv_sistema_constructivo', 'madera');
  var cumpleRequisitos = eq('viv_cumple_requisitos', 'si');
  var noCumpleRequisitos = eq('viv_cumple_requisitos', 'no');

  // --- Definición del formulario --------------------------------------------
  window.FORM_VIVIENDA = {
    campoMunicipio: 'viv_municipio',
    id: 'vivienda',
    nombre: 'Registro de edificaciones',
    nombreCorto: 'Edificaciones',
    codigoFormato: 'VOL-10',
    titulo: 'Formato de inspección de viviendas afectadas',
    descripcion: 'Inspección técnica de la vivienda afectada y determinación del banco de materiales requerido.',
    icono: '🏠',
    // Campos que se comparten con el otro formulario al encadenar encuestas.
    camposVinculo: {
      nombre: 'viv_prop_nombres_apellidos',
      documento: 'viv_prop_cc',
      direccion: 'viv_prop_direccion',
      telefono: 'viv_prop_telefono'
    },

    secciones: [
      // ================= 1. INFORMACIÓN GENERAL =================
      {
        id: 'sec1',
        numero: '1',
        titulo: 'Información general',
        descripcion: 'Identificación del profesional que realiza la inspección y del propietario de la vivienda afectada.',
        campos: [
          { id: 'viv_codigo', etiqueta: 'Código', tipo: 'texto', ancho: 'tercio' },
          /* El «Ficha No.» del formato en papel (V002) se RETIRÓ por decisión
             del equipo (2026-08-14), junto con el intento de numerarlo
             automáticamente. Su código queda retirado en js/codigos.js. */
          {
            id: 'viv_alcaldia_gobernacion',
            etiqueta: 'Alcaldía / Gobernación',
            tipo: 'texto',
            valorPorDefecto: 'Alcaldía de Santiago de Cali',
            ancho: 'tercio'
          },

          { tipo: 'subtitulo', etiqueta: 'Datos del profesional responsable de la inspección y evaluación' },
          {
            id: 'viv_prof_nombre',
            etiqueta: 'Nombre del profesional responsable de la inspección y evaluación',
            tipo: 'texto',
            requerido: true,
            // Se rellena con los datos de quien inició sesión (ver config.js).
            autoUsuario: 'nombre',
            ancho: 'completo'
          },
          { id: 'viv_prof_tarjeta', etiqueta: 'Tarjeta profesional', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_prof_profesion', etiqueta: 'Profesión', tipo: 'texto', ancho: 'medio' },
          {
            id: 'viv_prof_organismo',
            etiqueta: 'Nombre del organismo al que pertenece',
            tipo: 'texto',
            ayuda: 'Entidad, organismo de socorro o institución que respalda la inspección.',
            ancho: 'completo'
          },
          { id: 'viv_prof_cc', etiqueta: 'C.C. No. (del profesional)', tipo: 'texto', modo: 'numerico', autoUsuario: 'cedula', ancho: 'medio' },
          { id: 'viv_prof_cc_de', etiqueta: 'De (lugar de expedición)', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_prof_telefono', etiqueta: 'Teléfono', tipo: 'texto', modo: 'telefono', ancho: 'medio' },
          { id: 'viv_prof_direccion', etiqueta: 'Dirección', tipo: 'texto', ancho: 'medio' },
          {
            id: 'viv_fecha_evaluacion',
            etiqueta: 'Fecha de evaluación',
            tipo: 'fecha',
            requerido: true,
            ayuda: 'Día / Mes / Año',
            ancho: 'medio'
          },

          { tipo: 'subtitulo', etiqueta: 'Datos del propietario de la vivienda afectada' },
          {
            id: 'viv_prop_nombres_apellidos',
            etiqueta: 'Nombres y apellidos',
            tipo: 'texto',
            requerido: true,
            ancho: 'completo'
          },
          { id: 'viv_prop_cc', etiqueta: 'C.C. No.', tipo: 'texto', modo: 'numerico', ancho: 'medio' },
          { id: 'viv_prop_cc_de', etiqueta: 'De (lugar de expedición)', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_prop_telefono', etiqueta: 'Teléfono', tipo: 'texto', modo: 'telefono', ancho: 'medio' },
          { id: 'viv_prop_direccion', etiqueta: 'Dirección', tipo: 'texto', ancho: 'medio' }
        ]
      },

      // ================= 2. LOCALIZACIÓN =================
      {
        id: 'sec2',
        numero: '2',
        titulo: 'Localización de la vivienda',
        campos: [
          {
            id: 'viv_departamento',
            etiqueta: 'Departamento',
            tipo: 'texto',
            valorPorDefecto: 'Valle del Cauca',
            ancho: 'medio'
          },
          {
            id: 'viv_municipio',
            etiqueta: 'Municipio',
            tipo: 'lista',
            // Los 42 municipios del Valle del Cauca (catálogo oficial DANE,
            // js/municipios-valle.js). El mapa y la búsqueda de la dirección
            // se ajustan al municipio elegido.
            opciones: window.opcionesMunicipiosValle ? window.opcionesMunicipiosValle() : [],
            valorPorDefecto: 'Santiago de Cali',
            requerido: true,
            ancho: 'medio'
          },
          {
            id: 'viv_direccion',
            etiqueta: 'Dirección de la vivienda en cabecera municipal',
            tipo: 'direccion',
            ayuda: 'Arme la dirección con las casillas. La aplicación la escribe sola: ' +
              'no hay que digitarla completa. Al final puede marcar la ubicación en el mapa.',
            ancho: 'completo'
          },
          { id: 'viv_corregimiento', etiqueta: 'Corregimiento', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_vereda', etiqueta: 'Vereda', tipo: 'texto', ancho: 'medio' }
        ]
      },

      // ================= 3. REQUISITOS =================
      {
        id: 'sec3',
        numero: '3',
        titulo: 'Requisitos del propietario para recibir el apoyo en banco de materiales',
        descripcion: 'Verifique cada requisito con el propietario de la vivienda.',
        campos: [
          {
            id: 'viv_req_no_beneficiario',
            etiqueta: 'No haber sido beneficiario del mismo programa o de algún otro programa de gobierno relacionado con la rehabilitación o construcción total de viviendas por ese mismo evento',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'completo'
          },
          {
            id: 'viv_req_propietario',
            etiqueta: 'Ser el propietario de la vivienda afectada o del lote destinado para la construcción de vivienda nueva (presentar escritura pública, certificado de compra-venta o sana posesión; los arrendatarios no son beneficiarios)',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'completo'
          },
          {
            id: 'viv_req_certificacion_alcaldia',
            etiqueta: 'Certificación de la Alcaldía de que el predio no se encuentra en zona de alto riesgo no mitigable ni de infraestructura básica a nivel nacional, regional o municipal',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'completo'
          }
        ]
      },

      // ================= 4. CUMPLE REQUISITOS =================
      {
        id: 'sec4',
        numero: '4',
        titulo: 'El afectado cumple con los requisitos para la auto-reparación de la vivienda',
        campos: [
          {
            id: 'viv_cumple_requisitos',
            etiqueta: '¿Cumple los requisitos?',
            tipo: 'unica',
            opciones: SI_NO,
            requerido: true,
            ayuda: 'Si la respuesta es negativa, no se continúa con la inspección de la vivienda; la aplicación lo llevará directamente al numeral 8.',
            ancho: 'completo'
          },
          {
            tipo: 'aviso',
            etiqueta: 'El afectado no cumple los requisitos. Las secciones 5, 6 y 7 no se diligencian: continúe en la sección 8.',
            visibleSi: noCumpleRequisitos
          }
        ]
      },

      // ================= 5. INSPECCIÓN =================
      {
        id: 'sec5',
        numero: '5',
        titulo: 'Inspección de la vivienda',
        visibleSi: cumpleRequisitos,
        campos: [
          { tipo: 'subtitulo', etiqueta: '5.1 Tipo de evento que afectó la vivienda' },
          {
            id: 'viv_tipo_evento',
            etiqueta: 'Tipo de evento',
            tipo: 'unica',
            requerido: true,
            opciones: [
              { valor: 'inundacion', etiqueta: 'Inundación' },
              { valor: 'vendaval', etiqueta: 'Vendaval' },
              { valor: 'sismo', etiqueta: 'Sismo' },
              { valor: 'avenida_torrencial', etiqueta: 'Avenida torrencial' },
              { valor: 'remocion_masa', etiqueta: 'Remoción en masa' },
              { valor: 'otro', etiqueta: 'Otro, ¿cuál?' }
            ],
            otroValor: 'otro',
            otroCampoId: 'viv_tipo_evento_otro',
            ancho: 'completo'
          },
          {
            id: 'viv_tipo_evento_otro',
            etiqueta: '¿Cuál otro evento?',
            tipo: 'texto',
            visibleSi: eq('viv_tipo_evento', 'otro'),
            ancho: 'medio'
          },

          { tipo: 'subtitulo', etiqueta: '5.2 Sistema constructivo de la vivienda' },
          {
            id: 'viv_sistema_constructivo',
            etiqueta: 'Sistema constructivo',
            tipo: 'unica',
            requerido: true,
            ayuda: 'De esta respuesta depende cuál matriz de evaluación técnica y cuáles combos de materiales se muestran.',
            opciones: [
              { valor: 'mamposteria', etiqueta: 'Mampostería' },
              { valor: 'madera', etiqueta: 'Madera' }
            ],
            ancho: 'completo'
          },

          { tipo: 'subtitulo', etiqueta: '5.3 Infraestructura actual de la vivienda' },
          {
            tipo: 'nota',
            etiqueta: 'Marque el o los materiales encontrados en la inspección para cada elemento. Las letras entre paréntesis son las convenciones del formato original.'
          },
          {
            id: 'viv_infra_muros',
            etiqueta: 'Muros divisorios',
            tipo: 'multiple',
            opciones: [
              { valor: 'L', etiqueta: '(L) Ladrillo' },
              { valor: 'Bl', etiqueta: '(Bl) Bloque' },
              { valor: 'M', etiqueta: '(M) Madera' },
              { valor: 'G', etiqueta: '(G) Guadua' },
              { valor: 'Ba', etiqueta: '(Ba) Bahareque' },
              { valor: 'O', etiqueta: '(O) Otro' }
            ],
            otroValor: 'O',
            otroCampoId: 'viv_infra_muros_otro',
            ancho: 'medio'
          },
          {
            id: 'viv_infra_muros_otro',
            etiqueta: 'Muros — ¿cuál otro material?',
            tipo: 'texto',
            visibleSi: inc('viv_infra_muros', 'O'),
            ancho: 'medio'
          },
          {
            id: 'viv_infra_pisos',
            etiqueta: 'Pisos',
            tipo: 'multiple',
            opciones: [
              { valor: 'C', etiqueta: '(C) Cemento' },
              { valor: 'B', etiqueta: '(B) Baldosa' },
              { valor: 'M', etiqueta: '(M) Madera' },
              { valor: 'T', etiqueta: '(T) Tierra' },
              { valor: 'O', etiqueta: '(O) Otro' }
            ],
            otroValor: 'O',
            otroCampoId: 'viv_infra_pisos_otro',
            ancho: 'medio'
          },
          {
            id: 'viv_infra_pisos_otro',
            etiqueta: 'Pisos — ¿cuál otro material?',
            tipo: 'texto',
            visibleSi: inc('viv_infra_pisos', 'O'),
            ancho: 'medio'
          },
          {
            id: 'viv_infra_estructura',
            etiqueta: 'Estructura',
            tipo: 'multiple',
            opciones: [
              { valor: 'M', etiqueta: '(M) Madera' },
              { valor: 'Co', etiqueta: '(Co) Concreto' },
              { valor: 'Ma', etiqueta: '(Ma) Mampostería' },
              { valor: 'O', etiqueta: '(O) Otro' }
            ],
            otroValor: 'O',
            otroCampoId: 'viv_infra_estructura_otro',
            ancho: 'medio'
          },
          {
            id: 'viv_infra_estructura_otro',
            etiqueta: 'Estructura — ¿cuál otro material?',
            tipo: 'texto',
            visibleSi: inc('viv_infra_estructura', 'O'),
            ancho: 'medio'
          },
          {
            id: 'viv_infra_cubierta',
            etiqueta: 'Cubierta',
            tipo: 'multiple',
            opciones: [
              { valor: 'Pc', etiqueta: '(Pc) Placa concreto' },
              { valor: 'M', etiqueta: '(M) Madera' },
              { valor: 'Ac', etiqueta: '(Ac) Asbesto-cemento' },
              { valor: 'Tb', etiqueta: '(Tb) Teja de barro' },
              { valor: 'Z', etiqueta: '(Z) Zinc' },
              { valor: 'P', etiqueta: '(P) Palma' },
              { valor: 'O', etiqueta: '(O) Otro' }
            ],
            otroValor: 'O',
            otroCampoId: 'viv_infra_cubierta_otro',
            ancho: 'medio'
          },
          {
            id: 'viv_infra_cubierta_otro',
            etiqueta: 'Cubierta — ¿cuál otro material?',
            tipo: 'texto',
            visibleSi: inc('viv_infra_cubierta', 'O'),
            ancho: 'medio'
          },

          { tipo: 'subtitulo', etiqueta: '5.4 Evaluación técnica de la vivienda a rehabilitar o construir' },
          {
            tipo: 'nota',
            etiqueta: 'Para cada elemento indique si fue afectado y, de ser así, el nivel de daño. Base técnica: Manual Operativo, capítulo 3, o Anexo 1. Use el botón "Ver criterios técnicos" de cada nivel de daño.'
          },
          {
            tipo: 'aviso',
            etiqueta: 'Seleccione primero el sistema constructivo (5.2) para que aparezca la matriz de evaluación correspondiente.',
            visibleSi: { ninguno: [esMamposteria, esMadera] }
          },

          { tipo: 'subtitulo', etiqueta: 'Mampostería', visibleSi: esMamposteria }
        ]
          .concat(elementoDano('mam', 'vigas_columnas', 'Vigas y columnas', false, esMamposteria))
          .concat(elementoDano('mam', 'muros_carga', 'Muros de carga', false, esMamposteria))
          .concat(elementoDano('mam', 'muros_divisorios', 'Muros divisorios', false, esMamposteria))
          .concat(elementoDano('mam', 'placa_piso', 'Placa de piso', true, esMamposteria))
          .concat(elementoDano('mam', 'cubierta', 'Cubierta', false, esMamposteria))
          .concat(elementoDano('mam', 'hidrosanitarias', 'Instalaciones hidrosanitarias', true, esMamposteria))
          .concat(elementoDano('mam', 'electricas', 'Instalaciones eléctricas', false, esMamposteria))
          .concat([{ tipo: 'subtitulo', etiqueta: 'Madera', visibleSi: esMadera }])
          .concat(elementoDano('mad', 'vigas_columnas', 'Vigas y columnas', false, esMadera))
          .concat(elementoDano('mad', 'entrepisos', 'Entrepisos', false, esMadera))
          .concat(elementoDano('mad', 'muros_madera', 'Muros en madera', true, esMadera))
          .concat(elementoDano('mad', 'cubierta', 'Cubierta', false, esMadera))
          .concat(elementoDano('mad', 'hidrosanitarias', 'Instalaciones hidrosanitarias', false, esMadera))
          .concat(elementoDano('mad', 'electricas', 'Instalaciones eléctricas', true, esMadera))
          .concat([
            {
              id: 'viv_requiere_evacuacion',
              etiqueta: '¿Requiere evacuación la vivienda?',
              tipo: 'unica',
              opciones: SI_NO,
              ancho: 'completo'
            }
          ])
      },

      // ================= 6. BANCO DE MATERIALES =================
      {
        id: 'sec6',
        numero: '6',
        titulo: 'Banco de materiales requerido para la rehabilitación',
        visibleSi: cumpleRequisitos,
        descripcion: 'Marque un solo combo de materiales y el kit de cubierta requerido según el tipo de vivienda; prevalece el nivel de daño identificado en el sistema estructural (vigas y columnas, muros de carga). Consultar el Anexo 2 — Banco de Materiales Estandarizado.',
        campos: [
          {
            tipo: 'aviso',
            etiqueta: 'Seleccione el sistema constructivo en la sección 5.2 para ver los combos que aplican.',
            visibleSi: { ninguno: [esMamposteria, esMadera] }
          },
          {
            id: 'viv_combo_mamposteria',
            etiqueta: 'Combo de materiales — Vivienda en mampostería',
            tipo: 'unica',
            visibleSi: esMamposteria,
            opciones: [
              { valor: 'combo_1', etiqueta: 'Combo 1 — Leve' },
              { valor: 'combo_2', etiqueta: 'Combo 2 — Moderado' },
              { valor: 'combo_3', etiqueta: 'Combo 3 — Severo' }
            ],
            ancho: 'medio'
          },
          {
            id: 'viv_combo_madera',
            etiqueta: 'Combo de materiales — Vivienda en madera',
            tipo: 'unica',
            visibleSi: esMadera,
            opciones: [
              { valor: 'combo_4', etiqueta: 'Combo 4 — Leve' },
              { valor: 'combo_5', etiqueta: 'Combo 5 — Moderado' },
              { valor: 'combo_6', etiqueta: 'Combo 6 — Severo' }
            ],
            ancho: 'medio'
          },
          {
            id: 'viv_kit_cubierta_mamposteria',
            etiqueta: 'Kit cubiertas — Vivienda en mampostería',
            tipo: 'unica',
            visibleSi: esMamposteria,
            opciones: [
              { valor: 'zinc', etiqueta: 'Cubierta zinc' },
              { valor: 'fibrocemento', etiqueta: 'Cubierta fibrocemento' }
            ],
            ancho: 'medio'
          },
          {
            id: 'viv_kit_cubierta_madera',
            etiqueta: 'Kit cubiertas — Vivienda en madera',
            tipo: 'unica',
            visibleSi: esMadera,
            opciones: [{ valor: 'zinc', etiqueta: 'Cubierta zinc' }],
            ancho: 'medio'
          },
          {
            id: 'viv_combo_colapso_total',
            etiqueta: 'Combo vivienda colapso total',
            tipo: 'unica',
            ayuda: 'Marcar solo si la vivienda sufrió colapso estructural total.',
            opciones: [
              { valor: 'mamposteria', etiqueta: 'Mampostería' },
              { valor: 'madera', etiqueta: 'Madera' }
            ],
            ancho: 'medio'
          }
        ]
      },

      // ================= 7. QUIEN SUMINISTRA LA INFORMACIÓN =================
      {
        id: 'sec7',
        numero: '7',
        titulo: 'Datos de la persona que suministra la información en la visita',
        visibleSi: cumpleRequisitos,
        descripcion: 'Si el beneficiario directo no se encuentra en la vivienda al momento de la visita, quien suministra la información debe ser un familiar mayor de edad.',
        campos: [
          { id: 'viv_inf_nombre', etiqueta: 'Nombre', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_inf_cc', etiqueta: 'C.C. No.', tipo: 'texto', modo: 'numerico', ancho: 'medio' },
          { id: 'viv_inf_parentesco', etiqueta: 'Parentesco', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_inf_telefono', etiqueta: 'Teléfono cel./fijo', tipo: 'texto', modo: 'telefono', ancho: 'medio' }
          /* La firma del informante (V093) se RETIRÓ el 2026-08-15: la
             operación es completamente virtual, no hay formato físico que
             firmar. Código retirado en js/codigos.js. */
        ]
      },

      // ================= 8. NO CUMPLE REQUISITOS =================
      {
        id: 'sec8',
        numero: '8',
        titulo: 'Afectado que no cumple con los requisitos para la auto-rehabilitación de la vivienda',
        visibleSi: noCumpleRequisitos,
        campos: [
          {
            tipo: 'nota',
            etiqueta: '«Estoy de acuerdo que: debido a que no se cumple con los requisitos establecidos, no puedo acceder al apoyo en banco de materiales para la rehabilitación ( ) o construcción ( ) de vivienda».'
          },
          {
            id: 'viv_declaracion_tipo',
            etiqueta: 'Declaración de conformidad — el apoyo al que no puede acceder es para',
            tipo: 'unica',
            opciones: [
              { valor: 'rehabilitacion', etiqueta: 'Rehabilitación' },
              { valor: 'construccion', etiqueta: 'Construcción' }
            ],
            ancho: 'completo'
          },
          { id: 'viv_nc_nombre', etiqueta: 'Nombre', tipo: 'texto', ancho: 'medio' },
          { id: 'viv_nc_cc', etiqueta: 'C.C. No.', tipo: 'texto', modo: 'numerico', ancho: 'medio' },
          { id: 'viv_nc_telefono', etiqueta: 'Teléfono cel./fijo', tipo: 'texto', modo: 'telefono', ancho: 'medio' }
          /* La firma (V098) se RETIRÓ el 2026-08-15: operación virtual, sin
             formato físico. Código retirado en js/codigos.js. */
        ]
      },

      // ================= 9. FIRMA =================
      {
        id: 'sec9',
        numero: '9',
        titulo: 'Firma de la inspección y evaluación de la vivienda',
        campos: [
          {
            id: 'viv_firma_profesional_nombre',
            etiqueta: 'Firma del profesional responsable de la inspección y evaluación — Nombre',
            tipo: 'texto',
            // Se rellena con el nombre de quien inició sesión (ver config.js).
            autoUsuario: 'nombre',
            ancho: 'completo'
          }
          /* RETIRADOS el 2026-08-15 (códigos retirados en js/codigos.js):
             · V100 y V102, las casillas «Firmó el formato físico»: la
               operación es completamente virtual, no hay papel que firmar.
             · V101, la aprobación del coordinador del Consejo Territorial:
               esa aprobación corresponde a la visita oficial posterior, que
               tendrá su propio formulario (registro de afectaciones). */
        ]
      }
    ]
  };
})();
