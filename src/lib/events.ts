/**
 * Auswertung der UPnP-Ereignisse (GENA) und der darin verpackten Angaben.
 *
 * Die Verschachtelung ist beachtlich und der Grund, warum das hier getrennt
 * und pruefbar liegt: eine GENA-Meldung ist ein propertyset, darin steckt als
 * maskierter Text ein LastChange-Dokument, und darin steckt - noch einmal
 * maskiert - ein DIDL-Lite-Dokument mit den Titelangaben. Drei Ebenen, jede
 * mit eigener Maskierung.
 *
 * Alle Vorlagen der Pruefungen stammen woertlich von einem Teufel One S mit
 * Firmware 2.19.3.
 */

import { XMLParser } from 'fast-xml-parser';
import type { TrackInfo } from './types';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	// Entitaeten werden aufgeloest, sonst kaeme das eingebettete LastChange
	// als maskierter Text und nicht als auswertbares XML heraus.
	processEntities: true,
	parseAttributeValue: false,
	parseTagValue: false,
});

/** Ein Knoten des zerlegten XML-Baums. */
type XmlNode = Record<string, unknown>;

/**
 * Wandelt einen gelesenen Wert in Text, ohne bei Objekten "[object Object]"
 * zu erzeugen.
 *
 * @param value - Der gelesene Wert unbekannten Typs.
 * @returns Der Wert als Text, sonst eine leere Zeichenkette.
 */
function asText(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}

/**
 * Zerlegt den Rumpf einer NOTIFY-Meldung in seine Eigenschaften.
 *
 * Neben LastChange kommen dort auch eigenstaendige Werte an, etwa BufferFilled
 * bei AVTransport.
 *
 * @param xml - Der Rumpf der NOTIFY-Anfrage.
 * @returns Die Eigenschaften als Name-Wert-Paare.
 */
export function parsePropertySet(xml: string): Record<string, string> {
	const doc = parser.parse(xml) as XmlNode;
	const set = (doc['e:propertyset'] ?? doc.propertyset ?? {}) as XmlNode;
	const raw = set['e:property'] ?? set.property;
	const properties = Array.isArray(raw) ? (raw as XmlNode[]) : raw ? [raw as XmlNode] : [];

	const result: Record<string, string> = {};
	for (const property of properties) {
		for (const [name, value] of Object.entries(property)) {
			if (name.startsWith('@')) {
				continue;
			}
			result[name] = asText(value);
		}
	}
	return result;
}

/**
 * Zerlegt ein LastChange-Dokument.
 *
 * Es bildet immer eine InstanceID ab, deren Kinder die geaenderten Werte als
 * Attribut "val" tragen. Werte mit einem Channel-Attribut - Volume und Mute -
 * werden nur fuer den Kanal "Master" uebernommen: die uebrigen Kanaele meldet
 * ein One S ohnehin nicht, und ein spaeter hinzukommendes Stereopaar soll den
 * Hauptwert nicht ueberschreiben.
 *
 * @param xml - Der Inhalt des LastChange-Elements.
 * @returns Die geaenderten Werte als Name-Wert-Paare.
 */
export function parseLastChange(xml: string): Record<string, string> {
	const doc = parser.parse(xml) as XmlNode;
	const event = (doc.Event ?? {}) as XmlNode;
	const instance = (event.InstanceID ?? {}) as XmlNode;

	const result: Record<string, string> = {};
	for (const [name, value] of Object.entries(instance)) {
		if (name.startsWith('@')) {
			continue;
		}
		const nodes = Array.isArray(value) ? (value as XmlNode[]) : [value as XmlNode];
		for (const node of nodes) {
			if (typeof node !== 'object' || node === null) {
				continue;
			}
			const channel = asText(node['@Channel'] ?? node['@channel']);
			if (channel !== '' && channel !== 'Master') {
				continue;
			}
			result[name] = asText(node['@val']);
		}
	}
	return result;
}

/**
 * Liest die Titelangaben aus einem DIDL-Lite-Dokument.
 *
 * @param xml - Das DIDL-Lite-Dokument.
 * @returns Die gefundenen Angaben, oder undefined, wenn kein Element enthalten ist.
 */
export function parseDidlLite(xml: string): TrackInfo | undefined {
	if (xml.trim().length === 0) {
		return undefined;
	}
	const doc = parser.parse(xml) as XmlNode;
	const didl = (doc['DIDL-Lite'] ?? {}) as XmlNode;
	const raw = didl.item ?? didl.container;
	const item = (Array.isArray(raw) ? raw[0] : raw) as XmlNode | undefined;
	if (!item) {
		return undefined;
	}

	return {
		title: asText(item['dc:title']),
		artist: asText(item['upnp:artist'] ?? item['dc:creator']),
		album: asText(item['upnp:album']),
		albumArtUri: asText(item['upnp:albumArtURI']),
		// Raumfeld vermerkt hier die Quelle, etwa "Spotify" oder "TuneIn".
		section: asText(item['raumfeld:section']),
		objectId: asText(item['@id']),
	};
}

/**
 * Wandelt eine Zeitangabe der Form h:mm:ss in Sekunden.
 *
 * @param value - Die Zeitangabe, etwa "0:03:14".
 * @returns Die Dauer in Sekunden, oder 0, wenn sie sich nicht lesen laesst.
 */
export function durationToSeconds(value: string): number {
	const parts = value.split(':').map(part => Number(part));
	if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
		return 0;
	}
	return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
