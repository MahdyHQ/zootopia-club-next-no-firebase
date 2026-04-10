# Firebase App Hosting secrets helper (Firebase CLI only)
# Run from repo root:
# powershell -ExecutionPolicy Bypass -File .\scripts\firebase\set-apphosting-secrets-firebase-only.ps1
#
# Helpful flags:
# -IncludeOptional   Prompt for optional secrets even when .env.local has no value
# -NonInteractive    Do not prompt; fail if required secret values are missing
# -SkipGrantAccess   Set secret values only (skip backend grant-access step)
# -DryRun            Print what would run without calling Firebase CLI
# -OnlySecretName    Configure only the listed secret name(s)
# -SkipEnvTemplateValidation   Skip checking EnvKey alignment against .env.example

[CmdletBinding()]
param(
  [string]$ProjectId = "zootopia2026",
  [string]$BackendId = "zootopia-club-next-backend",
  [string]$EnvFilePath = ".env.local",
  [string]$AppHostingConfigPath = "apps/web/apphosting.yaml",
  [string]$EnvTemplatePath = ".env.example",
  [string[]]$OnlySecretName = @(),
  [switch]$IncludeOptional,
  [switch]$NonInteractive,
  [switch]$SkipGrantAccess,
  [switch]$SkipEnvTemplateValidation,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$FirebaseCliPrefix = @("npx", "-y", "firebase-tools@latest")

# This definition table is the single source of truth for App Hosting secret setup.
# Keep secret names aligned with apps/web/apphosting.yaml and env keys aligned with .env.example.
$SecretDefinitions = @(
  [pscustomobject]@{ SecretName = "supabase-service-role-key"; EnvKey = "SUPABASE_SERVICE_ROLE_KEY"; Required = $true; Feature = "Supabase server auth adapter" },
  [pscustomobject]@{ SecretName = "google-ai-api-key"; EnvKey = "GOOGLE_AI_API_KEY"; Required = $true; Feature = "Gemini and Google AI runtime" },
  [pscustomobject]@{ SecretName = "dashscope-api-key"; EnvKey = "DASHSCOPE_API_KEY"; Required = $false; Feature = "Qwen DashScope runtime" },
  [pscustomobject]@{ SecretName = "smtp-user"; EnvKey = "SMTP_USER"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "smtp-pass"; EnvKey = "SMTP_PASS"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "smtp-email-from"; EnvKey = "EMAIL_FROM"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "contact-form-to"; EnvKey = "CONTACT_FORM_TO"; Required = $false; Feature = "Contact relay" },
  [pscustomobject]@{ SecretName = "firebase-client-email"; EnvKey = "FIREBASE_CLIENT_EMAIL"; Required = $false; Feature = "Firebase Admin fallback identity" },
  [pscustomobject]@{ SecretName = "firebase-private-key"; EnvKey = "FIREBASE_PRIVATE_KEY"; Required = $false; Feature = "Firebase Admin fallback identity" },
  [pscustomobject]@{ SecretName = "zootopia-maintenance-secret"; EnvKey = "ZOOTOPIA_MAINTENANCE_SECRET"; Required = $false; Feature = "Internal maintenance endpoint" }
)

function Test-SecretDefinitionIntegrity {
  param([Parameter(Mandatory = $true)]$Definitions)

  $duplicateSecretNames = @(
    $Definitions |
      Group-Object -Property SecretName |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { $_.Name }
  )

  if ($duplicateSecretNames.Count -gt 0) {
    throw ("Duplicate SecretName values in script table: " + ($duplicateSecretNames -join ", "))
  }

  $duplicateEnvKeys = @(
    $Definitions |
      Group-Object -Property EnvKey |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { $_.Name }
  )

  if ($duplicateEnvKeys.Count -gt 0) {
    throw ("Duplicate EnvKey values in script table: " + ($duplicateEnvKeys -join ", "))
  }

  foreach ($definition in $Definitions) {
    if ([string]::IsNullOrWhiteSpace($definition.SecretName)) {
      throw "Secret definition contains an empty SecretName."
    }

    if ([string]::IsNullOrWhiteSpace($definition.EnvKey)) {
      throw ("Secret definition " + $definition.SecretName + " contains an empty EnvKey.")
    }
  }
}

function Get-EnvTemplateKeys {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -Path $Path)) {
    return @()
  }

  $keys = New-Object System.Collections.Generic.List[string]
  foreach ($rawLine in Get-Content -Path $Path) {
    # Accept both active and commented placeholders, e.g. KEY= and # KEY=
    if ($rawLine -match '^\s*(?:#\s*)?(?<key>[A-Z0-9_]+)\s*=') {
      $keys.Add($Matches['key'])
    }
  }

  return @($keys | Sort-Object -Unique)
}

function Test-EnvTemplateAlignment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Definitions
  )

  if (-not (Test-Path -Path $Path)) {
    Write-Warning "Env template not found at $Path. Skipping EnvKey alignment check."
    return
  }

  $templateKeys = Get-EnvTemplateKeys -Path $Path
  $missingInTemplate = @(
    $Definitions |
      Where-Object { $templateKeys -notcontains $_.EnvKey } |
      ForEach-Object { $_.EnvKey } |
      Sort-Object -Unique
  )

  if ($missingInTemplate.Count -gt 0) {
    throw ("EnvKey mismatch against " + $Path + ". Missing keys in template: " + ($missingInTemplate -join ", "))
  }
}

function Get-AppHostingSecretReferences {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -Path $Path)) {
    throw "App Hosting config not found at $Path"
  }

  $active = New-Object System.Collections.Generic.List[string]
  $commented = New-Object System.Collections.Generic.List[string]

  foreach ($rawLine in Get-Content -Path $Path) {
    if ($rawLine -match '^\s*secret:\s*(?<name>[a-z0-9-]+)\s*$') {
      $active.Add($Matches['name'])
      continue
    }

    if ($rawLine -match '^\s*#\s*secret:\s*(?<name>[a-z0-9-]+)\s*$') {
      $commented.Add($Matches['name'])
      continue
    }
  }

  $activeUnique = @($active | Sort-Object -Unique)
  $commentedUnique = @($commented | Sort-Object -Unique)
  $allUnique = @(($active + $commented) | Sort-Object -Unique)

  return [pscustomobject]@{
    Active = $activeUnique
    Commented = $commentedUnique
    All = $allUnique
  }
}

function Test-SecretDefinitionAlignment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Definitions
  )

  $appHostingRefs = Get-AppHostingSecretReferences -Path $Path
  $scriptSecretNames = @($Definitions | ForEach-Object { $_.SecretName } | Sort-Object -Unique)

  $missingInScript = @($appHostingRefs.All | Where-Object { $scriptSecretNames -notcontains $_ })
  $missingInAppHosting = @($scriptSecretNames | Where-Object { $appHostingRefs.All -notcontains $_ })

  if ($missingInScript.Count -gt 0 -or $missingInAppHosting.Count -gt 0) {
    $issues = New-Object System.Collections.Generic.List[string]

    if ($missingInScript.Count -gt 0) {
      $issues.Add("Missing in script table: " + ($missingInScript -join ", "))
    }

    if ($missingInAppHosting.Count -gt 0) {
      $issues.Add("Missing in apphosting.yaml secret refs: " + ($missingInAppHosting -join ", "))
    }

    throw ("Secret mismatch between script and $Path. " + ($issues -join " | "))
  }

  return $appHostingRefs
}

function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-SecretValueFromPrompt {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secureInput = Read-Host -Prompt $Prompt -AsSecureString
  return Convert-SecureStringToPlainText -SecureValue $secureInput
}

function Convert-EnvLineValue {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value
  )

  $trimmed = $Value.Trim()
  if ($trimmed.Length -lt 2) {
    return $trimmed
  }

  if (($trimmed.StartsWith('"') -and $trimmed.EndsWith('"')) -or ($trimmed.StartsWith("'") -and $trimmed.EndsWith("'"))) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Read-EnvFileMap {
  param([Parameter(Mandatory = $true)][string]$Path)

  $envMap = @{}
  if (-not (Test-Path -Path $Path)) {
    return $envMap
  }

  foreach ($rawLine in Get-Content -Path $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = Convert-EnvLineValue -Value $line.Substring($separatorIndex + 1)
    $envMap[$key] = $value
  }

  return $envMap
}

function Resolve-SecretValue {
  param(
    [Parameter(Mandatory = $true)]$Definition,
    [Parameter(Mandatory = $true)][hashtable]$EnvMap
  )

  # Session env vars win, then .env.local. This supports both CI and local workflows.
  $resolved = $null
  $source = "none"
  $sessionValue = [Environment]::GetEnvironmentVariable($Definition.EnvKey)
  if (-not [string]::IsNullOrWhiteSpace($sessionValue)) {
    $resolved = $sessionValue
    $source = "session-env"
  }
  elseif ($EnvMap.ContainsKey($Definition.EnvKey) -and -not [string]::IsNullOrWhiteSpace($EnvMap[$Definition.EnvKey])) {
    $resolved = [string]$EnvMap[$Definition.EnvKey]
    $source = "env-file"
  }

  # Firebase private keys are often stored as escaped "\\n" in env files.
  # Convert those escapes back to real newlines before sending to Secret Manager.
  if (-not [string]::IsNullOrWhiteSpace($resolved) -and $Definition.EnvKey -like "*PRIVATE_KEY*") {
    $resolved = $resolved -replace "\\n", "`n"
  }

  return [pscustomobject]@{
    Value = $resolved
    Source = $source
  }
}

function Invoke-FirebaseCli {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $commandParts = $FirebaseCliPrefix + $Arguments
  Write-Host ("> " + ($commandParts -join " ")) -ForegroundColor DarkGray

  if ($DryRun) {
    return
  }

  & $commandParts[0] $commandParts[1..($commandParts.Length - 1)]
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase CLI command failed with exit code $LASTEXITCODE."
  }
}

function Set-AppHostingSecret {
  param(
    [Parameter(Mandatory = $true)]$Definition,
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Backend
  )

  $tempFilePath = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tempFilePath, $Value, [System.Text.UTF8Encoding]::new($false))
    Invoke-FirebaseCli -Arguments @(
      "apphosting:secrets:set",
      $Definition.SecretName,
      "--project",
      $ProjectId,
      "--data-file",
      $tempFilePath
    )

    if (-not $SkipGrantAccess) {
      Invoke-FirebaseCli -Arguments @(
        "apphosting:secrets:grantaccess",
        $Definition.SecretName,
        "--project",
        $ProjectId,
        "--backend",
        $Backend
      )
    }
  }
  finally {
    Remove-Item -Path $tempFilePath -ErrorAction SilentlyContinue
  }
}

Write-Host "Using project: $ProjectId" -ForegroundColor Cyan
Write-Host "Using backend: $BackendId" -ForegroundColor Cyan
Write-Host "Env source: $EnvFilePath" -ForegroundColor Cyan
Write-Host "App Hosting config: $AppHostingConfigPath" -ForegroundColor Cyan
Write-Host "Env template: $EnvTemplatePath" -ForegroundColor Cyan
if ($DryRun) {
  Write-Host "Running in dry-run mode. No Firebase changes will be applied." -ForegroundColor Yellow
}

Test-SecretDefinitionIntegrity -Definitions $SecretDefinitions
$appHostingSecretRefs = Test-SecretDefinitionAlignment -Path $AppHostingConfigPath -Definitions $SecretDefinitions
if ($appHostingSecretRefs.Active.Count -gt 0) {
  Write-Host ("App Hosting active secret refs: " + ($appHostingSecretRefs.Active -join ", ")) -ForegroundColor DarkGray
}

if ($appHostingSecretRefs.Commented.Count -gt 0) {
  Write-Host ("App Hosting commented secret refs: " + ($appHostingSecretRefs.Commented -join ", ")) -ForegroundColor DarkGray
}

if (-not $SkipEnvTemplateValidation) {
  Test-EnvTemplateAlignment -Path $EnvTemplatePath -Definitions $SecretDefinitions
}
else {
  Write-Host "Env template validation skipped by flag." -ForegroundColor Yellow
}

if ($OnlySecretName.Count -gt 0) {
  $requestedSecretNames = @(
    $OnlySecretName |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )

  $knownSecretNames = @($SecretDefinitions | ForEach-Object { $_.SecretName } | Sort-Object -Unique)
  $unknownRequestedSecretNames = @($requestedSecretNames | Where-Object { $knownSecretNames -notcontains $_ })
  if ($unknownRequestedSecretNames.Count -gt 0) {
    throw ("Unknown -OnlySecretName value(s): " + ($unknownRequestedSecretNames -join ", "))
  }

  $SecretDefinitions = @($SecretDefinitions | Where-Object { $requestedSecretNames -contains $_.SecretName })
  Write-Host ("Secret filter active. Targeting: " + ($requestedSecretNames -join ", ")) -ForegroundColor DarkGray
}

if (-not $SkipGrantAccess -and [string]::IsNullOrWhiteSpace($BackendId)) {
  throw "BackendId is required unless -SkipGrantAccess is provided."
}

if (-not (Test-Path -Path $EnvFilePath)) {
  Write-Warning "Env source file not found at $EnvFilePath. Session environment variables and prompt input will be used."
}

$envMap = Read-EnvFileMap -Path $EnvFilePath
$updatedSecrets = New-Object System.Collections.Generic.List[string]
$skippedSecrets = New-Object System.Collections.Generic.List[string]

foreach ($definition in $SecretDefinitions) {
  $resolution = Resolve-SecretValue -Definition $definition -EnvMap $envMap
  $value = $resolution.Value
  $valueSource = $resolution.Source
  $hasValue = -not [string]::IsNullOrWhiteSpace($value)
  $shouldConfigure = $definition.Required -or $hasValue -or $IncludeOptional

  if (-not $shouldConfigure) {
    $skippedSecrets.Add("$($definition.SecretName) (optional, no value found)")
    continue
  }

  if (-not $hasValue) {
    if ($NonInteractive) {
      if ($definition.Required) {
        throw "Missing required value for $($definition.EnvKey). Provide it in session env or $EnvFilePath."
      }

      $skippedSecrets.Add("$($definition.SecretName) (optional, missing value in non-interactive mode)")
      continue
    }

    if (-not $definition.Required) {
      $optionalChoice = (Read-Host -Prompt "No value found for $($definition.EnvKey). Set $($definition.SecretName) now? [y/N]").Trim().ToLowerInvariant()
      if ($optionalChoice -ne "y" -and $optionalChoice -ne "yes") {
        $skippedSecrets.Add("$($definition.SecretName) (optional, skipped by user)")
        continue
      }
    }

    $value = Read-SecretValueFromPrompt -Prompt "Enter value for $($definition.EnvKey) (hidden input)"
    if ([string]::IsNullOrWhiteSpace($value)) {
      if ($definition.Required) {
        throw "Required secret $($definition.SecretName) cannot be empty."
      }

      $skippedSecrets.Add("$($definition.SecretName) (optional, empty input)")
      continue
    }

    if ($definition.EnvKey -like "*PRIVATE_KEY*" -and $value -match "\\n") {
      $value = $value -replace "\\n", "`n"
    }

    $valueSource = "prompt"
  }

  Write-Host "" 
  Write-Host "----------------------------------------" -ForegroundColor DarkGray
  Write-Host "Setting secret: $($definition.SecretName)" -ForegroundColor Green
  Write-Host "Env key: $($definition.EnvKey) | Feature: $($definition.Feature)" -ForegroundColor DarkCyan
  Write-Host "Value source: $valueSource" -ForegroundColor DarkGray
  Write-Host "----------------------------------------" -ForegroundColor DarkGray

  Set-AppHostingSecret -Definition $definition -Value $value -Backend $BackendId
  $updatedSecrets.Add($definition.SecretName)
}

Write-Host ""
Write-Host "Done syncing App Hosting secrets." -ForegroundColor Cyan
Write-Host "Updated secrets: $($updatedSecrets.Count)" -ForegroundColor Cyan
if ($updatedSecrets.Count -gt 0) {
  Write-Host (" - " + ($updatedSecrets -join ", ")) -ForegroundColor Cyan
}

if ($skippedSecrets.Count -gt 0) {
  Write-Host "Skipped secrets: $($skippedSecrets.Count)" -ForegroundColor Yellow
  foreach ($skipReason in $skippedSecrets) {
    Write-Host (" - " + $skipReason) -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1) Ensure matching secret refs are uncommented in apps/web/apphosting.yaml"
Write-Host "2) Run:"
Write-Host "   npm run lint --workspace @zootopia/web"
Write-Host "   npm run typecheck --workspace @zootopia/web"
Write-Host "   npm run build --workspace @zootopia/web"
Write-Host "3) Create a new App Hosting rollout or push the connected branch"