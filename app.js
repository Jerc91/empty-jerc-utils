const
    fs = require('fs'),
    path = require('path'),
    http = require('http'),
    http2 = require('http2'),
    mime = require('mime-types'),
    config = require('./Config/config.json'),
    url = require('url'),
    opn = require('opn');

const
    sitio = config.paths.prod,
    pathKey = config.server.sslKey,
    pathCrt = config.server.sslCrt,
    httpPort = config.server.httpPort,
    httpsPort = config.server.httpsPort,
    {
		HTTP2_HEADER_PATH,
        HTTP2_HEADER_METHOD,
        HTTP_STATUS_NOT_FOUND,
        HTTP_STATUS_INTERNAL_SERVER_ERROR
	} = http2.constants;

function respondToStreamError(err, stream) {
    console.log(err);
    if (err.code === 'ENOENT') stream.respond({ ":status": HTTP_STATUS_NOT_FOUND });
    else stream.respond({ ":status": HTTP_STATUS_INTERNAL_SERVER_ERROR });
    stream.end();
}

http.createServer((req, res) => {
    res.writeHead(301, { "location": `https://${req.headers.host}:${httpsPort}${req.url}` });
    res.end();
}).listen(httpPort, () => console.log(`Server listening to: ${httpPort}`));

// hs2
let sercureServer = http2.createSecureServer({ cert: fs.readFileSync(pathCrt), key: fs.readFileSync(pathKey) });
sercureServer.on('stream', (stream, headers) => {
    const
        reqPath = headers[HTTP2_HEADER_PATH] === '/' ? '/index.html' : headers[HTTP2_HEADER_PATH],
        reqMethod = headers[HTTP2_HEADER_METHOD],
        fullPath = path.join(sitio, url.parse(reqPath).pathname),
        responseMimeType = mime.lookup(fullPath);

    if (fullPath.endsWith('index.html')) {
        stream.respondWithFile(fullPath, { "content-type": responseMimeType }, {
            onError: (err) => {
                respondToStreamError(err, stream);
            }
        });

        let
            pathJmain = "/assets/js/jmain.js";
        mimeJS = mime.lookup(pathJmain);
        stream.pushStream({ ":path": pathJmain }, (err, pushStream, headers) => {
            pushStream.respondWithFile(
                path.join(sitio, pathJmain),
                { 'content-type': mimeJS },
                { onError: (err) => { respondToStreamError(err, pushStream); } }
            );
        });

        return;
    }
    else if (fullPath.endsWith('no-save.css')) {
        stream.respondWithFile(fullPath, { "content-type": responseMimeType }, {
            onError: (err) => {
                respondToStreamError(err, stream);
            }
        });

        // fonts
        let
            pathfontAwesome = "/assets/fonts/fontawesome-webfont.woff2",
            pathfontRoboto = "/assets/fonts/roboto/Roboto-Light.woff2",
            mimeFont = mime.lookup(pathfontAwesome);

        stream.pushStream({ ":path": pathfontAwesome }, (err, pushStream, headers) => {
            pushStream.respondWithFile(
                path.join(sitio, pathfontAwesome),
                { 'content-type': mimeFont },
                { onError: (err) => { respondToStreamError(err, pushStream); } }
            );
        });

        stream.pushStream({ ":path": pathfontRoboto }, (err, pushStream, headers) => {
            pushStream.respondWithFile(
                path.join(sitio, pathfontRoboto),
                { 'content-type': mimeFont },
                { onError: (err) => { respondToStreamError(err, pushStream); } }
            );
        });
    }

    stream.respondWithFile(fullPath, { 'content-type': responseMimeType }, {
        onError: (err) => respondToStreamError(err, stream)
    });
});

sercureServer.listen(httpsPort, (err) => {
    if (err) {
        console.error(err);
        return -1;
    }
    console.log(`Secure Server listening to port ${httpsPort}`);
    opn(`https://127.0.0.1`);
});