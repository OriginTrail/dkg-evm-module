module.exports = {
  norpc: true,
  testCommand: 'npm run test',
  compileCommand: 'npm run compile',
  configureYulOptimizer: true,
  skipFiles: [
      'constants',
      'errors',
      'interface',
      'structs',
      'utils',
      'Token.sol',
  ],
};
