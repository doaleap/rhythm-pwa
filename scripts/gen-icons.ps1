Add-Type -AssemblyName System.Drawing

function Save-Png {
  param([int]$Size, [string]$Path)

  $bmp = New-Object Drawing.Bitmap $Size, $Size
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([Drawing.Color]::FromArgb(15, 10, 26))

  $penWidth = [Math]::Max(2, [int]($Size / 32))
  $pen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(139, 92, 246)), $penWidth

  $cx = $Size / 2.0
  $cy = $Size / 2.0
  $r = $Size * 0.28
  $g.DrawEllipse($pen, [float]($cx - $r), [float]($cy - $r), [float](2 * $r), [float](2 * $r))

  $brush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(34, 211, 238))
  $sr = $Size * 0.09
  $g.FillEllipse($brush, [float]($cx - $sr), [float]($cy - $sr), [float](2 * $sr), [float](2 * $sr))

  $bmp.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $pen.Dispose()
  $brush.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
Save-Png -Size 192 -Path (Join-Path $root "public\pwa-192.png")
Save-Png -Size 512 -Path (Join-Path $root "public\pwa-512.png")
Write-Host "Wrote PNG icons."
