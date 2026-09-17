# Objektmodell des Adapters

Dieser Entwurf legt fest, welche ioBroker-Objekte der Adapter anlegt und welche
Raumfeld-Schnittstelle hinter jedem Datenpunkt steckt. Grundlage ist keine Vermutung,
sondern die Erkundung der vorhandenen Geräte mit `tools/explore.mts`; das Ergebnis steht
in `tools/output/raumfeld.md`.

## Leitgedanken

**Räume sind dauerhaft, Zonen sind es nicht.** Das ist die wichtigste Eigenschaft des
Systems und bestimmt den gesamten Aufbau. Ein Raum hat eine UDN, die bleibt. Eine Zone
entsteht in dem Moment, in dem Musik läuft oder Räume gruppiert werden, und ihre UDN
wechselt bei jeder Änderung der Zusammensetzung. Ein Objektbaum, der Zonen als Geräte
abbildet, würde deshalb ständig Objekte anlegen und wieder verwaisen lassen.

Daraus folgt die zentrale Entscheidung: **Die Bedienoberfläche des Adapters sind die
Räume.** Jeder Raum bekommt einen vollständigen Satz Datenpunkte, einschließlich der
Wiedergabesteuerung. Wer `rooms.Wohnzimmer.play` schaltet, spricht in Wirklichkeit die
Zone an, in der das Wohnzimmer gerade steckt — der Adapter schlägt das nach. Das
entspricht auch der Denkweise der Raumfeld-App, in der man Räume auswählt und nicht
Zonen verwaltet.

Zonen tauchen trotzdem auf, aber nur als **lesende Beschreibung** der aktuellen
Gruppierung, plus zwei Befehlen zum Gruppieren und Trennen. So gibt es keine
verwaisenden Objekte.

**Was gelesen wird, wird gemeldet, nicht abgefragt.** Raumfeld schickt Änderungen von
sich aus: die UPnP-Dienste über GENA-Ereignisse, der Host-Webservice über Long-Polling.
Der Adapter pollt deshalb nicht, sondern abonniert. Das ist auch der Grund, warum er
einen Fuß im selben Netzsegment wie die Lautsprecher braucht — die Geräte bauen die
Rückverbindung selbst auf.

**Nur anlegen, was es wirklich gibt.** Datenpunkte entstehen aus dem, was die Geräte in
ihren SCPD-Beschreibungen anbieten, nicht aus einer festen Liste. Ein Gerät ohne
Klangregler bekommt keinen Klangregler-Zweig.

## Namensgebung

Objekt-IDs bilden den **Raumnamen** ab, nicht die UDN: `raumfeld.0.rooms.AngisOnes`
liest sich in Skripten und in vis deutlich besser als
`raumfeld.0.rooms.uuid_6b816b4a_7f81_407c_b299_d15a6fd85581`. Die UDN steht dafür im
`native`-Teil des Objekts, dort wird sie beim Ansprechen der Geräte auch gebraucht.

Der Preis: wird ein Raum in der Raumfeld-App umbenannt, entsteht ein neuer Objektbaum und
der alte bleibt stehen. Das ist selten genug, um vertretbar zu sein. Der Adapter erkennt
den Fall über die unveränderte UDN und schreibt eine Warnung ins Log, damit klar ist,
woher der verwaiste Zweig kommt.

Namen werden für die ID bereinigt: Leerzeichen und die in ioBroker unzulässigen Zeichen
`.` `*` `,` `;` `'` `"` `\` `[` `]` werden zu `_`.

## Der Objektbaum

```
raumfeld.0
├── info
│   ├── connection          boolean   indicator.connected
│   ├── hostAddress         string    IP des Host-Geräts
│   ├── hostName            string    aus getHostInfo
│   ├── hostRoom            string    Raum, in dem der Host steht
│   └── zones               string    JSON der aktuellen Zonenaufteilung
│
├── rooms
│   └── <Raumname>                    device, native.udn = Raum-UDN
│       ├── name            string    ro
│       ├── online          boolean   ro
│       ├── powerState      string    ro   ACTIVE | AUTOMATIC_STANDBY | MANUAL_STANDBY
│       ├── standby         boolean   rw   true = schlafen, false = wecken
│       ├── zone            string    ro   ID der Zone oder leer
│       ├── spotifyConnect  boolean   ro
│       │
│       ├── volume          number    rw   0…100
│       ├── volumeDb        number    rw
│       ├── mute            boolean   rw
│       ├── balance         number    rw
│       │
│       ├── transport
│       │   ├── state       string    ro   PLAYING | PAUSED_PLAYBACK | STOPPED | TRANSITIONING
│       │   ├── play        button    wo
│       │   ├── pause       button    wo
│       │   ├── stop        button    wo
│       │   ├── next        button    wo
│       │   ├── previous    button    wo
│       │   ├── playMode    string    rw   NORMAL | REPEAT_ALL | SHUFFLE | SHUFFLE_NOREPEAT
│       │   ├── position    string    ro   hh:mm:ss
│       │   ├── positionSec number    ro
│       │   ├── duration    string    ro
│       │   ├── seek        string    wo   hh:mm:ss
│       │   └── playUri     string    wo   direkte URI, SetAVTransportURI
│       │
│       ├── track
│       │   ├── title       string    ro
│       │   ├── artist      string    ro
│       │   ├── album       string    ro
│       │   ├── albumArt    string    ro   URL
│       │   └── uri         string    ro
│       │
│       ├── equalizer                 nur wenn das Gerät SetFilter anbietet
│       │   ├── low         number    rw   dB
│       │   ├── mid         number    rw   dB
│       │   └── high        number    rw   dB
│       │
│       ├── group
│       │   ├── joinRoom    string    wo   Name des Zielraums
│       │   └── leave       button    wo   aus der Zone lösen
│       │
│       └── device
│           ├── softwareVersion  string   ro
│           ├── deviceMode       string   ro   MASTER | CLIENT | SLAVE
│           ├── ipAddress        string   ro
│           ├── accessPoint      string   ro   WLAN-Name
│           ├── signalStrength   number   ro
│           ├── updateAvailable  boolean  ro
│           └── playSystemSound  string   wo
│
└── media
    ├── browse              string    wo   ObjectID, Vorgabe "0"
    ├── browseId            string    ro   zuletzt geöffnete Sammlung
    ├── browseParent        string    ro   übergeordnete Sammlung, zum Zurückgehen
    ├── browseResult        string    ro   JSON der Kindelemente
    ├── browseTotal         number    ro   Anzahl im Zweig
    ├── search              string    wo   Suchbegriff
    ├── searchIn            string    rw   Zweig, in dem gesucht wird
    ├── searchResult        string    ro   JSON
    ├── indexerStatus       string    ro
    └── sources             string    ro   JSON der obersten Ebene
```

Zum Abspielen eines Bibliothekseintrags gibt es an jedem Raum
`transport.playObject`: dort wird eine Kennung wie
`0/DemoTracks/GettingStarted/rock` hineingeschrieben, der Adapter holt die
Abspieladresse und die Titelangaben und startet die Wiedergabe.

## Woher jeder Wert kommt

### Aus dem Host-Webservice (Port 47365)

Der Webservice leitet jeden Aufruf per `307` auf eine Sitzungs-URL um. Genau diese
Sitzungs-URL ist der Long-Polling-Kanal: ein erneuter Aufruf mit dem Kopf
`updateId` blockiert, bis sich etwas ändert. Daraus speist sich die gesamte Struktur.

| Endpunkt | liefert | füllt |
|---|---|---|
| `getZones` | Zonen, Räume, Renderer, `powerState`, `spotifyConnect` | `info.zones`, `rooms.*.zone`, `rooms.*.powerState`, `rooms.*.spotifyConnect`, Anlage der Raumobjekte |
| `listDevices` | alle Geräte mit UDN, Typ und Beschreibungs-URL | Zuordnung Raum → Renderer, `rooms.*.online` |
| `getHostInfo` | `hostName`, `roomName` | `info.hostName`, `info.hostRoom` |
| `connectRoomToZone` | Gruppierung | `rooms.*.group.joinRoom`, `rooms.*.group.leave` |

Andere naheliegende Endpunkte gibt es **nicht**. Geprüft und mit `404 PageMissing`
beantwortet wurden `getRooms`, `getRendererState`, `getMediaServerState`, `dropRoom`,
`createZone`, `renameRoom`, `renameZone`, `setPowerState`, `getPreferences`,
`listSystemDevices`. Die Raumliste steckt bereits in `getZones`.

### Aus AVTransport des Renderers

Der Dienst bietet 19 Aktionen. Transportbefehle gehen an den **Zonen-Renderer**,
Standby-Befehle an den **Raum-Renderer**.

| Datenpunkt | Aktion |
|---|---|
| `transport.play` / `pause` / `stop` / `next` / `previous` | `Play` (Speed 1) / `Pause` / `Stop` / `Next` / `Previous` |
| `transport.seek` | `Seek` mit `Unit=REL_TIME` |
| `transport.playMode` | `SetPlayMode` / `GetTransportSettings` |
| `transport.state` | `GetTransportInfo`, danach aus `LastChange` |
| `transport.position`, `duration` | `GetPositionInfo` |
| `transport.playUri` | `SetAVTransportURI` |
| `standby` | `LeaveStandby` beziehungsweise `EnterManualStandby` |
| `track.*` | DIDL-Lite aus `LastChange` beziehungsweise `GetPositionInfo` |

`EnterManualStandby`, `EnterAutomaticStandby` und `LeaveStandby` sind Raumfeld-eigene
Erweiterungen und der Grund, warum ein ausgeschalteter Host aus ioBroker heraus wieder
erreichbar wird — genau das Problem, das den Anlass für dieses Projekt gab.

### Aus RenderingControl des Renderers

17 Aktionen, immer am **Raum-Renderer**, denn Lautstärke ist raumweise.

| Datenpunkt | Aktion |
|---|---|
| `volume` | `GetVolume` / `SetVolume`, Kanal `Master` |
| `volumeDb` | `GetVolumeDB` / `SetVolumeDB` |
| `mute` | `GetMute` / `SetMute` |
| `balance` | `GetBalance` / `SetBalance` |
| `equalizer.low/mid/high` | `GetFilter` / `SetFilter` |
| `device.playSystemSound` | `PlaySystemSound` |

### Aus SetupService

| Datenpunkt | Aktion |
|---|---|
| `device.softwareVersion` | `GetInfo` |
| `device.deviceMode` | `GetDeviceMode` |
| `device.ipAddress`, `accessPoint`, `signalStrength` | `GetNetworkInfo` |
| `device.updateAvailable` | Ereignisvariable `UpdateAvailable` |

`DoUpdate` wird bewusst **nicht** angeboten. Eine Firmware-Aktualisierung, die ein
Skript versehentlich auslösen kann, ist ein zu großes Risiko für einen Datenpunkt.

### Aus ContentDirectory des MediaServers

21 Aktionen. Für die erste Fassung wird nur lesend zugegriffen. Die oberste Ebene der
Bibliothek liefert: My Music, Playlists, TuneIn, Spotify, Line-in, Teufel Favourites,
Zones, Renderers, Demo Tracks. Die Kennungen sind sprechende Pfade wie
`0/My Music/Albums`, was das Anspringen eines bestimmten Zweiges einfach macht.

**Der Server sucht nicht.** Seine `Search`-Aktion nimmt ein `SearchCriteria` entgegen und
`GetSearchCapabilities` meldet `dc:title`, aber ausgewertet wird die Bedingung nicht:
nachgemessen an den vier Demo-Titeln lieferten „Rock", „Electro" und ein frei erfundener
Begriff jeweils dieselbe vollständige Liste. Der Adapter filtert deshalb selbst, über
Titel und Interpret. Das hat eine Grenze, die man kennen muss: gesucht wird nur unter den
unmittelbaren Kindern des angegebenen Zweiges, nicht in der Tiefe.

**`0/RadioTime` — also TuneIn — antwortet mit HTTP 500.** Der Dienst dahinter existiert
offenbar nicht mehr. Das ist kein Fehler des Adapters.

## Wie die Werte aktuell bleiben

Drei Quellen laufen parallel:

1. **Long-Polling auf `getZones`.** Meldet jede Änderung der Zonenaufteilung, des
   Standby-Zustands und der Räume. Läuft dauerhaft und wird nach jedem Abbruch mit
   Abstand neu aufgebaut.
2. **GENA-Abonnements** auf `AVTransport`, `RenderingControl` und `SetupService` jedes
   Renderers. Der Adapter öffnet dafür einen eigenen HTTP-Zuhörer, dessen Adresse die
   Geräte erreichen müssen. Abonnements laufen ab und werden vor Ablauf erneuert.
3. **Einmaliges Abfragen beim Start** je Datenpunkt, damit nach einem Neustart sofort
   gültige Werte dastehen, statt auf die erste Änderung zu warten.

`RaumfeldGenerator` hat keine Aktionen, sondern nur die Ereignisvariable
`TransportControlButtons`. Sie sagt, welche Bedienknöpfe gerade sinnvoll sind. In der
ersten Fassung wird sie nicht abgebildet; sie wäre später nützlich, um in vis
Schaltflächen auszugrauen.

## Was die erste Fassung nicht enthält

Bewusst ausgelassen, damit der erste Wurf überschaubar bleibt:

- **Warteschlangen.** `CreateQueue`, `AddItemToQueue`, `MoveInQueue` und die übrigen
  Queue-Aktionen sind vorhanden, aber das ist ein eigenes Thema mit eigenem Objektbaum.
- **Stationstasten.** `AssignStationButton` und `GetStationButtonAssignment` sowie
  `GetSpotifyPreset` aus AVTransport.
- **Schreibender Zugriff auf die Bibliothek**, also `DestroyObject`, `ResetDatabase`,
  `RescanSource`.
- **`ConfigService`** mit `GetPreferences` und `SetPreferences`. Die Einstellungen kommen
  als undurchsichtiger Zeichenkettenblock, der erst untersucht werden muss.
- **Firmware-Aktualisierung**, siehe oben.

## Offene Punkte

**Wie entsteht eine neue Zone?** `connectRoomToZone?zoneUDN=…&roomUDN=…` ist der einzige
vorhandene Befehl und antwortet mit `200`. Naheliegend ist, dass ein leeres `zoneUDN` den
Raum in eine eigene neue Zone setzt und damit zugleich als „aus der Gruppe lösen" wirkt.
Das ist **noch nicht bestätigt** und gehört beim Umsetzen von `group.leave` als Erstes
ausprobiert.

**Kanäle bei RenderingControl.** Alle Lautstärkeaktionen nehmen ein `Channel`-Argument.
Ob das One S außer `Master` weitere Kanäle kennt, steht in der SCPD-Beschreibung als
erlaubte Werte und ist beim Umsetzen zu prüfen.

**Zonenlautstärke.** Eine Zone hat neben den Raumlautstärken eine eigene Gesamtlautstärke.
Ob sie über den Zonen-Renderer erreichbar ist, lässt sich erst prüfen, wenn tatsächlich
eine Zone mit mehreren Räumen besteht — dafür müssen beide Lautsprecher gruppiert sein.
