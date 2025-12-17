import { beforeAll } from 'vitest';

beforeAll(async () => {
  try {
    const { getPresetConfig, initializeLogger } = await import('@kitiumai/logger');
    const config = getPresetConfig('development', {
      loki: {
        enabled: false,
        host: 'localhost',
        port: 3100,
        protocol: 'http',
        batchSize: 100,
        interval: 5000,
        timeout: 10000,
      },
      enableFileTransport: false,
    });

    initializeLogger(config);
  } catch {
    // Logger package is optional in unit tests.
  }
});
