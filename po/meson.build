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
]

gettext_targets = i18n.gettext(
  gettext_domain,
  args: gettext_args,
  install: true,
  install_dir: extension_dir / 'locale',
)

alias_target('locales', gettext_targets[0])
alias_target('pot', gettext_targets[1])
alias_target('msgmerge', gettext_targets[2])

pack += gettext_targets[0]

run_target(
  'pot-set-year',
  command: [
    'sh',
    '-c',
    'sed -i "s/^# Copyright (C) YEAR /# Copyright (C) $(date -u +%Y) /" "$0"',
    files(f'@gettext_domain@.pot'),
  ],
)

xgettext = find_program('xgettext', disabler: true, required: false)

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
