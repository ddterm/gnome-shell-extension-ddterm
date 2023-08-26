import collections
import html
import pathlib


CIRCLE_EMOJI = [
    ':red_circle:',
    ':orange_circle:',
    ':yellow_circle:',
    ':green_circle:',
    ':large_blue_circle:',
    ':purple_circle:',
    ':brown_circle:',
    ':black_circle:',
    ':white_circle:',
]


def emoji_for_markup(markup):
    for k, v in markup.items():
        if v:
            for emoji in CIRCLE_EMOJI:
                if k in emoji:
                    return emoji

    return ''


def join_words(words):
    return ' '.join(word for word in words if word)


class Reporter:
    def __init__(self, config, path):
        self.config = config
        self.path = pathlib.Path(path)
        self.reports = collections.defaultdict(lambda: collections.defaultdict(list))
        self.node_markup = collections.defaultdict(dict)

    def pytest_runtest_logreport(self, report):
        category, letter, word = \
            self.config.hook.pytest_report_teststatus(report=report, config=self.config)

        if not isinstance(word, tuple):
            markup = None
        else:
            word, markup = word

        if markup is None:
            was_xfail = hasattr(report, 'wasxfail')

            if report.passed and not was_xfail:
                markup = {'green': True}

            elif report.passed and was_xfail:
                markup = {'yellow': True}

            elif report.failed:
                markup = {'red': True}

            elif report.skipped:
                markup = {'yellow': True}

            else:
                markup = {}

        if category:
            self.reports[category][report.nodeid].append(report)

            if markup:
                self.node_markup[report.nodeid] = markup

    def pytest_sessionfinish(self):
        content = []

        for category, reports_by_nodeid in self.reports.items():
            content.append('<details>')
            content.append('')
            content.append(
                f'<summary><b>{html.escape(category)} - {len(reports_by_nodeid)}</b></summary>'
            )
            content.append('')

            for nodeid, reports in reports_by_nodeid.items():
                emoji = emoji_for_markup(self.node_markup[nodeid])

                content.append('<details>')
                content.append('')
                content.append(f'<summary>{emoji} {html.escape(nodeid)}</summary>')
                content.append('')

                for report in reports:
                    if not report.longreprtext:
                        continue

                    title = join_words((getattr(report, 'head_line', ''), report.when))

                    content.append(f'+ *{html.escape(title)}*')
                    content.append('')
                    content.append('````python')
                    content.append(report.longreprtext)
                    content.append('````')
                    content.append('')

                content.append('</details>')
                content.append('')

            content.append('</details>')
            content.append('')

        self.path.write_text('\n'.join(content))


def pytest_addoption(parser):
    parser.addoption(
        '--markdown-report',
        default=None,
        type=pathlib.Path,
    )


def pytest_configure(config):
    path = config.getoption('--markdown-report')

    if path:
        config.pluginmanager.register(Reporter(config, path))
