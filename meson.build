# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'ddterm',
  version: '56',
  meson_version: '>= 1.3.0',
  license: 'GPL-3.0-or-later',
  license_files: 'LICENSES' / 'GPL-3.0-or-later.txt',
  default_options: ['prefix=/usr'],
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

pack = [
  fs.copyfile('stylesheet.css', install: true, install_dir: extension_dir),
  meson.project_license_files(),
  files('LICENSES' / 'CC0-1.0.txt'),
  files('REUSE.toml'),
]

if not get_option('esm')
  pack += files(
    'LICENSES' / 'GPL-2.0-or-later.txt',
    'LICENSES' / 'LGPL-2.0-or-later.txt',
    'LICENSES' / 'MIT.txt',
  )
endif

built_js = [
  fs.copyfile(
    get_option('esm') ? 'extension.js' : 'extension.legacy.js',
    'extension.js',
    install: true,
    install_dir: extension_dir,
  ),
  fs.copyfile(
    get_option('esm') ? 'prefs.js' : 'prefs.legacy.js',
    'prefs.js',
    install: true,
    install_dir: extension_dir,
  ),
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

pack += fs.copyfile(
  get_option('esm') ? 'metadata.json.in.license' : 'metadata.legacy.json.in.license',
  'metadata.json.license',
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

extensions_tool = find_program(
  'gnome-extensions',
  required: false,
  disabler: true,
)

run_target(
  'user-install',
  command: [extensions_tool, 'install', '-f', pack_target],
)

run_target('user-uninstall', command: [extensions_tool, 'uninstall', uuid])

foreach target : ['prefs', 'enable', 'disable', 'reset']
  run_target(target, command: [extensions_tool, target, uuid])
endforeach

gapplication_tool = find_program('gapplication', required: false, disabler: true)

foreach target : ['toggle', 'quit']
  run_target(
    target,
    command: [gapplication_tool, 'action', 'com.github.amezin.ddterm', target],
  )
endforeach

eslint_tool = find_program(
  meson.current_source_dir() / 'node_modules' / '.bin' / 'eslint',
  required: false,
  disabler: true,
)

eslint_env = ['ESLINT_USE_FLAT_CONFIG=false']
meson.add_devenv(eslint_env)

build_dir_relative = fs.relative_to(
  meson.current_build_dir(),
  meson.current_source_dir(),
)

eslint_extra_args = ['--ignore-pattern', build_dir_relative]

run_target(
  'eslint',
  command: ['env', '-C', '@CURRENT_SOURCE_DIR@', eslint_tool, '.'] + eslint_extra_args,
  env: eslint_env,
)

run_target(
  'eslint-fix',
  command: ['env', '-C', '@CURRENT_SOURCE_DIR@', eslint_tool, '--fix', '.'] + eslint_extra_args,
  env: eslint_env,
)

test(
  'lint-source',
  eslint_tool,
  args: ['.', eslint_extra_args],
  env: eslint_env,
  workdir: meson.current_source_dir(),
  suite: ['eslint'],
)

configure_file(
  input: 'lint' / (get_option('esm') ? 'eslintrc-ddterm-build-esm.yml.in' : 'eslintrc-ddterm-build-legacy.yml.in'),
  output: '.eslintrc.yml',
  configuration: {
    'common_eslintrc': meson.current_source_dir() / 'lint' / 'eslintrc-ddterm-common.yml',
  },
)

test(
  'lint-build',
  eslint_tool,
  args: [build_dir_relative, '--resolve-plugins-relative-to', '.'],
  env: eslint_env,
  depends: built_js,
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

reuse_tool = find_program(
  'reuse',
  required: false,
  disabler: true,
  version: '>=4.0.0',
)

run_target(
  'reuse',
  command: [reuse_tool, '--root', meson.current_source_dir(), 'lint'],
)

test(
  'lint-source',
  reuse_tool,
  args: ['--root', meson.current_source_dir(), 'lint'],
  workdir: meson.current_source_dir(),
  suite: ['reuse'],
)

test(
  'lint-build',
  check_pack_tool,
  args: ['--', pack_target, reuse_tool.full_path(), '--root', '.', 'lint'],
  suite: ['reuse'],
)
