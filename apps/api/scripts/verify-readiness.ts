import { randomUUID } from 'node:crypto';

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const requestCount = Number(process.env.READINESS_REQUEST_COUNT ?? 30);

async function main(): Promise<void> {
  const durations: number[] = [];
  for (let index = 0; index < requestCount; index += 1) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/health/ready`, {
      headers: { 'X-Correlation-ID': `readiness-${randomUUID()}` },
    });
    const body = (await response.json()) as {
      status?: string;
      checks?: { oracle?: { status?: string } };
    };
    durations.push(performance.now() - started);
    if (!response.ok || body.status !== 'ok' || body.checks?.oracle?.status !== 'up')
      throw new Error(`Readiness request ${index + 1} failed with HTTP ${response.status}`);
  }
  const averageMs = durations.reduce((total, value) => total + value, 0) / durations.length;
  console.log(
    JSON.stringify({
      status: 'PASS',
      requestCount,
      averageDurationMs: Number(averageMs.toFixed(2)),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
