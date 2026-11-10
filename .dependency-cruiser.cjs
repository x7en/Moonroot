/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-must-be-self-contained',
      severity: 'error',
      comment:
        'core/ imports nothing outside core/ (no UI, storage, platform, Node builtins, or third-party packages).',
      from: { path: '^core/' },
      to: { pathNot: '^core/' },
    },
    {
      name: 'core-model-must-be-leaf',
      severity: 'error',
      comment: 'core/model/ defines shared contract types and catalogues without depending on other core modules.',
      from: { path: '^core/model/' },
      to: { path: '^core/(?!model/)' },
    },
    {
      name: 'triage-thresholds-stay-in-core-triage',
      severity: 'error',
      comment: 'Triage thresholds and rules live only in core/triage.',
      from: { pathNot: '^core/triage/' },
      to: { path: '^core/triage/thresholds\\.ts$' },
    },
    {
      name: 'data-only-depends-on-data-and-core',
      severity: 'error',
      from: { path: '^data/' },
      to: { path: '^(app|ui|platform)/' },
    },
    {
      name: 'app-does-not-depend-on-ui',
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '^ui/' },
    },
    {
      name: 'ui-does-not-import-data-directly',
      severity: 'error',
      from: { path: '^ui/' },
      to: { path: '^data/' },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'dist-core'],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
