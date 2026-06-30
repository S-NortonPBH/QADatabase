# DEV-ONLY mock of the Apps Script backend, for trying SHARED mode locally.
# Serves the static app AND a fake /exec endpoint (same origin, so no CORS).
# Data is in-memory and resets when you stop the server. NOT for production.
#
# Use: set config.js endpoint to "http://localhost:8799/exec", then run this.
param([int]$Port = 8799)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$script:catJson = '[]'     # shared category tree, as a JSON string
$script:recordCount = 0    # total rows "saved"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Could not start on port $Port. $_"; exit 1 }
Write-Host "QA Database (mock backend) at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
}

function Write-Json($ctx, $obj) {
  $json = ($obj | ConvertTo-Json -Depth 30 -Compress)
  $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $reqPath = $ctx.Request.Url.AbsolutePath

    if ($reqPath -eq '/exec') {
      if ($ctx.Request.HttpMethod -eq 'GET') {
        $action = ($ctx.Request.QueryString['action'])
        if ($action -eq 'categories') {
          # emit raw stored JSON for the tree
          $out = '{"ok":true,"tree":' + $script:catJson + '}'
          $buf = [System.Text.Encoding]::UTF8.GetBytes($out)
          $ctx.Response.ContentType = 'application/json; charset=utf-8'
          $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
          $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
        } else {
          Write-Json $ctx @{ ok = $true; ts = (Get-Date).ToString('o') }
        }
      } else {
        # POST
        $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd(); $reader.Close()
        $data = $null
        try { $data = $body | ConvertFrom-Json } catch {}
        if ($null -eq $data) {
          Write-Json $ctx @{ ok = $false; error = 'bad json' }
        } elseif ($data.action -eq 'save') {
          $n = 0; if ($data.selections) { $n = @($data.selections).Count }
          $script:recordCount += $n
          Write-Host ("  save: {0} row(s) | tag={1} email={2} time={3} | total={4}" -f $n, $data.serviceTag, $data.editorEmail, $data.editTime, $script:recordCount)
          Write-Json $ctx @{ ok = $true; saved = $n; total = $script:recordCount }
        } elseif ($data.action -eq 'setCategories') {
          # Extract the raw "tree" JSON straight from the body to preserve arrays
          # exactly (PowerShell's ConvertTo-Json unwraps single-element arrays).
          $s = $body.IndexOf('"tree":'); $e = $body.IndexOf(',"adminKey":')
          if ($s -ge 0 -and $e -gt $s) { $script:catJson = $body.Substring($s + 7, $e - ($s + 7)) }
          else { $script:catJson = '[]' }
          Write-Host "  setCategories: stored tree"
          Write-Json $ctx @{ ok = $true }
        } else {
          Write-Json $ctx @{ ok = $false; error = ('unknown action: ' + $data.action) }
        }
      }
      $ctx.Response.Close()
      continue
    }

    # ---- static files ----
    $rel = [System.Uri]::UnescapeDataString($reqPath).TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    }
    $ctx.Response.Close()
  } catch { }
}
