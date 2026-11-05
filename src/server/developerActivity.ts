export interface DeveloperActivityEvent {
  id: number;
  timestamp: string;
  action: string;
  summary: string;
  locations: string[];
  status: 'in_progress' | 'completed';
}

const MAX_EVENTS = 300;
const MAX_LOCATIONS = 20;

export function createDeveloperActivityLog() {
  const events: DeveloperActivityEvent[] = [];
  let nextId = 1;

  function record(action: string, summary: string, locations: string[] = [], status: DeveloperActivityEvent['status'] = 'completed') {
    const id = nextId++;
    events.unshift({
      id,
      timestamp: new Date().toISOString(),
      action: action.slice(0, 40),
      summary: summary.slice(0, 240),
      locations: [...new Set(locations.filter(Boolean))].slice(0, MAX_LOCATIONS),
      status,
    });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    return id;
  }

  function complete(id: number | undefined, action: string, summary: string, locations: string[] = []) {
    if (id === undefined) return;
    const event = events.find((item) => item.id === id);
    if (!event) return;
    event.timestamp = new Date().toISOString();
    event.action = action.slice(0, 40);
    event.summary = summary.slice(0, 240);
    event.locations = [...new Set(locations.filter(Boolean))].slice(0, MAX_LOCATIONS);
    event.status = 'completed';
  }

  function snapshot() {
    return events.map((event) => ({ ...event, locations: [...event.locations] }));
  }

  return { record, complete, snapshot };
}
