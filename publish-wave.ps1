#Requires -Version 5.1
<#
.SYNOPSIS
    One-shot publisher for Wave 2.0 Studio: open the firewall, sort out the router,
    then launch the HTTPS server on your public IP.

.DESCRIPTION
    Runs the three steps needed to publish the Studio at https://<public-ip>:<port>:

      Step 1  Prepare the machine
              - checks Python / Node / uv / pnpm
              - installs the Python + Node dependencies when missing
              - creates .env.local from .env.example and generates STUDIO_ACCESS_TOKEN
              - warns when LiveKit Cloud credentials are still placeholders
              - builds the production bundle (handled by start.py)

      Step 2  Router
              - detects this PC's LAN address, default gateway and DHCP state
              - detects CGNAT (shared/public address) before you waste time forwarding
              - with -RouterMode Auto|UPnP it tries to create the TCP port mapping
                automatically through UPnP IGD; otherwise it prints the exact values
                to type into the router page and offers to open it

      Step 3  Windows Firewall
              - creates (or repairs) an inbound allow rule for the TCP port
              - self-elevates with UAC when it is not already running as admin

      Then it launches:
              python start.py --mode prod --https --host <public-ip> --yes --port <port>
              waits for /api/health, and verifies localhost / LAN / public reachability.

    Browsers only allow microphone access over HTTPS or localhost, which is why this
    script always publishes with TLS. The certificate is self-signed: the first visit
    shows "Not secure" and you choose Advanced -> Proceed once per browser.

.PARAMETER PublicIp
    Public (WAN) address you want to publish on. Default 182.183.90.63.

.PARAMETER Port
    Public TCP port. Default 8443.

.PARAMETER LanIp
    Override auto-detection of this machine's LAN address (used for UPnP + guidance).

.PARAMETER RouterMode
    Auto (default) = try UPnP, then fall back to manual instructions.
    UPnP          = require UPnP; fail loudly if the router does not support it.
    Manual        = never touch the router; print instructions only.
    Skip          = do nothing about the router.

.PARAMETER RotateToken
    Replace an existing STUDIO_ACCESS_TOKEN with a freshly generated one.

.PARAMETER StudioAccessToken
    Use this exact token instead of generating one.

.PARAMETER SkipInstall
    Do not run uv sync / pnpm install even when dependencies are missing.

.PARAMETER SkipFirewall
    Do not create or modify firewall rules (also avoids the UAC prompt).

.PARAMETER NoLaunch
    Configure everything but do not start the server (good for a dry run).

.PARAMETER NoElevate
    Do not attempt to relaunch elevated. Firewall work will be skipped if not admin.

.PARAMETER FirewallProfile
    Firewall profiles for the rule. Default: Domain, Private, Public.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\publish-wave.ps1

.EXAMPLE
    .\publish-wave.ps1 -PublicIp 182.183.90.63 -Port 8443 -RouterMode Manual

.EXAMPLE
    .\publish-wave.ps1 -NoLaunch -RotateToken

.NOTES
    Requires Windows 8 / Server 2012 or newer for the NetSecurity cmdlets.
    See PUBLISH_IP.md for the manual runbook, CGNAT details and troubleshooting.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$PublicIp = "182.183.90.63",

    [ValidateRange(1, 65535)]
    [int]$Port = 8443,

    [string]$LanIp = "",

    [ValidateSet("Auto", "UPnP", "Manual", "Skip")]
    [string]$RouterMode = "Auto",

    [switch]$RotateToken,

    [string]$StudioAccessToken = "",

    [switch]$SkipInstall,

    [switch]$SkipFirewall,

    [switch]$NoLaunch,

    [switch]$NoElevate,

    [ValidateSet("Domain", "Private", "Public")]
    [string[]]$FirewallProfile = @("Domain", "Private", "Public"),

    # Internal: set on the elevated relaunch to avoid an elevation loop.
    [switch]$ElevatedRun
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --------------------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------------------
$script:StepCount = 0

function Write-Banner {
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host "   Wave 2.0  -  Publish Studio on a public IP (HTTPS)" -ForegroundColor Cyan
    Write-Host "   https://${PublicIp}:${Port}" -ForegroundColor Cyan
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Write-Step {
    param([string]$Title)
    $script:StepCount++
    Write-Host ""
    Write-Host ("  [{0}] {1}" -f $script:StepCount, $Title) -ForegroundColor White
    Write-Host ("  " + ("-" * (54 + $Title.Length))) -ForegroundColor DarkGray
}

function Write-Ok {
    param([string]$Text)
    Write-Host "      [ OK ]   $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "      [ .. ]   $Text" -ForegroundColor Gray
}

function Write-Warn {
    param([string]$Text)
    Write-Host "      [WARN]   $Text" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Text)
    Write-Host "      [FAIL]   $Text" -ForegroundColor Red
}

function Write-Detail {
    param([string]$Text)
    Write-Host "               $Text" -ForegroundColor DarkGray
}

function Write-CommandHint {
    param([string]$Text)
    Write-Host "               $Text" -ForegroundColor DarkCyan
}

# --------------------------------------------------------------------------------------
# Generic helpers
# --------------------------------------------------------------------------------------
function Test-IsWindows {
    return ([System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT)
}

function Test-IsAdmin {
    if (-not (Test-IsWindows)) { return $false }
    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        return $false
    }
}

function Find-Command {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd }
    }
    return $null
}

function Test-IsPrivateAddress {
    param([string]$Address)
    if ([string]::IsNullOrWhiteSpace($Address)) { return $true }
    if ($Address -match '^10\.') { return $true }
    if ($Address -match '^127\.') { return $true }
    if ($Address -match '^192\.168\.') { return $true }
    if ($Address -match '^172\.(1[6-9]|2[0-9]|3[01])\.') { return $true }
    if ($Address -match '^169\.254\.') { return $true }
    # RFC 6598 carrier-grade NAT range 100.64.0.0/10
    if ($Address -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.') { return $true }
    return $false
}

function Get-LanAddress {
    if (-not [string]::IsNullOrWhiteSpace($LanIp)) { return $LanIp }

    if (Test-IsWindows) {
        try {
            $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
                Sort-Object -Property RouteMetric | Select-Object -First 1
            if ($route) {
                $addr = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 `
                    -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($addr -and $addr.IPAddress) { return $addr.IPAddress }
            }
        }
        catch { }
    }

    # Portable fallback: ask the OS which local address reaches the internet.
    try {
        $probe = New-Object System.Net.Sockets.UdpClient
        try {
            $probe.Connect("8.8.8.8", 65530)
            $endpoint = $probe.Client.LocalEndPoint
            if ($endpoint) { return $endpoint.Address.ToString() }
        }
        finally { $probe.Close() }
    }
    catch { }
    return ""
}

function Get-DefaultGateway {
    if (-not (Test-IsWindows)) { return "" }
    try {
        $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
            Sort-Object -Property RouteMetric | Select-Object -First 1
        if ($route) { return $route.NextHop }
    }
    catch { }
    return ""
}

function Get-DhcpState {
    param([string]$Address)
    if (-not (Test-IsWindows) -or [string]::IsNullOrWhiteSpace($Address)) { return "Unknown" }
    try {
        $ip = Get-NetIPAddress -IPAddress $Address -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $ip) { return "Unknown" }
        $iface = Get-NetIPInterface -InterfaceIndex $ip.InterfaceIndex -AddressFamily IPv4 `
            -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $iface) { return "Unknown" }
        if ($iface.Dhcp -eq "Enabled") { return "Enabled" }
        return "Disabled"
    }
    catch {
        return "Unknown"
    }
}

function Get-PublicIpOnline {
    $services = @(
        @{ Url = "https://api.ipify.org?format=json"; Property = "ip" },
        @{ Url = "https://ifconfig.me/all.json"; Property = "ip_addr" }
    )
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    }
    catch { }

    foreach ($service in $services) {
        try {
            $response = Invoke-RestMethod -Uri $service.Url -TimeoutSec 6
            $value = $null
            if ($response -is [string]) {
                $value = $response.Trim()
            }
            elseif ($response.PSObject.Properties[$service.Property]) {
                $value = $response.($service.Property)
            }
            if ($value -and $value -match '^\d{1,3}(\.\d{1,3}){3}$') { return $value }
        }
        catch { }
    }
    return ""
}

function Test-HttpsHealth {
    param([string]$TargetHost, [int]$TargetPort, [int]$TimeoutSeconds = 5)
    $url = "https://${TargetHost}:${TargetPort}/api/health"

    $curl = Find-Command -Names @("curl.exe", "curl")
    if ($curl) {
        try {
            $null = & $curl.Source -sk -m $TimeoutSeconds $url 2>$null
            return ($LASTEXITCODE -eq 0)
        }
        catch { return $false }
    }

    # Fallback: .NET with certificate validation disabled (self-signed cert).
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        $request = [System.Net.HttpWebRequest]::Create($url)
        $request.Timeout = $TimeoutSeconds * 1000
        $response = $request.GetResponse()
        $status = [int]$response.StatusCode
        $response.Close()
        return ($status -ge 200 -and $status -lt 500)
    }
    catch {
        return $false
    }
}

# --------------------------------------------------------------------------------------
# Repository + dependencies (Step 1a)
# --------------------------------------------------------------------------------------
function Get-RepoRoot {
    $candidates = @()
    if ($PSScriptRoot) { $candidates += $PSScriptRoot }
    if ($MyInvocation.MyCommand.Path) { $candidates += (Split-Path -Parent $MyInvocation.MyCommand.Path) }
    $candidates += (Get-Location).Path

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "start.py"))) {
            return (Resolve-Path $candidate).Path
        }
    }
    throw "Could not find start.py. Put publish-wave.ps1 in the Wave-2.0 repository root and run it from there."
}

function Test-LauncherSupportsFlags {
    param([string]$Root)
    $launcher = Join-Path $Root "start.py"
    try {
        $content = Get-Content -Path $launcher -Raw
    }
    catch {
        return $false
    }
    return ($content -match '--mode' -and $content -match '--https' -and $content -match '--api-port')
}

function Resolve-Python {
    param([string]$Root)

    $venvPython = Join-Path $Root ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) { return $venvPython }

    $py = Find-Command -Names @("python", "python3", "py")
    if ($py) { return $py.Source }
    return $null
}

function Ensure-Dependencies {
    param([string]$Root)

    if ($SkipInstall) {
        Write-Info "Skipping dependency installation (-SkipInstall)."
        return $true
    }

    $uv = Find-Command -Names @("uv", "uv.exe")
    $venvPython = Join-Path $Root ".venv\Scripts\python.exe"
    $hasVenv = Test-Path $venvPython

    if (-not $hasVenv) {
        if ($uv) {
            Write-Info "Creating the Python environment (uv sync) ..."
            Push-Location $Root
            try {
                & $uv.Source sync 2>&1 | Out-Host
                if ($LASTEXITCODE -ne 0) { Write-Warn "uv sync returned exit code $LASTEXITCODE." }
                else { Write-Ok "Python environment ready (.venv)." }
            }
            finally { Pop-Location }
        }
        else {
            Write-Warn "uv is not installed and .venv is missing."
            Write-Detail "Install uv:  powershell -c ""irm https://astral.sh/uv/install.ps1 | iex"""
            Write-Detail "Then re-run this script (or use -SkipInstall if you manage Python yourself)."
        }
    }
    else {
        Write-Ok "Python environment found (.venv)."
    }

    $nodeModules = Join-Path $Root "node_modules"
    if (-not (Test-Path $nodeModules)) {
        $pm = Find-Command -Names @("pnpm", "pnpm.cmd", "npm", "npm.cmd")
        if ($pm) {
            Write-Info "Installing web dependencies ($($pm.Name) install) ..."
            Push-Location $Root
            try {
                & $pm.Source install 2>&1 | Out-Host
                if ($LASTEXITCODE -ne 0) { Write-Warn "Dependency install returned exit code $LASTEXITCODE." }
                else { Write-Ok "Web dependencies installed." }
            }
            finally { Pop-Location }
        }
        else {
            Write-Warn "node_modules is missing and neither pnpm nor npm was found."
            Write-Detail "Install Node.js 20+ from https://nodejs.org then re-run this script."
        }
    }
    else {
        Write-Ok "Web dependencies found (node_modules)."
    }

    $distIndex = Join-Path $Root "dist\index.html"
    if (Test-Path $distIndex) { Write-Ok "Production bundle found (dist)." }
    else { Write-Info "No dist/ yet - start.py will build it on first launch." }

    return $true
}

# --------------------------------------------------------------------------------------
# .env.local + STUDIO_ACCESS_TOKEN (Step 1b)
# --------------------------------------------------------------------------------------
function New-RandomToken {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) }
    finally { $rng.Dispose() }
    return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Read-DotEnvValue {
    param([string]$Path, [string]$Name)
    if (-not (Test-Path $Path)) { return "" }
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        $idx = $trimmed.IndexOf("=")
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        if ($key -eq $Name) {
            return $trimmed.Substring($idx + 1).Trim()
        }
    }
    return ""
}

function Set-DotEnvValue {
    param([string]$Path, [string]$Name, [string]$Value)

    $lines = New-Object System.Collections.Generic.List[string]
    $replaced = $false

    if (Test-Path $Path) {
        foreach ($line in Get-Content -Path $Path) {
            $trimmed = $line.Trim()
            $idx = $trimmed.IndexOf("=")
            if (-not $trimmed.StartsWith("#") -and $idx -ge 1) {
                $key = $trimmed.Substring(0, $idx).Trim()
                if ($key -eq $Name) {
                    $lines.Add("$Name=$Value")
                    $replaced = $true
                    continue
                }
            }
            $lines.Add($line)
        }
    }

    if (-not $replaced) {
        $lines.Add("$Name=$Value")
    }

    $text = ($lines -join "`r`n") + "`r`n"
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $text, $encoding)

    # Owner-only ACL, mirroring what the backend writes on Linux/macOS (0600).
    try {
        $acl = Get-Acl $Path
        $acl.SetAccessRuleProtection($true, $false)
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $user, "FullControl", "Allow")))
        $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            "BUILTIN\Administrators", "FullControl", "Allow")))
        Set-Acl -Path $Path -AclObject $acl
    }
    catch { }
}

function Ensure-StudioAccessToken {
    param([string]$Root)

    $envPath = Join-Path $Root ".env.local"
    $template = Join-Path $Root ".env.example"

    if (-not (Test-Path $envPath)) {
        if (Test-Path $template) {
            Copy-Item -Path $template -Destination $envPath -Force
            Write-Ok "Created .env.local from .env.example."
        }
        else {
            New-Item -Path $envPath -ItemType File -Force | Out-Null
            Write-Ok "Created empty .env.local."
        }
    }
    else {
        Write-Ok ".env.local already exists (credentials preserved)."
    }

    $current = Read-DotEnvValue -Path $envPath -Name "STUDIO_ACCESS_TOKEN"
    $token = ""

    if (-not [string]::IsNullOrWhiteSpace($StudioAccessToken)) {
        $token = $StudioAccessToken.Trim()
        Set-DotEnvValue -Path $envPath -Name "STUDIO_ACCESS_TOKEN" -Value $token
        Write-Ok "Applied the STUDIO_ACCESS_TOKEN you supplied."
    }
    elseif (-not [string]::IsNullOrWhiteSpace($current) -and -not $RotateToken) {
        $token = $current
        Write-Ok "STUDIO_ACCESS_TOKEN already set (kept)."
    }
    else {
        $token = New-RandomToken
        Set-DotEnvValue -Path $envPath -Name "STUDIO_ACCESS_TOKEN" -Value $token
        if ($RotateToken -and $current) { Write-Ok "Rotated STUDIO_ACCESS_TOKEN." }
        else { Write-Ok "Generated a new STUDIO_ACCESS_TOKEN." }
    }

    if ($token.Length -ge 12) {
        $masked = $token.Substring(0, 4) + "..." + $token.Substring($token.Length - 4)
    }
    else {
        $masked = "****"
    }
    Write-Detail "Value (masked): $masked"
    Write-Detail "Paste the full token into Studio -> Configuration -> Access token."

    # LiveKit Cloud credentials are needed for real sessions (Demo mode works without).
    $url = Read-DotEnvValue -Path $envPath -Name "LIVEKIT_URL"
    $key = Read-DotEnvValue -Path $envPath -Name "LIVEKIT_API_KEY"
    $secret = Read-DotEnvValue -Path $envPath -Name "LIVEKIT_API_SECRET"

    $placeholders = @("", "your-livekit-api-key", "your-livekit-api-secret")
    if ($placeholders -contains $key -or $placeholders -contains $secret -or [string]::IsNullOrWhiteSpace($url)) {
        Write-Warn "LiveKit Cloud credentials are not configured yet."
        Write-Detail "The Studio will run in Demo mode. For live voice, add to .env.local:"
        Write-Detail "  LIVEKIT_URL=wss://<project>.livekit.cloud"
        Write-Detail "  LIVEKIT_API_KEY=..."
        Write-Detail "  LIVEKIT_API_SECRET=..."
        Write-Detail "then run: uv run python -m backend.agent dev"
    }
    else {
        Write-Ok "LiveKit Cloud credentials detected."
    }

    return $token
}

# --------------------------------------------------------------------------------------
# Windows Firewall (Step 3)
# --------------------------------------------------------------------------------------
function Ensure-FirewallRule {
    param([int]$LocalPort, [string[]]$Profiles, $Cmdlet)

    $ruleName = "Wave 2.0 Studio (TCP $LocalPort)"

    if (-not (Test-IsWindows)) {
        Write-Warn "Not running on Windows - firewall step skipped."
        return $false
    }

    if (-not (Test-IsAdmin)) {
        Write-Warn "Administrator rights are required to change firewall rules."
        Write-Detail "Re-run this script from an elevated PowerShell window."
        return $false
    }

    $profileValue = ($Profiles -join ",")

    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        if (-not $Cmdlet -or $Cmdlet.ShouldProcess($ruleName, "Enable and refresh firewall rule")) {
            try {
                $existing | Set-NetFirewallRule -Enabled True -Action Allow -Profile $profileValue | Out-Null
                $existing | Get-NetFirewallPortFilter |
                    Set-NetFirewallPortFilter -Protocol TCP -LocalPort $LocalPort | Out-Null
                Write-Ok "Firewall rule already existed - refreshed for TCP $LocalPort."
                return $true
            }
            catch {
                Write-Warn "Could not refresh the existing rule: $($_.Exception.Message)"
            }
        }
        return $false
    }

    if (-not $Cmdlet -or $Cmdlet.ShouldProcess($ruleName, "Create inbound firewall rule for TCP $LocalPort")) {
        try {
            New-NetFirewallRule -DisplayName $ruleName `
                -Description "Wave 2.0 LiveKit Studio - public HTTPS publishing" `
                -Direction Inbound -Action Allow -Protocol TCP -LocalPort $LocalPort `
                -Profile $profileValue -Enabled True | Out-Null
            Write-Ok "Created inbound firewall rule: $ruleName"
            return $true
        }
        catch {
            Write-Err "Failed to create the firewall rule: $($_.Exception.Message)"
            Write-Detail "Manual equivalent (elevated PowerShell):"
            Write-CommandHint "New-NetFirewallRule -DisplayName ""$ruleName"" -Direction Inbound -Protocol TCP -LocalPort $LocalPort -Action Allow"
            return $false
        }
    }

    return $false
}

# --------------------------------------------------------------------------------------
# Router: UPnP IGD (best effort) + manual guidance (Step 2)
# --------------------------------------------------------------------------------------
function Get-UpnpService {
    $result = $null
    $udp = $null
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Client.ReceiveTimeout = 2500
        $udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)))

        $search = "M-SEARCH * HTTP/1.1`r`n" +
                  "HOST: 239.255.255.250:1900`r`n" +
                  "MAN: `"ssdp:discover`"`r`n" +
                  "MX: 2`r`n" +
                  "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1`r`n`r`n"
        $payload = [System.Text.Encoding]::ASCII.GetBytes($search)
        $target = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse("239.255.255.250"), 1900)
        $null = $udp.Send($payload, $payload.Length, $target)

        $deadline = (Get-Date).AddSeconds(4)
        $locations = New-Object System.Collections.Generic.List[string]

        while ((Get-Date) -lt $deadline -and $locations.Count -eq 0) {
            try {
                $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $data = $udp.Receive([ref]$remote)
                $text = [System.Text.Encoding]::ASCII.GetString($data)
                foreach ($line in ($text -split "`r`n")) {
                    if ($line -match '^\s*LOCATION:\s*(.+)$') {
                        $location = $Matches[1].Trim()
                        if (-not $locations.Contains($location)) { $locations.Add($location) }
                    }
                }
            }
            catch { break }
        }

        foreach ($location in $locations) {
            try {
                [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
                $xmlText = (Invoke-WebRequest -Uri $location -UseBasicParsing -TimeoutSec 5).Content
                [xml]$doc = $xmlText
                $services = $doc.GetElementsByTagName("service")
                foreach ($service in $services) {
                    $type = ""
                    $control = ""
                    foreach ($child in $service.ChildNodes) {
                        if ($child.Name -eq "serviceType") { $type = $child.InnerText }
                        if ($child.Name -eq "controlURL") { $control = $child.InnerText }
                    }
                    if ($type -match 'WANIPConnection|WANPPPConnection' -and $control) {
                        $base = [System.Uri]$location
                        $controlUri = ""
                        if ($control -match '^https?://') { $controlUri = $control }
                        else { $controlUri = (New-Object System.Uri($base, $control)).AbsoluteUri }
                        $result = @{
                            ControlUrl  = $controlUri
                            ServiceType = $type.Trim()
                            Location    = $location
                        }
                        return $result
                    }
                }
            }
            catch { }
        }
    }
    catch { }
    finally {
        if ($udp) { $udp.Close() }
    }
    return $result
}

function Invoke-UpnpAction {
    param(
        [hashtable]$Service,
        [string]$Action,
        [string]$BodyInner
    )

    $envelope = '<?xml version="1.0"?>' +
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
        's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
        "<u:${Action} xmlns:u=`"$($Service.ServiceType)`">" +
        $BodyInner +
        "</u:${Action}></s:Body></s:Envelope>"

    $headers = @{ SOAPAction = '"' + $Service.ServiceType + "#" + $Action + '"' }
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        return Invoke-WebRequest -Uri $Service.ControlUrl -Method Post -Body $envelope `
            -ContentType 'text/xml; charset="utf-8"' -Headers $headers -UseBasicParsing -TimeoutSec 8
    }
    catch {
        return $null
    }
}

function Get-UpnpExternalAddress {
    param([hashtable]$Service)
    $response = Invoke-UpnpAction -Service $Service -Action "GetExternalIPAddress" -BodyInner ""
    if (-not $response) { return "" }
    $match = [regex]::Match($response.Content, '<NewExternalIPAddress>(.*?)</NewExternalIPAddress>')
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return ""
}

function Add-UpnpPortMapping {
    param(
        [hashtable]$Service,
        [int]$ExternalPort,
        [string]$InternalAddress,
        [string]$Description
    )

    $body = "<NewRemoteHost></NewRemoteHost>" +
            "<NewExternalPort>${ExternalPort}</NewExternalPort>" +
            "<NewProtocol>TCP</NewProtocol>" +
            "<NewInternalPort>${ExternalPort}</NewInternalPort>" +
            "<NewInternalClient>${InternalAddress}</NewInternalClient>" +
            "<NewEnabled>1</NewEnabled>" +
            "<NewPortMappingDescription>${Description}</NewPortMappingDescription>" +
            "<NewLeaseDuration>0</NewLeaseDuration>"

    $response = Invoke-UpnpAction -Service $Service -Action "AddPortMapping" -BodyInner $body
    return ($null -ne $response)
}

function Show-RouterInstructions {
    param(
        [string]$InternalAddress,
        [string]$Gateway,
        [int]$ExternalPort,
        [string]$DhcpState
    )

    Write-Host ""
    Write-Host "      Router setup (manual):" -ForegroundColor Yellow
    Write-Detail "Router / gateway : $(if ($Gateway) { $Gateway } else { 'see ipconfig / Default Gateway' })"
    Write-Detail "Forward this PC  : $InternalAddress"
    Write-Detail "Rule to create   : TCP $ExternalPort (WAN) -> TCP $ExternalPort (LAN) -> $InternalAddress"
    Write-Host ""
    Write-Detail "1. Open the router admin page:"
    if ($Gateway) {
        Write-CommandHint "http://$Gateway"
    }
    else {
        Write-CommandHint "http://192.168.0.1   (or http://192.168.1.1)"
    }
    Write-Detail "2. Go to Port Forwarding / Virtual Server / NAT."
    Write-Detail "3. Create the rule shown above, protocol TCP, and save."
    Write-Detail "4. Reserve the LAN address so the rule keeps working after a reboot:"
    if ($DhcpState -eq "Enabled") {
        Write-Detail "   This PC uses DHCP. Add a DHCP reservation for $InternalAddress in the router."
    }
    else {
        Write-Detail "   This PC already has a manually assigned address ($DhcpState DHCP)."
    }
    Write-Host ""
}

function Invoke-RouterStep {
    param(
        [string]$InternalAddress,
        [string]$Gateway,
        [int]$ExternalPort,
        [string]$Mode,
        $Cmdlet
    )

    $dhcpState = Get-DhcpState -Address $InternalAddress
    Write-Info "This PC (LAN)     : $InternalAddress"
    if ($Gateway) { Write-Info "Default gateway   : $Gateway" }
    Write-Info "DHCP on this NIC  : $dhcpState"
    if ($dhcpState -eq "Enabled") {
        Write-Warn "DHCP is enabled - add a DHCP reservation in the router so the LAN IP is stable."
    }

    if ($Mode -eq "Skip") {
        Write-Info "Router step skipped (-RouterMode Skip)."
        return
    }

    if ($Mode -eq "Manual") {
        Show-RouterInstructions -InternalAddress $InternalAddress -Gateway $Gateway `
            -ExternalPort $ExternalPort -DhcpState $dhcpState
        return
    }

    Write-Info "Looking for a UPnP Internet Gateway on the network ..."
    $service = Get-UpnpService

    if (-not $service) {
        if ($Mode -eq "UPnP") {
            Write-Err "No UPnP gateway found. Enable UPnP on the router or use -RouterMode Manual."
        }
        else {
            Write-Warn "UPnP is not available on this router (or it is disabled)."
        }
        Show-RouterInstructions -InternalAddress $InternalAddress -Gateway $Gateway `
            -ExternalPort $ExternalPort -DhcpState $dhcpState
        return
    }

    Write-Ok "Found UPnP gateway service: $($service.ServiceType)"

    $routerWanIp = Get-UpnpExternalAddress -Service $service
    if ($routerWanIp) {
        Write-Info "Router WAN address: $routerWanIp"
        if (Test-IsPrivateAddress -Address $routerWanIp) {
            Write-Warn "The router's WAN address is a private/CGNAT range."
            Write-Detail "Your ISP shares one public IPv4, so port forwarding cannot work."
            Write-Detail "Use a tunnel instead: PUBLISH_IP.md section 6 (Cloudflare / ngrok / Tailscale)."
        }
        elseif ($routerWanIp -ne $PublicIp) {
            Write-Warn "Router WAN address differs from -PublicIp $PublicIp."
            Write-Detail "Your public IP may have changed (dynamic IP). Consider DDNS."
        }
        else {
            Write-Ok "Router WAN address matches $PublicIp."
        }
    }

    if (-not $Cmdlet -or $Cmdlet.ShouldProcess("$InternalAddress TCP $ExternalPort", "Create UPnP port mapping")) {
        $mapped = Add-UpnpPortMapping -Service $service -ExternalPort $ExternalPort `
            -InternalAddress $InternalAddress -Description "Wave 2.0 Studio"
        if ($mapped) {
            Write-Ok "Created UPnP mapping: TCP $ExternalPort -> $InternalAddress`:$ExternalPort"
        }
        else {
            Write-Warn "UPnP mapping failed (router may forbid it)."
            Show-RouterInstructions -InternalAddress $InternalAddress -Gateway $Gateway `
                -ExternalPort $ExternalPort -DhcpState $dhcpState
        }
    }
}

# --------------------------------------------------------------------------------------
# Launch + verify (Step 1c)
# --------------------------------------------------------------------------------------
function Start-Studio {
    param(
        [string]$Root,
        [string]$PythonPath,
        [string]$HostIp,
        [int]$ExternalPort
    )

    $arguments = @(
        "start.py",
        "--mode", "prod",
        "--https",
        "--host", $HostIp,
        "--yes",
        "--port", "$ExternalPort",
        "--no-open"
    )

    Write-Info "python start.py $($arguments[1..($arguments.Count - 1)] -join ' ')"
    Write-Host ""

    Push-Location $Root
    try {
        $process = Start-Process -FilePath $PythonPath -ArgumentList $arguments `
            -WorkingDirectory $Root -NoNewWindow -PassThru
    }
    finally {
        Pop-Location
    }
    return $process
}

function Wait-ForStudio {
    param([int]$ExternalPort, [int]$TimeoutSeconds = 90)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpsHealth -TargetHost "127.0.0.1" -TargetPort $ExternalPort -TimeoutSeconds 3) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Show-PublicationSummary {
    param(
        [string]$PublicIpAddress,
        [string]$InternalAddress,
        [int]$ExternalPort,
        [string]$Token,
        [bool]$FirewallOk,
        [bool]$HealthOk,
        [string]$OnlineIp
    )

    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host "   Summary" -ForegroundColor Cyan
    Write-Host "  ============================================================" -ForegroundColor DarkCyan

    Write-Host ""
    Write-Host "   Open in a browser:" -ForegroundColor White
    Write-Host "     Public : https://${PublicIpAddress}:${ExternalPort}" -ForegroundColor Green
    if ($InternalAddress) {
        Write-Host "     LAN    : https://${InternalAddress}:${ExternalPort}" -ForegroundColor Gray
    }
    Write-Host "     Local  : https://localhost:${ExternalPort}" -ForegroundColor Gray

    Write-Host ""
    Write-Host "   Checks:" -ForegroundColor White
    if ($HealthOk) { Write-Host "     Server        : healthy (/api/health)" -ForegroundColor Green }
    else { Write-Host "     Server        : NOT responding yet - check the log above" -ForegroundColor Yellow }

    if ($FirewallOk) { Write-Host "     Firewall      : inbound TCP $ExternalPort allowed" -ForegroundColor Green }
    else { Write-Host "     Firewall      : not configured (run elevated, or add the rule manually)" -ForegroundColor Yellow }

    if ($OnlineIp) {
        if ($OnlineIp -eq $PublicIpAddress) {
            Write-Host "     Public IP     : $OnlineIp (matches)" -ForegroundColor Green
        }
        else {
            Write-Host "     Public IP     : internet sees $OnlineIp, expected $PublicIpAddress" -ForegroundColor Yellow
            Write-Host "                     (dynamic IP or CGNAT - see PUBLISH_IP.md)" -ForegroundColor DarkGray
        }
    }

    if ($InternalAddress) {
        Write-Host "     Router        : forward TCP $ExternalPort -> $InternalAddress" -ForegroundColor Gray
        Write-Host "                     (a WAN address cannot be bound directly)" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "   Access token (paste into Studio -> Configuration -> Access token):" -ForegroundColor White
    Write-Host "     $Token" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Reminders:" -ForegroundColor White
    Write-Host "     - The certificate is self-signed: Advanced -> Proceed once per browser." -ForegroundColor DarkGray
    Write-Host "     - Mic access requires this HTTPS URL (plain http:// on an IP is blocked)." -ForegroundColor DarkGray
    Write-Host "     - Live voice needs LIVEKIT_* in .env.local plus a running agent worker." -ForegroundColor DarkGray
    Write-Host "     - Ctrl+C in this window stops the server." -ForegroundColor DarkGray
    Write-Host ""
}

# --------------------------------------------------------------------------------------
# Elevation
# --------------------------------------------------------------------------------------
function Invoke-ElevatedRelaunch {
    if (-not (Test-IsWindows)) { return $false }

    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }
    if (-not $scriptPath) { return $false }

    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add("-NoProfile")
    $parts.Add("-ExecutionPolicy"); $parts.Add("Bypass")
    $parts.Add("-File"); $parts.Add('"' + $scriptPath + '"')
    $parts.Add("-PublicIp"); $parts.Add('"' + $PublicIp + '"')
    $parts.Add("-Port"); $parts.Add("$Port")
    if ($LanIp) { $parts.Add("-LanIp"); $parts.Add('"' + $LanIp + '"') }
    $parts.Add("-RouterMode"); $parts.Add($RouterMode)
    if ($RotateToken) { $parts.Add("-RotateToken") }
    if ($SkipInstall) { $parts.Add("-SkipInstall") }
    if ($SkipFirewall) { $parts.Add("-SkipFirewall") }
    if ($NoLaunch) { $parts.Add("-NoLaunch") }
    $parts.Add("-FirewallProfile"); $parts.Add(($FirewallProfile -join ","))
    # The access token is not forwarded: it is already stored in .env.local, and a
    # secret on a command line would be visible to other users via process listing.
    $parts.Add("-ElevatedRun")

    $argumentLine = ($parts -join " ")
    Write-Info "Requesting administrator rights (UAC prompt) ..."

    try {
        $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentLine -Verb RunAs -PassThru
        $process.WaitForExit()
        return $true
    }
    catch {
        Write-Warn "Elevation was cancelled: $($_.Exception.Message)"
        Write-Detail "Continuing without firewall changes."
        return $false
    }
}

# ======================================================================================
# Main
# ======================================================================================
try {
    Write-Banner

    $isWindows = Test-IsWindows
    if (-not $isWindows) {
        Write-Warn "This script is written for Windows. Other platforms: use start.py + PUBLISH_IP.md."
    }

    $Root = Get-RepoRoot
    Write-Info "Repository: $Root"

    if (-not (Test-LauncherSupportsFlags -Root $Root)) {
        Write-Err "start.py in this checkout does not support --mode/--https yet."
        Write-Detail "Update the repository first:  git pull origin main"
        Write-Detail "The IP-publishing launcher is required for this script."
        if (-not $NoLaunch) { throw "Aborted: outdated start.py." }
    }

    Write-Step "Step 1/3  Prepare this PC (dependencies, .env.local, access token)"

    $PythonPath = Resolve-Python -Root $Root
    if (-not $PythonPath) {
        Write-Err "Python was not found on PATH."
        Write-Detail "Install Python 3.10+ from https://www.python.org/downloads/ (tick 'Add to PATH')."
        throw "Python missing."
    }
    Write-Ok "Python: $PythonPath"

    $node = Find-Command -Names @("node", "node.exe")
    if ($node) { Write-Ok "Node.js: $($node.Source)" }
    else { Write-Warn "Node.js not found (needed once to build dist/)." }

    Ensure-Dependencies -Root $Root | Out-Null
    $token = Ensure-StudioAccessToken -Root $Root

    $InternalAddress = Get-LanAddress
    if (-not $InternalAddress) {
        $InternalAddress = "this PC's LAN address (run ipconfig)"
        Write-Warn "Could not detect the LAN address automatically."
    }
    $Gateway = Get-DefaultGateway

    # ---- Step 2: router -------------------------------------------------------------
    Write-Step "Step 2/3  Router port forwarding (TCP $Port -> $InternalAddress)"
    Invoke-RouterStep -InternalAddress $InternalAddress -Gateway $Gateway `
        -ExternalPort $Port -Mode $RouterMode -Cmdlet $PSCmdlet

    # ---- Step 3: firewall -----------------------------------------------------------
    Write-Step "Step 3/3  Windows Firewall (inbound TCP $Port)"
    $firewallOk = $false

    if ($SkipFirewall) {
        Write-Info "Firewall step skipped (-SkipFirewall)."
    }
    elseif (Test-IsAdmin) {
        $firewallOk = Ensure-FirewallRule -LocalPort $Port -Profiles $FirewallProfile -Cmdlet $PSCmdlet
    }
    elseif (-not $isWindows -or $NoElevate -or $ElevatedRun) {
        Write-Warn "Not running as administrator - skipping the firewall rule."
        Write-Detail "Manual equivalent (elevated PowerShell):"
        Write-CommandHint "New-NetFirewallRule -DisplayName ""Wave 2.0 Studio (TCP $Port)"" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
    }
    else {
        Write-Warn "A firewall rule needs administrator rights."
        $answer = ""
        try { $answer = Read-Host "      Relaunch this script elevated now? [Y/n]" } catch { $answer = "n" }
        if ($answer -eq "" -or $answer -match '^(y|yes)$') {
            if (Invoke-ElevatedRelaunch) { return }
        }
        Write-Detail "Continuing without a firewall rule - the public port will stay closed."
    }

    # ---- Online public IP check -----------------------------------------------------
    Write-Info "Checking the public address the internet sees ..."
    $onlineIp = Get-PublicIpOnline
    if ($onlineIp) {
        if ($onlineIp -eq $PublicIp) { Write-Ok "Internet sees $onlineIp (matches -PublicIp)." }
        else {
            Write-Warn "Internet sees $onlineIp but -PublicIp is $PublicIp."
            Write-Detail "If the router WAN IP is also private (100.64.x.x / 10.x / 192.168.x), this is"
            Write-Detail "CGNAT and forwarding cannot work - use a tunnel (PUBLISH_IP.md section 6)."
            Write-Detail "Otherwise your ISP assigned a new address: re-run with -PublicIp $onlineIp."
        }
    }
    else {
        Write-Info "Could not reach an IP echo service (offline or blocked) - skipping."
    }

    # ---- Launch ---------------------------------------------------------------------
    if ($NoLaunch) {
        Write-Step "Done (dry run)"
        Write-Ok "-NoLaunch was specified, so the server was not started."
        Write-Detail "Start it with:"
        Write-CommandHint "python start.py --mode prod --https --host $PublicIp --yes --port $Port"
        if ($ElevatedRun) {
            try { $null = Read-Host "Press Enter to close" } catch { }
        }
        return
    }

    Write-Step "Starting the HTTPS server on port $Port"
    $process = Start-Studio -Root $Root -PythonPath $PythonPath -HostIp $PublicIp -ExternalPort $Port

    if (-not $process) { throw "The server process could not be started." }

    Write-Info "Waiting for /api/health (up to 90 seconds) ..."
    $healthOk = Wait-ForStudio -ExternalPort $Port -TimeoutSeconds 90

    if ($healthOk) { Write-Ok "Server is healthy on https://localhost:${Port}" }
    else { Write-Warn "The server did not answer /api/health yet. See the log above." }

    $lanOk = $false
    $publicOk = $false
    if ($healthOk -and $InternalAddress -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $lanOk = Test-HttpsHealth -TargetHost $InternalAddress -TargetPort $Port -TimeoutSeconds 4
        if ($lanOk) { Write-Ok "Reachable on the LAN: https://${InternalAddress}:${Port}" }
        else { Write-Warn "Not reachable at https://${InternalAddress}:${Port} (firewall or binding)." }

        $publicOk = Test-HttpsHealth -TargetHost $PublicIp -TargetPort $Port -TimeoutSeconds 6
        if ($publicOk) { Write-Ok "Reachable at the public address (NAT hairpin supported)." }
        else { Write-Info "Public check from inside the LAN often fails (no NAT loopback) - test from mobile data." }
    }

    Show-PublicationSummary -PublicIpAddress $PublicIp -InternalAddress $InternalAddress `
        -ExternalPort $Port -Token $token -FirewallOk $firewallOk -HealthOk $healthOk -OnlineIp $onlineIp

    Write-Host "  Server log (Ctrl+C stops the server):" -ForegroundColor DarkGray
    Write-Host ""

    if ($process.HasExited) {
        Write-Err "The server exited with code $($process.ExitCode)."
        Exit $process.ExitCode
    }

    $process.WaitForExit()
    Exit $process.ExitCode
}
catch {
    Write-Host ""
    Write-Err $_.Exception.Message
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Detail "Manual fallback (3 commands):"
    Write-CommandHint "New-NetFirewallRule -DisplayName ""Wave 2.0 Studio"" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
    Write-CommandHint "python start.py --mode prod --https --host $PublicIp --yes --port $Port"
    Write-CommandHint "Forward TCP $Port on the router to this PC's LAN address (see PUBLISH_IP.md)"
    Write-Host ""
    if ($ElevatedRun) {
        try { $null = Read-Host "Press Enter to close" } catch { }
    }
    Exit 1
}
