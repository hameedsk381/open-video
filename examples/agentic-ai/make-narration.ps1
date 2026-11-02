# Generates the voiceover in assets/ from narration.json with the Windows text-to-speech voices (offline, built in):
#   <file>.m4a        the clip, loudness-normalised to -16 LUFS with peaks under -1.5 dB
#   <file>.words.json  the time each word starts and ends, from the speech engine, for captions layers
# Run from this folder:  powershell -ExecutionPolicy Bypass -File make-narration.ps1   (needs ffmpeg on PATH)
Add-Type -AssemblyName System.Speech
$script = Get-Content -Raw -Path (Join-Path $PSScriptRoot 'narration.json') | ConvertFrom-Json
$assets = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# The engine raises SpeakProgress on its own thread, so the events are queued and read after each line rather than handled live.
Register-ObjectEvent -InputObject $synth -EventName SpeakProgress -SourceIdentifier 'ove-word' | Out-Null
try {
  $synth.SelectVoice($script.voice)
  $synth.Rate = $script.rate
  foreach ($line in $script.lines) {
    $wav = Join-Path $assets ($line.file + '.wav')
    # 16 kHz on purpose: the engine reports word positions as if the audio were 16 kHz, so with its default 22.05 kHz output every
    # time would be 1.378x too late.
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToWaveFile($wav, $format)
    $synth.Speak($line.text)
    $synth.SetOutputToNull()
    $events = @(Get-Event -SourceIdentifier 'ove-word' -ErrorAction SilentlyContinue | Sort-Object { $_.SourceEventArgs.CharacterPosition })
    Get-Event -SourceIdentifier 'ove-word' -ErrorAction SilentlyContinue | Remove-Event
    # Each word runs from its own start to the next word's start; its text is taken from the script up to the next word, so it keeps
    # its punctuation (which ends caption lines), with `display` replacements such as "A.I." -> "AI" applied.
    $words = @()
    for ($i = 0; $i -lt $events.Count; $i++) {
      $e = $events[$i].SourceEventArgs
      $from = $e.CharacterPosition; $to = if ($i + 1 -lt $events.Count) { $events[$i + 1].SourceEventArgs.CharacterPosition } else { $line.text.Length }
      $text = $line.text.Substring($from, $to - $from).Trim()
      $original = $text
      foreach ($pair in $script.display.PSObject.Properties) { $text = $text.Replace($pair.Name, $pair.Value) }
      # A replacement such as "A.I." -> "AI" must not swallow the full stop of a sentence that ends on it ("Agentic A.I. Software...").
      $nextText = if ($i + 1 -lt $events.Count) { $line.text.Substring($events[$i + 1].SourceEventArgs.CharacterPosition).TrimStart() } else { '' }
      if ($original.EndsWith('.') -and -not $text.EndsWith('.') -and ($nextText -eq '' -or [char]::IsUpper($nextText[0]))) { $text += '.' }
      $start = $e.AudioPosition.TotalSeconds
      $end = if ($i + 1 -lt $events.Count) { $events[$i + 1].SourceEventArgs.AudioPosition.TotalSeconds } else { $start + 0.5 }
      if ($text) { $words += [ordered]@{ text = $text; start = [math]::Round($start, 3); end = [math]::Round($end, 3) } }
    }
    ConvertTo-Json @{ words = $words } -Depth 4 | Set-Content -Encoding utf8 -Path (Join-Path $assets ($line.file + '.words.json'))
    & ffmpeg -v error -y -i $wav -af 'loudnorm=I=-16:TP=-1.5:LRA=7' -ar 48000 -c:a aac -b:a 128k (Join-Path $assets ($line.file + '.m4a'))
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($line.file)" }
    Remove-Item $wav
    Write-Output "$($line.file): $($words.Count) words"
  }
} finally { Unregister-Event -SourceIdentifier 'ove-word' -ErrorAction SilentlyContinue; $synth.Dispose() }
