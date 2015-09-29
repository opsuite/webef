var config = {
	"src": {
		"path": "src/",
		"files": {			
			"ts": "./src/**/*.ts",
			"html": "./src/**/*.htm'",
			"css": "./src/**/*.css",
			"other": "./src/**/*!(.ts)",
			"all":	"./src/**/*.*"
		}
		
	},
	"build": {
		"path": "dist/",
	},
	"tsd": {		
        "command": "reinstall",
		"latest": false,
        "config": "./tsd.json"		
	}
}
var gulp = require('gulp');
var ts = require('gulp-typescript');
var merge = require('merge2');
var tsProject = ts.createProject(config.src.path+'tsconfig.json');
var tsd = require('gulp-tsd'); 
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

gulp.task('tsd', tsd_task);
gulp.task('build', build_task);

function tsd_task(callback) { tsd(config.tsd, callback); }

function build_task() {
    var tsResult = gulp.src( config.src.files.ts ).pipe(ts(tsProject));    
    return merge([ // Merge the two output streams, so this task is finished when the IO of both operations are done. 
        tsResult.dts.pipe(gulp.dest( config.build.path)),
        tsResult.js
		.pipe(gulp.dest( config.build.path)) 
		.pipe(uglify())
		.pipe(rename({extname: '.min.js'}))
		.pipe(gulp.dest( config.build.path))
	]);
}

