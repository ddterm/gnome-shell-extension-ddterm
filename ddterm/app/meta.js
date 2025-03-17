// SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { get_resource_file, get_resource_text } from './resources.js';

export const dir = get_resource_file('../..');
export const metadata = JSON.parse(get_resource_text(dir.get_child('metadata.json')));
export default metadata;

export const { name, uuid, version } = metadata;
