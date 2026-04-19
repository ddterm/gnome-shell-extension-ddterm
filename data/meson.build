# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

bundle += fs.copyfile(
  'com.github.amezin.ddterm.svg',
  install: true,
  install_dir: extension_dir / 'data',
)

bundle += fs.copyfile(
  'com.github.amezin.ddterm-symbolic.svg',
  install: true,
  install_dir: extension_dir / 'data',
)

launcher_config = configuration_data()
launcher_config.set('LAUNCHER', launcher_installed)
launcher_config.set(
  'ICON',
  extension_dir / 'data' / 'com.github.amezin.ddterm.svg',
)

configure_file(
  input: 'com.github.amezin.ddterm.service.in',
  output: '@BASENAME@',
  configuration: launcher_config,
  install: true,
  install_dir: dbus_service_dir,
)

desktop_entry_untranslated = files('com.github.amezin.ddterm.desktop.in.in')

desktop_entry_translated = i18n.merge_file(
  input: desktop_entry_untranslated,
  output: '@BASENAME@',
  po_dir: '..' / 'po',
  type: 'desktop',
)

desktop_entry_final = i18n.merge_file(
  input: configure_file(
    input: desktop_entry_untranslated,
    output: '@BASENAME@_configured',
    configuration: launcher_config,
  ),
  output: '@BASENAME@',
  po_dir: '..' / 'po',
  type: 'desktop',
  install: true,
  install_dir: applications_dir,
)

test(
  fs.name(desktop_entry_final.full_path()),
  desktop_file_validate_tool,
  args: [desktop_entry_final],
  suite: ['desktop-file-validate'],
)

gnome = import('gnome')

resource_bundle = gnome.compile_resources(
  'ddterm-resources',
  'ddterm-resources.gresource.xml',
  source_dir: ['.', meson.current_build_dir()],
  dependencies: [desktop_entry_translated],
  gresource_bundle: true,
  install: true,
  install_dir: extension_dir / 'data',
)

bundle += resource_bundle
