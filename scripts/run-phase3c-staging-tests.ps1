[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (Test-Path Variable:PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Stop-Phase3CTest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [int]$ExitCode = 1
  )

  [Console]::Error.WriteLine($Message)
  exit $ExitCode
}

$requiredEnvironment = @(
  'PHASE3C_STAGING_PGSERVICE',
  'PHASE3C_TEST_USER_A',
  'PHASE3C_TEST_USER_B',
  'PHASE3C_TEST_FOOD_ID'
)

foreach ($name in $requiredEnvironment) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Stop-Phase3CTest "Missing required environment variable: $name" 2
  }
}

$userA = [Environment]::GetEnvironmentVariable('PHASE3C_TEST_USER_A')
$userB = [Environment]::GetEnvironmentVariable('PHASE3C_TEST_USER_B')
$foodId = [Environment]::GetEnvironmentVariable('PHASE3C_TEST_FOOD_ID')
$parsedGuid = [Guid]::Empty

foreach ($candidate in @($userA, $userB, $foodId)) {
  if (-not [Guid]::TryParseExact($candidate, 'D', [ref]$parsedGuid)) {
    Stop-Phase3CTest 'Test user and food identifiers must be canonical UUIDs.' 2
  }
}
if ($userA -eq $userB) {
  Stop-Phase3CTest 'PHASE3C_TEST_USER_A and PHASE3C_TEST_USER_B must differ.' 2
}

$psql = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  $psql = Get-Command 'psql' -ErrorAction SilentlyContinue
}
if ($null -eq $psql) {
  Stop-Phase3CTest 'psql was not found on PATH.' 2
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$harness = Join-Path $repositoryRoot 'docs/phase3c_staging_tests.sql'
if (-not (Test-Path -LiteralPath $harness -PathType Leaf)) {
  Stop-Phase3CTest 'Phase 3C staging harness was not found.' 2
}

$serviceName = [Environment]::GetEnvironmentVariable(
  'PHASE3C_STAGING_PGSERVICE'
)
if ($serviceName -notmatch '^[A-Za-z0-9_.-]+$') {
  Stop-Phase3CTest 'PHASE3C_STAGING_PGSERVICE has an invalid format.' 2
}

$arguments = @(
  '--no-psqlrc',
  '--no-password',
  '--single-transaction',
  '--set=ON_ERROR_STOP=on',
  '--set=VERBOSITY=verbose',
  '--set=phase3c_wrapper_guard=PHASE3C_REVIEWED_WRAPPER_V1',
  '--set=confirm_non_production=PHASE3C_STAGING_ONLY',
  "--set=test_user_a=$userA",
  "--set=test_user_b=$userB",
  "--set=test_food_id=$foodId",
  "--dbname=service=$serviceName",
  '--file',
  $harness
)

$capturedOutput = @(& $psql.Source @arguments 2>&1)
$psqlExitCode = $LASTEXITCODE
$capturedOutput | ForEach-Object { Write-Output $_ }

$combinedOutput = $capturedOutput -join [Environment]::NewLine
$hasSuccessSentinel = $combinedOutput -match (
  '(?m)^ERROR:\s+P3T01:\s+' +
  'PHASE3C_ALL_ASSERTIONS_PASSED_ROLLBACK_REQUIRED\s*$'
)

# PostgreSQL 17 documents exit status 3 for a script error when ON_ERROR_STOP
# is enabled. The success sentinel is intentionally such an error so that
# --single-transaction sends ROLLBACK instead of COMMIT. No other failure can
# reach the sentinel because ON_ERROR_STOP stops on the first SQL error.
if ($psqlExitCode -eq 3 -and $hasSuccessSentinel) {
  Write-Output 'Phase 3C staging tests passed; psql rolled back the transaction.'
  exit 0
}

Stop-Phase3CTest (
  "Phase 3C staging tests failed (psql exit code $psqlExitCode). " +
  'The success sentinel was not observed; no PASS result is accepted.'
) 1
