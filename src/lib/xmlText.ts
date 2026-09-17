/**
 * Das Auslesen eines Textwertes aus zerlegtem XML.
 *
 * Klingt nach einer Kleinigkeit und ist eine Fehlerquelle: der Parser liefert
 * ein Element ohne Attribute als schlichte Zeichenkette, ein Element **mit**
 * Attributen dagegen als Objekt, dessen Textinhalt unter "#text" steht. Ein
 * blosses String() macht daraus "[object Object]".
 *
 * Genau das ist passiert: in einem DIDL-Lite steht der Interpret als
 * `<upnp:artist role="artist">Demo track</upnp:artist>` und das Titelbild als
 * `<upnp:albumArtURI dlna:profileID="JPEG_TN">...</upnp:albumArtURI>`. Beide
 * kamen im Adapter leer an, waehrend das attributlose `<upnp:album>` richtig
 * durchlief - ein Fehler, der nur bei bestimmten Feldern auftritt und deshalb
 * lange unauffaellig bleibt.
 *
 * Diese Funktion liegt darum an einer Stelle und wird von allen Auswertungen
 * benutzt, statt in jeder Datei neu geschrieben zu werden.
 */

/**
 * Wandelt einen aus zerlegtem XML gelesenen Wert in Text.
 *
 * @param value - Der gelesene Wert unbekannten Typs.
 * @returns Der Textinhalt, oder eine leere Zeichenkette, wenn es keinen gibt.
 */
export function asText(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		// Mehrfach vorhandene Elemente - etwa zwei upnp:artist - liefert der
		// Parser als Liste. Der erste Eintrag ist der gesuchte.
		return value.length > 0 ? asText(value[0]) : '';
	}
	if (typeof value === 'object' && value !== null) {
		return asText((value as Record<string, unknown>)['#text']);
	}
	return '';
}
