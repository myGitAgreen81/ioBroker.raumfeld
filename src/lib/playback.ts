/**
 * Das Abspielen ganzer Sammlungen.
 *
 * Ein einzelner Titel traegt eine Abspieladresse im res-Element, eine Sammlung
 * nicht. Der naheliegende Weg waere gewesen, ueber CreateQueue und
 * AddContainerToQueue eine Warteschlange zusammenzubauen - das sind vier
 * Aktionen mit zusammen einem Dutzend Argumenten.
 *
 * Es geht einfacher, und zwar nachgemessen: Der Zonen-Renderer nimmt eine
 * Adresse der Form `dlna-playcontainer://` entgegen und spielt die genannte
 * Sammlung von vorn bis hinten. Das ist eine DLNA-Konvention, die Raumfeld
 * unterstuetzt; ausprobiert mit den vier Demo-Titeln, die daraufhin am Stueck
 * liefen. Die Warteschlangen-Aktionen bleiben damit fuer den Fall, dass man
 * eine eigene Zusammenstellung bauen will - fuer "spiel dieses Album" braucht
 * es sie nicht.
 */

/** Der Dienst, aus dem die Sammlung stammt; bei Raumfeld immer derselbe. */
const CONTENT_DIRECTORY_SERVICE_ID = 'urn:upnp-org:serviceId:ContentDirectory';

/**
 * Baut die Adresse, mit der ein Renderer eine ganze Sammlung abspielt.
 *
 * @param mediaServerUdn - Kennung des MediaServers, etwa "uuid:c7b0990e-...".
 * @param containerId - Kennung der Sammlung, etwa "0/DemoTracks/GettingStarted".
 * @returns Die Adresse fuer SetAVTransportURI.
 */
export function containerPlayUri(mediaServerUdn: string, containerId: string): string {
	const parameters = [
		`sid=${encodeURIComponent(CONTENT_DIRECTORY_SERVICE_ID)}`,
		`cid=${encodeURIComponent(containerId)}`,
		// md=0 heisst: keine zusaetzlichen Metadaten mitgeben. Der Renderer
		// holt sich die Angaben zu jedem Titel selbst beim MediaServer.
		'md=0',
	];
	return `dlna-playcontainer://${encodeURIComponent(mediaServerUdn)}?${parameters.join('&')}`;
}
