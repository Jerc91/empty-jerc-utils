// TODO: Cuando es una petición de service worker ver si es necesario leer el blob o solo usar los métodos nativos de JS

// Espacio de nombres
self.tools = {};

// Definición del módulo
(function () {
    var _factoryError,
        _filestToUpdateSaved;

    // Mime types que permite el worker para importar archivos
    var MIMES = {
        BLOB: 'application/octet-stream',
        CSS: 'text/css; charset="utf-8"',
        IMG: 'image/jpeg',
        JS: 'text/javascript; charset="utf-8"',
        JSON: 'application/json; charset="utf-8"',
        TEXT: 'text/plain; charset="utf-8"',
        FORMQ: 'application/x-www-form-urlencoded',
        FORMDATA: 'multipart/form-data'
    }, DB = {
        NAME: 'jrTable',
        VERSION: 1,
        TABLE: 'files',
        KEYPATH: 'name'
    }; // Tipos de archivo por defecto

	/*
		//---------------------------------
		// Inicio del worker, toma el FileSystem y antes toma el archivo, si el archivo no esta en
		// explorador éste es creado
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @pars:           información del archivo a solicitar {}
		//---------------------------------
		// @pars.cache:     Para que no se guarde en el explorador de ser 0 ( 0 || 1)
		// @pars.src:       Dirección del archivo a solicitar.  ''
		// @pars.mime:      El tipo de mime que se traerá
		// @pars.method:    Tipo de petición que se hará al servidor
		// @pars.files:     Objeto que contiene los archivos a actualizar
		//---------------------------------
		// Retorna:	Retorna la respuesta del servidor
		//---------------------------------
	*/
    function fnGetFile(pars) {
        // variables privadas
        var data = {};

        // Se obtiene el nombre del archivo o ruta de la petición
        data.name = pars.src.split("/");
        data.name = data.name[data.name.length - 1];

        // Se combinan los parámetros de la petición a realizar, con parámetros por defecto
        Object.assign(data, {
            cache: true,
            method: 'GET',
            methodBody: 'blob'
        }, pars);

        // Se obtiene el mime de la petición
        fnGetMime(data);

        data.date = Date.parse(data.files[data.name]);
        data.srcToRequest = `${location.origin}/${pars.src}`;

        /*
            // Si el archivo se encuentra en el .json de archivos a actualizar (filesToUpdate) se valida la fecha
            // de la última modificación, con la fecha que se encuentra en el archivo local y si es mayor la fecha 
            // del objeto es mayor a la del local entonces se hace la petición al servidor y se guarda en el navegador.
        */
        return fnIsUpdateFile(data).then(updated => {
            return ((!updated || !data.cache) ? fnSendRequest(data) : data.getSavedFile(data)).then(fnGetObject, fnOnError);
        }, fnOnError);
    } // fin fnInit
    //---------------------------------

	/*
		//---------------------------------
		// Se hace solicitud al servidor y la respuesta es guardara con el API FileSystem, o CacheStorage
		// dependiendo de la configuración.
		//---------------------------------
		// Parámetros:
		//---------------------------------
		// @data: 	{object} Información de la petición a realizar.
		//---------------------------------
		// Retorna una promesa de fetch
		//---------------------------------
	*/
    function fnSendRequest(data) {
        var request = new Request(data.srcToRequest, {
            method: data.method,
            cache: 'no-cache',
            headers: new Headers({ "Content-Type": data.mime }),
            body: JSON.stringify(data.value)
        });

        // Se obtiene la respuesta del servidor y se retorna la promesa
        return fetch(request).then(function (response) {
            if (!response.ok) throw `${response.status} ${response.statusText}`;
            let promiseReponse;
            if(!data.cache) promiseReponse = fnGetResult(data, response);
            else promiseReponse = data.saveFile(data, response).then(fnSaveResponseDB);
            return promiseReponse;
        });
    } // fin método
    //---------------------------------

    /*
        //---------------------------------
        // Se captura la información y se envia a la App 
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // @data: 		{object} 	Información de la petición realizada.
        //---------------------------------
        // Retorna: Promesa con la respuesta de la petición
        //---------------------------------
    */
    function fnGetObject(data) {
        // TODO: Garbage collector
        return { 
            result: data.result, 
            path: data.src, 
            observedId: data.observedId 
        };
    }  // fin método
    //---------------------------------

    /*
        //---------------------------------
        // Función para obtener la extensión de un archivo
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // @name:       Ruta de la petición
        //---------------------------------
        // Retorna:     Propiedad de MIMES
        //---------------------------------
    */
    function fnGetMime(data) {
        var mime, extension, indiceQuery = data.name.indexOf('?'), nameSrc = data.name;
        if(indiceQuery > -1) nameSrc = nameSrc.substring(0, indiceQuery);
        extension = nameSrc.split('.');
        extension = extension[extension.length - 1].toLowerCase();

        // Imágenes
        switch(extension) {
            case 'jpg': 
            case 'png': 
                mime = MIMES.BLOB;
                break;
            case 'css':
                mime = MIMES.CSS;
                break;
            case 'js':
                mime = MIMES.JS;
                break;
            case 'json':
                mime = MIMES.JSON;
                data.isText = true;
                data.methodBody = 'json';
                break;
            case 'txt': 
            case 'html': 
                mime = MIMES.TEXT;
                data.methodBody = 'text';
                data.isText = true;
                break;
            default:
                mime = MIMES.JS;
                break;
        }

        data.mime = data.mime || mime;
    } // end function
    //---------------------------------

    /*
        //---------------------------------
        // Agrega texto dentro de la consola, para el manejo de errores
        //---------------------------------
        // Paràmetros:
        //---------------------------------
        // @e:  Parámetro que retorna un error en la estructura try, catch
        //---------------------------------
    */
    function fnOnError(error) {
        console.log(error);
        var strError = 'Error: ';
        strError += error;
        strError += ', ';
        _factoryError ? _factoryError(error.toString()) : console.log(strError);
        return error;
    }
    //---------------------------------

    /*
        //---------------------------------
        // Función para establecer la fomar en como se manejan los errores
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // Retorna:     Blob.
        //---------------------------------
    */
    function fnHandleError(fnCallback) {        
        _factoryError = fnCallback;
    }

    /*
        //---------------------------------
        // Obtiene un Promise por cada request que se haga
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // request:    Request que se realiza a IndexedDB
        //---------------------------------
        // Retorna:     {Promise}.
        //---------------------------------
    */
    function getRequestComplete(request) {
        return new Promise((resolve, reject) => {
            if(request.onerror === null) request.onerror = e => reject(e, request);
            if(request.onsuccess === null) request.onsuccess = e => resolve(e, request);
            else resolve(request);
        });
    }

    /*
        //---------------------------------
        // Obtiene un Promise una vez esta sea resuelta se envia el parámetro database
        //---------------------------------
        // Retorna:     {Promise.then(database)}.
        //---------------------------------
    */
    function getDB() {
        var request, 
            objectStore,
            database;

        return new Promise((resolve, reject) => {
            request = indexedDB.open(DB.NAME, DB.VERSION);
            // Se crea estructura de la base de datos
            request.onupgradeneeded = e => {
                database = e.target.result;
                objectStore = database.createObjectStore(DB.TABLE, { keyPath: DB.KEYPATH });
                objectStore.createIndex(DB.TABLE, DB.KEYPATH);
                objectStore.transaction.oncomplete = e => resolve(database);
            }
            getRequestComplete(request).then(e => resolve(e.target.result));
        });
    }
    
    /*
        //---------------------------------
        // Función para verificar del archivo en el navegador
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // data:    Información del archivo a verficar
        //---------------------------------
        // Retorna:     {bool}.
        //---------------------------------
    */
    function fnIsUpdateFile(data) {
        return new Promise((resolve, reject) => {
            if (_filestToUpdateSaved) {
                return resolve(updateFile(data));
            }

            getDB().then(database => {
                let resquest = database.transaction(DB.TABLE, 'readonly').objectStore(DB.TABLE).getAll();
                return getRequestComplete(resquest).then(request => {
                    _filestToUpdateSaved = {};
                    resquest.result.forEach(record => _filestToUpdateSaved[record[DB.KEYPATH]] = record.date);
                    resolve(updateFile(data));
                });
            });
        });

        function updateFile(_data) {
            let infoSaved = _filestToUpdateSaved[_data.name];
            return infoSaved && !isNaN(_data.date) ? infoSaved.valueOf() >= _data.date : true;
        }
    }

    /*
        //---------------------------------
        // Función para verificar del archivo en el navegador
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // data:    Información del archivo a verficar
        //---------------------------------
        // Retorna:     {bool}.
        //---------------------------------
    */
    function fnSaveResponseDB(data) {
        return getDB().then(database => {
            let resquest = database.transaction(DB.TABLE, 'readwrite').objectStore(DB.TABLE).put({ name: data.name, date: data.date });
            return getRequestComplete(resquest).then(request => {
                _filestToUpdateSaved[data[DB.KEYPATH]] = data.date;
                return data;
            });
        });
    }

    /*
        //---------------------------------
        // Función para obtener el body de la respuesta del servidor
        //---------------------------------
        // Parámetros:
        //---------------------------------
        // data:        Información de la petición realizada
        // response:    Respuesta del servidor
        //---------------------------------
        // Return;      Promise
        //---------------------------------
    */
    function fnGetResult(data, response) {
        return response[data.methodBody]().then(result => {
            data.result = result;
            if(result instanceof Blob && !result.type) data.result = result.slice(result, result.size, data.mime);
            return data;
        });
    }

    //---------------------------------
    // Public API
    //---------------------------------
    this.factoryError = fnHandleError;
    this.getFile = fnGetFile;
    this.sendRequest = fnSendRequest;
    this.saveResponseDB = fnSaveResponseDB;
    this.getResult = fnGetResult;
    //---------------------------------
}).call(self.tools);