import dataclasses
import typing


class TaggedValue(typing.NamedTuple):
    value: typing.Any
    tag: str


def parse_line(line):
    return line.removesuffix('\n').split('\t')


@dataclasses.dataclass(frozen=True)
class Parametrization:
    argnames: tuple[str]
    argvalues: list[tuple[TaggedValue]]

    @classmethod
    def load(cls, filename, globals):
        with open(filename) as f:
            header = parse_line(next(f))

            return cls(
                argnames=tuple(header),
                argvalues=[
                    tuple(
                        TaggedValue(value=eval(strvalue, globals), tag=strvalue)
                        for strvalue in parse_line(line)
                    )
                    for line in f
                ]
            )

    def filter(self, argname, argvalue):
        index = self.argnames.index(argname)

        return Parametrization(
            argnames=self.argnames[:index] + self.argnames[index + 1:],
            argvalues=[
                row[:index] + row[index + 1:]
                for row in self.argvalues
                if row[index].value == argvalue
            ]
        )

    def order_by(self, argname, reverse=False):
        index = self.argnames.index(argname)

        return Parametrization(
            argnames=self.argnames,
            argvalues=sorted(
                self.argvalues,
                key=lambda row: row[index].value,
                reverse=reverse
            )
        )

    def apply(self, metafunc, **kwargs):
        metafunc.parametrize(
            self.argnames,
            [tuple(v.value for v in row) for row in self.argvalues],
            ids=['-'.join(v.tag for v in row) for row in self.argvalues],
            **kwargs
        )
