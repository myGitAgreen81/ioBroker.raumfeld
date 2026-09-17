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
var soap_exports = {};
__export(soap_exports, {
  SoapFault: () => SoapFault,
  soapCall: () => soapCall
});
module.exports = __toCommonJS(soap_exports);
var import_fast_xml_parser = require("fast-xml-parser");
const parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  parseTagValue: false,
  // Praefixe wie "s:" und "u:" entfallen, sonst muesste jede Auswertung
  // raten, welches Kuerzel das Geraet gerade verwendet.
  removeNSPrefix: true
});
class SoapFault extends Error {
  /** UPnP-Fehlercode, etwa 701 fuer einen unzulaessigen Zustandswechsel. */
  code;
  /**
   * @param action - Die Aktion, die fehlgeschlagen ist.
   * @param code - Der von UPnP gemeldete Fehlercode.
   * @param description - Die Beschreibung des Geraets.
   */
  constructor(action, code, description) {
    super(`${action}: ${description} (UPnP-Fehler ${code})`);
    this.name = "SoapFault";
    this.code = code;
  }
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function asText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
async function soapCall(controlUrl, serviceType, action, args = {}, timeoutMs = 1e4) {
  var _a, _b, _c, _d, _e;
  const inner = Object.entries(args).map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`).join("");
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${inner}</u:${action}></s:Body></s:Envelope>`;
  const res = await fetch(controlUrl, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPAction: `"${serviceType}#${action}"`
    },
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  const doc = parser.parse(text);
  const envelope = (_a = doc.Envelope) != null ? _a : {};
  const soapBody = (_b = envelope.Body) != null ? _b : {};
  const fault = soapBody.Fault;
  if (fault) {
    const detail = (_c = fault.detail) != null ? _c : {};
    const error = (_d = detail.UPnPError) != null ? _d : {};
    throw new SoapFault(
      action,
      asText(error.errorCode) || String(res.status),
      asText(error.errorDescription) || asText(fault.faultstring) || "unbekannter Fehler"
    );
  }
  if (!res.ok) {
    throw new Error(`${action}: HTTP ${res.status} ${res.statusText}`);
  }
  const response = (_e = soapBody[`${action}Response`]) != null ? _e : {};
  const result = {};
  for (const [name, value] of Object.entries(response)) {
    if (name.startsWith("@")) {
      continue;
    }
    result[name] = asText(value);
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SoapFault,
  soapCall
});
//# sourceMappingURL=soap.js.map
