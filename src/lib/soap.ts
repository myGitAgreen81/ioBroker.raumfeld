/**
 * Ein kleiner SOAP-Aufrufer fuer UPnP-Dienste.
 *
 * Bewusst kein fertiges UPnP-Paket: die verbreiteten Bibliotheken sind seit
 * Jahren unveraendert und bringen abgekuendigte Abhaengigkeiten mit. Was hier
 * gebraucht wird, ist ein POST mit einer SOAPAction-Kopfzeile und das Auslesen
 * der Antwort - das steht vollstaendig auf dieser Seite.
 */

import { XMLParser } from 'fast-xml-parser';
import { asText } from './xmlText';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	processEntities: true,
	parseTagValue: false,
	// Praefixe wie "s:" und "u:" entfallen, sonst muesste jede Auswertung
	// raten, welches Kuerzel das Geraet gerade verwendet.
	removeNSPrefix: true,
});

/** Ein Knoten des zerlegten XML-Baums. */
type XmlNode = Record<string, unknown>;

/** Ein Fehler, den das Geraet selbst gemeldet hat. */
export class SoapFault extends Error {
	/** UPnP-Fehlercode, etwa 701 fuer einen unzulaessigen Zustandswechsel. */
	public readonly code: string;

	/**
	 * @param action - Die Aktion, die fehlgeschlagen ist.
	 * @param code - Der von UPnP gemeldete Fehlercode.
	 * @param description - Die Beschreibung des Geraets.
	 */
	public constructor(action: string, code: string, description: string) {
		super(`${action}: ${description} (UPnP-Fehler ${code})`);
		this.name = 'SoapFault';
		this.code = code;
	}
}

/**
 * Maskiert die Zeichen, die in XML nicht roh stehen duerfen.
 *
 * @param value - Der einzusetzende Wert.
 * @returns Der maskierte Wert.
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Ruft eine Aktion eines UPnP-Dienstes auf.
 *
 * @param controlUrl - Die Steuer-URL des Dienstes.
 * @param serviceType - Der volle Diensttyp, etwa urn:schemas-upnp-org:service:AVTransport:1
 * @param action - Name der Aktion.
 * @param args - Die Eingangsargumente in der Reihenfolge, die das Geraet erwartet.
 * @param timeoutMs - Abbruch nach dieser Zeit.
 * @returns Die Ausgangsargumente als Name-Wert-Paare.
 */
export async function soapCall(
	controlUrl: string,
	serviceType: string,
	action: string,
	args: Record<string, string | number> = {},
	timeoutMs = 10_000,
): Promise<Record<string, string>> {
	const inner = Object.entries(args)
		.map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
		.join('');

	const body =
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
		's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
		`<u:${action} xmlns:u="${serviceType}">${inner}</u:${action}>` +
		'</s:Body></s:Envelope>';

	const res = await fetch(controlUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'text/xml; charset="utf-8"',
			SOAPAction: `"${serviceType}#${action}"`,
		},
		body,
		signal: AbortSignal.timeout(timeoutMs),
	});

	const text = await res.text();
	const doc = parser.parse(text) as XmlNode;
	const envelope = (doc.Envelope ?? {}) as XmlNode;
	const soapBody = (envelope.Body ?? {}) as XmlNode;

	// Ein Geraetefehler kommt mit HTTP 500 und einem Fault-Element. Die
	// eigentliche Ursache steht tief darin und ist die einzige brauchbare
	// Angabe - der HTTP-Status allein sagt nichts.
	const fault = soapBody.Fault as XmlNode | undefined;
	if (fault) {
		const detail = (fault.detail ?? {}) as XmlNode;
		const error = (detail.UPnPError ?? {}) as XmlNode;
		throw new SoapFault(
			action,
			asText(error.errorCode) || String(res.status),
			asText(error.errorDescription) || asText(fault.faultstring) || 'unbekannter Fehler',
		);
	}

	if (!res.ok) {
		throw new Error(`${action}: HTTP ${res.status} ${res.statusText}`);
	}

	const response = (soapBody[`${action}Response`] ?? {}) as XmlNode;
	const result: Record<string, string> = {};
	for (const [name, value] of Object.entries(response)) {
		if (name.startsWith('@')) {
			continue;
		}
		result[name] = asText(value);
	}
	return result;
}
