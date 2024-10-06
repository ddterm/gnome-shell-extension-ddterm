project(
  'ddterm',
version : '56',
  meson_version : '>= 1.0.0',
  license : 'GPL-3.0-or-later',
  default_options : ['prefix=/usr']
)

gjs = find_program('gjs', version: get_option('esm') ? '>=1.78.0' : '>=1.68.0')

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

if get_option('debug')
  devtools_required = false
else
  devtools_required = disabler()
endif

pack = [
  fs.copyfile('LICENSE'),
  fs.copyfile(
    'stylesheet.css',
    install: true,
    install_dir: extension_dir
  )
]

built_js = [
  fs.copyfile(
    get_option('esm') ? 'extension.js' : 'extension.legacy.js',
    'extension.js',
    install: true,
    install_dir: extension_dir
  ),
  fs.copyfile(
    get_option('esm') ? 'prefs.js' : 'prefs.legacy.js',
    'prefs.js',
    install: true,
    install_dir: extension_dir
  )
]

metadata = configuration_data()
metadata.set('version', meson.project_version())
metadata.set_quoted('uuid', uuid)
metadata.set_quoted('gettext_domain', gettext_domain)
metadata.set_quoted('settings_schema', settings_schema)

pack += configure_file(
  input: get_option('esm') ? 'metadata.json.in' : 'metadata.legacy.json.in',
  output: 'metadata.json',
  configuration: metadata,
  install: true,
  install_dir: extension_dir,
)

subdir('tools')

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

gtk3_builder_tool = find_program('gtk-builder-tool')

subdir('bin')
subdir('schemas')
subdir('ddterm')
subdir('locale')

pack += built_js

pack_target = custom_target(
  command: make_zip_command,
  input: pack,
  output: get_option('esm') ? f'@uuid@.shell-extension.zip' : f'@uuid@.legacy.shell-extension.zip',
  build_by_default: true,
)

alias_target('pack', pack_target)

meson.add_devenv({'DDTERM_BUILT_PACK': pack_target.full_path()})

extensions_tool = find_program('gnome-extensions', required: devtools_required, disabler: true)

run_target(
  'user-install',
  command: [extensions_tool, 'install', '-f', pack_target],
)

run_target('user-uninstall', command: [extensions_tool, 'uninstall', uuid])

foreach target: ['prefs', 'enable', 'disable', 'reset']
  run_target(target, command: [extensions_tool, target, uuid])
endforeach

gapplication_tool = find_program('gapplication', required: devtools_required, disabler: true)

foreach target: ['toggle', 'quit']
  run_target(target, command: [gapplication_tool, 'action', 'com.github.amezin.ddterm', target])
endforeach

npm_tool = find_program('npm', required: devtools_required, disabler: true)
npm_install_stamp = meson.current_build_dir() / 'npm-install.stamp'
npm_env = {'DDTERM_POST_INSTALL_STAMP': npm_install_stamp}
meson.add_devenv(npm_env)

npm_install = custom_target(
  command: [npm_tool, '-C', '@CURRENT_SOURCE_DIR@', 'install'],
  output: fs.name(npm_install_stamp),
  depend_files: files('package.json', 'package-lock.json'),
  console: true,
  env: npm_env,
)

if meson.version().version_compare('>=1.3.0')
  build_dir_relative = fs.relative_to(
    meson.current_build_dir(),
    meson.current_source_dir(),
  )
else
  build_dir_relative = run_command(
    'python3',
    '-c',
    'import os.path; import sys; print(os.path.relpath(*sys.argv[1:]))',
    meson.current_build_dir(),
    meson.current_source_dir(),
    capture: true,
    check: true,
  ).stdout().strip()
endif

eslint_extra_args = ['--ignore-pattern', build_dir_relative]

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
  'lint-source',
  npm_tool,
  args: ['run-script', '--', 'lint'] + eslint_extra_args,
  depends: npm_install,
  workdir: meson.current_source_dir(),
  suite: ['eslint'],
)

configure_file(
  input: 'lint' / (
    get_option('esm') ? 'eslintrc-ddterm-build-esm.yml.in' : 'eslintrc-ddterm-build-legacy.yml.in'
  ),
  output: '.eslintrc.yml',
  configuration: {
    'common_eslintrc': meson.current_source_dir() / 'lint' / 'eslintrc-ddterm-common.yml'
  },
)

test(
  'lint-build',
  npm_tool,
  args: ['exec', '--', 'eslint', build_dir_relative, '--resolve-plugins-relative-to', '.'],
  depends: [npm_install, built_js],
  workdir: meson.current_source_dir(),
  suite: ['eslint'],
)

run_target(
  'nested-wayland-shell',
  command: [run_gnome_shell_wayland_nested_command, pack_target],
)

run_target(
  'xephyr-x11-shell',
  command: [run_gnome_shell_xephyr_x11_command, pack_target],
)
