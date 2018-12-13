const
  fs = require('fs'),
  config = require('./Config/config.json'),
  url = require('url'),
  opn = require('opn');

const 
  fastify = require('fastify'),
  fastifyAutoPush = require('fastify-auto-push'),
  sitio = config.paths.prod,
  pathKey = config.server.sslKey,
  pathCrt = config.server.sslCrt,
  httpPort = config.server.httpPort,
  httpsPort = config.server.httpsPort;

const 
  appHttps = fastify({ https: { key: fs.readFileSync(pathKey), cert: fs.readFileSync(pathCrt) }, http2: true }),
  appHttp = fastify({ http2: false });

appHttps.register(fastifyAutoPush.staticServe, { root: `${__dirname}/${sitio}` });
appHttps.listen(httpsPort, config.server.urlApp, (err, address) => {
  if (err) {
    console.error(err);
    return -1;
  }
  console.log(`Server: ${address}`);
  opn(address);
});

appHttp.addHook('onSend', async (request, reply, payload, next) => {
  console.log(`https://${request.raw.ip}:${httpsPort}${request.raw.url}`);
  return await reply.code(301).redirect(`https://${request.raw.ip}:${httpsPort}${request.raw.url}`);
});

appHttp.listen(httpPort, config.server.urlApp, (err, address) => {
  if (err) {
    console.error(err);
    return -1;
  }
  console.log(`Server: ${address}`);
});