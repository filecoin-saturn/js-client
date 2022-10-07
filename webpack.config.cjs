const path = require('path');

module.exports = {
  target: 'web',
  entry: './src/index.js',
  output: {
    filename: 'strn.min.js',
    path: path.resolve(__dirname),
  }
};