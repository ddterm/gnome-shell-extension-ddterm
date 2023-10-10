GIFS := prefs.gif search.gif notebook.gif
ALL_PNG := $(wildcard *.png)

PREFS_PNGS := $(filter prefs%.png,$(ALL_PNG))
SEARCH_PNGS := $(filter search-%.png,$(ALL_PNG))
NOTEBOOK_PNGS := $(filter notebook-%.png,$(ALL_PNG))

all: $(GIFS) downscale

clean:
	$(RM) prefs.gif search.gif notebook.gif

downscale: $(addprefix downscale/,$(ALL_PNG))

.PHONY: all clean downscale

downscale/%: %
	if [[ $(shell magick identify -ping -format %w $<) -gt 2000 ]] || [[ $(shell magick identify -ping -format %h $<) -gt 2000 ]]; \
	then \
		magick convert -resize 50% $< $<; \
	fi

prefs.gif search.gif notebook.gif:
	magick convert -delay 100 $^ $@

prefs.gif: $(PREFS_PNGS) | $(addprefix downscale/,$(PREFS_PNGS))

search.gif: $(SEARCH_PNGS) | $(addprefix downscale/,$(SEARCH_PNGS))

notebook.gif: $(NOTEBOOK_PNGS) | $(addprefix downscale/,$(NOTEBOOK_PNGS))
