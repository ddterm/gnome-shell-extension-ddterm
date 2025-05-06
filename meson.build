# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'ddterm',
  version: '61',
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
icon_dir = datadir / 'icons'

gjs_req = '>=1.78.0'
gnome_shell_req = ['>=45.0', '<49']
shell_versions = ['45', '46', '47', '48']

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
  'extension.js',
  install: true,
  install_dir: extension_dir,
)

prefs_main_out_file = fs.copyfile(
  'prefs.js',
  install: true,
  install_dir: extension_dir,
)

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
  output: f'@uuid@.shell-extension.zip',
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

subdir('tests')
