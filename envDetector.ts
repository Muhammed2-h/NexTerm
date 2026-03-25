import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

export interface EnvironmentCapabilities {
  osDistro: string;
  kernelVersion: string;
  architecture: string;
  environmentType: 'docker' | 'lxc' | 'k8s' | 'sandbox' | 'baremetal' | 'vps' | 'unknown';
  isRoot: boolean;
  hasSystemd: boolean;
  canUseSystemctl: boolean;
  hasTunDevice: boolean;
  canRunTailscale: boolean;
  canRunDocker: boolean;
  canInstallPackages: boolean;
  canRunBackgroundDaemons: boolean;
  hasIptables: boolean;
  supportsSshClient: boolean;
  supportsSshServer: boolean;
  hasTmux: boolean;
  hasScreen: boolean;
  isEphemeral: boolean;
  isReadOnly: boolean;
  hasOutboundInternet: boolean;
  notes: string[];
}

export function detectEnvironment(): EnvironmentCapabilities {
  const caps: Partial<EnvironmentCapabilities> = {};
  const notes: string[] = [];

  // OS / Distro
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
    const prettyNameMatch = osRelease.match(/^PRETTY_NAME="(.*)"/m);
    caps.osDistro = prettyNameMatch ? prettyNameMatch[1] : os.type();
  } catch (e) {
    caps.osDistro = os.type();
  }

  caps.kernelVersion = os.release();
  caps.architecture = os.arch();
  caps.isRoot = process.getuid ? process.getuid() === 0 : false;

  // Environment Type
  let envType: EnvironmentCapabilities['environmentType'] = 'unknown';
  if (process.env.KUBERNETES_SERVICE_HOST) {
    envType = 'k8s';
  } else if (fs.existsSync('/.dockerenv')) {
    envType = 'docker';
  } else if (process.env.K_SERVICE || process.env.CLOUD_RUN_JOB) {
    envType = 'sandbox'; // Cloud Run
  } else {
    try {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf-8');
      if (cgroup.includes('docker')) envType = 'docker';
      else if (cgroup.includes('lxc')) envType = 'lxc';
    } catch (e) {}
  }
  
  if (envType === 'unknown') {
    try {
      const dmesg = execSync('dmesg | grep -i hypervisor 2>/dev/null', { stdio: 'pipe' }).toString();
      if (dmesg) envType = 'vps';
    } catch (e) {}
  }
  
  caps.environmentType = envType;

  // Systemd
  try {
    const exe = fs.readlinkSync('/proc/1/exe');
    caps.hasSystemd = exe.includes('systemd');
  } catch (e) {
    caps.hasSystemd = false;
  }

  try {
    execSync('systemctl --version 2>/dev/null', { stdio: 'pipe' });
    caps.canUseSystemctl = caps.hasSystemd;
  } catch (e) {
    caps.canUseSystemctl = false;
  }

  // TUN device
  caps.hasTunDevice = fs.existsSync('/dev/net/tun');
  caps.canRunTailscale = caps.hasTunDevice && caps.isRoot;

  // Docker
  try {
    execSync('docker --version 2>/dev/null', { stdio: 'pipe' });
    caps.canRunDocker = true;
  } catch (e) {
    caps.canRunDocker = false;
  }

  // Package managers
  const pkgManagers = ['apt-get', 'apk', 'yum', 'dnf', 'pacman'];
  caps.canInstallPackages = pkgManagers.some(pm => {
    try {
      execSync(`which ${pm} 2>/dev/null`, { stdio: 'pipe' });
      return true;
    } catch (e) {
      return false;
    }
  });

  // Iptables
  try {
    execSync('which iptables 2>/dev/null', { stdio: 'pipe' });
    caps.hasIptables = true;
  } catch (e) {
    caps.hasIptables = false;
  }

  // SSH
  try {
    execSync('which ssh 2>/dev/null', { stdio: 'pipe' });
    caps.supportsSshClient = true;
  } catch (e) {
    caps.supportsSshClient = false;
  }

  try {
    execSync('which sshd 2>/dev/null', { stdio: 'pipe' });
    caps.supportsSshServer = true;
  } catch (e) {
    caps.supportsSshServer = false;
  }

  // Tmux / Screen
  try {
    execSync('which tmux 2>/dev/null', { stdio: 'pipe' });
    caps.hasTmux = true;
  } catch (e) {
    caps.hasTmux = false;
  }

  try {
    execSync('which screen 2>/dev/null', { stdio: 'pipe' });
    caps.hasScreen = true;
  } catch (e) {
    caps.hasScreen = false;
  }

  // Ephemeral
  caps.isEphemeral = envType === 'sandbox' || !!process.env.K_SERVICE;

  // Read-only
  try {
    fs.writeFileSync('/tmp/.test-ro', 'test');
    fs.unlinkSync('/tmp/.test-ro');
    caps.isReadOnly = false;
  } catch (e) {
    caps.isReadOnly = true;
  }

  // Outbound Internet
  try {
    execSync('curl -s --connect-timeout 2 https://1.1.1.1 > /dev/null 2>&1', { stdio: 'pipe' });
    caps.hasOutboundInternet = true;
  } catch (e) {
    caps.hasOutboundInternet = false;
  }

  caps.canRunBackgroundDaemons = !caps.isEphemeral;

  if (caps.isEphemeral) {
    notes.push('Running in an ephemeral environment. Changes will be lost on restart.');
  }
  if (!caps.isRoot) {
    notes.push('Running as non-root user. Some administrative commands will fail.');
  }
  if (!caps.hasTunDevice) {
    notes.push('/dev/net/tun is not available. VPNs like Tailscale may not work.');
  }
  if (!caps.hasSystemd) {
    notes.push('systemd is not PID 1. Services must be started manually.');
  }

  caps.notes = notes;

  return caps as EnvironmentCapabilities;
}
