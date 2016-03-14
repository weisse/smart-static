const fs = require("fs");
const zlib = require("zlib");
const uglifyjs = require("uglify-js");
const etag = require("etag");

module.exports = function(fileName){
	
	var object = {};
	var buffer = fs.readFileSync(fileName);
	var stat = fs.statSync(fileName);
	var bestSpeedBuffer = zlib.gzipSync(buffer,{level:zlib.Z_BEST_SPEED});
	var defCompressionBuffer = zlib.gzipSync(buffer,{level:zlib.Z_DEFAULT_COMPRESSION});
	var bestCompressionBuffer = zlib.gzipSync(buffer,{level:zlib.Z_BEST_COMPRESSION});
	
	object.SIZE = buffer.length;
	object.BEST_SPEED_SIZE = bestSpeedBuffer.length
	object.DEFAULT_COMPRESSION_SIZE = defCompressionBuffer.length;
	object.BEST_COMPRESSION_SIZE = bestCompressionBuffer.length;
	object.ETAG = etag(buffer);
	object.LAST_MODIFICATION_DATE = stat.mtime.toGMTString();
	
	return object;
	
};