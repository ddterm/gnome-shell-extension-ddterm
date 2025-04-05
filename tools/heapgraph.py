#!/usr/bin/env python3

# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: 2013-2018 Andrew McCreight <continuation@gmail.com>
# SPDX-FileCopyrightText: 2018 Andy Holmes <andrew.g.r.holmes@gmail.com>
#
# heapgraph.py - Top-level script for interpreting Garbage Collector heaps

import argparse
import copy
from collections import namedtuple
from collections import deque
import os
import re
import sys

try:
    from heapdot import (output_dot_file, add_dot_graph_path,
                         add_dot_graph_unreachable)
except ImportError:
    sys.stderr.write('DOT graph output not available\n')

NAME_ANNOTATION = '__heapgraph_name'

########################################################
# Command line arguments.
########################################################

parser = argparse.ArgumentParser(description='Find what is rooting or preventing an object from being collected in a GJS heap using a shortest-path breadth-first algorithm.')

parser.add_argument('heap_file', metavar='FILE',
                    help='Garbage collector heap from System.dumpHeap()')

parser.add_argument('targets', metavar='TARGET', nargs='*',
                    help='Heap address (eg. 0x7fa814054d00) or type prefix (eg. Array, Object, GObject, Function...)')

### Target Options
targ_opts = parser.add_argument_group('Target options')

targ_opts.add_argument('--edge', '-e', dest='edge_targets',
                       action='append', default=[],
                       help='Add an edge label to the list of targets')

targ_opts.add_argument('--function', '-f', dest='func_targets',
                       action='append', default=[],
                       help='Add a function name to the list of targets')

targ_opts.add_argument('--string', '-s', dest='string_targets',
                       action='append', default=[],
                       help='Add a string literal or String() to the list of targets')

targ_opts.add_argument('--annotation', '-a', dest='annotation_targets',
                       action='append', default=[],
                       help=f'Add a {NAME_ANNOTATION} annotation to the list of targets')

### Output Options
out_opts = parser.add_argument_group('Output Options')

out_opts.add_argument('--count', '-c', dest='count', action='store_true',
                      default=False,
                      help='Only count the matches for TARGET')

out_opts.add_argument('--dot-graph', '-d', dest='dot_graph',
                      action='store_true', default=False,
                      help='Output a DOT graph to FILE.dot')

out_opts.add_argument('--no-addr', '-na', dest='no_addr',
                      action='store_true', default=False,
                      help='Don\'t show addresses')

### Node and Root Filtering
filt_opts = parser.add_argument_group('Node/Root Filtering')

filt_opts.add_argument('--diff-heap', '-dh', dest='diff_heap', action='store',
                      metavar='FILE',
                      help='Don\'t show roots common to the heap FILE')

filt_opts.add_argument('--no-gray-roots', '-ng', dest='no_gray_roots',
                       action='store_true', default=False,
                       help='Don\'t show gray roots (marked to be collected)')

filt_opts.add_argument('--show-unreachable', '-u', action='store_true',
                       help="Show objects that have no path to a root but are not collected yet")

filt_opts.add_argument('--no-weak-maps', '-nwm', dest='no_weak_maps',
                       action='store_true', default=False,
                       help='Don\'t show WeakMaps')

filt_opts.add_argument('--show-global', '-g', dest='show_global',
                       action='store_true', default=False,
                       help='Show the global object (eg. globalThis/GjsGlobal)')

filt_opts.add_argument('--show-imports', '-i', dest='show_imports',
                       action='store_true', default=False,
                       help='Show import and module nodes (eg. imports.foo)')

filt_opts.add_argument('--hide-addr', '-ha', dest='hide_addrs', action='append',
                       metavar='ADDR', default=[],
                       help='Don\'t show roots with the heap address ADDR')

filt_opts.add_argument('--hide-node', '-hn', dest='hide_nodes', action='append',
                       metavar='LABEL', default=['self-hosting-global',
                                                 'GIRepositoryNamespace',
                                                 'GjsFileImporter',
                                                 'GjsGlobal',
                                                 'GjsInternalGlobal',
                                                 'GjsModule'],
                       help='Don\'t show nodes with labels containing LABEL')

filt_opts.add_argument('--hide-edge', '-he', dest='hide_edges', action='append',
                       metavar='LABEL', default=[NAME_ANNOTATION],
                       help="Don't show edges labeled LABEL")


###############################################################################
# Heap Patterns
###############################################################################

GraphAttribs = namedtuple('GraphAttribs',
                          'edge_labels node_labels roots root_labels weakMapEntries annotations')
WeakMapEntry = namedtuple('WeakMapEntry', 'weakMap key keyDelegate value')


addr_regex = re.compile(r'[A-F0-9]+$|0x[a-f0-9]+$')
node_regex = re.compile(r'((?:0x)?[a-fA-F0-9]+) (?:(B|G|W) )?([^\r\n]*)\r?$')
edge_regex = re.compile(r'> ((?:0x)?[a-fA-F0-9]+) (?:(B|G|W) )?([^\r\n]*)\r?$')
wme_regex = re.compile(r'WeakMapEntry map=((?:0x)?[a-zA-Z0-9]+|\(nil\)) key=((?:0x)?[a-zA-Z0-9]+|\(nil\)) keyDelegate=((?:0x)?[a-zA-Z0-9]+|\(nil\)) value=((?:0x)?[a-zA-Z0-9]+)')

func_regex = re.compile(r'Function(?: ([^/]+)(?:/([<|\w]+))?)?')
priv_regex = re.compile(r'([^ ]+) (0x[a-fA-F0-9]+$)')
string_regex = re.compile(r'^(?:sub)?string <(?:dependent|(?:permanent )?atom|(?:fat )?inline|linear): length (?:\d+)> (.*)\r?$')

###############################################################################
# Heap Parsing
###############################################################################

def parse_roots(fobj):
    """Parse the roots portion of a garbage collector heap."""

    roots = {}
    root_labels = {}
    weakMapEntries = []

    for line in fobj:
        node = node_regex.match(line)

        if node:
            addr = node.group(1)
            color = node.group(2)
            label = node.group(3)

            # Only overwrite an existing root with a black root.
            if addr not in roots or color == 'B':
                roots[addr] = (color == 'B')
                # It would be classier to save all the root labels, though then
                # we have to worry about gray vs black.
                root_labels[addr] = label
        else:
            wme = wme_regex.match(line)

            if wme:
                weakMapEntries.append(WeakMapEntry(weakMap=wme.group(1),
                                                   key=wme.group(2),
                                                   keyDelegate=wme.group(3),
                                                   value=wme.group(4)))
            # Skip comments, arenas, realms and zones
            elif line[0] == '#':
                continue
            # Marks the end of the roots section
            elif line[:10] == '==========':
                break
            else:
                sys.stderr.write('Error: unknown line {}\n'.format(line))
                exit(-1)

    return [roots, root_labels, weakMapEntries]


def parse_graph(fobj):
    """Parse the node and edges of a garbage collector heap."""

    edges = {}
    edge_labels = {}
    node_labels = {}
    annotations = {}

    def addNode (addr, node_label):
        edges[addr] = {}
        edge_labels[addr] = {}

        if node_label != '':
            node_labels[addr] = node_label

    def addEdge(source, target, edge_label):
        edges[source][target] = edges[source].get(target, 0) + 1

        if edge_label != '':
            edge_labels[source].setdefault(target, []).append(edge_label)

    node_addr = None
    second_pass_lines = []

    for line in fobj:
        if edge_regex.match(line):
            second_pass_lines.append(line)
            continue

        node = node_regex.match(line)

        if node:
            second_pass_lines.append(line)
            node_addr = node.group(1)
            node_color = node.group(2)
            node_label = node.group(3)

            # Don't hide strings matching hide_nodes, as they may be labels
            if string_regex.match(node_label) is not None:
                addNode(node_addr, node_label)
                continue

            # Use this opportunity to map hide_nodes to addresses
            for hide_node in args.hide_nodes:
                if hide_node in node_label:
                    args.hide_addrs.append(node_addr)
                    break
            else:
                addNode(node_addr, node_label)
        # Skip comments, arenas, realms, zones, and weak map entries
        elif (line[0] == '#' or
              wme_regex.match(line) is not None or
              line[:10] == '=========='):
            continue
        else:
            sys.stderr.write('Error: Unknown line: {}\n'.format(line[:-1]))

    for line in second_pass_lines:
        e = edge_regex.match(line)

        if e:
            target, edge_label = e.group(1, 3)
            if edge_label == NAME_ANNOTATION:
                s = string_regex.match(node_labels[target])
                if s:
                    annotations[node_addr] = s.group(1)

            if (node_addr not in args.hide_addrs and
                    edge_label not in args.hide_edges):
                addEdge(node_addr, target, edge_label)
        else:
            node = node_regex.match(line)

            if node:
                node_addr = node.group(1)

    # yar, should pass the root crud in and wedge it in here, or somewhere
    return [edges, edge_labels, node_labels, annotations]


def parse_heap(fname):
    """Parse a garbage collector heap."""

    try:
        fobj = open(fname, 'r')
    except:
        sys.stderr.write('Error opening file {}\n'.format(fname))
        exit(-1)

    [roots, root_labels, weakMapEntries] = parse_roots(fobj)
    [edges, edge_labels, node_labels, annotations] = parse_graph(fobj)
    fobj.close()

    graph = GraphAttribs(edge_labels=edge_labels, node_labels=node_labels,
                         roots=roots, root_labels=root_labels,
                         weakMapEntries=weakMapEntries, annotations=annotations)

    return (edges, graph)


def find_nodes(fname):
    """Parse a garbage collector heap and return a list of node addresses."""

    addrs = [];

    try:
        fobj = open(fname, 'r')
        sys.stderr.write('Parsing {0}...'.format(fname))
    except:
        sys.stderr.write('Error opening file {}\n'.format(fname))
        exit(-1)

    # Whizz past the roots
    for line in fobj:
        if '==========\n' in line:
            break

    for line in fobj:
        node = node_regex.match(line)

        if node:
            addrs.append(node.group(1))

    fobj.close()

    sys.stderr.write('done\n')
    sys.stderr.flush()

    return addrs



# Some applications may not care about multiple edges.
# They can instead use a single graph, which is represented as a map
# from a source node to a set of its destinations.
def to_single_graph(edges):
    single_graph = {}

    for origin, destinations in edges.items():
        d = set([])
        for destination, distance in destinations.items():
            d.add(destination)
        single_graph[origin] = d

    return single_graph


def load_graph(fname):
    sys.stderr.write('Parsing {0}...'.format(fname))
    (edges, graph) = parse_heap(fname)
    edges = to_single_graph(edges)
    sys.stderr.write('done\n')

    sys.stderr.flush()

    return (edges, graph)


###############################################################################
# Path printing
###############################################################################

tree_graph_paths = {}
tree_graph_unreachables = set()


class style:
    BOLD = '\033[1m'
    ITALIC = '\033[3m'
    UNDERLINE = '\033[4m'
    PURPLE = '\033[0;36m'
    END = '\033[0m'


def get_edge_label(graph, origin, destination):
    elabel = lambda l: l[0] if len(l) == 2 else l
    labels = graph.edge_labels.get(origin, {}).get(destination, [])

    if len(labels) == 1:
        label = labels[0]

        if label == 'signal connection':
            return 'GSignal'
        else:
            return label
    elif len(labels) > 1:
        return ', '.join([elabel(l) for l in labels])
    else:
        return ''


def get_node_label(graph, addr):
    label = graph.node_labels[addr]

    if label.endswith(' <no private>'):
        label = label[:-13]

    if label.startswith('Function '):
        fm = func_regex.match(label)

        if fm.group(2) == '<':
            return 'Function via {}'.format(fm.group(1))
        elif fm.group(2):
            return 'Function {} in {}'.format(fm.group(2), fm.group(1))
        else:
            return label
    if label.startswith('script'):
        label = label[7:].split('/')[-1]
    elif label.startswith('WeakMap'):
        label = 'WeakMap'
    elif label == 'base_shape':
        label = 'shape'
    elif label == 'type_object':
        label = 'type'

    return label[:50]


def get_node_annotation(graph, addr):
    return graph.annotations.get(addr, None)


def format_node(graph, addr, parent=''):
    node = get_node_label(graph, addr)
    annotation = get_node_annotation(graph, addr)
    has_priv = priv_regex.match(node)

    # Color/Style
    if os.isatty(1):
        orig = style.UNDERLINE + 'jsobj@' + addr + style.END

        if has_priv:
            node = style.BOLD + has_priv.group(1) + style.END
            orig += ' ' + style.UNDERLINE + 'priv@' + has_priv.group(2) + style.END
        else:
            node = style.BOLD + node + style.END
    else:
        orig = 'jsobj@' + addr

        if has_priv:
            node = has_priv.group(1)
            orig += ' priv@' + has_priv.group(2)

    # Add the annotation
    if annotation:
        if os.isatty(1):
            node += ' "' + style.PURPLE + annotation + style.END + '"'
        else:
            node += ' "' + annotation + '"'

    if args.no_addr:
        return node
    return node + ' ' + orig


def output_tree_graph(graph, data, base='', parent=''):
    while data:
        addr, children = data.popitem()

        node = format_node(graph, addr, base)

        # Labels
        if parent:
            edge = get_edge_label(graph, parent, addr)
        else:
            edge = graph.root_labels[addr]

        # Color/Style
        if os.isatty(1):
            if parent:
                edge = style.ITALIC + edge + style.END
            else:
                edge = style.BOLD + edge + style.END

        # Print the path segment
        if data:
            print('{0}├─[{1}]─➤ [{2}]'.format(base, edge, node))
        else:
            print('{0}╰─[{1}]─➤ [{2}]'.format(base, edge, node))

        # Print child segments
        if children:
            if data:
                output_tree_graph(graph, children, base + '│ ', addr)
            else:
                output_tree_graph(graph, children, base + '  ', addr)
        else:
            if data:
                print(base + '│ ')
            else:
                print(base + '  ')


def output_tree_unreachables(graph, data):
    while data:
        addr = data.pop()
        node = format_node(graph, addr)
        print(' • Unreachable: [{}]'.format(node))


def add_tree_graph_path(owner, path):
    o = owner.setdefault(path.pop(0), {})
    if path:
        add_tree_graph_path(o, path)


def add_path(args, graph, path):
    if args.dot_graph:
        add_dot_graph_path(path)
    else:
        add_tree_graph_path(tree_graph_paths, path)


def add_unreachable(args, node):
    if args.dot_graph:
        add_dot_graph_unreachable(node)
    else:
        tree_graph_unreachables.add(node)


###############################################################################
# Breadth-first shortest path finding.
###############################################################################

def find_roots_bfs(args, edges, graph, target):
    workList = deque()
    distances = {}

    def traverseWeakMapEntry(dist, k, m, v, label):
        if not k in distances or not m in distances:
            # Haven't found either the key or map yet.
            return

        if distances[k][0] > dist or distances[m][0] > dist:
            # Either the key or the weak map is farther away, so we
            # must wait for the farther one before processing it.
            return

        if v in distances:
            return

        distances[v] = (dist + 1, k, m, label)
        workList.append(v)


    # For now, ignore keyDelegates.
    weakData = {}
    for wme in graph.weakMapEntries:
        weakData.setdefault(wme.weakMap, set([])).add(wme)
        weakData.setdefault(wme.key, set([])).add(wme)
        if wme.keyDelegate != '0x0':
            weakData.setdefault(wme.keyDelegate, set([])).add(wme)

    distances[startObject] = (-1, None)
    workList.append(startObject)

    # Search the graph.
    while workList:
        origin = workList.popleft()
        dist = distances[origin][0]

        # Found the target, stop digging
        if origin == target:
            continue

        # origin does not point to any other nodes.
        if not origin in edges:
            continue

        for destination in edges[origin]:
            if destination not in distances:
                distances[destination] = (dist + 1, origin)
                workList.append(destination)

        if origin in weakData:
            for wme in weakData[origin]:
                traverseWeakMapEntry(dist, wme.key, wme.weakMap, wme.value,
                                     "value in WeakMap " + wme.weakMap)
                traverseWeakMapEntry(dist, wme.keyDelegate, wme.weakMap, wme.key,
                                     "key delegate in WeakMap " + wme.weakMap)


    # Print out the paths by unwinding backwards to generate a path,
    # then print the path. Accumulate any weak maps found during this
    # process into the printWorkList queue, and print out what keeps
    # them alive. Only print out why each map is alive once.
    printWorkList = deque()
    printWorkList.append(target)
    printedThings = set([target])

    while printWorkList:
        p = printWorkList.popleft()
        path = []
        while p in distances:
            path.append(p)
            dist = distances[p]
            if len(dist) == 2:
                [_, p] = dist
            else:
                # The weak map key is probably more interesting,
                # so follow it, and worry about the weak map later.
                [_, k, m, label] = dist

                graph.edge_labels[k].setdefault(p, []).append(label)
                p = k
                if not m in printedThings and not args.no_weak_maps:
                    printWorkList.append(m)
                    printedThings.add(m)

        if path:
            path.pop()
            path.reverse()
            add_path(args, graph, path)
        elif args.show_unreachable:
            # No path to a root. This object is eligible for collection on the
            # next GC, but is still in an arena.
            add_unreachable(args, target)


########################################################
# Target selection
########################################################

def target_edge(graph, target):
    targets = set()

    for origin, destinations in graph.edge_labels.items():
        for destination in destinations:
            if target in graph.edge_labels[origin][destination]:
                targets.add(destination)
                targets.add(origin)

    sys.stderr.write('Found {} objects with edge label of {}\n'.format(len(targets), target))
    return targets


def target_func(graph, target):
    targets = set()

    for addr, label in graph.node_labels.items():
        if not label[:9] == 'Function ':
            continue

        if label[9:] == target:
            targets.add(addr)

    sys.stderr.write('Found {} functions named "{}"\n'.format(len(targets), target))
    return targets


def target_gobject(graph, target):
    targets = set()

    for addr, label in graph.node_labels.items():
        if label.endswith(target):
            targets.add(addr)

    sys.stderr.write('Found GObject with address of {}\n'.format(target))
    return targets


def target_string(graph, target):
    targets = set()

    for addr, label in graph.node_labels.items():
        if label[:7] == 'string ' and target in label[7:]:
            targets.add(addr)
        elif label[:10] == 'substring ' and target in label[10:]:
            targets.add(addr)

    sys.stderr.write('Found {} strings containing "{}"\n'.format(len(targets), target))
    return targets


def target_type(graph, target):
    targets = set()

    for addr in edges.keys():
        if graph.node_labels.get(addr, '')[0:len(target)] == target:
            targets.add(addr)

    sys.stderr.write('Found {} targets with type "{}"\n'.format(len(targets), target))
    return targets


def target_annotation(graph, target):
    targets = {addr for addr, label in graph.annotations.items()
                    if label == target}

    sys.stderr.write(f'Found {len(targets)} targets with annotation "{target}"\n')
    return targets


def select_targets(args, edges, graph):
    targets = set()
    for target in args.targets:
        # If target seems like an address search for a JS Object, then GObject
        if addr_regex.match(target):
            if target in edges:
                sys.stderr.write('Found object with address "{}"\n'.format(target))
                targets.add(target)
            else:
                targets.update(target_gobject(graph, target))
        else:
            # Fallback to looking for JavaScript objects by class name
            targets.update(target_type(graph, target))

    for target in args.edge_targets:
        targets.update(target_edge(graph, target))
    for target in args.func_targets:
        targets.update(target_func(graph, target))
    for target in args.string_targets:
        targets.update(target_string(graph, target))
    for target in args.annotation_targets:
        targets.update(target_annotation(graph, target))

    return list(targets)


if __name__ == "__main__":
    args = parser.parse_args()

    # Node and Root Filtering
    if args.show_global:
        args.hide_nodes.remove('GjsGlobal')
        args.hide_nodes.remove('GjsInternalGlobal')
    if args.show_imports:
        args.hide_nodes.remove('GjsFileImporter')
        args.hide_nodes.remove('GjsModule')
        args.hide_nodes.remove('GIRepositoryNamespace')

    # Make sure we don't filter an explicit target
    for target in args.targets:
        if target in args.hide_nodes:
            args.hide_nodes.remove(target)

    # Heap diffing; we do these addrs separately due to the sheer amount
    diff_addrs = []

    if args.diff_heap:
        diff_addrs = find_nodes(args.diff_heap)

    # Load the graph
    (edges, graph) = load_graph(args.heap_file)
    targets = select_targets(args, edges, graph)

    if len(targets) == 0:
        sys.stderr.write('No targets found.\n')
        sys.exit(-1)
    elif args.count:
        sys.exit(-1);

    # Unlike JavaScript objects, GObjects can be "rooted" by their refcount so
    # we have to use a fake root (repetitively)
    rootEdges = set([])
    for addr, isBlack in graph.roots.items():
        if isBlack or not args.no_gray_roots:
            rootEdges.add(addr)
    startObject = 'FAKE START OBJECT'
    edges[startObject] = rootEdges

    for addr in targets:
        if addr in edges and addr not in diff_addrs:
            find_roots_bfs(args, edges, graph, addr)

    if args.dot_graph:
        output_dot_file(args, graph, targets, args.heap_file + ".dot")
    else:
        output_tree_graph(graph, tree_graph_paths)
        output_tree_unreachables(graph, tree_graph_unreachables)

