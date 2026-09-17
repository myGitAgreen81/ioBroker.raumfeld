"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var playback_exports = {};
__export(playback_exports, {
  containerPlayUri: () => containerPlayUri
});
module.exports = __toCommonJS(playback_exports);
const CONTENT_DIRECTORY_SERVICE_ID = "urn:upnp-org:serviceId:ContentDirectory";
function containerPlayUri(mediaServerUdn, containerId) {
  const parameters = [
    `sid=${encodeURIComponent(CONTENT_DIRECTORY_SERVICE_ID)}`,
    `cid=${encodeURIComponent(containerId)}`,
    // md=0 heisst: keine zusaetzlichen Metadaten mitgeben. Der Renderer
    // holt sich die Angaben zu jedem Titel selbst beim MediaServer.
    "md=0"
  ];
  return `dlna-playcontainer://${encodeURIComponent(mediaServerUdn)}?${parameters.join("&")}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  containerPlayUri
});
//# sourceMappingURL=playback.js.map
