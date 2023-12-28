ALL := $(patsubst %.model,%.gen,$(wildcard *.model))

all: $(ALL)

clean:
	$(RM) $(ALL)

$(ALL): %.gen: %.model
	pict $< >$@ $(PICT_FLAGS)

test_show.gen: PICT_FLAGS := /o:3

.PHONY: all clean
