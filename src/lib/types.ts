/**
 * Datentypen des Raumfeld-Systems, so wie der Host sie tatsaechlich liefert.
 *
 * Die Felder sind an den Antworten von getZones, listDevices und getHostInfo
 * abgelesen, nicht an einer Dokumentation - eine solche gibt es fuer diese
 * Schnittstelle nicht.
 */

/** Ein Abspielgeraet innerhalb eines Raumes. */
export interface RaumfeldRenderer {
	/** Eindeutige Kennung des Renderers, Grundlage jedes UPnP-Befehls an ihn. */
	udn: string;
	/** Anzeigename, etwa "Speaker AngisOnes". */
	name: string;
	/** Raumfeld meldet hier "active", wenn Spotify Connect angemeldet ist. */
	spotifyConnect: boolean;
}

/**
 * Ein Raum. Die UDN eines Raumes bleibt stabil, auch ueber Neustarts und
 * Gruppenwechsel hinweg - im Gegensatz zur UDN einer Zone. Deshalb haengt der
 * Objektbaum des Adapters an den Raeumen.
 */
export interface RaumfeldRoom {
	/** Dauerhafte Kennung des Raumes. */
	udn: string;
	/** In der Raumfeld-App vergebener Name. */
	name: string;
	/** ACTIVE, AUTOMATIC_STANDBY oder MANUAL_STANDBY; fehlt, wenn der Raum wach ist. */
	powerState?: string;
	/** Die Abspielgeraete des Raumes, ueblicherweise genau eines. */
	renderers: RaumfeldRenderer[];
	/** UDN der Zone, in der der Raum gerade steckt, oder undefined. */
	zoneUdn?: string;
}

/**
 * Eine Zone. Sie entsteht beim Abspielen oder Gruppieren und ihre UDN wechselt
 * bei jeder Aenderung der Zusammensetzung. Die UDN ist zugleich die des
 * Zonen-Renderers, an den Transportbefehle gehen.
 */
export interface RaumfeldZone {
	/** Kennung der Zone und zugleich die ihres Renderers. */
	udn: string;
	/** Die Raeume, die gerade gemeinsam abspielen. */
	rooms: RaumfeldRoom[];
}

/** Das vollstaendige Ergebnis von getZones. */
export interface ZoneConfiguration {
	/** Anzahl der Raeume, die der Host kennt. */
	numRooms: number;
	/** "singleRoom" oder "multiRoom", entspricht dem Multiroom-Schalter in der App. */
	spotifyMode?: string;
	/** Alle bestehenden Zonen. */
	zones: RaumfeldZone[];
	/** Raeume, die gerade keiner Zone angehoeren. */
	unassignedRooms: RaumfeldRoom[];
	/** Alle Raeume, gruppiert oder nicht - der praktische Zugriff fuer den Adapter. */
	allRooms: RaumfeldRoom[];
}

/** Ein Eintrag aus listDevices. */
export interface RaumfeldDeviceEntry {
	/** Kennung des Geraets. */
	udn: string;
	/** Voller UPnP-Geraetetyp, etwa urn:schemas-upnp-org:device:MediaRenderer:1 */
	type: string;
	/** URL der Geraetebeschreibung; daraus ergibt sich auch die Adresse des Geraets. */
	location: string;
	/** Anzeigename des Geraets. */
	name: string;
}

/** Das Ergebnis von getHostInfo. */
export interface HostInfo {
	/** Modellbezeichnung des Geraets, das die Host-Rolle hat. */
	hostName?: string;
	/** Raum, in dem dieses Geraet steht. */
	roomName?: string;
}

/** Ein Dienst eines Geraets, so wie seine Beschreibung ihn nennt. */
export interface ServiceEndpoint {
	/** Voller Diensttyp, etwa urn:schemas-upnp-org:service:AVTransport:1 */
	serviceType: string;
	/** Adresse, an die SOAP-Aufrufe gehen. */
	controlUrl: string;
	/** Adresse, an der Ereignisse abonniert werden. */
	eventSubUrl: string;
}

/** Die Titelangaben aus einem DIDL-Lite-Dokument. */
export interface TrackInfo {
	/** Titel des Stuecks. */
	title: string;
	/** Interpret. */
	artist: string;
	/** Album. */
	album: string;
	/** Adresse des Titelbildes. */
	albumArtUri: string;
	/** Raumfelds Angabe der Quelle, etwa "Spotify" oder "TuneIn". */
	section: string;
	/** Kennung des Objekts in der Bibliothek. */
	objectId: string;
}

/** Der Wiedergabezustand eines Renderers. */
export interface TransportInfo {
	/** PLAYING, PAUSED_PLAYBACK, STOPPED oder TRANSITIONING. */
	state: string;
	/** OK oder eine Fehlerangabe des Geraets. */
	status: string;
}

/** Laufzeit und Dauer des laufenden Titels. */
export interface PositionInfo {
	/** Gesamtdauer in der Form h:mm:ss. */
	duration: string;
	/** Verstrichene Zeit in der Form h:mm:ss. */
	position: string;
}

/** Die drei Baender des Klangreglers in Dezibel. */
export interface ToneFilter {
	/** Tiefen. */
	low: number;
	/** Mitten. */
	mid: number;
	/** Hoehen. */
	high: number;
}

/** Ein Eintrag der Musikbibliothek, Sammlung oder Titel. */
export interface LibraryEntry {
	/** Kennung, bei Raumfeld ein sprechender Pfad wie "0/My Music/Albums". */
	id: string;
	/** Kennung der uebergeordneten Sammlung. */
	parentId: string;
	/** Ob es sich um eine Sammlung oder einen einzelnen Eintrag handelt. */
	kind: 'container' | 'item';
	/** Anzeigename. */
	title: string;
	/** UPnP-Klasse, etwa object.item.audioItem.musicTrack. */
	upnpClass: string;
	/** Raumfelds Angabe der Quelle, etwa "Spotify" oder "DemoTracks". */
	section: string;
	/** Anzahl der enthaltenen Eintraege, nur bei Sammlungen belegt. */
	childCount: number;
	/** Interpret. */
	artist: string;
	/** Album. */
	album: string;
	/** Adresse des Titelbildes. */
	albumArt: string;
	/** Spieldauer, sofern das Geraet sie nennt. */
	duration: string;
	/** Abspieladresse; bei Sammlungen leer. */
	uri: string;
}
