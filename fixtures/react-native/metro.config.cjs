// A plain Metro configuration for the fixture: the repository root is watched so that the linked
// package and the shared smoke check resolve, and Babel runs with React Native's preset
// (babel.config.cjs) through Metro's own transformer.
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const metro = path.dirname(require.resolve('metro/package.json'))

module.exports = {
  projectRoot: __dirname,
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  },
  transformer: {
    babelTransformerPath: require.resolve('metro-babel-transformer', { paths: [metro] }),
  },
}
