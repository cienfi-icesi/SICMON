/* ============================================================================
   form-personas.js — Registro de personas y familias (formato VOL-3, EDAN).

   FUENTE DE VERDAD: input/formularios/vol3_personas.docx
   (transcripción del formato VOL-3 "Evaluación de daños y análisis de
   necesidades — EDAN", código FR-1703-SMD-08, versión 01). Las preguntas,
   sus códigos numéricos y sus etiquetas reproducen el transcript.

   ADAPTACIONES TÉCNICAS (ninguna cambia el contenido de las preguntas):
     1. El formato en papel es una matriz de 12 filas de personas. Aquí las
        secciones 1 a 4 se diligencian una vez por persona, agregando tantas
        personas como tenga el hogar. No se limita a 12: el límite del papel
        es de espacio, no del instrumento.
     2. Las opciones muestran el código del formato junto a su significado
        (por ejemplo "3 · Cédula de ciudadanía"); lo que se almacena y se
        exporta es el código, igual que en el formato original.
     3. La firma (Elaborado por) se registra como nombre más una confirmación
        de firma en el formato físico. Los Vo.Bo. CMGRD y CDGRD del formato en
        papel se retiraron por decisión del equipo (2026-08-14). Ese mismo día
        se agregó y luego se RETIRÓ un «Ficha No.» automático (P026): la
        numeración automática no se adoptó.
   ========================================================================== */
(function () {
  'use strict';

  var SI_NO = [
    { valor: 'si', etiqueta: 'Sí' },
    { valor: 'no', etiqueta: 'No' }
  ];

  window.FORM_PERSONAS = {
    id: 'personas',
    nombre: 'Registro de personas y familias',
    nombreCorto: 'Personas y familias',
    codigoFormato: 'VOL-3 · FR-1703-SMD-08 v01',
    titulo: 'Evaluación de daños y análisis de necesidades (EDAN)',
    descripcion: 'Registro de las personas del hogar afectado, su estado de salud, la situación de su vivienda y las necesidades identificadas.',
    icono: '👪',
    // Campos que se comparten con el otro formulario al encadenar encuestas.
    // Se toman de la primera persona registrada del hogar.
    camposVinculo: {
      listaPersonas: 'personas',
      nombre: ['per_nombres', 'per_apellidos'],
      documento: 'per_numero_documento'
    },

    secciones: [
      // ================= PERSONAS DEL HOGAR (secciones 1 a 4) =================
      {
        id: 'secPersonas',
        numero: '1-4',
        titulo: 'Personas del hogar',
        tipo: 'repetible',
        claveLista: 'personas',
        etiquetaItem: 'Persona',
        minimo: 1,
        descripcion: 'Registre una a una las personas del hogar. Para cada persona se diligencian las secciones 1 a 4 del formato: información demográfica, salud, vivienda y necesidades.',
        campos: [
          { tipo: 'subtitulo', etiqueta: '1. Información demográfica' },
          { id: 'per_nombres', etiqueta: 'Nombres', tipo: 'texto', requerido: true, ancho: 'medio' },
          { id: 'per_apellidos', etiqueta: 'Apellidos', tipo: 'texto', requerido: true, ancho: 'medio' },
          {
            id: 'per_tipo_documento',
            etiqueta: 'Tipo de documento',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Registro civil' },
              { valor: '2', etiqueta: '2 · Tarjeta de identidad' },
              { valor: '3', etiqueta: '3 · Cédula de ciudadanía' },
              { valor: '4', etiqueta: '4 · Cédula de extranjería' },
              { valor: '5', etiqueta: '5 · Indocumentado' },
              { valor: '6', etiqueta: '6 · No sabe / No responde' }
            ],
            ancho: 'medio'
          },
          {
            id: 'per_numero_documento',
            etiqueta: 'Número de documento',
            tipo: 'texto',
            modo: 'numerico',
            ancho: 'medio'
          },
          {
            id: 'per_parentesco',
            etiqueta: 'Parentesco con el jefe de hogar',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Jefe de hogar' },
              { valor: '2', etiqueta: '2 · Esposo(a)' },
              { valor: '3', etiqueta: '3 · Hijo(a)' },
              { valor: '4', etiqueta: '4 · Primo(a)' },
              { valor: '5', etiqueta: '5 · Tío(a)' },
              { valor: '6', etiqueta: '6 · Nieto(a)' },
              { valor: '7', etiqueta: '7 · Suegro(a)' },
              { valor: '8', etiqueta: '8 · Yerno / Nuera' }
            ],
            ancho: 'medio'
          },
          {
            id: 'per_genero',
            etiqueta: 'Género',
            tipo: 'unica',
            opciones: [
              { valor: 'F', etiqueta: 'F · Femenino' },
              { valor: 'M', etiqueta: 'M · Masculino' }
            ],
            ancho: 'medio'
          },
          {
            id: 'per_edad',
            etiqueta: 'Edad',
            tipo: 'numero',
            min: 0,
            max: 120,
            ayuda: 'Años cumplidos',
            ancho: 'medio'
          },
          {
            id: 'per_etnia',
            etiqueta: 'Etnia',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Afrocolombiano' },
              { valor: '2', etiqueta: '2 · Indígena' },
              { valor: '3', etiqueta: '3 · Gitano - Rom' },
              { valor: '4', etiqueta: '4 · Raizal' },
              { valor: '5', etiqueta: '5 · Otro' },
              { valor: '6', etiqueta: '6 · Sin información' }
            ],
            ancho: 'medio'
          },

          { tipo: 'subtitulo', etiqueta: '2. Salud' },
          {
            id: 'per_estado_salud',
            etiqueta: 'Estado de salud',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Requiere asistencia médica' },
              { valor: '2', etiqueta: '2 · No requiere asistencia médica' }
            ],
            ancho: 'medio'
          },
          {
            id: 'per_afiliacion_salud',
            etiqueta: 'Afiliación al régimen de salud',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Contributivo' },
              { valor: '2', etiqueta: '2 · Subsidiado' },
              { valor: '3', etiqueta: '3 · Sin afiliación' }
            ],
            ancho: 'medio'
          },

          { tipo: 'subtitulo', etiqueta: '3. Vivienda' },
          {
            id: 'per_ubicacion_inmueble',
            etiqueta: 'Ubicación del inmueble',
            tipo: 'unica',
            opciones: [
              { valor: 'rural', etiqueta: 'Rural' },
              { valor: 'urbano', etiqueta: 'Urbano' }
            ],
            ancho: 'tercio'
          },
          {
            id: 'per_propiedad_inmueble',
            etiqueta: 'Propiedad del inmueble',
            tipo: 'unica',
            opciones: [
              { valor: 'propia', etiqueta: 'Propia' },
              { valor: 'arriendo', etiqueta: 'Arriendo' }
            ],
            ancho: 'tercio'
          },
          {
            id: 'per_estado_inmueble',
            etiqueta: 'Estado del inmueble',
            tipo: 'unica',
            opciones: [
              { valor: '1', etiqueta: '1 · Habitable' },
              { valor: '2', etiqueta: '2 · No habitable' },
              { valor: '3', etiqueta: '3 · Destruida' }
            ],
            ancho: 'tercio'
          },

          { tipo: 'subtitulo', etiqueta: '4. Necesidades' },
          {
            id: 'per_ahe_alimentaria',
            etiqueta: 'Ayuda humanitaria de emergencia — Alimentaria (AHE ALIM.)',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'medio'
          },
          {
            id: 'per_ahe_no_alimentaria',
            etiqueta: 'Ayuda humanitaria de emergencia — No alimentaria (AHE NO ALIM.)',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'medio'
          },
          {
            id: 'per_mat_rehab_vivienda',
            etiqueta: 'Material para rehabilitación de vivienda (MAT. REHAB. DE VIVIENDA)',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'medio'
          },
          {
            id: 'per_sub_arriendo',
            etiqueta: 'Subsidio de arriendo (SUB. ARRIENDO)',
            tipo: 'unica',
            opciones: SI_NO,
            ancho: 'medio'
          }
        ]
      },

      // ================= 5. DATOS FINALES DEL FORMATO =================
      {
        id: 'secFinal',
        numero: '5',
        titulo: 'Datos finales del formato',
        campos: [
          {
            id: 'edan_elaborado_por',
            etiqueta: 'Elaborado por',
            tipo: 'texto',
            requerido: true,
            ayuda: 'Nombre de quien elabora el formato.',
            ancho: 'medio'
          },
          {
            id: 'edan_elaborado_por_firma',
            etiqueta: 'Firma de quien elabora',
            tipo: 'confirmacion',
            textoConfirmacion: 'Firmó el formato físico',
            ancho: 'medio'
          },
          { id: 'edan_entidad_operativa', etiqueta: 'Entidad operativa', tipo: 'texto', ancho: 'completo' },
          {
            id: 'edan_observaciones',
            etiqueta: 'Observaciones',
            tipo: 'textarea',
            filas: 4,
            ancho: 'completo'
          }
          /* Los Vo.Bo. CMGRD y CDGRD (P022 a P025) se RETIRARON del formato
             por decisión del equipo (2026-08-14). Sus códigos quedan retirados
             en js/codigos.js y no se reutilizan. */
        ]
      }
    ]
  };
})();
