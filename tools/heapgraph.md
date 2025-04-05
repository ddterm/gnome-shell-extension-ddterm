# gjs-heapgraph

A heap analyzer for Gjs based on https://github.com/amccreight/heapgraph to aid
in debugging and plugging memory leaks.

## Resource Usage

Be aware that parsing a heap can take a fair amount of RAM depending on the
heap size and time depending on the amount of target objects and path length.

Examples of approximate memory and time required to build DOT graphs on an
IvyBridge i7:

| Heap Size | RAM   | Targets | Time        |
|-----------|-------|---------|-------------|
| 5MB       | 80MB  | 1500    | 1.5 Minutes |
| 30MB      | 425MB | 7700    | 40 Minutes  |

## Basic Usage

### Getting a Heap Dump

The more convenient way to dump a heap is to send `SIGUSR1` to a GJS process
with the env variable `GJS_DEBUG_HEAP_OUTPUT` set:

```sh
$ GJS_DEBUG_HEAP_OUTPUT=myApp.heap gjs myApp.js &
$ kill -USR1 <gjs-pid>
```

It's also possible to dump a heap from within a script via the `System` import:

```js
const System = imports.system;

// Dumping the heap before the "leak" has happened
System.dumpHeap('/home/user/myApp1.heap.');

// Code presumably resulting in a leak...

// Running the garbage collector before dumping can avoid some false positives
System.gc();

// Dumping the heap after the "leak" has happened
System.dumpHeap('/home/user/myApp2.heap.');
```

### Output

The default output of `./heapgraph.py` is a tiered tree of paths from root to
rooted objects. If the output is being sent to a terminal (TTY) some minimal
ANSI styling is used to make the output more readable. Additionally, anything
that isn't part of the graph will be sent to `stderr` so the output can be
directed to a file as plain text. Below is a snippet:

```sh
$ ./heapgraph.py myApp2.heap Object > myApp2.tree
Parsing file.heap...done
Found 343 targets with type "Object"

$ cat file.tree
├─[vm_stack[1]]─➤ [Object jsobj@0x7fce60683440]
│
├─[vm_stack[1]]─➤ [Object jsobj@0x7fce606833c0]
│
├─[exact-Object]─➤ [Object jsobj@0x7fce60683380]
│
├─[exact-Object]─➤ [GjsGlobal jsobj@0x7fce60680060]
│ ├─[Debugger]─➤ [Function Debugger jsobj@0x7fce606a4540]
│ │ ╰─[Object]─➤ [Function Object jsobj@0x7fce606a9cc0]
│ │   ╰─[prototype]─➤ [Object (nil) jsobj@0x7fce60681160]
│ │
...and so on
```

`heapgraph.py` can also output DOT graphs that can be a useful way to visualize
the heap graph, especially if you don't know exactly what you're looking for.
Passing the `--dot-graph` option will output a DOT graph to `<input-file>.dot`
in the current working directory.

There are a few choices for viewing dot graphs, and many utilities for
converting them to other formats like PDF, Tex or GraphML. For Gnome desktops
[`xdot`](https://github.com/jrfonseca/xdot.py) is a nice lightweight
Python/Cairo viewer available on PyPi and in most distributions.

```sh
$ ./heapgraph.py --dot-graph /home/user/myApp2.heap Object
Parsing file.heap...done
Found 343 targets with type "Object"

$ xdot myApp2.heap.dot
```

### Excluding Nodes from the Graph

The exclusion switch you are most likely to use is `--diff-heap` which will
exclude all nodes in the graph common to that heap, allowing you to easily
see what's not being collected between two states.

```sh
$ ./heapgraph --diff-heap myApp1.heap myApp2.heap GObject
```

You can also exclude Gray Roots, WeakMaps, nodes with a heap address or nodes
with labels containing a string. Because GObject addresses are part of the node
label, these can be excluded with `--hide-node` as well.

By default the global object (GjsGlobal aka `globalThis`), imports (GjsModule,
GjsFileImporter), and namespaces (GIRepositoryNamespace) aren't shown in the
graph since these are less useful and can't be garbage collected anyways.

```sh
$ ./heapgraph.py --hide-addr 0x7f6ef022c060 \
                 --hide-node 'self-hosting-global' \
                 --no-gray-roots \
                 /home/user/myApp2.heap Object
$ ./heapgraph.py --hide-node 0x55e93cf5deb0 /home/user/myApp2.heap Object
```

### Labeling Nodes

It can be hard to see what some nodes mean, especially if all the nodes
you are interested in are labeled `GObject_Object`.
Luckily there is a way to label the nodes in your program so that they
are visible in the heap graph.
Add a property named `__heapgraph_name` with a simple string value to
your object:
```js
myObj.__heapgraph_name = 'My object';
```
Heapgraph will detect this and display the name as part of the node's
label, e.g. GObject_Object "My object".

### Command-Line Arguments

> **NOTE:** Command line arguments are subject to change; Check
> `./heapgraph.py --help` before running.

```
usage: heapgraph.py [-h] [--edge EDGE_TARGETS] [--function FUNC_TARGETS]
                    [--string STRING_TARGETS] [--annotation ANNOTATION_TARGETS]
                    [--count] [--dot-graph] [--no-addr] [--diff-heap FILE]
                    [--no-gray-roots] [--show-unreachable] [--no-weak-maps]
                    [--show-global] [--show-imports] [--hide-addr ADDR]
                    [--hide-node LABEL] [--hide-edge LABEL] FILE [TARGET ...]

Find what is rooting or preventing an object from being collected in a GJS
heap using a shortest-path breadth-first algorithm.

positional arguments:
  FILE                  Garbage collector heap from System.dumpHeap()
  TARGET                Heap address (eg. 0x7fa814054d00) or type prefix (eg.
                        Array, Object, GObject, Function...)

options:
  -h, --help            show this help message and exit

Target options:
  --edge, -e EDGE_TARGETS
                        Add an edge label to the list of targets
  --function, -f FUNC_TARGETS
                        Add a function name to the list of targets
  --string, -s STRING_TARGETS
                        Add a string literal or String() to the list of targets
  --annotation, -a ANNOTATION_TARGETS
                        Add a __heapgraph_name annotation to the list of targets

Output Options:
  --count, -c           Only count the matches for TARGET
  --dot-graph, -d       Output a DOT graph to FILE.dot
  --no-addr, -na        Don't show addresses

Node/Root Filtering:
  --diff-heap, -dh FILE
                        Don't show roots common to the heap FILE
  --no-gray-roots, -ng  Don't show gray roots (marked to be collected)
  --show-unreachable, -u
                        Show objects that have no path to a root but are not collected yet
  --no-weak-maps, -nwm  Don't show WeakMaps
  --show-global, -g     Show the global object (eg. globalThis/GjsGlobal)
  --show-imports, -i    Show import and module nodes (eg. imports.foo)
  --hide-addr, -ha ADDR
                        Don't show roots with the heap address ADDR
  --hide-node, -hn LABEL
                        Don't show nodes with labels containing LABEL
  --hide-edge, -he LABEL
                        Don't show edges labeled LABEL
```

## See Also

Below are some links to information relevant to SpiderMonkey garbage collection
and heap parsing:

* [GC.cpp Comments](https://searchfox.org/mozilla-central/source/js/src/gc/GC.cpp)
* [How JavaScript Objects Are Implemented](https://www.infoq.com/presentations/javascript-objects-spidermonkey)
* [Tracing garbage collection](https://en.wikipedia.org/wiki/Tracing_garbage_collection#Tri-color_marking) on Wikipedia
* [SpiderMonkey Memory](https://gitlab.gnome.org/GNOME/gjs/blob/HEAD/doc/SpiderMonkey_Memory.md) via GJS Repo

