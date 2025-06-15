const tsConfigPaths = require('tsconfig-paths');
const tsConfig = require('./tsconfig.json');

const baseUrl = './'; // Changed from './src' to './'
tsConfigPaths.register({
  baseUrl,
  paths: {
    '@modules/*': ['src/modules/*'],
    '@common/*': ['src/common/*'],
  },
});
