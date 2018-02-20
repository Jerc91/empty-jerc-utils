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
        strPath = url.parse(headers[HTTP2_HEADER_PATH]).pathname,
        reqPath = strPath === '/' ? '/index.html' : headers[HTTP2_HEADER_PATH],
        reqMethod = headers[HTTP2_HEADER_METHOD],
        fullPath = path.join(sitio, reqPath),
        responseMimeType = mime.lookup(fullPath);

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