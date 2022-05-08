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
        charNamePrefix: 'asset_to_char_plugin_',
        addComments: true,
        serverObject: 'server',
        addServerCalls: true,
        outputFilename: path.resolve(__dirname, 'webapp.cpp')
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
    let fileStr = fs.readFileSync(file, 'utf8');

    var arr1 = [];
    for (var n = 0, l = fileStr.length; n < l; n++) {
      var hex = Number(fileStr.charCodeAt(n)).toString(16);
      arr1.push("0x" + hex);
    }

    return {
      chars: arr1.join(','),
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

      const output = []

      const files = this.getAllFiles(root);
      files.forEach(file => {
        let localName = this.fullPathToLocalPath(file)
        let localName_md5 = CryptoJS.MD5(localName).toString()
        let constantCharName = this.options.charNamePrefix + localName_md5
        let constantLenName = this.options.charNamePrefix + localName_md5 + '_len'
        let contentType = mime.getType(file)

        if (this.options.addComments)
          output.push("/* source: " + localName + " */")

        let {
          chars,
          len
        } = this.generateCharArray(file)

        output.push("unsigned char " + constantLenName + ' = ' + len + ';')
        output.push("unsigned int " + constantCharName + '[] = {' + chars + '};')

        if (this.options.addServerCalls) {
          const serverObject = this.options.serverObject
          output.push(serverObject + '.on("' + localName + '", []() {')

          if ( /\.(gz|gzip)$/.test(localName) )
            output.push('   ' + serverObject + '.sendHeader("Content-Encoding", "gzip");')

          output.push('   ' + serverObject + '.send_P(200, "' + contentType + '", ' + constantCharName + ', ' + constantLenName + ');')
          output.push('});')
        }
      })

      console.log('Scrivo su ', this.options.outputFilename)

      fs.mkdirSync(path.dirname(this.options.outputFilename), {recursive:true})
      fs.writeFileSync(this.options.outputFilename, output.join("\n"));
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