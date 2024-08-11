ALL := $(patsubst %.model,%.gen,$(wildcard *.model))

all: $(ALL)

clean:
	$(RM) $(ALL) pict.tar.gz
	$(RM) -r build

$(ALL): %.gen: %.model build/pict
	build/pict $< >$@ $(PICT_FLAGS)

test_show.gen: PICT_FLAGS := /o:3

pict.tar.gz:
	curl -L -o $@ https://github.com/microsoft/pict/archive/7d2ed98c28b837d8337976b7cbf421bd3c4b89dd.tar.gz

build:
	mkdir build

build/Makefile: pict.tar.gz | build
	tar -x -f $< -C build --strip-components=1

build/pict: build/Makefile $(wildcard $(addprefix build/,$(addprefix api/,*.c *.cpp *.h) $(addprefix cli/,*.c *.cpp *.h)))
	$(MAKE) -C build pict

.PHONY: all clean
