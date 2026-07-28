//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  target: 'web',
  mode: 'production',
  entry: './src/LandingPage/webview/main.tsx',
  output: {
    path: path.resolve(__dirname, 'src/LandingPage/content/dist'),
    filename: 'landingpage-preact.js'
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: 'ts-loader' },
      { test: /\.svg$/, loader: 'svg-inline-loader' }
    ]
  },
  devtool: false
};
