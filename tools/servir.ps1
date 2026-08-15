# =============================================================================
#  servir.ps1 - Servidor estatico para trabajar con el portal en el navegador.
#
#  POR QUE EXISTE
#  El portal es un sitio estatico, pero NO se puede abrir con doble clic sobre
#  index.html (file://): el modulo EDAN guarda las encuestas en el
#  almacenamiento local del navegador y varios navegadores lo bloquean en ese
#  modo. Hay que servirlo por HTTP.
#
#  POR QUE EN POWERSHELL Y NO CON PYTHON
#  PowerShell viene de fabrica en todo Windows. Asi cualquier persona del
#  equipo levanta el portal sin instalar nada y sin configurar rutas propias
#  de su equipo.
#
#  COMO SE USA
#    Doble clic en servir.bat (en la raiz del proyecto)
#  o bien, desde una terminal:
#    powershell -NoProfile -ExecutionPolicy Bypass -File tools\servir.ps1
#
#  Para detenerlo: Ctrl+C, o simplemente cerrar la ventana.
#
#  NOTA: los mensajes de este archivo van sin tildes a proposito, para que se
#  lean bien en la consola de Windows sin depender de la pagina de codigos.
# =============================================================================
param(
  [int]$Puerto = 8801,
  [switch]$NoAbrirNavegador
)

$ErrorActionPreference = "Stop"

# La raiz del sitio es la carpeta que contiene a tools\
$Raiz = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Raiz "index.html"))) {
  Write-Host ""
  Write-Host "  No se encontro index.html en: $Raiz" -ForegroundColor Red
  Write-Host "  Este script debe vivir en la carpeta tools\ del proyecto."
  Write-Host ""
  Read-Host "Presione Enter para cerrar"
  exit 1
}

# --- Tipos de contenido -----------------------------------------------------
$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8"
  ".css"="text/css; charset=utf-8";   ".js"="application/javascript; charset=utf-8"
  ".json"="application/json; charset=utf-8"; ".md"="text/plain; charset=utf-8"
  ".csv"="text/csv; charset=utf-8";   ".txt"="text/plain; charset=utf-8"
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"
  ".svg"="image/svg+xml"; ".webp"="image/webp"; ".ico"="image/x-icon"
  ".woff"="font/woff"; ".woff2"="font/woff2"; ".ttf"="font/ttf"
  ".pdf"="application/pdf"
}

# --- Puerto libre -----------------------------------------------------------
function Puerto-Ocupado([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $ok = $c.BeginConnect("127.0.0.1", $p, $null, $null).AsyncWaitHandle.WaitOne(220)
    if ($ok -and $c.Connected) { $c.Close(); return $true }
    $c.Close(); return $false
  } catch { return $false }
}

$puertoInicial = $Puerto
while ((Puerto-Ocupado $Puerto) -and ($Puerto -lt $puertoInicial + 15)) {
  Write-Host "  El puerto $Puerto ya esta en uso, probando el siguiente..." -ForegroundColor DarkYellow
  $Puerto++
}

# --- Alcance: solo este equipo, o tambien la red local ----------------------
# Escuchar en toda la red (http://+:puerto/) requiere permisos de
# administrador en Windows. Sin ellos se escucha solo en localhost, que es
# suficiente para desarrollar.
$esAdmin = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$prefijo = if ($esAdmin) { "http://+:$Puerto/" } else { "http://localhost:$Puerto/" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefijo)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  No fue posible iniciar el servidor en el puerto $Puerto." -ForegroundColor Red
  Write-Host "  Detalle: $($_.Exception.Message)"
  Write-Host ""
  Read-Host "Presione Enter para cerrar"
  exit 1
}

# --- Mensaje de bienvenida --------------------------------------------------
$url = "http://localhost:$Puerto/"
Write-Host ""
Write-Host "  Portal de atencion y gestion - Emergencia por sismo" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------------"
Write-Host "  Sirviendo:  $Raiz"
Write-Host "  Abrir en:   $url" -ForegroundColor Green

if ($esAdmin) {
  try {
    $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } |
           Select-Object -First 1).IPv4Address.IPAddress
    if ($ip) {
      Write-Host "  Red local:  http://${ip}:$Puerto/"
      Write-Host ""
      Write-Host "  Aviso: desde otro equipo por http:// el boton 'Usar mi ubicacion" -ForegroundColor DarkYellow
      Write-Host "  actual' del EDAN NO funcionara. Los navegadores solo entregan la" -ForegroundColor DarkYellow
      Write-Host "  ubicacion en paginas https:// o en localhost." -ForegroundColor DarkYellow
    }
  } catch { }
} else {
  Write-Host "  Alcance:    solo este equipo"
  Write-Host "              (para abrirlo desde otro equipo de la red, ejecute"
  Write-Host "               este script como administrador)"
}

Write-Host ""
Write-Host "  Detener: Ctrl+C o cierre esta ventana."
Write-Host ""

if (-not $NoAbrirNavegador) { Start-Process $url | Out-Null }

# --- Bucle de atencion ------------------------------------------------------
# Se usa GetContextAsync con espera corta en lugar de GetContext(), que es
# bloqueante y dejaria Ctrl+C sin efecto hasta la siguiente peticion.
try {
  while ($listener.IsListening) {
    $tarea = $listener.GetContextAsync()
    while (-not $tarea.AsyncWaitHandle.WaitOne(250)) { }
    $ctx = $tarea.GetAwaiter().GetResult()

    $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($ruta -eq "/") { $ruta = "/index.html" }

    $relativa = $ruta.TrimStart("/") -replace "/", "\"
    $archivo = Join-Path $Raiz $relativa

    # No servir nada fuera de la carpeta del proyecto.
    $completa = [System.IO.Path]::GetFullPath($archivo)
    $raizCompleta = [System.IO.Path]::GetFullPath($Raiz)
    if (-not $completa.StartsWith($raizCompleta, [StringComparison]::OrdinalIgnoreCase)) {
      $ctx.Response.StatusCode = 403
      $ctx.Response.Close()
      continue
    }

    # Una carpeta sirve su index.html
    if ((Test-Path $completa) -and (Get-Item $completa).PSIsContainer) {
      $completa = Join-Path $completa "index.html"
    }

    if (Test-Path $completa -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($completa).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      # Sin cache: al editar un archivo, recargar muestra el cambio.
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $bytes = [System.IO.File]::ReadAllBytes($completa)
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("  200  " + $ruta) -ForegroundColor DarkGray
    } else {
      $ctx.Response.StatusCode = 404
      $ctx.Response.ContentType = "text/html; charset=utf-8"
      $html = "<h1>404</h1><p>No se encontro: $ruta</p><p><a href='/'>Ir al portal</a></p>"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("  404  " + $ruta) -ForegroundColor DarkYellow
    }
    $ctx.Response.Close()
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
  Write-Host ""
  Write-Host "  Servidor detenido." -ForegroundColor Cyan
}
