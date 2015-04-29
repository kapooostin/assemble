'use strict';

/**
 * Module dependencies
 */

var diff = require('diff');
var chalk = require('chalk');
var es = require('event-stream');
var Task = require('orchestrator');
var Template = require('template');
var vfs = require('vinyl-fs');
var _ = require('lodash');

/**
 * Local dependencies
 */

var session = require('./lib/session');
var stack = require('./lib/stack');
var init = require('./lib/init');

/**
 * Initialize `Assemble`
 *
 * @param {Object} `context`
 * @api private
 */

function Assemble() {
  Template.apply(this, arguments);
  Task.apply(this, arguments);
  this.session = session;
  init(this);
}

_.extend(Assemble.prototype, Task.prototype);
Template.extend(Assemble.prototype);

/**
 * Initialize default configuration.
 */

Assemble.prototype.defaultOptions = function() {
  Assemble.__super__.defaultOptions.apply(this, arguments);
  this.disable('default routes');
};

/**
 * Specify source files using glob patterns or filepaths.
 * Options may be passed as a second argument.
 *
 * ```js
 * assemble.src('src/*.hbs', {layout: 'default'});
 *
 * // usage in a task
 * assemble.task('site', function() {
 *   assemble.src('src/*.hbs', {layout: 'default'})
 *     .pipe(assemble.dest('dist'));
 * });
 * ```
 *
 * @param {String|Array|Function} `patterns` Glob patterns, file paths, or renaming function.
 * @param {Object} `options` Options to pass to source plugins.
 * @api public
 */

Assemble.prototype.src = function (glob, options) {
  options = _.merge({}, this.options, options);
  if(this.enabled('minimal config') || options.minimal) {
    return vfs.src(glob, options);
  }
  return es.pipe.apply(es, [
    vfs.src(glob, options),
    stack.src.call(this, glob, options)
  ]);
};

/**
 * Specify the destination for processed files. Options
 * may be passed as a second argument.
 *
 * ```js
 * assemble.dest('_gh_pages/', {ext: '.html'});
 * ```
 * @param {String} `dest` Destination directory
 * @param {Object} `options` Options to be passed to `dest` plugins.
 * @api public
 */

Assemble.prototype.dest = function (dest, options) {
  options = options || {};
  if (this.enabled('minimal config') || options.minimal) {
    return vfs.dest(dest, options);
  }
  return es.pipe.apply(es, [
    stack.dest.call(this, dest, options),
    vfs.dest(dest, options)
  ]);
};

/**
 * Copy a `glob` of files to the specified `dest`.
 *
 * ```js
 * assemble.copy('assets/**', 'dist/');
 *
 * // usage in a task
 * assemble.task('copy-assets', function() {
 *   return assemble.copy('assets/**', 'dist/');
 * });
 * ```
 *
 * @param  {String|Array} `filepath` Source file path and/or glob patterns.
 * @param  {String|Function} `dest` Destination folder or function for renaming.
 * @param  {Object} `options` Additional options
 * @return {Stream} Stream to allow doing additional work.
 * @api public
 */

Assemble.prototype.copy = function(glob, dest, opts) {
  return vfs.src(glob, opts).pipe(vfs.dest(dest, opts));
};

/**
 * Define an assemble task. (read more about [tasks](./docs/tasks.md))
 *
 * ```js
 * assemble.task('default', function() {
 *   assemble.src('templates/*.hbs')
 *     .pipe(assemble.dest('dist/'));
 * });
 * ```
 *
 * @param {String} `name` Task name
 * @param {Function} `fn`
 * @api public
 */

Assemble.prototype.task = Assemble.prototype.add;

/**
 * `files` is a session-context-specific getter that
 * returns the collection of files from the current `task`.
 *
 * ```js
 * var files = assemble.files;
 * ```
 *
 * @name .files
 * @return {Object} Get the files from the current task.
 * @api public
 */

Object.defineProperty(Assemble.prototype, 'files', {
  enumerable: true,
  configurable: true,
  get: function () {
    var task = this.session.get('task name');
    var type = task ? ('__task__' + task) : 'page';
    var plural = this.inflections[type];
    return this.views[plural];
  }
});

/**
 * Display a visual representation of the
 * difference between `a` and `b`
 */

Assemble.prototype.diff = function(a, b, method) {
  method = method || 'diffJson';
  a = a || this.env;
  b = b || this.cache.data;
  diff[method](a, b).forEach(function (res) {
    var color = chalk.gray;
    if (res.added) {
      color = chalk.green;
    }
    if (res.removed) {
      color = chalk.red;
    }
    process.stderr.write(color(res.value));
  });
  console.log('\n');
};

/**
 * Run an array of tasks.
 *
 * ```js
 * assemble.run(['foo', 'bar']);
 * ```
 *
 * @param {Array} `tasks`
 * @api private
 */

Assemble.prototype.run = function () {
  var tasks = !arguments.length ? ['default'] : arguments;
  this.start.apply(this, tasks);
};

/**
 * Wrapper around Task._runTask to enable `sessions`
 *
 * @param  {Object} `task` Task to run
 * @api private
 */

Assemble.prototype._runTask = function(task) {
  var assemble = this;
  assemble.session.run(function () {
    assemble.session.set('task name', task.name);
    Task.prototype._runTask.call(assemble, task);
  });
};

/**
 * Rerun the specified task when a file changes.
 *
 * ```js
 * assemble.watch('docs/*.md', ['docs']);
 *
 * // usage in a task
 * assemble.task('watch', function() {
 *   assemble.watch('docs/*.md', ['docs']);
 * });
 * ```
 *
 * @param  {String|Array} `glob` Filepaths or glob patterns.
 * @param  {String} `options`
 * @param  {Function} `fn` Task(s) to watch.
 * @return {String}
 * @api public
 */

Assemble.prototype.watch = function(glob, opts, fn) {
  if (Array.isArray(opts) || typeof opts === 'function') {
    fn = opts; opts = null;
  }
  if (!Array.isArray(fn)) return vfs.watch(glob, opts, fn);
  return vfs.watch(glob, opts, function () {
    this.start.apply(this, fn);
  }.bind(this));
};

/**
 * Create a new instance of `Assemble`.
 *
 * ```js
 * assemble.init();
 * ```
 *
 * @api public
 */

Assemble.prototype.init = function () {
  return new Assemble();
};

/**
 * Expose `assemble`
 */

module.exports = new Assemble();
