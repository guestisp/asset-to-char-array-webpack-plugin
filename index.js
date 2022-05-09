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
        charNamePrefix: '_',
        addComments: true,
        serverCall: 'server.',
        addServerCalls: true,
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
        let constantCharName = this.options.charNamePrefix + localName_md5
        let constantLenName = this.options.charNamePrefix + localName_md5 + '_len'
        let contentType = mime.getType(file) || "text/plain"

        if (this.options.addComments)
          outputH.push("/* source: " + localName + " */")

        let {
          chars,
          len
        } = this.generateCharArray(file)

        outputH.push("const unsigned int " + constantLenName + ' = ' + len + ';')
        outputH.push("const char " + constantCharName + "[] = {\n " + chars + "\n};")

        if (this.options.addServerCalls) {
          const serverCall = this.options.serverCall

          if (this.options.addComments)
            outputCPP.push("/* source: " + localName + " */")

          outputCPP.push(serverCall + 'on("' + localName + '", [](AsyncWebServerRequest *request) {')

          if (/\.(gz|gzip)$/.test(localName))
            outputCPP.push('   request.sendHeader("Content-Encoding", "gzip");')

          outputCPP.push('   request.send_P(200, "' + contentType + '", ' + constantCharName + ');')
          outputCPP.push('});')
        }
      }) // end file scan forEach

      if (outputH.length) {
        fs.mkdirSync(path.dirname(this.options.output_H_filename), {
          recursive: true
        })
        fs.writeFileSync(this.options.output_H_filename, outputH.join("\n"));
      }

      if (outputCPP.length && this.options.addServerCalls) {
        fs.mkdirSync(path.dirname(this.options.output_CPP_filename), {
          recursive: true
        })
        fs.writeFileSync(this.options.output_CPP_filename, outputCPP.join("\n"));
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