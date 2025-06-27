module.exports = {
  norpc: true,
  testCommand: 'npm run test',
  compileCommand: 'npm run compile',
  configureYulOptimizer: true,
  measureStatementCoverage: true,
  measureFunctionCoverage: true,
  measureBranchCoverage: true,
  skipFiles: [
      'constants',
      'errors',
      'interface',
      'structs',
      'utils',
      'Token.sol',
  ],
  istanbulFolder: './coverage',
  istanbulReporter: [
    'html',
    'text'
    ]
};
