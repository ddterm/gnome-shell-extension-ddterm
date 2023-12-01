project(
  'ddterm',
  version : '50',
  meson_version : '>= 1.0.0',
  license : 'GPL3+',
  default_options : ['prefix=/usr']
)

gjs = find_program('gjs', version: '>=1.78.0')

fs = import('fs')
i18n = import('i18n')

uuid = 'ddterm@amezin.github.com'
gettext_domain = uuid
settings_schema = 'com.github.amezin.ddterm'

prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')

extension_dir = datadir / 'gnome-shell' / 'extensions' / uuid
schema_dir = datadir / 'glib-2.0' / 'schemas'
applications_dir = datadir / 'applications'
dbus_service_dir = datadir / 'dbus-1' / 'services'

pack = []

pack += fs.copyfile(
  'extension.js',
  install: true,
  install_dir: extension_dir
)

pack += fs.copyfile(
  'prefs.js',
  install: true,
  install_dir: extension_dir
)

pack += fs.copyfile('LICENSE')

metadata = configuration_data()
metadata.set('version', meson.project_version())
metadata.set_quoted('uuid', uuid)
metadata.set_quoted('gettext_domain', gettext_domain)
metadata.set_quoted('settings_schema', settings_schema)

pack += configure_file(
  input: 'metadata.json.in',
  output: '@BASENAME@',
  configuration: metadata,
  install: true,
  install_dir: extension_dir,
)

output_capture = ['sh', '-c', 'exec >"$0" "$@"', '@OUTPUT@']
need_git_version = fs.read('revision.txt.in').strip() == '$Format:%H$'

git = find_program('git', disabler: true, required: need_git_version)

if need_git_version
  pack += custom_target(
    command: [
      output_capture,
      git,
      '-C',
      '@CURRENT_SOURCE_DIR@',
      '--git-dir',
      '.git',
      'rev-parse',
      'HEAD'
    ],
    output: 'revision.txt',
    build_always_stale: true,
    install: true,
    install_dir: extension_dir,
  )
else
  pack += fs.copyfile(
    'revision.txt.in',
    'revision.txt',
    install: true,
    install_dir: extension_dir,
  )
endif

gjs_config = configuration_data()
gjs_config.set('GJS', gjs.full_path())

gtk3_builder_tool = find_program('gtk-builder-tool')

subdir('bin')
subdir('schemas')
subdir('ddterm')
subdir('locale')

pack_target = custom_target(
  command: [
    'tools' / 'makezip.py', '--output', '@OUTPUT@', '--relative-to', '@OUTDIR@', '--', '@INPUT@'
  ],
  input: pack,
  output: f'@uuid@.shell-extension.zip',
  build_by_default: true,
)

alias_target('pack', pack_target)

meson.add_devenv({'DDTERM_BUILT_PACK': pack_target.full_path()})

extensions_tool = find_program('gnome-extensions', required: false, disabler: true)

run_target(
  'user-install',
  command: [extensions_tool, 'install', '-f', pack_target],
)

run_target('user-uninstall', command: [extensions_tool, 'uninstall', uuid])

foreach target: ['prefs', 'enable', 'disable', 'reset']
  run_target(target, command: [extensions_tool, target, uuid])
endforeach

gapplication_tool = find_program(
  'gapplication',
  required: false,
  disabler: true,
)

foreach target: ['toggle', 'quit']
  run_target(target, command: [gapplication_tool, 'action', 'com.github.amezin.ddterm', target])
endforeach

npm_tool = find_program('npm', required: false, disabler: true)

if meson.version().version_compare('>=1.3.0')
  ignore_dir = fs.relative_to(
    meson.current_build_dir(),
    meson.current_source_dir(),
  )
else
  ignore_dir = run_command(
    'python3',
    '-c',
    'import os.path; import sys; print(os.path.relpath(*sys.argv[1:]))',
    meson.current_build_dir(),
    meson.current_source_dir(),
    capture: true,
    check: true,
  ).stdout().strip()
endif

npm_install_stamp = meson.current_build_dir() / 'npm-install'
npm_env = {'DDTERM_POST_INSTALL_STAMP': npm_install_stamp}
meson.add_devenv(npm_env)

npm_install = custom_target(
  command: [npm_tool, '-C', '@CURRENT_SOURCE_DIR@', 'install'],
  output: fs.name(npm_install_stamp),
  depend_files: files('package.json', 'package-lock.json'),
  console: true,
  env: npm_env,
)

eslint_extra_args = ['--ignore-pattern', ignore_dir]

run_target(
  'eslint',
  command: [npm_tool, '-C', '@CURRENT_SOURCE_DIR@', 'run-script', '--', 'lint'] + eslint_extra_args,
  depends: npm_install,
)

run_target(
  'eslint-fix',
  command: [npm_tool, '-C', '@CURRENT_SOURCE_DIR@', 'run-script', '--', 'lint:fix'] + eslint_extra_args,
  depends: npm_install,
)

test(
  'eslint',
  npm_tool,
  args: ['run-script', '--', 'lint'] + eslint_extra_args,
  depends: npm_install,
  workdir: meson.current_source_dir(),
  suite: ['eslint'],
)
