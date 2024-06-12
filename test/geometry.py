import collections


class Point(
    collections.namedtuple('Point', ('x', 'y'))
):
    def __new__(cls, x, y):
        return super().__new__(cls, int(x), int(y))

    @classmethod
    def parse_variant(cls, variant):
        return cls(
            *(
                variant.get_child_value(i).get_int32()
                for i in range(variant.n_children())
            )
        )


class Rect(
    collections.namedtuple('Rect', ('x', 'y', 'width', 'height'))
):
    def __new__(cls, x, y, width, height):
        return super().__new__(cls, int(x), int(y), int(width), int(height))

    @classmethod
    def parse_variant(cls, variant):
        return cls(
            *(
                variant.get_child_value(i).get_int32()
                for i in range(variant.n_children())
            )
        )
