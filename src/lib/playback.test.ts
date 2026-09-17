/**
 * Pruefungen der Sammlungs-Adresse.
 *
 * Die Vorlage ist die Adresse, mit der an der echten Anlage die vier
 * Demo-Titel am Stueck gelaufen sind.
 */

import { expect } from 'chai';
import { containerPlayUri } from './playback';

const MEDIA_SERVER = 'uuid:c7b0990e-70d1-4e40-81fd-79acb2ba1aa5';

describe('containerPlayUri', () => {
	it('baut die nachgemessene Adresse', () => {
		expect(containerPlayUri(MEDIA_SERVER, '0/DemoTracks/GettingStarted')).to.equal(
			'dlna-playcontainer://uuid%3Ac7b0990e-70d1-4e40-81fd-79acb2ba1aa5' +
				'?sid=urn%3Aupnp-org%3AserviceId%3AContentDirectory' +
				'&cid=0%2FDemoTracks%2FGettingStarted&md=0',
		);
	});

	it('maskiert Leerzeichen und Sonderzeichen in der Kennung', () => {
		// Raumfelds Kennungen sind sprechende Pfade und enthalten regelmaessig
		// Leerzeichen, etwa "0/My Music/Albums".
		const uri = containerPlayUri(MEDIA_SERVER, '0/My Music/Albums');
		expect(uri).to.contain('cid=0%2FMy%20Music%2FAlbums');
		expect(uri).to.not.contain(' ');
	});

	it('maskiert den Doppelpunkt der Geraetekennung', () => {
		expect(containerPlayUri('uuid:abc', '0')).to.contain('dlna-playcontainer://uuid%3Aabc?');
	});
});
