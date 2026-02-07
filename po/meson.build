# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

# REUSE-IgnoreStart
gettext_copyright = '\n'.join(
  [
    'ddterm contributors <https://github.com/ddterm/gnome-shell-extension-ddterm/>',
    'SPDX-License-Identifier: GPL-3.0-or-later',
  ],
)
# REUSE-IgnoreEnd

gettext_args = [
  '--from-code=UTF-8',
  '--add-comments',
  '--check=ellipsis-unicode',
  '--check=space-ellipsis',
  '--check=bullet-unicode',
  # TODO: '--check=quote-unicode',
  f'--copyright-holder=@gettext_copyright@',
  '--no-wrap',
]

xgettext = find_program(
  'xgettext',
  required: false,
  disabler: true,
  native: true,
)

msgmerge = find_program(
  'msgmerge',
  required: false,
  disabler: true,
  native: true,
)

gettext_targets = i18n.gettext(
  gettext_domain,
  args: gettext_args,
  install: true,
  install_dir: extension_dir / 'locale',
)

bundle += gettext_targets[0]

alias_target('locales', gettext_targets[0])

# HACK: run targets are run serially, at least with ninja.
alias_target(
  'pot',
  [
    gettext_targets[1],
    run_target(
      'pot-set-year',
      command: [
        'sh',
        '-c',
        'sed -i "s/^# Copyright (C) YEAR /# Copyright (C) $(date -u +%Y) /" "$0"',
        files(f'@gettext_domain@.pot'),
      ],
    ),
  ],
)

run_target(
  'potfiles',
  command: [
    'gen-potfiles.py',
    '-C',
    '@CURRENT_SOURCE_DIR@',
    '--git',
    git,
    '--xgettext',
    xgettext,
    '-o',
    '@CURRENT_SOURCE_DIR@' / 'POTFILES.in',
    '--',
    gettext_args,
  ],
)

msgmerge_targets = []

# https://github.com/mesonbuild/meson/blob/master/mesonbuild/scripts/gettext.py
foreach linguas_line : fs.read('LINGUAS').splitlines()
  linguas_line = linguas_line.strip()

  if linguas_line == '' or linguas_line.startswith('#')
    continue
  endif

  foreach linguas_lang : linguas_line.split()
    if linguas_lang == ''
      continue
    endif

    msgmerge_targets += [
      run_target(
        f'msgmerge-@linguas_lang@',
        command: [
          msgmerge,
          '--no-wrap',
          '--update',
          '--previous',
          files(f'@linguas_lang@.po'),
          files(f'@gettext_domain@.pot'),
        ],
      ),
    ]
  endforeach
endforeach

alias_target('msgmerge', msgmerge_targets)
