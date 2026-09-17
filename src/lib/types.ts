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
