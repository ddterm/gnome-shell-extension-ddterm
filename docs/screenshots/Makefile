# SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

GIFS := search.gif notebook.gif
ALL_PNG := $(wildcard *.png)

SEARCH_PNGS := $(filter search-%.png,$(ALL_PNG))
NOTEBOOK_PNGS := $(filter notebook-%.png,$(ALL_PNG))

all: $(GIFS) downscale

clean:
	$(RM) search.gif notebook.gif

downscale: $(addprefix downscale/,$(ALL_PNG))

.PHONY: all clean downscale

downscale/%: %
	if [[ $(shell magick identify -ping -format %w $<) -gt 2000 ]] || [[ $(shell magick identify -ping -format %h $<) -gt 2000 ]]; \
	then \
		magick convert -resize 50% $< $<; \
	fi

search.gif notebook.gif:
	magick convert -delay 100 $^ $@

search.gif: $(SEARCH_PNGS) | $(addprefix downscale/,$(SEARCH_PNGS))

notebook.gif: $(NOTEBOOK_PNGS) | $(addprefix downscale/,$(NOTEBOOK_PNGS))
