# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: CC0-1.0

import argparse

from flake8.formatting.base import BaseFormatter
from flake8.formatting.default import Default
from flake8_sarif_formatter.flake8_sarif_formatter import SarifFormatter


class Formatter(BaseFormatter):
    def __init__(self, options):
        super().__init__(options)

        terminal_options = argparse.Namespace(**vars(options))
        terminal_options.output_file = None
        terminal_options.format = 'default'

        self.terminal = Default(terminal_options)
        self.sarif = SarifFormatter(options)

        self.terminal.after_init()
        self.sarif.after_init()

    def after_init(self):
        pass

    def beginning(self, filename):
        self.terminal.beginning(filename)
        self.sarif.beginning(filename)

    def finished(self, filename):
        self.sarif.finished(filename)
        self.terminal.finished(filename)

    def start(self):
        self.terminal.start()
        self.sarif.start()

    def handle(self, error):
        self.terminal.handle(error)
        self.sarif.handle(error)

    def show_statistics(self, statistics):
        self.terminal.show_statistics(statistics)

    def show_benchmarks(self, benchmarks):
        self.terminal.show_benchmarks(benchmarks)

    def stop(self):
        self.sarif.stop()

        if self.sarif.output_fd:
            self.sarif.output_fd.close()

        self.terminal.stop()
