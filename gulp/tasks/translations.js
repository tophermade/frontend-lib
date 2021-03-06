var gulp = require( 'gulp' );
var plugins = require( 'gulp-load-plugins' )();
var sequence = require( 'run-sequence' );
var renameLangs = require( '../plugins/gulp-rename-langs.js' );
var splitTranslations = require( '../plugins/gulp-split-translations.js' );
var sanitizeTranslations = require( '../plugins/gulp-sanitize-translations.js' );

module.exports = function( config )
{
	gulp.task( 'translations:extract', function()
	{
		return gulp.src( [
			'src/**/*.{js,html}',
			'!src/bower-lib/**/*',
		] )
			.pipe( plugins.angularGettext.extract( 'main.pot' ) )
			.pipe( gulp.dest( 'build/translations' ) );
	} );

	gulp.task( 'translations:compile', function()
	{
		return gulp.src( config.libDir + '/' + config.translations + '/**/*.po' )
			.pipe( plugins.angularGettext.compile( {
				format: 'json',
			} ) )
			// Works around a difference in poeditor and angular-gettext: en-us -> en_US.
			.pipe( renameLangs() )
			.pipe( sanitizeTranslations() )
			.pipe( splitTranslations( config.translationSections ) )
			.pipe( gulp.dest( config.buildDir + '/translations' ) );
	} );
};
