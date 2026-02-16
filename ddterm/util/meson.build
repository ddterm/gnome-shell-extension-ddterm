# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

if get_option('typelib_installer')
  typelib_installer_subproject = subproject(
    'gjs-typelib-installer',
    default_options: {
      'output_name': 'gjs-typelib-installer.js',
      'install_dir': extension_dir / 'ddterm' / 'util',
      'tests': false,
      'typelibs': [
        'Gtk-3.0',
        'Gdk-3.0',
        'Pango-1.0',
        'Vte-2.91',
        'Handy-1',
      ],
    },
  )

  typelib_installer_file = typelib_installer_subproject.get_variable('output')
else
  typelib_installer_file = fs.copyfile(
    'gjs-typelib-installer.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endif

bundle_command += [
  '--entry',
  typelib_installer_file,
  'ddterm' / 'util' / 'gjs-typelib-installer.js',
]

util_js_out_files = []
util_js_src_files = files('displayconfig.js')

foreach util_js_src_file : util_js_src_files
  util_js_out_files += fs.copyfile(
    util_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endforeach

bundle += util_js_out_files
