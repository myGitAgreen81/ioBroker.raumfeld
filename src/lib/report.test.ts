/**
 * Pruefungen des Verbindungsberichts.
 *
 * Der Anlass ist eine Rueckfrage, die der alte Text ausgeloest hat: er meldete
 * "6 Geraete im System", obwohl nur zwei Lautsprecher im Haus stehen.
 */

import { expect } from 'chai';
import { describeSystem } from './report';
import type { RaumfeldDeviceEntry, ZoneConfiguration } from './types';

const devices: RaumfeldDeviceEntry[] = [
	{
		udn: 'uuid:717def93',
		type: 'urn:schemas-upnp-org:device:MediaRenderer:1',
		location: 'http://10.10.11.32:51156/717def93.xml',
		name: 'Speaker AlexOneS #2',
	},
	{
		udn: 'uuid:9bc6df03',
		type: 'urn:schemas-raumfeld-com:device:RaumfeldDevice:1',
		location: 'http://10.10.11.32:53909/9bc6df03.xml',
		name: 'Teufel Raumfeld Device',
	},
	{
		udn: 'uuid:a37aa81b',
		type: 'urn:schemas-raumfeld-com:device:ConfigDevice:1',
		location: 'http://10.10.11.31:53996/a37aa81b.xml',
		name: 'Raumfeld ConfigDevice',
	},
	{
		udn: 'uuid:c7b0990e',
		type: 'urn:schemas-upnp-org:device:MediaServer:1',
		location: 'http://10.10.11.31:51099/c7b0990e.xml',
		name: 'Raumfeld MediaServer',
	},
	{
		udn: 'uuid:e9485fab',
		type: 'urn:schemas-raumfeld-com:device:RaumfeldDevice:1',
		location: 'http://10.10.11.31:55504/e9485fab.xml',
		name: 'Teufel Raumfeld Device',
	},
	{
		udn: 'uuid:edcad4d1',
		type: 'urn:schemas-upnp-org:device:MediaRenderer:1',
		location: 'http://10.10.11.31:60110/edcad4d1.xml',
		name: 'Speaker AngisOnes',
	},
];

const zones: ZoneConfiguration = {
	numRooms: 2,
	spotifyMode: 'singleRoom',
	zones: [],
	unassignedRooms: [],
	allRooms: [
		{ udn: 'uuid:4aaee87e', name: 'AlexOneS', renderers: [] },
		{ udn: 'uuid:6b816b4a', name: 'AngisOnes', renderers: [] },
	],
};

describe('describeSystem', () => {
	const report = describeSystem('10.10.11.31', { hostName: 'Teufel One S', roomName: 'AngisOnes' }, zones, devices);

	it('nennt Host, Raum und Zonen', () => {
		expect(report).to.contain('Host 10.10.11.31 antwortet.');
		expect(report).to.contain('Teufel One S, steht im Raum AngisOnes');
		expect(report).to.contain('2 Raeume (AlexOneS, AngisOnes), 0 Zonen.');
	});

	it('zaehlt Geraete nach Adresse, nicht nach UPnP-Eintrag', () => {
		// Sechs Eintraege, aber nur zwei Lautsprecher - genau diese
		// Unterscheidung hat der alte Text vermissen lassen.
		expect(report).to.contain('2 Geraete im Netz mit zusammen 6 UPnP-Diensten');
	});

	it('schluesselt die Rollen je Adresse auf', () => {
		expect(report).to.contain('10.10.11.31: ConfigDevice, MediaRenderer, MediaServer, RaumfeldDevice');
		expect(report).to.contain('10.10.11.32: MediaRenderer, RaumfeldDevice');
	});

	it('kommt mit einem System ohne Raeume zurecht', () => {
		const empty = describeSystem(
			'10.10.11.31',
			{},
			{ numRooms: 0, zones: [], unassignedRooms: [], allRooms: [] },
			[],
		);
		expect(empty).to.contain('0 Raeume (keine)');
		expect(empty).to.contain('0 Geraete im Netz');
	});
});
