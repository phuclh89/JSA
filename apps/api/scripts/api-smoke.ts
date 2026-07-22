import { createApplication } from '../src/main';

async function request(
  url: string,
  correlationId: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  correlationId: string | null;
  body: Record<string, unknown>;
  durationMs: number;
}> {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { 'X-Correlation-ID': correlationId, ...headers },
  });
  return {
    status: response.status,
    correlationId: response.headers.get('X-Correlation-ID'),
    body: (await response.json()) as Record<string, unknown>,
    durationMs: performance.now() - started,
  };
}

async function main(): Promise<void> {
  const app = await createApplication();
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const combined = await request(`${baseUrl}/health`, 'phase0a-health');
    const live = await request(`${baseUrl}/health/live`, 'phase0a-live');
    const ready = await request(`${baseUrl}/health/ready`, 'phase0a-ready');
    const configuredSmokeUser = process.env.PHASE1_SMOKE_USER?.trim();
    const authMe = await request(`${baseUrl}/auth/me`, 'phase1-auth-me', {
      'X-Dev-User': configuredSmokeUser || '__phase1_unregistered_probe__',
    });
    const authCode = (authMe.body.error as { code?: string } | undefined)?.code;
    if (configuredSmokeUser) {
      const userId = authMe.body.userId;
      if (authMe.status !== 200 || typeof userId !== 'string' || !/^\d+$/.test(userId))
        throw new Error('Authenticated Phase 1 user-context smoke failed');
    } else if (authMe.status !== 403 || authCode !== 'APPLICATION_USER_NOT_REGISTERED') {
      throw new Error('Unregistered Phase 1 identity was not denied safely');
    }
    const repeated: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const result = await request(`${baseUrl}/health/ready`, `phase0a-repeat-${index + 1}`);
      const checks = result.body.checks as { oracle?: { status?: string } } | undefined;
      if (result.status !== 200 || checks?.oracle?.status !== 'up')
        throw new Error(`Repeated readiness request ${index + 1} failed`);
      repeated.push(result.durationMs);
    }
    for (const [name, result] of Object.entries({ health: combined, live, ready })) {
      if (result.status !== 200 || result.correlationId !== `phase0a-${name}`)
        throw new Error(`${name} endpoint failed its HTTP or correlation check`);
    }
    console.log(
      JSON.stringify({
        status: 'PASS',
        health: combined.body,
        live: live.body,
        ready: ready.body,
        authMe: {
          status: authMe.status,
          mode: configuredSmokeUser ? 'registered_user' : 'unregistered_probe',
        },
        repeatedReadiness: {
          count: repeated.length,
          averageDurationMs: Number(
            (repeated.reduce((a, b) => a + b, 0) / repeated.length).toFixed(2),
          ),
        },
      }),
    );
  } finally {
    await app.close();
    console.log(JSON.stringify({ gracefulShutdown: 'PASS', poolCloseHook: 'completed' }));
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exitCode = 1;
});
