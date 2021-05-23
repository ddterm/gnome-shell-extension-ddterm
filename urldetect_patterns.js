/*
    Copyright © 2020, 2021 Aleksandr Mezin

    Converted from
    https://gitlab.gnome.org/GNOME/gnome-terminal/-/blob/bb808a756935adbdf2bf950ae100c907374292b9/src/terminal-regex.h
    Copyright © 2015 Egmont Koblinger

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

/* exported REGEX_URL_AS_IS REGEX_URL_FILE REGEX_URL_HTTP REGEX_URL_VOIP REGEX_EMAIL REGEX_NEWS_MAN */

/* Lookbehind to see if there's a preceding apostrophe.
 * Unlike the other *_DEF macros which define regex subroutines,
 * this one is a named capture that defines APOS_START to either
 * an apostrophe or the empty string, depending on the character
 * preceding this APOS_START_DEF construct. */
const APOS_START_DEF = "(?<APOS_START>(?<='))?";

const SCHEME = '(?ix: news | telnet | nntp | https? | ftps? | sftp | webcal )';

const USERCHARS = '-+.[:alnum:]';
/* Nonempty username, e.g. "john.smith" */
const USER = `[${USERCHARS}]+`;

const PASSCHARS_CLASS = "[-[:alnum:]\\Q,?;.:/!%$^*&~\"#'\\E]";
/* Optional colon-prefixed password. I guess empty password should be allowed, right? E.g. ":secret", ":", "" */
const PASS = `(?x: :${PASSCHARS_CLASS}* )?`;

/* Optional at-terminated username (with perhaps a password too), e.g. "joe@", "pete:secret@", "" */
const USERPASS = `(?:${USER}${PASS}@)?`;

/* S4: IPv4 segment (number between 0 and 255) with lookahead at the end so that we don't match "25" in the string "256".
   The lookahead could go to the last segment of IPv4 only but this construct allows nicer unittesting. */
const S4_DEF = '(?(DEFINE)(?<S4>(?x: (?: [0-9] | [1-9][0-9] | 1[0-9]{2} | 2[0-4][0-9] | 25[0-5] ) (?! [0-9] ) )))';

/* IPV4: Decimal IPv4, e.g. "1.2.3.4", with lookahead (implemented in S4) at the end so that we don't match "192.168.1.123" in the string "192.168.1.1234". */
const IPV4_DEF = `${S4_DEF}(?(DEFINE)(?<IPV4>(?x: (?: (?&S4) \\. ){3} (?&S4) )))`;

/* IPv6, including embedded IPv4, e.g. "::1", "dead:beef::1.2.3.4".
 * Lookahead for the next char not being a dot or digit, so it doesn't get stuck matching "dead:beef::1" in "dead:beef::1.2.3.4".
 * This is not required since the surrounding brackets would trigger backtracking, but it allows nicer unittesting.
 * TODO: more strict check (right number of colons, etc.)
 * TODO: add zone_id: RFC 4007 section 11, RFC 6874 */

/* S6: IPv6 segment, S6C: IPv6 segment followed by a comma, CS6: comma followed by an IPv6 segment */
const S6_DEF = '(?(DEFINE)(?<S6>[[:xdigit:]]{1,4})(?<CS6>:(?&S6))(?<S6C>(?&S6):))';

/* No :: shorthand */
const IPV6_FULL = '(?x: (?&S6C){7} (?&S6) )';
/* Begins with :: */
const IPV6_LEFT = '(?x: : (?&CS6){1,7} )';
/* :: somewhere in the middle - use negative lookahead to make sure there aren't too many colons in total */
const IPV6_MID = '(?x: (?! (?: [[:xdigit:]]*: ){8} ) (?&S6C){1,6} (?&CS6){1,6} )';
/* Ends with :: */
const IPV6_RIGHT = '(?x: (?&S6C){1,7} : )';
/* Is "::" and nothing more */
const IPV6_NULL = '(?x: :: )';

/* The same ones for IPv4-embedded notation, without the actual IPv4 part */
const IPV6V4_FULL = '(?x: (?&S6C){6} )';
const IPV6V4_LEFT = '(?x: :: (?&S6C){0,5} )';  /* includes "::<ipv4>" */
const IPV6V4_MID = '(?x: (?! (?: [[:xdigit:]]*: ){7} ) (?&S6C){1,4} (?&CS6){1,4} ) :';
const IPV6V4_RIGHT = '(?x: (?&S6C){1,5} : )';

/* IPV6: An IPv6 address (possibly with an embedded IPv4).
 * This macro defines both IPV4 and IPV6, since the latter one requires the former. */
const IP_DEF = `${IPV4_DEF + S6_DEF}(?(DEFINE)(?<IPV6>(?x: (?: ${IPV6_NULL} | ${IPV6_LEFT} | ${IPV6_MID} | ${IPV6_RIGHT} | ${IPV6_FULL} | (?: ${IPV6V4_FULL} | ${IPV6V4_LEFT} | ${IPV6V4_MID} | ${IPV6V4_RIGHT} ) (?&IPV4) ) (?! [.:[:xdigit:]] ) )))`;

/* Either an alphanumeric character or dash; or if [negative lookahead] not ASCII
 * then any graphical Unicode character.
 * A segment can consist entirely of numbers.
 * (Note: PCRE doesn't support character class subtraction/intersection.) */
const HOSTNAMESEGMENTCHARS_CLASS = '(?x: [-[:alnum:]] | (?! [[:ascii:]] ) [[:graph:]] )';

/* A hostname of at least 1 component. The last component cannot be entirely numbers.
 * E.g. "foo", "example.com", "1234.com", but not "foo.123" */
const HOSTNAME1 = `(?x: (?: ${HOSTNAMESEGMENTCHARS_CLASS}+ \\. )* ${HOSTNAMESEGMENTCHARS_CLASS}* (?! [0-9] ) ${HOSTNAMESEGMENTCHARS_CLASS}+ )`;

/* A hostname of at least 2 components. The last component cannot be entirely numbers.
 * E.g. "example.com", "1234.com", but not "1234.56" */
const HOSTNAME2 = `(?x: (?: ${HOSTNAMESEGMENTCHARS_CLASS}+ \\.)+ ${HOSTNAME1} )`;

/* For URL: Hostname, IPv4, or bracket-enclosed IPv6, e.g. "example.com", "1.2.3.4", "[::1]" */
const URL_HOST = `(?x: ${HOSTNAME1} | (?&IPV4) | \\[ (?&IPV6) \\] )`;

/* For e-mail: Hostname of at least two segments, or bracket-enclosed IPv4 or IPv6, e.g. "example.com", "[1.2.3.4]", "[::1]".
 * Technically an e-mail with a single-component hostname might be valid on a local network, but let's avoid tons of false positives (e.g. in a typical shell prompt). */
const EMAIL_HOST = `(?x: ${HOSTNAME2} | \\[ (?: (?&IPV4) | (?&IPV6) ) \\] )`;

/* Number between 1 and 65535, with lookahead at the end so that we don't match "6789" in the string "67890",
   and in turn we don't eventually match "http://host:6789" in "http://host:67890". */
const N_1_65535 = '(?x: (?: [1-9][0-9]{0,3} | [1-5][0-9]{4} | 6[0-4][0-9]{3} | 65[0-4][0-9]{2} | 655[0-2][0-9] | 6553[0-5] ) (?! [0-9] ) )';

/* Optional colon-prefixed port, e.g. ":1080", "" */
const PORT = `(?x: \\:${N_1_65535} )?`;

/* Omit the parentheses, see below */
const PATHCHARS_CLASS = "[-[:alnum:]\\Q_$.+!*,:;@&=?/~#|%'\\E]";
/* Chars to end a URL. Apostrophe only allowed if there wasn't one in front of the URL, see bug 448044 */
const PATHTERM_CLASS = "[-[:alnum:]\\Q_$+*:@&=/~#|%'\\E]";
const PATHTERM_NOAPOS_CLASS = '[-[:alnum:]\\Q_$+*:@&=/~#|%\\E]';

/* Recursive definition of PATH that allows parentheses and square brackets only if balanced, see bug 763980. */
const PATH_INNER_DEF = `(?(DEFINE)(?<PATH_INNER>(?x: (?: ${PATHCHARS_CLASS}* (?: \\( (?&PATH_INNER) \\) | \\[ (?&PATH_INNER) \\] ) )* ${PATHCHARS_CLASS}* )))`;
/* Same as above, but the last character (if exists and is not a parenthesis) must be from PATHTERM_CLASS. */
const PATH_DEF = `(?(DEFINE)(?<PATH>(?x: (?: ${PATHCHARS_CLASS}* (?: \\( (?&PATH_INNER) \\) | \\[ (?&PATH_INNER) \\] ) )* (?: ${PATHCHARS_CLASS}* (?(<APOS_START>)${PATHTERM_NOAPOS_CLASS}|${PATHTERM_CLASS}) )? )))`;

const URLPATH = '(?x: /(?&PATH) )?';
const VOIP_PATH = '(?x: [;?](?&PATH) )?';

/* Now let's put these fragments together */

const DEFS = APOS_START_DEF + IP_DEF + PATH_INNER_DEF + PATH_DEF;

var REGEX_URL_AS_IS = `${DEFS + SCHEME}://${USERPASS}${URL_HOST}${PORT}${URLPATH}`;
/* TODO: also support file:/etc/passwd */
var REGEX_URL_FILE = `${DEFS}(?ix: file:/ (?: / (?: ${HOSTNAME1} )? / )? (?! / ) )(?&PATH)`;
/* Lookbehind so that we don't catch "abc.www.foo.bar", bug 739757. Lookahead for www/ftp for convenience (so that we can reuse HOSTNAME1). */
/* The commented-out variant looks more like our other definitions, but fails with PCRE 10.34. See GNOME/gnome-terminal#221.
 * TODO: revert to this nicer pattern some time after 10.35's release.
 * const REGEX_URL_HTTP = DEFS "(?<!(?:" HOSTNAMESEGMENTCHARS_CLASS "|[.]))(?=(?i:www|ftp))" HOSTNAME1 PORT URLPATH
 */
var REGEX_URL_HTTP = `${APOS_START_DEF}(?<!(?:${HOSTNAMESEGMENTCHARS_CLASS}|[.]))(?=(?i:www|ftp))${HOSTNAME1}${PORT}${PATH_INNER_DEF}${PATH_DEF}${URLPATH}`;
var REGEX_URL_VOIP = `${DEFS}(?i:h323:|sips?:)${USERPASS}${URL_HOST}${PORT}${VOIP_PATH}`;
var REGEX_EMAIL = `${DEFS}(?i:mailto:)?${USER}@${EMAIL_HOST}`;
var REGEX_NEWS_MAN = "(?i:news:|man:|info:)[-[:alnum:]\\Q^_{|}~!\"#$%&'()*+,./;:=?`\\E]+";
