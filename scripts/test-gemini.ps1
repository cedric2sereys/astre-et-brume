# Tests a Gemini API key directly (without Supabase) with the model the chat function uses.
# Usage (from the astre-et-brume folder):
#   powershell -ExecutionPolicy Bypass -File scripts\test-gemini.ps1
# The key is typed here and is not displayed or saved.

$secure = Read-Host "Collez votre cle Gemini puis Entree" -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

$body = '{"contents":[{"role":"user","parts":[{"text":"Dis bonjour en trois mots."}]}]}'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Same two models as the chat function: Flash first, then Flash-Lite.
foreach ($model in 'gemini-flash-latest', 'gemini-flash-lite-latest') {
  ""
  "=== $model ==="
  $uri = "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent"
  try {
    $r = Invoke-WebRequest -Uri $uri -Method Post -Headers @{ 'x-goog-api-key' = $key } `
      -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
    "RESULTAT : $($r.StatusCode) (la cle fonctionne)"
    "REPONSE : $(($r.Content | ConvertFrom-Json).candidates[0].content.parts[0].text)"
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { "ERREUR RESEAU : $($_.Exception.Message)"; continue }
    "RESULTAT : $([int]$resp.StatusCode)"
    $reader = New-Object IO.StreamReader($resp.GetResponseStream())
    "MESSAGE GEMINI : $($reader.ReadToEnd())"
  }
}
