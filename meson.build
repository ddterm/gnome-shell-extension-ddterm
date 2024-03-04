project(
  'ddterm',
  version : '53',
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

pack = [fs.copyfile('LICENSE')]

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

output_capture = ['sh', '-c', 'exec >"$0" "$@"', '@OUTPUT@']

git = find_program('git', required: false)

revision_script_config = configuration_data()
if git.found()
  revision_script_config.set('GIT', git.full_path())
else
  revision_script_config.set('GIT', 'git')
endif

store_revision_script = configure_file(
  input: 'tools/store-revision.sh.in',
  output: '@BASENAME@',
  configuration: revision_script_config,
)

meson.add_dist_script(['sh', store_revision_script])

pack += custom_target(
  command: ['sh', store_revision_script, '@OUTPUT@'],
  env: {'MESON_PROJECT_SOURCE_ROOT': meson.project_source_root()},
  output: 'revision.txt',
  build_always_stale: true,
  install: true,
  install_dir: extension_dir,
)

gtk3_builder_tool = find_program('gtk-builder-tool')

sed = find_program('sed')

if get_option('esm')
  preprocess_command = [output_capture, sed, '-f', files('tools/preproc_esm.sin'), '@INPUT@']
else
  preprocess_command = [output_capture, sed, '-f', files('tools/preproc_legacy.sin'), '@INPUT@']
endif

gjs_translate_esm = [gjs, files('tools' / 'translate-esm.js')]

subdir('bin')
subdir('schemas')
subdir('ddterm')
subdir('locale')

pack_target = custom_target(
  command: [
    'tools' / 'makezip.py', '--output', '@OUTPUT@', '--relative-to', '@OUTDIR@', '--', '@INPUT@'
  ],
  input: [pack, built_js],
  output: get_option('esm') ? f'@uuid@.shell-extension.zip' : f'@uuid@.legacy.shell-extension.zip',
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
