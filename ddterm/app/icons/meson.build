# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

icon_files = files(
  'quotation-symbolic.svg',
  'regex-symbolic.svg',
  'uppercase-symbolic.svg',
)

foreach f : icon_files
  pack += fs.copyfile(
    f,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app' / 'icons',
  )
endforeach
