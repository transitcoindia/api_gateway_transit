# Configure Cloudflare Tunnel (cloudflared) on the EC2 that runs api_gateway_transit.
# Same flow as transit_driver/setup-cloudflared-tunnel-ec2.ps1: token + systemd, scp + bash (no Windows CRLF issues).
#
# Usage:
#   .\setup-cloudflared-tunnel-ec2.ps1 -TunnelToken "eyJ..."
#   .\setup-cloudflared-tunnel-ec2.ps1 -TunnelTokenFile "C:\secrets\token.txt"
#
# Get token: Cloudflare Zero Trust -> Networks -> Tunnels -> your tunnel -> copy connector token.
#
# IMPORTANT - same EC2 as driver?
#   If ONE tunnel serves both api.transitco.in and gateway.transitco.in, run this script only ONCE
#   (either from api_gateway_transit or transit_driver) with that tunnel's token. Do not use two
#   different tokens on the same machine unless you use separate systemd units (advanced).
#
# Ingress: map hostname -> localhost:PORT for THAT app on EC2. Do NOT assume 3000 vs 10000 — verify:
#   pm2 pid api-gateway-transit && pm2 pid transit-driver && ss -tlnp | grep node
# Gateway may be on 10000 while driver is on 3000 (each has its own PORT in its .env on the server).
# See repo root CLOUDFLARE_TUNNEL_PORTS.md
#
# After success, regenerate the token in Cloudflare if it was ever exposed.

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [string]$SSHUser = "ec2-user",
    [string]$TunnelToken = "",
    [string]$TunnelTokenFile = "",
    [string]$CloudflaredBin = "/usr/local/bin/cloudflared",
    [switch]$UseHttp2 = $true,
    [switch]$NoAutoupdate = $true
)

$ErrorActionPreference = "Stop"

function Write-Step { param($m) Write-Host "[gateway-cloudflared] $m" -ForegroundColor Cyan }

if (-not (Test-Path $SSH_KEY)) {
    Write-Host "SSH key not found: $SSH_KEY" -ForegroundColor Red
    exit 1
}

if ($TunnelTokenFile -ne "" -and (Test-Path $TunnelTokenFile)) {
    $TunnelToken = (Get-Content -Path $TunnelTokenFile -Raw).Trim()
}

if ([string]::IsNullOrWhiteSpace($TunnelToken)) {
    $TunnelToken = Read-Host "Paste Cloudflare tunnel connector token (TUNNEL_TOKEN)"
}

if ([string]::IsNullOrWhiteSpace($TunnelToken)) {
    Write-Host "No token provided. Exiting." -ForegroundColor Red
    exit 1
}

$certPath = "/home/$SSHUser/.cloudflared/cert.pem"
$envBody = "TUNNEL_TOKEN=$TunnelToken`n"
$envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envBody))

$execParts = @($CloudflaredBin, "tunnel")
if ($NoAutoupdate) { $execParts += "--no-autoupdate" }
if ($UseHttp2) { $execParts += "--protocol"; $execParts += "http2" }
$execParts += "run"
$execLine = ($execParts -join " ")

$unitFile = @"
[Unit]
Description=Cloudflare Tunnel (cloudflared) - API Gateway host
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SSHUser
Group=$SSHUser
EnvironmentFile=/etc/cloudflared/token.env
ExecStart=$execLine
Restart=on-failure
RestartSec=5s
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
"@
$unitFile = ($unitFile -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd() + "`n"
$unitB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($unitFile))

$remoteBash = @"
set -e
echo '[1/6] Writing /etc/cloudflared/token.env (from base64)...'
sudo mkdir -p /etc/cloudflared
echo $envB64 | base64 -d | sudo tee /etc/cloudflared/token.env > /dev/null
if [ -f $certPath ]; then
  echo "TUNNEL_ORIGIN_CERT=$certPath" | sudo tee -a /etc/cloudflared/token.env > /dev/null
fi
sudo chmod 600 /etc/cloudflared/token.env
sudo chown root:root /etc/cloudflared/token.env

echo '[2/6] cert.pem check...'
if [ ! -f $certPath ]; then
  echo 'WARNING: $certPath not found. If tunnel errors about origin cert, SSH in and run: cloudflared login'
fi

echo '[3/6] Installing systemd unit (base64)...'
echo $unitB64 | base64 -d | sudo tee /etc/systemd/system/cloudflared.service > /dev/null

echo '[4/6] Removing old drop-in overrides (if any)...'
sudo rm -f /etc/systemd/system/cloudflared.service.d/override.conf 2>/dev/null || true
sudo rmdir /etc/systemd/system/cloudflared.service.d 2>/dev/null || true

echo '[5/6] Reload systemd and restart cloudflared...'
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sleep 2

echo '[6/6] Status + last logs...'
sudo systemctl is-active cloudflared || true
sudo journalctl -u cloudflared -n 25 --no-pager
"@

$remoteBash = ($remoteBash -replace "`r", "").TrimEnd() + "`n"

Write-Step "Target: ${SSHUser}@${EC2_IP}"
Write-Step "SSH key: $SSH_KEY"
Write-Host ""

Write-Step "Running remote setup (scp + bash on server)..."
$tmpSh = Join-Path $env:TEMP ("cloudflared-gateway-ec2-setup-{0}.sh" -f ([guid]::NewGuid().ToString("N")))
$remoteSh = "/tmp/cloudflared-gateway-ec2-setup-$([guid]::NewGuid().ToString('N')).sh"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$sshBase = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "GSSAPIAuthentication=no")
try {
    [System.IO.File]::WriteAllText($tmpSh, $remoteBash, $utf8NoBom)
    $scpArgs = $sshBase + @($tmpSh, "${SSHUser}@${EC2_IP}:${remoteSh}")
    $pScp = Start-Process -FilePath "scp" -ArgumentList $scpArgs -NoNewWindow -Wait -PassThru
    if ($pScp.ExitCode -ne 0) {
        Write-Host "scp failed with code $($pScp.ExitCode). Is OpenSSH scp installed (same as ssh)?" -ForegroundColor Red
        exit $pScp.ExitCode
    }
    $sshArgs = $sshBase + @("${SSHUser}@${EC2_IP}", "bash `"$remoteSh`" && rm -f `"$remoteSh`"")
    $pSsh = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -NoNewWindow -Wait -PassThru
    if ($pSsh.ExitCode -ne 0) {
        Write-Host "SSH exited with code $($pSsh.ExitCode)" -ForegroundColor Red
        exit $pSsh.ExitCode
    }
}
finally {
    Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. In Cloudflare -> Tunnels -> set gateway.transitco.in to the port for api-gateway-transit (on EC2: ss -tlnp + pm2 pid api-gateway-transit; often 10000 if driver uses 3000)." -ForegroundColor Green
Write-Host "Health check: https://gateway.transitco.in/health   (PM2: api-gateway-transit on this EC2)." -ForegroundColor Green
Write-Host "If you see cert errors, SSH in and run: cloudflared login   (then re-run this script)." -ForegroundColor Yellow
