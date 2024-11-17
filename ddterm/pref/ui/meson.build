# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_files = files(
  'prefs-animation.ui',
  'prefs-behavior.ui',
  'prefs-colors.ui',
  'prefs-command.ui',
  'prefs-compatibility.ui',
  'prefs-panel-icon.ui',
  'prefs-position-size.ui',
  'prefs-scrolling.ui',
  'prefs-shortcuts.ui',
  'prefs-tabs.ui',
  'prefs-text.ui',
)

foreach pref_ui_file : pref_ui_files
  test(
    fs.parent(pref_ui_file) / fs.name(pref_ui_file),
    gtk3_builder_tool,
    args: ['validate', pref_ui_file],
    suite: ['gtk-builder-validate'],
  )
endforeach

subdir('gtk3')
subdir('gtk4')
