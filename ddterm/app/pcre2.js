/*
    Copyright © 2023 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use strict';

var PCRE2_UTF = 0x00080000; /* exported PCRE2_UTF */
var PCRE2_NO_UTF_CHECK = 0x40000000; /* exported PCRE2_NO_UTF_CHECK */
var PCRE2_UCP = 0x00020000; /* exported PCRE2_UCP */
var PCRE2_MULTILINE = 0x00000400; /* exported PCRE2_MULTILINE */
var PCRE2_JIT_COMPLETE = 0x00000001; /* exported PCRE2_JIT_COMPLETE */
var PCRE2_JIT_PARTIAL_SOFT = 0x00000002; /* exported PCRE2_JIT_PARTIAL_SOFT */
var PCRE2_CASELESS = 0x00000008; /* exported PCRE2_CASELESS */
