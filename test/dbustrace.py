# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import logging

from gi.repository import Gio


LOGGER = logging.getLogger(__name__)


def filter(connection, message, incoming):
    try:
        t = message.get_message_type()

        if t == Gio.DBusMessageType.METHOD_CALL:
            if incoming:
                LOGGER.debug(
                    'Received method %s.%s call on path %s from %s args: %s',
                    message.get_interface(),
                    message.get_member(),
                    message.get_path(),
                    message.get_sender(),
                    message.get_body(),
                )

            else:
                LOGGER.debug(
                    'Calling method %s.%s on path %s destination %s args: %s',
                    message.get_interface(),
                    message.get_member(),
                    message.get_path(),
                    message.get_destination(),
                    message.get_body(),
                )

        elif t == Gio.DBusMessageType.METHOD_RETURN:
            if incoming:
                LOGGER.debug(
                    'Received method return from %s: %s',
                    message.get_sender(),
                    message.get_body(),
                )

            else:
                LOGGER.debug(
                    'Sending method return to %s: %s',
                    message.get_destination(),
                    message.get_body(),
                )

        elif t == Gio.DBusMessageType.ERROR:
            if incoming:
                LOGGER.warning(
                    'Received error %s from %s: %s',
                    message.get_error_name(),
                    message.get_sender(),
                    message.get_body(),
                )

            else:
                LOGGER.warning(
                    'Sending error %s to %s: %s',
                    message.get_error_name(),
                    message.get_destination(),
                    message.get_body(),
                )

        elif t == Gio.DBusMessageType.SIGNAL:
            if incoming:
                LOGGER.debug(
                    'Received signal %s.%s on path %s from %s args: %s',
                    message.get_interface(),
                    message.get_member(),
                    message.get_path(),
                    message.get_sender(),
                    message.get_body(),
                )

            else:
                LOGGER.debug(
                    'Sending signal %s.%s on path %s destination %s args: %s',
                    message.get_interface(),
                    message.get_member(),
                    message.get_path(),
                    message.get_destination(),
                    message.get_body(),
                )

        else:
            if incoming:
                LOGGER.warning('Received invalid message: %s', message.print_(0))

            else:
                LOGGER.warning('Sending invalid message: %s', message.print_(0))

    except:  # noqa: E722
        LOGGER.exception('Exception in D-Bus trace filter')

    return message
