# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pytest_tool = find_program(
  'pytest',
  dirs: toxworkdir / 'py3' / 'bin',
  required: false,
  disabler: true,
)

if pytest_tool.found()
  pytest_check = run_command(
    [
      pytest_tool,
      '-c',
      files('pytest.ini'),
      '--collect-only',
      meson.current_source_dir(),
    ],
    check: false,
  )

  if pytest_check.returncode() != 0
    warning(
      'pytest found, but it fails to collect the tests, so tests will be disabled',
    )

    pytest_tool = disabler()
  endif
endif

wl_copy = find_program('wl-copy', required: false, disabler: true)
wl_paste = find_program('wl-paste', required: false, disabler: true)

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
  '--xvfb=' + (xvfb.found() ? xvfb.full_path() : 'not-found'),
  '--wl-copy=' + (wl_copy.found() ? wl_copy.full_path() : 'not-found'),
  '--wl-paste=' + (wl_paste.found() ? wl_paste.full_path() : 'not-found'),
]

pytest_enabled = pytest_tool.found()

foreach a : pytest_common_args
  pytest_enabled = pytest_enabled and not is_disabler(a)
endforeach

pytest_xvfb_enabled = pytest_enabled and xvfb.found()
pytest_wl_clipboard_enabled = pytest_enabled and wl_copy.found() and wl_paste.found()

summary('Functional', pytest_enabled, bool_yn: true, section: 'Tests')

summary(
  'X11',
  pytest_xvfb_enabled,
  bool_yn: true,
  section: 'Tests',
)

summary(
  'wl-clipboard',
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
      pytest_wl_clipboard_enabled ? [] : ['-k', 'not test_wl_clipboard'],
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
        meson.current_source_dir() / 'test_wm.py::TestX11',
      ],
      suite: ['pytest'],
      protocol: 'gtest',
      timeout: 5 * 60,
    )
  endif
endif
