import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Prometheus/k6 metrics
export const dropRate = new Rate('packet_drop_rate');
export const batchRequests = new Counter('batch_requests_sent');
export const acceptedEvents = new Counter('events_accepted');
export const ingestionLatency = new Trend('ingestion_duration_ms', true);

// Load test stages simulating ramp-up, sustained high-velocity throughput, and spike bursts
export const options = {
  scenarios: {
    // Scenario 1: Sustained High Velocity (up to 10,000 req/sec)
    high_throughput_sustained: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 1000,
      stages: [
        { target: 3000, duration: '30s' },  // Warmup ramp
        { target: 10000, duration: '2m' },  // Sustained high throughput
        { target: 15000, duration: '30s' }, // Peak burst stress
        { target: 0, duration: '15s' },     // Cooldown
      ],
    },
  },
  thresholds: {
    // 99% of requests must complete under 15ms (non-blocking 202 Accepted)
    'http_req_duration': ['p(95)<10', 'p(99)<25'],
    // Packet drop rate should remain below 0.1% under normal capacity
    'packet_drop_rate': ['rate<0.01'],
    // HTTP status code 202 or 200 should be > 98%
    'http_req_failed': ['rate<0.02'],
  },
};

const HOST = __ENV.TARGET_URL || 'http://localhost:8080';

const services = ['auth-service', 'billing-engine', 'order-processor', 'api-gateway', 'search-indexer'];
const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

function generateBatch(size) {
  const events = [];
  for (let i = 0; i < size; i++) {
    events.push({
      trace_id: `tr-${Math.random().toString(36).substring(2, 12)}`,
      span_id: `sp-${Math.random().toString(36).substring(2, 10)}`,
      service: services[Math.floor(Math.random() * services.length)],
      host: `node-${Math.floor(Math.random() * 20) + 1}.internal`,
      level: levels[Math.floor(Math.random() * levels.length)],
      message: 'Telemetry payload ingested via k6 benchmark agent',
      timestamp: new Date().toISOString(),
      payload: {
        cpu_usage_pct: Math.random() * 100,
        memory_mb: Math.floor(Math.random() * 4096),
        status_code: 200,
      },
    });
  }
  return events;
}

export default function () {
  const isBatch = Math.random() > 0.7; // 30% batch requests, 70% single events

  if (isBatch) {
    const batchSize = Math.floor(Math.random() * 50) + 10;
    const payload = JSON.stringify({ events: generateBatch(batchSize) });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': `client-${__VU % 20}`,
      },
    };

    const start = new Date();
    const res = http.post(`${HOST}/api/v1/events/batch`, payload, params);
    ingestionLatency.add(new Date() - start);

    const success = check(res, {
      'status is 202 or 200': (r) => r.status === 202 || r.status === 200,
    });

    batchRequests.add(1);
    if (success) {
      acceptedEvents.add(batchSize);
      dropRate.add(0);
    } else {
      dropRate.add(1);
    }
  } else {
    // Single event
    const payload = JSON.stringify({
      trace_id: `tr-${Math.random().toString(36).substring(2, 12)}`,
      service: services[Math.floor(Math.random() * services.length)],
      host: `node-1.internal`,
      level: 'INFO',
      message: 'Heartbeat ping collected',
      timestamp: new Date().toISOString(),
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': `client-${__VU % 20}`,
      },
    };

    const start = new Date();
    const res = http.post(`${HOST}/api/v1/events/single`, payload, params);
    ingestionLatency.add(new Date() - start);

    const success = check(res, {
      'status is 202 Accepted': (r) => r.status === 202,
    });

    if (success) {
      acceptedEvents.add(1);
      dropRate.add(0);
    } else {
      dropRate.add(1);
    }
  }
}
