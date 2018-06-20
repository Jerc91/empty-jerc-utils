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
            .pipe($.sourcemaps.init({ loadMaps: true }))
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.concat(currentPackage.name + '.css'))
            .pipe($.replace(/\?[\w.#}&]+\=[\w.#]+/gi, ''))
            .pipe($.replace(/(\.\.\/){1,}/gi, '../'))
            .pipe($.replace(/(@font-face( )?\{([^}]){1,}\})/gm, ''))
            .pipe($.cleanCss())
            .pipe($.sourcemaps.write('.', {
                sourceMappingURL: (file) => `${config.paths.domain}${file.relative.replace(/\\/gm, '/')}.map`
            }))
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
    'build'
]));
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para compilar los archivos fonts
//--------------------------------------------------------------
gulp.task('fonts', function () {
    currentTask = `fonts`;
    log('Copying prod fonts assets...');

    return gulp.src(`${config.paths.dev}${config.types.fonts}`, { base: config.paths.dev })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Función para compilar los archivos sass
//--------------------------------------------------------------
gulp.task('buildSass', function () {
    currentTask = `buildSass`;
    log('Building sass assets...');
    let globs = [];

    // Especificación de archivos
    config.sass.forEach(record => {
        let name = path.basename(record),
            nameCss = name.replace('.scss', '.css');

        gulp.src(`${config.paths.dev}sass/${name}`)
            .pipe($.plumber({ errorHandler: handleError }))
            .pipe($.sourcemaps.init({ loadMaps: true }))
            .pipe($.sass({ outputStyle: 'compressed' }))
            .pipe($.concat(nameCss))
            .pipe($.sourcemaps.write('.', {
                sourceMappingURL: file => {
                    let path = file.relative.replace(/\\/gm, '/');
                    return `${config.paths.domain}${config.paths.libs}css/${path}.map`
                }
            }))
            .pipe(gulp.dest(`${config.paths.prod}${config.paths.libs}css`));

        globs[globs.length] = '!' + record;
    });

    // Compilación del Sass
    globs[globs.length] = `!${config.paths.dev}sass/${config.types.sass}`;
    globs[globs.length] = `${config.paths.dev}${config.types.sass}`;
    
    gulp.src(globs, { base: config.paths.dev })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.sourcemaps.init({ loadMaps: true }))
        .pipe($.sass({ outputStyle: 'compressed' }))
        .pipe($.sourcemaps.write('.', {
            sourceMappingURL: file => `${config.paths.domain}${file.relative.replace(/\\/gm, '/')}.map`
        }))
        .pipe(gulp.dest(config.paths.prod));
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Tarea para minificar los .css
gulp.task('min:css', function () {
    currentTask = `min:css`;
    log('Copying prod css assets...');

    // Copia de archivos
    return gulp.src(`${config.paths.dev}${config.types.css}`, { base: config.paths.dev })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.sourcemaps.init({ loadMaps: true }))
        .pipe($.cleanCss())
        .pipe($.sourcemaps.write('.', {
            sourceMappingURL: (file) => `${config.paths.domain}${file.relative.replace(/\\/gm, '/')}.map`
        }))
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
    gulp.src(`${config.paths.dev}${config.types.html}`, { base: config.paths.dev })
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
    gulp.src(`${config.paths.dev}${config.types.jade}`, { base: config.paths.dev })
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

    return gulp.src(`${config.paths.dev}${config.types.js}`, { base: config.paths.dev })
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.sourcemaps.init({ loadMaps: true }))
        .pipe(minifyJS({
            removeConsole: true,
            removeDebugger: true,
            removeUndefined: true
        }))
        .pipe($.sourcemaps.write('.', {
            sourceMappingURL: file => `${config.paths.domain}${file.relative.replace(/\\/gm, '/')}.map`
        }))
        .pipe(gulp.dest(config.paths.prod));
});

gulp.task('optimize:js', function () {
    let streams = [];
    currentTask = `optimize:js`;
    log('Optimize js assets...');

    return gulp.src(config.paths.prod + config.types.js)
        .pipe($.plumber({ errorHandler: handleError }))
        .pipe($.sourcemaps.init({ loadMaps: true }))
        .pipe($.optimizeJs())
        .pipe($.sourcemaps.write('.', {
            sourceMappingURL: file => `${config.paths.domain}${file.relative.replace(/\\/gm, '/')}.map`
        }))
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
    gulp.src(`${config.paths.dev}${config.types.json}`, { base: config.paths.dev })
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
    gulp.src(`${config.paths.dev}${config.types.img}`, { base: config.paths.dev })
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

    // Watch Dev: Config, CSS, HTML, JS, JSON
    watchFiles([`${config.paths.dev}${config.types.css}`], ['min:css'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.html}`], ['min:html'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.img}`], ['min:img'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.js}`], ['min:js'], fnChange);
    watchFiles([`${config.paths.dev}${config.types.json}`], ['min:json'], fnChange);

    // Build: JADE, SASS
    watchFiles([`${config.paths.dev}${config.types.jade}`], ['buildJade'], undefined, true);
    watchFiles([`${config.paths.dev}${config.types.sass}`], ['buildSass'], undefined, true);

    // Watch Prod: html, css
    watchFiles([`${config.paths.prod}${config.types.html}`], [], fnChange, config.paths.prod);
    watchFiles([`${config.paths.prod}${config.types.css}`], [], fnChange, config.paths.prod);

    // Configuración de appcache
    watchFiles(config.cache.files, [], fnChangeAppChache, true, config.paths.prod);

    // Función para observar archivos, globs
    function watchFiles(globs, tasks = [], fnHandlerChange, notExclude = false, basePath = config.paths.dev) {
        let filterArray = config.excludeWatchs.map(file => `!${basePath}${file}`);
        for (let glob of globs) filterArray.push(glob);

        $.watch(filterArray, vinylInstance => {
            log(`The file ${vinylInstance.path} is ${vinylInstance.event}`);

            if (tasks.length) gulp.start(tasks).on('end', e => {
                $.livereload.changed(vinylInstance.path)
                if (/\.(js|html|css)$/.test(vinylInstance.path)) $.livereload.changed(vinylInstance.path);
            });
            if (fnHandlerChange) {
                fnHandlerChange(vinylInstance);
                if (!tasks.length && /\.(js|html|css)$/.test(vinylInstance.path)) $.livereload.changed(vinylInstance.path);
            }
        });
    }
});
//--------------------------------------------------------------

//--------------------------------------------------------------
// Se inicia el proceso de observadores para minifficar versiones a producción
//--------------------------------------------------------------
gulp.task('build', ['vendor', 'fonts', 'buildSass', 'min:css', 'min:html', 'buildJade', 'min:js', 'optimize:js', 'min:json', 'min:img']);
gulp.task('default', ['watch'], function () {
    currentTask = `gulp`;
    filesToUpdate = require(`./${config.paths.prod}${config.paths.filesUpdate}`);
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
        var name = path.basename(vinylInstance.path),
            pathRelativeDev = vinylInstance.path.replace(`${__dirname}\\${config.paths.dev.replace('/','\\')}`, ''),
            pathRelativeProd = vinylInstance.path.replace(`${__dirname}\\${config.paths.prod.replace('/','\\')}`, '');

        console.log(pathRelativeDev, pathRelativeProd);

        if (vinylInstance.path.indexOf(config.paths.filesUpdate) > -1) return;
        if (config.cache.files.indexOf(pathRelativeDev.replace(/\\/g, '/')) > -1) return;
        if (config.cache.files.indexOf(pathRelativeProd.replace(/\\/g, '/')) > -1) return;

        // Solo para archivos finales
        if(/\.(jade|sass|scss)$/gm.test(name)) return;

        // Solo aplica para eliminar y modificar
        if (vinylInstance.event === typeEvent.change) {
            filesToUpdate[name] = moment().format('YYYY-MM-DD h:mm:ss a');
        } // end if
        else if (vinylInstance.event == typeEvent.unlink) {
            delete filesToUpdate[name];
            fs.unlinkSync(vinylInstance.path.replace(/\\/g, '/').replace(config.paths.dev, config.paths.prod));
        } // end else

        // Se guarda FilesToUpdate
        fs.writeFileSync(`./${config.paths.prod}${config.paths.filesUpdate}`, JSON.stringify(filesToUpdate));
    } catch (e) {
        handleError(e);
    }
}

function fnChangeAppChache(vinylInstance) {
    try {
        // varables privadas
        var serviceWorker = fs.readFileSync(`./${config.paths.prod}${config.paths.serviceWorker}`).toString(),
            requesterTools = fs.readFileSync(`./${config.paths.prod}${config.paths.requesterTools}`).toString(),
            newValue;

        // Solo aplica para eliminar y modificar
        if (vinylInstance.event in typeEvent) {
            config.cache.version = semver.inc(config.cache.version, 'patch');
            config.cache.date = moment().format('DD/MM/YYYY, h:mm:ss a');

            // Para service worker
            /\|['"](\d+\.\d+.\d+)["']/mg.exec(serviceWorker).forEach((match, i) => {
                switch (i) {
                    case 1:
                        newValue = serviceWorker.replace(match, config.cache.version);
                        break;
                }
            });

            /=(\[["'].*?\])/mg.exec(newValue).forEach((match, i) => {
                switch (i) {
                    case 1:
                        newValue = newValue.replace(match, JSON.stringify(config.cache.files));
                        break;
                }
            });

            // Se guarda serviceWorker
            fs.writeFileSync(`./${config.paths.prod}${config.paths.serviceWorker}`, newValue);


            // Para requester tools
            /(\d+\.\d+\.\d+)/mg.exec(requesterTools).forEach((match, i) => {
                switch (i) {
                    case 1:
                        newValue = requesterTools.replace(match, config.cache.version);
                        break;
                }
            });

            // Se guarda serviceWorker
            fs.writeFileSync(`./${config.paths.prod}${config.paths.requesterTools}`, newValue);
        }

        // Se actualiza la versión en el archivo de configuración
        fs.writeFileSync('./config/config.json', JSON.stringify(config, null, 2));
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