/**
 * Zugriff auf die Musikbibliothek des Raumfeld-MediaServers.
 *
 * Der Server beantwortet Browse und Search mit einem DIDL-Lite-Dokument, das
 * als maskierter Text in der SOAP-Antwort steckt. Hier wird daraus eine
 * schlichte Liste, die sich als JSON in einen Datenpunkt schreiben und in vis
 * oder einem Skript auswerten laesst.
 *
 * Die Kennungen sind sprechende Pfade wie "0/My Music/Albums" - das ist eine
 * Raumfeld-Eigenheit und angenehm, weil sich damit ohne Zwischenschritte in
 * einen bestimmten Zweig springen laesst.
 */

import { XMLParser } from 'fast-xml-parser';
import { soapCall } from './soap';
import type { LibraryEntry, ServiceEndpoint } from './types';
import { asText } from './xmlText';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	processEntities: true,
	parseTagValue: false,
	isArray: name => ['container', 'item', 'res'].includes(name),
});

/** Ein Knoten des zerlegten XML-Baums. */
type XmlNode = Record<string, unknown>;

/**
 * Wertet ein DIDL-Lite-Dokument zu einer Liste von Eintraegen aus.
 *
 * @param xml - Das DIDL-Lite-Dokument.
 * @returns Die enthaltenen Sammlungen und Titel in der gelieferten Reihenfolge.
 */
export function parseLibraryEntries(xml: string): LibraryEntry[] {
	if (xml.trim().length === 0) {
		return [];
	}
	const doc = parser.parse(xml) as XmlNode;
	const didl = (doc['DIDL-Lite'] ?? {}) as XmlNode;

	const entries: LibraryEntry[] = [];
	for (const [kind, key] of [
		['container', 'container'],
		['item', 'item'],
	] as const) {
		for (const node of (didl[key] as XmlNode[] | undefined) ?? []) {
			const resources = (node.res as XmlNode[] | undefined) ?? [];
			const first = resources[0];
			entries.push({
				id: asText(node['@id']),
				parentId: asText(node['@parentID']),
				kind,
				title: asText(node['dc:title']),
				upnpClass: asText(node['upnp:class']),
				section: asText(node['raumfeld:section']),
				childCount: Number(asText(node['@childCount'])) || 0,
				artist: asText(node['upnp:artist'] ?? node['dc:creator']),
				album: asText(node['upnp:album']),
				albumArt: asText(node['upnp:albumArtURI']),
				duration: first ? asText(first['@duration']) : '',
				uri: first ? asText(first) : '',
			});
		}
	}
	return entries;
}

/** Fragt den MediaServer nach Inhalten. */
export class LibraryClient {
	private readonly service: ServiceEndpoint;

	/**
	 * @param service - Der ContentDirectory-Dienst des MediaServers.
	 */
	public constructor(service: ServiceEndpoint) {
		this.service = service;
	}

	/**
	 * Liest den Inhalt einer Sammlung.
	 *
	 * @param objectId - Kennung der Sammlung; "0" ist die Wurzel.
	 * @param start - Ab welchem Eintrag gelesen wird.
	 * @param count - Wie viele Eintraege hoechstens geliefert werden.
	 * @returns Die Eintraege und die Gesamtzahl im Zweig.
	 */
	public async browse(objectId: string, start = 0, count = 100): Promise<{ entries: LibraryEntry[]; total: number }> {
		const result = await soapCall(this.service.controlUrl, this.service.serviceType, 'Browse', {
			ObjectID: objectId,
			BrowseFlag: 'BrowseDirectChildren',
			Filter: '*',
			StartingIndex: start,
			RequestedCount: count,
			SortCriteria: '',
		});
		return {
			entries: parseLibraryEntries(result.Result ?? ''),
			total: Number(result.TotalMatches ?? 0),
		};
	}

	/**
	 * Liest die Angaben zu einem einzelnen Objekt.
	 *
	 * Das ist der Weg zur Abspieladresse: die res-Angabe steht nur am Objekt
	 * selbst, nicht in der Liste seiner Geschwister.
	 *
	 * @param objectId - Kennung des Objekts.
	 * @returns Der Eintrag samt DIDL-Lite, oder undefined, wenn es ihn nicht gibt.
	 */
	public async metadata(objectId: string): Promise<{ entry: LibraryEntry; didl: string } | undefined> {
		const result = await soapCall(this.service.controlUrl, this.service.serviceType, 'Browse', {
			ObjectID: objectId,
			BrowseFlag: 'BrowseMetadata',
			Filter: '*',
			StartingIndex: 0,
			RequestedCount: 1,
			SortCriteria: '',
		});
		const didl = result.Result ?? '';
		const entry = parseLibraryEntries(didl)[0];
		return entry ? { entry, didl } : undefined;
	}

	/**
	 * Sucht in einem Zweig der Bibliothek.
	 *
	 * **Der Server sucht nicht.** Seine Search-Aktion nimmt zwar ein
	 * SearchCriteria entgegen und GetSearchCapabilities meldet dc:title, aber
	 * ausgewertet wird die Bedingung nicht: nachgemessen an den vier
	 * Demo-Titeln lieferten "Rock", "Electro" und ein frei erfundener Begriff
	 * jeweils dieselbe vollstaendige Liste. Search verhaelt sich damit wie
	 * Browse.
	 *
	 * Deshalb wird hier selbst gefiltert. Das hat eine Grenze, die man kennen
	 * muss: gesucht wird nur unter den unmittelbaren Kindern des angegebenen
	 * Zweiges, nicht in der Tiefe. Wer den ganzen Bestand durchsuchen will,
	 * muss den passenden Zweig vorgeben - etwa "0/My Music/AllTracks".
	 *
	 * @param containerId - In welchem Zweig gesucht wird.
	 * @param term - Der Suchbegriff, Gross- und Kleinschreibung egal.
	 * @param count - Wie viele Eintraege hoechstens durchgesehen werden.
	 * @returns Die Treffer und deren Anzahl.
	 */
	public async search(
		containerId: string,
		term: string,
		count = 500,
	): Promise<{ entries: LibraryEntry[]; total: number }> {
		const { entries } = await this.browse(containerId, 0, count);
		const needle = term.toLowerCase();
		const hits = entries.filter(
			entry => entry.title.toLowerCase().includes(needle) || entry.artist.toLowerCase().includes(needle),
		);
		return { entries: hits, total: hits.length };
	}

	/**
	 * Fragt ab, ob der Server gerade seine Bibliothek einliest.
	 *
	 * @returns Der Status, der bei untaetigem Server auch leer sein kann.
	 */
	public async indexerStatus(): Promise<string> {
		const result = await soapCall(this.service.controlUrl, this.service.serviceType, 'GetIndexerStatus');
		return result.Status ?? '';
	}
}
