const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = ['index', 'debug', 'jest'].map(name => ({
    entry: './src/' + name + '.ts',
    mode: name !== 'debug' ? 'production' : 'development',
    devtool: false,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    target: 'node',
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ],
    },
    output: {
        filename: name + '.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs2'
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                path.join(__dirname, 'package.json'),
                path.join(__dirname, 'README.md'),
            ],
        }),
    ],
    externals: [
        nodeExternals(),
    ]
}));
