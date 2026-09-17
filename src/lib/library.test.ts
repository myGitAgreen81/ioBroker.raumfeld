/**
 * Pruefungen der Bibliotheksauswertung.
 *
 * Die Vorlagen sind woertliche Antworten des MediaServers eines Teufel One S
 * mit Firmware 2.19.3 - einschliesslich der Eigenheiten, die sich nicht
 * erfinden lassen: sprechende Kennungen wie "0/My Music/Albums", der eigene
 * Namensraum raumfeld:section und ein upnp:artist mit role-Attribut, das ein
 * naives String() zu "[object Object]" machen wuerde.
 */

import { expect } from 'chai';
import { parseLibraryEntries } from './library';

const ROOT = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:raumfeld="urn:schemas-raumfeld-com:meta-data/raumfeld" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/" lang="en"><container parentID="0" id="0/My Music" restricted="1" childCount="9"><raumfeld:name>My Music</raumfeld:name><upnp:class>object.container</upnp:class><dc:title>My Music</dc:title></container><container parentID="0" id="0/Spotify" restricted="1" childCount="4"><raumfeld:name>Spotify</raumfeld:name><upnp:class>object.container</upnp:class><dc:title>Spotify</dc:title></container></DIDL-Lite>`;

const TRACK = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:raumfeld="urn:schemas-raumfeld-com:meta-data/raumfeld" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/" lang="en"><item parentID="0/DemoTracks/GettingStarted" id="0/DemoTracks/GettingStarted/rock" restricted="1"><raumfeld:name>DemoTrack</raumfeld:name><upnp:class>object.item.audioItem.musicTrack</upnp:class><raumfeld:section>DemoTracks</raumfeld:section><dc:title>Rock</dc:title><upnp:genre>Rock</upnp:genre><upnp:album>Teufel Streaming</upnp:album><upnp:artist role="artist">Demo track</upnp:artist><upnp:albumArtURI dlna:profileID="JPEG_TN">https://music.cdn.raumfeld.com/getting-started/tracks/rock.jpg</upnp:albumArtURI><res protocolInfo="http-get:*:audio/mpeg:DLNA.ORG_PN=MP3" sampleFrequency="44100" duration="0:02:04.000" size="4962264">https://music.cdn.raumfeld.com/getting-started/tracks/rock.mp3</res></item></DIDL-Lite>`;

const LINE_IN = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:raumfeld="urn:schemas-raumfeld-com:meta-data/raumfeld" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/" lang="en"><item parentID="0/Line In" id="0/Line In/uuid%3Aedcad4d1-3a7b-4513-a1ec-f7cbe0d99dba" restricted="1"><raumfeld:name>Line In</raumfeld:name><upnp:class>object.item.audioItem.audioBroadcast.lineIn</upnp:class><raumfeld:section>Line In</raumfeld:section><dc:title>Speaker AngisOnes</dc:title><res protocolInfo="http-get:*:audio/x-flac:*">http://10.10.11.31:8888/stream.flac</res></item></DIDL-Lite>`;

describe('parseLibraryEntries', () => {
	it('liest Sammlungen samt Anzahl der Kinder', () => {
		const entries = parseLibraryEntries(ROOT);

		expect(entries).to.have.lengthOf(2);
		expect(entries[0].kind).to.equal('container');
		expect(entries[0].id).to.equal('0/My Music');
		expect(entries[0].parentId).to.equal('0');
		expect(entries[0].title).to.equal('My Music');
		expect(entries[0].childCount).to.equal(9);
		expect(entries[0].uri).to.equal('');
	});

	it('liest einen Titel samt Abspieladresse', () => {
		const [track] = parseLibraryEntries(TRACK);

		expect(track.kind).to.equal('item');
		expect(track.id).to.equal('0/DemoTracks/GettingStarted/rock');
		expect(track.title).to.equal('Rock');
		expect(track.album).to.equal('Teufel Streaming');
		expect(track.duration).to.equal('0:02:04.000');
		expect(track.uri).to.equal('https://music.cdn.raumfeld.com/getting-started/tracks/rock.mp3');
		expect(track.albumArt).to.contain('rock.jpg');
		expect(track.section).to.equal('DemoTracks');
	});

	it('liest den Interpreten trotz des role-Attributs als Text', () => {
		// upnp:artist traegt ein Attribut, kommt also als Objekt aus dem
		// Parser. Ohne besondere Behandlung stuende hier "[object Object]".
		expect(parseLibraryEntries(TRACK)[0].artist).to.equal('Demo track');
	});

	it('liest den Analogeingang als abspielbaren Eintrag', () => {
		const [lineIn] = parseLibraryEntries(LINE_IN);

		expect(lineIn.upnpClass).to.contain('lineIn');
		expect(lineIn.uri).to.equal('http://10.10.11.31:8888/stream.flac');
		expect(lineIn.duration).to.equal('');
	});

	it('kommt mit einer leeren Sammlung zurecht', () => {
		expect(parseLibraryEntries('<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"/>')).to.be.empty;
		expect(parseLibraryEntries('')).to.be.empty;
	});
});
