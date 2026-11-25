<#
.SYNOPSIS
Fast, deterministic (<30s) rollback script for YASD 3D production targets.

.DESCRIPTION
Rolls back Cloudflare Worker (`edge/wrangler.yasd3d.toml`), Google Cloud Run (`angband3d-cloud` in `us-central1`),
and/or ResonantOVH `yasd3d.service` + `git` baseline (`pre-ovh-v13.2.1` by default).
Supports `-WhatIf` for safe dry-run validation.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('ovh', 'gcp', 'worker', 'all')]
    [string]$Target = 'all',

    [string]$OvhHost = 'ovh',
    [string]$OvhService = 'yasd3d.service',
    [string]$GcpService = 'angband3d-cloud',
    [string]$GcpRegion = 'us-central1',
    [string]$CloudRunRevision = 'angband3d-cloud-00217-2cl',
    [string]$WorkerVersionId = '19b77267-81f5-495b-a8e7-0f6978fa8845',
    [string]$WranglerConfig = 'edge/wrangler.yasd3d.toml',
    [string]$GitRef = 'pre-ovh-v13.2.1'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Invoke-Step {
    param([string]$Label, [scriptblock]$Action)
    Write-Host "[Rollback] $Label" -ForegroundColor Cyan
    if ($PSCmdlet.ShouldProcess($Label, 'Execute')) {
        & $Action
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed during '$Label' (exit code $LASTEXITCODE)"
        }
    }
}

Push-Location $RepoRoot
try {
    if ($Target -eq 'worker' -or $Target -eq 'all') {
        Invoke-Step "Revert Cloudflare Worker ($WranglerConfig -> $WorkerVersionId)" {
            npx --yes wrangler rollback $WorkerVersionId --config $WranglerConfig --message "Emergency rollback to $GitRef" --yes
        }
    }

    if ($Target -eq 'gcp' -or $Target -eq 'all') {
        Invoke-Step "Route 100% Cloud Run traffic ($GcpService -> $CloudRunRevision)" {
            gcloud run services update-traffic $GcpService --region $GcpRegion --to-revisions="$CloudRunRevision=100" --quiet
        }
    }

    if ($Target -eq 'ovh' -or $Target -eq 'all') {
        Invoke-Step "Restore OVH service ($OvhService on $OvhHost -> $GitRef)" {
            ssh -o BatchMode=yes $OvhHost "set -e; cd /opt/yasd3d/app 2>/dev/null || exit 0; git fetch --tags; git checkout $GitRef; sudo systemctl restart $OvhService; sudo systemctl is-active --quiet $OvhService"
        }
    }

    Invoke-Step "Verify https://yasd3d.com/api/health" {
        $resp = Invoke-RestMethod -Uri 'https://yasd3d.com/api/health' -TimeoutSec 10
        Write-Host ("[Rollback] Health OK: version={0} status={1}" -f $resp.version, $resp.status) -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
