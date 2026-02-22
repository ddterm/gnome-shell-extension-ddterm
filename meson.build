# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'ddterm',
  version: '62.0.2',
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

gjs_req = '>=1.80.0'
gnome_shell_req = ['>=46.0', '<51']
shell_versions = ['46', '47', '48', '49', '50.beta']

layout = get_option('layout')

if layout != 'mirror'
  error(f'layout=@layout@ is not supported. Only layout=mirror is supported.')
endif

summary('Target GNOME Shell version', gnome_shell_req, list_sep: ', ')

gjs_shebang = get_option('shebang_override')

gjs = find_program(
  'gjs',
  version: gjs_req,
  required: gjs_shebang == '' or get_option('typelib_installer'),
  disabler: true,
)

if gjs_shebang == ''
  gjs_shebang = gjs.full_path()
endif

summary('Shebang line', gjs_shebang)

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

glib_compile_schemas_tool = find_program('glib-compile-schemas')

xgettext = find_program('xgettext', required: false, disabler: true)
msgmerge = find_program('msgmerge', required: false, disabler: true)

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

metadata_configured = configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json.in',
  configuration: metadata,
)

git_revision_format = '%H'
git_revision_placeholder = f'$Format:@git_revision_format@$'

has_git_revision_placeholder = fs.read('metadata.json.in').contains(
  git_revision_placeholder,
)

git = find_program('git', disabler: true, required: has_git_revision_placeholder)

if has_git_revision_placeholder
  metadata_configured = vcs_tag(
    command: [
      git,
      'rev-list',
      '-1',
      f'--format=format:@git_revision_format@',
      '--no-commit-header',
      'HEAD',
    ],
    input: metadata_configured,
    output: 'metadata.json.vcs_tag',
    replace_string: git_revision_placeholder,
    fallback: 'unknown',
  )
endif

subdir('tools')

bundle = [
  custom_target(
    command: fix_metadata_command,
    input: metadata_configured,
    output: 'metadata.json',
    install: true,
    install_dir: extension_dir,
  ),
  fs.copyfile('metadata.json.in.license', 'metadata.json.license'),
]

foreach f : ['extension.js', 'prefs.js', 'AUTHORS']
  bundle += fs.copyfile(f, install: true, install_dir: extension_dir)
endforeach

bundle_command = [make_zip_command]

subdir('bin')
subdir('data')
subdir('schemas')
subdir('ddterm')
subdir('locale')

bundle_from_srcdir = files(
  'LICENSES' / 'GPL-3.0-or-later.txt',
  'LICENSES' / 'CC0-1.0.txt',
  'LICENSES' / 'MIT.txt',
  'REUSE.toml',
)

foreach bundle_entry : bundle + [launcher]
  bundle_command += [
    '--entry',
    bundle_entry,
    fs.relative_to(bundle_entry, meson.current_build_dir()),
  ]
endforeach

foreach bundle_entry : bundle_from_srcdir
  bundle_command += [
    '--entry',
    bundle_entry,
    fs.relative_to(bundle_entry, meson.current_source_dir()),
  ]
endforeach

bundle_target = custom_target(
  command: bundle_command,
  output: f'@uuid@.shell-extension.zip',
  build_by_default: true,
)

alias_target('bundle', bundle_target)
alias_target('pack', bundle_target)
summary('Built bundle location', bundle_target.full_path())

meson.add_devenv({'EXTENSION_BUNDLE': bundle_target.full_path()})

run_target(
  'user-install',
  command: [extensions_tool, 'install', '-f', bundle_target],
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
  command: [run_gnome_shell_wayland_nested_command, bundle_target],
)

run_target(
  'xephyr-x11-shell',
  command: [run_gnome_shell_xephyr_x11_command, bundle_target],
)

run_target(
  'dev-app',
  command: [dev_launcher],
  depends: bundle,
)

toxinidir = meson.current_source_dir()
toxworkdir = toxinidir / '.tox'

subdir('tests')
