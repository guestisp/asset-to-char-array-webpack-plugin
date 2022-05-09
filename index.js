'use strict';

const path = require('path');
const fs = require('fs');
const mime = require('mime/lite');
const CryptoJS = require("crypto-js");

class AssetToCharArrayPlugin {
  options = {}

  constructor(options = {}) {
    this.options = {
      ...{
        enable: true,
        debug: true,
        charNamePrefix: '_',
        addComments: true,
        addServerCalls: true,
        namespace: 'Asset2CharArray',
        libraryHeader: 'ESPAsyncWebServer.h',
        webserverArgument: 'AsyncWebServer *server',
        output_H_filename: path.resolve(__dirname, 'webapp.h'),
        output_CPP_filename: path.resolve(__dirname, 'webapp.cpp')
      },
      ...options
    }
  }

  getAllFiles(root) {
    var res = [],
      files = fs.readdirSync(root);
    files.forEach((file) => {
      var pathname = root + '/' + file,
        stat = fs.lstatSync(pathname);

      if (!stat.isDirectory()) {
        res.push(pathname);
      } else {
        res = res.concat(this.getAllFiles(pathname));
      }
    });

    return res
  }

  fullPathToLocalPath(file) {
    return file.toString().replace(this.outputPath, '');
  }

  generateCharArray(file) {
    let fileStr = fs.readFileSync(file, 'binary');

    var arr1 = [];
    for (var n = 0, l = fileStr.length; n < l; n++) {
      var hex = Number(fileStr.charCodeAt(n)).toString(16);
      arr1.push("0x" + hex);
    }

    return {
      chars: arr1.join(', '),
      len: fileStr.length
    }

  }


  apply(compiler) {
    if (!compiler.options.enable ) {
      console.warn(
        'asset-to-char-array-webpack-plugin: plugin disabled. Ignoring...',
      );

      return;
    }

    if (!compiler.options.output || !compiler.options.output.path) {
      console.warn(
        'asset-to-char-array-webpack-plugin: options.output.path not defined. Plugin disabled...',
      );

      return;
    }
    this.outputPath = compiler.options.output.path;

    const root = this.outputPath;
    const done = (statsData) => {
      if (statsData.hasErrors()) {
        return
      }

      const outputH = []
      const outputCPP = []

      const files = this.getAllFiles(root);
      files.forEach(file => {
        let localName = this.fullPathToLocalPath(file)
        let localName_md5 = CryptoJS.MD5(localName).toString()
        let constantString = this.options.charNamePrefix + localName_md5
        let constantLen = this.options.charNamePrefix + localName_md5 + '_len'
        let contentType = mime.getType(file) || "text/plain"

        if (this.options.addComments)
          outputH.push("/* source: " + localName + " */")

        let {
          chars,
          len
        } = this.generateCharArray(file)

        outputH.push("const unsigned int " + constantLen + ' = ' + len + ';')
        outputH.push("const uint8_t  " + constantString + "[] PROGMEM = {\n " + chars + "\n};")



        if (this.options.addServerCalls) {
          if (this.options.addComments)
            outputCPP.push("      /* source: " + localName + " */")

          outputCPP.push('      server->on("' + localName + '", [](AsyncWebServerRequest *request) {')

          if ( this.options.debug )
            outputCPP.push('         Serial.println("asset-to-char-array-webpack-plugin: serving \''+localName+'\' statically from PROGMEM.");')

          outputCPP.push('         AsyncWebServerResponse *response = request->beginResponse_P(200, "' + contentType + '", ' + constantString + ', ' + constantLen+');');
          if (/\.(gz|gzip)$/.test(localName))
            outputCPP.push('         response.addHeader("Content-Encoding", "gzip");')

          outputCPP.push('         request->send(response);')
          outputCPP.push('      });')
        }
      }) // end file scan forEach

      if (outputH.length) {
        outputH.push("");
        outputH.push('namespace '+this.options.namespace+' {');
        outputH.push('   void initWebapp(' + this.options.webserverArgument + ');');
        outputH.push('}');

        fs.mkdirSync(path.dirname(this.options.output_H_filename), {
          recursive: true
        })
        fs.writeFileSync(this.options.output_H_filename, outputH.join("\n"));
      }

      if (outputCPP.length && this.options.addServerCalls) {
        let outputCPP_head = []
        let outputCPP_foot = []

        outputCPP_head.push('#include <'+this.options.libraryHeader+'>');
        outputCPP_head.push('#include "'+this.options.output_H_filename+'"');
        outputCPP_head.push();
        outputCPP_head.push('namespace '+this.options.namespace+' {');
        outputCPP_head.push('   void initWebapp(' + this.options.webserverArgument + ') {');

        outputCPP_foot.push("   }")
        outputCPP_foot.push("}")


        fs.mkdirSync(path.dirname(this.options.output_CPP_filename), {
          recursive: true
        })
        fs.writeFileSync(this.options.output_CPP_filename, outputCPP_head.join("\n") + "\n" +outputCPP.join("\n") + "\n" + outputCPP_foot.join("\n"));
      }
    }

    if (compiler.hooks) {
      const plugin = {
        name: "AssetToCharArrayPlugin"
      };
      compiler.hooks.done.tap(plugin, done);
    } else {
      compiler.plugin('done', done);
    }
  }
};

module.exports = AssetToCharArrayPlugin;
