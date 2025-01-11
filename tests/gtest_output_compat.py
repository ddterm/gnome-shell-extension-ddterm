# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

# http://google.github.io/googletest/advanced.html#generating-an-xml-report

import os.path


def gtest_output_arg(value):
    if value == 'xml':
        return 'test_detail.xml'

    prefix = 'xml:'

    if not value.startswith(prefix):
        raise ValueError(
            f'--gtest_output= value is expected to start with {prefix!r} (got {value!r})'
        )

    return value[len(prefix):]


def pytest_addoption(parser):
    env_value = os.environ.get('GTEST_OUTPUT', None)
    kwargs = dict() if env_value is None else dict(default=gtest_output_arg(env_value))

    parser.addoption(
        '--gtest_output',
        dest='xmlpath',
        type=gtest_output_arg,
        help='JUnit report path in GoogleTest-compatible format (--gtest_output=xml:dir/name.xml)',
        **kwargs,
    )
