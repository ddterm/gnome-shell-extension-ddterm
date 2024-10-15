import collections
import functools


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

    @functools.singledispatchmethod
    def contains(self, x, y):
        return (
            x >= self.x and
            x <= self.x + self.width and
            y >= self.y and
            y <= self.y + self.height
        )

    @contains.register
    def _(self, point: Point):
        return self.contains(*point)

    def center(self):
        return Point(
            self.x + self.width // 2,
            self.y + self.height // 2,
        )
