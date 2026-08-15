/* ============================================================================
   ayuda-nivel-dano.js — Anexo 1: clasificación del nivel de daño.

   FUENTE: input/formularios/vol10_viviendas.docx, apartado "Anexo 1 —
   Clasificación del nivel de daño (referencia)". Se usa como ayuda en
   pantalla cuando el diligenciador debe escoger el nivel de daño de un
   elemento en la sección 5.4; no es una pregunta ni se almacena.

   Estructura: AYUDA_NIVEL_DANO[sistema][elemento][nivel] = criterio técnico.
   Un elemento sin texto para cierto nivel es un vacío del propio Anexo 1.
   ========================================================================== */
(function () {
  'use strict';

  window.AYUDA_NIVEL_DANO = {
    mamposteria: {
      vigas_columnas: {
        leve: 'Pérdida de recubrimiento de concreto.',
        moderado: 'Pérdida de recubrimiento de concreto. Pandeo local (desplazamiento lateral del eje del elemento).',
        severo: 'Pandeo local (desplazamiento lateral del eje del elemento). Falla en la sección transversal del elemento estructural por compresión, cortante, flexión y flexo-compresión. Deformación del acero de refuerzo (longitudinal y transversal).',
        colapso_total: 'Aplastamiento del concreto. Falla en la sección transversal del elemento estructural por compresión, cortante, flexión y flexo-compresión. Falla entre la conexión (nodos) viga-columna. Deformación y fractura del acero de refuerzo (longitudinal y transversal). Desplome de vigas y columnas.'
      },
      muros_carga: {
        leve: 'Formación de grietas verticales y horizontales en un 10% de las hiladas del muro y mortero fisurado. Grietas orientadas diagonalmente pero no continuas a través del muro, se forman las grietas sin que evidencien desplazamiento horizontal.',
        moderado: 'Formación de grietas verticales y horizontales en un 30% de las hiladas del muro y mortero fisurado. Las grietas diagonales llegan a alcanzar las esquinas. Se presentan roturas locales en la mampostería.',
        severo: 'Se presentan roturas locales en la mampostería. Desplazamiento horizontal a lo largo de grietas escalonadas. Grietas que atraviesan la totalidad de la mampostería. Falla por tracción diagonal por carecer de vigas y columnas de amarre.',
        colapso_total: 'Aplastamiento local de la mampostería. Desplome o inclinación apreciable de los muros.'
      },
      muros_divisorios: {
        leve: 'Mortero fisurado en la parte superior e inferior (entre marcos y muros).',
        moderado: 'Grietas escalonadas y continuas a través del muro. Mortero fisurado a lo largo de las grietas presentadas.',
        severo: 'Grietas escalonadas y continuas que atraviesan la totalidad del muro. Mortero fisurado a lo largo de las grietas presentadas.',
        colapso_total: 'Mortero fisurado a lo largo de las grietas presentadas. Aplastamiento local de la mampostería. Desplome o inclinación apreciable de los muros.'
      },
      placa_piso: {
        moderado: 'Grietas en la placa de piso, las cuales se presentan en ambas direcciones.',
        severo: 'Grietas longitudinales y transversales, asentamientos diferenciales de la placa de piso (inclinación).',
        colapso_total: 'Desplome de la placa.'
      },
      cubierta: {
        leve: 'Desplazamiento de una o varias tejas de su posición inicial, con pérdida, falla o rotura (entre el 10% y 30% del área total de la cubierta).',
        moderado: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (entre el 31% y 50% del área total de la cubierta).',
        severo: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (entre el 51% y 80% del área total de la cubierta). Deformación en el 50% de los elementos de la estructura o armazón de soporte (correas, cumbrera, puntales, riostras, viguetas).',
        colapso_total: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (100% del área total de la cubierta). Colapso de la estructura o armazón de soporte (correas, cumbrera, puntales, riostras, viguetas).'
      },
      hidrosanitarias: {
        leve: 'Fisuras o roturas en la tubería.',
        moderado: 'Fisuras o roturas en la tubería. Desacople de los accesorios de la tubería.',
        severo: 'Desacople de accesorios o fugas en la tubería. Afectación estructural con presencia de grietas y obstrucción del flujo e infiltraciones en tanques de almacenamiento de agua y/o pozos sépticos.',
        colapso_total: 'Desacople de accesorios y fugas en la tubería. Afectación estructural con presencia de grietas y obstrucción del flujo e infiltraciones en tanques de almacenamiento de agua y/o pozos sépticos.'
      },
      electricas: {
        moderado: 'Desacople de los accesorios de la tubería.',
        severo: 'Desacople de accesorios en tubería. Corto circuito de la red eléctrica.',
        colapso_total: 'Desacople de accesorios en tubería. Corto circuito de la red eléctrica.'
      }
    },

    madera: {
      vigas_columnas: {
        leve: 'Fisuras en los elementos. Pérdida de la estructura fibrosa de la madera.',
        moderado: 'Grietas y fisuras en los elementos. Desplazamiento de los elementos de su posición inicial.',
        severo: 'Disminución en la sección transversal de los elementos. Pérdida de anclaje entre el elemento y el sistema estructural. Fractura del elemento.',
        colapso_total: 'Pérdida de anclaje entre el elemento y el sistema estructural. Falla entre la conexión (nodos) viga-columna. Desplome de vigas y columnas.'
      },
      entrepisos: {
        leve: 'Pérdida de su estructura fibrosa de la madera.',
        moderado: 'Grietas longitudinales y transversales.',
        severo: 'Grietas longitudinales y transversales y pandeo del entrepiso.',
        colapso_total: 'Desplome o inclinación apreciable.'
      },
      muros_madera: {
        moderado: 'Pérdida de anclaje entre el elemento y el sistema estructural.',
        severo: 'Pérdida de anclaje entre el elemento y el sistema estructural. Fractura del elemento.',
        colapso_total: 'Pérdida de anclaje entre el elemento y el sistema estructural. Desplome o inclinación apreciable.'
      },
      cubierta: {
        leve: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (entre el 10% y 30% del área total de la cubierta).',
        moderado: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (entre el 31% y 50% del área total de la cubierta).',
        severo: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (entre el 51% y 80% del área total de la cubierta). Deformación en el 50% de los elementos de la estructura o armazón de soporte (correas, cumbrera, puntales, riostras, viguetas).',
        colapso_total: 'Desplazamiento de una o varias tejas de su posición inicial, con falla o rotura (100% del área total de la cubierta). Colapso de la estructura o armazón de soporte (correas, cumbrera, puntales, riostras, viguetas).'
      },
      hidrosanitarias: {
        leve: 'Fisuras o roturas en la tubería.',
        moderado: 'Fisuras o roturas en la tubería. Desacople de los accesorios de la tubería.',
        severo: 'Desacople de accesorios o fugas en la tubería. Afectación estructural con presencia de grietas y obstrucción del flujo e infiltraciones en tanques de almacenamiento de agua y/o pozos sépticos.',
        colapso_total: 'Desacople de accesorios o fugas en la tubería. Afectación estructural con presencia de grietas y obstrucción del flujo e infiltraciones en tanques de almacenamiento de agua y/o pozos sépticos.'
      },
      electricas: {
        moderado: 'Desacople de los accesorios de la red eléctrica.',
        severo: 'Desacople de los accesorios de la red eléctrica. Corto circuito de la red eléctrica.',
        colapso_total: 'Desacople de los accesorios de la red eléctrica. Corto circuito de la red eléctrica.'
      }
    },

    // Etiquetas de los niveles, para el encabezado de la ayuda.
    nivelesEtiqueta: {
      leve: 'Leve (reparación)',
      moderado: 'Moderado (reforzamiento)',
      severo: 'Severo (reconstrucción parcial)',
      colapso_total: 'Colapso total'
    }
  };
})();
