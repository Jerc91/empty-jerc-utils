var fs = require('fs'),
    express = require('express'),
    http = require('http'),
    https = require('https'),
    compression = require('compression'),
    config = require('./config/config.json'),
    app = express(),
    sitio = config.paths.prod,
    pathKey = config.server.sslKey,
    pathCrt = config.server.sslCrt,
    httpPort = config.server.httpPort,
    httpsPort = config.server.httpsPort,
    urlApp = config.server.urlApp;

http.createServer((req, res) => {
    res.writeHead(301, { "location": `https://${req.headers.host}:${httpsPort}${req.url}` });
    res.end();
}).listen(httpPort, () => console.log(`Http Puerto: ${httpPort}`));

app.use(compression());
app.use(express.static(`${__dirname}/${sitio}`));
https
    .createServer({ key: fs.readFileSync(pathKey), cert: fs.readFileSync(pathCrt) }, app)
    .listen(httpsPort, () => console.log(`Https Puerto: ${httpsPort}`));