[CmdletBinding()]
param(
    [string]$ApiBaseUrl = 'https://flowapi.appstijuca.com.br/api/v1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ApiBaseUrl.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'O build de produção exige uma URL HTTPS.'
}

$mobileRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $mobileRoot 'android'
$keystorePath = Join-Path $androidRoot 'app\tijuca-flow-upload.jks'
$encryptedSecretPath = Join-Path $androidRoot '.tijuca-flow-upload-password.dpapi'
$releaseApkPath = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
$appConfig = Get-Content -Raw -LiteralPath (Join-Path $mobileRoot 'app.json') | ConvertFrom-Json
$distDirectory = Join-Path $mobileRoot 'dist'
$distApkPath = Join-Path $distDirectory ("tijuca-flow-{0}-production.apk" -f $appConfig.expo.version)

Add-Type -AssemblyName System.Security.Cryptography.ProtectedData

function New-SigningPassword {
    $randomBytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
    return [Convert]::ToBase64String($randomBytes)
}

function Save-ProtectedPassword([string]$Password) {
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($Password)
    try {
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $plainBytes,
            $null,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [IO.File]::WriteAllBytes($encryptedSecretPath, $protectedBytes)
    }
    finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
    }
}

function Read-ProtectedPassword {
    $protectedBytes = [IO.File]::ReadAllBytes($encryptedSecretPath)
    $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    try {
        return [Text.Encoding]::UTF8.GetString($plainBytes)
    }
    finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
    }
}

$keystoreExists = Test-Path -LiteralPath $keystorePath
$secretExists = Test-Path -LiteralPath $encryptedSecretPath

if ($keystoreExists -ne $secretExists) {
    throw 'A chave ou sua credencial protegida está ausente. Restaure o par a partir do backup.'
}

if (-not $keystoreExists) {
    $signingPassword = New-SigningPassword
    $keytoolArguments = @(
        '-genkeypair',
        '-v',
        '-storetype', 'PKCS12',
        '-keystore', $keystorePath,
        '-alias', 'tijuca-flow',
        '-keyalg', 'RSA',
        '-keysize', '4096',
        '-sigalg', 'SHA256withRSA',
        '-validity', '10000',
        '-dname', 'CN=Tijuca Alimentos, OU=TI, O=Tijuca Alimentos, L=Goiania, ST=Goias, C=BR',
        '-storepass', $signingPassword,
        '-keypass', $signingPassword
    )
    & keytool @keytoolArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar a chave de assinatura (código $LASTEXITCODE)."
    }
    Save-ProtectedPassword $signingPassword
}
else {
    $signingPassword = Read-ProtectedPassword
}

$previousEnvironment = @{
    NodeEnv = $env:NODE_ENV
    API = $env:EXPO_PUBLIC_API_BASE_URL
    StoreFile = $env:TIJUCA_UPLOAD_STORE_FILE
    StorePassword = $env:TIJUCA_UPLOAD_STORE_PASSWORD
    KeyAlias = $env:TIJUCA_UPLOAD_KEY_ALIAS
    KeyPassword = $env:TIJUCA_UPLOAD_KEY_PASSWORD
}

try {
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl.TrimEnd('/')
    $env:TIJUCA_UPLOAD_STORE_FILE = $keystorePath
    $env:TIJUCA_UPLOAD_STORE_PASSWORD = $signingPassword
    $env:TIJUCA_UPLOAD_KEY_ALIAS = 'tijuca-flow'
    $env:TIJUCA_UPLOAD_KEY_PASSWORD = $signingPassword

    Push-Location $androidRoot
    try {
        # O Gradle não considera EXPO_PUBLIC_API_BASE_URL na entrada do pacote JS: sem o --rerun, um
        # pacote gerado antes (ex.: apontando para um backend de teste) é reaproveitado e vai para
        # produção com a URL errada.
        & .\gradlew.bat :app:createBundleReleaseJsAndAssets --rerun assembleRelease
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no build Android release (código $LASTEXITCODE)."
        }
    }
    finally {
        Pop-Location
    }

    New-Item -ItemType Directory -Force -Path $distDirectory | Out-Null
    Copy-Item -LiteralPath $releaseApkPath -Destination $distApkPath -Force
    Write-Output $distApkPath
}
finally {
    $env:NODE_ENV = $previousEnvironment.NodeEnv
    $env:EXPO_PUBLIC_API_BASE_URL = $previousEnvironment.API
    $env:TIJUCA_UPLOAD_STORE_FILE = $previousEnvironment.StoreFile
    $env:TIJUCA_UPLOAD_STORE_PASSWORD = $previousEnvironment.StorePassword
    $env:TIJUCA_UPLOAD_KEY_ALIAS = $previousEnvironment.KeyAlias
    $env:TIJUCA_UPLOAD_KEY_PASSWORD = $previousEnvironment.KeyPassword
    $signingPassword = $null
}
