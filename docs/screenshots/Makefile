all: prefs.gif search.gif notebook.gif

clean:
	$(RM) prefs.gif search.gif notebook.gif

.PHONY: all clean

prefs.gif search.gif notebook.gif:
	magick convert -delay 100 $^ $@

prefs.gif: prefs*.png

search.gif: search-*.png

notebook.gif: notebook-*.png
