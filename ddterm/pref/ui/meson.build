# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_src_files = files(
  'prefs-colors.ui',
  'prefs-command.ui',
  'prefs-compatibility.ui',
  'prefs-panel-icon.ui',
  'prefs-scrolling.ui',
  'prefs-shortcuts.ui',
  'prefs-text.ui',
)

foreach pref_ui_src_file : pref_ui_src_files
  test(
    fs.relative_to(pref_ui_src_file, meson.project_source_root()),
    gtk3_builder_tool,
    args: ['validate', pref_ui_src_file],
    suite: ['gtk-builder-validate'],
  )
endforeach

subdir('gtk3')
subdir('gtk4')
