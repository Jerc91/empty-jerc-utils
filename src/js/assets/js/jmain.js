// TODO:
// Se creo proxy, la configuración para los spinners debe hacerce en una configuración personal, mostrar un spinner cada vez que haga una petición similar a angular
// Validar como carga por que no toma apenas actualizo la información
// Validar respuestas nulas y con errores
// mejorar granja de workers línea // Se obtiene el worker y se aumenta contador
// Validar catch con fallas en cada promise
// Mejorar patrón observer, sería bueno investigar sobre como interpretar diagramas
// Validar peticiones a cors o a host terceros
// Crear para automatizar pruebas, leer sobre ello
// Se puede causar un error en el worker import, con _cantidadWorkers = undefined
// Agregar un límite de peticiones
// Validar que el singleton con una variable sin valor mantega la referencia de la función de creación
// Validar las despendencias del serviceLocator y como estas se pueden pedir, y como impedir un abrazo de oso
// Validar eliminación de los ns
// Luego usar configuración para PWA's https://developers.google.com/web/fundamentals/app-install-banners/
// Cambiar fnTagScriptLink para que sea el quien identifique la extensión si esta no se envía
// Quitar la información del plugin como objeto de js y dejarlo como comentario como todos los plugins
// Replacewith con los css createTagLink

// TODO: Performance
// Ver cual es más rapido si includes o indexOf
// Verificar si un [...arguments] es más rápido que un for(var i )

// TODO: ServiceWorkers
// https://play.google.com/store/books/details?id=lEdt-AKB3iQC&rdid=book-lEdt-AKB3iQC&rdot=1&source=gbs_vpt_read&pcampaignid=books_booksearch_viewport
// http://craig-russell.co.uk/2016/01/29/service-worker-messaging.html#.WWJimog1_IU
// https://github.com/GoogleChrome/samples/tree/gh-pages/service-worker/post-message
'use strict';

//---------------------------------
// Funciones globales, de uso común
//---------------------------------
(function () {

    // Constantes
    var FILESYSTEM_WORKER_PATH = 'assets/js/workers/filesystem-worker.js',
        SERVICE_WORKER_PATH = './service-worker.js',
        FILES_UPDATE_PATH = 'assets/config/filesToUpdate.json',
        QUERY_CONTAINER_TAGS_GET = 'dvContainerJGet',
        WRAPPER_TAGS_GET = document.querySelector(`#${QUERY_CONTAINER_TAGS_GET}`) || document.createElement('div');        

    // Variables privadas de la función anonima autoejecutable
    var _patterns = new Namespace(),
        _cantidadWorkers = 3,
        _iRequester;

    // Configuración get
    var _cbStartRequest,
        _cbEndRequest,
        _cbErrorRequest;

    //---------------------------------
    // Nombre de espacio principal Main for library
    // Se crea el nombre de espacio j, este será usada para el resto de plugins
    //---------------------------------
    window.jr = new Namespace(fnInitConfigJMain);
    
    //---------------------------------
    // inicio Métodos para Espaciones de Nombres
    //---------------------------------

	/*
		//---------------------------------
		// Estructura para los nombre de espacios
		// Ejemplo: var myApp = new Namespace();
		//---------------------------------
		// Namespace.addNS
		//---------------------------------
		// Función para crear el nuevo espacio de nombre
		// Para crear un modulo myApp.addNS('modulA');
		// myApp.modulA = {object}
		//---------------------------------
		// Parametros:
		//---------------------------------
		// @ns: Espacio de nombres
		// @body?: Objeto o función que tomará el lugar de la instacia
		//---------------------------------
		// Retorna: Objeto o función con la propiedad fnAddNS
		//---------------------------------
	*/
    function Namespace(mainBody) {
        function Instancia(ns) {
            var ctx = this === window ? {} : this;

            // Se genera un espacio de nombre por cada punto dentro de la variable ns
            if (ns && ns.indexOf('.')) {
                ns.split('.').forEach(function (name) {
                    ctx = ctx.addNS(name);
                }); // end forEach
            } // end if
        } // fin método

        // Función para crear un nuevo nombre de espacio
        Instancia.prototype.addNS = function (name, body) {
            if (!name) return;
            if (!name.match(window.validateNS)) return;
            // Crea una propiedad si esta no existe
            if (typeof this[name] == 'undefined') {
                if (body && !body.hasOwnProperty('addNS')) {
                    body.addNS = Instancia.prototype.addNS;
                    this[name] = body;
                }
                else {
                    this[name] = new Instancia();
                }
            }
            return this[name];
        }; // fin método AddNS

        if (mainBody) {
            if (!mainBody.hasOwnProperty('addNS')) mainBody.addNS = Instancia.prototype.addNS;
            return mainBody;
        }

        return new Instancia();
    } // fin método
    //---------------------------------

	/*
		//---------------------------------
		// Función para encontrar la ruta de un nombre de espacios
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @ns:     Nombre de espacio el cual sera retornado   'miNombreEspacion.Tools' 
		//---------------------------------
		// return:  Retorna el nombre de espacion que conicida con el nombre indicado   {}
		//---------------------------------
	*/
    function fnImport(ns, assingNull) {
        var currentNS = window,
            parts = ns.split('.'),
            size = parts.length,
            penultimoEspacio = size - 1,
            parentNS;

        for (var i = 0; i < size; i++) {
            parentNS = currentNS;
            currentNS = currentNS[parts[i]];
        } // fin for

        if(assingNull) {
            parentNS[parts[penultimoEspacio]] = null;
            delete parentNS[parts[penultimoEspacio]];
        } 

        return currentNS;
    } // fin método
    //---------------------------------

	//---------------------------------
    // Fin Métodos para Espaciones de Nombres
    //---------------------------------





    //---------------------------------
    // Inicio Métodos para peticiones Asincronas
    //---------------------------------

    if (!Promise.prototype.spread) {
        Promise.prototype.spread = function (fn) {
            return this.then(function (result) {
                return result instanceof Array ? fn(...result) : fn(result);
            });
        };
    }


    /*
        //---------------------------------
        // Método para tomar todas las queryString de la URL.
        //---------------------------------
        // Retorna: {key:value}
        //---------------------------------
    */
    function getQuerys(path) {
        var ruta = path || location.search,
            indiceQuery = ruta.indexOf('?'),
            querys, qs, key, value, size;

        if (ruta.indexOf('?') == -1) return {};

        querys = ruta.substr(indiceQuery + 1).split('&');
        size = querys.length;
        qs = {};
        for (var i = 0; i < size; ++i) {
            key = querys[i].substring(0, querys[i].indexOf('='));
            value = querys[i].substring(querys[i].indexOf('=') + 1, querys[i].length);

            qs[key] = decodeURIComponent(value.replace(/\+/g, " "));
        } // end for
        return qs;
    }

    //---------------------------------
    // Espacio para fileSystem
    //---------------------------------
    (function () {
        var _workers = new Map(),
            _indexWorkerActual = 0;

        /*
			//---------------------------------
			// Obtiene un worker, esto se configura con un objeto observador.
			//---------------------------------
			// Retorna: {Worker} Retorna un WebWorker para realizar peticiones.
			//---------------------------------
		*/
        function fnGetWorker() {
            var worker;

            // Se genera un Worker y se obtiene un observador
            if (_workers.size < _cantidadWorkers) {
                worker = new Worker(jr.fileSystemWorkerPath);
                worker.observador = _patterns.observer.instance;
                worker.addEventListener("message", fnListenerWoker, false);
                worker.addEventListener("error", fnListenerWoker, false);
                _workers.set(_workers.size, worker);
            } // end if

            // Se obtiene el worker y se aumenta contador
            if (_indexWorkerActual >= _workers.size) _indexWorkerActual = 0;
            worker = _workers.get(_indexWorkerActual);
            _indexWorkerActual++;

            return worker;

            // listener event observer of worker, se notifica al observado y se elimina éste
            function fnListenerWoker(e) {
                worker.observador
                    .notify(e.data.observedId, e)
                    .remove(e.data.observedId);
            } // end function
        }
        //---------------------------------

		/*
			//---------------------------------
			// Se obtiene la referencia de un worker, y se envian los 
			// datos al servidor
			//---------------------------------
			// Parámetros:
			//---------------------------------
			// @data:   {object|string} Objeto con la información para cargar los archivos.
			//---------------------------------
			// Retorna: {Promise} Retorna un objeto Promise
			//---------------------------------
		*/
        function fnSendRequest(request, fragment, promiseTags) {
            // Variables para cuando retorne información el worker
            var _copyRequest = fnGetRequest(request, true);

            // Se crea una nueva promesa
            return new Promise(function (resolve, reject) {
                var command, worker;

                // Se usa el patrón Command
                command = _patterns.command.instance
                    .on('message', fnReseiver)
                    .on('error', reject);

                // Instancia del worker
                worker = fnGetWorker();

                // Se usa el patrón Observador
                _copyRequest.observedId = worker.observador.add(function (e) {
                    command.trigger(e.type, e.data, request, resolve);
                });

                // Config Get
                fnExecFunction(_cbStartRequest, _copyRequest);

                // Se envia los datos al worker
                worker.postMessage(Object.assign({ files: jr.filesToUpdate }, _copyRequest));
            }).then(function (result) {
                fnExecFunction(request.then, result);
                return result;
            }, function (error) {
                _copyRequest.error = error;
                fnExecFunction(request.catch, _copyRequest);
                return Promise.reject(_copyRequest);
            });
        }
        //---------------------------------

        /*
            //---------------------------------
            // fnDeleteWorkers()
            // Función para eliminar un arreglo de _workers
            //---------------------------------
            // Parámetros:
            //---------------------------------
            // @workers: [{Worker}] Webworkers a eliminar
            //---------------------------------
        */
        function fnDeleteWorkers(workers) {
            if (!_workers) return;
            if (!_workers.length) return;
            do {
                _workers[0].terminate();
                _workers.splice(0, 1);
            } while (_workers.length) // end do while 
        } // end function
        //---------------------------------

        /*
			//---------------------------------
			// Función que configura la lógica para guardar peticiones con fileSystem
			//---------------------------------
		*/
        function fnInit() {
            return Promise.resolve();
        }
        //---------------------------------

        // Public API
        this.sendRequest = fnSendRequest;
        this.init = fnInit;
    }).call(jr.addNS('fileSystem'));

    //---------------------------------
    // Espacio para service worker
    //---------------------------------
    (function () {
        var _registratioSW;

        /*
			//---------------------------------
			// Se obtiene la referencia del service worker
			//---------------------------------
			// Retorna: {Promise} Retorna un objeto Promise con el parámetro {SW} service worker
			//---------------------------------
		*/
        function getRegistrationSW() {
            if (!_registratioSW) return navigator.serviceWorker.getRegistration().then(sw => _registratioSW = sw);
            return Promise.resolve(_registratioSW);
        } // end function
        //---------------------------------

		/*
			//---------------------------------
			// Se obtiene la referencia de un worker, y se envian los 
			// datos al servidor
			//---------------------------------
			// Parámetros:
			//---------------------------------
			// @data:   {object} Objeto con la información para cargar los archivos.
			//---------------------------------
			// Retorna: {Promise} Retorna un objeto Promise
			//---------------------------------
		*/
        function fnSendRequestSW(request, fragment, promiseTags) {
            // Variables para cuando retorne información el worker
            var _copyRequest = fnGetRequest(request, true);

            // Se crea una nueva promesa
            return new Promise(function(resolve, reject) {
                getRegistrationSW().then(function (sw) {
                    var messageChannel = new MessageChannel();

                    messageChannel.port1.onmessage = function (event) {
                        if (typeof event.data == 'string') {
                            reject(event.data);
                            return;
                        }
                        else fnReseiver(event.data, _copyRequest, resolve);
                    } // end function

                    // Config Get
                    fnExecFunction(_cbStartRequest, _copyRequest);

                    // This sends the message data as well as transferring messageChannel.port2 to the service worker.
                    // The service worker can then use the transferred port to reply via postMessage(), which
                    // will in turn trigger the onmessage handler on messageChannel.port1.
                    // See https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage
                    sw.active.postMessage(
                        Object.assign({ files: jr.filesToUpdate }, _copyRequest),
                        [messageChannel.port2]
                    );
                });
            }).then(function(result) {
                // TODO: Validar si es necesario el try catch
                try {
                    fnExecFunction(request.then, result);   
                } catch (error) {
                    _copyRequest.error = error;
                    throw _copyRequest;
                }
                return result;
            }, function (error) {
                _copyRequest.error = error;
                fnExecFunction(request.catch, _copyRequest);
                return Promise.reject(_copyRequest);
            });
        } // end function
        //---------------------------------

        /*
			//---------------------------------
			// Registra un service worker si el navegador lo soporta.
			//---------------------------------
			// Parámetros:
			//---------------------------------
			// @fnCallback: Función de callack cuando se registre el serviceworker.
			//---------------------------------
		*/
        function fnInitServiceWorker() {
			/* 
				.then(function (registration) {
				// TODO: implementar notificaciones push
					return navigator.serviceWorker.ready.then(function (serviceWorkerRegistration) {                
						return serviceWorkerRegistration.pushManager.getSubscription();
					});
				})
			*/
            return Promise.all([navigator.serviceWorker.register(jr.serviceWorkerPath), navigator.serviceWorker.ready])
                .then(function (registrations) {
                    if (jr.dev) console.log('Service Worker activado con el contexto:', registrations[0].scope);
                    return navigator.onLine ? registrations[0].update() : Promise.resolve();
                }).then(function () {
                    navigator.serviceWorker.addEventListener('message', function (event) {
                        console.log('Mensaje recibido del SW: ', JSON.stringify(event.data));
                        // event.ports[0].postMessage("Client 1 Says 'Hello back!'");
                    });
                });
        } // end function
        //---------------------------------

        // Public API
        this.sendRequest = fnSendRequestSW;
        this.init = fnInitServiceWorker;
    }).call(jr.addNS('serviceWorker'));


    /*
		//---------------------------------
		// fnGet()
		// Esta función usa hilos (webworkers), se cargan archivos mediante ajax, para el navegador Google Chrome.  
		// Estos archivo se guardan en el navegador haciendo usao de la interfaz FileSystem.
		// Con esto se logra menos peticiones al servidor y una carga más rápida de la página.
		//
		// Se debe cargar la primera vez un archivo .json con los nombre de los archivos que deban actualizarsen, los
		// objetos del .json deberán tener las siguientes propiedades: nombre y la fecha de actualización.
		// La estructura del json debe ser la siguiente:
		//  [
		//      { "name":"ui.js", "date":"2014-06-24-15" }
		//  ]
		//---------------------------------
		// Parametros:
		//---------------------------------
		// @data:   Objeto con la información para cargar los archivos          [{},{}]
		// @then:   Método que se ejecuta cuando carguen todos los archivos     (function (response, args) {})
		//---------------------------------
		// Retorna: Estructura de una objeto Promesa
		//---------------------------------
	*/
    function fnGet() {
        var totalRequest = arguments.length,
            pars = arguments;

        return new Promise(function(resolve, reject) {
            getRequests(...pars).then(function() {
                resolve(...arguments);
            }, error => {
                var result = { error: error };
                if (fnIsFunction(_cbErrorRequest)) fnExecFunction(_cbErrorRequest, result);
                else return reject(result);
            });
        });

        // Se valida un parámetro, un arreglo un Promise.all
        function getRequests() {
            var size = arguments.length;
            for (var i = 0; i < size; i++) {
                if(arguments[i] instanceof Array)
                    arguments[i] = Promise.all(arguments[i].map(request => {
                        if(request instanceof Array) return getRequests(...request);
                        else return getRequests(request);
                    }));
                else
                    arguments[i] = getPromise(arguments[i]);
            }
            return size == 1 ? arguments[0] : Promise.all(arguments);
        }
        // Se valida para que se use una estructura de varios parámetros
        function getPromise(request) {
            return request instanceof Promise ? request : _iRequester.sendRequest(request);
        }
    } // end function
    //---------------------------------

	/*
		//---------------------------------
		// Se encarga de recibir la información del observador, que a su vez
		// recibe la información del worker, resuelve la promesa, y ejecuta
		// la función de callback, si es unapetición para archivos js o css
		// se crean sus respectivas tag en el documento.
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @reponse:          {object}    Información que se retorno desde el worker.
		// @request:          {object}    Request que se realiza al servidor.
		// @resolvePromise:   {function}  Función que resulve una promesa.
		//---------------------------------
	*/
    function fnReseiver(response, request, resolve) {
        var notRequestBlob = response.result instanceof Blob && request.mime !== 'blob',
            result = { 
                request: request, 
                response: notRequestBlob ? URL.createObjectURL(response.result) : response.result
            },
            type = /^.*\.(css|js)([?#]{1}.*)?$/gi.exec(request.src);

        // Cuando el archivo es un script o un estilo se crea la tag respectiva y se agrega al documento
        if (type) {
            // Si es una archivo de tipo javascript o una hoja de estilos se crea una tag,
            // si se tiene una función para hacer callback se ejecuta esta.
            fnTagScriptLink({
                href: result.response, type: type[1],
                name: request.src, repeatTag: request.repeatTag,
                referenceTag: request.referenceTag
            }).then(function () {
                // Config Get
                fnExecFunction(_cbEndRequest, result);
                resolve();
            });
        } else {
            // Config Get
            fnExecFunction(_cbEndRequest, result);
            resolve(result);
        }
    } // end function
    //---------------------------------

	/*
		//---------------------------------
		// Obtiene las propiedeades diferente entre una referencia (objeto) y un objeto.
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @source: {object} Objeto con la estructura a no tomar.
		// @target: {object} Objeto con la información para obtener las.
		//---------------------------------
		// Retorna: {object} Retorna un objeto con las diferencias.
		//---------------------------------
	*/
    function fnGetDiferences(source, target) {
        var diference = {};
        Object.keys(target).forEach(name => {
            if(!source.hasOwnProperty(name)) diference[name] = target[name];
        });
        return diference;
    } // end function
    //---------------------------------

	/*
		//---------------------------------
		// fnGetRequest()
		// Función para evaluar si un objeto es un string con la ruta a solicitar
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @request:   Ínformación de un request.
		//---------------------------------
	*/
    function fnGetRequest(request, removeFunctions) {
        if (typeof request === 'string' || request instanceof String) return { src: request.toString() };
        if (removeFunctions) return JSON.parse(JSON.stringify(request));
        return request;
    } // end function
    //---------------------------------

    /*
		//---------------------------------
		// Crea una tag script o una tag link(css) para asignar una url y ejecutar un callback
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @d:              Objeto con los parametro necesarios para la ejecución de la función
		// @d.href:         Dirección del blob  'string'
		// @d.type:         Tipo de tag a crear ('js' || 'css')
		// @d.name:         Nombre del archivo para identificarlo en la tag
		// @d.repeatTag:    Valor para saber si se salta la validación: si existe el 
		//                  objeto en el DOM. (true || false)
        // @d.referenceTag: Agrega un data-name para identificar la tag a crear
        //---------------------------------
		// Retorna: Promise
		//---------------------------------
	*/
    function fnTagScriptLink(d = {}) {
        return new Promise(function (resolve, reject) {
            var tag, attributesUrl, name, indiceFin;

			/*
				// Se valida si ya hay una tag con el data-name igual
				// para no volverlo a crear
			*/
            if (!d.repeatTag && d.referenceTag) {
                var query = (d.type == 'js' ? 'script' : 'link') + '[data-name="' + d.name + '"]';
                document.querySelector(query) && resolve({});
            } // end if repeatTag

            // Se elije que tipo de tag se va a crear
            switch (d.type) {
                case 'js':
                    tag = document.createElement("script");
                    tag.src = d.href;
                    tag.async = true;
                    break;
                case 'css':
                    tag = document.createElement("link");
                    tag.href = d.href;
                    tag.rel = 'stylesheet';
                    tag.type = 'text/css';
                    break;
            } // fin switch

            if (d.referenceTag) {
                name = d.name;
                indiceFin = name.indexOf('?');
                if(indiceFin > -1) name = name.substring(0, indiceFin);
                tag.dataset.name = name;
            }

            // Se verifica querys si se requiere y se asignan al control
            if(d.name) {
                attributesUrl = getQuerys(d.name);
                Object.keys(attributesUrl).forEach(name => tag.setAttribute(name, attributesUrl[name]));
            }

            // Cuando la tag se carga se ejecuta la funcion del item
            tag.addEventListener('load', resolve, false);
            tag.addEventListener('error', reject, false);

            // Se agrega la nueva tag en el DOM            
            WRAPPER_TAGS_GET.appendChild(tag);
        });
    } // fin método
    //---------------------------------

	/*
        //---------------------------------
        // fnInitJMain()
        // Función para inicializar el service worker o el filesystem
        //---------------------------------
    */
    function fnInitJMain() {
        var currentTag = document.currentScript,
            configuracion = {  
                useFS: false,
                useSW: true,
                workersCount: 3,
            };

        // Configuración defecto
        Object.assign(configuracion, document.currentScript.dataset);        
        jr.useServiceWorker = configuracion.useSW;

        // Configuración paths
        jr.fileSystemWorkerPath = configuracion.fileSystemWorkerPath || FILESYSTEM_WORKER_PATH;
        jr.serviceWorkerPath = configuracion.serviceWorkerPath || SERVICE_WORKER_PATH;

        // Asignación de interface para realizar las peticiones y guardar las respuestas
        if (jr.useServiceWorker) _iRequester = jr.serviceWorker;
        if (jr.useFileSystem) {
            _iRequester = jr.fileSystem;

            window.addEventListener('load', function (e) {
                window.applicationCache.addEventListener('updateready', function () {
                    if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
                        window.applicationCache.swapCache();
                        window.location.reload();
                    } // end if
                }, false); // end function updaterady
            }, false); // end function load
        }

        _iRequester.init().then(function() {
            // Para agrupar las tags generadas con el get
            if(!WRAPPER_TAGS_GET.id) WRAPPER_TAGS_GET.id = QUERY_CONTAINER_TAGS_GET;
            fnTagScriptLink({ href: currentTag.dataset.init, type: 'js' });
            !document.body.hasChildNodes(WRAPPER_TAGS_GET) && document.body.appendChild(WRAPPER_TAGS_GET);
        });
    }

	/*
		//---------------------------------
		// fnInitJMain()
		// Función para mejorar la funcionalidad de las
		// peticiones asincronas, además envia la petición
		// del archivo filesToUpdate
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @opciones:   Valores de configuración.
		//---------------------------------
		// @.srcFiles:      Path del archivo filesToUpdate.json
		// @.workersCount:  Cantidad de workers que realizaran las peticiones.
		// @.useSW:         Bandera para identificar si se debe usa un service worker.
		//---------------------------------
		// Configuración get()
		//---------------------------------
		// @.cbStartRequest:    Callback para ejecutar antes de hacer las peticiones al servidor 
		// @.cbEndRequest:      Callback para ejecutar cuando el servidor responda las peticiones
		//---------------------------------
	*/
    function fnInitConfigJMain(opciones) {
        var configuracion = {
            filesUpdatePath: FILES_UPDATE_PATH,
            getToWindow: true,
        };

        // Configuración defecto
        Object.assign(configuracion, opciones);        
        jr.useFileSystem = configuracion.useFS;

        // Configuración paths
        jr.filesUpdatePath = configuracion.filesUpdatePath || FILES_UPDATE_PATH;

        // Configuración de funcón globales
        _cbStartRequest = configuracion.cbStartRequest;
        _cbEndRequest = configuracion.cbEndRequest;
        _cbErrorRequest = configuracion.cbErrorRequest;

        // Variablesa windows
        if (configuracion.getToWindow) window.get = fnGet;
        return fnGet({ src: jr.filesUpdatePath, cache: false }).then(function (result) {
            jr.filesToUpdate = result.response;

            if(configuracion.packages) {
                jr.service = _patterns.serviceLocator;
                return jr.service(configuracion.packages);
            }

            return Promise.resolve();
        }, function (error) { 
            return error; 
        });
    } // end function
    //---------------------------------

    /*
        //---------------------------------
        // Función para reemplazar un nodo
        //---------------------------------
    */
    function fnReplaceWith(result, fragment) {
        var wrapper = (fragment || document).querySelector(result.request.query),
            currentNode = wrapper ? wrapper.firstElementChild : null;

        if(result.fragment) {
            if(currentNode) currentNode.replaceWith(result.fragment);
            else wrapper.appendChild(result.fragment);
        }
    }

    /*
        //---------------------------------
        // Función para realizar peticiones al servidor y crear un html dinámico
        //---------------------------------
    */
    function fnSetFragmentFromHTML() {
        return get(...arguments).spread(function() {
            var results = arguments.length > 1 ? arguments : arguments[0],
                fragment;
            
            return getRequest(fragment, results);

            function getRequest(fragment, results) {
                let pars, 
                    size = results.length;
                    
                if(size > 1) {
                    pars = [];
                    for (var i = 0; i < size; i++) {
                        pars[pars.length] = getRequest(fragment, results[i]);
                    }
                    return pars;
                } else {
                    return setFragment(fragment, results);
                }
            }
            function setFragment(fragment, result) {
                fragment = getFragment(fragment, result);
                return result;
            }
            function getFragment(fragment, result) {
                if(!fragment) {
                    fragment = appendChild(document, result).fragment;
                }
                else appendChild(fragment, result);
                return fragment;
            }
        });

        function appendChild(fragment, result) {
            if(result.request.noAppend) {
                return parseResult(result);
            }
            fnReplaceWith(parseResult(result), fragment);
            return fragment;
        }
        function parseResult(result) {
            return Object.assign(result, {  
                fragment: result.fragment || document.createRange().createContextualFragment(result.response)
            });
        }
    }

    /*
        //---------------------------------
        // Función para realizar peticiones al servidor y crear un html dinámico mediante plantilla
        //---------------------------------
    */
    function fnCompileHTML() {
        return get(...arguments).spread(function() {
            var data = {};            
            return getResults(data, ...getData(data, ...arguments));
        });
        function getData(data) {
            var _resultsHtml = [],
                results = jr.parametersWithoutFirst(...arguments) || [],
                size = results.length;

            for(var i = 0; i < size; i++) {
                if(results[i] instanceof Array) results[i].forEach(result => {
                    var currentResult = getData(data, result);
                    if(currentResult.length) _resultsHtml[_resultsHtml.length] = currentResult;
                });
                else validataData(data, results[i]);                
            }

            return _resultsHtml;

            function validataData(data, result) {
                var isText = typeof result.response == 'string';
                if(isText) _resultsHtml[_resultsHtml.length] = result;
                else Object.assign(data, result.response);
            }
        }
        function getResults(data) {
            var results = jr.parametersWithoutFirst(...arguments) || [],
                promises = results.map(result => {
                    if(result instanceof Array) return getResults(data, ...result);
                    return compile(data, result);
                });

            return results.length > 1 ? Promise.all(promises) : promises[0];
        }
        function compile(data, result) {
            return new Promise((resolve, reject) => {
                var worker = new Worker('assets/js/workers/compiler-worker.js');
                worker.addEventListener("message", e => {
                    worker.terminate();
                    resolve(Object.assign(result, { response: e.data }));
                }, false);
                worker.postMessage({ template: result.response, data: data });
            });
        }
    }

    /*
        //---------------------------------
        // Función para realizar peticiones al servidor y crear un html dinámico mediante plantilla
        //---------------------------------
    */
    function fnCompileSetHTML() {
        var results = fnCompileHTML(...arguments);
        if(results.length > 1) fnSetFragmentFromHTML(...results);
        else return fnSetFragmentFromHTML(results);
    }

    //---------------------------------
    // Fin Métodos para peticiones Sincronos
    //---------------------------------





    //---------------------------------
    // Inicio Funciones Comunes
    //---------------------------------

	/*
		//---------------------------------
		// Valida si el parametro es una tipo de objeto function
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @x:  {object} Valor a validar
		//---------------------------------
		// Retorna: Si el parámetro x es una función o no
		//---------------------------------
	*/
    function fnIsFunction(x) {
        return Object.prototype.toString.call(x) == '[object Function]';
    } // end function
    //---------------------------------

    /*
        //---------------------------------
        // Obtiene los parametros excepto el primero y retorna un array
        //---------------------------------
    */
    function fnParametersWithoutFirst() {
        var pars,
            size = arguments.length;
        if (size > 1) {
            pars = [];
            for(var i = 1; i < size; i++) pars[pars.length] = arguments[i];
        }
        return pars;
    } // end function
    //---------------------------------

	/*
		//---------------------------------
		// Valida si el parametro es una función y la ejecuca pasandole los parámetros que se indiquen
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @cb:     {function}  Función a ejecutar
		// @arg1:   {any}       Parámetro a ejecutar
		// @arg2:   {any}       Parámetro a ejecutar
		// @arg...: {any}       Parámetro a ejecutar
		//---------------------------------
		// Retorna: El resultado de la función
		//---------------------------------
	*/
    function fnExecFunction(cb) {
        var pars = fnParametersWithoutFirst(...arguments);
        if(fnIsFunction(cb)) return pars ? cb(...pars) : cb(pars);
    } // end fnExecFunction
    //---------------------------------

    //---------------------------------
    // Inicio Métodos para Arrays
    //---------------------------------

    /*
        //---------------------------------
        // Función para ordenar
        //---------------------------------
        // Ejemplo array.sortBy(function () { return this.index })
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // @f:       Función anonima en la que se retorna la propiedad
        //           por la que se quiere ordenar    {function}
        //---------------------------------
        // return:   Retorna el Array ordenado
        //---------------------------------
    */
    Array.prototype.sortBy = function (f) {
        for (var i = this.length; i;) {
            var o = this[--i];
            this[i] = [].concat(f.call(o, o, i), o);
        } // fin for
        this.sort(function (a, b) {
            for (var i = 0, len = a.length; i < len; ++i) {
                if (a[i] != b[i]) return a[i] < b[i] ? -1 : 1;
            } // fin for
            return 0;
        }); // fin método sort
        for (var i = this.length; i;) {
            this[--i] = this[i][this[i].length - 1];
        } // fin for
        return this;
    } // fin método
    //---------------------------------

    //---------------------------------
    // Fin Métodos para Arrays
    //---------------------------------

    // Public API
    //---------------------------------
    // HTML

    /*
        //---------------------------------
        // Inserta un elemento enseguida del valor referenciado.
        // referencenode:   Elemento siguiente al nuevo nodo, o
        //                  al nodo de referencia   {ELEMENT}
        // newNode:         Elemento que va ser insertado antes que
        //                  el referenciado         {ELEMENT}
        //---------------------------------
    */
    function fnInsertAfter(referenceNode, newNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    } // end function
    //---------------------------------

    /*
        //---------------------------------    
        // Función para eliminar una tag
        //---------------------------------    
        // Parámetros:
        //---------------------------------    
        // object:  Objeto que será eliminado   {< />}
        //---------------------------------    
    */
    function fnDeleteTag(object) {
        if (!object) return;
        object.parentNode.removeChild(object);
    } // end method
    //---------------------------------

    /*
        //---------------------------------
        // Crea un objeto Date y recibe una fecha en formato json
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // jsonDate:    Fecha que es convertida al serializar un DateTime de .Net
        //              {/Date(1335205592410)/}
        //---------------------------------
    */
    function fnParseJsonDate(jsonDate) {
        var offset = new Date().getTimezoneOffset() * 60000;
        var parts = /\/Date\((-?\d+)([+-]\d{2})?(\d{2})?.*/.exec(jsonDate);
        if (parts[2] == undefined) parts[2] = 0;
        if (parts[3] == undefined) parts[3] = 0;
        return new Date(+parts[1] + offset + parts[2] * 3600000 + parts[3] * 60000);
    } // end function
    //---------------------------------

    /*
        //---------------------------------
        // Toma la fecha y hora actual para retornar esta información como una cadena de texto. (yyyy-MM-dd hh:mm)
        //---------------------------------
    */
    function fnNow() {
        var date = new Date();
        return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + (date.getDay() - 1) + ' ' + date.getHours() + ':' + date.getMinutes();
    } // end function
    //---------------------------------

	/*
		//---------------------------------
		// Agrega texto dentro de la consola, para el manejo de errores
		//---------------------------------
	*/
    function fnErrorHandler(e) {
        console.log('Error: ', e.message);
    } // end function
    //---------------------------------

    //---------------------------------
    // Fin Funciones Comunes
    //---------------------------------


    //---------------------------------
    // Inicio PWA's
    //---------------------------------

    (function() {
        var _eventoPrompt;

        window.addEventListener('beforeinstallprompt', function(e) {
            // beforeinstallprompt Event fired
            e.userChoice.then(function(choiceResult) {
                console.log(choiceResult.outcome);

                if(choiceResult.outcome == 'dismissed') {
                    console.log('User cancelled home screen install');
                }
                else {
                    console.log('User added to home screen');
                }
            });
        });
    })();

    //---------------------------------
    // Fin PWA's
    //---------------------------------


    //---------------------------------
    // Inicio Patrones de Diseño
    //---------------------------------

    (function () {
        // Variables privadas
        var _selfPatterns = this,
            _observer;

        //---------------------------------
        // Inicio Patrón Command
        //---------------------------------

        (function () {
            // Constructor quien administra los observados
            function Command() {
                var _commands = {},
                    _api = this;

                _api.on = function (command, fnCallback) {
                    _commands[command] = function () {
                        fnExecFunction(fnCallback, ...arguments);
                        return _api;
                    };
                    return _api;
                }
                _api.off = function (command) {
                    delete _commands[command];
                    return _api;
                }
                _api.trigger = function (command) {
                    let pars = fnParametersWithoutFirst(...arguments) || [];
                    fnExecFunction(_commands[command], ...pars);
                    return _api;
                } // end function

                // Public API
                return _api;
            } // emnd constructor

            // Public API
            Object.defineProperty(_selfPatterns, 'command', { get: () => new Command() });
        })();

        //---------------------------------
        // Fin Patrón Command
        //---------------------------------


        //---------------------------------
        // Inicio Patrón Observer
        //---------------------------------

        (function () {
            var _currentId = 0;

            // Constructor quien administra los observados
            function Subject() {
                var _observers = new Map(),
                    _api = this;

                _api.add = function (cbListener) {
                    var observed = new Observer(cbListener);
                    _observers.set(observed.id, observed);
                    return observed.id;
                }
                _api.remove = function (id) {
                    _observers.delete(id);
                    return _api;
                }
                _api.notify = function (id) {
                    if (_observers.has(id)) _observers.get(id).update(fnParametersWithoutFirst(arguments));
                    return _api;
                } // end function

                return _api;
            } // end constructor

            // Constructor observado, key, listenNotify
            function Observer(cbListener) {
                this.update = function () {
                    fnExecFunction(cbListener, ...arguments);
                    return this;
                };
                this.id = ++_currentId;
            } // end function

            // Public API
            Object.defineProperty(_selfPatterns, 'observer', { get: () => new Subject() });
        })();

        //---------------------------------
        // Fin Patrón Observer
        //---------------------------------

		/*
			//---------------------------------
			// Se obtiene una instancia única del objeto a evaluar
			//---------------------------------
			// Parámetros
			//---------------------------------
			// @referencia:         {object}    Referencia al objeto que se quiere evaluar.
			// @funcionInstancia:   {object}    Función que retorna la instancia del objeto a evaluar.
			//---------------------------------
			// Retorna: Objeto resultante de la funcion de instancia, más la propiedad de singletonInstance.
			//---------------------------------
		*/
        function fnSingleton(referencia, funcionInstancia) {
            if (referencia && referencia.singletonInstance) return referencia;
            if (!fnIsFunction(funcionInstancia)) return;

            referencia = funcionInstancia();
            Object.defineProperty(referencia, { value: true });
            referencia.singletonInstance = true;
            return referencia;
        } // end function
        //---------------------------------

        /*
            //---------------------------------
            // Patrón para el manejo de dependencias, usa get para solicitar los archivos del paquete
            //---------------------------------           
        */
        (function() {
            function ServiceLocator() {
                var _self = this,
                    _contenedor = new Map(),
                    _packages = new Map(),
                    _promisesGet = new Map();
                
                // Obtiene los paquetes si estos ya se solicitaron, si no se solicitan y se guardan
                function _get(nameOrPackage) {
                    var isStringPackage = typeof nameOrPackage === 'string',
                        packageName = isStringPackage ? nameOrPackage : nameOrPackage.name,
                        _package = _packages.get(packageName) || nameOrPackage;

                    if(!_package.paths) throw "Package does not have any path: " + nameOrPackage;

                    return new Promise(function(resolve, reject) {
                        var resolvePackage, dependenciesPromises;
                        if(_contenedor.has(packageName)) resolvePackage = Promise.resolve({ response: _contenedor.get(packageName) });
                        else {
                            dependenciesPromises = [];
                            // Evaluar dependencias
                            _package.dependencies && _package.dependencies.forEach(dependencie => {
                                if(!_promisesGet.has(dependencie)) {
                                    _promisesGet.set(dependencie, _get(dependencie));
                                    dependenciesPromises.push(_promisesGet.get(dependencie));
                                }
                            });
                            if(!_promisesGet.has(_package.name)) {
                                _promisesGet.set(_package.name, Promise.all(dependenciesPromises).then(() => fnGet(_package.paths)));
                            } 
                            resolvePackage = _promisesGet.get(_package.name);
                        }

                        resolvePackage.then(function(result) {
                            var packages = [];

                            (!_packages.has(packageName) ? _setPackages([result.response]) : Promise.resolve()).then(function() {
                                _package = _packages.get(packageName);
                                _package.namespaces.forEach(function(ns) { packages.push(fnImport(ns)); });
                                _contenedor.set(packageName, packages);                         
                                resolve(packages);
                            });

                        }, reject);
                    });
                }

                // Asigna la información de los paquetes, o descarga el json que los contiene
                function _setPackages(pathOrPackages) {
                    var resolve = typeof pathOrPackages === 'string' ? fnGet(pathOrPackages) : Promise.resolve({ response: pathOrPackages });
                    return resolve.then(function(result) {
                        if(!(result.response instanceof Array)) result.response = [result.response];
                        result.response.forEach(_package => {
                            if(_packages.has(_package.name)) return;
                            _packages.set(_package.name, { 
                                name: _package.name,
                                paths: _package.paths, 
                                namespaces: _package.namespaces, 
                                dependencies: _package.dependencies
                            });
                        });
                    });
                }

                function api(nameOrPackage) {
                    if(typeof nameOrPackage === 'string') {
                        return /.+(\.|\/).+/.test(nameOrPackage) ? _setPackages(nameOrPackage) : _get(nameOrPackage);
                    }

                    if(typeof nameOrPackage === 'object') return _setPackages(nameOrPackage);
                    if(nameOrPackage instanceof Array) return _setPackages(nameOrPackage);
                }

                api.remove = function(nameOrPackage) {
                    var isStringPackage = typeof nameOrPackage === 'string',
                        packageName = isStringPackage ? nameOrPackage : nameOrPackage.name,
                        _package = _packages.get(packageName) || nameOrPackage;

                    if(_package) {
                        (_package.namespaces) && _package.namespaces.forEach(ns => fnImport(ns, true));
                        (_package.paths) && _package.paths.forEach(path => {
                            var tag = document.querySelector(`[data-name="${path}"]`)
                            tag && tag.parentNode.removeChild(tag);
                        });
                    }

                    _contenedor.delete(nameOrPackage);
                    _promisesGet.delete(nameOrPackage);
                    
                    return Promise.resolve();
                }

                return api;
            }

            // Public API
            Object.defineProperty(_patterns, 'serviceLocator', { get: () => new ServiceLocator() });
        })();

        // Public API
        this.addNS('singleton', fnSingleton);
    }).call(_patterns);

    //---------------------------------
    // Fin Patrones de Diseño
    //---------------------------------





    //---------------------------------
    // Public API
    //---------------------------------

    // Herramientas
    jr.isFunction = fnIsFunction;
    jr.parametersWithoutFirst = fnParametersWithoutFirst;
    jr.execFunction = fnExecFunction;
    jr.errorHandler = fnErrorHandler;
    jr.getQuerys = getQuerys;
    jr.insertAfter = fnInsertAfter;
    jr.deleteTag = fnDeleteTag;
    jr.parseJsonDate = fnParseJsonDate;
    jr.now = fnNow;

    // Métodos para NameSpacing
    jr.namespace = Namespace;
    jr.import = fnImport;

    // Métodos para peticiones asíncronas
    jr.get = fnGet;
    jr.tagScriptLink = fnTagScriptLink;
    jr.replaceWith = fnReplaceWith;
    jr.setHTML = fnSetFragmentFromHTML;
    jr.compileHTML = fnCompileHTML;
    jr.compileSetHTML = fnCompileSetHTML;

    // Patrones de Diseño
    jr.patterns = _patterns;
    //---------------------------------

    //---------------------------------
    // Variables globales
    //---------------------------------

    // Variable para validar los nombres de espacios
    jr.validateNS = /^[a-zA-Z]?[a-zA-z0-9]+$/;
    // Contador de tags
    jr.countTags = 0;
    // Variables de configuración
    jr.filesToUpdate = [];
    // Variable para conocer si se esta navegando bajo el protocolo seguro (https)
    jr.ssl = location.origin.indexOf('https') > -1;
    jr.dev = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
    //-----------------------------

    // Legunaje de la página
    jr.lang = document.querySelector("html").getAttribute("lang");

    // Inicio de Peticiones asincronas
    fnInitJMain();
})(window);
//---------------------------------


/*
REQUEST_OBJECT = new function () {
    return {
        src: '{string} Ruta para el request.',
        then: '{function} Función de callback.',
        catch: '{function} Función de callback.',
        mime: '{string} Mime Type especial, este se puede obtener a través de la extensión.',
        cache: '{bool} Identifica si se debe realizar la petición al servidor.',
        method: '{string} Identifica el verbo que se debe usar en la petición.',
        value: '{Object} Valores que se enviaran en la petición.'
    }
} // end function;
*/