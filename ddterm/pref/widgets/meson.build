# SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_widgets_js_src_files = files(
  'actionrow.js',
  'comborow.js',
  'entryrow.js',
  'scalerow.js',
  'spinrow.js',
  'switchrow.js',
)

foreach pref_widget_js_src_file : pref_widgets_js_src_files
  pref_js_out_files += fs.copyfile(
    pref_widget_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'widgets',
  )
endforeach
