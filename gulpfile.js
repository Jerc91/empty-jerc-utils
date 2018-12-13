// TODO:
// Usar una configuración más fácil para los packages, similar a epik, documentar la forma de usar los packages
// Validar logs
// Cambio de versión de cache a service worker y no de json versión
// No esta actualizando la versión después de mucho rato
// validar que se esten ejecutando las tareas de min a producciòn cuando se hace un cambio en desarrollo
// Utilizar notificaciones de windows, y jshint
// https://dquinn.net/gulp-error-reporting-with-jshint-gulp-notify-and-livereload/
// Ver si es fácil si hay notificaciones para W7
// Generar error cuando no encuentre los archivos de packages en gulp vendor:packages
// Ver tareas de paso a producción 
// Se debe modificar la tarea de vendor para actualizar el filestoupdate
'use strict';

// Manejo de errores globales en promesas
const printError = error => error && logger(error).trace();
process.on('uncaughtException', printError);
process.on('unhandledRejection', printError);

// Directivas
const
	del = require('del'),
	exec = require('child_process').exec,
	fs = require('fs'),
	globs = require('globs'),
	minimist = require('minimist'),
	moment = require('moment'),
	path = require('path'),
	read = fs.readFileSync,
	semver = require('semver'),
	vinylPaths = require('vinyl-paths'),
	gulp = require('gulp'),
	$ = require('gulp-load-plugins')();

// Variables Publicas
const
	rutaConfiguracion = './config/config.json',
	configuracion = require(rutaConfiguracion),
	rutaFilesToUpdate = `./${configuracion.paths.dev}${configuracion.paths.filesUpdate}`,
	rutaRequester = `./${configuracion.paths.prod}${configuracion.paths.requesterTools}`,
	rutaServiceWorker = `./${configuracion.paths.prod}${configuracion.paths.serviceWorker}`,
	filesToUpdate = require(rutaFilesToUpdate),
	opciones = minimist(process.argv.slice(2)),
	esDesarrollo = (opciones.env || process.env.NODE_ENV || 'development') == 'development',
	apiVendor = {},
	typeEvent = { added: "added", change: "change", unlink: "unlink" },
	REGEXS = {
		css: () => new RegExp('\\.{?[^s]*css.*}?$', 'gmi'),
		fonts: () => new RegExp('\\.{?.*woff2|eot.*}?$', 'gmi'),
		js: () => new RegExp('\\.{?.*js.*}?$', 'gmi'),
		sass: () => new RegExp('\\.{?.*scss|sass.*}?$', 'gmi')
	},
	opcionesSrc = { base: configuracion.paths.dev, read: true },
	procesadoresCSS = [
		require('css-mqpacker')(), 
		require('cssnano')(),
	];

let generarAlIniciar = true,
	conWatch = false,
	esTaskVendor = false,
	requesterTools,
	serviceWorker,
	pathToCopy;

// Módulo para la creación de paquetes terceros
(api => {
	/**
	 * Organiza una sola vez los paquetes por tipos
	 * @return {Function(tipo: string)}     obtiene el tipo de paquetes
	 */
	const obtenerPaquetes = (function() {
		const mapaPaquetes = new Map(),
			bibliotecaArchivos = require(configuracion.packages.path);

		bibliotecaArchivos.map(paquete => {
			let tipo = '',
				nombreConcatenado = path.basename(paquete.to),
				patronGlobs;

			if(paquete.from instanceof Array) {
				paquete.from.find(archivo => tipo = obtenerTipopatronGlob(archivo));
			} else {
				tipo = obtenerTipopatronGlob(paquete.from, tipo);
			}

			if(nombreConcatenado.includes('.')) {
				paquete.nombreConcatenado = nombreConcatenado;
				paquete.to = path.dirname(paquete.to);
			}
			patronGlobs = mapaPaquetes.get(tipo) || [];
			patronGlobs[patronGlobs.length] = paquete;

			if(!mapaPaquetes.has(tipo)) {
				mapaPaquetes.set(tipo, patronGlobs);
			}
		});

		/**
		 * Obtiene los paquetes por tipo
		 * @param  {string} tipo tipo de paquete se obtiene de evaluar los paquetes REGEXS[tipo].
		 * @return {Array<{from: string, to: string}>}      listado de paquetes del tipo indicado.
		 */
		return function(tipo) {
			return mapaPaquetes.get(tipo);
		}
	}());

	/**
	 * Obtiene el tipo al que corresponde un patronGlob
	 * @param  {string} patronGlob patrón que determina la búsqueda de archivos
	 * @return {string}      tipo al que pertenece el patronGlob.
	 */
	function obtenerTipopatronGlob(patronGlob) {
		for (let tipo in REGEXS) {
			if(REGEXS[tipo]().test(patronGlob)) {
				return tipo;
			}
		}
		return '';
	}

	/**
	 * Genera las promesas por paquete del archivo de configuración ./config/vendor.json
	 * @param  {string}   tipo     cadena de texto que representa el tipo a tratar (REGEXS[tipo]).
	 * @param  {Function(paquete, resolve, reject)} callback recibe el paquete actual, función para resolver o rechazar la promesa.
	 * @return {Promise<{from, to}>}            obtiene los paquetes que cumplan con el tipo a tratar.
	 */
	function generarPromesas(tipo, callback) {
		let paquetes = obtenerPaquetes(tipo);
		if(!paquetes) return Promise.resolve();
		return Promise.all(paquetes.map(paquete => new Promise((resolve, reject) => callback(paquete, resolve, reject))));
	}

	/**
	 * Elimina los archivos resultado de la copia de los archivos configurados
	 * @return {Promise} Promesa que finaliza al eliminar los patronGlobs resultados de los paquetes.
	 */
	async function eliminarPaquetes(done) {
		await Promise.all([
			generarPromesas('css', eliminarTipo),
			generarPromesas('fonts', eliminarTipo),
			generarPromesas('js', eliminarTipo),
			generarPromesas('sass', eliminarTipo),
		]);

		done();

		/**
		 * Elimina los archivos resultado de la copia de los paquetes
		 * @param  {from: string, to: string} paquete paquete actual
		 * @param  {Function} resolve resuelve la promesa
		 * @param  {Function} reject  rechaza la promesa
		 * @return {Promise}         promesa que una vez elimine los arhivos resultado del paquete se completa.
		 */
		function eliminarTipo(paquete, resolve, reject) {
			let rutaDestino = `${configuracion.paths.prod}${paquete.to}/`.replace('//', '/'),
				patronGlobs = paquete.nombreConcatenado ? `${rutaDestino}${paquete.nombreConcatenado}` : paquete.from;

			return gulp.src(patronGlobs, { allowEmpty: true })
				.on('error', reject)
				.pipe(vinylPaths(paquetes => {
					return del(Array.from(paquetes instanceof Array ? paquetes : [paquetes]).map(patronGlob => {
						return patronGlob.includes(configuracion.paths.prod) ? patronGlob : `${__dirname}/${rutaDestino}${path.basename(patronGlob)}`;
					}));
				}).on('end', resolve))
				.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }));
		}
	}

	/**
	 * Copia los archivos .js que se configuraron a la carpeta de desarrollo.
	 * @return {Promise} Promesa que finaliza al tratar los patronGlobs de los paquetes.
	 */
	function construirJS() {
		return generarPromesas('js', (paquete, resolve, reject) => {
			return gulp.src(paquete.from)				
				.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
				.pipe($.filter(configuracion.types.js))
				.pipe($.newer(`${configuracion.paths.prod}${paquete.to}`))
				.pipe(paquete.nombreConcatenado ? $.concat(paquete.nombreConcatenado) : $.noop())
				.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
				.pipe($.babelMinify({
					removeConsole: true,
					removeDebugger: true,
					removeUndefined: true
				}))
				.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
				.pipe(gulp.dest(`${configuracion.paths.prod}${paquete.to}`).on('end', resolve));
		});
	};

	/**
	 * Copia los archivos .css que se configuraron a la carpeta de desarrollo.
	 * @return {Promise} Promesa que finaliza al tratar los patronGlobs de los paquetes.
	 */
	function construirCSS() {
		return generarPromesas('css', (paquete, resolve, reject) => {
			return gulp.src(paquete.from)
				.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
				.pipe($.filter(configuracion.types.css))
				.pipe($.newer(`${configuracion.paths.prod}${paquete.to}`))
				.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
				.pipe(paquete.nombreConcatenado ? $.concat(paquete.nombreConcatenado) : $.noop())
				.pipe($.replace(/\?[\w.#}&]+\=[\w.#]+/gi, ''))
				.pipe($.replace(/(\.\.\/){1,}/gi, '../'))
				.pipe($.replace(/(@font-face( )?\{([^}]){1,}\})/gm, ''))
				.pipe($.postcss(procesadoresCSS))
				.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
				.pipe(gulp.dest(`${configuracion.paths.prod}${paquete.to}`).on('end', resolve));
		});
	};

	/**
	 * Copia los archivos .fonts que se configuraron a la carpeta de producción.
	 * @return {Promise} Promesa que finaliza al tratar los patronGlobs de los paquetes.
	 */
	function construirFonts() {
		return generarPromesas('fonts', (paquete, resolve, reject) => {
			return gulp.src(paquete.from)
				.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
				.pipe($.filter(configuracion.types.fonts))
				.pipe($.newer(`${configuracion.paths.prod}${paquete.to}`))
				.pipe($.fontmin())
				.pipe(gulp.dest(`${configuracion.paths.prod}${paquete.to}`).on('end', resolve));
		});
	};

	/**
	 * Copia los archivos .sass que se configuraron a la carpeta de desarrollo.
	 * @return {Promise} Promesa que finaliza al tratar los patronGlobs de los paquetes.
	 */
	function construirSass() {
		return generarPromesas('sass', (paquete, resolve, reject) => {
			return gulp.src(paquete.from)
				.pipe($.filter(configuracion.types.sass))
				.pipe($.newer(`${configuracion.paths.dev}${paquete.to}`))
				.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
				.pipe(gulp.dest(`${configuracion.paths.dev}${paquete.to}`).on('end', resolve));
		});
	};

	// API
	api.eliminarPaquetes = eliminarPaquetes;
	api.construirCSS = construirCSS;
	api.construirFonts = construirFonts;
	api.construirJS = construirJS;
	api.construirSass = construirSass;
})(apiVendor);

// Tareas paquetes terceros
gulp.task('vendor:clean', apiVendor.eliminarPaquetes);
gulp.task('vendor:css', apiVendor.construirCSS);
gulp.task('vendor:fonts', apiVendor.construirFonts);
gulp.task('vendor:js', apiVendor.construirJS);
gulp.task('vendor:sass', apiVendor.construirSass);

/**
 * Copia y optimiza las fuentes
 */
gulp.task('fonts', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.fonts}`;
	return gulp.src(`${configuracion.paths.dev}${configuracion.types.fonts}`, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe($.fontmin())
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Compila los archivos less configurados
 */
gulp.task('less', async done => {
	let patronGlobs = [`${configuracion.paths.dev}${configuracion.types.less}`, `!${configuracion.paths.dev}less/${configuracion.types.less}`],
		rutaFinal = `${configuracion.paths.dev}${configuracion.paths.libs}css`,
		promesas = [];

	// Archivos configurados
	globs(configuracion.less.map(patronGlob => `${configuracion.paths.dev}less/${patronGlob}`), (error, archivos) => {
		if(error) return promesas[promesas.length] = Promise.reject();
		if(!archivos.length) return promesas[promesas.length] = Promise.resolve();

		archivos.forEach(archivo => {
			let nombreArchivo = path.basename(archivo),
				nombreCss = nombreArchivo.replace('.less', '.css'),
				patronGlobActual = `${configuracion.paths.dev}less/**/${nombreArchivo}`;
			
			patronGlobs[patronGlobs.length] = `!${patronGlobActual}`;
			promesas[promesas.length] = new Promise((resolve, reject) => {
				return gulp.src(patronGlobActual, { read: opcionesSrc.read })
					.pipe(conWatch ? $.watch(patronGlob).on('ready', resolve) : $.noop())
					.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
					.pipe($.changed(patronGlobActual))
					.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
					.pipe($.less())
					.pipe($.postcss(procesadoresCSS))
					.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
					.pipe(gulp.dest(rutaFinal));
			});			
		});
	});

	await Promise.all(promesas);

	return gulp.src(patronGlobs, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlobs).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(`${configuracion.paths.dev}${configuracion.types.less}`))
		.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
		.pipe($.less())
		.pipe($.postcss(procesadoresCSS))
		.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
		.pipe(gulp.dest(configuracion.paths.dev));
});

/**
 * Copia y minifica los archivos css
 */
gulp.task('min:css', done => {
 	let patronGlob = `${configuracion.paths.dev}${configuracion.types.css}`;
	return gulp.src(`${configuracion.paths.dev}${configuracion.types.css}`, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
		.pipe($.postcss(procesadoresCSS))
		.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Copia y minifica los archivos html
 */
gulp.task('min:html', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.html}`;
	return gulp.src(patronGlob, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe($.htmlmin({
			minifyJS: true, minifyCSS: true,
			removeComments: true, collapseWhitespace: true,
			ignoreCustomFragments: [/<pre><code>[\s\S]*?<\/code><\/pre>/g]
		}))
		.pipe(gulp.dest(configuracion.paths.prod))
});

/**
 * Optimiza las imágenes
 */
gulp.task('min:img', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.img}`;
	return gulp.src(patronGlob, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe($.imagemin())
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Minifica y optimiza los archivos js
 */
gulp.task('min:js', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.js}`;
	return gulp.src(patronGlob, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error).trace() }))
		.pipe($.changed(patronGlob))
		.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
		.pipe($.babelMinify({
			removeConsole: true,
			removeDebugger: true,
			removeUndefined: true
		}))
		.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Minifica los archivos json
 */
gulp.task('min:json', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.json}`;
	return gulp.src(patronGlob, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe($.jsonminify())
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Compila y minifica los archivos html
 */
gulp.task('pug', done => {
	let patronGlob = `${configuracion.paths.dev}${configuracion.types.pug}`;
	return gulp.src(patronGlob, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlob).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(patronGlob))
		.pipe($.pug({ pettry: true }))
		.pipe($.htmlmin({
			minifyJS: true, minifyCSS: true,
			removeComments: true, collapseWhitespace: true,
			ignoreCustomFragments: [/<pre><code>[\s\S]*?<\/code><\/pre>/g]
		}))
		.pipe(gulp.dest(configuracion.paths.prod));
});

/**
 * Compila los archivos sass configurados
 */
gulp.task('sass', async done => {
	let patronGlobs = [`${configuracion.paths.dev}${configuracion.types.sass}`, `!${configuracion.paths.dev}sass/${configuracion.types.sass}`],
		rutaFinal = `${configuracion.paths.dev}${configuracion.paths.libs}css`,
		promesas = [];
	// Archivos configurados
	globs(configuracion.sass.map(patronGlob => `${configuracion.paths.dev}sass/${patronGlob}`), (error, archivos) => {
		if(error) return promesas[promesas.length] = Promise.reject();
		if(!archivos.length) return promesas[promesas.length] = Promise.resolve();

		archivos.forEach(archivo => {
			let nombreArchivo = path.basename(archivo),
				nombreCss = nombreArchivo.replace('.sass', '.css'),
				patronGlobActual = `${configuracion.paths.dev}sass/**/${nombreArchivo}`;
			
			patronGlobs[patronGlobs.length] = `!${patronGlobActual}`;
			promesas[promesas.length] = new Promise((resolve, reject) => {
				return gulp.src(patronGlobActual, { read: opcionesSrc.read })
					.pipe(conWatch ? $.watch(patronGlobActual).on('ready', resolve) : $.noop())
					.pipe($.plumber({ errorHandler: error => resolve(logger(error.message).trace()) }))
					.pipe($.changed(patronGlobActual))
					.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
					.pipe($.sass({ errorToConsole: true }))
					.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
					.pipe(gulp.dest(rutaFinal));
			});			
		});
	});

	await Promise.all(promesas);

	return gulp.src(patronGlobs, opcionesSrc)
		.pipe(conWatch ? $.watch(patronGlobs).on('ready', done) : $.noop())
		.pipe($.plumber({ errorHandler: error => logger(error.message).trace() }))
		.pipe($.changed(`${configuracion.paths.dev}${configuracion.types.sass}`))
		.pipe(esDesarrollo ? $.sourcemaps.init({ loadMaps: true }) : $.noop())
		.pipe($.sass({ errorToConsole: true }))
		.pipe(esDesarrollo ? $.sourcemaps.write() : $.noop())
		.pipe(gulp.dest(configuracion.paths.dev))
});

/**
 * Observa los archivos compilados y actualiza los archivos de cache
 */
gulp.task('watch', done => {
	let excludes = configuracion.excludeWatchs.map(exclude => '!' + exclude),
		patronGlobs = [`${configuracion.paths.prod}/**`].concat(excludes);
	
	conWatch = esDesarrollo;
	if(conWatch) {
		opcionesSrc.read = false;
	} else {
		return done();		
	}

	if(esTaskVendor) {
		$.watch(patronGlobs, administrarCambio);
		return done();
	}

	gulp.series('build')(error => {
		if(error) {
			done();
			return logger(error).trace();
		}

		$.watch(patronGlobs, administrarCambio);
		done();
	});
});

/**
 * Observa los archivos compilados y actualiza los archivos de cache
 */
gulp.task('server', async done => {
	exec(configuracion.scriptServer, {}, error => {
		if(error) return logger(error).trace();
		logger('Se crea servidor').log();
		done();
	});
});

/**
 * Inicia las tareas para compilar los archivos
 */
gulp.task('build', gulp.parallel([
	'fonts', gulp.series(['sass', 'min:css']), 'min:html', 'min:img', 'min:js', 'min:json', 'pug'
]));

/**
 * Actualiza el archivo que administra la versión de los archivos para ser actualizados en el cliente
 * @param  {VinylFile} vinylFile Instancia de viny, que contiene la información del archivo modificado
 */
function administrarCambio(vinylFile) {
	try {
		let rutaArchivo = vinylFile.path.replace(/\\/g, '/'),
			nombre = path.basename(vinylFile.path);

		requesterTools = requesterTools || read(rutaRequester).toString();
		serviceWorker = serviceWorker || read(rutaServiceWorker).toString();

		rutaArchivo = rutaArchivo.replace(`${__dirname}/${configuracion.paths.prod}`.replace(/\\/g, '/'), '');
		if(configuracion.paths.filesUpdate == rutaArchivo) return;

		logger(`The file ${path.basename(vinylFile.path)} is ${vinylFile.event}`).log();
		if (configuracion.cache.files.indexOf(rutaArchivo) > -1)
			return cambiarVersionCache(vinylFile);

		if (vinylFile.event === typeEvent.change) {
			filesToUpdate[nombre] = moment().format('YYYY-MM-DD h:mm:ss a');
		} else if (vinylFile.event == typeEvent.unlink) {
			delete filesToUpdate[nombre];
		}

		fs.writeFileSync(rutaFilesToUpdate, JSON.stringify(filesToUpdate));
		//$.livereload.changed(vinylFile.path);
	} catch (e) {
		logger(e).trace();
	}
}

/**
 * Actualiza los archivos que administran la versión del cache
 * @param  {VinylFile} vinylFile Instancia de viny, que contiene la información del archivo modificado
 */
function cambiarVersionCache(vinylFile) {
	try {
		let comandoAumentar = 'patch',
			requesterToolsActualizado, 
			serviceWorkerActualizado;

		// Solo aplica para eliminar y modificar
		if (vinylFile.event in typeEvent) {
			if(configuracion.cache.version.includes('.99.')) {
				comandoAumntar = 'major';
			}
			else if(configuracion.cache.version.endsWith('99')) {
				comandoAumntar = 'minor';
			}

			configuracion.cache.version = semver.inc(configuracion.cache.version, comandoAumentar);
			configuracion.cache.date = moment().format('DD/MM/YYYY, h:mm:ss a');

			requesterToolsActualizado = requesterTools.replace(/(\d+\.\d+\.\d+)/mg, configuracion.cache.version);
			serviceWorkerActualizado = serviceWorker.replace(/=(\[["'].*?\])/mg, `=${JSON.stringify(configuracion.cache.files)}`);

			fs.writeFileSync(rutaRequester, requesterToolsActualizado);
			fs.writeFileSync(rutaServiceWorker, serviceWorkerActualizado);
			fs.writeFileSync(rutaConfiguracion, JSON.stringify(configuracion, null, 2));

			//$.livereload.reload(vinylFile);
		}
	} catch (e) {
		logger(e).trace();
	}
}

/**
 * Imprime información en consola
 * @param  {arguments} vinylFile Instancia de viny, que contiene la información del archivo modificado
 * @return {[type]} [description]
 */
function logger() {
	let parametros = arguments;
	return {
		trace: () => console.trace("\x1b[32m", ...parametros),
		log: () => console.log("\x1b[32m", ...parametros)
	}
}

/**
 * Inicia las tareas de observar los archivos compilados y compila dichos archivos
 */
gulp.task('test', gulp.series(gulp.parallel(['min:img', 'pug']), ['watch']));
gulp.task('vendor', done => {
	esTaskVendor = true;
	gulp.series(['vendor:clean', 'watch'], gulp.parallel(['vendor:css', 'vendor:fonts', 'vendor:js', 'vendor:sass']))(function(error) {
		if(error) {
			done();
			return logger(error).trace();
		}
		
		done();
	});
});
gulp.task('default', gulp.series(['build', 'watch', 'server']));