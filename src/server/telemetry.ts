import os from 'node:os';

export interface Telemetry {
  osKernel: string;
  architecture: string;
  hostname: string;
  cpuLoadPercent: number;
  ramTotalMb: number;
  ramFreeMb: number;
}

/** Métricas reais da máquina onde o servidor roda. */
export function readTelemetry(): Telemetry {
  const cores = os.cpus().length || 1;
  const load1 = os.loadavg()[0]; // sempre 0 no Windows
  return {
    osKernel: `${os.type()} ${os.release()}`,
    architecture: `${os.platform()} / ${os.arch()}`,
    hostname: os.hostname(),
    cpuLoadPercent: Math.min(100, Math.round((load1 / cores) * 100)),
    ramTotalMb: Math.round(os.totalmem() / 1048576),
    ramFreeMb: Math.round(os.freemem() / 1048576),
  };
}
