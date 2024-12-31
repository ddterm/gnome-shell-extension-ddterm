# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

app_fakeext_misc_js_out_files = []
app_fakeext_misc_js_src_files = files('extensionUtils.js')

foreach app_fakeext_misc_js_src_file : app_fakeext_misc_js_src_files
  app_fakeext_misc_js_out_files += fs.copyfile(
    app_fakeext_misc_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app' / 'fakeext' / 'misc',
  )
endforeach

pack += app_fakeext_misc_js_out_files
eslint_out += app_fakeext_misc_js_out_files
