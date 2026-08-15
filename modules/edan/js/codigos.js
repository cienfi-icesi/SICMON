/* ============================================================================
   codigos.js — Numeración de preguntas.

   Cada pregunta tiene un código corto y estable: V### para el formulario de
   Vivienda (edificaciones), P### para el de Personas / Familia y A### para
   el de Afectaciones. El código aparece junto a la
   pregunta en pantalla, se exporta en el CSV y encabeza el diccionario de
   variables, de modo que un análisis pueda referirse a "V046" sin depender del
   texto de la pregunta, que puede corregirse con el tiempo.

   REGLA QUE NO SE DEBE ROMPER
   ---------------------------
   Estos códigos están CONGELADOS. Si mañana se agrega una pregunta, se le
   asigna el siguiente número libre (V105, P027, A041…) aunque quede en la mitad del
   formulario. NUNCA se renumera lo existente: hacerlo rompería la
   comparabilidad con los datos ya recolectados.

   Si se elimina una pregunta, su código queda retirado y no se reutiliza.

   Las respuestas se numeran por su posición dentro de la lista de opciones
   (1, 2, 3…) y ese número viaja en el CSV en la columna «<variable>_num».
   Como el CSV exporta además el valor y la etiqueta de cada respuesta, el
   número es una comodidad para el análisis, no el único identificador.
   ========================================================================== */
(function () {
  'use strict';

  window.CODIGOS = {

    // ======================= FORMULARIO DE VIVIENDA =======================
    vivienda: {
      // Sección 1 — Información general
      'viv_codigo': 'V001',
      /* V002 (Ficha No.) fue RETIRADO el 2026-08-14 por decisión del equipo,
         junto con el intento de numeración automática. No se reutiliza. */
      'viv_alcaldia_gobernacion': 'V003',
      'viv_prof_nombre': 'V004',
      'viv_prof_tarjeta': 'V005',
      'viv_prof_profesion': 'V006',
      'viv_prof_cc': 'V007',
      'viv_prof_cc_de': 'V008',
      'viv_prof_telefono': 'V009',
      'viv_prof_direccion': 'V010',
      'viv_fecha_evaluacion': 'V011',
      'viv_prop_nombres_apellidos': 'V012',
      'viv_prop_cc': 'V013',
      'viv_prop_cc_de': 'V014',
      'viv_prop_telefono': 'V015',
      'viv_prop_direccion': 'V016',

      // Sección 2 — Localización de la vivienda
      'viv_departamento': 'V017',
      'viv_municipio': 'V018',
      // Componentes de la dirección estructurada
      'tipo_via': 'V019',
      'numero_via': 'V020',
      'sufijo_via': 'V021',
      'sufijo_via_otro': 'V022',
      'numero_generador': 'V023',
      'placa_inmueble': 'V024',
      'tipo_inmueble': 'V025',
      'nombre_conjunto': 'V026',
      'tipo_unidad': 'V027',
      'numero_unidad': 'V028',
      'torre_bloque': 'V029',
      'direccion_completa': 'V030',
      // Georreferenciación
      'latitud': 'V031',
      'longitud': 'V032',
      'sistema_coordenadas': 'V033',
      'fuente_georreferenciacion': 'V034',
      'precision_gps_m': 'V035',
      'direccion_geocodificada': 'V036',
      'fecha_georreferenciacion': 'V037',
      'ubicacion_confirmada': 'V038',
      'fecha_confirmacion_ubicacion': 'V039',
      'viv_corregimiento': 'V040',
      'viv_vereda': 'V041',

      // Sección 3 — Requisitos del propietario
      'viv_req_no_beneficiario': 'V042',
      'viv_req_propietario': 'V043',
      'viv_req_certificacion_alcaldia': 'V044',

      // Sección 4 — Cumplimiento de requisitos
      'viv_cumple_requisitos': 'V045',

      // Sección 5 — Inspección de la vivienda
      'viv_tipo_evento': 'V046',
      'viv_tipo_evento_otro': 'V047',
      'viv_sistema_constructivo': 'V048',
      'viv_infra_muros': 'V049',
      'viv_infra_muros_otro': 'V050',
      'viv_infra_pisos': 'V051',
      'viv_infra_pisos_otro': 'V052',
      'viv_infra_estructura': 'V053',
      'viv_infra_estructura_otro': 'V054',
      'viv_infra_cubierta': 'V055',
      'viv_infra_cubierta_otro': 'V056',
      // 5.4 Mampostería
      'viv_mam_vigas_columnas_afectado': 'V057',
      'viv_mam_vigas_columnas_nivel': 'V058',
      'viv_mam_muros_carga_afectado': 'V059',
      'viv_mam_muros_carga_nivel': 'V060',
      'viv_mam_muros_divisorios_afectado': 'V061',
      'viv_mam_muros_divisorios_nivel': 'V062',
      'viv_mam_placa_piso_afectado': 'V063',
      'viv_mam_placa_piso_nivel': 'V064',
      'viv_mam_cubierta_afectado': 'V065',
      'viv_mam_cubierta_nivel': 'V066',
      'viv_mam_hidrosanitarias_afectado': 'V067',
      'viv_mam_hidrosanitarias_nivel': 'V068',
      'viv_mam_electricas_afectado': 'V069',
      'viv_mam_electricas_nivel': 'V070',
      // 5.4 Madera
      'viv_mad_vigas_columnas_afectado': 'V071',
      'viv_mad_vigas_columnas_nivel': 'V072',
      'viv_mad_entrepisos_afectado': 'V073',
      'viv_mad_entrepisos_nivel': 'V074',
      'viv_mad_muros_madera_afectado': 'V075',
      'viv_mad_muros_madera_nivel': 'V076',
      'viv_mad_cubierta_afectado': 'V077',
      'viv_mad_cubierta_nivel': 'V078',
      'viv_mad_hidrosanitarias_afectado': 'V079',
      'viv_mad_hidrosanitarias_nivel': 'V080',
      'viv_mad_electricas_afectado': 'V081',
      'viv_mad_electricas_nivel': 'V082',
      'viv_requiere_evacuacion': 'V083',

      // Sección 6 — Banco de materiales
      'viv_combo_mamposteria': 'V084',
      'viv_combo_madera': 'V085',
      'viv_kit_cubierta_mamposteria': 'V086',
      'viv_kit_cubierta_madera': 'V087',
      'viv_combo_colapso_total': 'V088',

      // Sección 7 — Persona que suministra la información
      'viv_inf_nombre': 'V089',
      'viv_inf_cc': 'V090',
      'viv_inf_parentesco': 'V091',
      'viv_inf_telefono': 'V092',
      /* V093 (firma del informante) RETIRADO el 2026-08-15: la operación es
         completamente virtual, no hay formato físico. No se reutiliza. */

      // Sección 8 — Afectado que no cumple requisitos
      'viv_declaracion_tipo': 'V094',
      'viv_nc_nombre': 'V095',
      'viv_nc_cc': 'V096',
      'viv_nc_telefono': 'V097',
      /* V098 (firma en la sección 8) RETIRADO el 2026-08-15: operación
         virtual. No se reutiliza. */

      // Sección 9 — Firma
      'viv_firma_profesional_nombre': 'V099',
      /* V100, V101 y V102 RETIRADOS el 2026-08-15 y no se reutilizan:
         · V100 y V102 eran las casillas «Firmó el formato físico» — la
           operación pasó a ser completamente virtual.
         · V101 era la aprobación del coordinador del Consejo Territorial,
           que corresponde a la visita oficial posterior (el futuro
           formulario de registro de afectaciones). */

      /* Agregada en la versión 1.6.0, al retirarse la Secretaría. Aparece en la
         sección 1 (datos del profesional), pero toma el siguiente número libre
         para no renumerar lo ya recolectado. */
      'viv_prof_organismo': 'V103',
      /* Agregada el 2026-08-15: qué tan fino fue el acierto de la búsqueda
         de la dirección en el mapa (predio / cruce / vía). */
      'precision_geocodificacion': 'V104',
      'sufijo_generador': 'V105',
      'sufijo_generador_otro': 'V106'
    },

    // ================== FORMULARIO DE PERSONAS / FAMILIA ==================
    personas: {
      // Secciones 1 a 4 — una vez por persona del hogar
      'per_nombres': 'P001',
      'per_apellidos': 'P002',
      'per_tipo_documento': 'P003',
      'per_numero_documento': 'P004',
      'per_parentesco': 'P005',
      'per_genero': 'P006',
      'per_edad': 'P007',
      'per_etnia': 'P008',
      'per_estado_salud': 'P009',
      'per_afiliacion_salud': 'P010',
      'per_ubicacion_inmueble': 'P011',
      'per_propiedad_inmueble': 'P012',
      'per_estado_inmueble': 'P013',
      'per_ahe_alimentaria': 'P014',
      'per_ahe_no_alimentaria': 'P015',
      'per_mat_rehab_vivienda': 'P016',
      'per_sub_arriendo': 'P017',

      // Sección 5 — Datos finales del formato
      'edan_elaborado_por': 'P018',
      /* P019 (casilla «Firmó el formato físico») RETIRADO el 2026-08-15:
         operación virtual. No se reutiliza. */
      'edan_entidad_operativa': 'P020',
      'edan_observaciones': 'P021'

      /* P022, P023, P024 y P025 (Vo.Bo. CMGRD y Vo.Bo. CDGRD, nombre y firma
         de cada uno) fueron RETIRADOS el 2026-08-14: esa parte se eliminó del
         formulario por decisión del equipo. Quedan retirados y NO se
         reutilizan (regla de la cabecera de este archivo).

         P026 (edan_ficha_no, número de ficha automático) se agregó y se
         RETIRÓ ese mismo día: la numeración automática no se adoptó.
         También queda retirado. */
    },

    // =================== FORMULARIO DE AFECTACIONES (A###) ===================
    // Fuente: formulario de Google «Caracterización Daños y Afectaciones —
    // Evento Sísmico Cali» de la Alcaldía. Agregado el 2026-08-15.
    afectaciones: {
      // Sección 1 — Identificación del reporte
      'afe_correo': 'A001',
      'afe_consecutivo_id': 'A002',

      // Sección 2 — Ubicación geográfica del evento
      // Componentes de la dirección estructurada (mismo campo compuesto que
      // usa el registro de edificaciones; aquí con códigos propios).
      'tipo_via': 'A003',
      'numero_via': 'A004',
      'sufijo_via': 'A005',
      'sufijo_via_otro': 'A006',
      'numero_generador': 'A007',
      'placa_inmueble': 'A008',
      'tipo_inmueble': 'A009',
      'nombre_conjunto': 'A010',
      'tipo_unidad': 'A011',
      'numero_unidad': 'A012',
      'torre_bloque': 'A013',
      'direccion_completa': 'A014',
      // Georreferenciación (las «Coordenadas WGS84» del formulario original)
      'latitud': 'A015',
      'longitud': 'A016',
      'sistema_coordenadas': 'A017',
      'fuente_georreferenciacion': 'A018',
      'precision_gps_m': 'A019',
      'direccion_geocodificada': 'A020',
      'fecha_georreferenciacion': 'A021',
      'ubicacion_confirmada': 'A022',
      'fecha_confirmacion_ubicacion': 'A023',
      'afe_nombre_edificacion': 'A024',
      'afe_barrio': 'A025',
      'afe_comuna': 'A026',

      // Sección 3 — Descripción de la afectación
      'afe_descripcion': 'A027',
      'afe_colapso': 'A028',
      'afe_requieren_evacuacion': 'A029',

      // Sección 4 — Personas afectadas
      'afe_fallecidos': 'A030',
      'afe_atrapadas': 'A031',
      'afe_necesitan_evacuar': 'A032',

      // Sección 5 — Edificación atendida
      'afe_tipo_edificacion': 'A033',
      'afe_cantidad_viviendas': 'A034',

      // Sección 6 — Observaciones y soportes
      'afe_observaciones': 'A035',
      'afe_fotos': 'A036',

      // Sección 7 — Persona que diligencia
      'afe_diligencia_nombre': 'A037',
      'afe_organismo': 'A038',
      'afe_grupo_voluntarios': 'A039',
      'precision_geocodificacion': 'A040',
      'afe_municipio': 'A041',
      'sufijo_generador': 'A042',
      'sufijo_generador_otro': 'A043'
    }
  };

  /** Código de una pregunta. Devuelve '' si todavía no tiene uno asignado. */
  window.CODIGOS.de = function (idFormulario, idCampo) {
    var tabla = window.CODIGOS[idFormulario] || {};
    return tabla[idCampo] || '';
  };

  /**
   * Número de una respuesta dentro de su pregunta (1, 2, 3…).
   * Devuelve '' si el valor no corresponde a ninguna opción.
   */
  window.CODIGOS.numeroOpcion = function (campo, valor) {
    if (!campo || !campo.opciones) return '';
    var n = '';
    campo.opciones.forEach(function (op, i) {
      if (String(op.valor) === String(valor)) n = i + 1;
    });
    return n;
  };
})();
