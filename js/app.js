/* ============================================================
   SICMON · Lógica de la página
   ------------------------------------------------------------
   Única función: conectar los tres botones de acceso con las URL
   definidas en js/config.js. Si una URL está vacía, el botón se
   presenta inactivo. Sin dependencias externas.
   ============================================================ */

(function () {
  "use strict";

  function conectarAccesos() {
    var cfg = window.CONFIG && window.CONFIG.accesos;
    if (!cfg) return;

    document.querySelectorAll("[data-acceso]").forEach(function (boton) {
      var clave = boton.getAttribute("data-acceso");
      var destino = cfg[clave];

      if (destino && destino.url) {
        boton.setAttribute("href", destino.url);
        boton.removeAttribute("aria-disabled");
        boton.removeAttribute("title");
        if (destino.nuevaPestana) {
          boton.setAttribute("target", "_blank");
          boton.setAttribute("rel", "noopener");
        }
        return;
      }

      // Destino todavía no configurado: el botón no navega.
      boton.setAttribute("aria-disabled", "true");
      boton.setAttribute("title", window.CONFIG.textoPendiente || "");
      boton.removeAttribute("href");
      boton.addEventListener("click", function (ev) { ev.preventDefault(); });
    });
  }

  document.addEventListener("DOMContentLoaded", conectarAccesos);
})();
