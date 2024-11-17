// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

export function WEXITSTATUS(status) {
    return (status & 0xff00) >> 8;
}

export function WTERMSIG(status) {
    return status & 0x7f;
}

export function WIFEXITED(status) {
    return WTERMSIG(status) === 0;
}
