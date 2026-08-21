/* v66 SPC lock: the legacy app renderer creates the broken vector maps after startup.
   v66 owns the severe-page maps, so keep the legacy renderer from replacing them. */
window.loadSPCMaps = function () {};
