import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface SystemMonitorSnapshot {
  sampledAt: string;
  cpu: { model: string; logicalCores: number; speedMhz: number; usagePercent: number | null };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number };
  storage: { path: string; totalBytes: number; freeBytes: number; usagePercent: number } | { path: string; error: string };
  network: { interfaces: { name: string; addresses: string[] }[] };
  internet: { connected: boolean; latencyMs: number | null; checkedAt: string; detail: string };
}

type InternetProbe = () => Promise<{ status: number }>;

const INTERNET_CHECK_INTERVAL_MS = 15_000;
const INTERNET_CHECK_TIMEOUT_MS = 3_000;

function cpuTimes() {
  return os.cpus().map(({ times }) => ({ idle: times.idle, total: times.user + times.nice + times.sys + times.idle + times.irq }));
}

export function createSystemMonitor(checkInternet: InternetProbe = async () => {
  const response = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
    signal: AbortSignal.timeout(INTERNET_CHECK_TIMEOUT_MS),
    redirect: 'manual',
  });
  await response.body?.cancel();
  return { status: response.status };
}) {
  let previousCpuTimes = cpuTimes();
  let internetCache: SystemMonitorSnapshot['internet'] | null = null;
  let lastInternetCheck = 0;
  let internetCheck: Promise<void> | null = null;

  const refreshInternet = async () => {
    if (internetCheck) return internetCheck;
    internetCheck = (async () => {
      const checkedAt = new Date();
      const started = Date.now();
      try {
        const { status } = await checkInternet();
        const reachable = status >= 200 && status < 400;
        internetCache = {
          connected: status === 204,
          latencyMs: Date.now() - started,
          checkedAt: checkedAt.toISOString(),
          detail: status === 204
            ? 'Internet acessível; verificação respondeu HTTP 204.'
            : reachable
              ? `Serviço externo acessível, mas respondeu HTTP ${status} (possível portal de acesso).`
              : `O serviço externo respondeu HTTP ${status}.`,
        };
        if (status >= 400) internetCache.connected = false;
      } catch (error) {
        internetCache = {
          connected: false,
          latencyMs: null,
          checkedAt: checkedAt.toISOString(),
          detail: error instanceof Error && error.name === 'TimeoutError'
            ? 'Tempo limite de 3 segundos excedido.'
            : 'Não foi possível alcançar o serviço de verificação.',
        };
      } finally {
        lastInternetCheck = Date.now();
        internetCheck = null;
      }
    })();
    return internetCheck;
  };

  return async (): Promise<SystemMonitorSnapshot> => {
    const now = new Date();
    const currentCpuTimes = cpuTimes();
    let usagePercent: number | null = null;
    if (previousCpuTimes.length === currentCpuTimes.length) {
      let totalDelta = 0;
      let idleDelta = 0;
      currentCpuTimes.forEach((current, index) => {
        const previous = previousCpuTimes[index];
        totalDelta += current.total - previous.total;
        idleDelta += current.idle - previous.idle;
      });
      if (totalDelta > 0) usagePercent = Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
    }
    previousCpuTimes = currentCpuTimes;

    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const storagePath = path.parse(process.cwd()).root || os.homedir();
    let storage: SystemMonitorSnapshot['storage'];
    try {
      const stats = await fs.statfs(storagePath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      storage = { path: storagePath, totalBytes: total, freeBytes: free, usagePercent: total ? Math.round(((total - free) / total) * 100) : 0 };
    } catch (error) {
      storage = { path: storagePath, error: error instanceof Error ? error.message : String(error) };
    }

    if (!internetCache || Date.now() - lastInternetCheck >= INTERNET_CHECK_INTERVAL_MS) {
      await refreshInternet();
    }

    const cpus = os.cpus();
    const addresses = Object.entries(os.networkInterfaces())
      .flatMap(([name, addresses]) => (addresses ?? [])
        .filter((address) => !address.internal)
        .map((address) => ({ name, family: address.family })));
    const interfaces = [...new Set(addresses.map((address) => address.name))]
      .map((name) => ({
        name,
        addresses: [...new Set(addresses.filter((address) => address.name === name).map((address) => address.family))],
      }));

    return {
      sampledAt: now.toISOString(),
      cpu: {
        model: cpus[0]?.model?.trim() || 'Desconhecido',
        logicalCores: cpus.length,
        speedMhz: cpus[0]?.speed || 0,
        usagePercent,
      },
      memory: {
        totalBytes,
        usedBytes: totalBytes - freeBytes,
        freeBytes,
        usagePercent: totalBytes ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0,
      },
      storage,
      network: { interfaces },
      internet: internetCache!,
    };
  };
}
