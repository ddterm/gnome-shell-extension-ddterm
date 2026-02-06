<!--
SPDX-FileCopyrightText: 2020 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# GNOME Shell용 또 다른 드롭다운 터미널 확장

[![extensions.gnome.org badge]][extensions.gnome.org]
[![Dev build badge]][Dev build download link]
[![Weblate status badge]][Weblate]
[![Weblate languages badge]][Weblate]

![Drop down animation]

[extensions.gnome.org badge]: https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fextensions.gnome.org%2Fextension%2F3780%2Fddterm%2F&search=(%5Cd%2B)%20downloads&logo=gnome&label=extensions.gnome.org
[Dev build badge]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fddterm%2Fgnome-shell-extension-ddterm%2Fdeployments%3Fenvironment%3Dgithub-pages%26per_page%3D1&query=0.updated_at&label=development%20build
[Dev build download link]: https://ddterm.github.io/gnome-shell-extension-ddterm/ddterm@amezin.github.com.shell-extension.zip
[Weblate status badge]: https://hosted.weblate.org/widget/gnome-shell-extension-ddterm/svg-badge.svg
[Weblate languages badge]: https://hosted.weblate.org/widget/gnome-shell-extension-ddterm/language-badge.svg
[Drop down animation]: /docs/screenshots/dropdown.gif

다음 프로젝트에서 영감을 얻음

- <https://github.com/bigbn/drop-down-terminal-x>

- <https://github.com/Guake/guake>

## 주요 특징

- Wayland 환경에서 네이티브로 실행

- 명령줄([command line])에서 제어 가능

- 마우스로 테두리를 드래그하여 터미널 창 크기 조절 가능

- 재시작 후 모든 탭이 자동으로 복원됨

- 다양한 `설정`을 지원하는 기본 설정 창

![Preferences screenshots]

[command line]: /docs/CommandLine.md
[Preferences screenshots]: /docs/screenshots/prefs.gif

## [TechHut] 리뷰

[![my favorite GNOME extension video thumbnail]][my favorite GNOME extension video]

[TechHut]: https://www.youtube.com/channel/UCjSEJkpGbcZhvo0lr-44X_w
[my favorite GNOME extension video]: http://www.youtube.com/watch?v=tF6_FJYca64
[my favorite GNOME extension video thumbnail]: http://img.youtube.com/vi/tF6_FJYca64/0.jpg

## 설치

가장 쉬운 설치 방법은 [extensions.gnome.org]를 방문하는 것입니다.

하지만 [extensions.gnome.org]의 심사 과정이 간혹 지연될 수 있어.  
새로운 버전이 이곳 GitHub에는 출시되었더라도,  
[extensions.gnome.org]에는 아직 반영되지 않았을 수도 있습니다.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

GitHub에서 설치하려면 [`docs/Install.md`] 파일을 참고하세요.

[`docs/Install.md`]: /docs/Install.md

## 기여하기

풀 리퀘스트(Pull Request)는 언제나 환영합니다.

자세한 내용은 [`docs/CONTRIBUTING.md`] 파일을 참고해 주세요.

[`docs/CONTRIBUTING.md`]: /docs/CONTRIBUTING.md

## 번역

[Weblate]를 사용하여 사용자 인터페이스 번역을 돕거나, 
GitHub에서 풀 리퀘스트를 통해 번역 개선 사항을 제출할 수 있습니다.

[![Translation status]][Weblate]

[`docs/Translations.md`] 파일을 참고하세요.

[Weblate]: https://hosted.weblate.org/engage/gnome-shell-extension-ddterm/
[Translation status]: https://hosted.weblate.org/widgets/gnome-shell-extension-ddterm/-/multi-auto.svg
[`docs/Translations.md`]: /docs/Translations.md
