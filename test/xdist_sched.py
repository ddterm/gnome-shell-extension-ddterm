import xdist.scheduler.load


class LoadScheduling(xdist.scheduler.load.LoadScheduling):
    ''' xdist's LoadScheduling, but with better initial distribution '''

    def schedule(self):
        assert self.collection_is_completed

        if self.collection is not None:
            for node in self.nodes:
                self.check_schedule(node)
            return

        if not self._check_nodes_have_same_collection():
            self.log("**Different tests collected, aborting run**")
            return

        self.collection = list(self.node2collection.values())[0]
        self.pending[:] = range(len(self.collection))
        if not self.collection:
            return

        for node in self.nodes:
            self.check_schedule(node)
