# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

gettext_args = [
  '--from-code=UTF-8',
  '--add-comments',
  '--check=ellipsis-unicode',
  '--check=space-ellipsis',
  '--check=bullet-unicode',
  # TODO: '--check=quote-unicode',
  '--no-wrap',
]

gettext_targets = i18n.gettext(
  gettext_domain,
  args: gettext_args,
  install: true,
  install_dir: extension_dir / 'locale',
)

bundle += gettext_targets[0]

alias_target('locales', gettext_targets[0])
alias_target('pot', gettext_targets[1])

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
