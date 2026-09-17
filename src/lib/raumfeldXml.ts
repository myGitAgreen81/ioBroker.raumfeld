/**
 * Auswertung der XML-Antworten des Host-Webservice.
 *
 * Bewusst frei von Netzzugriffen: hier geht XML hinein und es kommen fertige
 * Datenstrukturen heraus. Damit laesst sich der heikelste Teil - das Erkennen
 * der Zonenaufteilung - mit festgehaltenen Antworten der echten Geraete
 * pruefen, ohne dass dafuer Lautsprecher laufen muessen.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
	HostInfo,
	RaumfeldDeviceEntry,
	RaumfeldRenderer,
	RaumfeldRoom,
	RaumfeldZone,
	ZoneConfiguration,
} from './types';
import { asText } from './xmlText';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	// Einzelne Kinder sollen trotzdem als Liste ankommen. Ohne das muesste
	// jede Stelle unterscheiden, ob gerade ein Raum oder mehrere geliefert
	// wurden - genau dort entstehen sonst die Fehler, die erst auffallen,
	// wenn jemand einen zweiten Lautsprecher kauft.
	isArray: name => ['zone', 'room', 'renderer', 'device'].includes(name),
});

/** Ein Knoten des zerlegten XML-Baums. Werte sind bewusst unbekannt. */
type XmlNode = Record<string, unknown>;

/**
 * Liest ein Attribut eines Knotens.
 *
 * @param node - Der Knoten aus dem zerlegten XML.
 * @param name - Name des Attributs ohne Praefix.
 * @returns Der Attributwert, oder undefined, wenn das Attribut fehlt.
 */
function attr(node: XmlNode, name: string): string | undefined {
	const value = node[`@${name}`];
	return value === undefined || value === null ? undefined : asText(value);
}

/**
 * Wertet einen renderer-Knoten aus.
 *
 * @param node - Der renderer-Knoten.
 * @returns Der Renderer mit UDN, Name und Spotify-Zustand.
 */
function parseRenderer(node: XmlNode): RaumfeldRenderer {
	return {
		udn: attr(node, 'udn') ?? '',
		name: attr(node, 'name') ?? '',
		spotifyConnect: attr(node, 'spotifyConnect') === 'active',
	};
}

/**
 * Wertet einen room-Knoten samt seiner Renderer aus.
 *
 * @param node - Der room-Knoten.
 * @param zoneUdn - UDN der umgebenden Zone, falls der Raum gruppiert ist.
 * @returns Der Raum mit allen gelesenen Angaben.
 */
function parseRoom(node: XmlNode, zoneUdn?: string): RaumfeldRoom {
	const renderers = (node.renderer as XmlNode[] | undefined) ?? [];
	return {
		udn: attr(node, 'udn') ?? '',
		name: attr(node, 'name') ?? '',
		powerState: attr(node, 'powerState'),
		renderers: renderers.map(parseRenderer),
		zoneUdn,
	};
}

/**
 * Wertet die Antwort von getZones aus.
 *
 * Der Aufbau ist zweigeteilt: Raeume stecken entweder in einer Zone oder unter
 * unassignedRooms. Beide Faelle liefern denselben Raumtyp, nur einmal mit und
 * einmal ohne Zonenzugehoerigkeit - der Adapter arbeitet anschliessend mit
 * allRooms und muss die Unterscheidung nicht mehr treffen.
 *
 * @param xml - Der Rumpf der Antwort von getZones.
 * @returns Die vollstaendig ausgewertete Zonenaufteilung.
 */
export function parseZoneConfiguration(xml: string): ZoneConfiguration {
	const doc = parser.parse(xml) as XmlNode;
	const config = (doc.zoneConfig ?? {}) as XmlNode;

	const zoneNodes = (config.zones as XmlNode | undefined)?.zone as XmlNode[] | undefined;
	const zones: RaumfeldZone[] = (zoneNodes ?? []).map(node => {
		const udn = attr(node, 'udn') ?? '';
		const rooms = ((node.room as XmlNode[] | undefined) ?? []).map(room => parseRoom(room, udn));
		return { udn, rooms };
	});

	const unassignedNodes = (config.unassignedRooms as XmlNode | undefined)?.room as XmlNode[] | undefined;
	const unassignedRooms = (unassignedNodes ?? []).map(room => parseRoom(room));

	const numRooms = Number(attr(config, 'numRooms') ?? NaN);

	return {
		numRooms: Number.isFinite(numRooms)
			? numRooms
			: zones.reduce((sum, zone) => sum + zone.rooms.length, 0) + unassignedRooms.length,
		spotifyMode: attr(config, 'spotifyMode'),
		zones,
		unassignedRooms,
		allRooms: [...zones.flatMap(zone => zone.rooms), ...unassignedRooms],
	};
}

/**
 * Wertet die Antwort von listDevices aus.
 *
 * @param xml - Der Rumpf der Antwort von listDevices.
 * @returns Alle gemeldeten Geraete des Systems.
 */
export function parseDeviceList(xml: string): RaumfeldDeviceEntry[] {
	const doc = parser.parse(xml) as XmlNode;
	const nodes = ((doc.devices ?? {}) as XmlNode).device as XmlNode[] | undefined;

	return (nodes ?? []).map(node => ({
		udn: attr(node, 'udn') ?? '',
		type: attr(node, 'type') ?? '',
		location: attr(node, 'location') ?? '',
		// Der Geraetename steht als Textinhalt im Element, nicht als Attribut.
		name: asText(node['#text']),
	}));
}

/**
 * Wertet die Antwort von getHostInfo aus.
 *
 * @param xml - Der Rumpf der Antwort von getHostInfo.
 * @returns Name des Host-Geraets und sein Raum.
 */
export function parseHostInfo(xml: string): HostInfo {
	const doc = parser.parse(xml) as XmlNode;
	const info = (doc.hostInfo ?? {}) as XmlNode;
	return {
		hostName: info.hostName === undefined ? undefined : asText(info.hostName),
		roomName: info.roomName === undefined ? undefined : asText(info.roomName),
	};
}

/**
 * Macht aus einem Raumnamen eine gueltige ioBroker-Objekt-ID.
 *
 * ioBroker verbietet in IDs unter anderem Punkt und Stern; Leerzeichen sind
 * erlaubt, machen aber jede Skriptzeile unleserlich. Beides wird zu einem
 * Unterstrich. Die UDN bleibt als verlaessliche Kennung im native-Teil des
 * Objekts erhalten, falls ein Raum spaeter umbenannt wird.
 *
 * @param name - Der Raumname, wie ihn der Host meldet.
 * @returns Eine als Objekt-ID verwendbare Fassung des Namens.
 */
export function roomIdFromName(name: string): string {
	const cleaned = name
		.replace(/[.*,;'"\\[\]\s]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
	return cleaned.length > 0 ? cleaned : 'unbenannt';
}
