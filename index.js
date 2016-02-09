const fs = require("fs");
const p = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const buffer = require("buffer");

const _ = require("underscore");
const lru = require("lru-cache");
const bluebird = require("bluebird");
const accepts = require("accepts");
const compressible = require("compressible");
const mimeTypes = require("mime-types");

const defaults = require(p.join(__dirname, "./defaults.json"));

module.exports = function(path, options){

	if(!options) options = {};
	options = _.extend(defaults, options);

	var cache = lru({

		length: function(element, key){
			return element.data.length;
		},
		max: options["max-cache-size"],
		maxAge: options["max-cache-age"]

	});

	var basePath = p.resolve(process.cwd(), path);

	return function(req, res, next){

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

			fileObj = {
				stat: statObj,
				contentType: mimeTypes.contentType(p.extname(absolutePath)),
				compressed: false
			};

			/*
			 * Read file
			 */
			return new bluebird.Promise(function(res, rej){

				fs.readFile(absolutePath, function(err, data){
					if(err){
						rej(err);
					}else{
						fileObj.data = data;
						res(fileObj);
					}
				});

			}).then(function(fileObj){

				/*
				 * Minify where possible and requested
				 */
				if(options.minify){
					return fileObj;
				}else{
					return fileObj;
				}

			}).then(function(fileObj){

				/*
				 * Compress using gzip
				 */
				if(options.compression && compressible(fileObj.contentType)){
						return new bluebird.Promise(function(res, rej){
							zlib.gzip(fileObj.data, function(err, buffer){
								if(err){
									rej(err);
								}else{
									fileObj.compressed = true;
									fileObj.data = buffer;
									res(fileObj);
								}
							});
						});
					}
				}

				return fileObj;

			}).then(function(fileObj){

				/*
				 * Generate etag with provided algorithm
				 */
				if(options.etag){
					fileObj.etag = crypto.createHash(options["hash-algorithm"]).update(fileObj.data).digest("hex");
				}

				return fileObj;

			}).then(function(fileObj){

				/*
				 * Write in cache
				 */
				cache.set(absolutePath, fileObj, options["max-cache-age"]);
				return fileObj;

			});

		}).then(function(fileObj){

			res.setHeader("Content-Type", fileObj.contentType);
			res.setHeader("ETag", fileObj.etag);
			res.setHeader("Last-Modified", fileObj.stat.mtime.toGMTString());

			var ifModifiedSince = req.get("if-modified-since");

			if(options["if-modified-since"] && ifModifiedSince === fileObj.stat.mtime.toString()){
					res.status(304);
					return;
			}

			var ifNoneMatch = req.get("if-none-match");

			if(options["etag"] && ifNoneMatch === fileObj.etag){
					res.status(304);
					return;
			}

			if(options["compression"] && fileObj.compressed){
					var accept = accepts(req);
					var accepted = accept.encoding(["gzip"]);
					if(accepted){
						res.setHeader("Content-Encoding", "gzip");
						res.status(200).write(fileObj.data);
					}else{
						/*
						 * Fallback for compatibility
						 */
						zlib.gunzip(fileObj.data, function(err, buffer){
								if(err) throw new Error(err);
								else res.status(200).write(buffer);
						});
					}
				}
			}else{
				res.status(200).write(fileObj.data);
			}

		}).then(function(){

			if(options["continue"]) next();
			else res.end();

		});

	};

};
