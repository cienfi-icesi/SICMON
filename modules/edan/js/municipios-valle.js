/* ============================================================================
   municipios-valle.js — Los 42 municipios del Valle del Cauca.

   DE DONDE SALEN ESTOS DATOS
   Se generaron con `generar_municipios.py` a partir del Marco Geoestadistico
   Nacional 2021 del DANE (capas MGN_MPIO_POLITICO y MGN_CLASE), que es la
   fuente oficial de los limites municipales del pais. No son coordenadas
   escritas a mano ni tomadas de internet.

   QUE SIGNIFICA CADA COSA
     codigo    Codigo DANE del municipio (dos digitos de departamento + tres
               del municipio). Es el que usan todas las entidades del Estado,
               asi que es la llave para cruzar estos registros con cualquier
               otra base oficial.
     nombre    Nombre oficial, como debe quedar escrito en el formulario.
     buscar    Como se le nombra al buscador de direcciones. Casi siempre es
               igual al nombre; Cali es la excepcion (el buscador responde a
               «Cali», no a «Santiago de Cali»).
     centro    [latitud, longitud] del centro de la CABECERA urbana. El mapa se
               abre ahi y no en el centro del municipio, porque las direcciones
               con nomenclatura viven en el casco urbano: en municipios de
               ladera el centro del municipio cae en el monte.
     caja      Rectangulo que envuelve TODO el municipio (incluida el area
               rural). La busqueda de direcciones se acota a el y se descarta
               cualquier resultado que caiga por fuera.
     cabecera  Rectangulo del casco urbano. Sirve para decidir cuanto acercar
               el mapa al abrirlo.

   Coordenadas en grados, MAGNA-SIRGAS (equivalente a WGS84 para un mapa web).
   ========================================================================== */
(function () {
  'use strict';

  window.MUNICIPIOS_VALLE = [
    { codigo: '76020', nombre: 'Alcalá', buscar: 'Alcalá', centro: [4.6748, -75.780326], caja: { oeste: -75.8572, sur: 4.6507, este: -75.7072, norte: 4.7196 }, cabecera: { oeste: -75.791, sur: 4.6705, este: -75.7696, norte: 4.6791 } },
    { codigo: '76036', nombre: 'Andalucía', buscar: 'Andalucía', centro: [4.171822, -76.166799], caja: { oeste: -76.2508, sur: 4.066, este: -76.0705, norte: 4.2174 }, cabecera: { oeste: -76.1779, sur: 4.158, este: -76.1557, norte: 4.1857 } },
    { codigo: '76041', nombre: 'Ansermanuevo', buscar: 'Ansermanuevo', centro: [4.795295, -75.991588], caja: { oeste: -76.1472, sur: 4.692, este: -75.9004, norte: 4.888 }, cabecera: { oeste: -76.0008, sur: 4.7881, este: -75.9824, norte: 4.8025 } },
    { codigo: '76054', nombre: 'Argelia', buscar: 'Argelia', centro: [4.727471, -76.118671], caja: { oeste: -76.1949, sur: 4.6512, este: -76.0882, norte: 4.785 }, cabecera: { oeste: -76.1253, sur: 4.7239, este: -76.1121, norte: 4.731 } },
    { codigo: '76100', nombre: 'Bolívar', buscar: 'Bolívar', centro: [4.336223, -76.186083], caja: { oeste: -76.562, sur: 4.2295, este: -76.1376, norte: 4.4978 }, cabecera: { oeste: -76.1948, sur: 4.3293, este: -76.1773, norte: 4.3432 } },
    { codigo: '76109', nombre: 'Buenaventura', buscar: 'Buenaventura', centro: [3.87343, -77.021423], caja: { oeste: -77.5498, sur: 3.1081, este: -76.6877, norte: 4.2347 }, cabecera: { oeste: -77.0814, sur: 3.8498, este: -76.9614, norte: 3.8971 } },
    { codigo: '76113', nombre: 'Bugalagrande', buscar: 'Bugalagrande', centro: [4.208646, -76.155324], caja: { oeste: -76.2375, sur: 4.0837, este: -75.9544, norte: 4.3174 }, cabecera: { oeste: -76.1649, sur: 4.1948, este: -76.1458, norte: 4.2225 } },
    { codigo: '76122', nombre: 'Caicedonia', buscar: 'Caicedonia', centro: [4.332069, -75.837073], caja: { oeste: -75.8943, sur: 4.199, este: -75.7873, norte: 4.4153 }, cabecera: { oeste: -75.8552, sur: 4.3195, este: -75.8189, norte: 4.3446 } },
    { codigo: '76001', nombre: 'Santiago de Cali', buscar: 'Cali', centro: [3.401643, -76.52663], caja: { oeste: -76.7071, sur: 3.2734, este: -76.4588, norte: 3.5479 }, cabecera: { oeste: -76.5932, sur: 3.2972, este: -76.4601, norte: 3.5061 } },
    { codigo: '76126', nombre: 'Calima', buscar: 'Calima', centro: [3.934588, -76.485809], caja: { oeste: -76.8884, sur: 3.8422, este: -76.3968, norte: 4.0678 }, cabecera: { oeste: -76.4965, sur: 3.9239, este: -76.4751, norte: 3.9453 } },
    { codigo: '76130', nombre: 'Candelaria', buscar: 'Candelaria', centro: [3.407774, -76.346102], caja: { oeste: -76.4759, sur: 3.2815, este: -76.2811, norte: 3.4728 }, cabecera: { oeste: -76.3518, sur: 3.3994, este: -76.3404, norte: 3.4162 } },
    { codigo: '76147', nombre: 'Cartago', buscar: 'Cartago', centro: [4.732107, -75.926716], caja: { oeste: -76.0166, sur: 4.6128, este: -75.8222, norte: 4.8076 }, cabecera: { oeste: -75.9578, sur: 4.6909, este: -75.8956, norte: 4.7734 } },
    { codigo: '76233', nombre: 'Dagua', buscar: 'Dagua', centro: [3.65795, -76.69023], caja: { oeste: -76.8905, sur: 3.4237, este: -76.5826, norte: 3.8784 }, cabecera: { oeste: -76.6989, sur: 3.6486, este: -76.6815, norte: 3.6673 } },
    { codigo: '76243', nombre: 'El Águila', buscar: 'El Águila', centro: [4.907653, -76.041317], caja: { oeste: -76.1378, sur: 4.8289, este: -75.9857, norte: 5.0474 }, cabecera: { oeste: -76.0462, sur: 4.8986, este: -76.0365, norte: 4.9167 } },
    { codigo: '76246', nombre: 'El Cairo', buscar: 'El Cairo', centro: [4.761132, -76.221386], caja: { oeste: -76.3123, sur: 4.6741, este: -76.1277, norte: 4.8412 }, cabecera: { oeste: -76.2262, sur: 4.7547, este: -76.2166, norte: 4.7675 } },
    { codigo: '76248', nombre: 'El Cerrito', buscar: 'El Cerrito', centro: [3.686079, -76.31108], caja: { oeste: -76.426, sur: 3.6029, este: -75.9556, norte: 3.7704 }, cabecera: { oeste: -76.3285, sur: 3.6714, este: -76.2936, norte: 3.7008 } },
    { codigo: '76250', nombre: 'El Dovio', buscar: 'El Dovio', centro: [4.50967, -76.237339], caja: { oeste: -76.4038, sur: 4.4687, este: -76.1663, norte: 4.6542 }, cabecera: { oeste: -76.2432, sur: 4.5004, este: -76.2314, norte: 4.519 } },
    { codigo: '76275', nombre: 'Florida', buscar: 'Florida', centro: [3.326851, -76.235256], caja: { oeste: -76.348, sur: 3.2105, este: -76.0378, norte: 3.3896 }, cabecera: { oeste: -76.2504, sur: 3.3145, este: -76.2201, norte: 3.3392 } },
    { codigo: '76306', nombre: 'Ginebra', buscar: 'Ginebra', centro: [3.723962, -76.268274], caja: { oeste: -76.3237, sur: 3.6625, este: -76.0809, norte: 3.8323 }, cabecera: { oeste: -76.2758, sur: 3.7167, este: -76.2608, norte: 3.7312 } },
    { codigo: '76318', nombre: 'Guacarí', buscar: 'Guacarí', centro: [3.763912, -76.331093], caja: { oeste: -76.4009, sur: 3.7074, este: -76.178, norte: 3.8515 }, cabecera: { oeste: -76.3397, sur: 3.7555, este: -76.3225, norte: 3.7723 } },
    { codigo: '76111', nombre: 'Guadalajara de Buga', buscar: 'Guadalajara de Buga', centro: [3.901176, -76.300722], caja: { oeste: -76.3831, sur: 3.7135, este: -75.8498, norte: 3.9985 }, cabecera: { oeste: -76.3187, sur: 3.8714, este: -76.2828, norte: 3.931 } },
    { codigo: '76364', nombre: 'Jamundí', buscar: 'Jamundí', centro: [3.254652, -76.543331], caja: { oeste: -76.7835, sur: 3.0912, este: -76.4598, norte: 3.3566 }, cabecera: { oeste: -76.5889, sur: 3.2222, este: -76.4977, norte: 3.2871 } },
    { codigo: '76377', nombre: 'La Cumbre', buscar: 'La Cumbre', centro: [3.64907, -76.567577], caja: { oeste: -76.6522, sur: 3.547, este: -76.5062, norte: 3.863 }, cabecera: { oeste: -76.5749, sur: 3.6437, este: -76.5602, norte: 3.6545 } },
    { codigo: '76400', nombre: 'La Unión', buscar: 'La Unión', centro: [4.534979, -76.098213], caja: { oeste: -76.1853, sur: 4.4777, este: -76.0308, norte: 4.5965 }, cabecera: { oeste: -76.1168, sur: 4.5232, este: -76.0796, norte: 4.5468 } },
    { codigo: '76403', nombre: 'La Victoria', buscar: 'La Victoria', centro: [4.523103, -76.03527], caja: { oeste: -76.0881, sur: 4.4012, este: -75.8655, norte: 4.5691 }, cabecera: { oeste: -76.0435, sur: 4.5103, este: -76.0271, norte: 4.5359 } },
    { codigo: '76497', nombre: 'Obando', buscar: 'Obando', centro: [4.575987, -75.97433], caja: { oeste: -76.0397, sur: 4.5282, este: -75.8598, norte: 4.6675 }, cabecera: { oeste: -75.9827, sur: 4.567, este: -75.9659, norte: 4.585 } },
    { codigo: '76520', nombre: 'Palmira', buscar: 'Palmira', centro: [3.530881, -76.292643], caja: { oeste: -76.4917, sur: 3.4503, este: -75.95, norte: 3.718 }, cabecera: { oeste: -76.3222, sur: 3.5001, este: -76.2631, norte: 3.5617 } },
    { codigo: '76563', nombre: 'Pradera', buscar: 'Pradera', centro: [3.420888, -76.242904], caja: { oeste: -76.3329, sur: 3.3524, este: -76.0291, norte: 3.4908 }, cabecera: { oeste: -76.2544, sur: 3.4106, este: -76.2314, norte: 3.4312 } },
    { codigo: '76606', nombre: 'Restrepo', buscar: 'Restrepo', centro: [3.820273, -76.523196], caja: { oeste: -76.6128, sur: 3.743, este: -76.4675, norte: 3.8774 }, cabecera: { oeste: -76.5298, sur: 3.8135, este: -76.5166, norte: 3.827 } },
    { codigo: '76616', nombre: 'Riofrío', buscar: 'Riofrío', centro: [4.157635, -76.28722], caja: { oeste: -76.4989, sur: 4.0045, este: -76.2447, norte: 4.2042 }, cabecera: { oeste: -76.2928, sur: 4.1519, este: -76.2817, norte: 4.1634 } },
    { codigo: '76622', nombre: 'Roldanillo', buscar: 'Roldanillo', centro: [4.41509, -76.151495], caja: { oeste: -76.281, sur: 4.3679, este: -76.0656, norte: 4.5157 }, cabecera: { oeste: -76.1645, sur: 4.4007, este: -76.1385, norte: 4.4295 } },
    { codigo: '76670', nombre: 'San Pedro', buscar: 'San Pedro', centro: [3.996066, -76.229054], caja: { oeste: -76.3127, sur: 3.904, este: -76.1003, norte: 4.0492 }, cabecera: { oeste: -76.236, sur: 3.9876, este: -76.2221, norte: 4.0046 } },
    { codigo: '76736', nombre: 'Sevilla', buscar: 'Sevilla', centro: [4.275091, -75.930941], caja: { oeste: -76.0379, sur: 3.9045, este: -75.7376, norte: 4.4113 }, cabecera: { oeste: -75.9408, sur: 4.2549, este: -75.9211, norte: 4.2953 } },
    { codigo: '76823', nombre: 'Toro', buscar: 'Toro', centro: [4.611634, -76.077822], caja: { oeste: -76.162, sur: 4.5574, este: -76.0109, norte: 4.7358 }, cabecera: { oeste: -76.0883, sur: 4.6001, este: -76.0673, norte: 4.6231 } },
    { codigo: '76828', nombre: 'Trujillo', buscar: 'Trujillo', centro: [4.211605, -76.318423], caja: { oeste: -76.455, sur: 4.1588, este: -76.2101, norte: 4.3063 }, cabecera: { oeste: -76.3242, sur: 4.2048, este: -76.3126, norte: 4.2184 } },
    { codigo: '76834', nombre: 'Tuluá', buscar: 'Tuluá', centro: [4.08477, -76.198289], caja: { oeste: -76.3139, sur: 3.8892, este: -75.819, norte: 4.1855 }, cabecera: { oeste: -76.2259, sur: 4.0582, este: -76.1707, norte: 4.1113 } },
    { codigo: '76845', nombre: 'Ulloa', buscar: 'Ulloa', centro: [4.703656, -75.737748], caja: { oeste: -75.8567, sur: 4.6785, este: -75.7097, norte: 4.7378 }, cabecera: { oeste: -75.7423, sur: 4.699, este: -75.7332, norte: 4.7083 } },
    { codigo: '76863', nombre: 'Versalles', buscar: 'Versalles', centro: [4.575762, -76.199871], caja: { oeste: -76.3048, sur: 4.5256, este: -76.1227, norte: 4.6986 }, cabecera: { oeste: -76.2041, sur: 4.5689, este: -76.1956, norte: 4.5826 } },
    { codigo: '76869', nombre: 'Vijes', buscar: 'Vijes', centro: [3.698811, -76.442837], caja: { oeste: -76.5369, sur: 3.6807, este: -76.4009, norte: 3.8307 }, cabecera: { oeste: -76.4522, sur: 3.6915, este: -76.4335, norte: 3.7061 } },
    { codigo: '76890', nombre: 'Yotoco', buscar: 'Yotoco', centro: [3.861166, -76.385645], caja: { oeste: -76.4899, sur: 3.7291, este: -76.2959, norte: 4.0673 }, cabecera: { oeste: -76.3942, sur: 3.8526, este: -76.3771, norte: 3.8697 } },
    { codigo: '76892', nombre: 'Yumbo', buscar: 'Yumbo', centro: [3.544615, -76.499792], caja: { oeste: -76.5929, sur: 3.4905, este: -76.426, norte: 3.6992 }, cabecera: { oeste: -76.5314, sur: 3.4905, este: -76.4682, norte: 3.5987 } },
    { codigo: '76895', nombre: 'Zarzal', buscar: 'Zarzal', centro: [4.389554, -76.07034], caja: { oeste: -76.1714, sur: 4.2439, este: -75.8778, norte: 4.467 }, cabecera: { oeste: -76.0814, sur: 4.3712, este: -76.0592, norte: 4.4079 } }
  ];

  /* RESPALDO: municipios cuya regla ESCRITA de numeración (hacia dónde crecen
     las generadoras) está verificada. La búsqueda mide ese sentido en el mapa
     para cada dirección (medirSentido en campo-direccion.js) y eso vale en
     cualquier municipio; esta bandera solo se usa cuando la generadora vecina
     no aparece en el mapa base. Para agregar otro municipio hay que comprobar
     su regla con direcciones reales, no suponerla. */
  var NOMENCLATURA_CALIBRADA = { '76001': true };
  window.MUNICIPIOS_VALLE.forEach(function (m) {
    m.nomenclatura_calibrada = !!NOMENCLATURA_CALIBRADA[m.codigo];
  });

  /** Opciones para un campo tipo 'lista': valor = nombre oficial, con el código DANE al lado. */
  window.opcionesMunicipiosValle = function () {
    return window.MUNICIPIOS_VALLE.map(function (m) {
      return { valor: m.nombre, etiqueta: m.nombre, codigo: m.codigo };
    });
  };

  /** Busca un municipio por nombre (tolera tildes, mayusculas y «Santiago de Cali»). */
  window.buscarMunicipio = function (nombre) {
    if (!nombre) return null;
    var limpia = function (s) {
      return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
    };
    var buscado = limpia(nombre);
    if (buscado === 'cali') buscado = 'santiago de cali';
    for (var i = 0; i < window.MUNICIPIOS_VALLE.length; i++) {
      var m = window.MUNICIPIOS_VALLE[i];
      if (limpia(m.nombre) === buscado || limpia(m.buscar) === buscado || m.codigo === nombre) return m;
    }
    return null;
  };
})();
