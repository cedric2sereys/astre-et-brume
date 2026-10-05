# Calls FreeAstroAPI with a sample person (not real user data) and saves the raw JSON answers
# to scripts\samples\ so the response format can be checked. Uses 2 of the 80 free daily requests.
# Usage (from the astre-et-brume folder):
#   powershell -ExecutionPolicy Bypass -File scripts\test-freeastro.ps1
# The key is typed here and is not displayed or saved.

$secure = Read-Host "Collez votre cle FreeAstroAPI puis Entree" -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$outDir = Join-Path $PSScriptRoot 'samples'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$today = Get-Date -Format 'yyyy-MM-dd'

$calls = @(
  @{
    name = 'natal'
    uri  = 'https://api.freeastroapi.com/api/v1/natal/calculate'
    body = @{
      name = 'Sample'; year = 1990; month = 5; day = 15; time_known = $true; hour = 14; minute = 30
      city = 'Paris'; lat = 48.8566; lng = 2.3522; tz_str = 'Europe/Paris'
      house_system = 'placidus'; zodiac_type = 'tropical'
      interpretation = @{ enable = $true; style = 'improved' }
    }
  },
  @{
    name = 'daily-personal'
    uri  = 'https://api.freeastroapi.com/api/v3/horoscope/daily/personal'
    body = @{
      birth = @{
        year = 1990; month = 5; day = 15; hour = 14; minute = 30
        city = 'Paris'; lat = 48.8566; lng = 2.3522; tz_str = 'Europe/Paris'; time_known = $true
      }
      date = $today; tz_str = 'Europe/Paris'; include_interpretation_blocks = $true
    }
  }
)

foreach ($call in $calls) {
  ""
  "=== $($call.name) ==="
  $json = $call.body | ConvertTo-Json -Depth 6
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $file = Join-Path $outDir "$($call.name).json"
  try {
    $r = Invoke-WebRequest -Uri $call.uri -Method Post -Headers @{ 'x-api-key' = $key } `
      -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing
    [IO.File]::WriteAllBytes($file, $r.RawContentStream.ToArray())
    "RESULTAT : $($r.StatusCode) - reponse enregistree dans scripts\samples\$($call.name).json"
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { "ERREUR RESEAU : $($_.Exception.Message)"; continue }
    $reader = New-Object IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    [IO.File]::WriteAllText($file, $text)
    "RESULTAT : $([int]$resp.StatusCode)"
    "MESSAGE FREEASTRO : $text"
  }
  Start-Sleep -Seconds 2   # free plan: 1 request per second
}
