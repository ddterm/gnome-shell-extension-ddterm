# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pytest_tool = find_program(
  'pytest',
  dirs: toxworkdir / 'py3' / 'bin',
  required: false,
  disabler: true,
)

pytest_common_args = [
  '-c',
  files('pytest.ini'),
  '-p',
  'no:cacheprovider',
  '--package=' + pack_target.full_path(),
  '--gjs=' + gjs.full_path(),
  '--gnome-extensions-tool=' + extensions_tool.full_path(),
  '--gnome-shell=' + gnome_shell.full_path(),
  '--gsettings-tool=' + gsettings.full_path(),
]

pytest_enabled = pytest_tool.found()

foreach a : pytest_common_args
  pytest_enabled = pytest_enabled and not is_disabler(a)
endforeach

pytest_xvfb_enabled = pytest_enabled and xvfb.found()

wl_copy = find_program('wl-copy', required: false, disabler: true)
wl_paste = find_program('wl-paste', required: false, disabler: true)

pytest_wl_clipboard_enabled = pytest_enabled and wl_copy.found() and wl_paste.found()

summary('Functional tests', pytest_enabled, bool_yn: true, section: 'Tests')

summary(
  'Functional tests (X11)',
  pytest_xvfb_enabled,
  bool_yn: true,
  section: 'Tests',
)

summary(
  'Functional tests (wl-clipboard)',
  pytest_wl_clipboard_enabled,
  bool_yn: true,
  section: 'Tests',
)

if pytest_enabled
  test(
    'test_app.TestApp',
    pytest_tool,
    args: [
      pytest_common_args,
      pytest_wl_clipboard_enabled ? [
        '--wl-copy=' + wl_copy.full_path(),
        '--wl-paste=' + wl_paste.full_path(),
      ] : [
        '-k',
        'not test_wl_clipboard',
      ],
      meson.current_source_dir() / 'test_app.py::TestApp',
    ],
    suite: ['pytest'],
    protocol: 'gtest',
    timeout: 2 * 60,
  )

  test(
    'test_wm.TestWayland',
    pytest_tool,
    args: [
      pytest_common_args,
      meson.current_source_dir() / 'test_wm.py::TestWayland',
    ],
    suite: ['pytest'],
    protocol: 'gtest',
    timeout: 5 * 60,
  )

  if pytest_xvfb_enabled
    test(
      'test_wm.TestX11',
      pytest_tool,
      args: [
        pytest_common_args,
        '--xvfb=' + xvfb.full_path(),
        meson.current_source_dir() / 'test_wm.py::TestX11',
      ],
      suite: ['pytest'],
      protocol: 'gtest',
      timeout: 5 * 60,
    )
  endif
endif
