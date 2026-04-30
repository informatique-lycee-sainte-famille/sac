// ./tests/performance/load_test.mjs
const target = process.env.LOAD_TEST_URL || "http://127.0.0.1:3000/";
const totalRequests = Number(process.env.LOAD_TEST_REQUESTS || 30);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 5);
const maxP95Ms = Number(process.env.LOAD_TEST_MAX_P95_MS || 1500);
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE || 0.1);

const timings = [];
let completed = 0;
let failed = 0;
let cursor = 0;

async function hit() {
  const startedAt = performance.now();
  try {
    const response = await fetch(target, { redirect: "manual" });
    if (response.status >= 500) failed += 1;
    await response.arrayBuffer();
  } catch {
    failed += 1;
  } finally {
    timings.push(performance.now() - startedAt);
    completed += 1;
  }
}

async function worker() {
  while (cursor < totalRequests) {
    cursor += 1;
    await hit();
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()));

const sorted = timings.toSorted((a, b) => a - b);
const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
const p95 = sorted[p95Index] || 0;
const errorRate = failed / Math.max(completed, 1);

console.log(JSON.stringify({
  target,
  completed,
  failed,
  errorRate,
  p95Ms: Math.round(p95),
  maxP95Ms,
}, null, 2));

if (errorRate > maxErrorRate) {
  throw new Error(`Load test error rate too high: ${errorRate}`);
}

if (p95 > maxP95Ms) {
  throw new Error(`Load test p95 too high: ${Math.round(p95)}ms > ${maxP95Ms}ms`);
}
