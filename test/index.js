const assert = require("assert");
const path = require("path");
const http = require("http");
const express = require("express");
const _ = require("lodash");
const bluebird = require("bluebird");
const speedyStatc = require(path.resolve(__dirname, "../index.js"));
const sourceJSPath = path.resolve(__dirname, "./examples/source.js");
const sourceCSSPath = path.resolve(__dirname, "./examples/source.css");
const sourceJSONPath = path.resolve(__dirname, "./examples/source.json");
const sourceInfo = require(path.resolve(__dirname, "./examples/sourceInfo.js"));
const sourceJS = require(sourceJSPath);
const sourceCSS = sourceInfo(sourceCSSPath);
const sourceJSON = sourceInfo(sourceJSONPath);
const resolvePath = function(relative){
	return path.resolve(__dirname, relative);
};

var app = express();
var server = http.createServer(app);
var port = 2080;
var requestOptions;

const doRequest = function(relative, options, callback){
	if(_.isFunction(options)){
		callback = options;
		options = {};
	}
	var extended = _.extend(_.clone(requestOptions), options);
	extended.path = relative;
	http.get(extended, callback);
};

describe("connection", function(){
	it("should connect a test server", function(done, failed){
		server.on("error", function(err){
			server.listen(++port);
		});
		server.listen(port);
		server.on("listening", function(){
			requestOptions = {
				hostname: "localhost",
				port: port
			};
			done();
		});
	});
});

describe("options", function(){
	describe("not provided", function(){
		it("should not throw any exception", function(done, failed){
			try{
				var middleware = speedyStatc(resolvePath("./examples"));
				done();
			}catch(e){
				done(e);
			}
		});
	});
});

describe("request", function(){
	describe("non existent resource", function(){
		it("should return a 404 and an empty payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"));
			app.use("/request/nonExistentResource", middleware);
			doRequest("/request/nonExistentResource/not_existent", function(res){
				if(res.statusCode === 404 && (!res.headers["content-length"] || res.headers["content-length"] == 0)){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("index", function(){
	describe("[\"test\", \"source.js\"] on /", function(){
		it("should return one of defined index file if exist", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {index: ["test", "source.js"]});
			app.use("/index/oneOf", middleware);
			doRequest("/index/oneOf", function(res){
				if(res.statusCode === 200 && res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("[\"source.js\", \"source.css\"] on /", function(){
		it("should return the first match", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {index: ["source.js", "source.css"]});
			app.use("/index/first", middleware);
			doRequest("/index/first", function(res){
				if(res.statusCode === 200 && res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return the stored index path", function(done, failed){
			doRequest("/index/first", function(res){
				if(res.statusCode === 200 && res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("[\"source.js\", \"source.css\"] on /first", function(){
		it("should return a 404 if no index resource was found", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {index: ["source.js", "source.css"]});
			app.use("/index/notFound", middleware);
			doRequest("/index/notFound/first", function(res){
				if(res.statusCode === 404){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("download", function(){
	describe("[\"./first\", \"source.js\"]", function(){
		it("should return content-disposition header when I request for /source.js", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {download: ["./first", "source.js"]});
			app.use("/download/true", middleware);
			doRequest("/download/true/source.js", function(res){
				if(res.statusCode === 200 && res.headers["content-disposition"] === "attachment; filename=source.js"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return content-disposition header when I request for /first/anotherToIgnore", function(done, failed){
			doRequest("/download/true/first/anotherToIgnore", function(res){
				if(res.statusCode === 200 && res.headers["content-disposition"] === "attachment; filename=anotherToIgnore"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return content-disposition header when I request for /first/path/to/ignore/test", function(done, failed){
			doRequest("/download/true/first/path/to/ignore/test", function(res){
				if(res.statusCode === 200 && res.headers["content-disposition"] === "attachment; filename=test"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should not return content-disposition header when I request for /source.yml", function(done, failed){
			doRequest("/download/true/source.yml", function(res){
				if(res.statusCode === 200 && !res.headers["content-disposition"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("compression", function(){
	describe("true", function(){
		it("should return compressed payload with \"Accept-Encoding: gzip\" header from the client", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false, download:[]});
			app.use("/compression/true/withHeader", middleware);
			doRequest("/compression/true/withHeader/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] < sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return uncompressed payload without \"Accept-Encoding: gzip\" header from the client", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false});
			app.use("/compression/true/withoutHeader", middleware);
			doRequest("/compression/true/withoutHeader/source.js", {
				headers:{
					"Accept-Encoding":""
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should return uncompressed payload with \"Accept-Encoding: gzip\" header from the client", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, minify:false});
			app.use("/compression/false/withHeader", middleware);
			doRequest("/compression/false/withHeader/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return uncompressed payload without \"Accept-Encoding: gzip\" header from the client", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, minify:false});
			app.use("/compression/false/withoutHeader", middleware);
			doRequest("/compression/false/withoutHeader/source.js", {
				headers:{
					"Accept-Encoding":""
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("compression-level", function(){
	describe("BEST_SPEED", function(){
		it("should return equals to " + sourceJS.BEST_SPEED_SIZE + " bytes of payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false, "compression-level":0});
			app.use("/compression-level/BEST_SPEED", middleware);
			doRequest("/compression-level/BEST_SPEED/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.BEST_SPEED_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("DEFAULT_COMPRESSION", function(){
		it("should return equals to " + sourceJS.DEFAULT_COMPRESSION_SIZE + " bytes of payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false, "compression-level":1});
			app.use("/compression-level/DEFAULT_COMPRESSION", middleware);
			doRequest("/compression-level/DEFAULT_COMPRESSION/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.DEFAULT_COMPRESSION_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("BEST_COMPRESSION", function(){
		it("should return equals to " + sourceJS.BEST_COMPRESSION_SIZE + " bytes of payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false, "compression-level":2});
			app.use("/compression-level/BEST_COMPRESSION", middleware);
			doRequest("/compression-level/BEST_COMPRESSION/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.BEST_COMPRESSION_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("NON_EXISTENT_COMPRESSION_LEVEL", function(){
		it("should make default compression", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:true, minify:false, "compression-level":5});
			app.use("/compression-level/NON_EXISTENT_COMPRESSION_LEVEL", middleware);
			doRequest("/compression-level/NON_EXISTENT_COMPRESSION_LEVEL/source.js", {
				headers:{
					"Accept-Encoding":"gzip"
				}
			}, function(res){
				if(res.headers["content-length"] == sourceJS.DEFAULT_COMPRESSION_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("compile", function(){
	describe("[\".less\", \".coffee\", \".cson\", \".yml\"]", function(){
		it("should compile less source files into css", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"));
			app.use("/compile", middleware);
			doRequest("/compile/bootstrap_3_3_6_less/bootstrap.less", function(res){
				if(_.startsWith(res.headers["content-type"], "text/css")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should compile coffee source files into javascript", function(done, failed){
			doRequest("/compile/source.coffee", function(res){
				if(_.startsWith(res.headers["content-type"], "application/javascript")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should compile cson source files into json", function(done, failed){
			doRequest("/compile/source.cson", function(res){
				if(_.startsWith(res.headers["content-type"], "application/json")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should compile yaml source files into json", function(done, failed){
			doRequest("/compile/source.yml", function(res){
				if(_.startsWith(res.headers["content-type"], "application/json")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("minify", function(){
	describe("true", function(){
		it("should minimize js source files", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":true, "minify-mangle":false});
			app.use("/minify/true", middleware);
			doRequest("/minify/true/source.js", function(res){
				if(res.headers["content-length"] == sourceJS.MINIMIZED_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should minimize css source files", function(done, failed){
			doRequest("/minify/true/source.css", function(res){
				if(res.headers["content-length"] < sourceCSS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should minimize json source files", function(done, failed){
			doRequest("/minify/true/source.json", function(res){
				if(res.headers["content-length"] < sourceJSON.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should not minimize resources declared as minimized (files that contains the word \".min\" before the extensions)", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":true, "minify-mangle":false});
			app.use("/minify/true", middleware);
			doRequest("/minify/true/source.fake.min.js", function(res){
				if(res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should not minimize source files", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":false});
			app.use("/minify/false", middleware);
			doRequest("/minify/false/source.js", function(res){
				if(res.headers["content-length"] == sourceJS.SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("minify-mangle", function(){
	describe("true", function(){
		it("should return equals to " + sourceJS.MINIMIZED_MANGLED_SIZE + " bytes of payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":true, "minify-mangle":true});
			app.use("/mangle/true", middleware);
			doRequest("/mangle/true/source.js", function(res){
				if(res.headers["content-length"] == sourceJS.MINIMIZED_MANGLED_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should return equals to " + sourceJS.MINIMIZED_SIZE + " bytes of payload", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":true, "minify-mangle":false});
			app.use("/mangle/false", middleware);
			doRequest("/mangle/false/source.js", function(res){
				if(res.headers["content-length"] == sourceJS.MINIMIZED_SIZE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("etag", function(){
	describe("true", function(){
		it("should return an ETag header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":false, "etag":true});
			app.use("/etag/true", middleware);
			doRequest("/etag/true/source.js", function(res){
				if(res.headers["etag"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return an ETag header from the server generated with the payload", function(done, failed){
			doRequest("/etag/true/source.js", function(res){
				if(res.headers["etag"] == sourceJS.ETAG){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return a 304 when a If-None-Match was sent and matches with the ETag", function(done, failed){
			doRequest("/etag/true/source.js", {
					headers: {
						"If-None-Match": sourceJS.ETAG
					}
				}, function(res){
				if(res.statusCode == 304){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should not return an ETag header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {compression:false, "minify":false, "etag":false});
			app.use("/etag/false", middleware);
			doRequest("/etag/false/source.js", function(res){
				if(!res.headers["etag"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("last-modified", function(){
	describe("true", function(){
		it("should return a Last-Modified header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"last-modified":true});
			app.use("/last-modified/true", middleware);
			doRequest("/last-modified/true/source.js", function(res){
				if(res.headers["last-modified"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return a Last-Modified header date equals to the last modification date got from the filesystem", function(done, failed){
			doRequest("/last-modified/true/source.js", function(res){
				if(res.headers["last-modified"] === sourceJS.LAST_MODIFICATION_DATE){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return a 304 when a If-Modified-Since was sent and matches with the last modification date got from the filesystem", function(done, failed){
			doRequest("/last-modified/true/source.js",{
					headers: {
						"If-Modified-Since": sourceJS.LAST_MODIFICATION_DATE
					}
				}, function(res){
					if(res.statusCode == 304){
						done();
					}else{
						done(new Error("Test failed."));
					}
			});
		});
	});
	describe("false", function(){
		it("should not return a Last-Modified header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"last-modified":false});
			app.use("/last-modified/false", middleware);
			doRequest("/last-modified/false/source.js", function(res){
				if(!res.headers["last-modified"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("content-type", function(){
	describe("true", function(){
		it("should return a Content-Type header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"content-type":true});
			app.use("/content-type/true", middleware);
			doRequest("/content-type/true/source.js", function(res){
				if(res.headers["content-type"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return an \"application/json\" Content-Type header from the server when a json file is requested", function(done, failed){
			doRequest("/content-type/true/source.json", function(res){
				if(_.startsWith(res.headers["content-type"], "application/json")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return an \"application/javascript\" Content-Type header from the server when a js file is requested", function(done, failed){
			doRequest("/content-type/true/source.js", function(res){
				if(_.startsWith(res.headers["content-type"], "application/javascript")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return an \"text/css\" Content-Type header from the server when a css file is requested", function(done, failed){
			doRequest("/content-type/true/source.css", function(res){
				if(_.startsWith(res.headers["content-type"], "text/css")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should return an \"text/html\" Content-Type header from the server when an html file is requested", function(done, failed){
			doRequest("/content-type/true/source.html", function(res){
				if(_.startsWith(res.headers["content-type"], "text/html")){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
		it("should not return a Content-Type header from the server for unknown file extensions", function(done, failed){
			doRequest("/content-type/true/source.unknown", function(res){
				if(!res.headers["content-type"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should not return a Content-Type header from the server", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"content-type":false});
			app.use("/content-type/false", middleware);
			doRequest("/content-type/false/source.js", function(res){
				if(!res.headers["content-type"]){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("prepare-cache", function(){
	describe("true", function(){
		it("should return a promise that gives you the middleware as soon as the cache was prepared", function(done, failed){
			var returned = speedyStatc(resolvePath("./examples"), {"prepare-cache":true, ignore:["./bootstrap_3_3_6_less"]});
			if(returned instanceof bluebird.Promise){
				returned.then(function(middleware){
					if(_.isFunction(middleware)){
						done();
					}else{
						done(new Error("Test failed."));
					}
				});
			}else{
				done(new Error("Test failed."));
			}
		});
	});
	describe("false", function(){
		it("should return the middleware", function(done, failed){
			var returned = speedyStatc(resolvePath("./examples"), {"prepare-cache":false});
			if(!(returned instanceof bluebird.Promise) && _.isFunction(returned)){
				done();
			}else{
				done(new Error("Test failed."));
			}
		});
	});
});

describe("browser-cache", function(){
	describe("true", function(){
		it("should return a Cache-Control header value equals to \"max-age=300, s-maxage=300\"", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"browser-cache":true});
			app.use("/browser-cache/true", middleware);
			doRequest("/browser-cache/true/source.js", function(res){
				if(res.headers["cache-control"] === "max-age=300, s-maxage=300"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should return a Cache-Control header value equals to \"no-cache, must-revalidate, max-age=0, s-maxage=0\"", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"browser-cache":false});
			app.use("/browser-cache/false", middleware);
			doRequest("/browser-cache/false/source.js", function(res){
				if(res.headers["cache-control"] === "no-cache, must-revalidate, max-age=0, s-maxage=0"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("browser-cache-max-age", function(){
	describe("500", function(){
		it("should return a Cache-Control header value equals to \"max-age=500, s-maxage=300\"", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"browser-cache":true, "browser-cache-max-age":500});
			app.use("/browser-cache-max-age/500", middleware);
			doRequest("/browser-cache-max-age/500/source.js", function(res){
				if(res.headers["cache-control"] === "max-age=500, s-maxage=300"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("browser-cache-s-maxage", function(){
	describe("500", function(){
		it("should return a Cache-Control header value equals to \"max-age=300, s-maxage=500\"", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"browser-cache":true, "browser-cache-max-age":300, "browser-cache-s-maxage":500});
			app.use("/browser-cache-s-maxage/500", middleware);
			doRequest("/browser-cache-s-maxage/500/source.js", function(res){
				if(res.headers["cache-control"] === "max-age=300, s-maxage=500"){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("hide-dotfiles", function(){
	describe("true", function(){
		it("should return a 404 when a existent dotfile is requested", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"hide-dotfiles":true});
			app.use("/hide-dotfiles/true", middleware);
			doRequest("/hide-dotfiles/true/.hidden", function(res){
				if(res.statusCode === 404){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should return the dotfile if it exists", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"hide-dotfiles":false});
			app.use("/hide-dotfiles/false", middleware);
			doRequest("/hide-dotfiles/false/.hidden", function(res){
				if(res.statusCode === 200){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	})
});

describe("ignore", function(){
	describe("[\"./first/path/to/ignore\", \"./second/path/to/ignore\"]", function(){
		it("should ignore resources located into declared paths", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"ignore":["first/path/to/ignore", "./second/path/to/ignore"]});
			app.use("/ignore/paths", middleware);
			doRequest("/ignore/paths/first/path/to/ignore/test", function(res){
				if(res.statusCode === 404){
					doRequest("/ignore/paths/first/path/to/ignore/test", function(res){
						if(res.statusCode === 404){
							done();
						}else{
							done(new Error("Test failed."));
						}
					});
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("[\"fileNameToIgnore.ign\", \"" + "./anotherToIgnore\"]", function(){
		it("should ignore resources whose name is one of the declared", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"ignore":["fileNameToIgnore.ign", "./first/anotherToIgnore"]});
			app.use("/ignore/files", middleware);
			doRequest("/ignore/files/fileNameToIgnore.ign", function(res){
				if(res.statusCode === 404){
					doRequest("/ignore/paths/first/anotherToIgnore", function(res){
						if(res.statusCode === 404){
							done();
						}else{
							done(new Error("Test failed."));
						}
					});
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	})
});

describe("ignoreRegExp", function(){
	describe("[/\\.min\\.[A-z0-9]*$\/, /\\.css$\/]", function(){
		it("should ignore resources whose name matches with one of the declared regular expression", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"ignoreRegExp":[/\.min\.[A-z0-9]*$/, /\.css$/]});
			app.use("/ignoreRegExp/regexp", middleware);
			doRequest("/ignoreRegExp/regexp/source.min.js", function(res){
				if(res.statusCode === 404){
					doRequest("/ignoreRegExp/regexp/source.css", function(res){
						if(res.statusCode === 404){
							done();
						}else{
							done(new Error("Test failed."));
						}
					});
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("[\"\\\\.min\\\\.[A-z0-9]*$\", \"\\\\.css$\"]", function(){
		it("should work also with strings converting them to regular expressions", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"ignoreRegExp":["\\.min\\.[A-z0-9]*$", "\\.css$"]});
			app.use("/ignoreRegExp/regexp", middleware);
			doRequest("/ignoreRegExp/regexp/source.min.js", function(res){
				if(res.statusCode === 404){
					doRequest("/ignoreRegExp/regexp/source.css", function(res){
						if(res.statusCode === 404){
							done();
						}else{
							done(new Error("Test failed."));
						}
					});
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});

describe("continue", function(){
	describe("true", function(){
		it("should pass the request to the next middleware in line", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"continue":true});
			var isDone = false;
			app.use("/continue/true", middleware)
			app.use("/continue/true", function(req,res){
				isDone = true;
			});
			doRequest("/continue/true/source.js", function(res){
				if(isDone){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
	describe("false", function(){
		it("should end the request", function(done, failed){
			var middleware = speedyStatc(resolvePath("./examples"), {"continue":false});
			var isDone = false;
			app.use("/continue/false", middleware)
			app.use("/continue/false", function(req,res){
				isDone = true;
			});
			doRequest("/continue/true/source.js", function(res){
				if(!isDone){
					done();
				}else{
					done(new Error("Test failed."));
				}
			});
		});
	});
});
