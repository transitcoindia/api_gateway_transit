# PowerShell script to deploy api_gateway_transit service to EC2
# Usage: .\deploy-gateway-to-ec2.ps1

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [string]$BRANCH = "main",
    [switch]$SkipInstall = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "API Gateway Deployment to EC2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "EC2 IP: $EC2_IP" -ForegroundColor Yellow
Write-Host "Branch: $BRANCH" -ForegroundColor Yellow
Write-Host "SSH Key: $SSH_KEY" -ForegroundColor Yellow
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSH_KEY)) {
    Write-Host "Error: SSH key not found at: $SSH_KEY" -ForegroundColor Red
    Write-Host "Please update the SSH_KEY path in the script or pass it as parameter" -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Checking git status..." -ForegroundColor Cyan
$gitStatus = git status --short
if ($gitStatus) {
    Write-Host "Warning: You have uncommitted changes:" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor Gray
    $confirm = Read-Host "Do you want to continue anyway? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "Working directory is clean" -ForegroundColor Green
}
Write-Host ""

Write-Host "Step 2: Pushing code to GitHub..." -ForegroundColor Cyan
$currentBranch = git branch --show-current
if ($currentBranch -ne $BRANCH) {
    Write-Host "Warning: You're not on '$BRANCH' branch (currently on '$currentBranch')" -ForegroundColor Yellow
    $confirm = Read-Host "Do you want to continue? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        exit 0
    }
}

# Check if there are commits to push
$unpushedCommits = git log origin/$BRANCH..HEAD --oneline
if ($unpushedCommits) {
    Write-Host "You have unpushed commits. Consider pushing to GitHub first:" -ForegroundColor Yellow
    Write-Host $unpushedCommits -ForegroundColor Gray
    $confirm = Read-Host "Push to GitHub now? (y/n)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        git push origin $BRANCH
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to push to GitHub" -ForegroundColor Red
            exit 1
        }
        Write-Host "Code pushed to GitHub" -ForegroundColor Green
    }
} else {
    Write-Host "All commits are pushed to GitHub" -ForegroundColor Green
}
Write-Host ""

Write-Host "Step 3: Connecting to EC2 and deploying..." -ForegroundColor Cyan
Write-Host ""

# Build deployment command
$deployCommands = @(
    "cd ~/transit/api_gateway_transit",
    "echo '[INFO] Stashing local changes...'",
    "git stash || true",
    "echo '[INFO] Pulling latest code...'",
    "git fetch origin",
    "git checkout $BRANCH",
    "git reset --hard origin/$BRANCH",
    "echo '[INFO] Cleaning dist folder...'",
    "rm -rf dist || true"
)

if (-not $SkipInstall) {
    $deployCommands += @(
        "echo '[INFO] Installing dependencies...'",
        "npm install"
    )
}

$deployCommands += @(
    "echo '[INFO] Building TypeScript...'",
    "npm run build",
    "echo '[INFO] Restarting service...'",
    "pm2 restart api-gateway-transit --update-env",
    "pm2 save",
    "echo ''",
    "echo '[SUCCESS] Deployment complete!'",
    "pm2 status"
)

$deployScript = $deployCommands -join " && "

# Execute SSH command
$sshCommand = "ssh -i `"$SSH_KEY`" -o StrictHostKeyChecking=no ec2-user@$EC2_IP `"$deployScript`""

Write-Host "Executing deployment commands on EC2..." -ForegroundColor Gray
Write-Host ""

try {
    Invoke-Expression $sshCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Deployment Successful!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Check service health: https://gateway.transitco.in/health" -ForegroundColor Gray
        Write-Host "2. Monitor logs: ssh -i `"$SSH_KEY`" ec2-user@$EC2_IP 'pm2 logs api-gateway-transit --lines 50'" -ForegroundColor Gray
        Write-Host "3. Check PM2 status: ssh -i `"$SSH_KEY`" ec2-user@$EC2_IP 'pm2 status'" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "Deployment failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Check the error messages above for details" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Error during deployment: $_" -ForegroundColor Red
    exit 1
}
