import { fileURLToPath } from 'node:url';
import { createTestSuite } from '@workflow/world-testing';

// Needs a Jazz sync server, a worker account and a running webhook registry;
// see "Self-hosting everything" in the README for the setup.
createTestSuite(fileURLToPath(new URL('../dist/index.js', import.meta.url)));
