# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pack += fs.copyfile(
  'com.github.amezin.ddterm.Extension.xml',
  install: true,
  install_dir: extension_dir / 'data',
)

pack += fs.copyfile(
  'com.github.amezin.ddterm.service.in',
  install: true,
  install_dir: extension_dir / 'data',
)

pack += fs.copyfile(
  'com.github.amezin.ddterm.svg',
  install: true,
  install_dir: extension_dir / 'data',
)

pack += fs.copyfile('com.github.amezin.ddterm.svg.license')

pack += fs.copyfile(
  'com.github.amezin.ddterm-symbolic.svg',
  install: true,
  install_dir: extension_dir / 'data',
)

pack += fs.copyfile('com.github.amezin.ddterm-symbolic.svg.license')

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

pack += i18n.merge_file(
  input: desktop_entry_untranslated,
  output: '@BASENAME@',
  po_dir: '..' / 'po',
  type: 'desktop',
  install: true,
  install_dir: extension_dir / 'data',
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
