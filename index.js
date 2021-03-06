'use strict';

const path = require('path');
const fs = require('fs');
const mime = require('mime/lite');
const CryptoJS = require("crypto-js");

/*
 * replaceAll polyfill
 */
if (!String.prototype.replaceAll) {
	String.prototype.replaceAll = function(str, newStr){

		// If a regex pattern
		if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
			return this.replace(str, newStr);
		}

		// If a string
		return this.replace(new RegExp(str, 'g'), newStr);

	};
}

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
        chunkedResponse: true,
        useCache: true,
        namespace: 'Asset2CharArray',
        libraryHeader: 'ESPAsyncWebServer.h',
        useRegex: false,
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

  escapeRegex(regexString) {
    return regexString.replaceAll(/[.*+?^${}()|[\]\\\/]/g, '\\\\$&');
  }
  
  generateChunkedResponsePrototype(type) {
    return '         AsyncWebServerResponse *response = request->beginChunkedResponse("'+type+'", [](uint8_t *buffer, size_t maxLen, size_t alreadySent) -> size_t {\n'
  }
  generateBeginResponsePrototype(type, len) {
    return '         AsyncWebServerResponse *response = request->beginResponse("'+type+'", '+len+', [](uint8_t *buffer, size_t maxLen, size_t alreadySent) -> size_t {\n'
  }  
  generateResponseBody(char, len) {
    let str  = '           size_t ReadAmount = 0;\n'
        str += '\n'
        str += '           if ( ('+len+' - alreadySent) > maxLen ) {\n'
        str += '              ReadAmount = maxLen;\n'
        str += '           } else {\n'
        str += '              ReadAmount = '+len+' - alreadySent;\n'
        str += '           }\n'
        str += '           Serial.println("    sending "+String(ReadAmount)+" bytes from position "+String(alreadySent));\n'
        str += '\n'
        str += '           memcpy_P((char*)buffer, '+char+' + alreadySent, ReadAmount);\n'
        str += '\n'
        str += '           return ReadAmount;\n'
        str += '         });\n'

    return str
  }

  apply(compiler) {
    if (!this.options.enable ) {
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
    const done = (compilation) => {
      if (compilation.getStats().hasErrors()) {
        return
      }

      const outputH = []
      const outputCPP = []

      const files = this.getAllFiles(root);
      files.forEach(file => {
        let localName = this.fullPathToLocalPath(file)
        let localNameNoGz = localName.replace(/\.gz$/i,'')
        let localName_md5 = CryptoJS.MD5(localName).toString()
        let constantString = this.options.charNamePrefix + localName_md5
        let constantLen = this.options.charNamePrefix + localName_md5 + '_len'
        let contentType = mime.getType(file.replace(/\.gz$/i,'')) || "text/plain"
        let regex = '^' + this.escapeRegex(localNameNoGz)+'(\\\\.gz)?$'
        let uri = this.options.useRegex ? regex : localNameNoGz;

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

          outputCPP.push('      server->on("' + uri + '", [](AsyncWebServerRequest *request) {')

          if ( this.options.debug ) {
            let withChunkedResponse = this.options.chunkedResponse ? ' with chunked response.' : '.'
            outputCPP.push('         Serial.println("asset-to-char-array-webpack-plugin: serving \''+localName+'\' from PROGMEM' + withChunkedResponse + '");')
          }

          if ( this.options.chunkedResponse )
            outputCPP.push(this.generateChunkedResponsePrototype(contentType))
          else
            outputCPP.push(this.generateBeginResponsePrototype(contentType, constantLen))

          outputCPP.push(this.generateResponseBody(constantString, constantLen))

          if (/\.(gz|gzip)$/.test(localName))
            outputCPP.push('         response->addHeader("Content-Encoding", "gzip");')

          if ( this.options.useCache && ! /\/index\.htm[l]?/.test(localName) )
            outputCPP.push('         response->addHeader("Cache-Control", "max-age=31536000, immutable");')

          outputCPP.push('         request->send(response);')
          outputCPP.push('      });')
          outputCPP.push('')
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
      compiler.hooks.afterEmit.tap(plugin, done);
    } else {
      compiler.plugin('done', done);
    }
  }
};

module.exports = AssetToCharArrayPlugin;
