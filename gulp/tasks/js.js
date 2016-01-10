var _ = require( 'lodash' );
var gulp = require( 'gulp' );
var gutil = require( 'gulp-util' );
var plugins = require( 'gulp-load-plugins' )();
var streamqueue = require( 'streamqueue' );
var fs = require( 'fs' );

var injectModules = require( '../plugins/gulp-inject-modules.js' );
var lazyStates = require( '../plugins/gulp-lazy-states.js' );

module.exports = function( config )
{
	var baseDir = '../../../../../';

	// This depends on html2js.
	require( './html2js.js' )( config );

	// Pull their bower file.
	var bower = require( baseDir + 'bower.json' );

	function getBowerComponentFiles( component )
	{
		var files = [];
		var mainFile = null;

		// Try to get the bower config for this component.
		var componentBower = require( baseDir + config.bowerDir + component + '/.bower.json' );
		if ( componentBower.main ) {
			if ( _.isString( componentBower.main ) && componentBower.main.match( /\.js$/ ) ) {
				mainFile = componentBower.main;
			}
			else if ( _.isArray( componentBower.main ) ) {
				_.forEach( componentBower.main, function( file )
				{
					if ( file.match( /\.js$/ ) ) {
						mainFile = file;
						return false;  // Found the file, stop looping.
					}
				} );
			}
		}

		if ( component == 'modernizr' ) {
			mainFile = 'modernizr.js';
		}
		else if ( component == 'marked' ) {
			mainFile = 'lib/marked.js';
		}
		else if ( component == 'ace-builds' ) {
			mainFile = 'src/ace.js';
		}
		else if ( component == 'masonry' ) {
			mainFile = 'dist/masonry.pkgd.js';
		}
		else if ( component == 'script.js' ) {
			mainFile = 'dist/script.js';
		}
		else if ( component == 'jcrop' ) {
			mainFile = 'js/jquery.Jcrop.min.js';
		}
		else if ( component == 'ng-file-upload' ) {
			config.extraBower['ng-file-upload'] = [
				'angular-file-upload-html5-shim.js'
			];
		}
		else if ( !mainFile ) {
			gutil.log( gutil.colors.red( 'Component not found: ' + component ) );
		}

		if ( mainFile ) {
			mainFile = mainFile.replace( './', '' );
			files.push( config.bowerDir + component + '/' + mainFile );
		}

		// Does this bower component also have an extra file to pull in from our config?
		if ( config.extraBower && config.extraBower[component] ) {
			var extraFiles = config.extraBower[component];
			if ( _.isString( extraFiles ) ) {
				extraFiles = [ extraFiles ];
			}

			if ( _.isArray( extraFiles ) ) {
				_.forEach( extraFiles, function( extraFile )
				{
					files.push( config.bowerDir + component + '/' + extraFile );
				} );
			}
		}

		return files;
	}

	// Do we need to include any html2js templates for vendor common?
	// This is mostly for angular-ui-bootstrap.
	var vendorCommonDepends = [];
	if ( config && config.extraBower && config.extraBower['angular-bootstrap'] ) {
		_.forEach( config.extraBower['angular-bootstrap'], function( extraFile )
		{
			if ( extraFile.indexOf( 'datepicker.js' ) !== -1 ) {
				vendorCommonDepends.push( 'html2js:datepicker' );
			}
			else if ( extraFile.indexOf( 'timepicker.js' ) !== -1 ) {
				vendorCommonDepends.push( 'html2js:timepicker' );
			}
			else if ( extraFile.indexOf( 'tooltip.js' ) !== -1 ) {
				vendorCommonDepends.push( 'html2js:tooltip' );
			}
			else if ( extraFile.indexOf( 'pagination.js' ) !== -1 ) {
				vendorCommonDepends.push( 'html2js:pagination' );
			}
			else if ( extraFile.indexOf( 'modal.js' ) !== -1 ) {
				vendorCommonDepends.push( 'html2js:modal' );
			}
		} );
	}

	/**
	 * Build out the vendor JS.
	 */
	gulp.task( 'js:vendor', vendorCommonDepends, function()
	{
		var excludeBower = [];

		// Exclude bower files that are excluded in our config.
		if ( config.excludeBower ) {
			excludeBower = _.union( excludeBower, config.excludeBower );
		}

		// Don't include any bower files that we're pulling into separate modules.
		if ( config.modules ) {
			_.forEach( config.modules, function( moduleDefinition )
			{
				if ( moduleDefinition.bower ) {
					excludeBower = _.union( excludeBower, moduleDefinition.bower );
				}
			} );
		}

		var files = [];
		if ( bower.dependencies ) {

			_.forEach( bower.dependencies, function( version, component )
			{
				// Skip over any bower files that we'd like to exclude from the main build.
				if ( excludeBower && excludeBower.indexOf( component ) !== -1 ) {
					return true;
				}

				files = _.union( files, getBowerComponentFiles( component ) );
			} );
		}

		// Do we also have extra lib files to include?
		if ( config.extraLib ) {
			_.forEach( config.extraLib, function( extraFiles, repo )
			{
				if ( _.isString( extraFiles ) ) {
					extraFiles = [ extraFiles ];
				}

				if ( _.isArray( extraFiles ) ) {
					_.forEach( extraFiles, function( extraFile )
					{
						files.push( config.libDir + repo + '/' + extraFile );
					} );
				}
			} );
		}

		// Include the compiled vendor component templates.
		files.push( config.buildDir + '/tmp/vendor-component-templates/**/*.js' );

		gutil.log( 'Adding files to vendor: ' + gutil.colors.gray( JSON.stringify( files ) ) );

		if ( files.length ) {
			return gulp.src( files )
				.pipe( plugins.newer( config.buildDir + '/app/vendor.js' ) )
				.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.init() )
				.pipe( plugins.concat( 'vendor.js' ) )
				.pipe( config.production ? plugins.uglify() : gutil.noop() )
				.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.write( '.', {
					sourceRoot: '/../../src/app/',
				} ) )
				.pipe( plugins.size( { gzip: true, title: 'js:vendor' } ) )
				.pipe( gulp.dest( config.buildDir + '/app' ) )
				.pipe( plugins.connect.reload() )
		}
	} );

	/**
	 * Build out the section components.
	 */
	var sectionTasks = [];
	config.sections.forEach( function( section )
	{
		sectionTasks.push( 'js:' + section );

		gulp.task( 'js:' + section, [ 'html2js:' + section + ':components', 'js:translations:app' ], function()
		{
			// We don't include any app files that are being built into a separate module.
			var excludeApp = [];
			if ( config.modules ) {
				_.forEach( config.modules, function( moduleDefinition )
				{
					if ( moduleDefinition.components ) {
						moduleDefinition.components.forEach( function( component )
						{
							excludeApp.push( '!src/' + section + '/components/' + component + '/**/*.js' );
						} );
					}

					if ( moduleDefinition.views ) {
						moduleDefinition.views.forEach( function( view )
						{
							excludeApp.push( '!src/' + section + '/views/' + view + '/**/*.js' );
						} );
					}

					if ( moduleDefinition.lib ) {
						_.forEach( moduleDefinition.lib, function( extraFiles, repo )
						{
							if ( _.isString( extraFiles ) ) {
								extraFiles = [ extraFiles ];
							}

							if ( _.isArray( extraFiles ) ) {
								_.forEach( extraFiles, function( extraFile )
								{
									excludeApp.push( '!' + config.libDir + repo + '/' + extraFile );
								} );
							}
						} );
					}
				} );
			}

			var stream = streamqueue(
					{ objectMode: true },

					// Pull in modules definitions only first.
					gulp.src( _.union( [
						'src/' + section + '/**/*.js',
						'!src/' + section + '/**/*-{service,controller,directive,filter,model,production,development,node}.js'
					], excludeApp ) ),

					// Then pull in the actual components.
					gulp.src( _.union( [
						'src/' + section + '/**/*-{service,controller,directive,filter,model}.js'
					], excludeApp ) ),

					// Pull in component template files if they were built.
					gulp.src( [ config.buildDir + '/tmp/' + section + '-component-templates/**/*.html.js' ] ),

					// Pull in main translation file.
					gulp.src( [ config.buildDir + '/tmp/translations/main.js' ] ),

					// Now pull in the development file if we're running a development environment build.
					gulp.src( [ (config.developmentEnv ? 'src/' + section + '/app-development.js' : '') ] )
				)
				.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.init() )
				.pipe( plugins.concat( 'app.js' ) );

			// Add in any injections here that may be configured.
			// They should go in before further processing.
			if ( config.injections ) {
				for ( var key in config.injections ) {
					stream = stream.pipe( plugins.replace( key, config.injections[ key ] ) );
				}
			}

			stream = stream
				.pipe( injectModules( config ) )
				.pipe( config.production ? plugins.ngAnnotate() : gutil.noop() )
				.pipe( config.production ? plugins.uglify() : gutil.noop() )
				.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.write( '.', {
					sourceRoot: '/../../src/' + section + '/',
				} ) )
				.pipe( plugins.size( { gzip: true, title: 'js:' + section } ) )
				.pipe( gulp.dest( config.buildDir + '/' + section ) )
				.pipe( plugins.connect.reload() );

			return stream;
		} );
	} );

	gulp.task( 'js:sections', sectionTasks );

	/**
	 * Build out the modules.
	 */
	var moduleBuilds = [];
	if ( config.modules ) {

		// We loop through all of the modules we need to build and set up gulp tasks to build them.
		_.forEach( config.modules, function( moduleDefinition, outputFilename )
		{
			// Create the gulp task to build this module.
			gulp.task( 'js:module:' + outputFilename, [ 'html2js:modules' ], function()
			{
				var files = [];
				if ( moduleDefinition.bower ) {
					_.forEach( moduleDefinition.bower, function( component )
					{
						files = _.union( files, getBowerComponentFiles( component ) );
					} );
				}

				if ( moduleDefinition.lib ) {
					_.forEach( moduleDefinition.lib, function( extraFiles, repo )
					{
						if ( _.isString( extraFiles ) ) {
							extraFiles = [ extraFiles ];
						}

						if ( _.isArray( extraFiles ) ) {
							_.forEach( extraFiles, function( extraFile )
							{
								files.push( config.libDir + repo + '/' + extraFile );
							} );
						}
					} );
				}

				if ( moduleDefinition.componentVendor ) {
					_.forEach( moduleDefinition.componentVendor, function( component )
					{
						files.push( config.gjLibDir + 'components/' + component + '/*-vendor.js' );
					} );
				}

				gutil.log( 'Build module ' + outputFilename + ' with files: ' + gutil.colors.gray( JSON.stringify( files ) ) );

				var args = [];
				args.push( { objectMode: true } );

				if ( files.length ) {
					args.push( gulp.src( files ) );
				}

				// Component files?
				if ( moduleDefinition.components ) {
					moduleDefinition.components.forEach( function( component )
					{
						// Pull in modules definitions only first.
						args.push( gulp.src( [
							'src/app/components/' + component + '/**/*.js',
							'!src/app/components/' + component + '/**/*-{service,controller,directive,filter,model,production,development,node}.js',
						] ) );

						// Then pull in the actual components.
						// We pull in any html2js files in here as well.
						args.push( gulp.src( [
							'src/app/components/' + component + '/**/*-{service,controller,directive,filter,model}.js',
							config.buildDir + '/tmp/module-templates/' + component + '/**/*.html.js',
						] ) );
					} );
				}

				// Views files?
				if ( moduleDefinition.views ) {
					moduleDefinition.views.forEach( function( view )
					{
						// Pull in modules definitions only first.
						args.push( gulp.src( [
							'src/app/views/' + view + '/**/*.js',
							'!src/app/views/' + view + '/**/*-{service,controller,directive,filter,model,production,development,node}.js',
						] ) );

						// Then pull in the actual views.
						args.push( gulp.src( [
							'src/app/views/' + view + '/**/*-{service,controller,directive,filter,model}.js'
						] ) );
					} );
				}

				// Call it with the arguments we've built up.
				var stream = streamqueue.apply( streamqueue, args )
					.pipe( plugins.newer( config.buildDir + '/app/modules/' + outputFilename ) )
					.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.init() )
					.pipe( plugins.concat( outputFilename ) )
					.pipe( injectModules( config ) )
					// .pipe( lazyStates( { outputFile: config.buildDir + '/app/modules/' + outputFilename + 'on' } ) )  // `on` makes `js` + `on`. =]
					.pipe( config.production ? plugins.ngAnnotate() : gutil.noop() )
					.pipe( config.production ? plugins.uglify() : gutil.noop() )
					.pipe( config.noSourcemaps ? gutil.noop() : plugins.sourcemaps.write( '.', {
						sourceRoot: '/../../src/app/modules/',
					} ) )
					.pipe( plugins.size( { gzip: true, title: 'js:module:' + outputFilename } ) )
					.pipe( gulp.dest( config.buildDir + '/app/modules' ) )
					.pipe( plugins.connect.reload() )

				return stream;
			} );

			// Now store this module build task reference.
			moduleBuilds.push( 'js:module:' + outputFilename );
		} );
	}
	gulp.task( 'js:modules', moduleBuilds );

	/**
	 * Copy any node app components.
	 */
	gulp.task( 'js:node:app', function()
	{
		// Only if we are including node files.
		if ( config.includeNode ) {
			var src = config.sections.map( function( section )
			{
				return 'src/' + section + '/**/*-node.js';
			} );

			return gulp.src( src, { base: 'src' } )
				.pipe( gulp.dest( config.buildDir ) );
					}
	} );

	/**
	 * This one sets up a config block to include the app's main translation file.
	 * It should be included by the app.js compiler.
	 */
	gulp.task( 'js:translations:app', function()
	{
		if ( config.translations ) {
			return gulp.src( [
					'src/lib/' + config.translations + '/en/main.toml',
				] )
				.pipe( plugins.newer( config.buildDir + '/tmp/translations/main.js' ) )
				.pipe( plugins.toml() )
				.pipe( plugins.wrapper( {
					header: 'angular.module( "App" ).config( [ "$translatePartialLoaderProvider", function( a ) { a.setPart( "en", "main", ',
					footer: ').addPart( "main" ); } ] );',
				} ) )
				.pipe( plugins.rename( 'main.js' ) )
				.pipe( plugins.size( { gzip: true, title: 'js:translation:main' } ) )
				.pipe( gulp.dest( config.buildDir + '/tmp/translations' ) )
				.pipe( plugins.connect.reload() );
		}
	} );

	/**
	 * This creates individual .json files for translating modules.
	 */
	gulp.task( 'js:translations:modules', function()
	{
		if ( config.translations ) {
			return gulp.src( [
					'src/lib/' + config.translations + '/**/*.toml',
					'!src/lib/' + config.translations + '/**/main.toml',
				] )
				.pipe( plugins.newer( {
					dest: config.buildDir + '/app/translations',
					ext: '.json'
				} ) )
				.pipe( plugins.toml() )
				.pipe( plugins.size( { gzip: true, title: 'js:translation:modules', showFiles: true } ) )
				.pipe( gulp.dest( config.buildDir + '/app/translations' ) )
				.pipe( plugins.connect.reload() );
		}
	} );

	gulp.task( 'js:translations', [ 'js:translations:modules' ] );

	gulp.task( 'js', [ 'js:vendor', 'js:translations', 'js:sections', 'js:modules', 'js:node:app' ] );
};
