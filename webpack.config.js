const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const nodeExternals = require('webpack-node-externals');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = ['index', 'debug'].map(name => ({
    entry: './src/' + name + '.ts',
    mode: name !== 'debug' ? 'production' : 'development',
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
        new CleanWebpackPlugin(),
    ],
    externals: [
        nodeExternals(),
    ]
}));
