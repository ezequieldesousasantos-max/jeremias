export interface AccessEvent {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  status: number;
}

export interface AccessAlert {
  id: string;
  timestamp: string;
  severity: 'medium' | 'high';
  title: string;
  details: string;
  rule: string;
}

const MAX_EVENTS = 500;
const MAX_ALERTS = 100;
const ALERT_COOLDOWN_MS = 15 * 60_000;

export function createAccessMonitor() {
  const events: AccessEvent[] = [];
  const alerts: AccessAlert[] = [];
  const lastAlertByRule = new Map<string, number>();
  let nextId = 1;

  function alert(rule: string, title: string, details: string, severity: AccessAlert['severity'], now: number) {
    const lastAlert = lastAlertByRule.get(rule) ?? 0;
    if (now - lastAlert < ALERT_COOLDOWN_MS) return;
    lastAlertByRule.set(rule, now);
    alerts.unshift({
      id: `${rule}-${now}`,
      timestamp: new Date(now).toISOString(),
      severity,
      title,
      details,
      rule,
    });
    if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  }

  function record(input: Omit<AccessEvent, 'id' | 'timestamp'>, now = Date.now()) {
    const event: AccessEvent = {
      id: nextId++,
      timestamp: new Date(now).toISOString(),
      method: input.method.slice(0, 12),
      path: input.path.split('?')[0].slice(0, 160),
      status: input.status,
    };
    events.unshift(event);
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

    const recent = (predicate: (item: AccessEvent) => boolean, windowMs: number) =>
      events.filter((item) => now - Date.parse(item.timestamp) <= windowMs && predicate(item)).length;

    if (recent((item) => item.path === '/api/auth/login' && [401, 429].includes(item.status), 10 * 60_000) >= 5) {
      alert('repeated-login-failures', 'Falhas repetidas de login', 'Cinco ou mais tentativas de login falharam em até 10 minutos. Verifique se as tentativas são legítimas.', 'high', now);
    }

    if (recent((item) => item.status === 404, 2 * 60_000) >= 5) {
      alert('repeated-not-found', 'Muitas rotas não encontradas', 'Cinco ou mais requisições retornaram 404 em até 2 minutos. Revise os caminhos registrados para identificar acessos inesperados.', 'medium', now);
    }

    if (recent((item) => item.status === 401 && !item.path.startsWith('/api/auth/'), 5 * 60_000) >= 5) {
      alert('repeated-protected-denials', 'Acessos protegidos negados', 'Cinco ou mais requisições a rotas protegidas foram negadas em até 5 minutos.', 'medium', now);
    }

    if (recent((item) => item.status >= 500, 5 * 60_000) >= 3) {
      alert('repeated-server-errors', 'Erros repetidos no servidor', 'Três ou mais requisições retornaram erro 5xx em até 5 minutos. Verifique o estado do servidor.', 'high', now);
    }
  }

  function snapshot() {
    return { events: events.map((event) => ({ ...event })), alerts: alerts.map((item) => ({ ...item })) };
  }

  return { record, snapshot };
}
