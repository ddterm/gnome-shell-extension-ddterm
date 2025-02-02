# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

app_ui_src_files = files('menus.ui')

foreach app_ui_src_file : app_ui_src_files
  pack += fs.copyfile(
    app_ui_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app' / 'ui',
  )

  test(
    fs.relative_to(app_ui_src_file, meson.project_source_root()),
    gtk3_builder_tool,
    args: ['validate', app_ui_src_file],
    suite: ['gtk-builder-validate'],
  )
endforeach
