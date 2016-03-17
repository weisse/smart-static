const fs = require("fs");
const p = require("path");
const zlib = require("zlib");

const _ = require("lodash");
const lru = require("lru-cache");
const bluebird = require("bluebird");
const accepts = require("accepts");
const compressible = require("compressible");
const mimeTypes = require("mime-types");
const etag = require("etag");
const uglifyjs = require("uglify-js");
const uglifycss = require("uglifycss");
const numeraljs = require("numeraljs");
const LESS = require("less");
const CoffeeScript = require("coffee-script");
const CSON = require("cson");
const YAML = require("yamljs");

const compilable = [".less", ".coffee", ".cson", ".yml"];
const defaults = require(p.join(__dirname, "./defaults.json"));
const compressionLevels = [zlib.Z_BEST_SPEED, zlib.Z_DEFAULT_COMPRESSION, zlib.Z_BEST_COMPRESSION];

module.exports = function(path, options){

	if(!options) options = {};
	options = _.extend(defaults, options);
	options.compile = _.intersection(compilable, options.compile);

	const basePath = p.resolve(process.cwd(), path);

	const cache = lru({

		length: function(element, key){
			return element.data.length;
		},
		max: numeraljs().unformat(options["max-cache-size"]),
		maxAge: options["max-cache-age"]

	});
	
	const checkStringMatch = function(fileName, absolutePath, stringArray){
		
		for(var i = 0; i < stringArray.length; i++){
			var string = stringArray[i];
			if(fileName === string){
				return true;
			}else{
				/*
				 * Absolutize path to ignore
				 */
				var stringPath = p.join(basePath, string);
				if(absolutePath === stringPath){
					return true;
				}else{
					/*
					 * Maybe the path points on a directory
					 */
					if(!_.endsWith(stringPath, "/")){
						stringPath = stringPath + "/";
					}
					if(_.startsWith((p.dirname(absolutePath) + "/"), stringPath)){
						return true;
					}
				}
			}
		}
		
		return false;
		
	};

	const checkRegExpMatch = function(fileName, regExpArray){
		
		for(var i = 0; i < regExpArray.length; i++){
			var regexp = regExpArray[i];
			if(_.isString(regexp)){
				regexp = new RegExp(regexp);
			}
			if(fileName.match(regexp)){
				return true;
			}
		}
		
		return false;
		
	};
	
	const ignore = function(fileObj){
		
		/*
		 * Check whether to ignore
		 */
		var absolutePath = fileObj.absolutePath;
		var fileName = fileObj.fileName;

		if(checkStringMatch(fileName, absolutePath, options.ignore)){
			throw {code:"IGNORE"};
		}

		if(checkRegExpMatch(fileName, options.ignoreRegExp)){
			throw {code:"IGNORE"};
		}

		return fileObj;
		
	};
	
	const dotfiles = function(fileObj){
		
		/*
		 * Check .dotfiles
		 */
		if(fileObj.fileName.substring(0, 1) === "."){
			if(options["hide-dotfiles"]){
				throw {code:"IGNORE"};
			}
		}

		return fileObj;
		
	};
	
	const fetch = function(fileObj){
		
		/*
		 * Read file from fs
		 */
		return new bluebird.Promise(function(res, rej){

			var path = fileObj.absolutePath;

			fs.open(path, "r", function(err, fd){
				if(err){
					rej(err);
				}else{
					fs.readFile(path, function(err, buffer){
						fs.close(fd);
						if(err){
							rej(err);
						}else{
							fileObj.data = buffer;
							fileObj.contentLength = buffer.length;
							res(fileObj);
						}
					});
				}
			});

		});
		
	};
	
	const download = function(fileObj){
		
		/*
		 * Check whether to ignore
		 */
		var absolutePath = fileObj.absolutePath;
		var fileName = fileObj.fileName;

		if(checkStringMatch(fileName, absolutePath, options.download)){
			fileObj.download = true;
		}else if(checkRegExpMatch(fileName, options.downloadRegExp)){
			fileObj.download = true;
		}
		
		return fileObj;
		
	};
	
	const compile = function(fileObj){
		
		/*
		 * Compile where possible and requested
		 */
		if(_.indexOf(options.compile, fileObj.extension) > -1){
			switch(fileObj.extension){
				case ".less":
					return new bluebird.Promise(function(res, rej){
						LESS.render(fileObj.data.toString("utf8"), {
							filename: fileObj.absolutePath
						}, function(err, output){
							if(err){
								rej(err);
							}else{									
								fileObj.data = new Buffer(output.css, "utf8");
								fileObj.contentLength = fileObj.length;
								fileObj.extension = ".css";
								fileObj.contentType = mimeTypes.contentType(fileObj.extension);
								res(fileObj);
							}
						});
					});
				break;
				case ".coffee":
					fileObj.data = new Buffer(CoffeeScript.compile(fileObj.data.toString("utf8")), "utf8");
					fileObj.contentLength = fileObj.data.length;
					fileObj.extension = ".js";
					fileObj.contentType = mimeTypes.contentType(fileObj.extension);
				break;
				case ".cson":
					fileObj.data = new Buffer(JSON.stringify(CSON.parse(fileObj.data.toString("utf8"))), "utf8");
					fileObj.contentLength = fileObj.data.length;
					fileObj.extension = ".json";
					fileObj.contentType = mimeTypes.contentType(fileObj.extension);
					fileObj.minified = true;
				break;
				case ".yml":
					fileObj.data = new Buffer(JSON.stringify(YAML.parse(fileObj.data.toString("utf8"))), "utf8");
					fileObj.contentLength = fileObj.data.length;
					fileObj.extension = ".json";
					fileObj.contentType = mimeTypes.contentType(fileObj.extension);
					fileObj.minified = true;
				break;
			}
		}
		
		return fileObj;
		
	};
	
	const minify = function(fileObj){
		
		/*
		 * Minify where possible and requested
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
						fileObj.contentLength = fileObj.data.length;
						fileObj.minified = true;
					}catch(e){}
				break;
				case ".css":
					try{
						var minified = uglifycss.processString(fileObj.data.toString("utf8"));
						fileObj.data = new Buffer(minified, "utf8");
						fileObj.contentLength = fileObj.data.length;
						fileObj.minified = true;
					}catch(e){}
				break;
				case ".json":
					try{
						var minified = JSON.stringify(JSON.parse(fileObj.data.toString("utf8")));
						fileObj.data = new Buffer(minified, "utf8");
						fileObj.contentLength = fileObj.data.length;
						fileObj.minified = true;
					}catch(e){}
				break;
			}
		}

		return fileObj;
		
	};
	
	const compress = function(fileObj){

		/*
		 * Compress using gzip
		 */
		if(options.compression && compressible(fileObj.contentType)){
			return new bluebird.Promise(function(res, rej){
				var compressionLevel = compressionLevels[options["compression-level"]] || zlib.Z_DEFAULT_COMPRESSION;
				zlib.gzip(fileObj.data, {level:compressionLevel}, function(err, buffer){
					if(err){
						rej(err);
					}else{
						fileObj.data = buffer;
						fileObj.contentLength = buffer.length;
						fileObj.compressed = true;
						res(fileObj);
					}
				});
			});
		}

		return fileObj;
		
	};
	
	const tag = function(fileObj){
		
		/*
		 * Generate etag
		 */
		if(options.etag){
			fileObj.etag = etag(fileObj.data);
		}

		return fileObj;
		
	};
	
	const store = function(fileObj){
		
		/*
		 * Write in cache
		 */
		cache.set(fileObj.absolutePath, fileObj, options["max-cache-age"]);
		return fileObj;
		
	};

	/*
	 * Where we will store our indexes path
	 */
	const indexMap = {};

	const processFile = function(fileObj){

		return new bluebird.Promise.resolve(fileObj)
			.then(ignore)
			.then(dotfiles)
			.then(fetch)
			.then(download)
			.then(function(fileObj){
				if(fileObj.download){
					return new bluebird.Promise.resolve(fileObj)
						.then(store);
				}else{
					return new bluebird.Promise.resolve(fileObj)
						.then(compile)
						.then(minify)
						.then(compress)
						.then(tag)
						.then(store);
				}
			});
		
	};

	const middleware = function(req, res, next){

		var relativePath = req.path;
		var absolutePath = p.join(basePath, relativePath);

		new bluebird.Promise(function(res, rej){

			/*
			 * Get file stat object
			 */
			fs.stat(absolutePath, function(err, statObj){
				if(err){
					rej(err);
				}else if(statObj.isFile()){
					res(statObj);
				}else if(statObj.isDirectory()){
					new bluebird.Promise(function(mapRes, mapRej){
						var entry = indexMap[absolutePath];
						if(entry){
							fs.stat(entry, function(err, mapStatObj){
								if(err){
									mapRej(err);
								}else if(mapStatObj.isFile()){
									absolutePath = entry;
									mapRes(mapStatObj);
								}else{
									mapRej();
								}
							});
						}else{
							mapRej();
						}
					}).then(function(mapStatObj){
						res(mapStatObj);
					}).catch(function(){
						var found = false;
						bluebird.Promise.each(options.index, function(indexName){
							var concatPath = p.join(absolutePath, indexName);
							return new bluebird.Promise(function(subRes, subRej){
								fs.stat(concatPath, function(err, subStatObj){
									if(!err && subStatObj.isFile() && !found){
										found = true;
										indexMap[absolutePath] = concatPath;
										absolutePath = concatPath;
										subRes(subStatObj);
									}else{
										subRej();
									}
								});
							}).then(function(subStatObj){
								res(subStatObj);
							}).catch(function(){
								// handle but ignore
							});
						}).then(function(){
							rej({code:"IGNORE"});
						});
					});
				}else{
					rej({code:"IGNORE"});
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

			var ext = p.extname(absolutePath);
			var fileName = p.basename(absolutePath);

			fileObj = {
				stat: statObj,
				contentType: mimeTypes.contentType(ext),
				extension: ext,
				compressed: false,
				absolutePath: absolutePath,
				fileName: fileName,
				minified: fileName.match(new RegExp("\.min" + ext, "gi")),
				download: false
			};

			/*
			 * Process file
			 */
			return processFile(fileObj);

		}).then(function(fileObj){

			if(fileObj.download){
				res.setHeader("Content-Disposition", "attachment; filename=" + fileObj.fileName);
				res.status(200).write(fileObj.data);
				return;
			}
			
			if(options["content-type"] && fileObj.contentType){
				res.setHeader("Content-Type", fileObj.contentType);
			}

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
				var lastModified = fileObj.stat.mtime.toGMTString();
				res.setHeader("Last-Modified", lastModified);
				var ifModifiedSince = req.get("if-modified-since");
				if(ifModifiedSince === lastModified){
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

			res.setHeader("Content-Length", fileObj.contentLength);

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
					return new bluebird.Promise(function(resolve, reject){
						zlib.gunzip(fileObj.data, function(err, buffer){
							if(err){
								reject(err);
							}else{
								res.setHeader("Content-Length", buffer.length);
								res.status(200).write(buffer);
								resolve();
							}
						});
					});
				}
			}else{
				res.status(200).write(fileObj.data);
			}

		}).catch(function(err){
			if(err.code === "IGNORE" || err.code === "ENOENT" || options["ignore-errors"]){
				res.status(404);
			}else{
				res.status(500);
				throw err;
			}
		}).then(function(){
			if(options["continue"]){
				next();
			}else{
				res.end();
			}
		}).catch(function(err){
			if(options["continue"]){
				next(err);
			}else{
				console.error(err);
				res.end();
			}
		});

	};

	if(options["prepare-cache"]){
		return new bluebird.Promise(function(res, rej){
			var files = [];
			var finder = require("findit")(basePath);
			finder.on("file", function(absolutePath, stat){

				var ext = p.extname(absolutePath);
				var fileName = p.basename(absolutePath);

				fileObj = {
					stat: stat,
					contentType: mimeTypes.contentType(ext),
					extension: ext,
					compressed: false,
					absolutePath: absolutePath,
					fileName: fileName,
					minified: fileName.match(new RegExp("\.min" + ext, "gi")),
					download: false
				};

				files.push(fileObj);

			});
			finder.on("end", function(){
				bluebird.Promise.each(files, function(fileObj){
					return processFile(fileObj).catch(function(err){
						if(err.code !== "IGNORE"){
							throw err;
						}
					});
				}).then(function(){
					res(middleware);
				});
			});
		});
	}

	return middleware;

};
