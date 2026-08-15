# 04 · Usuarios, roles y sesiones

> Cómo funciona hoy la autenticación. Todo está en
> [js/config.js](../js/config.js) y en el bloque «SESIÓN» de
> [js/app.js:246](../js/app.js#L246).

---

## 1. Cómo se inicia sesión

La pantalla de login es `#vista-login` en [index.html:19](../index.html#L19): un
formulario con dos campos (`#login-usuario`, `#login-clave`) y un botón
«Ingresar».

Al enviar el formulario se ejecuta `alIniciarSesion()`
([js/app.js:255](../js/app.js#L255)):

```js
var usuario = CFG.autenticar(dom.loginUsuario.value, dom.loginClave.value);
if (!usuario) { …mostrar error…; return; }
sesion = usuario;
window.Almacen.guardarSesion(sesion);
entrarAlSistema(false);
```

Si las credenciales fallan se muestra «Usuario o contraseña incorrectos.
Verifique e intente de nuevo.», se limpia el campo de contraseña y se le devuelve
el foco. No hay bloqueo por intentos fallidos, ni captcha, ni límite de tiempo.

---

## 2. Dónde están definidos los usuarios

En el array `USUARIOS` de [js/config.js:63](../js/config.js#L63), **en el propio
código fuente y con la contraseña en texto plano**. El archivo lo advierte en su
encabezado: la aplicación no debe publicarse en internet tal como está.

| `usuario` | `alias` | `nombre` | `rol` | `secretaria` | `password` |
|---|---|---|---|---|---|
| `eduard` | `edward` | Eduard | `admin` | `null` | `123` |
| `eduard 1` | `eduard1`, `edward 1`, `edward1` | Eduard 1 | `coordinador` | `vivienda` | `123` |
| `eduard 2` | `eduard2`, `edward 2`, `edward2` | Eduard 2 | `coordinador` | `gestion_riesgo` | `123` |
| `gabriela` | — | Gabriela | `diligenciador` | `null` | `123` |
| `laura` | — | Laura | `diligenciador` | `null` | `123` |

Los `alias` permiten escribir el usuario de varias formas.

---

## 3. Cómo se validan las credenciales

Función `autenticar(usuario, password)`, [js/config.js:121](../js/config.js#L121).
Es el **punto único de autenticación**; el resto de la aplicación no conoce
contraseñas.

1. Normaliza lo que escribió el usuario con `normalizar()`: recorta, pasa a
   minúsculas, quita tildes (`normalize('NFD')` + regex de diacríticos) y quita
   **todos los espacios**. Así `Eduard 1`, `eduard1` y `EDUARD 1` son
   equivalentes.
2. Recorre `USUARIOS` comparando el valor normalizado contra `usuario` y contra
   cada `alias`.
3. Compara la contraseña con `String(password) !== String(encontrado.password)`
   — comparación exacta, **sin normalizar y sensible a mayúsculas**.
4. Si todo cuadra devuelve el objeto de sesión **sin la contraseña**:

```js
{ usuario: 'laura', nombre: 'Laura', rol: 'diligenciador', secretaria: null }
```

Si falla devuelve `null`.

El comentario del archivo señala que para migrar a autenticación real basta con
reemplazar el cuerpo de esta función.

---

## 4. Roles

Definidos en `ROLES`, [js/config.js:36](../js/config.js#L36):

| Rol | `etiqueta` | `puedeDiligenciar` | `puedeConsultar` | `alcance` |
|---|---|---|---|---|
| `diligenciador` | Diligenciador | `true` | `false` | `propio` |
| `coordinador` | Coordinador | `false` | `true` | `secretaria` |
| `admin` | Coordinación general | `false` | `true` | `todas` |

### Qué hace realmente cada propiedad hoy

| Propiedad | Uso actual en el código |
|---|---|
| `puedeConsultar` | **Sí se usa.** Decide a qué pantalla se entra tras el login y tras «Inicio»: `true` → panel de coordinación; `false` → selección de Secretaría o menú de formularios ([js/app.js:278](../js/app.js#L278) y [js/app.js:307](../js/app.js#L307)). También decide qué se refresca tras restaurar un respaldo. |
| `alcance` | **Sí se usa.** `secretariaDelAlcance()` ([js/app.js:1235](../js/app.js#L1235)): si es `'todas'`, la Secretaría sale del filtro de pantalla (y puede ser «Todas»); si no, se fuerza `sesion.secretaria`. Es el control de acceso a los datos del panel. También decide si se muestran el filtro de Secretaría y la tabla «Avance por Secretaría». |
| `puedeDiligenciar` | **Declarada pero no leída** por ningún archivo. En la práctica, que un coordinador no diligencie es consecuencia de que `puedeConsultar` lo lleva siempre al panel, no de una comprobación explícita. |
| `etiqueta` | Se muestra en la píldora de la barra superior: «Diligenciador: Laura». |
| `descripcion` | Declarada; no se usa en la interfaz. |

### Qué ve cada rol

| | Diligenciador | Coordinador | Coordinación general (admin) |
|---|---|---|---|
| Pantalla al entrar | Selección de Secretaría → Menú | Panel | Panel |
| Diligenciar encuestas | sí | no (nunca llega al menú) | no |
| Panel de seguimiento | no | sí, solo su Secretaría | sí, todas |
| Filtro de Secretaría | — | oculto y fijado a la suya | visible, con opción «Todas» |
| Tabla «Avance por Secretaría» | — | oculta | visible |
| Descarga de CSV | no | sí, acotada a su Secretaría | sí, todas |
| Descargar / Restaurar respaldo | **sí** (botones de la barra superior) | sí | sí |

Nota sobre el alcance del respaldo: los botones «Descargar respaldo» y
«Restaurar respaldo» están en la barra superior y son visibles para **todos** los
roles; el respaldo vuelca todas las encuestas del equipo sin filtrar por
Secretaría (ver [03_data.md](03_data.md), sección 6).

---

## 5. Las Secretarías

Definidas en `SECRETARIAS`, [js/config.js:17](../js/config.js#L17):

| `id` | `nombre` | `corto` | `descripcion` |
|---|---|---|---|
| `gestion_riesgo` | Secretaría de Gestión del Riesgo | Gestión del Riesgo | Evaluación de daños y análisis de necesidades de la población afectada. |
| `vivienda` | Secretaría de Vivienda | Vivienda | Inspección técnica de viviendas afectadas y banco de materiales. |

Helpers: `APP_CONFIG.secretaria(id)` devuelve el objeto completo y
`APP_CONFIG.nombreSecretaria(id)` el nombre legible (o el `id` si no existe).

### Cómo se asigna

- **Diligenciador**: `secretaria: null` en su cuenta. Al entrar, como
  `sesion.secretaria` es nulo, se muestra la pantalla «Paso 1 de 2 · ¿A qué
  Secretaría pertenece la jornada de hoy?» (`#vista-secretaria`). Al escoger, se
  escribe en `sesion.secretaria`, se persiste la sesión y se pasa al menú
  (`alElegirSecretaria()`, [js/app.js:366](../js/app.js#L366)). Puede cambiarla
  después con «Inicio» → «Cambiar de Secretaría».
- **Coordinador**: la trae fija de `config.js` y nunca ve esa pantalla.
- **Admin**: `secretaria: null`, pero como `puedeConsultar` es `true` va directo
  al panel; su Secretaría de trabajo se elige en el filtro.

La Secretaría vigente se copia a cada encuesta creada (campo `secretaria` del
registro) y se muestra en la píldora `#pill-secretaria` de la barra superior.

---

## 6. Cómo se conserva la sesión

| Aspecto | Comportamiento |
|---|---|
| **Dónde** | `localStorage['damage_cali_sesion_v1']`, escrito por `Almacen.guardarSesion()`. |
| **Qué se guarda** | `{usuario, nombre, rol, secretaria}`. La contraseña **no** se guarda. |
| **Cuándo se escribe** | Al iniciar sesión y cada vez que el diligenciador cambia de Secretaría. |
| **Restauración** | Al cargar la página, `iniciar()` lee la sesión; si existe, entra directamente sin pedir contraseña ([js/app.js:46](../js/app.js#L46)). El comentario del código lo declara intencional: «Se restaura la sesión sin volver a pedir contraseña dentro del mismo equipo». |
| **Caducidad** | No hay. La sesión dura hasta que se pulse «Salir» o se borre el almacenamiento del navegador. |
| **Cierre** | `cerrarSesion()` ([js/app.js:291](../js/app.js#L291)): guarda la encuesta abierta, pide confirmación, llama a `Almacen.borrarSesion()` (que borra también el borrador activo), limpia las variables `sesion`, `registro` y `formActivo`, y vuelve al login. |

---

## 7. Qué información del usuario queda disponible durante el diligenciamiento

### En memoria

La variable `sesion` de `app.js` está disponible en todo momento:
`sesion.usuario`, `sesion.nombre`, `sesion.rol`, `sesion.secretaria`.

### En pantalla

- Píldora `#pill-usuario`: «Diligenciador: Laura» (etiqueta del rol + nombre).
- Píldora `#pill-secretaria`: nombre de la Secretaría vigente; oculta si no hay.

### En cada encuesta

Al crear un registro se copian cuatro datos de la sesión
([js/app.js:479](../js/app.js#L479)):

```js
window.Almacen.crear({
  tipo_formulario: tipo,
  id_hogar: origen ? origen.id_hogar : null,
  secretaria:      sesion.secretaria,
  usuario:         sesion.usuario,
  usuario_nombre:  sesion.nombre,
  rol:             sesion.rol
});
```

Esos cuatro campos (`secretaria`, `usuario`, `usuario_nombre`, `rol`) viajan
después a **todos** los archivos CSV dentro del bloque de metadatos
(`COLUMNAS_META`, [js/export.js:182](../js/export.js#L182)), junto con
`secretaria_nombre`, que se resuelve en el momento de exportar.

**El nombre del usuario de la sesión no se vuelca automáticamente en ninguna
pregunta del formulario.** Los campos que piden nombres de personas
(`viv_prof_nombre`, `edan_elaborado_por`, `viv_firma_profesional_nombre`…) se
digitan a mano y no vienen prellenados con el usuario en sesión.

---

## 8. Estado actual de la seguridad — como está declarado en el proyecto

Esto no es un análisis: es lo que el propio repositorio deja escrito.

- `js/config.js` (encabezado): *«La autenticación de esta versión es local y las
  contraseñas están en texto plano dentro de este archivo, por lo que la
  aplicación NO debe publicarse en internet tal como está.»*
- `.gitlab-ci.yml`: la publicación en GitLab Pages es **manual a propósito**
  (`when: manual`), «porque mientras las contraseñas sigan siendo "123",
  publicar el sitio lo deja al alcance de cualquiera que tenga la dirección».
  Antes de publicar por primera vez pide cambiar las contraseñas y revisar si el
  sitio queda público o restringido. `README.md` e `input/` no se publican.
- `README.md` raíz, sección 2: repite la advertencia y señala que migrar a
  autenticación real solo requiere reemplazar el cuerpo de
  `APP_CONFIG.autenticar()`.
