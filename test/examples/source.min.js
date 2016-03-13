const fs = require("fs");
const zlib = require("zlib");
const uglifyjs = require("uglify-js");
const etag = require("etag");

module.exports = function(){
	
	var object = {};
	var buffer = fs.readFileSync(__filename);
	var stat = fs.statSync(__filename);
	var bestSpeedBuffer = zlib.gzipSync(buffer,{level:zlib.Z_BEST_SPEED});
	var defCompressionBuffer = zlib.gzipSync(buffer,{level:zlib.Z_DEFAULT_COMPRESSION});
	var bestCompressionBuffer = zlib.gzipSync(buffer,{level:zlib.Z_BEST_COMPRESSION});
	var minimizedBuffer = new Buffer(uglifyjs.minify(buffer.toString("utf8"), {
		mangle:false,
		fromString:true
	}).code, "utf8");
	var minimizedMangledBuffer = new Buffer(uglifyjs.minify(buffer.toString("utf8"), {
		mangle:true,
		fromString:true
	}).code, "utf8");
	var bestBuffer = zlib.gzipSync(minimizedMangledBuffer,{level:zlib.Z_BEST_COMPRESSION});
	
	object.SIZE = buffer.length;
	object.BEST_SPEED_SIZE = bestSpeedBuffer.length
	object.DEFAULT_COMPRESSION_SIZE = defCompressionBuffer.length;
	object.BEST_COMPRESSION_SIZE = bestCompressionBuffer.length;
	object.MINIMIZED_SIZE = minimizedBuffer.length;
	object.MINIMIZED_MANGLED_SIZE = minimizedMangledBuffer.length;
	object.BEST_SIZE = bestBuffer.length;
	object.ETAG = etag(buffer);
	object.LAST_MODIFICATION_DATE = stat.mtime.toGMTString();
	
	return object;
	
}();