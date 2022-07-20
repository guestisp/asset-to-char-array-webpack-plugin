# assets-to-char-arrays-webpack-plugin
Automatically create an include file with all asseted converted in char array to use with Arduino

Installation
============
Install the plugin with npm:
```shell
$ npm install asset-to-char-array-webpack-plugin mime path cryptojs --save-dev
```

Basic Usage
===========
Add the plugin to your webpack and config as follows:

```javascript
    const AssetToCharArrayPlugin = require('asset-to-char-array-webpack-plugin')
    const webpackConfig = {
        plugins: [
            new AssetToCharArrayPlugin({
                outputFilename: path.resolve(__dirname, '../../src/www/webapp.cpp')
            })
        ]
    };
```

Configuration
=============

You can pass an object of configuration options to `AssetToCharArrayPlugin`, with the following optional items:

 - `enable`: Set to `false` to disable the plugin execution without removing from webpack configuration. Default: `true`
 - `debug`: Add some Serial.println in webserver lambda function to debug which file is being served. Defaut: `true`
 - `charNamePrefix`: Prefix to use when generating the C/C++ const names. Default: `_`
 - `addComments`: Add a small comment with the file name before each const. Default: `true`,
 - `addServerCalls`: If true, the output file contains also the route mapping. Default: `true`,
 - `namespace`: Namespace to use for the function. Default: `Asset2CharArray`,
 - `chunkedResponse`: Use chunked responses when serving files. Default: `true`,
 - `useCache`: Force caching to max-age immutable
 - `libraryHeader`: Name of the webserver header file to include in the header file output. Default: `ESPAsyncWebServer.h`,
 - `webserverArgument`: Argument to pass to the lambda function. Pointer *MUST* be called `server`. Default: `AsyncWebServer *server`,
 - `output_H_filename`: Full path to the output file with C/C++ const chars. Default: `path.resolve(__dirname, 'webapp.h')`,
 - `output_CPP_filename`: Full path to the output file with C/C++ server calls. Default: `path.resolve(__dirname, 'webapp.cpp')`

# License

This project is licensed under [AGPL-3.0](https://github.com/guestisp/asset-to-char-array-webpack-plugin/blob/main/LICENSE).