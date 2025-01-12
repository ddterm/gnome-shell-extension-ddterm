# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'ddterm',
  version: '58',
  meson_version: '>= 1.3.0',
  license: 'GPL-3.0-or-later',
  license_files: 'LICENSE',
  default_options: ['prefix=/usr'],
)

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

if get_option('esm')
  gjs_req = '>=1.78.0'
  gnome_shell_req = ['>=45.0', '<48.0']
  shell_versions = ['45', '46', '47']

  extension_main_src_file = files('extension.js')
  prefs_main_src_file = files('prefs.js')

  pack_name = f'@uuid@.shell-extension.zip'
else
  gjs_req = '>=1.72.0'
  gnome_shell_req = ['>=42.0', '<45.0']
  shell_versions = ['42', '43', '44']

  extension_main_src_file = files('extension.legacy.js')
  prefs_main_src_file = files('prefs.legacy.js')

  pack_name = f'@uuid@.legacy.shell-extension.zip'
endif

summary('Target GNOME Shell version', gnome_shell_req, list_sep: ', ')

summary(
  {
    'prefix': prefix,
    'bindir': bindir,
    'extension_dir': extension_dir,
    'schema_dir': schema_dir,
    'applications_dir': applications_dir,
    'dbus_service_dir': dbus_service_dir,
  },
  section: 'System-wide installation',
)

gjs = find_program('gjs', version: gjs_req)

gtk3_builder_tool = find_program('gtk-builder-tool')
gtk4_builder_tool = find_program('gtk4-builder-tool')
glib_compile_schemas_tool = find_program('glib-compile-schemas')
xsltproc = find_program('xsltproc')

xgettext = find_program('xgettext', required: false, disabler: true)

desktop_file_validate_tool = find_program(
  'desktop-file-validate',
  required: false,
  disabler: true,
)

gapplication_tool = find_program('gapplication', required: false, disabler: true)

extensions_tool = find_program(
  'gnome-extensions',
  required: get_option('tests').enabled(),
  disabler: true,
)

dbus_daemon = find_program(
  'dbus-daemon',
  required: get_option('tests').enabled(),
  disabler: true,
)

gnome_shell = find_program(
  'gnome-shell',
  version: gnome_shell_req,
  required: get_option('tests').enabled(),
  disabler: true,
)

metadata = configuration_data()
metadata.set_quoted('name', meson.project_name())
metadata.set('version', meson.project_version())
metadata.set_quoted('uuid', uuid)
metadata.set_quoted('gettext_domain', gettext_domain)
metadata.set_quoted('settings_schema', settings_schema)
metadata.set('shell_versions', f'@shell_versions@'.replace('\'', '"'))

pack = [
  configure_file(
    input: 'metadata.json.in',
    output: 'metadata.json',
    configuration: metadata,
    install: true,
    install_dir: extension_dir,
  ),
  fs.copyfile(
    'metadata.json.in.license',
    'metadata.json.license',
    install: true,
    install_dir: extension_dir,
  ),
]

extension_main_out_file = fs.copyfile(
  extension_main_src_file,
  'extension.js',
  install: true,
  install_dir: extension_dir,
)

prefs_main_out_file = fs.copyfile(
  prefs_main_src_file,
  'prefs.js',
  install: true,
  install_dir: extension_dir,
)

eslint_out = [extension_main_out_file, prefs_main_out_file]
pack += [extension_main_out_file, prefs_main_out_file]

subdir('tools')
subdir('bin')
subdir('data')
subdir('schemas')
subdir('ddterm')

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
      'HEAD',
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

pack += fs.copyfile(
  'revision.txt.in.license',
  'revision.txt.license',
  install: true,
  install_dir: extension_dir,
)

subdir('locale')

pack += fs.copyfile('stylesheet.css', install: true, install_dir: extension_dir)

pack_from_srcdir = [
  'LICENSES' / 'GPL-3.0-or-later.txt',
  'LICENSES' / 'CC0-1.0.txt',
  'REUSE.toml',
]

pack_command = [make_zip_command]

foreach extra_path : pack_from_srcdir
  pack_command += ['--include', files(extra_path), extra_path]
endforeach

pack_target = custom_target(
  command: pack_command,
  input: pack,
  output: pack_name,
  build_by_default: true,
)

alias_target('pack', pack_target)
summary('Built package location', pack_target.full_path())

meson.add_devenv({'DDTERM_BUILT_PACK': pack_target.full_path()})

run_target(
  'user-install',
  command: [extensions_tool, 'install', '-f', pack_target],
)

run_target('user-uninstall', command: [extensions_tool, 'uninstall', uuid])

foreach action : ['prefs', 'enable', 'disable', 'reset']
  run_target(action, command: [extensions_tool, action, uuid])
endforeach

foreach action : ['toggle', 'quit']
  run_target(
    action,
    command: [gapplication_tool, 'action', 'com.github.amezin.ddterm', action],
  )
endforeach

node_modules_bin_dir = meson.current_source_dir() / 'node_modules' / '.bin'

eslint_tool = find_program(
  'eslint',
  version: '>= 8.0.0',
  dirs: node_modules_bin_dir,
  required: get_option('linters'),
  disabler: true,
)

if eslint_tool.found()
  eslint_config_check = run_command(
    [
      'env',
      '-C',
      meson.current_source_dir(),
      eslint_tool,
      '--print-config',
      'extension.js',
    ],
    check: get_option('linters').enabled(),
  )

  if eslint_config_check.returncode() != 0
    warning('eslint found, but it fails to load the config, so it will be disabled. '
      + 'Please run "npm install" and "meson setup --reconfigure" to fix.')

    eslint_tool = disabler()
  endif
endif

summary('ESLint', eslint_tool.found(), bool_yn: true, section: 'Linters')

run_target(
  'eslint',
  command: ['env', '-C', '@CURRENT_SOURCE_DIR@', eslint_tool, '.'],
)

run_target(
  'eslint-fix',
  command: ['env', '-C', '@CURRENT_SOURCE_DIR@', eslint_tool, '--fix', '.'],
)

test(
  'eslint-source',
  eslint_tool,
  args: ['.'],
  workdir: meson.current_source_dir(),
  suite: ['eslint', 'lint-source'],
)

configure_file(
  input: 'lint' / (get_option('esm') ? 'eslint.config.esm.mjs.in' : 'eslint.config.legacy.mjs.in'),
  output: 'eslint.config.mjs',
  configuration: {
    'common_config': meson.current_source_dir() / 'lint' / 'ddterm-common.mjs',
  },
)

test(
  'eslint-output',
  eslint_tool,
  args: eslint_out,
  workdir: meson.current_build_dir(),
  suite: ['eslint', 'lint-output'],
)

run_target(
  'nested-wayland-shell',
  command: [run_gnome_shell_wayland_nested_command, pack_target],
)

run_target(
  'xephyr-x11-shell',
  command: [run_gnome_shell_xephyr_x11_command, pack_target],
)

toxinidir = meson.current_source_dir()
toxworkdir = toxinidir / '.tox'

reuse_tool = find_program(
  'reuse',
  version: '>=4.0.0',
  dirs: toxworkdir / 'reuse' / 'bin',
  required: get_option('linters'),
  disabler: true,
)

summary('REUSE', reuse_tool.found(), bool_yn: true, section: 'Linters')

run_target(
  'reuse',
  command: [reuse_tool, '--root', meson.current_source_dir(), 'lint'],
)

# Works correctly only in a git repo
if fs.exists(meson.current_source_dir() / '.git')
  test(
    'reuse-lint-source',
    reuse_tool,
    args: ['--root', meson.current_source_dir(), 'lint'],
    workdir: meson.current_source_dir(),
    suite: ['reuse', 'lint-source'],
  )
endif

test(
  'reuse-lint-output',
  check_pack_tool,
  args: ['--', pack_target, reuse_tool.full_path(), '--root', '.', 'lint'],
  suite: ['reuse', 'lint-output'],
)

markdownlint_cli2_tool = find_program(
  'markdownlint-cli2',
  dirs: node_modules_bin_dir,
  required: get_option('linters'),
  disabler: true,
)

summary(
  'markdownlint-cli2',
  markdownlint_cli2_tool.found(),
  bool_yn: true,
  section: 'Linters',
)

run_target(
  'markdownlint',
  command: ['env', '-C', '@CURRENT_SOURCE_DIR@', markdownlint_cli2_tool],
)

run_target(
  'markdownlint-fix',
  command: [
    'env',
    '-C',
    '@CURRENT_SOURCE_DIR@',
    markdownlint_cli2_tool,
    '--fix',
  ],
)

test(
  'markdownlint-source',
  markdownlint_cli2_tool,
  workdir: meson.current_source_dir(),
  suite: ['markdownlint', 'lint-source'],
)

flake8_tool = find_program(
  'flake8',
  dirs: toxworkdir / 'flake8' / 'bin',
  required: get_option('linters'),
  disabler: true,
)

summary('flake8', flake8_tool.found(), bool_yn: true, section: 'Linters')

run_target(
  'flake8',
  command: [flake8_tool, '--config', files('.flake8'), '@CURRENT_SOURCE_DIR@'],
)

test(
  'flake8-lint-source',
  flake8_tool,
  args: ['--config', files('.flake8'), '.'],
  workdir: meson.current_source_dir(),
  suite: ['flake8', 'lint-source'],
)

subdir('tests')
