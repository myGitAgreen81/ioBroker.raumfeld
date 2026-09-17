/**
 * Pruefungen des Textauslesens.
 *
 * Der Fall mit dem Attribut ist der eigentliche Anlass: er hat dafuer gesorgt,
 * dass Interpret und Titelbild im Adapter leer blieben, waehrend das Album
 * richtig ankam.
 */

import { expect } from 'chai';
import { asText } from './xmlText';

describe('asText', () => {
	it('gibt eine Zeichenkette unveraendert zurueck', () => {
		expect(asText('Rock')).to.equal('Rock');
		expect(asText('')).to.equal('');
	});

	it('wandelt Zahlen und Wahrheitswerte', () => {
		expect(asText(42)).to.equal('42');
		expect(asText(false)).to.equal('false');
	});

	it('liest den Textinhalt eines Elements mit Attributen', () => {
		// So liefert der Parser <upnp:artist role="artist">Demo track</upnp:artist>
		expect(asText({ '@role': 'artist', '#text': 'Demo track' })).to.equal('Demo track');
	});

	it('nimmt bei mehrfachen Elementen das erste', () => {
		expect(asText(['Erster', 'Zweiter'])).to.equal('Erster');
		expect(asText([{ '@role': 'artist', '#text': 'Erster' }])).to.equal('Erster');
	});

	it('liefert eine leere Zeichenkette, wo es keinen Text gibt', () => {
		expect(asText(undefined)).to.equal('');
		expect(asText(null)).to.equal('');
		expect(asText({})).to.equal('');
		expect(asText([])).to.equal('');
	});
});
