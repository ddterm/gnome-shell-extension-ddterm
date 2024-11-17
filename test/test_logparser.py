# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import logging

from . import logparser, syslog


def test_message1():
    message = b'GNOME Shell-Message: 05:17:57.051: ' \
        b'Unable to mount volume SAMSUNG Android: Gio.IOErrorEnum: Unable to open MTP device'

    match = logparser.GLIB_MESSAGE_RE.match(message)

    assert match
    assert match['domain'] == b'GNOME Shell'
    assert match['levelname'] == b'Message'
    assert match['created'] == b'05:17:57'
    assert match['msecs'] == b'051'
    assert match['message'] == \
        b'Unable to mount volume SAMSUNG Android: Gio.IOErrorEnum: Unable to open MTP device'

    parsed = logparser.parse(match)

    assert parsed
    assert parsed['name'] == 'GNOME Shell'
    assert parsed['levelname'] == 'Message'
    assert parsed['levelno'] == logging.getLevelName('Message')
    assert parsed['msecs'] == 51
    assert parsed['message'] == \
        'Unable to mount volume SAMSUNG Android: Gio.IOErrorEnum: Unable to open MTP device'


def test_message2():
    message = b'(gnome-shell:516551): St-WARNING **: 07:55:52.417: ' \
        b'Failed to open sliced image: Operation was cancelled'

    match = logparser.GLIB_MESSAGE_RE.match(message)

    assert match
    assert match['prgname'] == b'gnome-shell'
    assert match['pid'] == b'516551'
    assert match['domain'] == b'St'
    assert match['levelname'] == b'WARNING'
    assert match['created'] == b'07:55:52'
    assert match['msecs'] == b'417'
    assert match['message'] == \
        b'Failed to open sliced image: Operation was cancelled'

    parsed = logparser.parse(match)

    assert parsed
    assert parsed['processName'] == 'gnome-shell'
    assert parsed['process'] == 516551
    assert parsed['name'] == 'St'
    assert parsed['levelname'] == 'WARNING'
    assert parsed['levelno'] == logging.WARNING
    assert parsed['msecs'] == 417
    assert parsed['message'] == \
        'Failed to open sliced image: Operation was cancelled'


def test_message3():
    message = b'(gjs:468140): Gjs-WARNING **: 01:56:39.160: JS ERROR: Error\n' \
        b'@typein:3:10\n' \
        b'@<stdin>:1:42\n' \
        b'\n'

    match = logparser.GLIB_MESSAGE_RE.match(message)

    assert match
    assert match['prgname'] == b'gjs'
    assert match['pid'] == b'468140'
    assert match['domain'] == b'Gjs'
    assert match['levelname'] == b'WARNING'
    assert match['created'] == b'01:56:39'
    assert match['msecs'] == b'160'
    assert match['message'] == b'JS ERROR: Error\n@typein:3:10\n@<stdin>:1:42\n'

    parsed = logparser.parse(match)

    assert parsed
    assert parsed['processName'] == 'gjs'
    assert parsed['process'] == 468140
    assert parsed['name'] == 'Gjs'
    assert parsed['levelname'] == 'WARNING'
    assert parsed['levelno'] == logging.WARNING
    assert parsed['msecs'] == 160
    assert parsed['message'] == 'JS ERROR: Error\n@typein:3:10\n@<stdin>:1:42\n'


def test_message4():
    message = b'(gnome-shell:470941): Gjs-WARNING **: 02:09:11.682: ' \
        b'Gio.UnixOutputStream has been moved to a separate platform-specific library. ' \
        b'Please update your code to use GioUnix.OutputStream instead.\n' \
        b'0 TeeLogCollector() ["file:///home/amezin/.local/share/gnome-shell/' \
        b'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":99:8]\n' \
        b'1 _init() ["file:///home/amezin/.local/share/gnome-shell/extensions/' \
        b'ddterm@amezin.github.com/ddterm/shell/subprocess.js":195:14]\n' \
        b'2 DDTermSubprocess() ["file:///home/amezin/.local/share/gnome-shell/' \
        b'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":172:3]\n'

    match = logparser.GLIB_MESSAGE_RE.match(message)

    assert match
    assert match['prgname'] == b'gnome-shell'
    assert match['pid'] == b'470941'
    assert match['domain'] == b'Gjs'
    assert match['levelname'] == b'WARNING'
    assert match['created'] == b'02:09:11'
    assert match['msecs'] == b'682'
    assert match['message'] == \
        b'Gio.UnixOutputStream has been moved to a separate platform-specific library. ' \
        b'Please update your code to use GioUnix.OutputStream instead.\n' \
        b'0 TeeLogCollector() ["file:///home/amezin/.local/share/gnome-shell/' \
        b'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":99:8]\n' \
        b'1 _init() ["file:///home/amezin/.local/share/gnome-shell/extensions/' \
        b'ddterm@amezin.github.com/ddterm/shell/subprocess.js":195:14]\n' \
        b'2 DDTermSubprocess() ["file:///home/amezin/.local/share/gnome-shell/' \
        b'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":172:3]\n'

    parsed = logparser.parse(match)

    assert parsed
    assert parsed['processName'] == 'gnome-shell'
    assert parsed['process'] == 470941
    assert parsed['name'] == 'Gjs'
    assert parsed['levelname'] == 'WARNING'
    assert parsed['levelno'] == logging.WARNING
    assert parsed['msecs'] == 682
    assert parsed['message'] == \
        'Gio.UnixOutputStream has been moved to a separate platform-specific library. ' \
        'Please update your code to use GioUnix.OutputStream instead.\n' \
        '0 TeeLogCollector() ["file:///home/amezin/.local/share/gnome-shell/' \
        'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":99:8]\n' \
        '1 _init() ["file:///home/amezin/.local/share/gnome-shell/extensions/' \
        'ddterm@amezin.github.com/ddterm/shell/subprocess.js":195:14]\n' \
        '2 DDTermSubprocess() ["file:///home/amezin/.local/share/gnome-shell/' \
        'extensions/ddterm@amezin.github.com/ddterm/shell/subprocess.js":172:3]\n'


def test_message5():
    message = b'(gnome-shell:44): GNOME Shell-CRITICAL **: 00:31:58.601: ' \
        b'Gio.DBusError: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown: ' \
        b'The name org.gnome.Shell.CalendarServer was not provided by any .service files\n' \
        b'\n' \
        b'Stack trace:\n' \
        b'  asyncCallback@resource:///org/gnome/gjs/modules/core/overrides/Gio.js:114:23\n' \
        b'  @resource:///org/gnome/shell/ui/init.js:21:20\n' \
        b'  \n'

    match = logparser.GLIB_MESSAGE_RE.match(message)

    assert match
    assert match['prgname'] == b'gnome-shell'
    assert match['pid'] == b'44'
    assert match['domain'] == b'GNOME Shell'
    assert match['levelname'] == b'CRITICAL'
    assert match['created'] == b'00:31:58'
    assert match['msecs'] == b'601'
    assert match['message'] == \
        b'Gio.DBusError: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown: ' \
        b'The name org.gnome.Shell.CalendarServer was not provided by any .service files\n' \
        b'\n' \
        b'Stack trace:\n' \
        b'  asyncCallback@resource:///org/gnome/gjs/modules/core/overrides/Gio.js:114:23\n' \
        b'  @resource:///org/gnome/shell/ui/init.js:21:20\n' \
        b'  '

    parsed = logparser.parse(match)

    assert parsed
    assert parsed['processName'] == 'gnome-shell'
    assert parsed['process'] == 44
    assert parsed['name'] == 'GNOME Shell'
    assert parsed['levelname'] == 'CRITICAL'
    assert parsed['levelno'] == logging.CRITICAL
    assert parsed['msecs'] == 601
    assert parsed['message'] == \
        'Gio.DBusError: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown: ' \
        'The name org.gnome.Shell.CalendarServer was not provided by any .service files\n' \
        '\n' \
        'Stack trace:\n' \
        '  asyncCallback@resource:///org/gnome/gjs/modules/core/overrides/Gio.js:114:23\n' \
        '  @resource:///org/gnome/shell/ui/init.js:21:20\n' \
        '  '


def test_syslog():
    message = \
        b'<85>Sep  8 18:36:46 polkitd[167]: Loading rules from directory /etc/polkit-1/rules.d'

    match = syslog.PATTERN.fullmatch(message)

    assert match
    assert match['pri'] == b'85'
    assert match['month'] == b'Sep'
    assert match['day'] == b' 8'
    assert match['time'] == b'18:36:46'
    assert match['processName'] == b'polkitd'
    assert match['pid'] == b'167'

    parsed, logger = syslog.parse(message)

    assert parsed
    assert logger == syslog.LOGGER.getChild('AUTHPRIV')
    assert parsed['name'] == logger.name
    assert parsed['levelno'] == syslog.LEVELS[syslog.Severity.LOG_NOTICE]
    assert parsed['levelname'] == 'NOTICE'
    assert parsed['msecs'] == 0
    assert parsed['processName'] == 'polkitd'
    assert parsed['process'] == 167
    assert parsed['message'] == 'polkitd[167]: Loading rules from directory /etc/polkit-1/rules.d'
