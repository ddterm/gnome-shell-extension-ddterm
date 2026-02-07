# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

util_js_out_files = []
util_js_src_files = files('displayconfig.js', 'promise.js')

if get_option('typelib_installer')
  typelib_installer = subproject('gjs-typelib-installer')

  util_js_out_files += custom_target(
    command: [
      gjs,
      typelib_installer.get_variable('generate_installer_tool'),
      typelib_installer.get_variable('installer_source'),
      '@OUTPUT@',
      'Gtk=3.0',
      'Gdk=3.0',
      'Pango=1.0',
      'Vte=2.91',
      'Handy=1',
    ],
    output: 'gjs-typelib-installer.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
else
  util_js_src_files += files('gjs-typelib-installer.js')
endif

foreach util_js_src_file : util_js_src_files
  util_js_out_files += fs.copyfile(
    util_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endforeach

bundle += util_js_out_files
