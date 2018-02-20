//--------------------------------------------------------------
// Directivas
//--------------------------------------------------------------
const fs = require('fs'),
    path = require('path'),
    moment = require('moment'),
    semver = require('semver'),
    gulp = require('gulp'),
    $ = require('gulp-load-plugins')(),
    gulpsync = $.sync(gulp),
    minifyJS = require('gulp-babel-minify'),
    exec = require('child_process').exec,
    del = require('del'),
    merge = require('merge-stream'),
    glob = require('glob');
//--------------------------------------------------------------

//--------------------------------------------------------------
// Variables Publicas
//--------------------------------------------------------------
const config = require('./config/config.json'),
    vendorFiles = require(config.packages.path),
    typeEvent = { added: "added", change: "change", unlink: "unlink" },
    vendorBuild = {};

let currentTask = '',
    filesToUpdate,
    pathToCopy;

//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para copiar los recursos externos descargados por bower en la carpeta de assets
//--------------------------------------------------------------

//--------------------------------------------------------------
// Vendor Build
(function (api) {
    // private methods
    // get info of packages
    function getPackage(_package, type) {
        currentTask = `vendor:${type}`;

        let currentPackage = {},
            pathVendor = type !== 'fonts' ? '/' : '';

        currentPackage.optionsSrc = { cwd: config.paths.packages };
        if (typeof _package === 'object') {
            currentPackage.globs = _package.globs;
            currentPackage.name = _package.name;

            if (!currentPackage.globs.filter(glob => glob.includes('@')).length)
                currentPackage.path = _package.path || (config.paths.libs + type + pathVendor);
            else
                currentPackage.path = _package.path || '';
        } else {
            currentPackage.globs = fnGetPackages();
            currentPackage.name = config.packages.name;
            currentPackage.path = config.paths.libs + type + pathVendor;
        }

        if (/copy|html|sass/.test(type)) {
            if (_package.staticPath) currentPackage.optionsSrc.base = config.paths.packages;
        }

        log(`Copying base vendor ${type} assets... ${typeof _package !== 'function' ? currentPackage.name : ''}`);

        return currentPackage;
    }

    function getGlobs(currentPackage) {
        let globs = currentPackage.globs.map(glob => {
            let nuevoGlob = glob.toString();
            if (nuevoGlob.includes('@')) {
                nuevoGlob = nuevoGlob.replace('@', '');
                currentPackage.optionsSrc.base = undefined;
            }
            return nuevoGlob;
        });
        return globs;
    }

    // get dest path of packages
    function getPackageDestPath(currentPackage, vinylInstance, type) {
        let endPath = `${config.paths.prod}${currentPackage.path}`,
            relativePath = vinylInstance.relative,
            fixedPath;

        currentPackage.globs.filter(glob => {
            let newPath;
            if (glob.includes('@')) {
                if (currentPackage.path.lastIndexOf('/') != currentPackage.path.length - 1) currentPackage.path += '/';
                newPath = glob.substring(glob.indexOf('@') + 1).replace(/\\/g, '/');
                if (newPath.includes(vinylInstance.relative)) {
                    console.log(currentPackage.path);
                    fixedPath = `${config.paths.prod}${currentPackage.path}${newPath.replace(vinylInstance.relative, '')}`;
                }
            }
        });

        del.sync(`${endPath}/${relativePath}`);
        return fixedPath || endPath;
    }

    // public methods
    // concatSourcemap of files js
    api.buildJS = function (_package) {
        var currentPackage = getPackage(_package, 'js'),
            globs = getGlobs(currentPackage);
        //if(currentPackage.name == 'compiler') return;
        return gulp.src(globs, currentPackage.optionsSrc)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.filter(config.types.js))
            .pipe($.concat(currentPackage.name + '.js'))
            .pipe(minifyJS({
                removeConsole: true,
                removeDebugger: true,
                removeUndefined: true
            }))
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // concatSourcemap of files css
    api.buildCSS = function (_package) {
        var currentPackage = getPackage(_package, 'css');

        return gulp.src(currentPackage.globs, currentPackage.optionsSrc)
            .pipe($.filter(config.types.css))
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.concat(currentPackage.name + '.css'))
            .pipe($.replace(/\?[\w.#}&]+\=[\w.#]+/gi, ''))
            .pipe($.replace(/(\.\.\/){1,}/gi, '../'))
            .pipe($.replace(/(@font-face( )?\{([^}]){1,}\})/gm, ''))
            .pipe($.cleanCss())
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // files fonts
    api.buildFonts = function (_package) {
        var currentPackage = getPackage(_package, 'fonts');

        return gulp.src(currentPackage.globs, currentPackage.optionsSrc)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.filter(config.types.fonts))
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // files html
    api.buildHTML = function (_package) {
        var currentPackage = getPackage(_package, 'html');

        return gulp.src(currentPackage.globs, currentPackage.optionsSrc)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.filter(config.types.html))
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // files sass
    api.copySass = function (_package) {
        var currentPackage = getPackage(_package, 'sass');
        currentPackage.path = `sass/vendor/${currentPackage.name}/`;

        return gulp.src(currentPackage.globs, currentPackage.optionsSrc)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.filter(config.types.sass))
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // to copy
    api.buildCopy = function (_package) {
        var currentPackage = getPackage(_package, 'copy'),
            globs = getGlobs(currentPackage);

        return gulp.src(globs, currentPackage.optionsSrc)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe(gulp.dest(vinylInstance => getPackageDestPath(currentPackage, vinylInstance)));
    };
    // resume functions
    api.buildPackage = function (_package) {
        let globFixed = _package.globs.filter(record => record.includes('@'));
        if (globFixed.length) {
            let newPakage = JSON.parse(JSON.stringify(_package));
            newPakage.globs = globFixed;
            api.buildCopy(newPakage);
        }

        _package.globs = _package.globs.filter(record => !record.includes('@'));
        api.buildJS(_package);
        api.buildCSS(_package);
        api.buildFonts(_package);
        api.buildHTML(_package);
        api.copySass(_package);
    };
})(vendorBuild);

// Setup task vendor
gulp.task('vendor:js', vendorBuild.buildJS);
gulp.task('vendor:css', vendorBuild.buildCSS);
gulp.task('vendor:fonts', vendorBuild.buildFonts);
gulp.task('vendor:html', vendorBuild.buildHTML);
gulp.task('vendor:sass', vendorBuild.buildSass);
gulp.task('bower', () => $.bower());

// concatSourcemap of files packages
gulp.task('vendor:packages', function () {
    currentTask = `vendor:packages`;
    log('Copying vendor assets packages..');
    fnGetPackages(true).forEach(_package => vendorBuild.buildPackage(fnGetPackages(_package)));
});
gulp.task('vendor', gulpsync.sync([
    'bower', 'vendor:js', 'vendor:css', 'vendor:fonts', 'vendor:packages',
    'fonts', 'buildCSS', 'buildJade', 'min:css', 'min:html', 'min:js', 'min:img', 'min:json', 'optimize:js'
]));
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para compilar los archivos fonts
//--------------------------------------------------------------
gulp.task('fonts', function () {
    currentTask = `fonts`;
    log('Copying prod fonts assets...');

    return gulp.src(config.paths.dev + config.types.fonts)
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para compilar los archivos less
//--------------------------------------------------------------
gulp.task('buildCSS', function () {
    currentTask = `buildCSS`;
    log('Copying dev less assets...');

    var pathSource = `${config.paths.dev}less/`,
        pathDest = `${config.paths.dev}${config.paths.libs}css`,
        streamCss, streamSass;

    // Compilación del less
    gulp.src(config.less, { cwd: pathSource, base: pathSource })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.less())
        .on('end', sass)
        .pipe(gulp.dest(pathDest));

    function sass() {
        var promises = [];

        // Compilación del Sass
        pathSource = `${config.paths.dev}sass/`,
            config.sass = config.sass || [];

        log('Copying dev sass assets...');
        config.sass.forEach((record) => {
            var name = path.basename(record),
                nameCss = name.replace('.scss', '.css');

            streamSass = gulp.src(`${pathSource}${record}`).pipe($.sass()).pipe($.concat(name));
            streamCss = gulp.src(`${pathDest}/${nameCss}`).pipe($.concat(nameCss));

            promises.push(new Promise((resolve, reject) => {
                merge(streamCss, streamSass)
                    .on('end', resolve)
                    .pipe($.plumber({ errorHandler: handleError }))
                    .pipe($.concat(nameCss))
                    .pipe(gulp.dest(pathDest));
            }));
        });

        Promise.all(promises).then(() => setTimeout(() => gulp.start('min:css'), 10));
    }
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .css
gulp.task('min:css', function () {
    currentTask = `min:css`;
    log('Copying prod css assets...');

    // Copia de archivos
    return gulp.src(config.paths.dev + config.types.css)
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.cleanCss())
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .html
//--------------------------------------------------------------
gulp.task('min:html', function () {
    currentTask = `min:html`;
    log('Copying prod html assets...');

    // Copia de archivos HTML
    gulp.src(config.paths.dev + config.types.html, { base: config.paths.dev })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.htmlmin({
            minifyJS: true, minifyCSS: true,
            removeComments: true, collapseWhitespace: true,
            ignoreCustomFragments: [/<pre><code>[\s\S]*?<\/code><\/pre>/g]
        }))
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .html
//--------------------------------------------------------------
gulp.task('buildJade', function () {
    currentTask = `buildJade`;
    log('Building jade assets...');

    // Copia de archivos HTML
    gulp.src(config.paths.dev + config.types.jade, { base: config.paths.dev + 'jade' })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.jade({ petry: true }))
        .pipe($.htmlmin({
            minifyJS: true, minifyCSS: true,
            removeComments: true, collapseWhitespace: true,
            ignoreCustomFragments: [/<pre><code>[\s\S]*?<\/code><\/pre>/g]
        }))
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .js
//--------------------------------------------------------------
gulp.task('min:js', function () {
    let streams = [];
    currentTask = `min:js`;
    log('Copying prod js assets...');

    return gulp.src(config.paths.dev + config.types.js, { base: config.paths.dev + 'js' })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe(minifyJS({
            removeConsole: true,
            removeDebugger: true,
            removeUndefined: true
        }))
        .pipe(gulp.dest(config.paths.prod));
});

gulp.task('optimize:js', function () {
    let streams = [];
    currentTask = `optimize:js`;
    log('Copying prod js assets...');

    return gulp.src(config.paths.prod + config.types.js)
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.optimizeJs())
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .json
//--------------------------------------------------------------
gulp.task('min:json', function () {
    currentTask = `min:json`;
    log('Copying prod json assets...');

    // Copia de archivos
    gulp.src(config.paths.dev + config.types.json, { base: config.paths.dev + 'json' })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.jsonminify())
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar las img
//--------------------------------------------------------------
gulp.task('min:img', function () {
    currentTask = `min:img`;
    log('Copying prod images assets...');

    // Copia de archivos
    gulp.src(config.paths.dev + config.types.img, { base: config.paths.dev + 'img' })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.imagemin())
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para observar los archivos
gulp.task('watch', function () {
    currentTask = `watch`;
    log('Starting watch and LiveReload..');
    $.livereload.listen();
    let pathFile = config.paths.dev + config.paths.libs;

    // Watch
    // Config, CSS, HTML, JS, JSON, LESS
    watchFiles([`${config.paths.dev}${config.types.css}`], ['min:css'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.html}`], ['min:html'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.img}`], ['min:img'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.jade}`], ['buildJade'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.js}`], ['min:js'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.json}`], ['min:json'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.less}`, `${config.paths.dev}${config.types.sass}`], ['buildCSS']);

    // Configuración de appcache
    watchFiles(config.cache.files, [], fnChangeAppChache, true);

    // Función para observar archivos, globs
    function watchFiles(globs, tasks, fnHandlerChange, notExclude = false) {
        let filterArray = config.excludeWatchs.map(file => `!${config.paths.dev}${file}`);

        for (let file of config.cache.files) filterArray.push(`${!notExclude ? "!" : ''}${config.paths.dev}${file}`);
        if (!notExclude) for (let glob of globs) filterArray.push(glob);

        $.watch(filterArray, vinylInstance => {
            if (tasks.length) gulp.start(tasks).on('end', e => $.livereload.changed(vinylInstance.path));
            if (fnHandlerChange) {
                fnHandlerChange(vinylInstance);
                if (!tasks.length) $.livereload.changed(vinylInstance.path);
            }
        });
    }
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Se inicia el proceso de observadores para minifficar versiones a producción
//--------------------------------------------------------------
gulp.task('default', ['watch'], function () {
    currentTask = `gulp`;
    filesToUpdate = require(`./${config.paths.dev}json/${config.paths.libs}config/filesToUpdate.json`);
    // Se ejeccuta server
    exec(config.scriptServer);
    log('Se crea servidor');
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para crear el archivo filesToUpdate
//--------------------------------------------------------------
function fnChange(vinylInstance) {
    try {
        if (vinylInstance.path.indexOf(config.paths.filesUpdate) > -1) return;

        // varables privadas
        var name = path.basename(vinylInstance.path).replace(/\.jade$/, '.html');

        // Solo aplica para eliminar y modificar
        if (vinylInstance.event === typeEvent.change) {
            filesToUpdate[name] = moment().format('YYYY-MM-DD h:mm:ss a');
        } // end if
        else if (vinylInstance.event == typeEvent.unlink) {
            delete filesToUpdate[name];
            fs.unlinkSync(vinylInstance.path.replace(/\\/g, '/').replace(config.paths.dev, config.paths.prod));
        } // end else

        // Se guarda FilesToUpdate
        fs.writeFileSync(`./${config.paths.dev}json/${config.paths.libs}${config.paths.filesUpdate}`, JSON.stringify(filesToUpdate, null, 4));
        log(`The file ${name} is ${vinylInstance.event}`);
        gulp.start(['min:json']);
    } catch (e) {
        handleError(e);
    }
}

function fnChangeAppChache(vinylInstance) {
    try {
        // varables privadas
        var serviceWorker = fs.readFileSync(`./${config.paths.dev}${config.paths.serviceWorker}`).toString(),
            newValue, archivosProd;

        // Solo aplica para eliminar y modificar
        if (vinylInstance.event in typeEvent) {
            config.cache.version = semver.inc(config.cache.version, 'patch');
            config.cache.date = moment().format('DD/MM/YYYY, h:mm:ss a');

            // Para service worker
            /CACHE_VERSION \= \'(.+)\'\,/.exec(serviceWorker).forEach((match, i) => {
                switch (i) {
                    case 1:
                        newValue = serviceWorker.replace(match, config.cache.version);
                        break;
                }
            });

            /CACHE_FILES \= (\[([^\[]+)?\])\,/mg.exec(serviceWorker).forEach((match, i) => {
                switch (i) {
                    case 1:
                        archivosProd = config.cache.files.map(archivo => {
                            return archivo.replace('.jade', '.html').split('/').splice(1).join('/');
                        });
                        newValue = newValue.replace(match, JSON.stringify(archivosProd, null, 4));
                        break;
                }
            });
            // Se guarda serviceWorker.json
            fs.writeFileSync(`./${config.paths.dev}${config.paths.serviceWorker}`, newValue);
        }

        // Se guarda FilesToUpdate
        log(`The file ${path.basename(vinylInstance.path)} is ${vinylInstance.event}`);
        fs.writeFileSync(`./config.json`, JSON.stringify(config, null, 2));
        gulp.start(['min:json', 'min:js']);
    } catch (e) {
        handleError(e);
    }
}
//--------------------------------------------------------------

//--------------------------------------------------------------
// Error handler
//--------------------------------------------------------------
function handleError(error) {
    let lineNumber = (error.lineNumber) ? `Line ${error.lineNumber} -- ` : '',
        pluginName = (error.plugin) ? `: [${error.plugin}]` : `[${currentTask}]`,
        report = '',
        chalk = $.util.colors.white.bgRed;

    $.notify({ title: 'Task Failed ' + pluginName, message: lineNumber + ' See console.' }).write(error);
    $.util.beep();

    report += `${chalk('Task: ')}${pluginName}\n`;
    report += `${chalk('Error: ')}${error.message}\n`;
    report += lineNumber;

    if (error.lineNumber) { report += chalk('LINE:') + ' ' + error.lineNumber + '\n'; }
    if (error.fileName) { report += chalk('FILE:') + ' ' + error.fileName + '\n'; }

    console.error(report);
}
//--------------------------------------------------------------
// log to console using 
//--------------------------------------------------------------
function log(msg) {
    $.util.log($.util.colors.green(msg));
}
//--------------------------------------------------------------

/*
    //--------------------------------------------------------------
    // Función para obtener los paquetes: de tipo string, object.
    // Para obtener los paquetes que agrupan otros paquetes
    //--------------------------------------------------------------
*/
function fnGetPackages(single = false) {
    if (typeof single == 'boolean') {
        if (single === false) return vendorFiles.filter(record => typeof record == 'string' && !record.includes('@'));
        if (single === true) {
            let packages = vendorFiles.filter(record => typeof record == 'object');

            if (vendorFiles.filter(record => typeof record == 'string' && record.includes('@')).length) {
                packages.push({
                    '': vendorFiles.filter(record => typeof record == 'string' && record.includes('@'))
                });
            }

            return packages;
        }
    }
    if (typeof single == 'object') {
        var _package = { path: '' },
            lastIndex;

        for (var i in single) _package = { name: i, globs: single[i] };
        lastIndex = _package.name.lastIndexOf('/');
        _package.staticPath = lastIndex > -1;

        if (_package.staticPath) {
            _package.path = _package.name.toString();
            _package.name = _package.name.substring(lastIndex, _package.name.length);
        }

        return _package;
    }
} // end function
//--------------------------------------------------------------