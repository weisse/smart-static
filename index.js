const fs = require("fs");
const p = require("path");
const zlib = require("zlib");

const _ = require("underscore");
const lru = require("lru-cache");
const bluebird = require("bluebird");
const accepts = require("accepts");
const compressible = require("compressible");
const mimeTypes = require("mime-types");
const etag = require("etag");
const uglifyjs = require("uglify-js");
const uglifycss = require("uglifycss");

const defaults = require(p.join(__dirname, "./defaults.json"));
const compressionLevels = [zlib.Z_BEST_SPEED, zlib.Z_DEFAULT_COMPRESSION, zlib.Z_BEST_COMPRESSION];

module.exports = function(path, options){

	if(!options) options = {};
	options = _.extend(defaults, options);

	var compressionLevel = compressionLevels[options["compression-level"]] || zlib.Z_DEFAULT_COMPRESSION;
	var basePath = p.resolve(process.cwd(), path);

	var cache = lru({

		length: function(element, key){
			return element.data.length;
		},
		max: options["max-cache-size"],
		maxAge: options["max-cache-age"]

	});

	var processFile = function(fileObj){

		return new bluebird.Promise(function(res, rej){

			fs.readFile(fileObj.absolutePath, function(err, buffer){
				if(err){
					rej(err);
				}else{
					fileObj.data = buffer;
					fileObj.contentLength = buffer.length;
					res(fileObj);
				}
			});

		}).then(function(fileObj){

			/*
			 * TODO: Minify where possible and requested
			 */
			if(options.minify && !fileObj.minified){
				switch(fileObj.extension){
					case ".js":
						try{
							var minified = uglifyjs.minify(fileObj.data.toString("utf8"), {
								mangle:options["minify-mangle"],
								fromString:true
							});
							fileObj.data = new Buffer(minified.code, "utf8");
						}catch(e){}
					break;
					case ".css":
						try{
							var minified = uglifycss.processString(fileObj.data.toString("utf8"));
							fileObj.data = new Buffer(minified, "utf8");
						}catch(e){}
					break;
					case ".json":
						try{
							var minified = JSON.stringify(JSON.parse(fileObj.data.toString("utf8")));
							fileObj.data = new Buffer(minified, "utf8");
						}catch(e){}
					break;
				}
			}

			return fileObj;

		}).then(function(fileObj){

			/*
			 * Compress using gzip
			 */
			if(options.compression && compressible(fileObj.contentType)){
				return new bluebird.Promise(function(res, rej){
					zlib.gzip(fileObj.data, {level:compressionLevel}, function(err, buffer){
						if(err){
							rej(err);
						}else{
							fileObj.compressed = true;
							fileObj.data = buffer;
							fileObj.contentLength = buffer.length;
							res(fileObj);
						}
					});
				});
			}

			return fileObj;

		}).then(function(fileObj){

			/*
			 * Generate etag with provided algorithm
			 */
			if(options.etag){
				fileObj.etag = etag(fileObj.data);
			}

			return fileObj;

		}).then(function(fileObj){

			/*
			 * Write in cache
			 */
			cache.set(fileObj.absolutePath, fileObj, options["max-cache-age"]);
			return fileObj;

		});

	};

	var middleware = function(req, res, next){

		var relativePath = req.path;
		var absolutePath = p.join(basePath, relativePath);

		new bluebird.Promise(function(res, rej){

			/*
			 * Get file stat object
			 */
			fs.stat(absolutePath, function(err, statObj){
				if(err){
					rej(err);
				}else{
					res(statObj);
				}
			});

		}).then(function(statObj){

			var fileObj = cache.get(absolutePath);

			/*
			 * Check cache
			 */
			if(fileObj){
				if(fileObj.stat.mtime - statObj.mtime >= 0){
					return fileObj;
				}
			}

			var ext = p.extname(absolutePath)

			fileObj = {
				stat: statObj,
				contentType: mimeTypes.contentType(ext),
				extension: ext,
				compressed: false,
				absolutePath: absolutePath,
				minified: p.basename(absolutePath).match(new RegExp("\.min" + ext, "gi"))
			};

			/*
			 * Process file
			 */
			return processFile(fileObj);

		}).then(function(fileObj){

			res.setHeader("Content-Type", fileObj.contentType);
			res.setHeader("Content-Length", fileObj.contentLength);

			if(options["browser-cache"]){
				res.setHeader(
					"Cache-Control",
					"max-age=" + options["browser-cache-max-age"] +
				 	", s-maxage=" + options["browser-cache-s-maxage"]
				);
			}else{
				res.setHeader("Cache-Control", "no-cache, must-revalidate, max-age=0, s-maxage=0");
			}

			if(options["last-modified"]){
					res.setHeader("Last-Modified", fileObj.stat.mtime.toGMTString());
					var ifModifiedSince = req.get("if-modified-since");
					if(ifModifiedSince === fileObj.stat.mtime.toString()){
						res.status(304);
						return;
					}
			}

			if(options["etag"]){
					res.setHeader("ETag", fileObj.etag);
					var ifNoneMatch = req.get("if-none-match");
			 		if(ifNoneMatch === fileObj.etag){
						res.status(304);
						return;
					}
			}

			if(options["compression"] && fileObj.compressed){
					var accept = accepts(req);
					var accepted = accept.encoding(["gzip"]);
					if(accepted){
						res.setHeader("Content-Encoding", "gzip");
						res.status(200).write(fileObj.data);
					}else{
						/*
						 * Fallback for legacy compatibility
						 */
						zlib.gunzip(fileObj.data, function(err, buffer){
								if(err){
									throw new Error(err);
								}else{
									res.status(200).write(buffer);
									res.setHeader("Content-Length", buffer.length);
								}
						});
					}
			}else{
				res.status(200).write(fileObj.data);
			}

		}).then(function(){

			if(options["continue"]) next();
			else res.end();

		}).catch(function(err){

			if(options["ignore-errors"]){
				res.status(404).end();
			}else{
				if(err.code === "ENOENT"){
					res.status(404).end();
				}else{
					console.error(err);
					res.status(500).end();
				}
			}

		});

	};

	if(options.prepareCache){
		return new bluebird.Promise(function(res, rej){
			var promises = [];
			var finder = require("findit")(basePath);
			finder.on("file", function(absolutePath, stat){

				var ext = p.extname(absolutePath);

				fileObj = {
					stat: stat,
					contentType: mimeTypes.contentType(ext),
					extension: ext,
					compressed: false,
					absolutePath: absolutePath,
					minified: p.basename(absolutePath).match(new RegExp("\.min" + ext, "gi"))
				};

				promises.push(processFile(fileObj));

			});
			finder.on("end", function(){
				Promise.all(promises).then(function(){
					res(middleware);
				});
			});
		});
	}

	return middleware;

};
