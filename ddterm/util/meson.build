# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

util_js_out_files = []
util_js_src_files = files('displayconfig.js')

foreach util_js_src_file : util_js_src_files
  util_js_out_files += fs.copyfile(
    util_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endforeach

pack += util_js_out_files
eslint_out += util_js_out_files
