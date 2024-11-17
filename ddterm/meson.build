# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

ddterm_files = files(
  'com.github.amezin.ddterm.Extension.xml',
  'com.github.amezin.ddterm.service.in',
)

foreach ddterm_file : ddterm_files
  pack += fs.copyfile(
    ddterm_file,
    install: true,
    install_dir: extension_dir / 'ddterm',
  )
endforeach

desktop_entry_untranslated = files('com.github.amezin.ddterm.desktop.in.in')

pack += i18n.merge_file(
  input: desktop_entry_untranslated,
  output: '@BASENAME@',
  po_dir: '../locale',
  type: 'desktop',
  install: true,
  install_dir: extension_dir / 'ddterm',
)

launcher_config = configuration_data()
launcher_config.set('LAUNCHER', launcher_installed)

desktop_entry_final = i18n.merge_file(
  input: configure_file(
    input: desktop_entry_untranslated,
    output: '@BASENAME@_configured',
    configuration: launcher_config,
  ),
  output: '@BASENAME@',
  po_dir: '../locale',
  type: 'desktop',
  install: true,
  install_dir: applications_dir,
)

configure_file(
  input: 'com.github.amezin.ddterm.service.in',
  output: '@BASENAME@',
  configuration: launcher_config,
  install: true,
  install_dir: dbus_service_dir,
)

subdir('app')
subdir('pref')
subdir('shell')
subdir('util')

desktop_file_validate_tool = find_program(
  'desktop-file-validate',
  required: false,
  disabler: true,
)

test(
  desktop_entry_final.full_path(),
  desktop_file_validate_tool,
  args: [desktop_entry_final],
  suite: ['desktop-file-validate'],
)
